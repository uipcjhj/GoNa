// 수집 진단: 소스별 검색 요청 수·성공률·429·타임아웃·검색 결과 수와, 그 결과가 실제로 쓸 수 있는 기사(기간 내·발행일 검증·중복 아님·분석 대상)가 됐는지.
// 작업 로그(검색 완료/실패/건너뜀)와 저장된 기사에서 계산하므로 별도 호출이 없다.
import type { Article, Job } from "@/lib/types";

export type FailClass = "rate_limit" | "timeout" | "network" | "bad_query" | "http" | "skipped" | "other";
export interface SourceStat {
  source: string; // provider + group (e.g. "googlenews", "gdelt", "rss:물류신문")
  requests: number; ok: number; empty: number; failed: number; skipped: number;
  fail: Partial<Record<FailClass, number>>;
  results: number; // raw items returned by the provider
  stored: number; inPeriod: number; dateVerified: number; duplicates: number; filtered: number; analyzed: number; directUrl: number;
}
export interface Diagnostics {
  jobs: number; sources: SourceStat[];
  totals: { requests: number; ok: number; failed: number; results: number; stored: number; valid: number };
  breakdown: { db: number; inPeriod: number; duplicate: number; filtered: number; queuedOrError: number; listed: number };
}

export function classifyFailure(msg: string): FailClass {
  if (/429|호출 제한|rate/i.test(msg)) return "rate_limit";
  if (/abort|timeout|시간 초과|ETIMEDOUT/i.test(msg)) return "timeout";
  if (/too short|invalid|phrase|query|너무 짧|illegal/i.test(msg)) return "bad_query";
  if (/HTTP \d+|서버 오류/.test(msg)) return "http";
  if (/fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|네트워크|DNS/i.test(msg)) return "network";
  return "other";
}

export function providerOf(job: Job, label: string): string {
  const q = job.queries.find((x) => x.label === label);
  if (q) return q.provider === "rss" ? `rss:${label.replace(/^RSS · /, "")}` : q.provider;
  if (/^Google News/.test(label)) return "googlenews";
  if (/^RSS · /.test(label)) return `rss:${label.replace(/^RSS · /, "")}`;
  if (/^GNews/.test(label)) return "gnews";
  return "gdelt";
}

const verifiedDate = (a: Article) => Boolean(a.publishedAt) && /^(원문 메타데이터|발행 매체 RSS|RSS pubDate)/.test(a.publishedAtBasis ?? "");
const providerKey = (a: Article) => (a.provider === "rss" ? `rss:${a.sourceName}` : a.provider);

export function buildDiagnostics(jobs: Job[], articles: Article[], period?: { start: string; end: string }): Diagnostics {
  const map = new Map<string, SourceStat>();
  const stat = (k: string): SourceStat => {
    if (!map.has(k)) map.set(k, { source: k, requests: 0, ok: 0, empty: 0, failed: 0, skipped: 0, fail: {}, results: 0, stored: 0, inPeriod: 0, dateVerified: 0, duplicates: 0, filtered: 0, analyzed: 0, directUrl: 0 });
    return map.get(k)!;
  };
  for (const job of jobs) {
    for (const l of job.log) {
      let m = l.msg.match(/^검색 완료: (.+?) → (\d+)건/);
      if (m) { const s = stat(providerOf(job, m[1]!)); s.requests++; s.ok++; s.results += Number(m[2]); if (!Number(m[2])) s.empty++; continue; }
      m = l.msg.match(/^검색 실패: (.+?) — (.*)$/);
      if (m) { const s = stat(providerOf(job, m[1]!)); s.requests++; s.failed++; const c = classifyFailure(m[2]!); s.fail[c] = (s.fail[c] ?? 0) + 1; continue; }
      m = l.msg.match(/^건너뜀: (.+?) — /);
      if (m) { const s = stat(providerOf(job, m[1]!)); s.skipped++; s.fail.skipped = (s.fail.skipped ?? 0) + 1; }
    }
  }
  const inP = (a: Article) => !period || Boolean((a.publishedAt ?? a.discoveredAt) >= period.start && (a.publishedAt ?? a.discoveredAt) < period.end);
  const real = articles.filter((a) => !a.isDemo);
  for (const a of real) {
    const s = stat(providerKey(a));
    s.stored++;
    if (a.status === "duplicate") { s.duplicates++; continue; }
    if (!inP(a)) continue;
    s.inPeriod++;
    if (a.status === "filtered") { s.filtered++; continue; }
    if (a.status === "analyzed") s.analyzed++;
    if (verifiedDate(a)) s.dateVerified++;
    if (!a.viaGoogleNews) s.directUrl++;
  }
  const sources = [...map.values()].sort((a, b) => b.requests - a.requests || b.stored - a.stored);
  const periodArts = real.filter((a) => inP(a));
  const valid = periodArts.filter((a) => a.status === "analyzed").length;
  return {
    jobs: jobs.length,
    sources,
    totals: { requests: sources.reduce((n, s) => n + s.requests, 0), ok: sources.reduce((n, s) => n + s.ok, 0), failed: sources.reduce((n, s) => n + s.failed + s.skipped, 0), results: sources.reduce((n, s) => n + s.results, 0), stored: real.length, valid },
    breakdown: {
      db: real.length, inPeriod: periodArts.length,
      duplicate: periodArts.filter((a) => a.status === "duplicate").length,
      filtered: periodArts.filter((a) => a.status === "filtered").length,
      queuedOrError: periodArts.filter((a) => a.status === "queued" || a.status === "error").length,
      listed: valid,
    },
  };
}

/** Weekly quality metrics for before/after comparison (valid articles, body & date rates, duplicates, opportunities, countries). */
export function qualityMetrics(articles: Article[], period: { start: string; end: string }) {
  const inP = (a: Article) => (a.publishedAt ?? a.discoveredAt) >= period.start && (a.publishedAt ?? a.discoveredAt) < period.end;
  const arts = articles.filter((a) => !a.isDemo && inP(a));
  const unique = arts.filter((a) => a.status !== "duplicate");
  const valid = unique.filter((a) => a.status === "analyzed");
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
  const countries: Record<string, number> = {};
  for (const a of valid) { const c = a.weekly?.country ?? a.analysis?.country ?? "Unknown"; countries[c] = (countries[c] ?? 0) + 1; }
  return {
    collected: arts.length, unique: unique.length, valid: valid.length,
    duplicateRate: pct(arts.length - unique.length, arts.length),
    filteredOut: unique.filter((a) => a.status === "filtered").length,
    dateVerifiedRate: pct(valid.filter(verifiedDate).length, valid.length),
    directUrlRate: pct(valid.filter((a) => !a.viaGoogleNews).length, valid.length),
    bodyRate: pct(valid.filter((a) => (a.excerpt?.length ?? 0) >= 120).length, valid.length),
    geminiDone: valid.filter((a) => a.report?.status === "done").length,
    geminiAttempted: valid.filter((a) => a.report).length,
    opportunityCandidates: valid.filter((a) => a.opportunityId || a.analysis?.category === "opportunity").length,
    countries: Object.entries(countries).sort((a, b) => b[1] - a[1]),
  };
}
