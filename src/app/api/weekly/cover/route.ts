// PPT 표지 배경 이미지 후보: 업로드 · 선택 · 삭제 (기사 본문 사진과 별도). 이미지 생성 API는 연결돼 있지 않음 —
// 외부 도구로 만든 이미지를 업로드해 사용 (프롬프트는 report-doc의 coverPrompt).
import { NextResponse } from "next/server";
import sharp from "sharp";
import { resolvePeriod } from "@/lib/weekly/period";
import { getReport, saveReport } from "@/lib/weekly/report";
import { saveAsset } from "@/lib/report/assets";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

const periodOf = (b: Record<string, unknown>) => {
  const s = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : undefined);
  return resolvePeriod({ p: s("p"), w: s("w"), start: s("start"), end: s("end") });
};

export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData();
    const body = Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")) as Record<string, unknown>;
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "이미지 파일이 필요합니다." }, { status: 400 });
    if (file.size > 15_000_000 || !/^image\/(jpeg|png|webp)$/.test(file.type)) return NextResponse.json({ error: "15MB 이하 JPG·PNG·WEBP만 업로드할 수 있습니다." }, { status: 400 });
    let buf: Buffer;
    try {
      buf = await sharp(Buffer.from(await file.arrayBuffer()), { failOn: "none" }).rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
    } catch {
      return NextResponse.json({ error: "이미지를 읽을 수 없습니다." }, { status: 400 });
    }
    const assetId = await saveAsset(buf, "image/jpeg");
    const r = await getReport(periodOf(body));
    const meta = { ...(r.pptMeta ?? {}) };
    meta.coverCandidates = [...(meta.coverCandidates ?? []).filter((c) => c.assetId !== assetId), { assetId, name: file.name.slice(0, 80), addedAt: new Date().toISOString() }].slice(-6);
    meta.coverAssetId ??= assetId;
    r.pptMeta = meta;
    await saveReport(r);
    return NextResponse.json({ ok: true, pptMeta: meta });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = await getReport(periodOf(body));
  const meta = { ...(r.pptMeta ?? {}) };
  const id = typeof body.assetId === "string" ? body.assetId : null;
  if (body.action === "select") meta.coverAssetId = id && meta.coverCandidates?.some((c) => c.assetId === id) ? id : null; // null = 템플릿 원본 표지
  else if (body.action === "remove" && id) {
    meta.coverCandidates = (meta.coverCandidates ?? []).filter((c) => c.assetId !== id);
    if (meta.coverAssetId === id) meta.coverAssetId = null;
  } else return NextResponse.json({ error: "알 수 없는 요청" }, { status: 400 });
  r.pptMeta = meta;
  await saveReport(r);
  return NextResponse.json({ ok: true, pptMeta: meta });
}
