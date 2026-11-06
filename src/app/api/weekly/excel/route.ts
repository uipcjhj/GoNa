import { periodFromRequest } from "@/lib/weekly/api";
import { buildExport } from "@/lib/weekly/export";
import { buildWeeklyWorkbook } from "@/lib/weekly/excel";
import { loadWeekly } from "@/lib/weekly/view";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { period } = await periodFromRequest(req);
  const view = await loadWeekly(period);
  const data = buildExport(view.rows);
  if (!data.industry.length) return Response.json({ error: "선정된 기사가 없습니다. 기사를 선정하거나 '보고서 생성'으로 추천을 받으세요." }, { status: 400 });
  const buf = await buildWeeklyWorkbook(data, `${period.startDate} ~ ${period.endDate}`);
  const name = `현대무벡스_주간업계동향_${period.startDate}_${period.endDate}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
