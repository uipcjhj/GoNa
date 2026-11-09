import "server-only";
import { loadWeekly } from "@/lib/weekly/view";
import { getReport } from "@/lib/weekly/report";
import type { Period } from "@/lib/weekly/period";
import { buildReportDoc, type ReportDoc } from "./data";

export async function loadReportDoc(period: Period): Promise<ReportDoc> {
  const view = await loadWeekly(period);
  return buildReportDoc(period, view, await getReport(period));
}
