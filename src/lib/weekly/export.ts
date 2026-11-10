// Weekly report rows (shared by the preview and the Excel file so they always match).
// Sheet 1 주간 업계동향 (선정 기사, 보고서 순서) · Sheet 2 후보 탈락 리스트 · Sheet 3 잠재 수주기회.
import type { Curation } from "@/lib/types";
import type { WeeklyRow } from "./view";
import { ORDER_ROOM_LABEL, SUPPLIER_LABEL } from "./taxonomy";

export interface ExportRow {
  id: string; order: number; label: string; date: string; dateWarning: boolean; title: string; media: string; url: string;
  summary: string[]; summaryNote: string | null; isDemo: boolean;
  quality: { aiStatus: WeeklyRow["aiStatus"]; aiDone: boolean; dateVerified: boolean; sourceLevel: WeeklyRow["gate"]["sourceLevel"]; linkDirect: boolean; approved: boolean; edited: boolean; problems: string[] };
  reason?: string; score?: number | null; supplier?: string; orderRoom?: string; solutions?: string;
}
export interface ExportData { report: ExportRow[]; rejects: ExportRow[]; opportunities: ExportRow[]; warnings: string[] }

const dateOf = (r: WeeklyRow) => (r.dateStatus === "verified" && r.kstDate ? { date: r.kstDate, warn: false } : { date: "미확인", warn: true });

export const NO_SUMMARY = "[검토 필요] Gemini 원문 검증 요약 없음 — 원문 확인 후 요약 입력";

/** The 4 report lines: the user's edit first, then the validated Gemini summary. Rule-generated text is never used. */
export function reportLines(r: WeeklyRow): string[] {
  const src = r.edits?.summary4?.some(Boolean) ? r.edits.summary4 : r.summary4.length === 4 ? r.summary4 : null;
  if (!src) return [NO_SUMMARY, "", "", ""];
  return [...src.map((l) => l.trim()), "", "", "", ""].slice(0, 4);
}
export const reportTitle = (r: WeeklyRow) => r.edits?.titleKo || r.titleKo || r.title;
export const reportLabel = (r: WeeklyRow) => r.edits?.detailLabel || r.detail?.label || "확인 필요";

function base(r: WeeklyRow, order: number): ExportRow {
  const d = dateOf(r);
  return {
    id: r.id, order, label: reportLabel(r), date: d.date, dateWarning: d.warn, title: reportTitle(r), media: r.sourceName, url: r.url,
    summary: reportLines(r), summaryNote: r.edits?.summary4 ? "사용자 수정" : r.summary4.length === 4 ? (r.aiStatus === "done" ? "Gemini 원문 검증" : "Gemini 요약 — 검토 필요") : "요약 없음 (AI 분석 필요)", isDemo: r.isDemo,
    quality: { aiStatus: r.aiStatus, aiDone: r.gate.aiDone, dateVerified: r.gate.dateVerified, sourceLevel: r.gate.sourceLevel, linkDirect: r.gate.linkDirect, approved: r.gate.approved, edited: Boolean(r.edits?.summary4?.some(Boolean)), problems: r.gate.problems },
  };
}

export function buildExport(rows: WeeklyRow[], curation: Curation | null): ExportData {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const selected = rows.filter((r) => r.reportStatus === "selected").sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999) || (b.relevance ?? 0) - (a.relevance ?? 0));
  const report = selected.map((r, i) => base(r, i + 1));

  const rejects = (curation?.rejects ?? [])
    .map((x) => ({ x, r: byId.get(x.articleId) }))
    .filter((v): v is { x: Curation["rejects"][number]; r: WeeklyRow } => Boolean(v.r) && v.r!.reportStatus !== "selected")
    .slice(0, 10)
    .map(({ x, r }, i) => ({ ...base(r, i + 1), reason: x.monitoring ? `${x.reason} (모니터링 가치 있음)` : x.reason }));

  // 잠재 수주기회: report/candidate articles linked to an opportunity or with a new-project order window
  const candidateIds = new Set([...selected.map((r) => r.id), ...(curation?.picks ?? []).map((p) => p.articleId), ...(curation?.rejects ?? []).map((p) => p.articleId)]);
  const opportunities = rows
    .filter((r) => candidateIds.has(r.id) && r.detail?.group !== "competitor" && ((r.oppScore ?? 0) >= 45 || r.judgment?.winPotential === "high" || (r.judgment?.isNewProject && r.judgment.orderRoom === "yes")))
    .sort((a, b) => (b.oppScore ?? 0) - (a.oppScore ?? 0))
    .slice(0, 15)
    .map((r, i) => ({
      ...base(r, i + 1),
      score: r.oppScore,
      supplier: r.judgment ? SUPPLIER_LABEL[r.judgment.supplierStatus] : "공급사 확인 불가",
      orderRoom: r.judgment ? ORDER_ROOM_LABEL[r.judgment.orderRoom] : "미확인",
      solutions: r.oppSolutions.join(", ") || "—",
    }));

  const warnings: string[] = [];
  if (curation && report.length !== curation.target) warnings.push(`선정 기사 ${report.length}건 (기준 ${curation.target}건).`);
  const undated = selected.filter((r) => dateOf(r).warn);
  if (undated.length) warnings.push(`발행일 미확인 기사 ${undated.length}건이 선정되어 있습니다 — 원문에서 날짜를 확인하세요: ${undated.map((r) => reportTitle(r).slice(0, 24)).join(" / ")}`);
  const outside = selected.filter((r) => r.publishedAt && !r.inPeriod);
  if (outside.length) warnings.push(`조사 기간 밖에 발행된 기사 ${outside.length}건이 선정되어 있습니다.`);
  const noAi = selected.filter((r) => !r.gate.aiDone);
  if (noAi.length) warnings.push(`Gemini 원문 검증이 완료되지 않은 기사 ${noAi.length}건 (분석 전·실패·원문 부족·검토 필요) — 요약 확인 후 승인하세요.`);
  const noSummary = selected.filter((r) => !r.edits?.summary4?.some(Boolean) && r.summary4.length !== 4);
  if (noSummary.length) warnings.push(`4줄 요약이 없는 기사 ${noSummary.length}건 — Excel/PPT에 '[검토 필요]'로 표시됩니다.`);
  const unapproved = selected.filter((r) => !r.gate.approved);
  if (unapproved.length) warnings.push(`사용자 최종 승인 전 기사 ${unapproved.length}건.`);
  const unknownCat = selected.filter((r) => reportLabel(r) === "확인 필요");
  if (unknownCat.length) warnings.push(`구분이 '확인 필요'인 기사 ${unknownCat.length}건.`);
  if (selected.some((r) => r.isDemo)) warnings.push("DEMO 데이터가 포함되어 있습니다 (실제 기사 아님).");
  return { report, rejects, opportunities, warnings };
}
