import "server-only";
import { getStore } from "@/lib/db/store";
import { reportId, type Period } from "./period";
import type { ReportItem, ReportStatus, WeeklyCategory, WeeklyReport } from "@/lib/types";

export async function getReport(p: Period): Promise<WeeklyReport> {
  const id = reportId(p);
  const r = await getStore().get<WeeklyReport>("reports", id);
  return r ?? { id, startDate: p.startDate, endDate: p.endDate, start: p.start, end: p.end, items: {}, recommendedAt: null, updatedAt: new Date().toISOString() };
}

export async function saveReport(r: WeeklyReport): Promise<void> {
  r.updatedAt = new Date().toISOString();
  await getStore().upsert("reports", [r]);
}

export async function setItem(p: Period, articleId: string, patch: { status?: ReportStatus; category?: WeeklyCategory | null }): Promise<WeeklyReport> {
  const r = await getReport(p);
  const cur: ReportItem = r.items[articleId] ?? { status: "unreviewed", category: null, recommended: false, updatedAt: "" };
  r.items[articleId] = {
    ...cur,
    ...(patch.status ? { status: patch.status, recommended: false } : {}),
    ...(patch.category !== undefined ? { category: patch.category } : {}),
    updatedAt: new Date().toISOString(),
  };
  await saveReport(r);
  return r;
}
