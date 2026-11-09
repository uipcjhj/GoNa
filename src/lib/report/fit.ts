// Text-fit estimate for the PPT template boxes (no font shrinking — long text gets a "please shorten" hint instead).
// Box sizes and font sizes are taken from the original deck (templates/weekly-report.pptx).
export interface FitIssue { field: "title" | "summary" | "caption" | "listTitle" | "label"; message: string }

/** Approximate rendered width of text in em units (Korean glyph = 1em). */
export function emWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    if (/[ᄀ-ᇿ㄰-㆏가-힯一-鿿　-〿＀-￯·…]/.test(ch)) w += 1;
    else if (/[A-Z]/.test(ch)) w += 0.66;
    else if (/[a-z0-9]/.test(ch)) w += 0.54;
    else if (ch === " ") w += 0.3;
    else w += 0.4;
  }
  return w;
}
/** Lines needed for one paragraph in a box `widthPt` wide at `sizePt` (5 % safety margin). */
export function linesFor(s: string, widthPt: number, sizePt: number): number {
  if (!s.trim()) return 0;
  return Math.max(1, Math.ceil((emWidth(s) * sizePt * 1.05) / widthPt));
}

// template boxes (pt). 1 pt = 12700 EMU
const BOX = {
  title: { w: 573, size: 16, max: 2 }, // title bar 7,745,839 EMU − insets − bullet indent
  summary: { w: 415, size: 15, max: 6 }, // summary box 5,562,600 EMU − bullet indent, 150 % spacing
  caption: { w: 138, size: 10, max: 2 }, // caption box 1,941,777 EMU − insets
  listTitle: { w: 422, size: 14, max: 2 }, // list table title column
  label: { w: 137, size: 12, max: 2 }, // list table 구분 column
};

export function checkArticleFit(a: { title: string; media: string; summary: string[]; caption: string; label: string }): FitIssue[] {
  const out: FitIssue[] = [];
  const tl = linesFor(`${a.title}  | ${a.media}`, BOX.title.w, BOX.title.size);
  if (tl > BOX.title.max) out.push({ field: "title", message: `제목+언론사가 본문 제목 영역에서 약 ${tl}줄 — ${BOX.title.max}줄 이내로 줄이세요 (약 ${Math.round(emWidth(`${a.title}  | ${a.media}`))}자 → ${BOX.title.max * 34}자 이하 권장).` });
  const sl = a.summary.filter(Boolean).reduce((n, l, i) => n + linesFor(i === 3 ? `⇒  ${l}` : l, BOX.summary.w, BOX.summary.size), 0);
  if (sl > BOX.summary.max) out.push({ field: "summary", message: `4줄 요약이 약 ${sl}줄로 줄바꿈되어 요약 영역(${BOX.summary.max}줄)을 넘습니다 — 각 줄을 27자 안팎으로 줄이세요.` });
  const cl = linesFor(a.caption, BOX.caption.w, BOX.caption.size);
  if (cl > BOX.caption.max) out.push({ field: "caption", message: `사진 설명이 ${cl}줄 — 2줄(약 26자) 이내로 줄이세요.` });
  const ll = linesFor(a.title, BOX.listTitle.w, BOX.listTitle.size);
  if (ll > BOX.listTitle.max) out.push({ field: "listTitle", message: `전체 기사 List에서 제목이 ${ll}줄 — 60자 이내 권장.` });
  const lb = linesFor(a.label, BOX.label.w, BOX.label.size);
  if (lb > BOX.label.max) out.push({ field: "label", message: `구분 문구가 목록 칸에서 ${lb}줄 — 더 짧은 구분명을 사용하세요.` });
  return out;
}
