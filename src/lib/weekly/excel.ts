import "server-only";
import ExcelJS from "exceljs";
import type { ExportData, ExportRow } from "./export";

const NAVY = "FF0B2A4A";
const BORDER = { style: "thin" as const, color: { argb: "FFD0D7E2" } };

function summaryRich(r: ExportRow): ExcelJS.CellRichTextValue {
  const parts: ExcelJS.RichText[] = [];
  r.summary.forEach((line, i) => {
    const last = i === r.summary.length - 1 && line.trim().startsWith("⇒");
    const note = line.startsWith("[");
    parts.push({ text: (i ? "\n" : "") + line, font: last ? { bold: true, color: { argb: NAVY }, size: 10 } : note ? { italic: true, color: { argb: "FF8A6D00" }, size: 9 } : { size: 10 } });
  });
  return { richText: parts };
}

function sheet(wb: ExcelJS.Workbook, name: string, title: string, cols: { h: string; w: number; v: (r: ExportRow) => ExcelJS.CellValue; link?: boolean; center?: boolean }[], rows: ExportRow[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 2 }], properties: { defaultRowHeight: 18 } });
  ws.mergeCells(1, 1, 1, cols.length);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { bold: true, size: 13, color: { argb: NAVY } };
  ws.getRow(1).height = 24;
  const hr = ws.getRow(2);
  cols.forEach((c, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = c.h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
    ws.getColumn(i + 1).width = c.w;
  });
  hr.height = 22;
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } };
  for (const r of rows) {
    const row = ws.addRow(cols.map((c) => c.v(r)));
    row.eachCell({ includeEmpty: true }, (cell, n) => {
      const c = cols[n - 1];
      cell.alignment = { vertical: "top", wrapText: true, horizontal: c?.center ? "center" : "left" };
      cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
      if (c?.link && !r.isDemo) cell.font = { color: { argb: "FF0563C1" }, underline: true, size: 10 };
    });
    if (r.dateWarning) row.getCell(cols.findIndex((c) => c.h === "날짜") + 1).font = { color: { argb: "FFB45309" }, size: 10 };
    row.height = Math.max(60, 15 * (r.summary.length + 1));
  }
  if (!rows.length) ws.addRow(["해당 기사 없음"]);
  return ws;
}

const link = (text: string, r: ExportRow): ExcelJS.CellValue => (r.isDemo ? `${text} (DEMO·원문 없음)` : { text, hyperlink: r.url, tooltip: "원문 열기" });

export async function buildWeeklyWorkbook(d: ExportData, periodLabel: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Global Opportunity Radar";
  wb.created = new Date();
  sheet(wb, "주간 업계동향", `주간 업계동향 — ${periodLabel}`, [
    { h: "카테고리", w: 15, v: (r) => r.category, center: true },
    { h: "날짜", w: 13, v: (r) => r.date, center: true },
    { h: "제목", w: 46, v: (r) => link(r.title, r), link: true },
    { h: "매체", w: 16, v: (r) => r.media },
    { h: "링크", w: 34, v: (r) => link(r.url, r), link: true },
    { h: "요약", w: 62, v: (r) => summaryRich(r) },
  ], d.industry);
  sheet(wb, "잠재 수주기회", `잠재 수주기회 — ${periodLabel} (점수는 우선순위 지표이며 수주 확률이 아님)`, [
    { h: "카테고리", w: 13, v: (r) => r.category, center: true },
    { h: "날짜", w: 13, v: (r) => r.date, center: true },
    { h: "제목", w: 42, v: (r) => link(r.title, r), link: true },
    { h: "매체", w: 15, v: (r) => r.media },
    { h: "링크", w: 30, v: (r) => link(r.url, r), link: true },
    { h: "요약", w: 55, v: (r) => summaryRich(r) },
    { h: "수주기회 점수", w: 11, v: (r) => r.score ?? null, center: true },
    { h: "판단 근거", w: 45, v: (r) => r.basis ?? "" },
    { h: "연관 솔루션", w: 26, v: (r) => r.solutions ?? "" },
  ], d.opportunity);
  sheet(wb, "경쟁사 동향", `경쟁사 동향 — ${periodLabel}`, [
    { h: "경쟁사", w: 16, v: (r) => r.competitor ?? "", center: true },
    { h: "날짜", w: 13, v: (r) => r.date, center: true },
    { h: "제목", w: 44, v: (r) => link(r.title, r), link: true },
    { h: "매체", w: 15, v: (r) => r.media },
    { h: "링크", w: 30, v: (r) => link(r.url, r), link: true },
    { h: "요약", w: 55, v: (r) => summaryRich(r) },
    { h: "비고", w: 30, v: (r) => r.note ?? "" },
  ], d.competitor);
  if (d.warnings.length) {
    const ws = wb.addWorksheet("확인 필요");
    ws.getColumn(1).width = 120;
    ws.addRow(["출력 전 확인 사항"]).font = { bold: true, color: { argb: NAVY } };
    for (const w of d.warnings) ws.addRow([`• ${w}`]).alignment = { wrapText: true };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
