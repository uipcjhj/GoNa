// Builds the weekly report rows (used by both the preview and the Excel file, so they always match).
import { CAT_LABEL } from "./categories";
import type { WeeklyRow } from "./view";
import type { WeeklyCategory } from "@/lib/types";

export interface ExportRow {
  id: string; category: string; date: string; dateWarning: boolean; title: string; media: string; url: string;
  summary: string[]; summaryIsExcerpt: boolean; score?: number | null; basis?: string; solutions?: string; competitor?: string; note?: string; isDemo: boolean;
}
export interface ExportData { industry: ExportRow[]; opportunity: ExportRow[]; competitor: ExportRow[]; warnings: string[] }

const ORDER: WeeklyCategory[] = ["domestic", "global", "competitor", "policy", "tech", "opportunity"];

function dateText(r: WeeklyRow): { date: string; warn: boolean } {
  if (r.dateStatus === "verified" && r.kstDate) return { date: r.kstDate, warn: false };
  if (r.dateStatus === "search" && r.kstDate) return { date: `미확인 (검색일 ${r.kstDate})`, warn: true };
  return { date: "미확인", warn: true };
}

function summaryOf(r: WeeklyRow): string[] {
  if (r.summaryLines.length) return r.summaryIsExcerpt ? ["[원문 발췌 · AI 요약 전]", ...r.summaryLines] : r.summaryLines;
  return [r.analysis === "pending" ? "[미분석]" : "[요약 미생성 — AI 미연결]", ...(r.excerpt ? [r.excerpt.slice(0, 160)] : [])];
}

export function buildExport(rows: WeeklyRow[]): ExportData {
  const sel = rows.filter((r) => r.reportStatus === "selected");
  const base = (r: WeeklyRow, cat: string): ExportRow => {
    const d = dateText(r);
    return {
      id: r.id, category: cat, date: d.date, dateWarning: d.warn, title: r.titleKo ?? r.title, media: r.sourceName, url: r.url,
      summary: summaryOf(r), summaryIsExcerpt: r.summaryIsExcerpt, isDemo: r.isDemo,
    };
  };
  const byOrder = (a: WeeklyRow, b: WeeklyRow) => ORDER.indexOf(a.category ?? "global") - ORDER.indexOf(b.category ?? "global") || (a.publishedAt ?? "").localeCompare(b.publishedAt ?? "");

  // Sheet 1: every selected article once, under its primary (report) category
  const industry = [...sel].sort(byOrder).map((r) => base(r, `${r.isDemo ? "[DEMO] " : ""}${CAT_LABEL[r.category ?? "global"]}`));
  // Sheet 2: selected articles tied to an opportunity (intentional overlap with sheet 1)
  const opportunity = sel
    .filter((r) => r.category === "opportunity" || r.categories.includes("opportunity") || (r.oppPriority && r.oppPriority !== "GENERAL"))
    .sort((a, b) => (b.oppScore ?? 0) - (a.oppScore ?? 0))
    .map((r) => ({ ...base(r, CAT_LABEL.opportunity), score: r.oppScore, basis: r.oppWhy ?? "", solutions: r.oppSolutions.join(", ") }));
  // Sheet 3: selected competitor news, one row per article (first confirmed competitor shown, others in note)
  const competitor = sel
    .filter((r) => r.competitors.length || r.category === "competitor")
    .sort((a, b) => (a.competitors[0] ?? "").localeCompare(b.competitors[0] ?? "") || (a.publishedAt ?? "").localeCompare(b.publishedAt ?? ""))
    .map((r) => ({ ...base(r, CAT_LABEL.competitor), competitor: r.competitors.join(", ") || "확인 필요", note: [r.competitorActivity, ...r.competitorNotes].filter(Boolean).join(" / ") }));

  const warnings: string[] = [];
  const undated = sel.filter((r) => dateText(r).warn);
  if (undated.length) warnings.push(`발행일 미확인 기사 ${undated.length}건이 포함되어 있습니다 (원문에서 날짜 확인 필요): ${undated.map((r) => r.title.slice(0, 30)).join(" / ")}`);
  const outside = sel.filter((r) => r.publishedAt && !r.inPeriod);
  if (outside.length) warnings.push(`선택 기간 밖에 발행된 기사 ${outside.length}건이 포함되어 있습니다.`);
  const google = sel.filter((r) => r.viaGoogleNews);
  if (google.length) warnings.push(`Google News 경유 링크 ${google.length}건 — 클릭 시 원문으로 이동하지만 원문 URL·발행일은 자동 검증되지 않았습니다.`);
  const noAi = sel.filter((r) => r.summaryIsExcerpt);
  if (noAi.length) warnings.push(`AI 요약이 없는 기사 ${noAi.length}건은 원문 발췌로 출력됩니다 (AI 미연결).`);
  const reRep = sel.filter((r) => r.reReport);
  if (reRep.length) warnings.push(`과거 프로젝트 재보도로 판단된 기사 ${reRep.length}건 — 발표일을 확인하세요.`);
  if (sel.some((r) => r.isDemo)) warnings.push("DEMO 데이터가 포함되어 있습니다 (실제 기사 아님).");
  return { industry, opportunity, competitor, warnings };
}
