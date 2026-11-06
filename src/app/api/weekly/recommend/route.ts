import { NextResponse } from "next/server";
import { getSettings } from "@/lib/db/repo";
import { periodFromRequest } from "@/lib/weekly/api";
import { getReport, saveReport } from "@/lib/weekly/report";
import { loadWeekly, recommend } from "@/lib/weekly/view";

export const dynamic = "force-dynamic";

/** 보고서 후보 자동 추천: 사용자가 이미 선정/제외/보류한 기사는 변경하지 않음. */
export async function POST(req: Request) {
  const { period } = await periodFromRequest(req);
  const [view, settings] = await Promise.all([loadWeekly(period), getSettings()]);
  const target = Math.max(5, Math.min(40, settings.weekly.recommendCount));
  const ids = recommend(view.rows, target);
  const report = await getReport(period);
  // previous automatic picks the user has not touched are recalculated
  for (const [id, it] of Object.entries(report.items)) if (it.recommended && it.status === "selected") report.items[id] = { ...it, status: "unreviewed", recommended: false };
  let added = 0;
  for (const id of ids) {
    const cur = report.items[id];
    if (report.items[id] && report.items[id].status !== "unreviewed") continue;
    report.items[id] = { status: "selected", category: report.items[id]?.category ?? cur?.category ?? null, recommended: true, updatedAt: new Date().toISOString() };
    added++;
  }
  report.recommendedAt = new Date().toISOString();
  await saveReport(report);
  return NextResponse.json({ ok: true, recommended: added, totalSelected: Object.values(report.items).filter((i) => i.status === "selected").length });
}
