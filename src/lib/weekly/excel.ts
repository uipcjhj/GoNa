import "server-only";
import ExcelJS from "exceljs";
import type { ExportData, ExportRow } from "./export";

const NAVY = "FF0B2A4A";
const BORDER = { style: "thin" as const, color: { argb: "FFD0D7E2" } };

type Col = { h: string; w: number; v: (r: ExportRow) => ExcelJS.CellValue; link?: boolean; center?: boolean };

const link = (text: string, r: ExportRow): ExcelJS.CellValue => (r.isDemo ? `${text} (DEMO·원문 없음)` : { text, hyperlink: r.url, tooltip: "원문 열기" });

function sheet(wb: ExcelJS.Workbook, name: string, title: string, cols: Col[], rows: ExportRow[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 2 }] });
  ws.mergeCells(1, 1, 1, cols.length);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { bold: true, size: 13, color: { argb: NAVY } };
  ws.getRow(1).height = 26;
  const hr = ws.getRow(2);
  cols.forEach((c, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = c.h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10.5 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
    ws.getColumn(i + 1).width = c.w;
  });
  hr.height = 24;
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } };
  for (const r of rows) {
    const row = ws.addRow(cols.map((c) => c.v(r)));
    row.eachCell({ includeEmpty: true }, (cell, n) => {
      const c = cols[n - 1];
      cell.alignment = { vertical: "middle", wrapText: true, horizontal: c?.center ? "center" : "left" };
      cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
      cell.font = c?.link && !r.isDemo ? { color: { argb: "FF0563C1" }, underline: true, size: 10 } : { size: 10 };
    });
    const dateCol = cols.findIndex((c) => c.h === "일자");
    if (r.dateWarning && dateCol >= 0) row.getCell(dateCol + 1).font = { color: { argb: "FFB45309" }, size: 10 };
    row.height = 78; // 4 summary lines
  }
  if (!rows.length) ws.addRow(["해당 기사 없음"]);
  return ws;
}

const common: Col[] = [
  { h: "순서", w: 6, v: (r) => r.order, center: true },
  { h: "구분", w: 26, v: (r) => r.label },
  { h: "일자", w: 12, v: (r) => r.date, center: true },
  { h: "제목", w: 44, v: (r) => link(r.title, r), link: true },
  { h: "언론사", w: 16, v: (r) => r.media },
  { h: "내용 요약", w: 54, v: (r) => r.summary.join("\n") },
  { h: "링크", w: 30, v: (r) => link(r.url, r), link: true },
];

export async function buildWeeklyWorkbook(d: ExportData, periodLabel: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Global Opportunity Radar";
  wb.created = new Date();
  sheet(wb, "주간 업계동향", `주간 업계동향 — ${periodLabel}`, common, d.report);
  sheet(wb, "후보 탈락 리스트", `후보 탈락 리스트 — ${periodLabel}`, [...common, { h: "후보 사유", w: 26, v: (r) => r.reason ?? "" }], d.rejects);
  sheet(wb, "잠재 수주기회", `잠재 수주기회 — ${periodLabel} (점수는 수주 확률이 아닌 검토 우선순위)`, [
    ...common,
    { h: "수주기회 점수", w: 11, v: (r) => r.score ?? null, center: true },
    { h: "공급사 확정 여부", w: 18, v: (r) => r.supplier ?? "" },
    { h: "발주 여지", w: 11, v: (r) => r.orderRoom ?? "", center: true },
    { h: "연관 솔루션", w: 26, v: (r) => r.solutions ?? "" },
  ], d.opportunities);
  if (d.warnings.length) {
    const ws = wb.addWorksheet("확인 필요");
    ws.getColumn(1).width = 120;
    ws.addRow(["출력 전 확인 사항"]).font = { bold: true, color: { argb: NAVY } };
    for (const w of d.warnings) ws.addRow([`• ${w}`]).alignment = { wrapText: true };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
