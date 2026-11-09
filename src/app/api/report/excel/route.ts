import { getArticles, getSettings, listOpportunities } from "@/lib/db/repo";
import { buildWeeklyExcel } from "@/lib/report/excel";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { ids, periodLabel, fileLabel } = (await req.json().catch(() => ({}))) as { ids?: string[]; periodLabel?: string; fileLabel?: string };
  if (!ids?.length) return Response.json({ error: "선택된 기사가 없습니다." }, { status: 400 });
  const settings = await getSettings();
  const [articles, opps] = await Promise.all([getArticles(ids), listOpportunities()]);
  const buf = await buildWeeklyExcel(articles, new Map(opps.map((o) => [o.id, o])), periodLabel ?? "", settings.reportTimezone);
  const name = `Global_Opportunity_Radar_주간동향_${(fileLabel ?? new Date().toISOString().slice(0, 10)).replace(/[^\w-]/g, "")}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
