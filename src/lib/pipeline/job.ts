// Server-side collection job. State lives in the database, so progress survives browser refreshes,
// and work is processed in time-boxed "slices" that chain themselves (serverless-friendly).
//
// News Discovery → Article Validation → Deduplication → Information Extraction → Opportunity Scoring
// → Database Storage → Dashboard Update
import "server-only";
import { randomUUID } from "node:crypto";
import { getArticles, getJob, getSettings, listArticles, listJobs, listOpportunities, saveArticles, saveJob, saveOpportunities, saveSettings, getOpportunity } from "@/lib/db/repo";
import { searchGdelt, RateLimitError } from "@/lib/news/gdelt";
import { sleep } from "@/lib/util/http";
import { fetchRss } from "@/lib/news/rss";
import { searchGnews } from "@/lib/news/gnews";
import { planQueries, preScore } from "@/lib/news/queries";
import type { RawArticle } from "@/lib/news/types";
import { classifySource, verifyAndFetch } from "./verify";
import { analyzeArticle } from "./analyze";
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
  return job.status === "running" && Date.now() - new Date(job.heartbeatAt).getTime() < STALE_MS;
}

export async function latestJob(): Promise<Job | null> {
  return (await listJobs(1))[0] ?? null;
}

/** Start a new job, or return the running one (prevents duplicate concurrent runs). */
export async function startJob(trigger: Job["trigger"], mode: Job["mode"] = "collect"): Promise<{ job: Job; created: boolean; resumed: boolean }> {
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
  const queries = mode === "collect" ? planQueries(settings) : [];
  const now = new Date().toISOString();
  const job: Job = {
    id: `job_${now.replace(/[-:.TZ]/g, "").slice(0, 14)}_${randomUUID().slice(0, 6)}`,
    trigger,
    mode,
    status: "running",
    phase: mode === "collect" ? "discover" : "analyze",
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
  log(job, "info", mode === "collect" ? `수집 시작 (${trigger === "scheduled" ? "예약 실행" : "수동 실행"}) — 검색 ${queries.length}건 예정` : "규칙 기반 분석 기사 AI 재분석 시작");
  if (mode === "reanalyze") {
    const rules = (await listArticles({ sinceDays: 60 })).filter((a) => !a.isDemo && a.analysis?.mode === "rules" && a.status === "analyzed");
    job.analyzeQueue = rules.slice(0, settings.maxAnalyzePerRun).map((a) => a.id);
    job.stats.queued = job.analyzeQueue.length;
  }
  await saveJob(job);
  await saveSettings({ ...settings, rotation: (settings.rotation ?? 0) + 1, ...(trigger === "scheduled" ? { lastScheduledRunAt: now } : {}) });
  return { job, created: true, resumed: false };
}

export async function cancelJob(id: string): Promise<Job | null> {
  const job = await getJob(id);
  if (!job || job.status !== "running") return job;
  job.status = "cancelled";
  job.finishedAt = new Date().toISOString();
  log(job, "warn", "사용자가 작업을 취소했습니다.");
  await saveJob(job);
  return job;
}

// ------------------------------------------------------------------ discovery

async function runQuery(q: Job["queries"][number], settings: Settings): Promise<RawArticle[]> {
  const sinceIso = new Date(Date.now() - settings.lookbackDays * 86400_000).toISOString();
  if (q.provider === "gdelt") return searchGdelt(q.query, { timespanDays: settings.lookbackDays, max: 75, englishOnly: settings.englishOnly });
  if (q.provider === "rss") {
    const feed = settings.rssFeeds.find((f) => f.url === q.query);
    return fetchRss(feed?.name ?? q.label, q.query, sinceIso);
  }
  if (q.provider === "gnews") return searchGnews(q.query, sinceIso);
  return [];
}

function toArticle(r: RawArticle, job: Job, settings: Settings): Article {
  const urlNormalized = normalizeUrl(r.url);
  const text = `${r.title} ${r.description ?? ""}`;
  return {
    id: hashId(urlNormalized),
    url: r.url,
    urlNormalized,
    title: r.title,
    sourceName: r.sourceName,
    sourceDomain: r.domain || domainOf(r.url),
    sourceType: classifySource(r.url),
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
    preScore: preScore(r.title, r.description, settings),
    excerpt: r.description,
    verification: { status: "unchecked", httpStatus: null, finalUrl: null, redirects: 0, checkedAt: null, access: "unknown", note: null },
    analysis: null,
    opportunityId: null,
    duplicateOf: null,
    competitors: settings.competitors.filter((c) => containsAny(text, c.aliases.length ? c.aliases : [c.name]).length).map((c) => c.name),
    feedback: null,
    feedbackAt: null,
  };
}

async function discoverStep(job: Job, settings: Settings, recentTitles: { id: string; t: string }[]): Promise<void> {
  const q = job.queries[job.cursor];
  let raw: RawArticle[] = [];
  // circuit breaker: if a provider failed 3 times in a row, skip its remaining queries this run
  const fails = (job.providerFailures ??= {});
  if ((fails[q.provider] ?? 0) >= 3) {
    log(job, "warn", `건너뜀: ${q.label} — ${q.provider} 연속 3회 실패`);
  } else {
    try {
      raw = await runQuery(q, settings);
      fails[q.provider] = 0;
      log(job, "info", `검색 완료: ${q.label} → ${raw.length}건`);
    } catch (e) {
      job.stats.errors++;
      if (e instanceof RateLimitError) await sleep(20_000); // back off; do not count toward the breaker
      else fails[q.provider] = (fails[q.provider] ?? 0) + 1;
      const c = (e as { cause?: { code?: string; message?: string } })?.cause;
      const cause = c ? c.code || c.message || String(c) : null;
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
  const existing = new Set((await getArticles([...uniq.keys()])).map((a) => a.id));
  const toSave: Article[] = [];
  for (const a of uniq.values()) {
    if (existing.has(a.id)) {
      job.stats.duplicates++;
      continue; // already stored & analysed — never re-call AI for it
    }
    const nt = normalizeTitle(a.title);
    const dup = recentTitles.find((x) => x.t === nt || (nt.length > 20 && jaccard(x.t, nt) >= 0.85));
    if (dup) {
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
    recentTitles.push({ id: a.id, t: nt });
    job.stats.newArticles++;
    toSave.push(a);
  }
  await saveArticles(toSave);
}

/** Pick which queued articles get analysed this run: score-ranked, with per-country / per-domain caps for balance. */
async function buildAnalyzeQueue(job: Job, settings: Settings) {
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
  if (!article || (article.status !== "queued" && job.mode === "collect")) return;
  try {
    const page = await verifyAndFetch(article.url);
    article.verification = page.verification;
    if (page.publishedAt) {
      article.publishedAt = page.publishedAt;
      article.publishedAtBasis = `원문 메타데이터 (${page.publishedAtBasis})`;
    }
    if (page.siteName && article.provider === "gdelt") article.sourceName = page.siteName;
    article.excerpt = page.description || article.excerpt || (page.text ? page.text.slice(0, 500) : null);

    const pre = classifySource(page.verification.finalUrl || article.url);
    const { analysis, warning } = await analyzeArticle(
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
    article.competitors = [...compNames];
    article.status = "analyzed";
    article.statusNote = null;
    job.stats.analyzed++;

    // An opportunity must be backed by a source that actually resolves
    const linkOk = article.verification.status !== "broken";
    const eligible = linkOk && (analysis.category === "opportunity" || (analysis.category === "competitor" && analysis.scoreBreakdown.investment_signal.score >= 15));
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

// ------------------------------------------------------------------ slice runner

const inProcess = new Set<string>();

/** Runs the job until done or until the time budget is used. Returns true when finished. */
export async function runJobSlice(jobId: string, budgetMs: number): Promise<boolean> {
  if (inProcess.has(jobId)) return false;
  inProcess.add(jobId);
  const owner = randomUUID();
  const deadline = Date.now() + budgetMs;
  const job = await getJob(jobId);
  try {
    if (!job || job.status !== "running") return true;
    if (job.lease && job.lease.until > new Date().toISOString() && job.lease.owner !== owner) return false;
    job.lease = { owner, until: new Date(Date.now() + budgetMs + 60_000).toISOString() };
    job.slices++;
    await saveJob(job);

    const settings = await getSettings();
    const beat = async () => {
      job!.heartbeatAt = new Date().toISOString();
      const fresh = await getJob(jobId);
      if (fresh?.status === "cancelled") throw new CancelledError();
      await saveJob(job!);
    };

    if (job.phase === "discover") {
      const recent = await listArticles({ sinceDays: 14 });
      const recentTitles = recent.map((a) => ({ id: a.id, t: normalizeTitle(a.title) }));
      while (job.cursor < job.queries.length && Date.now() < deadline) {
        await discoverStep(job, settings, recentTitles);
        await beat();
      }
      if (job.cursor >= job.queries.length) {
        await buildAnalyzeQueue(job, settings);
        job.phase = "analyze";
        await beat();
      }
    }

    if (job.phase === "analyze") {
      const ctx = { opps: await listOpportunities(), articles: (await listArticles({ sinceDays: 400 })).filter((a) => a.opportunityId) };
      const CONCURRENCY = 3;
      while (job.analyzeIndex < job.analyzeQueue.length && Date.now() < deadline - 20_000) {
        const batch = job.analyzeQueue.slice(job.analyzeIndex, job.analyzeIndex + CONCURRENCY);
        // sequential merge step inside processArticle keeps clustering consistent; fetch+AI run in parallel
        await Promise.all(batch.map((id) => processArticle(job!, id, settings, ctx)));
        job.analyzeIndex += batch.length;
        await beat();
      }
      if (job.analyzeIndex >= job.analyzeQueue.length) {
        job.phase = job.mode === "collect" ? "supplement" : "done";
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
      if (!remaining.length || job.supplementDone.length >= 5) job.phase = "done";
    }

    if (job.phase === "done") {
      job.status = job.stats.errors > 0 ? "completed_with_errors" : "completed";
      job.finishedAt = new Date().toISOString();
      job.lease = null;
      log(job, "info", `완료 — 신규 기사 ${job.stats.newArticles}, 중복 ${job.stats.duplicates}, 분석 ${job.stats.analyzed}, 신규 수주기회 ${job.stats.newOpportunities}, 오류 ${job.stats.errors}`);
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
