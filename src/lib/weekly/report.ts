import "server-only";
import { getStore } from "@/lib/db/store";
import { addDays, reportId, type Period } from "./period";
import type { ReportItem, ReportStatus, WeeklyCategory, WeeklyReport } from "@/lib/types";

export async function getReport(p: Period): Promise<WeeklyReport> {
  const id = reportId(p);
  const r = await getStore().get<WeeklyReport>("reports", id);
  return r ?? { id, startDate: p.startDate, endDate: p.endDate, start: p.start, end: p.end, items: {}, recommendedAt: null, updatedAt: new Date().toISOString() };
}

/** Reports of the previous `weeks` weeks before this period (for "no repeat" checks). */
export async function previousReports(p: Period, weeks = 2): Promise<WeeklyReport[]> {
  const out: WeeklyReport[] = [];
  for (let k = 1; k <= weeks; k++) {
    const id = `${addDays(p.startDate, -7 * k)}_${addDays(p.startDate, -7 * k + 6)}`;
    const r = await getStore().get<WeeklyReport>("reports", id);
    if (r) out.push(r);
  }
  return out;
}

export async function saveReport(r: WeeklyReport): Promise<void> {
  r.updatedAt = new Date().toISOString();
  await getStore().upsert("reports", [r]);
}

function mergeCaption(next: ReportItem["edits"] | null, cur: ReportItem["edits"] | undefined): ReportItem["edits"] | undefined {
  const caption = next && "caption" in next ? next.caption : cur?.caption;
  const rest = next ? Object.fromEntries(Object.entries(next).filter(([k]) => k !== "caption")) : {};
  const out = { ...rest, ...(caption ? { caption } : {}) };
  return Object.keys(out).length ? out : undefined;
}

/** Store / clear the PPT image of a report article. */
export async function setItemImage(p: Period, articleId: string, image: ReportItem["image"]): Promise<WeeklyReport> {
  const r = await getReport(p);
  const cur: ReportItem = r.items[articleId] ?? { status: "unreviewed", category: null, recommended: false, updatedAt: "" };
  r.items[articleId] = { ...cur, image: image ?? null, updatedAt: new Date().toISOString() };
  await saveReport(r);
  return r;
}

export async function setItem(p: Period, articleId: string, patch: { status?: ReportStatus; category?: WeeklyCategory | null; order?: number; edits?: ReportItem["edits"] | null; approved?: boolean; approvedFor?: string | null }): Promise<WeeklyReport> {
  const r = await getReport(p);
  const cur: ReportItem = r.items[articleId] ?? { status: "unreviewed", category: null, recommended: false, updatedAt: "" };
  r.items[articleId] = {
    ...cur,
    ...(patch.status ? { status: patch.status, recommended: false } : {}),
    ...(patch.category !== undefined ? { category: patch.category } : {}),
    ...(patch.order !== undefined ? { order: patch.order } : {}),
    ...(patch.approved !== undefined ? { approvedAt: patch.approved ? new Date().toISOString() : null, approvedFor: patch.approved ? patch.approvedFor ?? null : null } : {}),
    // the PPT photo caption is edited separately and survives title/summary edits or "restore original"
    ...(patch.edits !== undefined ? { edits: mergeCaption(patch.edits, cur.edits) } : {}),
    updatedAt: new Date().toISOString(),
  };
  // newly selected items go to the end of the report order
  if (patch.status === "selected" && r.items[articleId].order === undefined) {
    const max = Math.max(0, ...Object.values(r.items).map((x) => x.order ?? 0));
    r.items[articleId].order = max + 1;
  }
  await saveReport(r);
  return r;
}
