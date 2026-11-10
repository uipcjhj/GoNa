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
  const { articleId, body } = (await req.json().catch(() => ({}))) as { articleId?: string; body?: string };
  if (!articleId) return NextResponse.json({ error: "articleId 필요" }, { status: 400 });
  const a = await getArticle(articleId);
  if (!a) return NextResponse.json({ error: "기사를 찾을 수 없습니다." }, { status: 404 });
  // 원문 접근 실패 시 사용자가 붙여넣은 본문으로 분석 (빈 문자열 → 다시 원문 페이지 사용)
  if (typeof body === "string") {
    const text = body.replace(/\s+\n/g, "\n").trim().slice(0, 20000);
    if (text && text.length < 200) return NextResponse.json({ error: "본문은 200자 이상 붙여넣어 주세요." }, { status: 400 });
    a.manualBody = text || null;
  }
  const r = await analyzeForReport(a, await getSettings());
  a.report = r;
  await saveArticles([a]);
  return NextResponse.json({ ok: r.status !== "failed", status: r.status, error: r.error?.message ?? null, reasons: r.reviewReasons });
}
