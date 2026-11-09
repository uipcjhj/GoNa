import { periodFromRequest } from "@/lib/weekly/api";
import { getReport, saveReport } from "@/lib/weekly/report";
import { loadWeekly } from "@/lib/weekly/view";
import { buildReportDoc } from "@/lib/report/data";
import { buildTemplateDeck } from "@/lib/report/pptx-template";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 회사 PPT 원본 템플릿으로 업계동향 보고서 생성 (실패해도 수집·분석 기능에는 영향 없음). */
export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { period } = await periodFromRequest(req);
  const report = await getReport(period);
  const doc = await buildReportDoc(period, await loadWeekly(period), report);
  if (!doc.items.length) return Response.json({ error: "보고서 선정 기사가 없습니다. 기사를 선정한 뒤 다시 시도하세요." }, { status: 400 });
  try {
    const deck = await buildTemplateDeck(doc);
    // remember this week's Vol. so the next report continues from it
    if (doc.volAuto) {
      report.pptMeta = { ...(report.pptMeta ?? {}), vol: doc.vol };
      await saveReport(report);
    }
    const name = `${doc.weekTitle} 업계동향.pptx`;
    return new Response(new Uint8Array(deck.buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        "X-Report-Issues": String(deck.issues.length),
      },
    });
  } catch (e) {
    console.error("[weekly/pptx]", e);
    return Response.json({ error: `PowerPoint 생성 실패: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  }
}
