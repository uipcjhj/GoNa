// PPT article images: automatic lookup (article / press-release image), approve / reject, caption, user upload.
import { NextResponse } from "next/server";
import { resolvePeriod } from "@/lib/weekly/period";
import { getReport, setItemImage, setItem } from "@/lib/weekly/report";
import { getArticle } from "@/lib/db/repo";
import { RIGHTS, findArticleImage, storeImage } from "@/lib/report/images";
import type { ReportImage } from "@/lib/types";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Body = Record<string, unknown>;
const periodOf = (b: Body) => {
  const s = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : typeof b[k] === "number" ? String(b[k]) : undefined);
  return resolvePeriod({ p: s("p"), w: s("w"), start: s("start"), end: s("end") });
};

async function find(period: ReturnType<typeof periodOf>, articleId: string): Promise<{ id: string; ok: boolean; message: string; image?: ReportImage }> {
  const a = await getArticle(articleId);
  if (!a) return { id: articleId, ok: false, message: "기사를 찾을 수 없습니다." };
  const r = await findArticleImage(a.url);
  if (!r.ok) return { id: articleId, ok: false, message: r.reason };
  await setItemImage(period, articleId, r.image);
  return { id: articleId, ok: true, image: r.image, message: r.image.status === "approved" ? "보도자료 배포 이미지 — 자동 적용" : "원문 기사 이미지 후보 — 사용 권한 확인 후 승인하세요" };
}

export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;

  // multipart: user upload { file, articleId, p/w/start/end }
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData();
    const body: Body = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
    const file = form.get("file");
    const articleId = typeof body.articleId === "string" ? body.articleId : "";
    if (!(file instanceof File) || !articleId) return NextResponse.json({ error: "이미지 파일과 기사 ID가 필요합니다." }, { status: 400 });
    if (file.size > 10_000_000) return NextResponse.json({ error: "10MB 이하 이미지만 업로드할 수 있습니다." }, { status: 400 });
    if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(file.type)) return NextResponse.json({ error: "JPG·PNG·WEBP 이미지만 업로드할 수 있습니다." }, { status: 400 });
    const stored = await storeImage(Buffer.from(await file.arrayBuffer()));
    if (!stored) return NextResponse.json({ error: "이미지를 읽을 수 없습니다." }, { status: 400 });
    const caption = typeof body.caption === "string" ? body.caption.trim().slice(0, 80) : "";
    const image: ReportImage = {
      status: "approved", source: "upload", imageUrl: null, pageUrl: typeof body.sourceUrl === "string" && /^https?:\/\//.test(body.sourceUrl) ? body.sourceUrl : null,
      rights: RIGHTS.upload, caption, captionBasis: caption ? "user" : "none", ...stored, fetchedAt: new Date().toISOString(),
    };
    await setItemImage(periodOf(body), articleId, image);
    return NextResponse.json({ ok: true, image });
  }

  const body = (await req.json().catch(() => ({}))) as Body;
  const period = periodOf(body);
  const articleId = typeof body.articleId === "string" ? body.articleId : "";
  const action = body.action;

  if (action === "find_all") {
    // selected articles without an image; sequential with a time budget (no AI calls involved)
    const report = await getReport(period);
    const ids = Object.entries(report.items).filter(([, it]) => it.status === "selected" && !it.image).map(([id]) => id);
    const started = Date.now();
    const results = [];
    for (const id of ids) {
      if (Date.now() - started > 90_000) { results.push({ id, ok: false, message: "시간 제한으로 다음에 다시 시도하세요." }); continue; }
      results.push(await find(period, id));
    }
    return NextResponse.json({ ok: true, results });
  }
  if (!articleId) return NextResponse.json({ error: "articleId 필요" }, { status: 400 });
  if (action === "find") return NextResponse.json(await find(period, articleId));

  const report = await getReport(period);
  const cur = report.items[articleId]?.image ?? null;
  if (action === "remove") { await setItemImage(period, articleId, null); return NextResponse.json({ ok: true }); }
  if (action === "caption") {
    const caption = typeof body.caption === "string" ? body.caption.trim().slice(0, 80) : "";
    const it = report.items[articleId];
    await setItem(period, articleId, { edits: { ...(it?.edits ?? {}), caption } });
    return NextResponse.json({ ok: true });
  }
  if (!cur) return NextResponse.json({ error: "이미지가 없습니다." }, { status: 404 });
  if (action === "approve" || action === "reject") {
    await setItemImage(period, articleId, { ...cur, status: action === "approve" ? "approved" : "rejected" });
    return NextResponse.json({ ok: true });
  }
  if (action === "fit") {
    await setItemImage(period, articleId, { ...cur, fit: cur.fit === "cover" ? "contain" : "cover" });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "알 수 없는 요청" }, { status: 400 });
}
