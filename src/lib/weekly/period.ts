import { weekRange } from "@/lib/util/week";

export type PeriodKey = "last" | "this" | "prev" | "custom";
export interface Period { key: PeriodKey; start: string; end: string; startDate: string; endDate: string; label: string; offset: number }

const kstMidnight = (date: string) => new Date(`${date}T00:00:00+09:00`).toISOString();
const addDays = (date: string, n: number) => new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10) + n)).toISOString().slice(0, 10);

/** Default = last full Monday–Sunday week in KST. `w` = week offset relative to the current week. */
export function resolvePeriod(sp: { p?: string; w?: string; start?: string; end?: string }, tz = "Asia/Seoul"): Period {
  const valid = (d?: string) => Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (sp.p === "custom" && valid(sp.start) && valid(sp.end) && sp.start! <= sp.end!) {
    return { key: "custom", start: kstMidnight(sp.start!), end: kstMidnight(addDays(sp.end!, 1)), startDate: sp.start!, endDate: sp.end!, label: `${sp.start} ~ ${sp.end} (사용자 지정)`, offset: 0 };
  }
  let offset = sp.p === "this" ? 0 : sp.p === "prev" ? -2 : -1;
  if (sp.w !== undefined && /^-?\d+$/.test(sp.w)) offset = Math.min(0, Number(sp.w));
  const r = weekRange(new Date(), tz, offset);
  const key: PeriodKey = offset === 0 ? "this" : offset === -1 ? "last" : offset === -2 ? "prev" : "custom";
  const name = offset === 0 ? "이번 주" : offset === -1 ? "지난주" : `${-offset}주 전`;
  return { key, start: r.start, end: r.end, startDate: r.startDate, endDate: r.endDate, label: `${name} · ${r.startDate}(월) ~ ${r.endDate}(일)`, offset };
}

export function daysOf(p: Pick<Period, "startDate" | "endDate">): string[] {
  const out: string[] = [];
  for (let d = p.startDate; d <= p.endDate; d = addDays(d, 1)) out.push(d);
  return out;
}

export const reportId = (p: Pick<Period, "startDate" | "endDate">) => `${p.startDate}_${p.endDate}`;
export { addDays, kstMidnight };
