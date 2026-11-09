import { periodFromRequest } from "@/lib/weekly/api";
import { loadReportDoc } from "@/lib/report/load";
import { buildTemplateDeck } from "@/lib/report/pptx-template";
import { renderPptx } from "@/lib/report/render";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/** Build the deck exactly as it will be downloaded and render every slide to an image (needs LibreOffice). */
export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { period } = await periodFromRequest(req);
  const doc = await loadReportDoc(period);
  if (!doc.items.length) return Response.json({ error: "보고서 선정 기사가 없습니다." }, { status: 400 });
  try {
    const deck = await buildTemplateDeck(doc);
    const images = await renderPptx(deck.buf);
    return Response.json({ images, issues: deck.issues, layout: deck.layout });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 501 });
  }
}
