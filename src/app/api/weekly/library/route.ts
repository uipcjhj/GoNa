// 보고서 이미지 자료실: 선정 기사 목록 + 기사별 이미지 후보 검색(요청 시에만) + 캡션 수정·재생성 + 대표 이미지.
// 기사 선정·요약·보고서 편집 내용은 변경하지 않는다 (imglib:* 설정 행만 읽고 쓴다).
import { NextResponse } from "next/server";
import { resolvePeriod } from "@/lib/weekly/period";
import { loadWeekly } from "@/lib/weekly/view";
import { getArticle } from "@/lib/db/repo";
import { getEntry, saveEntry, searchLibrary, writeCaptions } from "@/lib/report/library";
import { checkCaption, normalizeCaption } from "@/lib/report/caption";
import { REPORT_ANALYSIS_VERSION } from "@/lib/report/factcheck";
import type { LibImageType } from "@/lib/types";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TYPES: LibImageType[] = ["article", "logo", "facility"];

export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const s = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : typeof b[k] === "number" ? String(b[k]) : undefined);
  const period = resolvePeriod({ p: s("p"), w: s("w"), start: s("start"), end: s("end") });
  const action = s("action") ?? "list";
  const articleId = s("articleId") ?? "";

  if (action === "list") {
    const view = await loadWeekly(period);
    const sel = [...view.rows, ...view.extraRows].filter((r) => r.reportStatus === "selected").sort((x, y) => (x.order ?? 1e9) - (y.order ?? 1e9));
    const items = await Promise.all(sel.map(async (r, i) => ({
      articleId: r.id, order: r.order ?? i + 1, title: r.edits?.titleKo || r.titleKo || r.title, company: r.ai?.company.value || "", date: r.kstDate, country: r.detail?.country || r.country, category: r.detail?.label ?? "", url: r.url, sourceName: r.sourceName,
      entry: await getEntry(r.id),
    })));
    return NextResponse.json({ items });
  }

  const a = articleId ? await getArticle(articleId) : null;
  if (!a) return NextResponse.json({ error: "기사를 찾을 수 없습니다." }, { status: 404 });
  const ai = a.report && a.report.version === REPORT_ANALYSIS_VERSION && a.report.status !== "failed" ? a.report : null;

  if (action === "find") {
    const asked = Array.isArray(b.types) ? (b.types as unknown[]).filter((t): t is LibImageType => TYPES.includes(t as LibImageType)) : TYPES;
    const entry = await searchLibrary(a, ai, asked.length ? asked : TYPES);
    return NextResponse.json({ entry });
  }

  const entry = await getEntry(a.id);
  const img = entry.images.find((i) => i.id === s("imageId"));
  if (action === "primary") {
    if (!img) return NextResponse.json({ error: "이미지를 찾을 수 없습니다." }, { status: 404 });
    entry.primary = entry.primary === img.id ? null : img.id;
    await saveEntry(entry);
    return NextResponse.json({ entry });
  }
  if (!img) return NextResponse.json({ error: "이미지를 찾을 수 없습니다." }, { status: 404 });
  if (action === "caption") {
    const text = normalizeCaption(s("caption") ?? "");
    img.captionEdited = text || null; // 비우면 자동 캡션으로 되돌림
    await saveEntry(entry);
    const warn = text ? checkCaption(text, { title: a.title }) : { ok: true };
    return NextResponse.json({ entry, warning: warn.ok ? null : `권장 형식과 다릅니다: ${warn.reason}` });
  }
  if (action === "regen") {
    if (img.captionBasis === "fixed") return NextResponse.json({ entry });
    if (img.captionEdited && b.override !== true) return NextResponse.json({ error: "직접 수정한 캡션이 있습니다. 덮어쓰려면 확인이 필요합니다.", needsOverride: true }, { status: 409 });
    img.captionEdited = null;
    img.caption = "";
    await writeCaptions(a, ai, entry, { only: img.id, force: true });
    return NextResponse.json({ entry: await getEntry(a.id) });
  }
  return NextResponse.json({ error: "알 수 없는 요청입니다." }, { status: 400 });
}
