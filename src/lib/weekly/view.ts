import "server-only";
import { ensureInitialized } from "@/lib/data";
import { getSettings, listArticles, listOpportunities } from "@/lib/db/repo";
import { aiConfigured } from "@/lib/pipeline/analyze";
import { jaccard, normalizeTitle } from "@/lib/util/text";
import { localDateStr } from "@/lib/util/week";
import { dateStatus, weeklyRules } from "./classify";
import { daysOf, type Period } from "./period";
import { getReport } from "./report";
import type { AccessType, DateStatus, Priority, RelevanceBreakdown, ReportStatus, SourceType, VerificationStatus, WeeklyCategory, WeeklyReport } from "@/lib/types";

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

  const rows: WeeklyRow[] = [];
  for (const a of arts) {
    if (a.status === "duplicate" || a.status === "filtered" || a.status === "error") continue;
    const opp = a.opportunityId ? oppById.get(a.opportunityId) ?? null : null;
    // AI results are stored; rule-based classification is cheap and deterministic, so it is recomputed on read
    // (older records and rule improvements apply immediately, no network / API cost)
    const w = a.status !== "analyzed" ? null : a.weekly?.mode === "ai" ? a.weekly : { ...weeklyRules(a, settings, opp), ...(a.weekly?.summaryLines.length ? { summaryLines: a.weekly.summaryLines } : {}) };
    const item = report.items[a.id];
    const auto = w?.primaryCategory ?? null;
    const ds = dateStatus(a);
    const others = a.altSourceIds?.length ? "found" : a.altSearchedAt ? "none" : a.verification.access === "paywall" ? "not_searched" : null;
    rows.push({
      id: a.id, url: a.url, title: a.title, titleKo: w?.titleKo ?? null, sourceName: a.sourceName, sourceType: a.sourceType,
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
      excerpt: a.excerpt, policyNote: w?.policy ? `${w.policy.kind === "law" ? "법령" : w.policy.kind === "enforcement" ? "시행" : w.policy.kind === "government_announcement" ? "정부 발표" : "기타"}${w.policy.effectiveDate ? ` · 시행일 ${w.policy.effectiveDate}` : ""}` : null,
    });
  }

  // duplicate groups: same opportunity project, syndicated copies, or near-identical titles
  const groups = new Map<string, Set<string>>();
  const add = (k: string, id: string) => { if (!groups.has(k)) groups.set(k, new Set()); groups.get(k)!.add(id); };
  for (const r of rows) if (r.opportunityId) add(`opp:${r.opportunityId}`, r.id);
  for (const a of arts) if (a.status === "duplicate" && a.duplicateOf && rows.some((r) => r.id === a.duplicateOf)) add(`dup:${a.duplicateOf}`, a.duplicateOf);
  // same story from different outlets: near-identical titles, or the same key figure (e.g. "420억원") with overlapping words
  const titles = rows.map((r) => ({ id: r.id, t: normalizeTitle(r.titleKo ?? r.title), nums: storyNumbers(`${r.title} ${r.titleKo ?? ""}`) }));
  const parent = new Map<string, string>();
  const find = (x: string): string => (parent.get(x) ?? x) === x ? x : find(parent.get(x)!);
  for (let i = 0; i < titles.length; i++) for (let j = i + 1; j < titles.length; j++) {
    const a = titles[i], b = titles[j];
    const sim = jaccard(a.t, b.t);
    const sharedNum = a.nums.some((n) => b.nums.includes(n));
    if ((a.t.length > 10 && sim >= 0.6) || (sharedNum && sim >= 0.15)) parent.set(find(b.id), find(a.id));
  }
  for (const t of titles) if (parent.has(t.id) || [...parent.values()].includes(t.id)) add(`t:${find(t.id)}`, t.id);
  const dupGroups = [...groups.entries()].filter(([, ids]) => ids.size > 1).map(([key, ids]) => ({ key, ids: [...ids] }));
  for (const g of dupGroups) for (const id of g.ids) { const r = rows.find((x) => x.id === id); if (r && !r.dupGroup) r.dupGroup = g.key; }

  const counts = { all: rows.length, collected: collected.length, selected: rows.filter((r) => r.reportStatus === "selected").length } as WeeklyView["counts"];
  for (const c of ["domestic", "global", "competitor", "policy", "tech", "opportunity"] as WeeklyCategory[]) counts[c] = rows.filter((r) => r.categories.includes(c) || r.category === c).length;

  const today = localDateStr(new Date(), tz);
  const dayCounts = daysOf(p).filter((d) => d <= today).map((date) => ({ date, n: collected.filter((a) => a.publishedAt && localDateStr(a.publishedAt, tz) === date).length }));
  const missingDays = dayCounts.filter((d) => d.n === 0).map((d) => d.date);

  const hotWatch = opps
    .filter((o) => (settings.showDemoData || !o.isDemo) && o.priority !== "GENERAL" && o.articleIds.some((id) => rows.some((r) => r.id === id)))
    .map((o) => ({ id: o.id, company: o.company, projectName: o.projectName, country: o.country, score: o.score, priority: o.priority, articleId: o.articleIds.find((id) => rows.some((r) => r.id === id))!, inPeriod: true, isDemo: o.isDemo }))
    .sort((a, b) => b.score - a.score);

  return { rows, report, counts, missingDays, dayCounts, dupGroups, ai: aiConfigured(), hotWatch };
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
