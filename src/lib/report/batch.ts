// 전체 기사 일괄 요약의 속도 개선:
//  1) 원문 읽기는 제한된 동시성으로 병렬 (같은 사이트는 source.ts 에서 순차·간격 유지, 결과 캐시)
//  2) 원문이 확보된 기사 N건을 Gemini 요청 1회로 요약 (기사 ID 포함 구조화 JSON). 호출 수 = 기사 수 / N
//  3) 응답은 기사별로 검증(원문 근거 인용·숫자·상투 문장 규칙)하고 개별 저장. 누락·파싱 실패·검증 실패 기사만 1건씩 다시 요청
//  4) 배치 크기는 응답 실패 시 줄이고 성공이 이어지면 늘린다 (컨텍스트·분당 토큰 한도 고려)
import "server-only";
import type { Article, ReportAnalysis, Settings } from "@/lib/types";
import { GeminiError, generateJSON, geminiConfigured } from "@/lib/ai/gemini";
import { isHaltingError } from "./bulk";
import { RESPONSE_SCHEMA, SYSTEM, analyzeSource, buildReportAnalysis, buildUser, failedAnalysis, insufficientAnalysis, readSource, rewriteIfNeeded, type Raw, type SourceText } from "./factcheck";

const MIN = 1;
const maxBatch = () => Math.max(MIN, Math.min(8, Number(process.env.GEMINI_BATCH) || 5));
const charBudget = () => Math.max(20_000, Number(process.env.GEMINI_BATCH_CHARS) || 45_000); // 입력 글자 수 상한 (컨텍스트·TPM 보호)
let size = 0; // 현재 배치 크기 (0 = 초기화 전)
let okStreak = 0;
export const batchSize = () => (size ||= maxBatch());
export function resetBatchSize() { size = 0; okStreak = 0; }
function grow() { okStreak++; if (okStreak >= 2) { size = Math.min(maxBatch(), batchSize() + 1); okStreak = 0; } }
function shrink() { size = Math.max(MIN, Math.floor(batchSize() / 2)); okStreak = 0; }

const BATCH_SYSTEM = `${SYSTEM}

[여러 기사 동시 처리]
- 사용자 메시지에는 [ARTICLE id=...] 블록이 여러 개 있다. 각 블록은 서로 무관한 별개의 기사다.
- 각 기사는 자기 블록의 [SOURCE]만 근거로 분석한다. 다른 블록의 기업·금액·장소·설비를 절대 섞거나 인용하지 않는다.
- results 배열에 블록마다 정확히 1개의 객체를 쓰고, 각 객체의 id는 블록의 id를 그대로 복사한다. 순서·개수를 바꾸지 않는다.
- 위의 모든 규칙(근거 인용, 4줄 요약, 금지 문장)은 기사마다 동일하게 적용한다.`;

const BATCH_SCHEMA = {
  type: "OBJECT",
  properties: { results: { type: "ARRAY", items: { type: "OBJECT", properties: { id: { type: "STRING" }, ...RESPONSE_SCHEMA.properties }, required: ["id", ...RESPONSE_SCHEMA.required] } } },
  required: ["results"],
};

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

export interface BatchOutcome {
  results: Map<string, ReportAnalysis>; // 저장해도 되는 결과 (성공·검토 필요·원문 부족·원문 읽기 실패)
  halt: GeminiError | null; // 한도·인증 오류: 이후 기사는 저장하지 않고 중단
  stats: { calls: number; batchCalls: number; singles: number; sourceMs: number; geminiMs: number };
}

export async function analyzeBatch(arts: Article[], settings: Settings, o: { readConcurrency?: number; onStage?: (s: string) => void } = {}): Promise<BatchOutcome> {
  const results = new Map<string, ReportAnalysis>();
  const stats = { calls: 0, batchCalls: 0, singles: 0, sourceMs: 0, geminiMs: 0 };
  let halt: GeminiError | null = null;
  if (!geminiConfigured()) return { results, halt: new GeminiError("not_configured", null, "GEMINI_API_KEY 없음"), stats };

  // 1) 원문 읽기 (병렬, 제한 동시성). 실패해도 해당 기사만 '원문 부족/실패'로 기록하고 계속한다.
  o.onStage?.(`원문 확인 중 (${arts.length}건)`);
  let t0 = Date.now();
  const read = await pool(arts, o.readConcurrency ?? (Number(process.env.SOURCE_CONCURRENCY) || 4), async (a) => {
    try { return { a, src: await readSource(a) }; } catch (e) { return { a, src: null as SourceText | null, err: e }; }
  });
  stats.sourceMs = Date.now() - t0;
  const ready: { a: Article; src: SourceText; user: string }[] = [];
  for (const r of read) {
    if (!r.src) results.set(r.a.id, failedAnalysis((r as { err?: unknown }).err ?? new Error("원문 읽기 실패"), null, null));
    else if (r.src.level === "title") results.set(r.a.id, insufficientAnalysis(r.src));
    else ready.push({ a: r.a, src: r.src, user: buildUser(r.a, r.src, settings) });
  }

  // 2) 글자 수·배치 크기 한도 안에서 묶어 Gemini 호출
  t0 = Date.now();
  const single = async (x: (typeof ready)[number]) => {
    stats.calls++; stats.singles++;
    const r = await analyzeSource(x.a, x.src, settings);
    if (r.status === "failed" && isHaltingError(r.error?.kind)) halt = new GeminiError(r.error!.kind as GeminiError["kind"], null, r.error!.message);
    else results.set(x.a.id, r);
  };
  let idx = 0;
  while (idx < ready.length && !halt) {
    const group: typeof ready = [];
    let chars = 0;
    while (idx < ready.length && group.length < batchSize() && (group.length === 0 || chars + ready[idx].user.length <= charBudget())) { chars += ready[idx].user.length; group.push(ready[idx++]); }
    o.onStage?.(`Gemini 요약 중 (${Math.min(idx, ready.length)}/${ready.length}건, 배치 ${group.length}건)`);
    if (group.length === 1) { await single(group[0]); continue; }
    const user = `다음 ${group.length}개 기사를 각각 독립적으로 분석하세요.\n\n` + group.map((x) => `[ARTICLE id=${x.a.id}]\n${x.user}\n[/ARTICLE]`).join("\n\n");
    let data: { results?: (Raw & { id?: string })[] } | null = null;
    let model = "";
    try {
      stats.calls++; stats.batchCalls++;
      const r = await generateJSON<{ results?: (Raw & { id?: string })[] }>({ system: BATCH_SYSTEM, user, schema: BATCH_SCHEMA, maxOutputTokens: Math.min(30_000, 3500 * group.length + 1000), temperature: 0.1, timeoutMs: 150_000 });
      data = r.data; model = r.model;
    } catch (e) {
      const ge = e as GeminiError;
      if (isHaltingError(ge.kind)) { halt = ge; break; }
      shrink(); // 응답 실패·잘림·시간 초과 → 배치를 줄이고 이 묶음은 1건씩 처리
    }
    const byId = new Map<string, Raw & { id?: string }>();
    for (const item of data?.results ?? []) if (item && typeof item.id === "string" && group.some((x) => x.a.id === item.id) && !byId.has(item.id)) byId.set(item.id, item);
    let missing = 0;
    for (const x of group) {
      if (halt) break;
      const item = byId.get(x.a.id);
      if (!item) { missing++; await single(x); continue; }
      const r = buildReportAnalysis(item, x.src, model);
      // 다른 기사 내용이 섞였는지 확인: 기업명이 자기 원문에 없으면 이 응답은 버리고 이 기사만 1건으로 다시 요청
      const company = r.company.value.toLowerCase();
      if (company && !x.src.text.toLowerCase().includes(company.split(/\s+/)[0])) { missing++; await single(x); continue; }
      results.set(x.a.id, await rewriteIfNeeded(x.user, r, x.src));
    }
    if (data && !missing) grow(); else if (data) shrink();
  }
  stats.geminiMs = Date.now() - t0;
  return { results, halt, stats };
}
