// Attach & verify the publisher's direct URL for an article found via Google News (redirect links cannot be
// resolved by machine). The page is fetched for real; only then is the article marked verified and its date
// taken from the page metadata. Nothing is inferred.
import { NextResponse } from "next/server";
import { getArticle, saveArticles } from "@/lib/db/repo";
import { verifyAndFetch, classifySource } from "@/lib/pipeline/verify";
import { domainOf, isHttpUrl } from "@/lib/util/url";
import { jaccard, normalizeTitle } from "@/lib/util/text";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: RouteContext<"/api/articles/[id]/source">) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { id } = await ctx.params;
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  if (!url || !isHttpUrl(url) || /news\.google\.com/.test(url)) return NextResponse.json({ error: "발행 매체의 원문 URL(https://…)을 입력하세요. Google News 주소는 사용할 수 없습니다." }, { status: 400 });
  const a = await getArticle(id);
  if (!a) return NextResponse.json({ error: "기사를 찾을 수 없습니다." }, { status: 404 });
  const page = await verifyAndFetch(url);
  if (page.verification.status !== "verified") {
    return NextResponse.json({ error: `원문을 확인하지 못했습니다: ${page.verification.note ?? page.verification.status}. 검증 완료로 표시하지 않습니다.` }, { status: 422 });
  }
  const sim = page.title ? jaccard(normalizeTitle(page.title), normalizeTitle(a.title)) : 0;
  const note = sim < 0.2 ? " (제목 일치도 낮음 — 같은 기사인지 확인하세요)" : "";
  a.url = url;
  a.viaGoogleNews = false;
  a.sourceDomain = domainOf(url);
  a.sourceType = classifySource(url);
  a.verification = { ...page.verification, note: `발행 매체 원문 직접 확인${note}` };
  if (page.publishedAt) {
    a.publishedAt = page.publishedAt;
    a.publishedAtBasis = `원문 메타데이터 (${page.publishedAtBasis})`;
  } else {
    a.publishedAtBasis = "원문 확인됨 · 발행일 메타데이터 없음 (미확인)";
    a.publishedAt = null;
  }
  if (page.description && (!a.excerpt || a.excerpt.length < page.description.length)) a.excerpt = page.description;
  await saveArticles([a]);
  return NextResponse.json({ ok: true, publishedAt: a.publishedAt, basis: a.publishedAtBasis, titleSimilarity: Math.round(sim * 100) });
}
