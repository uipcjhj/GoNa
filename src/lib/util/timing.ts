// 단계별 소요시간 측정 (평균·최대). 작업(job)에 누적 저장되어 화면과 로그에서 병목을 확인한다.
export type Stage = "url_resolve" | "fetch" | "alt_search" | "gemini_wait" | "gemini_call" | "db_save";
export type Timings = Partial<Record<Stage, { n: number; ms: number; max: number }>>;

export const STAGE_LABEL: Record<Stage, string> = { url_resolve: "URL 복원", fetch: "원문 다운로드·파싱", alt_search: "보조 근거 검색", gemini_wait: "Gemini 호출 대기(한도 조절)", gemini_call: "Gemini 응답", db_save: "DB 저장" };

let acc: Timings = {};
export function addTiming(stage: Stage, ms: number) {
  const s = (acc[stage] ??= { n: 0, ms: 0, max: 0 });
  s.n++; s.ms += ms; s.max = Math.max(s.max, ms);
}
export async function timed<T>(stage: Stage, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try { return await fn(); } finally { addTiming(stage, Date.now() - t0); }
}
/** 지금까지 쌓인 측정값을 꺼내고 비운다 (작업에 합산하기 위해). */
export function takeTimings(): Timings { const t = acc; acc = {}; return t; }
export function mergeTimings(a: Timings | undefined, b: Timings): Timings {
  const out: Timings = { ...(a ?? {}) };
  for (const k of Object.keys(b) as Stage[]) {
    const x = out[k], y = b[k]!;
    out[k] = x ? { n: x.n + y.n, ms: x.ms + y.ms, max: Math.max(x.max, y.max) } : { ...y };
  }
  return out;
}
export const timingLine = (t: Timings | undefined) =>
  (Object.keys(STAGE_LABEL) as Stage[]).filter((k) => t?.[k]).map((k) => `${STAGE_LABEL[k]} 평균 ${(t![k]!.ms / t![k]!.n / 1000).toFixed(1)}초·최대 ${(t![k]!.max / 1000).toFixed(1)}초(${t![k]!.n}회)`).join(" / ");
