// Server-side collection job. State lives in the database, so progress survives browser refreshes,
// and work is processed in time-boxed "slices" that chain themselves (serverless-friendly).
//
// News Discovery → Article Validation → Deduplication → Information Extraction → Opportunity Scoring
// → Database Storage → Dashboard Update
import "server-only";
import { getStore } from "@/lib/db/store";
import { randomUUID } from "node:crypto";
import { getArticles, getJob, getSettings, listArticles, listJobs, listOpportunities, saveArticles, saveJob, saveOpportunities, saveSettings, getOpportunity } from "@/lib/db/repo";
import { searchGdelt, RateLimitError } from "@/lib/news/gdelt";
import { sleep } from "@/lib/util/http";
import { fetchRss } from "@/lib/news/rss";
import { searchGnews } from "@/lib/news/gnews";
import { searchGoogleNews } from "@/lib/news/googlenews";
import { QUICK, isDomestic, planQuickQueries, quickScore, selectQuick } from "./quick";
import { planWeeklyQueries, type WeeklyRange } from "@/lib/weekly/plan";
import { weeklyFromAI, weeklyRules, weeklyPreScore } from "@/lib/weekly/classify";
import { planQueries, preScore } from "@/lib/news/queries";
import type { RawArticle } from "@/lib/news/types";
import { classifySource, verifyAndFetch } from "./verify";
import { checkCompetitors, isMarketResearchPR } from "@/lib/weekly/classify";
import { analyzeArticle, aiConfigured } from "./analyze";
import { findMatch, mergeInto, newOpportunityFrom } from "./cluster";
import { hashId, isHttpUrl, normalizeUrl, domainOf } from "@/lib/util/url";
import { containsAny, jaccard, normalizeTitle } from "@/lib/util/text";
import type { Article, Job, JobStats, Opportunity, Settings } from "@/lib/types";

const STALE_MS = 10 * 60_000;
const emptyStats = (): JobStats => ({ queriesTotal: 0, queriesDone: 0, found: 0, newArticles: 0, duplicates: 0, filtered: 0, queued: 0, analyzed: 0, newOpportunities: 0, updatedOpportunities: 0, errors: 0 });

function log(job: Job, level: "info" | "warn" | "error", msg: string) {
  job.log.push({ t: new Date().toISOString(), level, msg });
  if (job.log.length > 300) job.log.splice(0, job.log.length - 300);
}

export function isActive(job: Job): boolean {
  if (job.status !== "running") return false;
  const since = Date.now() - new Date(job.heartbeatAt).getTime();
  // quick tests heartbeat every few seconds; a full run can spend longer on one slow source
  return since < (job.mode === "quick" ? 90_000 : STALE_MS);
}

export async function latestJob(): Promise<Job | null> {
  return (await listJobs(1))[0] ?? null;
}

/** Start a new job, or return the running one (prevents duplicate concurrent runs). */
export async function startJob(trigger: Job["trigger"], mode: Job["mode"] = "collect", range: WeeklyRange | null = null): Promise<{ job: Job; created: boolean; resumed: boolean }> {
  const recent = await listJobs(5);
  const running = recent.find((j) => j.status === "running");
  if (running) {
    if (isActive(running)) return { job: running, created: false, resumed: false };
    log(running, "warn", "이전 실행이 응답 없이 중단되어 자동으로 재개합니다.");
    running.heartbeatAt = new Date().toISOString();
    running.lease = null;
    await saveJob(running);
    return { job: running, created: false, resumed: true };
  }
  const settings = await getSettings();
  const queries = mode === "collect" ? planQueries(settings) : mode === "quick" ? planQuickQueries(settings) : mode === "weekly" && range ? planWeeklyQueries(settings, range) : [];
  const now = new Date().toISOString();
  const job: Job = {
    id: `job_${now.replace(/[-:.TZ]/g, "").slice(0, 14)}_${randomUUID().slice(0, 6)}`,
    trigger,
    mode,
    range,
    status: "running",
    phase: mode === "collect" || mode === "quick" || mode === "weekly" ? "discover" : "analyze",
    deadlineAt: new Date(Date.now() + (mode === "quick" ? QUICK.totalSeconds * 1000 : Math.max(5, settings.maxJobMinutes || 20) * 60_000)).toISOString(),
    timeLimited: false,
    step: "작업 준비 중",
    failedSources: [],
    quickPool: mode === "quick" ? [] : undefined,
    startedAt: now,
    finishedAt: null,
    heartbeatAt: now,
    stats: { ...emptyStats(), queriesTotal: queries.length },
    queries,
    cursor: 0,
    analyzeQueue: [],
    analyzeIndex: 0,
    newOpportunityIds: [],
    supplementDone: [],
    lease: null,
    log: [],
    error: null,
    slices: 0,
  };
  const label = mode === "quick" ? `빠른 테스트 시작 — 국내 ${QUICK.perSide}건 + 글로벌 ${QUICK.perSide}건 목표, 검색 ${queries.length}건, 제한시간 ${QUICK.totalSeconds}초 (GDELT는 8초 1회만 시도)`
    : mode === "collect" ? `전체 탐색 시작 — 제한시간 ${Math.max(5, settings.maxJobMinutes || 20)}분, `+`수집 시작 (${trigger === "scheduled" ? "예약 실행" : "수동 실행"}) — 검색 ${queries.length}건 예정`
    : mode === "weekly" ? `주간 업계동향 수집 시작 — ${range?.startDate} ~ ${range?.endDate}${range?.days?.length ? ` (누락 날짜 ${range.days.join(", ")})` : ""}, 검색 ${queries.length}건 예정`
    : mode === "weekly-analyze" ? `주간 업계동향 관련도 분석 — ${range?.startDate} ~ ${range?.endDate}` : "규칙 기반 분석 기사 AI 재분석 시작";
  log(job, "info", label);
  if (mode === "reanalyze") {
    const rules = (await listArticles({ sinceDays: 60 })).filter((a) => !a.isDemo && a.analysis?.mode === "rules" && a.status === "analyzed");
    job.analyzeQueue = rules.slice(0, settings.maxAnalyzePerRun).map((a) => a.id);
    job.stats.queued = job.analyzeQueue.length;
  }
  if (mode === "weekly-analyze" && range) {
    const inRange = (await listArticles({ sinceDays: Math.ceil((Date.now() - new Date(range.start).getTime()) / 86400_000) + 2 }))
      .filter((a) => !a.isDemo && (a.publishedAt ?? a.discoveredAt) >= range.start && (a.publishedAt ?? a.discoveredAt) < range.end);
    const need = inRange.filter((a) => a.status === "queued" || (a.status === "analyzed" && (!a.weekly || (aiConfigured() ? a.weekly.mode !== "ai" : true))));
    need.sort((a, b) => b.preScore - a.preScore);
    job.analyzeQueue = need.slice(0, settings.weekly.maxAnalyzePerRun).map((a) => a.id);
    job.stats.queued = job.analyzeQueue.length;
    log(job, "info", `분석 대상 ${job.analyzeQueue.length}건 (미분석 ${need.filter((a) => a.status === "queued").length}건 포함)${aiConfigured() ? "" : " — AI 미연결: 규칙 기반 분류"}`);
  }
  await saveJob(job);
  if (mode === "weekly" || mode === "weekly-analyze" || mode === "quick") return { job, created: true, resumed: false };
  await saveSettings({ ...settings, rotation: (settings.rotation ?? 0) + 1, ...(trigger === "scheduled" ? { lastScheduledRunAt: now } : {}) });
  return { job, created: true, resumed: false };
}

// Cancellation is a separate flag row that only cancelJob writes and the runner only reads, so a runner's
// heartbeat save can never overwrite a cancel request (local file store or Supabase alike).
const cancelFlagId = (jobId: string) => `cancel:${jobId}`;
const isCancelRequested = async (jobId: string) => Boolean(await getStore().get("settings", cancelFlagId(jobId)));

export async function cancelJob(id: string): Promise<Job | null> {
  const job = await getJob(id);
  if (!job || job.status !== "running") return job;
  await getStore().upsert("settings", [{ id: cancelFlagId(id), value: { requestedAt: new Date().toISOString() } } as never]);
  job.status = "cancelled";
  job.finishedAt = new Date().toISOString();
  log(job, "warn", "사용자가 작업을 취소했습니다.");
  await saveJob(job);
  return job;
}

// ------------------------------------------------------------------ discovery

async function runQuery(q: Job["queries"][number], settings: Settings, rangeStart?: string, fast = false): Promise<RawArticle[]> {
  const sinceIso = new Date(Date.now() - (fast ? QUICK.lookbackDays : settings.lookbackDays) * 86400_000).toISOString();
  if (q.provider === "gdelt" && q.query.startsWith("{")) {
    const p = JSON.parse(q.query) as { q: string; start?: string; end?: string; quick?: boolean };
    if (p.quick) return searchGdelt(p.q, { timespanDays: QUICK.lookbackDays, max: 50, englishOnly: true, fast: true });
    return searchGdelt(p.q, { timespanDays: 7, max: 75, englishOnly: true, start: p.start, end: p.end });
  }
  if (q.provider === "gdelt") return searchGdelt(q.query, { timespanDays: settings.lookbackDays, max: 75, englishOnly: settings.englishOnly });
  if (q.provider === "rss") {
    const feed = settings.rssFeeds.find((f) => f.url === q.query);
    return fetchRss(feed?.name ?? q.label, q.query, rangeStart ?? sinceIso, feed?.lang ?? "en", fast);
  }
  if (q.provider === "googlenews") {
    const p = JSON.parse(q.query) as { q: string; lang: "ko" | "en"; startDate?: string; endDate?: string; when?: string };
    return searchGoogleNews(p.q, { lang: p.lang, startDate: p.startDate, endDate: p.endDate, max: 30, fast, when: p.when });
  }
  if (q.provider === "gnews") return searchGnews(q.query, sinceIso);
  return [];
}

function toArticle(r: RawArticle, job: Job, settings: Settings): Article {
  const urlNormalized = normalizeUrl(r.url);
  const text = `${r.title} ${r.description ?? ""}`;
  const via = r.provider === "googlenews";
  return {
    id: hashId(urlNormalized),
    url: r.url,
    urlNormalized,
    title: r.title,
    sourceName: r.sourceName,
    sourceDomain: r.domain || domainOf(r.url),
    sourceType: via ? classifySource(`https://${r.domain}/`) : classifySource(r.url),
    viaGoogleNews: via,
    language: r.language,
    sourceCountry: r.sourceCountry,
    publishedAt: r.publishedAt,
    publishedAtBasis: r.publishedAtBasis,
    discoveredAt: new Date().toISOString(),
    provider: r.provider,
    query: r.query,
    jobId: job.id,
    isDemo: false,
    status: "queued",
    statusNote: null,
    preScore: Math.max(preScore(r.title, r.description, settings), job.mode === "weekly" ? weeklyPreScore(r.title, r.description) + 1 : -99),
    excerpt: r.description,
    verification: { status: "unchecked", httpStatus: null, finalUrl: null, redirects: 0, checkedAt: null, access: "unknown", note: null },
    analysis: null,
    opportunityId: null,
    duplicateOf: null,
    competitors: checkCompetitors(text, settings).filter((c) => c.confirmed).map((c) => c.name),
    feedback: null,
    feedbackAt: null,
  };
}

async function discoverStep(job: Job, settings: Settings, recentTitles: { id: string; t: string; via?: boolean }[]): Promise<void> {
  const q = job.queries[job.cursor];
  const quick = job.mode === "quick";
  job.step = `검색 중 (${job.cursor + 1}/${job.queries.length}): ${q.label}`;
  let raw: RawArticle[] = [];
  // circuit breaker: if a provider failed 3 times in a row, skip its remaining queries this run
  const fails = (job.providerFailures ??= {});
  if ((fails[q.provider] ?? 0) >= 3) {
    log(job, "warn", `건너뜀: ${q.label} — ${q.provider} 연속 3회 실패`);
  } else {
    try {
      raw = await runQuery(q, settings, job.range ? new Date(new Date(job.range.start).getTime() - 86400_000).toISOString() : undefined, quick);
      fails[q.provider] = 0;
      log(job, "info", `검색 완료: ${q.label} → ${raw.length}건`);
    } catch (e) {
      job.stats.errors++;
      if (e instanceof RateLimitError) { if (!quick) await sleep(20_000); } // back off; do not count toward the breaker
      else fails[q.provider] = (fails[q.provider] ?? 0) + 1;
      const c = (e as { cause?: { code?: string; message?: string } })?.cause;
      const cause = c ? c.code || c.message || String(c) : null;
      const raw0 = `${e instanceof Error ? e.message : e} ${cause ?? ""}`;
      const reason = e instanceof RateLimitError ? "호출 제한(429)"
        : /abort|timeout|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT/i.test(raw0) ? "응답 시간 초과"
        : /ENOTFOUND|EAI_AGAIN/i.test(raw0) ? "주소 확인 실패(DNS)"
        : /fetch failed|ECONNRESET|ECONNREFUSED|socket/i.test(raw0) ? `연결 실패(네트워크)${cause ? ` · ${cause}` : ""}`
        : /HTTP (\d+)/.test(raw0) ? `서버 오류 ${raw0.match(/HTTP (\d+)/)![0]}`
        : (e instanceof Error ? e.message : String(e)).slice(0, 60);
      (job.failedSources ??= []).push(`${q.label} — ${reason}`);
      log(job, "error", `검색 실패: ${q.label} — ${e instanceof Error ? e.message : String(e)}${cause ? ` (${cause})` : ""}`.slice(0, 400));
    }
  }
  job.cursor++;
  job.stats.queriesDone = job.cursor;
  job.stats.found += raw.length;
  const candidates = raw.filter((r) => isHttpUrl(r.url)).map((r) => toArticle(r, job, settings));
  // de-duplicate within the batch
  const uniq = new Map<string, Article>();
  for (const c of candidates) if (!uniq.has(c.id)) uniq.set(c.id, c);
  const existingRows = await getArticles([...uniq.keys()]);
  const existing = new Set(existingRows.map((a) => a.id));
  if (quick) {
    // quick test: hold candidates in the job; only the selected ≤20 are stored (no duplicates)
    const pool = (job.quickPool ??= []);
    const since = new Date(Date.now() - QUICK.lookbackDays * 86400_000).toISOString();
    for (const a of uniq.values()) {
      const nt = normalizeTitle(a.title);
      const dupTitle = recentTitles.some((x) => x.t === nt || (nt.length > 20 && jaccard(x.t, nt) >= 0.85));
      if (existing.has(a.id) || dupTitle || pool.some((p) => normalizeUrl(p.url) === a.urlNormalized)) { job.stats.duplicates++; continue; }
      if (a.publishedAt && a.publishedAt < since) continue;
      const r = raw.find((x) => normalizeUrl(x.url) === a.urlNormalized)!;
      pool.push({ url: r.url, title: r.title, sourceName: r.sourceName, domain: r.domain || a.sourceDomain, publishedAt: r.publishedAt, publishedAtBasis: r.publishedAtBasis, language: r.language, sourceCountry: r.sourceCountry, description: r.description, provider: r.provider, query: r.query, score: quickScore(r.title, r.description), domestic: isDomestic({ title: r.title, language: r.language, domain: r.domain || a.sourceDomain }) });
      recentTitles.push({ id: a.id, t: nt, via: Boolean(a.viaGoogleNews) });
    }
    if (pool.length > 400) pool.sort((x, y) => y.score - x.score).splice(400);
    return;
  }
  const toSave: Article[] = [];
  if (job.mode === "weekly") {
    // articles dropped earlier by the opportunity-only pre-filter may still matter for the weekly report
    for (const old of existingRows) {
      if (old.status === "filtered" && !old.isDemo && weeklyPreScore(old.title, old.excerpt) >= 2) {
        old.status = "queued";
        old.statusNote = "주간 업계동향 기준으로 재검토 대상";
        old.preScore = Math.max(old.preScore, weeklyPreScore(old.title, old.excerpt) + 1);
        toSave.push(old);
        job.stats.queued++;
      }
    }
  }
  for (const a of uniq.values()) {
    if (existing.has(a.id)) {
      job.stats.duplicates++;
      continue; // already stored & analysed — never re-call AI for it
    }
    if (job.range && a.publishedAt && a.publishedAt < new Date(new Date(job.range.start).getTime() - 86400_000).toISOString()) {
      continue; // older than the requested period (RSS feeds return their latest items regardless of date)
    }
    const nt = normalizeTitle(a.title);
    const dup = recentTitles.find((x) => x.t === nt || (nt.length > 20 && jaccard(x.t, nt) >= 0.85));
    if (dup && dup.via && !a.viaGoogleNews) {
      // prefer the direct publisher link over an earlier Google News redirect copy
      const [old] = await getArticles([dup.id]);
      if (old && (old.status === "queued" || old.status === "filtered")) {
        old.status = "duplicate";
        old.duplicateOf = a.id;
        old.statusNote = "동일 기사의 발행 매체 직접 링크로 대체됨";
        toSave.push(old);
        dup.id = a.id;
        dup.via = false;
      }
    }
    if (dup && dup.id !== a.id) {
      a.status = "duplicate";
      a.duplicateOf = dup.id;
      a.statusNote = "동일 제목 기사(재배포/신디케이션) — 분석 생략";
      job.stats.duplicates++;
    } else if (a.preScore < 3 && !a.competitors.length) {
      a.status = "filtered";
      a.statusNote = `사전 관련성 필터 미통과 (점수 ${a.preScore})`;
      job.stats.filtered++;
    } else {
      job.stats.queued++;
    }
    if (!dup) recentTitles.push({ id: a.id, t: nt, via: Boolean(a.viaGoogleNews) });
    job.stats.newArticles++;
    toSave.push(a);
  }
  await saveArticles(toSave);
}

/** Pick which queued articles get analysed this run: score-ranked, with per-country / per-domain caps for balance. */
async function buildWeeklyQueue(job: Job, settings: Settings) {
  const r = job.range!;
  const from = new Date(new Date(r.start).getTime() - 86400_000).toISOString();
  const queued = (await listArticles({ sinceDays: Math.ceil((Date.now() - new Date(from).getTime()) / 86400_000) + 2 }))
    .filter((a) => a.status === "queued" && !a.isDemo && (!a.publishedAt || a.publishedAt >= from));
  // in-period first, direct publisher links before Google News copies, then by pre-score
  const inPeriod = (a: Article) => (a.publishedAt ?? a.discoveredAt) >= r.start && (a.publishedAt ?? a.discoveredAt) < r.end;
  queued.sort((a, b) => Number(inPeriod(b)) - Number(inPeriod(a)) || Number(Boolean(a.viaGoogleNews)) - Number(Boolean(b.viaGoogleNews)) || b.preScore - a.preScore);
  const perDomain = new Map<string, number>();
  const picked: string[] = [];
  for (const a of queued) {
    if (picked.length >= settings.weekly.maxAnalyzePerRun) break;
    if ((perDomain.get(a.sourceDomain) ?? 0) >= 40) continue;
    perDomain.set(a.sourceDomain, (perDomain.get(a.sourceDomain) ?? 0) + 1);
    picked.push(a.id);
  }
  job.analyzeQueue = picked;
  job.analyzeIndex = 0;
  log(job, "info", `분석 대상 ${picked.length}건 선정 (대기 ${queued.length}건 중)${aiConfigured() ? " — AI 분석" : " — AI 미연결: 규칙 기반 분류"}`);
}

async function buildAnalyzeQueue(job: Job, settings: Settings) {
  if (job.mode === "weekly" && job.range) return buildWeeklyQueue(job, settings);
  const queued = (await listArticles({ sinceDays: Math.max(14, settings.lookbackDays + 7) })).filter((a) => a.status === "queued" && !a.isDemo);
  queued.sort((a, b) => b.preScore - a.preScore || (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  const perCountry = new Map<string, number>();
  const perDomain = new Map<string, number>();
  const picked: string[] = [];
  for (const a of queued) {
    if (picked.length >= settings.maxAnalyzePerRun) break;
    const country = settings.countries.find((c) => containsAny(a.title, [c.name, ...c.aliases]).length)?.name ?? "?";
    if (country !== "?" && (perCountry.get(country) ?? 0) >= settings.maxPerCountryPerRun) continue;
    if ((perDomain.get(a.sourceDomain) ?? 0) >= 4) continue;
    perCountry.set(country, (perCountry.get(country) ?? 0) + 1);
    perDomain.set(a.sourceDomain, (perDomain.get(a.sourceDomain) ?? 0) + 1);
    picked.push(a.id);
  }
  job.analyzeQueue = picked;
  job.analyzeIndex = 0;
  log(job, "info", `AI 분석 대상 ${picked.length}건 선정 (대기 ${queued.length}건 중, 국가/매체 균형 적용)`);
}

// ------------------------------------------------------------------ analysis


async function processArticle(job: Job, id: string, settings: Settings, ctx: { opps: Opportunity[]; articles: Article[] }) {
  const [article] = await getArticles([id]);
  if (!article || (article.status !== "queued" && (job.mode === "collect" || job.mode === "weekly" || job.mode === "quick"))) return;
  try {
    if (job.mode === "weekly-analyze" && article.status === "analyzed" && !aiConfigured()) {
      // no AI: (re)classify for the weekly report from stored data only — no network, no cost
      const opp = article.opportunityId ? ctx.opps.find((o) => o.id === article.opportunityId) ?? null : null;
      article.weekly = weeklyRules(article, settings, opp);
      article.competitors = article.weekly.competitorChecks.filter((c) => c.confirmed).map((c) => c.name);
      job.stats.analyzed++;
      await saveArticles([article]);
      return;
    }
    const page: Awaited<ReturnType<typeof verifyAndFetch>> = article.viaGoogleNews
      ? {
          verification: { status: "needs_check", httpStatus: null, finalUrl: null, redirects: 0, checkedAt: new Date().toISOString(), access: "unknown", note: "Google News 경유 링크 — 브라우저에서 원문으로 이동, 원문 URL·발행일 자동 확인 불가" },
          title: null, siteName: null, description: null, text: null, publishedAt: null, publishedAtBasis: null,
        }
      : await verifyAndFetch(article.url, job.mode === "quick" ? 8000 : 15000);
    article.verification = page.verification;
    if (page.publishedAt) {
      article.publishedAt = page.publishedAt;
      article.publishedAtBasis = `원문 메타데이터 (${page.publishedAtBasis})`;
    }
    if (page.siteName && article.provider === "gdelt") article.sourceName = page.siteName;
    article.excerpt = page.description || article.excerpt || (page.text ? page.text.slice(0, 500) : null);

    const pre = classifySource(page.verification.finalUrl || article.url);
    const { analysis, warning, weeklyAI } = await analyzeArticle(
      { title: article.title, url: article.url, sourceName: article.sourceName, sourceType: pre, publishedAt: article.publishedAt, sourceCountry: article.sourceCountry, description: page.description || article.excerpt, text: page.text },
      settings,
    );
    if (warning) {
      job.stats.errors++;
      log(job, "warn", `${article.title.slice(0, 70)} — ${warning}`);
    }
    article.analysis = analysis;
    article.sourceType = classifySource(page.verification.finalUrl || article.url, analysis.company) === "Official Company Press Release" ? "Official Company Press Release" : analysis.sourceType || pre;
    const compNames = new Set(article.competitors);
    for (const m of analysis.competitorsMentioned) {
      const hit = settings.competitors.find((c) => [c.name, ...c.aliases].some((x) => x.toLowerCase() === m.toLowerCase() || m.toLowerCase().includes(x.toLowerCase())));
      if (hit) compNames.add(hit.name);
    }
    article.competitors = [...compNames].filter((n) => checkCompetitors(`${article.title}\n${article.excerpt ?? ""}\n${page.text ?? ""}`, settings).some((c) => c.name === n && c.confirmed) || analysis.mode === "ai");
    article.status = "analyzed";
    article.statusNote = null;
    job.stats.analyzed++;

    // An opportunity must be backed by a source that actually resolves
    const linkOk = article.verification.status !== "broken";
    const prSpam = isMarketResearchPR(article.title, article.sourceDomain, article.sourceName); // paid market-research releases are not projects
    const eligible = linkOk && !prSpam && (analysis.category === "opportunity" || (analysis.category === "competitor" && analysis.scoreBreakdown.investment_signal.score >= 15));
    if (!linkOk) article.statusNote = "원문 링크 확인 불가 — 수주기회로 등록하지 않음";
    if (eligible) {
      const existing = article.opportunityId ? ctx.opps.find((o) => o.id === article.opportunityId) : null;
      const match = existing ?? findMatch(article, ctx.opps, ctx.articles);
      ctx.articles.push(article);
      if (match) {
        mergeInto(match, article, ctx.articles, settings);
        article.opportunityId = match.id;
        await saveOpportunities([match]);
        job.stats.updatedOpportunities++;
        log(job, "info", `기존 프로젝트에 근거 추가: ${match.company} — ${match.projectName}`);
      } else if (analysis.category === "opportunity") {
        const o = newOpportunityFrom(article, settings);
        ctx.opps.push(o);
        article.opportunityId = o.id;
        await saveOpportunities([o]);
        job.stats.newOpportunities++;
        job.newOpportunityIds.push(o.id);
        log(job, "info", `신규 수주기회 [${o.priority} ${o.score}] ${o.company} — ${o.projectName} (${o.country})`);
      }
    }
    // weekly market-intelligence classification (separate Industry Relevance Score)
    const opp = article.opportunityId ? ctx.opps.find((o) => o.id === article.opportunityId) ?? null : null;
    article.weekly = weeklyAI ? weeklyFromAI(article, weeklyAI, settings, opp) : weeklyRules(article, settings, opp, page.text);
    if (weeklyAI) {
      const confirmed = article.weekly.competitorChecks.filter((c) => c.confirmed).map((c) => settings.competitors.find((x) => [x.name, ...x.aliases].some((n) => n.toLowerCase() === c.name.toLowerCase() || c.name.toLowerCase().includes(n.toLowerCase())))?.name).filter((x): x is string => Boolean(x));
      article.competitors = [...new Set(confirmed)];
    } else {
      article.competitors = article.weekly.competitorChecks.filter((c) => c.confirmed).map((c) => c.name);
    }
    await saveArticles([article]);
  } catch (e) {
    job.stats.errors++;
    article.status = "error";
    article.statusNote = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    await saveArticles([article]);
    log(job, "error", `분석 오류: ${article.title.slice(0, 80)} — ${article.statusNote}`);
  }
}

// ------------------------------------------------------------------ supplement (paywalled-only opportunities)

async function supplementStep(job: Job, settings: Settings, oppId: string, ctx: { opps: Opportunity[]; articles: Article[] }) {
  job.supplementDone.push(oppId);
  const o = await getOpportunity(oppId);
  if (!o || o.priority === "GENERAL" || (o.hasFreeSource && o.verifiedSourceCount > 0) || /^unknown$/i.test(o.company)) return;
  try {
    const name = o.company.replace(/"/g, "");
    const raw = await searchGdelt(`"${name}" (plant OR factory OR facility OR warehouse OR "distribution center")`, { timespanDays: 30, max: 25, englishOnly: settings.englishOnly });
    const cand = raw.filter((r) => r.title.toLowerCase().includes(name.toLowerCase().split(" ")[0])).map((r) => toArticle(r, job, settings));
    const existing = new Set((await getArticles(cand.map((c) => c.id))).map((a) => a.id));
    const fresh = cand.filter((c) => !existing.has(c.id)).slice(0, 2);
    if (!fresh.length) return;
    for (const f of fresh) f.opportunityId = null;
    await saveArticles(fresh);
    log(job, "info", `유료 기사만 있는 프로젝트(${o.company}) — 무료/공식 출처 추가 탐색 ${fresh.length}건`);
    for (const f of fresh) await processArticle(job, f.id, settings, ctx);
  } catch (e) {
    log(job, "warn", `추가 출처 탐색 실패 (${o.company}): ${e instanceof Error ? e.message : String(e)}`.slice(0, 300));
  }
}

/** Weekly: for important paywalled articles, look for a free/official article on the same story. */
async function weeklyAlternatives(job: Job, settings: Settings, ctx: { opps: Opportunity[]; articles: Article[] }) {
  const r = job.range!;
  const arts = (await listArticles({ sinceDays: Math.ceil((Date.now() - new Date(r.start).getTime()) / 86400_000) + 2 }))
    .filter((a) => a.status === "analyzed" && !a.isDemo && a.verification.access === "paywall" && !a.altSearchedAt && (a.weekly?.relevance ?? 0) >= 50)
    .slice(0, 5);
  for (const a of arts) {
    const words = a.title.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 2).slice(0, 7).join(" ");
    try {
      const day = (a.publishedAt ?? r.start).slice(0, 10);
      const lang = /[가-힣]/.test(a.title) ? "ko" : "en";
      const res = await searchGoogleNews(words, { lang, startDate: day, endDate: day, max: 15 });
      const cands = res.map((x) => toArticle(x, job, settings)).filter((c) => c.sourceDomain !== a.sourceDomain && jaccard(normalizeTitle(c.title), normalizeTitle(a.title)) >= 0.3);
      const exist = new Set((await getArticles(cands.map((c) => c.id))).map((x) => x.id));
      const fresh = cands.filter((c) => !exist.has(c.id)).slice(0, 2);
      if (fresh.length) {
        await saveArticles(fresh);
        for (const f of fresh) await processArticle(job, f.id, settings, ctx);
      }
      a.altSearchedAt = new Date().toISOString();
      a.altSourceIds = [...cands.filter((c) => exist.has(c.id)).map((c) => c.id), ...fresh.map((f) => f.id)];
      await saveArticles([a]);
      log(job, "info", `유료 기사 대체 출처 탐색: ${a.title.slice(0, 50)} → ${a.altSourceIds.length ? `${a.altSourceIds.length}건 발견` : "무료 대체 출처 없음"}`);
    } catch (e) {
      log(job, "warn", `대체 출처 탐색 실패: ${a.title.slice(0, 50)} — ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

// ------------------------------------------------------------------ slice runner

const inProcess = new Set<string>();

/** Runs the job until done or until the time budget is used. Returns true when finished. */
export async function runJobSlice(jobId: string, budgetMs: number): Promise<boolean> {
  if (inProcess.has(jobId)) return false;
  inProcess.add(jobId);
  const owner = randomUUID();
  const job = await getJob(jobId);
  // effective deadline = this slice's budget, capped by the job's overall time limit
  const jobLimit = job?.deadlineAt ? new Date(job.deadlineAt).getTime() : Infinity;
  const deadline = Math.min(Date.now() + budgetMs, jobLimit);
  const quick = job?.mode === "quick";
  const overLimit = () => Date.now() >= jobLimit;
  try {
    if (!job || job.status !== "running") return true;
    if (await isCancelRequested(jobId)) {
      job.status = "cancelled";
      job.finishedAt = job.finishedAt ?? new Date().toISOString();
      await saveJob(job);
      return true;
    }
    if (job.lease && job.lease.until > new Date().toISOString() && job.lease.owner !== owner) return false;
    job.lease = { owner, until: new Date(Date.now() + budgetMs + 60_000).toISOString() };
    job.slices++;
    await saveJob(job);

    const settings = await getSettings();
    const beat = async () => {
      job!.heartbeatAt = new Date().toISOString();
      if (await isCancelRequested(jobId)) {
        job!.status = "cancelled";
        job!.finishedAt = job!.finishedAt ?? new Date().toISOString();
        job!.lease = null;
        if (!job!.log.some((l) => l.msg.startsWith("사용자가 작업을 취소"))) log(job!, "warn", "사용자가 작업을 취소했습니다.");
        await saveJob(job!);
        throw new CancelledError();
      }
      await saveJob(job!);
    };

    if (job.phase === "discover") {
      const recent = await listArticles({ sinceDays: job.range ? Math.ceil((Date.now() - new Date(job.range.start).getTime()) / 86400_000) + 14 : 14 });
      const recentTitles = recent.map((a) => ({ id: a.id, t: normalizeTitle(a.title), via: Boolean(a.viaGoogleNews) }));
      const discoverEnd = quick ? new Date(job.startedAt).getTime() + QUICK.discoverSeconds * 1000 : deadline;
      while (job.cursor < job.queries.length && Date.now() < Math.min(deadline, discoverEnd)) {
        await discoverStep(job, settings, recentTitles);
        await beat();
      }
      const discoverCut = job.cursor < job.queries.length && (overLimit() || (quick && Date.now() >= discoverEnd));
      if (discoverCut) log(job, "warn", `검색 제한시간 도달 — 남은 검색 ${job.queries.length - job.cursor}건은 건너뛰고 지금까지 수집한 결과로 진행합니다.`);
      if (job.cursor >= job.queries.length || discoverCut) {
        if (quick) {
          job.step = "수집 기사 선별 중";
          const pool = job.quickPool ?? [];
          const stored = (await listArticles({ sinceDays: 14 })).filter((a) => !a.isDemo && a.status === "analyzed").map((a) => a.title);
          const picked = selectQuick(pool, stored);
          const arts = picked.map((c) => toArticle({ ...c } as RawArticle, job!, settings));
          for (const a of arts) a.statusNote = "빠른 테스트 수집";
          await saveArticles(arts);
          job.stats.newArticles = arts.length;
          job.stats.queued = arts.length;
          job.stats.filtered = Math.max(0, pool.length - arts.length);
          job.analyzeQueue = arts.map((a) => a.id);
          job.analyzeIndex = 0;
          const dom = picked.filter((c) => c.domestic).length;
          log(job, "info", `후보 ${pool.length}건 중 투자·설비 신호 기준 ${arts.length}건 선정 (국내 ${dom} · 글로벌 ${arts.length - dom}) — 나머지는 저장하지 않음`);
          job.quickPool = [];
        } else if (overLimit()) {
          job.timeLimited = true;
          job.phase = "done";
        } else {
          await buildAnalyzeQueue(job, settings);
        }
        if (job.phase !== "done") job.phase = "analyze";
        await beat();
      }
    }

    if (job.phase === "analyze") {
      const ctx = { opps: await listOpportunities(), articles: (await listArticles({ sinceDays: 400 })).filter((a) => a.opportunityId) };
      const CONCURRENCY = quick ? 4 : 3;
      const margin = quick ? 3_000 : 20_000;
      while (job.analyzeIndex < job.analyzeQueue.length && Date.now() < deadline - margin) {
        const batch = job.analyzeQueue.slice(job.analyzeIndex, job.analyzeIndex + CONCURRENCY);
        job.step = `원문 확인·분석 중 (${Math.min(job.analyzeIndex + batch.length, job.analyzeQueue.length)}/${job.analyzeQueue.length})`;
        await saveJob(job);
        // sequential merge step inside processArticle keeps clustering consistent; fetch+AI run in parallel
        await Promise.all(batch.map((id) => processArticle(job!, id, settings, ctx)));
        job.analyzeIndex += batch.length;
        await beat();
      }
      if (job.analyzeIndex < job.analyzeQueue.length && overLimit()) {
        job.timeLimited = true;
        log(job, "warn", `전체 제한시간 도달 — 분석하지 못한 ${job.analyzeQueue.length - job.analyzeIndex}건은 '분석 대기'로 저장되어 다음 실행에서 이어서 처리됩니다.`);
        job.phase = "done";
        await beat();
      } else if (job.analyzeIndex >= job.analyzeQueue.length) {
        job.phase = job.mode === "collect" || job.mode === "weekly" ? "supplement" : "done";
        await beat();
      }
    }

    if (job.phase === "supplement") {
      const ctx = { opps: await listOpportunities(), articles: (await listArticles({ sinceDays: 400 })).filter((a) => a.opportunityId) };
      const todo = job.newOpportunityIds.filter((id) => !job!.supplementDone.includes(id)).slice(0, 5 - job.supplementDone.length);
      for (const id of todo) {
        if (Date.now() > deadline - 30_000) break;
        await supplementStep(job, settings, id, ctx);
        await beat();
      }
      const remaining = job.newOpportunityIds.filter((id) => !job!.supplementDone.includes(id));
      if ((!remaining.length || job.supplementDone.length >= 5) && job.mode === "weekly" && Date.now() < deadline - 60_000) {
        await weeklyAlternatives(job, settings, ctx);
      }
      if (!remaining.length || job.supplementDone.length >= 5 || overLimit()) job.phase = "done";
    }

    if (job.phase === "done") {
      job.status = job.stats.errors > 0 ? "completed_with_errors" : "completed";
      job.finishedAt = new Date().toISOString();
      job.lease = null;
      job.step = job.timeLimited ? "제한시간 도달 — 수집된 결과까지 저장하고 종료" : "완료";
      const secs = Math.round((Date.now() - new Date(job.startedAt).getTime()) / 1000);
      log(job, "info", `${job.timeLimited ? "제한시간 종료" : "완료"} (${Math.floor(secs / 60)}분 ${secs % 60}초) — 신규 기사 ${job.stats.newArticles}, 중복 ${job.stats.duplicates}, 분석 ${job.stats.analyzed}, 신규 수주기회 ${job.stats.newOpportunities}, 오류 ${job.stats.errors}`);
      await saveJob(job);
      return true;
    }
    job.lease = null;
    await saveJob(job);
    return false;
  } catch (e) {
    if (e instanceof CancelledError) return true;
    if (job) {
      job.status = "failed";
      job.error = e instanceof Error ? e.message : String(e);
      job.finishedAt = new Date().toISOString();
      job.lease = null;
      log(job, "error", `작업 실패: ${job.error}`);
      await saveJob(job);
    }
    return true;
  } finally {
    inProcess.delete(jobId);
  }
}

class CancelledError extends Error {}

export function sliceBudgetMs(): number {
  const env = Number(process.env.JOB_SLICE_SECONDS);
  if (Number.isFinite(env) && env > 0) return env * 1000;
  return process.env.VERCEL ? 240_000 : 1_800_000;
}

export function internalSecret(): string {
  return process.env.CRON_SECRET || process.env.APP_PASSWORD || "local-dev-secret";
}

/** Run a slice; if more work remains, chain to a fresh invocation (keeps going after the browser closes). */
export async function driveJob(jobId: string, origin: string): Promise<void> {
  const done = await runJobSlice(jobId, sliceBudgetMs());
  if (done) return;
  const job = await getJob(jobId);
  if (!job || job.status !== "running") return;
  try {
    await fetch(`${origin}/api/jobs/${jobId}/continue`, { method: "POST", headers: { "x-internal-secret": internalSecret() } });
  } catch {
    // if chaining fails, the next scheduled run or "Find Opportunities" click resumes the job (stale detection)
  }
}
