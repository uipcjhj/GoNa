import { NextResponse } from "next/server";
import { periodFromRequest } from "@/lib/weekly/api";
import { getReport, saveReport, setItem } from "@/lib/weekly/report";
import type { ReportItem, ReportStatus, WeeklyCategory } from "@/lib/types";
import { requireAdmin } from "@/lib/session";
import { getArticle } from "@/lib/db/repo";
import { REPORT_ANALYSIS_VERSION } from "@/lib/report/factcheck";

const STATUSES: ReportStatus[] = ["unreviewed", "selected", "excluded", "hold"];
const CATS: WeeklyCategory[] = ["domestic", "global", "competitor", "policy", "tech", "opportunity"];
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);

/** 보고서 상태(선정/제외/보류), 순서, 사용자 수정본(제목·구분·4줄 요약) 저장. 원본 기사 데이터는 변경하지 않음. */
export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { period, body } = await periodFromRequest(req);
  // bulk re-order: { orders: [{ id, order }] }
  if (Array.isArray(body.orders)) {
    const r = await getReport(period);
    for (const o of body.orders as { id: string; order: number }[]) {
      if (typeof o?.id === "string" && Number.isFinite(o.order) && r.items[o.id]) r.items[o.id] = { ...r.items[o.id], order: Math.round(o.order), updatedAt: new Date().toISOString() };
    }
    await saveReport(r);
    return NextResponse.json({ ok: true });
  }
  const ids = (Array.isArray(body.ids) ? body.ids : [body.articleId]).filter((x): x is string => typeof x === "string");
  if (!ids.length) return NextResponse.json({ error: "articleId 필요" }, { status: 400 });
  const status = STATUSES.includes(body.status as ReportStatus) ? (body.status as ReportStatus) : undefined;
  const category = body.category === null ? null : CATS.includes(body.category as WeeklyCategory) ? (body.category as WeeklyCategory) : undefined;
  let edits: ReportItem["edits"] | null | undefined;
  if (body.edits === null) edits = null;
  else if (body.edits && typeof body.edits === "object") {
    const e = body.edits as Record<string, unknown>;
    const lines = Array.isArray(e.summary4) ? (e.summary4 as unknown[]).map((l) => str(l, 120) ?? "").slice(0, 4) : undefined;
    edits = {
      ...(str(e.titleKo, 200) ? { titleKo: str(e.titleKo, 200) } : {}),
      ...(str(e.detailLabel, 80) ? { detailLabel: str(e.detailLabel, 80) } : {}),
      ...(lines && lines.some(Boolean) ? { summary4: [...lines, "", "", "", ""].slice(0, 4) } : {}),
      ...(typeof e.caption === "string" ? { caption: e.caption.trim().slice(0, 80) } : {}),
    };
  }
  let report;
  const approved = typeof body.approved === "boolean" ? body.approved : undefined; // 사용자 최종 승인 (원문 검증 완료와 별도)
  const approvedFor: Record<string, string> = {};
  if (approved) {
    // approval needs a 4-line summary: the user's own edit or the latest Gemini result; remembers which one was approved
    const cur = await getReport(period);
    for (const id of ids) {
      const userSummary = (edits === undefined ? cur.items[id]?.edits : edits)?.summary4?.some((l) => l.trim());
      const art = await getArticle(id);
      const ai = art?.report && art.report.version === REPORT_ANALYSIS_VERSION && art.report.summary.length === 4 && art.report.status !== "failed" ? art.report : null;
      if (!userSummary && !ai) return NextResponse.json({ error: "보고서에 쓸 4줄 요약이 없어 승인할 수 없습니다. Gemini 원문 검증을 완료하거나 요약을 입력하세요." }, { status: 400 });
      approvedFor[id] = userSummary ? "user" : ai!.analyzedAt;
    }
  }
  for (const id of ids) report = await setItem(period, id, { status, category, edits, approved, approvedFor: approvedFor[id] });
  return NextResponse.json({ ok: true, items: Object.fromEntries(ids.map((id) => [id, report!.items[id]])) });
}
