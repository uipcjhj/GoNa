import { NextResponse } from "next/server";
import { getArticle, getSettings, saveArticles } from "@/lib/db/repo";
import { analyzeForReport } from "@/lib/report/factcheck";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Re-run the Gemini report analysis for ONE article (selective retry — no bulk quota use). */
export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { articleId } = (await req.json().catch(() => ({}))) as { articleId?: string };
  if (!articleId) return NextResponse.json({ error: "articleId 필요" }, { status: 400 });
  const a = await getArticle(articleId);
  if (!a) return NextResponse.json({ error: "기사를 찾을 수 없습니다." }, { status: 404 });
  const r = await analyzeForReport(a, await getSettings());
  a.report = r;
  await saveArticles([a]);
  return NextResponse.json({ ok: r.status !== "failed", status: r.status, error: r.error?.message ?? null, reasons: r.reviewReasons });
}
