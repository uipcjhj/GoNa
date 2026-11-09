import { NextResponse } from "next/server";
import { getSettings } from "@/lib/db/repo";
import { periodFromRequest } from "@/lib/weekly/api";
import { getReport, saveReport } from "@/lib/weekly/report";
import { computeCuration, loadWeekly } from "@/lib/weekly/view";

export const dynamic = "force-dynamic";

/**
 * action "generate": recompute AI 추천 (12) / 후보 탈락 (5–10) / 확인 필요 for the period. User decisions are untouched.
 * action "select_picks": mark every current pick as 선정 (keeps items the user already excluded/held), ordered by rank.
 */
export async function POST(req: Request) {
  const { period, body } = await periodFromRequest(req);
  const settings = await getSettings();
  const report = await getReport(period);
  if (body.action === "select_picks") {
    const picks = report.curation?.picks ?? [];
    let n = 0;
    let order = Math.max(0, ...Object.values(report.items).map((x) => x.order ?? 0));
    for (const p of picks) {
      const cur = report.items[p.articleId];
      if (cur && cur.status !== "unreviewed") continue;
      report.items[p.articleId] = { status: "selected", category: cur?.category ?? null, recommended: true, updatedAt: new Date().toISOString(), order: ++order, edits: cur?.edits };
      n++;
    }
    await saveReport(report);
    return NextResponse.json({ ok: true, selected: n });
  }
  const target = Math.max(5, Math.min(30, Number(body.target) || settings.weekly.recommendCount || 12));
  const view = await loadWeekly(period);
  const curation = await computeCuration(period, view.rows, settings.weekly.rejectCount ?? 8, target, Boolean(body.includeUnverified));
  const fresh = await getReport(period);
  fresh.curation = curation;
  await saveReport(fresh);
  return NextResponse.json({ ok: true, curation });
}
