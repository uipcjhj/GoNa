// Gemini Developer API client (free tier compatible).
// - The configured model (GEMINI_MODEL) is checked against ListModels; if it does not exist or cannot generate
//   content, the best available stable "flash" model is used instead (and reported).
// - Errors are classified (401 auth / 403 permission / 404 model / 429 quota / 5xx / timeout / parse) and never
//   silently replaced by rule-based text.
// - The API key is sent only in the x-goog-api-key header; it is never logged, returned or put in a URL.
import "server-only";

const BASE = () => (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/+$/, "");
const key = () => (process.env.GEMINI_API_KEY ?? "").trim();
export const geminiConfigured = () => Boolean(key());
export const configuredModel = () => (process.env.GEMINI_MODEL ?? "").trim() || null;

export type GeminiErrorKind = "not_configured" | "auth" | "permission" | "model_not_found" | "rate_limit" | "quota_daily" | "bad_request" | "server" | "timeout" | "network" | "empty" | "parse";
export const GEMINI_ERROR_LABEL: Record<GeminiErrorKind, string> = {
  not_configured: "GEMINI_API_KEY 미설정",
  auth: "401 인증 실패 — API 키가 올바르지 않음",
  permission: "403 권한 없음 — API 키 권한·프로젝트·지역 제한 확인",
  model_not_found: "404 모델 없음 — 모델명 확인 필요",
  rate_limit: "429 호출 속도 제한 (분당 한도)",
  quota_daily: "429 무료 사용량 한도 초과 (일일 한도)",
  bad_request: "400 요청 형식 오류",
  server: "5xx Gemini 서버 오류",
  timeout: "응답 시간 초과",
  network: "네트워크 연결 실패",
  empty: "빈 응답",
  parse: "응답 JSON 해석 실패",
};

export class GeminiError extends Error {
  constructor(public kind: GeminiErrorKind, public status: number | null, detail: string, public retryAfterMs: number | null = null) {
    super(`${GEMINI_ERROR_LABEL[kind]}${detail ? ` (${detail})` : ""}`);
  }
}

/** Remove anything that looks like a Google API key from text that may be logged or shown. */
export const redact = (s: string) => s.replace(/AIza[0-9A-Za-z_\-]{20,}/g, "[redacted]").replace(/key=[^&\s"]+/gi, "key=[redacted]");

// ---------------------------------------------------------------- call statistics (in-memory, per server process)
interface Stats { ok: number; failed: Partial<Record<GeminiErrorKind, number>>; lastOk: { model: string; at: string; ms: number } | null; lastError: { kind: GeminiErrorKind; status: number | null; message: string; at: string } | null }
const g = globalThis as unknown as { __gemini?: { stats: Stats; models?: { at: number; list: ModelInfo[]; resolved: string | null; note: string } } };
const state = () => (g.__gemini ??= { stats: { ok: 0, failed: {}, lastOk: null, lastError: null } });
export const geminiStats = () => { const st = state().stats; return { ...st, failed: { ...st.failed } }; };

function recordError(e: GeminiError) {
  const stats = state().stats;
  stats.failed[e.kind] = (stats.failed[e.kind] ?? 0) + 1;
  stats.lastError = { kind: e.kind, status: e.status, message: redact(e.message), at: new Date().toISOString() };
  console.warn(`[gemini] ${e.kind} http=${e.status ?? "-"} ${redact(e.message)}`);
}

async function classify(res: Response): Promise<GeminiError> {
  const body = await res.text().catch(() => "");
  let msg = "", st = "", retry: number | null = null, daily = false;
  try {
    const j = JSON.parse(body) as { error?: { message?: string; status?: string; details?: { "@type"?: string; retryDelay?: string; violations?: { quotaId?: string }[] }[] } };
    msg = j.error?.message ?? "";
    st = j.error?.status ?? "";
    for (const d of j.error?.details ?? []) {
      if (d.retryDelay) retry = Math.round(parseFloat(d.retryDelay) * 1000);
      if (d.violations?.some((v) => /PerDay/i.test(v.quotaId ?? ""))) daily = true;
    }
  } catch { msg = body.slice(0, 200); }
  msg = redact(msg).slice(0, 220);
  const s = res.status;
  if (s === 401 || (s === 400 && /API key not valid|API_KEY_INVALID/i.test(`${msg} ${body}`))) return new GeminiError("auth", s, msg);
  if (s === 403) return new GeminiError("permission", s, msg || st);
  if (s === 404) return new GeminiError("model_not_found", s, msg);
  if (s === 429) return new GeminiError(daily || /per ?day|daily/i.test(msg) ? "quota_daily" : "rate_limit", s, msg, retry);
  if (s >= 500) return new GeminiError("server", s, msg);
  return new GeminiError("bad_request", s, msg || st);
}

async function call(path: string, init: RequestInit & { timeoutMs?: number }): Promise<Response> {
  if (!geminiConfigured()) throw new GeminiError("not_configured", null, "");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 60_000);
  try {
    const res = await fetch(`${BASE()}${path}`, { ...init, signal: ctrl.signal, headers: { "Content-Type": "application/json", "x-goog-api-key": key(), ...(init.headers ?? {}) } });
    if (!res.ok) throw await classify(res);
    return res;
  } catch (e) {
    if (e instanceof GeminiError) throw e;
    if ((e as Error)?.name === "AbortError") throw new GeminiError("timeout", null, "");
    throw new GeminiError("network", null, redact((e as Error)?.message ?? String(e)).slice(0, 120));
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------- model discovery
export interface ModelInfo { name: string; displayName: string; methods: string[]; inputTokenLimit: number | null }

const STABLE_FLASH = /^gemini-(\d+(?:\.\d+)?)-flash(-lite)?(-\d{3})?$/;
const FALLBACK_ORDER = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.0-flash-lite"];

/** Pick the model to use from the list: configured (if usable) → newest stable flash → known aliases → any flash. */
export function chooseModel(list: ModelInfo[], wanted: string | null): { model: string | null; note: string } {
  const usable = list.filter((m) => m.methods.includes("generateContent"));
  const names = new Set(usable.map((m) => m.name));
  if (wanted && names.has(wanted)) return { model: wanted, note: `설정된 모델 ${wanted} 사용` };
  const stable = usable
    .map((m) => ({ m, v: m.name.match(STABLE_FLASH) }))
    .filter((x): x is { m: ModelInfo; v: RegExpMatchArray } => Boolean(x.v))
    .sort((a, b) => Number(b.v[1]) - Number(a.v[1]) || Number(Boolean(a.v[2])) - Number(Boolean(b.v[2])) || (a.v[3] ? 1 : 0) - (b.v[3] ? 1 : 0));
  const pick = stable[0]?.m.name ?? FALLBACK_ORDER.find((n) => names.has(n)) ?? usable.find((m) => /flash/.test(m.name) && !/(image|tts|audio|live|embedding|preview|exp)/.test(m.name))?.name ?? null;
  const why = wanted ? `설정된 모델 '${wanted}'은(는) 이 API 키로 사용할 수 없어 ${pick ?? "대체 모델 없음"}으로 변경` : `GEMINI_MODEL 미설정 — ${pick ?? "사용 가능한 모델 없음"} 자동 선택`;
  return { model: pick, note: why };
}

export async function listModels(force = false): Promise<{ list: ModelInfo[]; resolved: string | null; note: string }> {
  const cache = state().models;
  if (!force && cache && Date.now() - cache.at < 60 * 60_000) return cache;
  const list: ModelInfo[] = [];
  let token = "";
  for (let page = 0; page < 5; page++) {
    const res = await call(`/v1beta/models?pageSize=1000${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`, { method: "GET", timeoutMs: 20_000 });
    const j = (await res.json()) as { models?: { name: string; displayName?: string; supportedGenerationMethods?: string[]; inputTokenLimit?: number }[]; nextPageToken?: string };
    for (const m of j.models ?? []) list.push({ name: m.name.replace(/^models\//, ""), displayName: m.displayName ?? m.name, methods: m.supportedGenerationMethods ?? [], inputTokenLimit: m.inputTokenLimit ?? null });
    if (!j.nextPageToken) break;
    token = j.nextPageToken;
  }
  const { model, note } = chooseModel(list, configuredModel());
  const out = { at: Date.now(), list, resolved: model, note };
  state().models = out;
  console.info(`[gemini] models=${list.length} use=${model ?? "none"} (${note})`);
  return out;
}

/** Model name for display (resolved model if already discovered). */
export const currentModelName = () => g.__gemini?.models?.resolved ?? configuredModel() ?? "자동 선택 (Gemini flash)";

export async function resolveModel(): Promise<string> {
  const { resolved } = await listModels();
  if (!resolved) throw new GeminiError("model_not_found", 404, "사용 가능한 generateContent 모델이 없습니다");
  return resolved;
}

// ---------------------------------------------------------------- generation
// Free tier allows only a few requests per minute: space generateContent calls (GEMINI_MIN_INTERVAL_MS, default 6.5 s).
let nextSlot = 0;
async function pace() {
  const gap = Math.max(0, Number(process.env.GEMINI_MIN_INTERVAL_MS ?? 6500) || 0);
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + gap;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}
export interface GenerateOptions { system: string; user: string; schema?: object; maxOutputTokens?: number; temperature?: number; timeoutMs?: number }

/** One JSON-mode generateContent call with a single retry for short rate limits / transient server errors. */
export async function generateJSON<T = unknown>(o: GenerateOptions): Promise<{ data: T; model: string; ms: number }> {
  try {
    const model = await resolveModel();
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: o.system }] },
      contents: [{ role: "user", parts: [{ text: o.user }] }],
      generationConfig: { responseMimeType: "application/json", ...(o.schema ? { responseSchema: o.schema } : {}), maxOutputTokens: o.maxOutputTokens ?? 8192, temperature: o.temperature ?? 0.1 },
    });
    for (let attempt = 0; ; attempt++) {
      await pace();
      const t0 = Date.now();
      try {
        const res = await call(`/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: "POST", body, timeoutMs: o.timeoutMs ?? 90_000 });
        const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
        const cand = j.candidates?.[0];
        const raw = cand?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
        if (!raw) throw new GeminiError("empty", 200, j.promptFeedback?.blockReason ?? cand?.finishReason ?? "");
        let data: T;
        try {
          data = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")) as T;
        } catch {
          throw new GeminiError("parse", 200, cand?.finishReason === "MAX_TOKENS" ? "응답이 길이 제한에서 잘림" : "JSON 아님");
        }
        const ms = Date.now() - t0;
        const stats = state().stats;
        stats.ok++;
        stats.lastOk = { model, at: new Date().toISOString(), ms };
        console.info(`[gemini] ok model=${model} ${ms}ms`);
        return { data, model, ms };
      } catch (e) {
        const ge = e as GeminiError;
        const retryable = attempt === 0 && ((ge.kind === "rate_limit" && (ge.retryAfterMs ?? 0) <= 30_000) || ge.kind === "server" || ge.kind === "timeout");
        if (!retryable) throw e;
        await new Promise((r) => setTimeout(r, ge.kind === "rate_limit" ? Math.max(2000, ge.retryAfterMs ?? 15_000) : 3000));
      }
    }
  } catch (e) {
    const ge = e instanceof GeminiError ? e : new GeminiError("network", null, redact(String(e)).slice(0, 120));
    recordError(ge);
    throw ge;
  }
}

/** Connection check for the settings screen: list models, then a tiny generation call. */
export async function geminiHealth(): Promise<{ configured: boolean; configuredModel: string | null; resolvedModel: string | null; note: string; flashModels: string[]; test: { ok: boolean; ms?: number; error?: string; kind?: GeminiErrorKind; status?: number | null } }> {
  if (!geminiConfigured()) return { configured: false, configuredModel: configuredModel(), resolvedModel: null, note: "GEMINI_API_KEY가 설정되지 않았습니다 (.env.local)", flashModels: [], test: { ok: false, error: GEMINI_ERROR_LABEL.not_configured, kind: "not_configured" } };
  let models: Awaited<ReturnType<typeof listModels>>;
  try {
    models = await listModels(true);
  } catch (e) {
    const ge = e as GeminiError;
    recordError(ge);
    return { configured: true, configuredModel: configuredModel(), resolvedModel: null, note: "모델 목록 조회 실패", flashModels: [], test: { ok: false, error: ge.message, kind: ge.kind, status: ge.status } };
  }
  const flashModels = models.list.filter((m) => m.methods.includes("generateContent") && /flash/.test(m.name)).map((m) => m.name);
  try {
    const r = await generateJSON<{ ok?: boolean }>({ system: "Reply with JSON only.", user: 'Return {"ok": true}', maxOutputTokens: 1024, timeoutMs: 30_000 });
    return { configured: true, configuredModel: configuredModel(), resolvedModel: models.resolved, note: models.note, flashModels, test: { ok: r.data?.ok === true, ms: r.ms } };
  } catch (e) {
    const ge = e as GeminiError;
    return { configured: true, configuredModel: configuredModel(), resolvedModel: models.resolved, note: models.note, flashModels, test: { ok: false, error: ge.message, kind: ge.kind, status: ge.status } };
  }
}
