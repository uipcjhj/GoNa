// Groups articles about the same project into one Opportunity and maintains project history.
import { hashId } from "@/lib/util/url";
import { isUnknown, jaccard, normalizeCompany } from "@/lib/util/text";
import { priorityOf } from "./scoring";
import type { Analysis, Article, HistoryEntry, Opportunity, Settings } from "@/lib/types";

const FAC_FAMILY: [RegExp, string][] = [
  [/battery|gigafactory|cell|cathode/i, "battery"],
  [/cold|refrigerat|frozen/i, "cold"],
  [/cargo|baggage|airport/i, "airport"],
  [/distribution|fulfil|warehouse|logistics|dc\b/i, "dc"],
  [/tire|tyre/i, "tire"],
  [/plant|factory|manufactur|production/i, "plant"],
];
const family = (s: string) => FAC_FAMILY.find(([re]) => re.test(s))?.[1] ?? "other";

export function matchKeyOf(a: Analysis): string {
  return [normalizeCompany(a.company) || "unknown", (a.country || "unknown").toLowerCase(), family(a.facilityType)].join("|");
}

function amountNumber(s: string): number | null {
  const m = s.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(billion|bn|b|million|mn|m)?/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const u = (m[2] || "").toLowerCase();
  return u.startsWith("b") ? n * 1000 : n;
}

/** Similarity score 0..1 between a new analysis and an existing opportunity. */
export function similarity(a: Analysis, title: string, o: Opportunity, oTitles: string[]): number {
  const ca = normalizeCompany(a.company);
  const co = normalizeCompany(o.company);
  const companyMatch = ca && co && (ca === co || (ca.length >= 4 && co.includes(ca)) || (co.length >= 4 && ca.includes(co)));
  const countryOk = isUnknown(a.country) || isUnknown(o.country) || a.country === o.country;
  if (!countryOk) return 0;
  const titleSim = Math.max(0, ...oTitles.map((t) => jaccard(t, title)));
  if (!companyMatch) return titleSim >= 0.6 ? titleSim : 0; // syndicated copy of the same story
  let s = 0.5;
  if (family(a.facilityType) === family(o.facilityType)) s += 0.2;
  if (!isUnknown(a.city) && !isUnknown(o.city) && a.city.toLowerCase() === o.city.toLowerCase()) s += 0.2;
  if (!isUnknown(a.projectName) && !isUnknown(o.projectName)) s += 0.3 * jaccard(a.projectName, o.projectName);
  const na = amountNumber(a.investmentAmount);
  const no = amountNumber(o.investmentAmount);
  if (na && no && Math.abs(na - no) / Math.max(na, no) < 0.1) s += 0.15;
  s += 0.2 * titleSim;
  if (family(a.facilityType) !== family(o.facilityType) && family(a.facilityType) !== "other" && family(o.facilityType) !== "other") s -= 0.35;
  return Math.min(1, s);
}

const keepKnown = (cur: string, next: string) => (isUnknown(cur) && !isUnknown(next) ? next : cur);

function historyEntry(article: Article): HistoryEntry {
  const a = article.analysis!;
  return {
    date: a.eventDate ?? article.publishedAt?.slice(0, 10) ?? null,
    type: a.historyEventType,
    title: article.title,
    articleId: article.id,
    note: a.eventDate ? `사건일: ${a.eventDate} (${a.eventDateBasis})` : `기사 발행일 기준${article.publishedAt ? "" : " (날짜 미확인)"}`,
  };
}

function recomputeSources(o: Opportunity, articles: Article[]) {
  const mine = articles.filter((x) => o.articleIds.includes(x.id));
  o.verifiedSourceCount = mine.filter((x) => x.verification.status === "verified").length;
  o.hasFreeSource = mine.some((x) => x.verification.access !== "paywall");
  o.latestPublishedAt = mine.map((x) => x.publishedAt).filter(Boolean).sort().pop() ?? o.latestPublishedAt;
  o.competitorsInvolved = [...new Set(mine.flatMap((x) => x.competitors))];
}

export function newOpportunityFrom(article: Article, settings: Settings): Opportunity {
  const a = article.analysis!;
  const now = new Date().toISOString();
  return {
    id: hashId(`opp:${article.id}`, 12),
    matchKey: matchKeyOf(a),
    company: a.company,
    projectName: a.projectName,
    country: a.country,
    city: a.city,
    region: a.region,
    industry: a.industry,
    investmentAmount: a.investmentAmount,
    facilityType: a.facilityType,
    signalType: a.signalType,
    projectStage: a.projectStage,
    expectedTimeline: a.expectedTimeline,
    eventDate: a.eventDate,
    automationNeeds: a.automationNeeds,
    solutions: a.solutionFit,
    score: a.score,
    priority: priorityOf(a.score, settings),
    scoreBreakdown: a.scoreBreakdown,
    penalties: a.penalties,
    whyItMatters: a.whyItMatters,
    summaryKo: a.summaryKo,
    facts: a.facts,
    inferences: a.inferences,
    uncertainties: a.uncertainties,
    articleIds: [article.id],
    primaryArticleId: article.id,
    latestPublishedAt: article.publishedAt,
    firstSeenAt: now,
    lastUpdatedAt: now,
    history: [historyEntry(article)],
    verifiedSourceCount: article.verification.status === "verified" ? 1 : 0,
    hasFreeSource: article.verification.access !== "paywall",
    competitorsInvolved: article.competitors,
    analysisMode: a.mode,
    isDemo: article.isDemo,
  };
}

/** Merge an analysed article into an existing opportunity (follow-up report / new project event). */
export function mergeInto(o: Opportunity, article: Article, allArticles: Article[], settings: Settings): Opportunity {
  const a = article.analysis!;
  if (!o.articleIds.includes(article.id)) o.articleIds.push(article.id);
  for (const k of ["company", "projectName", "city", "industry", "investmentAmount", "facilityType", "expectedTimeline", "signalType"] as const) {
    o[k] = keepKnown(o[k], a[k]);
  }
  if (isUnknown(o.country)) { o.country = a.country; o.region = a.region; }
  o.eventDate = o.eventDate ?? a.eventDate;
  o.automationNeeds = [...new Set([...o.automationNeeds, ...a.automationNeeds])].slice(0, 10);
  const sol = new Map(o.solutions.map((s) => [s.solution, s]));
  for (const s of a.solutionFit) if (!sol.has(s.solution)) sol.set(s.solution, s);
  o.solutions = [...sol.values()];
  o.uncertainties = [...new Set([...a.uncertainties, ...o.uncertainties])].slice(0, 8);
  o.facts = [...new Set([...o.facts, ...a.facts])].slice(0, 14);
  o.inferences = [...new Set([...o.inferences, ...a.inferences])].slice(0, 10);

  const isNewer = (article.publishedAt ?? "") >= (o.latestPublishedAt ?? "");
  // A better (AI > rules) or higher-scored analysis becomes the headline analysis
  const primary = allArticles.find((x) => x.id === o.primaryArticleId)?.analysis;
  const better = !primary || (a.mode === "ai" && primary.mode !== "ai") || (a.mode === primary.mode && a.score > primary.score);
  if (better) {
    o.primaryArticleId = article.id;
    o.score = a.score;
    o.scoreBreakdown = a.scoreBreakdown;
    o.penalties = a.penalties;
    o.whyItMatters = a.whyItMatters;
    o.summaryKo = a.summaryKo;
    o.analysisMode = a.mode;
  }
  if (isNewer) {
    o.projectStage = a.projectStage !== "Unknown" ? a.projectStage : o.projectStage;
    if (a.flags.completedProject) {
      // project finished => new-order potential drops
      o.score = Math.min(o.score, a.score);
      o.scoreBreakdown = a.scoreBreakdown;
      o.penalties = a.penalties;
    }
  }
  o.priority = priorityOf(o.score, settings);
  if (!o.history.some((h) => h.articleId === article.id)) o.history.push(historyEntry(article));
  o.history.sort((x, y) => (x.date ?? "9999").localeCompare(y.date ?? "9999"));
  o.lastUpdatedAt = new Date().toISOString();
  recomputeSources(o, allArticles.some((x) => x.id === article.id) ? allArticles : [...allArticles, article]);
  return o;
}

export function findMatch(article: Article, opps: Opportunity[], articles: Article[]): Opportunity | null {
  const a = article.analysis!;
  const byId = new Map(articles.map((x) => [x.id, x]));
  let best: { o: Opportunity; s: number } | null = null;
  for (const o of opps) {
    if (o.isDemo !== article.isDemo) continue;
    const titles = o.articleIds.map((id) => byId.get(id)?.title ?? "").filter(Boolean);
    const s = similarity(a, article.title, o, titles);
    if (s >= 0.65 && (!best || s > best.s)) best = { o, s };
  }
  return best?.o ?? null;
}
