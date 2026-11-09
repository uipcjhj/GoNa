// Excel report from the company's original "업계동향리스트" workbook (templates/weekly-report.xlsx).
// The template file is copied in memory and only the needed cells are changed: column widths, row heights,
// fonts, borders, fills, alignment, merged header, frozen pane and print settings all stay as they are.
// Layout of the template: B1 title · B3:H4 header · rows from 5 = 선정 기사 · "■ 후보 탈락 리스트" section · reject rows.
import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import type { ReportArticle, ReportDoc } from "./data";

const TEMPLATE = path.join(process.cwd(), "templates", "weekly-report.xlsx");
const REL_HYPERLINK = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
// XML 1.0 forbids most control characters (keep tab / LF / CR)
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "");

interface Cell { ref: string; col: string; attrs: string; inner: string }
interface Row { r: number; attrs: string; cells: Cell[] }

function parseRows(sheetData: string): Row[] {
  const rows: Row[] = [];
  for (const m of sheetData.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const attrs = m[1];
    const r = Number(attrs.match(/\br="(\d+)"/)![1]);
    const cells: Cell[] = [];
    for (const c of (m[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = c[1].match(/\br="([A-Z]+)(\d+)"/)!;
      cells.push({ ref: ref[1] + ref[2], col: ref[1], attrs: c[1], inner: c[2] ?? "" });
    }
    rows.push({ r, attrs, cells });
  }
  return rows;
}

function sharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unesc(t[1])).join(""));
}

/** Excel serial date (1900 system) for a YYYY-MM-DD day. */
function serial(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400_000);
}

export async function buildTemplateWorkbook(doc: ReportDoc): Promise<Buffer> {
  const zip = await JSZip.loadAsync(await fs.readFile(TEMPLATE));
  const sheetPath = "xl/worksheets/sheet1.xml";
  const relsPath = "xl/worksheets/_rels/sheet1.xml.rels";
  let sheet = await zip.file(sheetPath)!.async("string");
  const oldStrings = sharedStrings(await zip.file("xl/sharedStrings.xml")!.async("string"));

  const sdStart = sheet.indexOf("<sheetData>");
  const sdEnd = sheet.indexOf("</sheetData>");
  const rows = parseRows(sheet.slice(sdStart + "<sheetData>".length, sdEnd));
  const byNum = new Map(rows.map((r) => [r.r, r]));
  const textOf = (c: Cell) => (/\bt="s"/.test(c.attrs) ? oldStrings[Number(c.inner.match(/<v>(\d+)<\/v>/)?.[1] ?? -1)] ?? "" : "");
  // locate the template's blocks
  const sectionRow = rows.find((r) => r.cells.some((c) => c.col === "B" && textOf(c).includes("후보 탈락")));
  if (!sectionRow) throw new Error("Excel 템플릿 구조를 찾을 수 없습니다 (후보 탈락 리스트 행).");
  const itemProto = byNum.get(5)!;
  const rejectProto = byNum.get(sectionRow.r + 1)!;
  const lastRow = rows[rows.length - 1];
  const trailerProto = lastRow.r > rejectProto.r && !lastRow.cells.some((c) => c.col === "B" && c.inner) ? lastRow : null;

  // new shared string table: header strings kept, everything else rebuilt (no leftovers from the template week)
  const strings: string[] = [];
  const sIndex = new Map<string, number>();
  const str = (s: string) => {
    const v = clean(s);
    if (!sIndex.has(v)) { sIndex.set(v, strings.length); strings.push(v); }
    return sIndex.get(v)!;
  };
  const links: { ref: string; url: string }[] = [];

  const cellXml = (c: Cell, rowNum: number, value: { s?: string; n?: number } | null) => {
    const ref = `${c.col}${rowNum}`;
    const attrs = c.attrs.replace(/\br="[A-Z]+\d+"/, `r="${ref}"`).replace(/\s*\bt="[^"]*"/, "");
    if (!value) return `<c${attrs}/>`;
    if (value.n !== undefined) return `<c${attrs}><v>${value.n}</v></c>`;
    return `<c${attrs} t="s"><v>${str(value.s ?? "")}</v></c>`;
  };
  const rowXml = (proto: Row, rowNum: number, cell: (c: Cell) => { s?: string; n?: number } | null) =>
    `<row${proto.attrs.replace(/\br="\d+"/, `r="${rowNum}"`)}>${proto.cells.map((c) => cellXml(c, rowNum, cell(c))).join("")}</row>`;
  const keep = (c: Cell): { s?: string; n?: number } | null => {
    if (/\bt="s"/.test(c.attrs)) return { s: textOf(c) };
    const v = c.inner.match(/<v>([^<]*)<\/v>/)?.[1];
    return v !== undefined ? { n: Number(v) } : null;
  };

  const articleCell = (a: ReportArticle, n: number, rowNum: number) => (c: Cell): { s?: string; n?: number } | null => {
    switch (c.col) {
      case "B": return { n };
      case "C": return { s: a.label };
      case "D": return a.date ? { n: serial(a.date) } : { s: "미확인" };
      case "E": if (a.url) links.push({ ref: `E${rowNum}`, url: a.url }); return { s: a.title };
      case "F": return { s: a.media };
      case "G": return { s: a.summary.filter(Boolean).join("\n") };
      case "H": if (a.url) links.push({ ref: `H${rowNum}`, url: a.url }); return { s: a.url };
      default: return null;
    }
  };

  const out: string[] = [];
  // rows 1–4 (title + header) unchanged except the week in the title
  for (const r of rows.filter((x) => x.r < itemProto.r)) {
    out.push(rowXml(r, r.r, (c) => {
      const k = keep(c);
      if (r.r === 1 && c.col === "B" && k?.s) return { s: k.s.replace(/_[^_]*$/, () => `_${doc.weekTitle}`) };
      return k;
    }));
  }
  let rowNum = itemProto.r;
  doc.items.forEach((a, i) => { out.push(rowXml(itemProto, rowNum, articleCell(a, i + 1, rowNum))); rowNum++; });
  const merges: string[] = [];
  if (doc.rejects.length) {
    out.push(rowXml(sectionRow, rowNum, keep));
    // the template merges B:C on the section row
    merges.push(`B${rowNum}:C${rowNum}`);
    rowNum++;
    doc.rejects.forEach((a, i) => { out.push(rowXml(rejectProto, rowNum, articleCell(a, i + 1, rowNum))); rowNum++; });
  }
  if (trailerProto) { out.push(rowXml(trailerProto, rowNum, () => null)); rowNum++; }
  const lastUsed = rowNum - 1;

  sheet = sheet.slice(0, sdStart) + `<sheetData>${out.join("")}</sheetData>` + sheet.slice(sdEnd + "</sheetData>".length);
  // merged cells: keep the header merges, move the section merge
  const keptMerges = [...sheet.matchAll(/<mergeCell ref="([^"]+)"\/>/g)].map((m) => m[1]).filter((ref) => Number(ref.match(/\d+/)![0]) < itemProto.r);
  const allMerges = [...keptMerges, ...merges];
  sheet = sheet.replace(/<mergeCells[^>]*>[\s\S]*?<\/mergeCells>/, `<mergeCells count="${allMerges.length}">${allMerges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>`);
  sheet = sheet.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:AD${Math.max(lastUsed, 4)}"/>`);
  // open at the top (the template was saved scrolled down); frozen pane kept
  sheet = sheet.replace(/(<sheetView\b[^>]*?)\stopLeftCell="[^"]*"/, "$1");

  // hyperlinks: drop the template's, add one per title + URL cell
  let rels = await zip.file(relsPath)!.async("string");
  rels = rels.replace(/<Relationship\b[^>]*Type="[^"]*\/hyperlink"[^>]*\/>/g, "");
  const relIds = [...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => Number(m[1]));
  let next = Math.max(0, ...relIds) + 1;
  const hl: string[] = [];
  const newRels: string[] = [];
  for (const l of links) {
    const id = `rId${next++}`;
    newRels.push(`<Relationship Id="${id}" Type="${REL_HYPERLINK}" Target="${esc(clean(l.url))}" TargetMode="External"/>`);
    hl.push(`<hyperlink ref="${l.ref}" r:id="${id}"/>`);
  }
  rels = rels.replace("</Relationships>", () => `${newRels.join("")}</Relationships>`);
  sheet = sheet.replace(/<hyperlinks>[\s\S]*?<\/hyperlinks>/, "");
  if (hl.length) sheet = sheet.replace(/(<pageMargins\b)/, `<hyperlinks>${hl.join("")}</hyperlinks>$1`);
  zip.file(relsPath, rels, { createFolders: false });
  zip.file(sheetPath, sheet, { createFolders: false });

  // shared strings rebuilt (template week text removed)
  const sst = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings
    .map((s) => `<si><t xml:space="preserve">${esc(s)}</t></si>`)
    .join("")}</sst>`;
  zip.file("xl/sharedStrings.xml", sst, { createFolders: false });

  // sheet tab name = week title (e.g. "11월 2주차")
  const tab = esc(doc.weekTitle.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
  zip.file("xl/workbook.xml", (await zip.file("xl/workbook.xml")!.async("string")).replace(/(<sheet\b[^>]*\bname=")[^"]*"/, (_m, a: string) => `${a}${tab}"`), { createFolders: false });
  const app = zip.file("docProps/app.xml");
  if (app) zip.file("docProps/app.xml", (await app.async("string")).replace(/(<TitlesOfParts>[\s\S]*?<vt:lpstr>)[^<]*(<\/vt:lpstr>)/, (_m, a: string, b: string) => a + tab + b), { createFolders: false });
  const core = zip.file("docProps/core.xml");
  if (core) zip.file("docProps/core.xml", (await core.async("string")).replace(/(<dcterms:modified[^>]*>)[^<]*(<\/dcterms:modified>)/, `$1${new Date().toISOString().replace(/\.\d+Z$/, "Z")}$2`), { createFolders: false });

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
