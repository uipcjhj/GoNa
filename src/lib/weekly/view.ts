import "server-only";
import { ensureInitialized } from "@/lib/data";
import { getArticles, getSettings, listArticles, listOpportunities } from "@/lib/db/repo";
import { aiConfigured } from "@/lib/pipeline/analyze";
import { normalizeTitle, tokens } from "@/lib/util/text";
import { localDateStr } from "@/lib/util/week";
import { dateStatus, weeklyRules } from "./classify";
import { withV2 } from "./taxonomy";
import { daysOf, type Period } from "./period";
import { getReport, previousReports, saveReport } from "./report";
import { CURATION_VERSION, curate } from "./curate";
import type { AccessType, Article, Curation, DateStatus, DetailCategory, Priority, RelevanceBreakdown, ReportAIStatus, ReportAnalysis, ReportItem, ReportStatus, SourceLevel, SourceTrace, SourceType, VerificationStatus, WeeklyAnalysis, WeeklyCategory, WeeklyJudgment, WeeklyReport } from "@/lib/types";
import { REPORT_ANALYSIS_VERSION } from "@/lib/report/factcheck";
import { labelOf } from "./taxonomy";

export interface WeeklyRow {
  id: string; url: string; title: string; titleKo: string | null; sourceName: string; sourceType: SourceType;
  publishedAt: string | null; dateStatus: DateStatus; dateBasis: string; kstDate: string | null; inPeriod: boolean; eventDate: string | null; reReport: boolean;
  country: string; industry: string; categories: WeeklyCategory[]; autoCategory: WeeklyCategory | null; category: WeeklyCategory | null;
  relevance: number | null; relevanceBreakdown: RelevanceBreakdown | null; oppScore: number | null; oppPriority: Priority | null; opportunityId: string | null;
  oppWhy: string | null; oppSolutions: string[];
  summaryLines: string[]; summaryIsExcerpt: boolean; analysis: "ai" | "rules" | "demo" | "pending";
  verification: VerificationStatus; access: AccessType; viaGoogleNews: boolean; altState: "found" | "none" | "not_searched" | null;
  competitors: string[]; competitorNotes: string[]; competitorActivity: string;
  reportStatus: ReportStatus; recommended: boolean; isDemo: boolean; dupGroup: string | null; excerpt: string | null; policyNote: string | null;
  detail: DetailCategory | null; judgment: WeeklyJudgment | null; summary4: string[]; summary4Basis: WeeklyAnalysis["summary4Basis"] | null;
  order: number | null; edits: ReportItem["edits"] | null; image: ReportItem["image"] | null; sourceDomain: string; publishedAtBasis: string; competitorChecks: { name: string; confirmed: boolean; note: string }[];
  sourceTrace: SourceTrace | null; // 원문 복원·본문 추출 기록
  /** detail category basis: "ai" = Gemini 원문 검증, "rules" = 키워드 예비 분류 (보고서 확정 전) */
  detailBasis: "ai" | "rules";
  /** Gemini report analysis (null = not analysed with the current version) */
  ai: ReportAnalysis | null;
  aiStatus: ReportAIStatus | "none" | "outdated";
  /** report gates — all must pass (or the user approves) before an article goes into Excel/PPT without a warning */
  gate: { aiDone: boolean; dateVerified: boolean; sourceLevel: SourceLevel | null; linkDirect: boolean; approved: boolean; problems: string[] };
  approvedAt: string | null;
}

export interface WeeklyView {
  rows: WeeklyRow[];
  report: WeeklyReport;
  counts: Record<WeeklyCategory | "all" | "selected" | "collected", number>;
  missingDays: string[];
  dayCounts: { date: string; n: number }[];
  dupGroups: { key: string; ids: string[] }[];
  ai: boolean;
  hotWatch: { id: string; company: string; projectName: string; country: string; score: number; priority: Priority; articleId: string; inPeriod: boolean; isDemo: boolean }[];
  curation: Curation;
  target: number;
}

export async function loadWeekly(p: Period): Promise<WeeklyView> {
  await ensureInitialized();
  const settings = await getSettings();
  const sinceDays = Math.ceil((Date.now() - new Date(p.start).getTime()) / 86400_000) + 2;
  const [all, opps, report] = await Promise.all([listArticles({ sinceDays }), listOpportunities(), getReport(p)]);
  const oppById = new Map(opps.map((o) => [o.id, o]));
  const tz = settings.reportTimezone;
  const inP = (iso: string | null) => Boolean(iso && iso >= p.start && iso < p.end);
  const arts = all.filter((a) => (settings.showDemoData || !a.isDemo) && inP(a.publishedAt ?? a.discoveredAt));
  const collected = arts.filter((a) => a.status !== "duplicate");

  const settingsKey = hashOf(JSON.stringify(settings));
  const rows: WeeklyRow[] = [];
  for (const a of arts) {
    if (a.status === "duplicate" || a.status === "filtered" || a.status === "error") continue;
    const opp = a.opportunityId ? oppById.get(a.opportunityId) ?? null : null;
    // AI results are stored; rule-based classification is cheap and deterministic, so it is recomputed on read
    // (older records and rule improvements apply immediately, no network / API cost)
    // AI results are stored (v2 fields filled by rules if the AI run predates them); rule-based results are recomputed on read
    const w = a.status !== "analyzed" ? null : memoRules(a, settingsKey, () => a.weekly?.mode === "ai" ? withV2(a, a.weekly, opp) : { ...weeklyRules(a, settings, opp), ...(a.weekly?.summaryLines.length ? { summaryLines: a.weekly.summaryLines } : {}) }, opp);
    const item = report.items[a.id];
    const auto = w?.primaryCategory ?? null;
    const ai = a.report && a.report.version === REPORT_ANALYSIS_VERSION ? a.report : null;
    const aiOk = ai && (ai.status === "done" || ai.status === "needs_review") && ai.summary.length === 4 ? ai : null;
    // a "done" result without a usable 4-line summary is not done (an empty / partial summary never counts as verified)
    const aiStatus: WeeklyRow["aiStatus"] = ai ? (ai.status === "done" && !aiOk ? "needs_review" : ai.status) : a.report ? "outdated" : "none";
    const aiDetail = ai && ai.status !== "failed" && ai.category.group !== "review" ? { group: ai.category.group, country: ai.category.group === "global" ? ai.category.countryKo || null : null, sub: ai.category.sub } as Omit<DetailCategory, "label"> : null;
    const ds = dateStatus(a);
    const others = a.altSourceIds?.length ? "found" : a.altSearchedAt ? "none" : a.verification.access === "paywall" ? "not_searched" : null;
    rows.push({
      id: a.id, url: a.url, title: a.title, titleKo: ai?.titleKo || w?.titleKo || null, sourceName: a.sourceName, sourceType: a.sourceType,
      publishedAt: a.publishedAt, dateStatus: ds, dateBasis: a.publishedAtBasis, kstDate: a.publishedAt ? localDateStr(a.publishedAt, tz) : null,
      inPeriod: inP(a.publishedAt), eventDate: w?.eventDate ?? a.analysis?.eventDate ?? null, reReport: Boolean(a.analysis?.flags.reReport),
      country: w?.country ?? a.analysis?.country ?? "Unknown", industry: w?.industry ?? a.analysis?.industry ?? "Unknown",
      categories: w?.categories ?? [], autoCategory: auto, category: item?.category ?? auto,
      relevance: w?.relevance ?? null, relevanceBreakdown: w?.relevanceBreakdown ?? null,
      oppScore: opp?.score ?? a.analysis?.score ?? null, oppPriority: opp?.priority ?? null, opportunityId: a.opportunityId,
      oppWhy: opp?.whyItMatters ?? a.analysis?.whyItMatters ?? null, oppSolutions: (opp?.solutions ?? a.analysis?.solutionFit ?? []).map((s) => s.solution),
      summaryLines: w?.summaryLines ?? [], summaryIsExcerpt: w?.summaryIsExcerpt ?? true,
      analysis: a.isDemo ? "demo" : a.status !== "analyzed" ? "pending" : w?.mode === "ai" ? "ai" : "rules",
      verification: a.verification.status, access: a.verification.access, viaGoogleNews: Boolean(a.viaGoogleNews), altState: others,
      competitors: a.competitors, competitorNotes: (w?.competitorChecks ?? []).filter((c) => !c.confirmed).map((c) => `${c.name}: ${c.note}`),
      competitorActivity: a.analysis?.competitorActivity ?? "",
      reportStatus: item?.status ?? "unreviewed", recommended: Boolean(item?.recommended), isDemo: a.isDemo, dupGroup: null,
      // report summary = validated Gemini result only (rule-generated sentences are never used as a report summary)
      detail: aiDetail ? { ...aiDetail, label: labelOf(aiDetail) } : w?.detail ?? null, judgment: ai && ai.status !== "failed" ? judgmentFromAI(ai, a) : w?.judgment ?? null,
      summary4: aiOk ? aiOk.summary : [], summary4Basis: aiOk ? "ai" : null,
      detailBasis: aiDetail ? "ai" : "rules", ai, aiStatus,
      gate: gateOf(a, ai, aiOk, item, ds), approvedAt: approvalOf(item, ai, aiOk).valid ? item!.approvedAt! : null, sourceTrace: a.sourceTrace ?? null,
      order: item?.order ?? null, edits: item?.edits ?? null, image: item?.image ?? null, sourceDomain: a.sourceDomain, publishedAtBasis: a.publishedAtBasis, competitorChecks: w?.competitorChecks ?? [],
      excerpt: a.excerpt, policyNote: w?.policy ? `${w.policy.kind === "law" ? "법령" : w.policy.kind === "enforcement" ? "시행" : w.policy.kind === "government_announcement" ? "정부 발표" : "기타"}${w.policy.effectiveDate ? ` · 시행일 ${w.policy.effectiveDate}` : ""}` : null,
    });
  }

  // duplicate groups: same opportunity project, syndicated copies, or near-identical titles
  const groups = new Map<string, Set<string>>();
  const add = (k: string, id: string) => { if (!groups.has(k)) groups.set(k, new Set()); groups.get(k)!.add(id); };
  for (const r of rows) if (r.opportunityId) add(`opp:${r.opportunityId}`, r.id);
  // same project per Gemini facts: company + project site (+ amount when stated)
  for (const r of rows) {
    const f = r.ai && r.ai.status !== "failed" ? r.ai : null;
    if (!f || !f.company.value || !["production_plant", "warehouse_dc", "rnd_center"].includes(f.facility.kind)) continue;
    add(`ai:${f.company.value.toLowerCase().replace(/[^a-z0-9가-힣]/g, "")}|${f.location.countryKo || f.location.country}|${f.investment.amount ? f.investment.amount.replace(/\s/g, "").toLowerCase() : f.location.city.toLowerCase()}`, r.id);
  }
  for (const a of arts) if (a.status === "duplicate" && a.duplicateOf && rows.some((r) => r.id === a.duplicateOf)) add(`dup:${a.duplicateOf}`, a.duplicateOf);
  // same story from different outlets: near-identical titles, or the same key figure (e.g. "420억원") with overlapping words
  const titles = rows.map((r) => { const t = normalizeTitle(r.titleKo ?? r.title); return { id: r.id, t, set: new Set(tokens(t)), nums: storyNumbers(`${r.title} ${r.titleKo ?? ""}`) }; });
  // token sets computed once (was re-tokenising both titles for every pair)
  const jac = (x: Set<string>, y: Set<string>) => { if (!x.size || !y.size) return 0; let n = 0; for (const w of x) if (y.has(w)) n++; return n / (x.size + y.size - n); };
  const parent = new Map<string, string>();
  const find = (x: string): string => (parent.get(x) ?? x) === x ? x : find(parent.get(x)!);
  for (let i = 0; i < titles.length; i++) for (let j = i + 1; j < titles.length; j++) {
    const a = titles[i], b = titles[j];
    const sim = jac(a.set, b.set);
    const sharedNum = a.nums.some((n) => b.nums.includes(n));
    if ((a.t.length > 10 && sim >= 0.6) || (sharedNum && sim >= 0.15)) parent.set(find(b.id), find(a.id));
  }
  const parentVals = new Set(parent.values());
  for (const t of titles) if (parent.has(t.id) || parentVals.has(t.id)) add(`t:${find(t.id)}`, t.id);
  const dupGroups = [...groups.entries()].filter(([, ids]) => ids.size > 1).map(([key, ids]) => ({ key, ids: [...ids] }));
  for (const g of dupGroups) for (const id of g.ids) { const r = rows.find((x) => x.id === id); if (r && !r.dupGroup) r.dupGroup = g.key; }

  const counts = { all: rows.length, collected: collected.length, selected: rows.filter((r) => r.reportStatus === "selected").length } as WeeklyView["counts"];
  for (const c of ["domestic", "global", "competitor", "policy", "tech", "opportunity"] as WeeklyCategory[]) counts[c] = rows.filter((r) => r.categories.includes(c) || r.category === c).length;

  const today = localDateStr(new Date(), tz);
  const perDay = new Map<string, number>();
  for (const a of collected) if (a.publishedAt) { const d = localDateStr(a.publishedAt, tz); perDay.set(d, (perDay.get(d) ?? 0) + 1); }
  const dayCounts = daysOf(p).filter((d) => d <= today).map((date) => ({ date, n: perDay.get(date) ?? 0 }));
  const missingDays = dayCounts.filter((d) => d.n === 0).map((d) => d.date);

  const rowIds = new Set(rows.map((r) => r.id));
  const hotWatch = opps
    .filter((o) => (settings.showDemoData || !o.isDemo) && o.priority !== "GENERAL" && o.articleIds.some((id) => rowIds.has(id)))
    .map((o) => ({ id: o.id, company: o.company, projectName: o.projectName, country: o.country, score: o.score, priority: o.priority, articleId: o.articleIds.find((id) => rowIds.has(id))!, inPeriod: true, isDemo: o.isDemo }))
    .sort((a, b) => b.score - a.score);

  // weekly curation: computed once per period and saved (recomputed on request via "AI 추천 다시 생성")
  const target = Math.max(5, Math.min(30, settings.weekly.recommendCount || 12));
  // saved curations from older rules (rule-summary era) are discarded and recomputed — no stale recommendations
  let curation = report.curation && report.curation.version === CURATION_VERSION ? report.curation : null;
  if (!report.v2) {
    // one-time migration: release v1 automatic picks the user never touched (manual choices and edits are kept)
    let released = 0;
    for (const [id, it] of Object.entries(report.items)) {
      if (it.recommended && it.status === "selected" && !it.edits) { report.items[id] = { ...it, status: "unreviewed", recommended: false }; released++; }
    }
    report.v2 = true;
    curation = null; // recompute with the v2 rules
    if (released) for (const r of rows) if (report.items[r.id]?.status === "unreviewed" && r.reportStatus === "selected") r.reportStatus = "unreviewed";
    await saveReport(report);
  }
  if (!curation && rows.some((r) => r.analysis !== "pending")) {
    curation = await computeCuration(p, rows, settings.weekly.rejectCount ?? 8, target, false);
    report.curation = curation;
    await saveReport(report);
  }
  return { rows, report, counts, missingDays, dayCounts, dupGroups, ai: aiConfigured(), hotWatch, curation: curation ?? emptyCuration(target), target };
}

export function emptyCuration(target: number): Curation {
  return { generatedAt: "", target, includeUnverified: false, picks: [], rejects: [], needsCheck: [], excludedPrevious: 0, balance: { global: 0, domestic: 0, competitor: 0 } };
}

/** Run the curation for a period, excluding stories selected in the previous two weeks. */
export async function computeCuration(p: Period, rows: WeeklyRow[], rejectCount: number, target: number, includeUnverified: boolean): Promise<Curation> {
  const prev = await previousReports(p, 2);
  const prevIds = [...new Set(prev.flatMap((r) => Object.entries(r.items).filter(([, it]) => it.status === "selected").map(([id]) => id)))];
  const prevArts = await getArticles(prevIds);
  return curate(rows, { target, rejectCount, includeUnverified, previous: prevArts.map((a) => ({ id: a.id, title: a.weekly?.titleKo ?? a.title })) });
}

/** Distinctive figures in a headline ("420억원", "$3.8 billion", "670명") used to spot the same story across outlets. */
function storyNumbers(s: string): string[] {
  const out = new Set<string>();
  for (const m of s.matchAll(/(\$|€|£|usd\s?)?(\d[\d,.]*)\s?(조|억|만|billion|million|bn|mn|m(?![a-z])|b(?![a-z])|명|gwh|%|대|개)/gi)) {
    const n = m[2].replace(/,/g, "");
    if (n.length >= 2 || m[3]) out.add(`${n}${({ million: "m", mn: "m", billion: "b", bn: "b" } as Record<string, string>)[m[3].toLowerCase()] ?? m[3].toLowerCase()}`);
  }
  return [...out];
}

const QUOTA: Record<WeeklyCategory, number> = { domestic: 4, global: 4, competitor: 3, policy: 2, tech: 2, opportunity: 3 };

/** Auto-recommend ~15–20 report candidates (balanced by category, deduplicated by project/story). */
export function recommend(rows: WeeklyRow[], target: number): string[] {
  const cands = rows.filter((r) => !r.isDemo && r.analysis !== "pending" && r.category && r.reportStatus === "unreviewed" && (r.relevance ?? 0) >= 35);
  const score = (r: WeeklyRow) => (r.relevance ?? 0) + (r.category === "opportunity" ? (r.oppScore ?? 0) / 5 : 0) + (r.inPeriod ? 5 : -10) + (r.dateStatus === "verified" ? 3 : 0) + (r.viaGoogleNews ? 0 : 2);
  cands.sort((a, b) => score(b) - score(a));
  const picked: WeeklyRow[] = rows.filter((r) => r.reportStatus === "selected" && !r.recommended); // keep the user's own picks
  const usedGroups = new Set(picked.map((r) => r.dupGroup).filter(Boolean));
  const take = (r: WeeklyRow) => {
    if (picked.includes(r) || (r.dupGroup && usedGroups.has(r.dupGroup))) return false;
    picked.push(r);
    if (r.dupGroup) usedGroups.add(r.dupGroup);
    return true;
  };
  const scale = target / 18;
  for (const cat of Object.keys(QUOTA) as WeeklyCategory[]) {
    let n = picked.filter((r) => r.category === cat).length;
    for (const r of cands.filter((x) => x.category === cat)) {
      if (n >= Math.round(QUOTA[cat] * scale) || picked.length >= target) break;
      if (take(r)) n++;
    }
  }
  for (const r of cands) { if (picked.length >= target) break; take(r); } // fill with best remaining; never pad with irrelevant items
  return picked.map((r) => r.id);
}

const DATE_OK = (d: DateStatus) => d === "verified";

/** Gates for using an article in the company report without warnings. */
/** 승인은 '원문 검증 완료'와 별개의 사용자 상태. 유효하려면 ① 요약이 있고(사용자 수정 또는 Gemini 4줄) ② 승인 이후 Gemini 재분석으로 요약이 바뀌지 않아야 한다. */
export function approvalOf(item: ReportItem | undefined, ai: ReportAnalysis | null, aiOk: ReportAnalysis | null): { valid: boolean; note: string | null } {
  if (!item?.approvedAt) return { valid: false, note: null };
  const userSummary = Boolean(item.edits?.summary4?.some((l) => l.trim()));
  if (!userSummary && !aiOk) return { valid: false, note: "승인 취소됨 — 보고서에 쓸 4줄 요약이 없습니다" };
  if (!userSummary && item.approvedFor && item.approvedFor !== "user" && ai && item.approvedFor !== ai.analyzedAt) return { valid: false, note: "승인 후 Gemini 재분석으로 요약이 바뀌었습니다 — 다시 확인하고 승인하세요" };
  return { valid: true, note: null };
}

function gateOf(a: Article, ai: ReportAnalysis | null, aiOk: ReportAnalysis | null, item: ReportItem | undefined, ds: DateStatus): WeeklyRow["gate"] {
  const problems: string[] = [];
  const edited = Boolean(item?.edits?.summary4?.some(Boolean));
  const aiDone = ai?.status === "done";
  if (!ai) problems.push(a.report ? "이전 버전 분석 — Gemini 재분석 필요" : "Gemini 원문 검증 분석 전 (AI 분석 필요)");
  else if (ai.status === "failed") problems.push(`AI 분석 실패: ${ai.error?.message ?? ""}`);
  else if (ai.status === "insufficient_source") problems.push("원문 부족 — 본문·발췌를 읽지 못함");
  else if (ai.status === "needs_review") problems.push(`사용자 검토 필요: ${ai.reviewReasons.slice(0, 2).join("; ")}`);
  if (!DATE_OK(ds)) problems.push("발행일 미확인 (원문 메타데이터로 확인되지 않음)");
  const linkDirect = !a.viaGoogleNews && !/news\.google\.com/.test(a.url);
  if (!linkDirect) problems.push("Google News 경유 링크 — 발행 매체 원문 URL 미확인");
  if (ai && ai.sourceLevel === "excerpt") problems.push("본문 미확보 — 제목·발췌문 기준 분석 (검증 수준 낮음)");
  if (edited && !aiDone) problems.push("요약은 사용자 수정본 사용");
  const ap = approvalOf(item, ai, aiOk);
  if (ap.note) problems.push(ap.note);
  return { aiDone: aiDone && Boolean(aiOk), dateVerified: DATE_OK(ds), sourceLevel: ai?.sourceLevel ?? null, linkDirect, approved: ap.valid, problems };
}

/** Internal judgment items from the Gemini facts (replaces keyword guesses when available). */
function judgmentFromAI(ai: ReportAnalysis, _a: Article): WeeklyJudgment {
  void _a;
  const facility = ["production_plant", "warehouse_dc"].includes(ai.facility.kind);
  const early = ["planned", "approved", "under_construction"].includes(ai.stage.value);
  const completed = ai.stage.value === "completed_operating";
  const isNewProject = facility && early ? true : completed ? false : null;
  const supplierStatus: WeeklyJudgment["supplierStatus"] = ai.supplier.status === "decided" ? "decided" : ai.supplier.status === "undecided" ? "undecided" : isNewProject && !ai.automation.mentioned ? "order_unconfirmed" : "unknown";
  return {
    winPotential: ai.reportType === "opportunity" ? ai.orderPotential : "low",
    isNewProject,
    completed,
    supplierStatus,
    supplierNote: ai.supplier.name ? `${ai.supplier.name}${ai.supplier.evidence ? " (원문 명시)" : ""}` : ai.constructionCompany ? `시공사 ${ai.constructionCompany} — 자동화 공급사와 별개` : "원문에 자동화 공급사 언급 없음",
    orderRoom: completed || ai.supplier.status === "decided" ? "no" : ai.reportType === "opportunity" && isNewProject ? "yes" : "unknown",
    directRelevance: ai.reportType === "opportunity" || ai.reportType === "competitor" ? "high" : ai.reportType === "trend" ? "medium" : "low",
    competitorValue: ai.reportType === "competitor" ? "high" : "none",
    lowValueType: ai.reportType === "exclude" ? ai.excludeReason || "보고 가치 낮음 (광고·홍보 등)" : null,
    basis: ai.sourceLevel === "body" ? "body" : "title_only",
    automationMentioned: ai.automation.mentioned,
  };
}

// ---- rule classification memo (pure function of article + settings): avoids recomputing ~1,000 articles per request
const RULE_MEMO = new Map<string, WeeklyAnalysis>();
function hashOf(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}
function memoRules(a: Article, settingsKey: string, compute: () => WeeklyAnalysis, opp: { score: number; priority: string } | null): WeeklyAnalysis {
  const key = [a.id, settingsKey, a.analysis?.analyzedAt ?? "", a.weekly?.analyzedAt ?? "", a.excerpt?.length ?? 0, a.publishedAt ?? "", a.verification.status, a.viaGoogleNews ? 1 : 0, opp ? `${opp.score}${opp.priority}` : "", new Date().toISOString().slice(0, 10)].join("|");
  const hit = RULE_MEMO.get(key);
  if (hit) return hit;
  const w = compute();
  if (RULE_MEMO.size > 5000) RULE_MEMO.clear();
  RULE_MEMO.set(key, w);
  return w;
}
