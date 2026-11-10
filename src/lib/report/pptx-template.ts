// PowerPoint report from the company's original "업계동향" deck (templates/weekly-report.pptx).
// The template package is copied in memory and edited at the XML level, so masters, layouts, embedded fonts,
// backgrounds, shapes, colours, positions and the cover artwork stay exactly as designed.
//   slide 1  표지          → month/year + Vol. only
//   slide 2  전체 기사 List → NO · 구분 · 기사 제목 (title → article URL, NO → jump to the article slide)
//   slide 3+ 기사 본문      → 2 articles per slide: 구분 bar, title | 언론사 (→ URL), 4-line summary, photo + caption
// More than 12 articles → extra list / body slides cloned from the template; odd count → the unused half is removed.
import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { randomInt } from "node:crypto";
import JSZip from "jszip";
import sharp from "sharp";
import type { ReportArticle, ReportDoc } from "./data";
import { checkArticleFit, type FitIssue } from "./fit";
import { getAsset } from "./assets";

const TEMPLATE = path.join(process.cwd(), "templates", "weekly-report.pptx");
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const T = { slide: `${R}/slide`, notes: `${R}/notesSlide`, layout: `${R}/slideLayout`, link: `${R}/hyperlink`, image: `${R}/image`, notesMaster: `${R}/notesMaster` };
const CT_SLIDE = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";
const CT_NOTES = "application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml";
const PER_LIST = 12;
const EMU_PER_PX = 9525;

const esc = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

// ---------------------------------------------------------------- relationships
interface Rel { id: string; type: string; target: string; external: boolean }
function parseRels(xml: string): Rel[] {
  return [...xml.matchAll(/<Relationship\b([^>]*)\/>/g)].map((m) => {
    const a = (k: string) => m[1].match(new RegExp(`\\b${k}="([^"]*)"`))?.[1] ?? "";
    return { id: a("Id"), type: a("Type"), target: unesc(a("Target")), external: a("TargetMode") === "External" };
  });
}
const relsXml = (rels: Rel[]) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels
    .map((r) => `<Relationship Id="${r.id}" Type="${r.type}" Target="${esc(r.target)}"${r.external ? ' TargetMode="External"' : ""}/>`)
    .join("")}</Relationships>`;
function addRel(rels: Rel[], type: string, target: string, external = false): string {
  const n = Math.max(0, ...rels.map((r) => Number(r.id.replace(/\D/g, "")) || 0)) + 1;
  const id = `rId${n}`;
  rels.push({ id, type, target, external });
  return id;
}

// ---------------------------------------------------------------- shapes
interface Shape { tag: string; start: number; end: number; xml: string; x: number; y: number; w: number; h: number; text: string; txBox: boolean; navy: boolean; id: number }
function shapesOf(slide: string): Shape[] {
  const open = slide.indexOf("<p:spTree>");
  const close = slide.lastIndexOf("</p:spTree>");
  const out: Shape[] = [];
  const re = /<p:(sp|pic|grpSp|cxnSp|graphicFrame|contentPart)\b/g;
  let i = open;
  for (;;) {
    re.lastIndex = i;
    const m = re.exec(slide);
    if (!m || m.index >= close) break;
    const tag = m[1];
    const tre = new RegExp(`<p:${tag}\\b|</p:${tag}>`, "g");
    tre.lastIndex = m.index;
    let depth = 0;
    let end = -1;
    for (let mm = tre.exec(slide); mm; mm = tre.exec(slide)) {
      if (mm[0].startsWith("</")) { if (--depth === 0) { end = mm.index + mm[0].length; break; } } else depth++;
    }
    if (end < 0) break;
    const xml = slide.slice(m.index, end);
    const off = xml.match(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/);
    const ext = xml.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/);
    out.push({
      tag, start: m.index, end, xml,
      x: Number(off?.[1] ?? 0), y: Number(off?.[2] ?? 0), w: Number(ext?.[1] ?? 0), h: Number(ext?.[2] ?? 0),
      text: [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => unesc(t[1])).join(""),
      txBox: /txBox="1"/.test(xml),
      navy: /<\/a:prstGeom><a:solidFill><a:srgbClr val="002060"\/>/.test(xml),
      id: Number(xml.match(/<p:cNvPr id="(\d+)"/)?.[1] ?? 0),
    });
    i = end;
  }
  return out;
}

/** Apply shape edits (replace / remove / insert-after) in one pass, back to front. */
type Edit = { s: Shape; xml: string | null; after?: string };
function applyEdits(slide: string, edits: Edit[]): string {
  for (const e of [...edits].sort((a, b) => b.s.start - a.s.start)) {
    const repl = (e.xml === null ? "" : e.xml) + (e.after ?? "");
    slide = slide.slice(0, e.s.start) + repl + slide.slice(e.s.end);
  }
  return slide;
}

// ---------------------------------------------------------------- text helpers
const PPR = /<a:pPr\b[^>]*\/>|<a:pPr\b[^>]*>[\s\S]*?<\/a:pPr>/;
const RPR = /<a:rPr\b[^>]*\/>|<a:rPr\b[^>]*>[\s\S]*?<\/a:rPr>/;
const ENDP = /<a:endParaRPr\b[^>]*\/>|<a:endParaRPr\b[^>]*>[\s\S]*?<\/a:endParaRPr>/;
const parasOf = (xml: string) => xml.match(/<a:p>[\s\S]*?<\/a:p>/g) ?? [];
const runsOf = (p: string) => [...p.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)].map((m) => ({ rPr: m[1].match(RPR)?.[0] ?? "<a:rPr/>", text: unesc(m[1].match(/<a:t>([^<]*)<\/a:t>/)?.[1] ?? "") }));

/** Normalize a run property: drop spell-check flags and any old hyperlink, optionally add a new one. */
function rPrWith(rPr: string, link: { rid: string; jump?: boolean } | null): string {
  let x = rPr.replace(/\s(err|dirty|smtClean)="[^"]*"/g, "").replace(/<a:hlinkClick\b[^>]*\/>|<a:hlinkClick\b[^>]*>[\s\S]*?<\/a:hlinkClick>/g, "");
  if (!link) return x;
  const h = `<a:hlinkClick r:id="${link.rid}"${link.jump ? ' action="ppaction://hlinksldjump"' : ""}/>`;
  if (/\/>$/.test(x) && !/<\/a:rPr>$/.test(x)) x = x.replace(/\/>$/, ">") + "</a:rPr>";
  const at = x.search(/<a:rtl\b|<a:extLst\b|<\/a:rPr>/);
  return x.slice(0, at) + h + x.slice(at);
}
const run = (rPr: string, text: string) => `<a:r>${rPr}<a:t>${esc(text)}</a:t></a:r>`;
const para = (pPr: string, runs: string, endP = "") => `<a:p>${pPr}${runs}${endP}</a:p>`;

/** Replace all paragraphs of a shape's (or cell's) text body. */
function setParas(xml: string, paras: string[]): string {
  const startBody = xml.indexOf("<p:txBody>") >= 0 ? xml.indexOf("<p:txBody>") : xml.indexOf("<a:txBody>");
  const first = xml.indexOf("<a:p>", startBody);
  const endTag = xml.indexOf("</p:txBody>") >= 0 ? xml.indexOf("</p:txBody>") : xml.indexOf("</a:txBody>");
  if (startBody < 0 || first < 0 || endTag < 0) return xml;
  return xml.slice(0, first) + paras.join("") + xml.slice(endTag);
}

/** Single-paragraph text with the template's first-run formatting. Leading spaces of the template text are kept. */
function setSimpleText(xml: string, text: string, link: { rid: string; jump?: boolean } | null = null): string {
  const p = parasOf(xml)[0] ?? "<a:p></a:p>";
  const rs = runsOf(p);
  const lead = rs[0]?.text.match(/^\s*/)?.[0] ?? "";
  const rPr = rs[0]?.rPr ?? (p.match(ENDP)?.[0] ?? "<a:endParaRPr/>").replace(/^<a:endParaRPr/, "<a:rPr").replace(/<\/a:endParaRPr>$/, "</a:rPr>");
  return setParas(xml, [para(p.match(PPR)?.[0] ?? "", text ? run(rPrWith(rPr, link), lead + text) : "", p.match(ENDP)?.[0] ?? "")]);
}

// ---------------------------------------------------------------- images
async function fitImage(assetId: string, fit: "cover" | "contain", boxW: number, boxH: number): Promise<{ buf: Buffer; ext: "jpeg" | "png"; w: number; h: number; dx: number; dy: number } | null> {
  const a = await getAsset(assetId);
  if (!a) return null;
  const pxW = Math.min(1400, Math.round((boxW / EMU_PER_PX) * 2));
  const pxH = Math.min(1400, Math.round((boxH / EMU_PER_PX) * 2));
  if (fit === "cover") {
    // fill the template photo box; crop the overflow keeping the most salient area (aspect ratio never distorted)
    const buf = await sharp(a.buf).resize(pxW, pxH, { fit: "cover", position: sharp.strategy.attention }).jpeg({ quality: 86 }).toBuffer();
    return { buf, ext: "jpeg", w: boxW, h: boxH, dx: 0, dy: 0 };
  }
  // logos / graphics: whole image, centred, 80 % of the box, original aspect ratio
  const meta = await sharp(a.buf).metadata();
  const ratio = (meta.width ?? 1) / (meta.height ?? 1);
  let w = boxW * 0.8, h = w / ratio;
  if (h > boxH * 0.8) { h = boxH * 0.8; w = h * ratio; }
  const png = a.mime === "image/png";
  const img = sharp(a.buf).resize(Math.round((w / EMU_PER_PX) * 2), Math.round((h / EMU_PER_PX) * 2), { fit: "inside" });
  const buf = png ? await img.png().toBuffer() : await img.jpeg({ quality: 88 }).toBuffer();
  return { buf, ext: png ? "png" : "jpeg", w: Math.round(w), h: Math.round(h), dx: Math.round((boxW - w) / 2), dy: Math.round((boxH - h) / 2) };
}

const picXml = (id: number, name: string, descr: string, rid: string, x: number, y: number, w: number, h: number) =>
  `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${esc(name)}" descr="${esc(descr)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
  `<p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
  `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;

const hotspotXml = (id: number, rid: string, x: number, y: number, w: number, h: number, n: number) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="본문 이동 ${n}"><a:hlinkClick r:id="${rid}" action="ppaction://hlinksldjump"/></p:cNvPr><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
  `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"><a:alpha val="0"/></a:srgbClr></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr>` +
  `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="ko-KR" altLang="en-US"/></a:p></p:txBody></p:sp>`;

const MISSING_RPR = `<a:rPr lang="ko-KR" altLang="en-US" sz="1000" b="0"><a:solidFill><a:srgbClr val="7F7F7F"/></a:solidFill><a:latin typeface="네오현대 R" panose="02020503020101020101" pitchFamily="18" charset="-127"/><a:ea typeface="네오현대 R" panose="02020503020101020101" pitchFamily="18" charset="-127"/></a:rPr>`;

// ---------------------------------------------------------------- report
export interface DeckIssue { order: number | null; slide: number; level: "warn" | "info"; message: string }
export interface DeckResult { buf: Buffer; slides: number; issues: DeckIssue[]; layout: { slide: number; kind: "cover" | "list" | "body"; articles: number[] }[] }

interface Src { file: string; xml: string; rels: Rel[] }

export async function buildTemplateDeck(doc: ReportDoc): Promise<DeckResult> {
  const zip = await JSZip.loadAsync(await fs.readFile(TEMPLATE));
  const read = async (p: string) => (await zip.file(p)?.async("string")) ?? "";
  const presRelsPath = "ppt/_rels/presentation.xml.rels";
  const presRels = parseRels(await read(presRelsPath));
  let pres = await read("ppt/presentation.xml");
  const order = [...pres.matchAll(/<p:sldId id="\d+" r:id="(rId\d+)"\/>/g)].map((m) => presRels.find((r) => r.id === m[1])!.target);
  const src: Src[] = [];
  for (const t of order) {
    const file = `ppt/${t}`;
    const relPath = file.replace(/slides\/(slide\d+\.xml)$/, "slides/_rels/$1.rels");
    src.push({ file, xml: await read(file), rels: parseRels(await read(relPath)) });
  }
  if (src.length < 3) throw new Error("PPT 템플릿 구조를 찾을 수 없습니다 (표지·목록·본문 슬라이드).");
  const notesTpl = await read("ppt/notesSlides/notesSlide1.xml");
  const [cover, list, ...bodies] = src;

  const n = doc.items.length;
  const listCount = Math.max(1, Math.ceil(n / PER_LIST));
  const bodyCount = Math.max(1, Math.ceil(n / 2));
  const firstBody = 2 + listCount; // 1-based slide number of the first article slide
  const slideOfArticle = (i: number) => firstBody + Math.floor(i / 2);
  const issues: DeckIssue[] = [];
  const layout: DeckResult["layout"] = [];
  const out: { xml: string; rels: Rel[]; notes: string[] }[] = [];
  const media: { name: string; buf: Buffer }[] = [];
  let mediaSeq = 0;

  // ---- 1. cover
  {
    let xml = cover.xml;
    const shapes = shapesOf(xml);
    const dateShape = shapes.find((s) => /^[A-Z][a-z]{2},\s?\d{4}$/.test(s.text.trim()));
    const volShape = shapes.find((s) => /^\d{1,4}$/.test(s.text.trim()));
    const edits: Edit[] = [];
    if (dateShape) edits.push({ s: dateShape, xml: setSimpleText(dateShape.xml, doc.coverDate) });
    else issues.push({ order: null, slide: 1, level: "warn", message: "표지의 월·연도 텍스트를 찾지 못했습니다." });
    if (volShape) edits.push({ s: volShape, xml: setSimpleText(volShape.xml, String(doc.vol)) });
    else issues.push({ order: null, slide: 1, level: "warn", message: "표지의 Vol. 번호를 찾지 못했습니다." });
    xml = applyEdits(xml, edits);
    const coverRels = cover.rels.map((r) => ({ ...r }));
    // optional cover background: only the large artwork picture is swapped; logo, title, Vol., date stay as designed
    if (doc.coverAssetId) {
      const art = shapesOf(xml).filter((s) => s.tag === "pic").sort((a, b) => b.w * b.h - a.w * a.h)[0];
      const asset = art ? await getAsset(doc.coverAssetId) : null;
      if (art && asset) {
        const px = (emu: number) => Math.min(2000, Math.round((emu / EMU_PER_PX) * 2));
        const buf = await sharp(asset.buf).resize(px(art.w), px(art.h), { fit: "cover", position: sharp.strategy.attention }).jpeg({ quality: 88 }).toBuffer();
        const name = `gor_cover.jpeg`;
        media.push({ name, buf });
        const rid = addRel(coverRels, T.image, `../media/${name}`);
        xml = applyEdits(xml, [{ s: art, xml: art.xml.replace(/r:embed="rId\d+"/, `r:embed="${rid}"`) }]);
      } else issues.push({ order: null, slide: 1, level: "warn", message: "표지 배경 이미지를 적용하지 못했습니다 (원본 표지 그림 유지)." });
    }
    out.push({ xml, rels: coverRels, notes: [`업계동향 ${doc.weekTitle} (${doc.startDate} ~ ${doc.endDate}) · Vol.${doc.vol}`] });
    layout.push({ slide: 1, kind: "cover", articles: [] });
  }

  // ---- 2. article list (12 per slide)
  for (let li = 0; li < listCount; li++) {
    const chunk = doc.items.slice(li * PER_LIST, li * PER_LIST + PER_LIST);
    const rels = list.rels.map((r) => ({ ...r })); // unused template links are pruned when writing
    let xml = list.xml;
    const shapes = shapesOf(xml);
    const table = shapes.find((s) => s.tag === "graphicFrame" && s.xml.includes("<a:tbl>"));
    if (!table) throw new Error("PPT 템플릿의 전체 기사 List 표를 찾을 수 없습니다.");
    const rows = table.xml.match(/<a:tr\b[\s\S]*?<\/a:tr>/g) ?? [];
    const header = rows[0]!;
    const data = rows.slice(1);
    const grid = [...table.xml.matchAll(/<a:gridCol w="(\d+)"/g)].map((m) => Number(m[1]));
    const newRows: string[] = [header];
    const hot: { y: number; h: number; rid: string; n: number }[] = [];
    let y = table.y + Number(header.match(/<a:tr h="(\d+)"/)?.[1] ?? 0);
    chunk.forEach((a, k) => {
      const proto = data[Math.min(k, data.length - 1)]!;
      const cells = proto.match(/<a:tc\b[\s\S]*?<\/a:tc>/g) ?? [];
      const no = li * PER_LIST + k + 1;
      const url = a.url ? addRel(rels, T.link, a.url, true) : null;
      const filled = [
        setSimpleText(cells[0]!, String(no)),
        setSimpleText(cells[1]!, a.label),
        setSimpleText(cells[2]!, a.title, url ? { rid: url } : null),
      ];
      let row = proto;
      cells.forEach((c, ci) => { row = row.replace(c, () => filled[ci]!); });
      newRows.push(row);
      const h = Number(proto.match(/<a:tr h="(\d+)"/)?.[1] ?? 0);
      hot.push({ y, h, rid: addRel(rels, T.slide, `slide${slideOfArticle(li * PER_LIST + k)}.xml`), n: no });
      y += h;
    });
    let t = table.xml;
    const tblStart = t.indexOf(header);
    const lastRow = rows[rows.length - 1]!;
    const tblEnd = t.indexOf(lastRow) + lastRow.length;
    t = t.slice(0, tblStart) + newRows.join("") + t.slice(tblEnd);
    const totalH = newRows.reduce((s, r) => s + Number(r.match(/<a:tr h="(\d+)"/)?.[1] ?? 0), 0);
    t = t.replace(/(<p:xfrm>[\s\S]*?<a:ext cx="\d+" cy=")\d+("\/>)/, `$1${totalH}$2`);
    let nextId = Math.max(...shapes.map((s) => s.id)) + 1;
    // invisible click areas over the NO column → jump to the article's slide (design unchanged)
    const hotXml = hot.map((h) => hotspotXml(nextId++, h.rid, table.x, h.y, grid[0] ?? 590155, h.h, h.n)).join("");
    xml = applyEdits(xml, [{ s: table, xml: t, after: hotXml }]);
    xml = setNo(xml, 2 + li);
    out.push({ xml, rels, notes: [`전체 기사 List ${li * PER_LIST + 1}–${li * PER_LIST + chunk.length}`, "기사 제목 클릭: 원문 기사 열기 · NO 클릭(슬라이드 쇼): 해당 기사 본문 슬라이드로 이동"] });
    layout.push({ slide: 2 + li, kind: "list", articles: chunk.map((a) => a.order) });
  }

  // ---- 3. article slides (2 per slide)
  for (let bi = 0; bi < bodyCount; bi++) {
    const proto = bodies[Math.min(bi, bodies.length - 1)];
    const rels = proto.rels.map((r) => ({ ...r })); // old photos / links are pruned when writing
    let xml = proto.xml;
    const shapes = shapesOf(xml);
    let nextId = Math.max(...shapes.map((s) => s.id)) + 1;
    const slideNo = firstBody + bi;
    const edits: Edit[] = [];
    const notes: string[] = [];
    const pair = [doc.items[bi * 2], doc.items[bi * 2 + 1]];
    for (const half of [0, 1] as const) {
      const a = pair[half];
      const inHalf = (s: Shape) => s.y > 1_400_000 && s.y < 9_700_000 && (half === 0 ? s.y < 5_400_000 : s.y >= 5_400_000);
      const zone = shapes.filter(inHalf);
      const cat = zone.find((s) => s.tag === "sp" && s.navy && s.w > 7_000_000);
      const title = zone.find((s) => s.tag === "sp" && !s.navy && !s.txBox && s.w > 7_000_000 && s.h < 800_000);
      const summary = zone.find((s) => s.txBox && s.x < 600_000 && s.h > 1_000_000);
      const frame = zone.find((s) => s.tag === "sp" && s.x > 5_800_000 && s.h > 1_200_000);
      const captions = zone.filter((s) => s.tag === "sp" && s.x > 5_800_000 && s.h < 700_000);
      const caption = captions.find((s) => s.text.trim()) ?? captions[0];
      const pics = zone.filter((s) => s.tag === "pic" && s.x > 5_800_000);
      if (!a) {
        // odd number of articles: the unused half is removed cleanly (no leftover text or photo)
        for (const s of [cat, title, summary, frame, ...captions, ...pics]) if (s) edits.push({ s, xml: null });
        continue;
      }
      if (!cat || !title || !summary || !frame) throw new Error(`PPT 템플릿 본문 슬라이드 구조를 찾을 수 없습니다 (슬라이드 ${slideNo}).`);
      edits.push({ s: cat, xml: setSimpleText(cat.xml, a.label) });

      // title | 언론사 — title links to the article
      {
        const p = parasOf(title.xml)[0] ?? "<a:p></a:p>";
        const rs = runsOf(p);
        const all = parasOf(title.xml).flatMap(runsOf); // "| 언론사" can sit in a second paragraph of the template
        const titleR = rs.find((r) => r.rPr.includes("hlinkClick"))?.rPr ?? rs[0]?.rPr ?? "<a:rPr/>";
        const bar = all.find((r) => r.text.includes("|"));
        const sepR = bar?.rPr ?? titleR;
        const gapR = rs.find((r) => !r.rPr.includes("hlinkClick") && !r.text.includes("|"))?.rPr ?? rPrWith(titleR, null);
        const lead = rs[0]?.text.match(/^\s*/)?.[0] ?? "";
        const rid = a.url ? addRel(rels, T.link, a.url, true) : null;
        const runsX = run(rPrWith(titleR, rid ? { rid } : null), lead + a.title) + run(rPrWith(gapR, null), " ") + run(rPrWith(sepR, null), `| ${a.media}`);
        edits.push({ s: title, xml: setParas(title.xml, [para(p.match(PPR)?.[0] ?? "", runsX, p.match(ENDP)?.[0] ?? "")]) });
      }
      // 4-line summary: template paragraph formats (▪ bullets ×3, "⇒" implication line)
      {
        const tp = parasOf(summary.xml);
        const paras = a.summary.map((line, i) => {
          if (!line) return null;
          const p = tp[Math.min(i, tp.length - 1)];
          const rs = runsOf(p);
          const prefix = (rs.map((r) => r.text).join("").match(/^\s*⇒\s*/) ?? [""])[0];
          return para(p.match(PPR)?.[0] ?? "", run(rPrWith(rs[0]?.rPr ?? "<a:rPr/>", null), prefix + line), p.match(ENDP)?.[0] ?? "");
        }).filter((x): x is string => Boolean(x));
        edits.push({ s: summary, xml: setParas(summary.xml, paras) });
      }
      // photo + caption
      for (const p of pics) edits.push({ s: p, xml: null });
      const img = a.image?.status === "approved" ? a.image : null;
      const placed = img ? await fitImage(img.assetId, img.fit, frame.w - 50_800, frame.h - 50_800) : null;
      if (placed) {
        const name = `gor_img${++mediaSeq}.${placed.ext}`;
        media.push({ name, buf: placed.buf });
        const rid = addRel(rels, T.image, `../media/${name}`);
        const descr = `${a.caption || a.title} (출처: ${img!.pageUrl ?? "사용자 업로드"})`;
        edits.push({ s: frame, xml: frame.xml, after: picXml(nextId++, `기사 이미지 ${a.order}`, descr, rid, frame.x + 25_400 + placed.dx, frame.y + 25_400 + placed.dy, placed.w, placed.h) });
        if (caption) edits.push({ s: caption, xml: setSimpleText(caption.xml, a.caption) });
        if (!a.caption) issues.push({ order: a.order, slide: slideNo, level: "warn", message: "사진 설명이 비어 있습니다 — 이미지 내용을 보고 직접 입력하세요." });
      } else {
        // no approved image: the box stays empty and is clearly marked; nothing is guessed
        const pp = parasOf(frame.xml)[0] ?? "<a:p></a:p>";
        edits.push({ s: frame, xml: setParas(frame.xml, [para(pp.match(PPR)?.[0] ?? '<a:pPr algn="ctr"/>', run(MISSING_RPR, "[이미지 확인 필요]"), pp.match(ENDP)?.[0] ?? "")]) });
        if (caption) edits.push({ s: caption, xml: setSimpleText(caption.xml, "") });
        issues.push({ order: a.order, slide: slideNo, level: "warn", message: a.image?.status === "candidate" ? "이미지 후보가 승인되지 않아 삽입하지 않았습니다 (사용 권한 확인 필요)." : "사용 가능한 이미지가 없어 '[이미지 확인 필요]'로 표시했습니다." });
      }
      for (const f of checkArticleFit(a)) issues.push({ order: a.order, slide: f.field === "listTitle" || f.field === "label" ? 2 + Math.floor((a.order - 1) / PER_LIST) : slideNo, level: "warn", message: f.message });
      if (!a.linkVerified) issues.push({ order: a.order, slide: slideNo, level: "warn", message: "원문 링크가 Google News 경유 주소입니다 — 발행 매체 직접 URL 확인 필요." });
      notes.push(
        `[기사 ${a.order}] ${a.title}`,
        `원문: ${a.url}${a.linkVerified ? "" : " (Google News 경유 링크 — 발행 매체 직접 URL 미확인)"}`,
        img && placed ? `이미지 출처: ${img.imageUrl ?? "사용자 업로드"}${img.pageUrl ? ` · 게재 페이지: ${img.pageUrl}` : ""} · 사용 근거: ${img.rights}` : "이미지: 미삽입 (확인 필요)",
        "",
      );
    }
    xml = applyEdits(xml, edits);
    xml = setNo(xml, slideNo);
    out.push({ xml, rels, notes });
    layout.push({ slide: slideNo, kind: "body", articles: pair.filter(Boolean).map((a) => a!.order) });
  }

  // ---- 4. write the package
  // remove template slides / notes
  for (const f of Object.keys(zip.files)) if (/^ppt\/(slides|notesSlides)\/(_rels\/)?(slide|notesSlide)\d+\.xml(\.rels)?$/.test(f)) zip.remove(f);
  let ct = await read("[Content_Types].xml");
  ct = ct.replace(/<Override PartName="\/ppt\/(slides\/slide|notesSlides\/notesSlide)\d+\.xml"[^>]*\/>/g, "");
  const overrides: string[] = [];
  out.forEach((s, i) => {
    const k = i + 1;
    // keep only relationships the slide still uses (+ layout / notes)
    const used = new Set([...s.xml.matchAll(/r:(?:id|embed|link)="(rId\d+)"/g)].map((m) => m[1]));
    const rels = s.rels.filter((r) => r.type === T.layout || (r.type !== T.notes && used.has(r.id)));
    addRel(rels, T.notes, `../notesSlides/notesSlide${k}.xml`);
    const xml = s.xml.replace(/(<p14:creationId\b[^>]*val=")\d+(")/, `$1${randomInt(1, 2 ** 31 - 1)}$2`);
    zip.file(`ppt/slides/slide${k}.xml`, xml, { createFolders: false });
    zip.file(`ppt/slides/_rels/slide${k}.xml.rels`, relsXml(rels), { createFolders: false });
    const notesBody = s.notes.length ? s.notes.map((l) => `<a:p>${l ? `<a:r><a:rPr lang="ko-KR" altLang="en-US"/><a:t>${esc(l)}</a:t></a:r>` : ""}<a:endParaRPr lang="ko-KR" altLang="en-US"/></a:p>`).join("") : '<a:p><a:endParaRPr lang="ko-KR" altLang="en-US"/></a:p>';
    let notesXml = notesTpl.replace(/(<p:ph type="body"[^>]*\/>[\s\S]*?<a:lstStyle\/>)[\s\S]*?(<\/p:txBody>)/, (_m, a: string, b: string) => a + notesBody + b);
    notesXml = notesXml.replace(/(<a:fld\b[^>]*type="slidenum"[^>]*>[\s\S]*?<a:t>)\d+(<\/a:t>)/, `$1${k}$2`).replace(/(<p14:creationId\b[^>]*val=")\d+(")/, `$1${randomInt(1, 2 ** 31 - 1)}$2`);
    zip.file(`ppt/notesSlides/notesSlide${k}.xml`, notesXml, { createFolders: false });
    zip.file(`ppt/notesSlides/_rels/notesSlide${k}.xml.rels`, relsXml([{ id: "rId1", type: T.notesMaster, target: "../notesMasters/notesMaster1.xml", external: false }, { id: "rId2", type: T.slide, target: `../slides/slide${k}.xml`, external: false }]), { createFolders: false });
    overrides.push(`<Override PartName="/ppt/slides/slide${k}.xml" ContentType="${CT_SLIDE}"/>`, `<Override PartName="/ppt/notesSlides/notesSlide${k}.xml" ContentType="${CT_NOTES}"/>`);
  });
  ct = ct.replace("</Types>", `${overrides.join("")}</Types>`);
  zip.file("[Content_Types].xml", ct, { createFolders: false });
  for (const m of media) zip.file(`ppt/media/${m.name}`, m.buf, { createFolders: false });

  // presentation slide list
  const keptPresRels = presRels.filter((r) => r.type !== T.slide);
  const ids = out.map((_, i) => addRel(keptPresRels, T.slide, `slides/slide${i + 1}.xml`));
  pres = pres.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, `<p:sldIdLst>${ids.map((rid, i) => `<p:sldId id="${300 + i}" r:id="${rid}"/>`).join("")}</p:sldIdLst>`);
  zip.file("ppt/presentation.xml", pres, { createFolders: false });
  zip.file(presRelsPath, relsXml(keptPresRels), { createFolders: false });
  const app = await read("docProps/app.xml");
  if (app) zip.file("docProps/app.xml", app.replace(/<Slides>\d+<\/Slides>/, `<Slides>${out.length}</Slides>`).replace(/<Notes>\d+<\/Notes>/, `<Notes>${out.length}</Notes>`), { createFolders: false });

  // drop media no longer referenced anywhere (old article photos from the template week)
  const referenced = new Set<string>();
  for (const f of Object.keys(zip.files).filter((f) => f.endsWith(".rels"))) {
    const dir = path.posix.dirname(path.posix.dirname(f));
    for (const r of parseRels(await read(f))) if (!r.external) referenced.add(path.posix.normalize(path.posix.join(dir, r.target)));
  }
  // (folder entries are skipped: removing "ppt/media/" would delete every file in it)
  for (const [f, entry] of Object.entries(zip.files)) if (!entry.dir && f.startsWith("ppt/media/") && !referenced.has(f)) zip.remove(f);

  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
  return { buf, slides: out.length, issues, layout };
}

/** "NO.0X" page marker (top right) = slide number − 1, as in the original deck. */
function setNo(xml: string, slideNo: number): string {
  const s = shapesOf(xml).find((x) => /^NO\.\d+$/.test(x.text.trim()));
  if (!s) return xml;
  const p = parasOf(s.xml)[0] ?? "<a:p></a:p>";
  const rs = runsOf(p);
  if (rs.length < 2) return xml;
  const num = String(slideNo - 1).padStart(2, "0");
  const runsX = run(rPrWith(rs[0].rPr, null), "NO.") + run(rPrWith(rs[1].rPr, null), num);
  return applyEdits(xml, [{ s, xml: setParas(s.xml, [para(p.match(PPR)?.[0] ?? "", runsX, p.match(ENDP)?.[0] ?? "")]) }]);
}

export type { FitIssue, ReportArticle };
