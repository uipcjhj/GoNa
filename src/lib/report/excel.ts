import "server-only";
import ExcelJS from "exceljs";
import type { Article, Opportunity } from "@/lib/types";
import { localDateStr } from "@/lib/util/week";

const CAT_LABEL: Record<string, string> = { opportunity: "수주기회", competitor: "경쟁사 동향", industry: "업계 동향", irrelevant: "기타" };
const ORDER: Record<string, number> = { opportunity: 0, competitor: 1, industry: 2, irrelevant: 3 };

export async function buildWeeklyExcel(articles: Article[], opps: Map<string, Opportunity>, periodLabel: string, tz: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Global Opportunity Radar";
  wb.created = new Date();
  const ws = wb.addWorksheet("주간동향", { views: [{ state: "frozen", ySplit: 3 }] });

  ws.mergeCells("A1:H1");
  ws.getCell("A1").value = `글로벌 물류자동화 주간동향 — ${periodLabel}`;
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF0B2A4A" } };
  ws.mergeCells("A2:H2");
  ws.getCell("A2").value = "Opportunity Score는 실제 수주 확률이 아니라 영업기회 탐색을 위한 우선순위 지표입니다. AI 분석 내용은 원문 확인이 필요합니다.";
  ws.getCell("A2").font = { italic: true, size: 9, color: { argb: "FF666666" } };

  const headers = ["Category", "Date", "Title", "Media", "URL", "Summary", "Opportunity Score", "Why It Matters"];
  const widths = [13, 12, 48, 20, 40, 70, 12, 50];
  const hr = ws.getRow(3);
  headers.forEach((h, i) => {
    const c = hr.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B2A4A" } };
    c.alignment = { vertical: "middle", horizontal: "center" };
    ws.getColumn(i + 1).width = widths[i];
  });
  hr.height = 22;
  ws.autoFilter = { from: "A3", to: "H3" };

  const sorted = [...articles].sort((a, b) => {
    const ca = a.analysis?.category ?? "industry";
    const cb = b.analysis?.category ?? "industry";
    const sa = (a.opportunityId ? opps.get(a.opportunityId)?.score : undefined) ?? a.analysis?.score ?? 0;
    const sb = (b.opportunityId ? opps.get(b.opportunityId)?.score : undefined) ?? b.analysis?.score ?? 0;
    return (ORDER[ca] ?? 9) - (ORDER[cb] ?? 9) || sb - sa;
  });

  for (const a of sorted) {
    const opp = a.opportunityId ? opps.get(a.opportunityId) : undefined;
    let cat = a.analysis?.category ?? "industry";
    if (cat !== "opportunity" && a.competitors.length) cat = "competitor";
    const score = opp?.score ?? a.analysis?.score ?? null;
    const summary = (a.analysis?.summaryKo ?? []).slice(0, 5).map((s) => `• ${s}`).join("\n") || a.excerpt || "";
    const label = cat === "competitor" && a.competitors.length ? `경쟁사 동향 (${a.competitors.join(", ")})` : CAT_LABEL[cat];
    const row = ws.addRow([
      a.isDemo ? `[DEMO] ${label}` : label,
      a.publishedAt ? localDateStr(a.publishedAt, tz) : "날짜 미확인",
      { text: a.title, hyperlink: a.url, tooltip: "원문 열기" },
      a.sourceName,
      { text: a.url, hyperlink: a.url },
      summary,
      score,
      opp?.whyItMatters ?? a.analysis?.whyItMatters ?? "",
    ]);
    row.alignment = { vertical: "top", wrapText: true };
    row.getCell(3).font = { color: { argb: "FF0563C1" }, underline: true, bold: cat === "opportunity" };
    row.getCell(5).font = { color: { argb: "FF0563C1" }, underline: true, size: 9 };
    row.getCell(7).alignment = { vertical: "top", horizontal: "center" };
    const fill =
      cat === "opportunity" ? (score != null && score >= 80 ? "FFFFE4D6" : "FFFFF4E0") : cat === "competitor" ? "FFE8F0FE" : null;
    if (fill) for (let i = 1; i <= 8; i++) row.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    if (cat === "opportunity") row.getCell(1).font = { bold: true, color: { argb: "FFC2410C" } };
    for (let i = 1; i <= 8; i++) row.getCell(i).border = { bottom: { style: "thin", color: { argb: "FFDDDDDD" } } };
  }

  // Legend
  const lg = wb.addWorksheet("범례");
  lg.addRows([
    ["구분", "설명"],
    ["수주기회", "공장 신설·물류센터 투자 등 잠재 수주기회 (주황색 강조, 진한 주황 = HOT 80점 이상)"],
    ["경쟁사 동향", "Daifuku, Dematic, SSI Schäfer, KNAPP, Vanderlande, Swisslog 관련 기사 (파란색)"],
    ["업계 동향", "일반 산업 동향"],
    ["Opportunity Score", "0~100, 실제 수주 확률이 아닌 우선순위 지표"],
  ]);
  lg.getColumn(1).width = 20;
  lg.getColumn(2).width = 90;
  lg.getRow(1).font = { bold: true };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
