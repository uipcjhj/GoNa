import { periodFromRequest } from "@/lib/weekly/api";
import { buildExport } from "@/lib/weekly/export";
import { buildWeeklyWorkbook } from "@/lib/weekly/excel";
import { loadWeekly } from "@/lib/weekly/view";
import { getReport } from "@/lib/weekly/report";
import { buildReportDoc } from "@/lib/report/data";
import { buildTemplateWorkbook } from "@/lib/report/xlsx-template";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const file = (buf: Buffer, name: string) =>
  new Response(new Uint8Array(buf), { headers: { "Content-Type": XLSX, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}` } });

/** format "template" (default): company 업계동향리스트 template · "analysis": 3-sheet analysis workbook (수주기회 포함). */
export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { period, body } = await periodFromRequest(req);
  const view = await loadWeekly(period);
  if (body.format === "analysis") {
    const data = buildExport(view.rows, view.curation);
    if (!data.report.length) return Response.json({ error: "선정된 기사가 없습니다. 기사를 선정하거나 'AI 추천 다시 생성'을 눌러 추천을 받으세요." }, { status: 400 });
    return file(await buildWeeklyWorkbook(data, `${period.startDate} ~ ${period.endDate}`), `현대무벡스_주간업계동향_분석_${period.startDate}_${period.endDate}.xlsx`);
  }
  const doc = await buildReportDoc(period, view, await getReport(period));
  if (!doc.items.length) return Response.json({ error: "보고서 선정 기사가 없습니다. 기사를 선정한 뒤 다시 시도하세요." }, { status: 400 });
  try {
    return file(await buildTemplateWorkbook(doc), `${doc.weekTitle} 업계동향리스트.xlsx`);
  } catch (e) {
    console.error("[weekly/excel] template", e);
    return Response.json({ error: `Excel 생성 실패: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  }
}
