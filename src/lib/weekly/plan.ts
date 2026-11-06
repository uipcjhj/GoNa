// Query plan for weekly scraping. Order matters: direct publisher feeds first (real URLs + dates),
// then Google News (Korean & English) restricted to the target dates, then GDELT for global coverage.
import type { PlannedQuery, Settings } from "@/lib/types";

export interface WeeklyRange { start: string; end: string; startDate: string; endDate: string; days?: string[] }

const enc = (o: object) => JSON.stringify(o);

export function planWeeklyQueries(s: Settings, range: WeeklyRange): PlannedQuery[] {
  const w = s.weekly;
  const plan: PlannedQuery[] = [];
  const dayWindows = range.days?.length ? range.days.map((d) => ({ startDate: d, endDate: d })) : [{ startDate: range.startDate, endDate: range.endDate }];

  // 1) publisher RSS feeds (only return recent items; date filtering happens on storage)
  if (!range.days?.length) {
    for (const f of s.rssFeeds.filter((f) => f.enabled)) {
      plan.push({ provider: "rss", query: f.url, label: `RSS · ${f.name}` });
    }
  }

  // 2) Google News RSS (free, Korean + English), restricted to each window
  if (w.googleNews) {
    const ko = (list: string[], cat: string) => list.forEach((q) => dayWindows.forEach((d) => plan.push({ provider: "googlenews", query: enc({ q, lang: "ko", ...d }), label: `Google News(국문) · ${cat} · ${q}${range.days?.length ? ` · ${d.startDate}` : ""}` })));
    const en = (list: string[], cat: string) => list.forEach((q) => dayWindows.forEach((d) => plan.push({ provider: "googlenews", query: enc({ q, lang: "en", ...d }), label: `Google News(영문) · ${cat} · ${q}${range.days?.length ? ` · ${d.startDate}` : ""}` })));
    const comps = s.competitors.filter((c) => c.enabled);
    // missing-day re-search uses a smaller core set to stay polite
    const core = (list: string[], n: number) => (range.days?.length ? list.slice(0, n) : list);
    ko(core(w.domesticQueries, 4), "국내");
    ko(core(w.competitorQueriesKo, 1), "경쟁사");
    ko(core(w.policyQueriesKo, 2), "정책");
    ko(core(w.techQueriesKo, 1), "기술");
    en(core(w.globalQueries, 4), "글로벌");
    en(core(comps.map((c) => `"${c.aliases[0] ?? c.name}" (warehouse OR logistics OR automation OR contract)`), 2), "경쟁사");
    en(core(w.policyQueriesEn, 1), "정책");
    en(core(w.techQueriesEn, 1), "기술");
  }

  // 3) GDELT (global, English) with an explicit date window (GDELT DOC API covers ~3 months)
  const ageDays = (Date.now() - new Date(range.start).getTime()) / 86400_000;
  if (w.gdelt && !range.days?.length && ageDays < 85) {
    for (const q of w.globalQueries.slice(0, 6)) {
      const gq = q.split(" OR ").length > 1 ? q.replace(/(\S+ OR \S+(?: OR \S+)*)/, "($1)") : q;
      plan.push({ provider: "gdelt", query: enc({ q: gq, start: range.start, end: range.end }), label: `GDELT · 글로벌 · ${q}` });
    }
  }
  return plan;
}
