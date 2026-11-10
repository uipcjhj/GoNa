// 원문 복원 (Gemini 호출 없음): Google News 링크 → 언론사 URL, 본문 재시도, 같은 기사 다른 출처 검색, 보조 근거 URL 추가.
import { NextResponse } from "next/server";
import { getArticles, saveArticles } from "@/lib/db/repo";
import { addSupportUrl, readArticleSource } from "@/lib/report/source";
import { publicHttpUrl } from "@/lib/report/images";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const b = (await req.json().catch(() => ({}))) as { articleIds?: unknown; supportUrl?: unknown };
  const ids = (Array.isArray(b.articleIds) ? b.articleIds : []).filter((x): x is string => typeof x === "string").slice(0, 10);
  if (!ids.length) return NextResponse.json({ error: "articleIds 필요" }, { status: 400 });
  const support = typeof b.supportUrl === "string" && b.supportUrl.trim() ? b.supportUrl.trim() : null;
  if (support && (!publicHttpUrl(support) || /news\.google\.com/.test(support))) return NextResponse.json({ error: "공식 보도자료·다른 매체의 https 주소를 입력하세요 (Google News 주소 불가)." }, { status: 400 });
  const arts = await getArticles(ids);
  const out = [];
  for (const a of arts) {
    if (support) addSupportUrl(a, support);
    const r = await readArticleSource(a, { searchAlternatives: true });
    out.push({ id: a.id, url: a.url, trace: r.trace });
  }
  await saveArticles(arts); // 선정 상태·사용자 수정·승인은 보고서 항목에 있어 그대로 유지
  return NextResponse.json({ ok: true, results: out });
}
