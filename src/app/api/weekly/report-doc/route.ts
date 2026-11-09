import { periodFromRequest } from "@/lib/weekly/api";
import { loadReportDoc } from "@/lib/report/load";
import { checkArticleFit } from "@/lib/report/fit";
import { renderAvailable } from "@/lib/report/render";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Data for the export screen: the same article set / order / texts used by Excel and PPT, plus layout checks. */
export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { period } = await periodFromRequest(req);
  const doc = await loadReportDoc(period);
  const fit = Object.fromEntries(doc.items.map((a) => [a.id, checkArticleFit(a)]));
  return Response.json({ doc, fit, render: await renderAvailable() });
}
