// 보고서 이미지 자료실: 선정 기사별 이미지 후보(기사 원문 / 기업 CI / 관련 사업·시설) 검색·저장·캡션.
// 모두 사용자가 기사에 진입하거나 '이미지 찾기'를 눌렀을 때만 실행한다. 유료 API·임의 생성 이미지는 쓰지 않는다.
import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { Article, LibEntry, LibImage, LibImageType, ReportAnalysis } from "@/lib/types";
import { getStore } from "@/lib/db/store";
import { generateJSON, geminiConfigured } from "@/lib/ai/gemini";
import { domainOf } from "@/lib/util/url";
import { cleanCaption, fetchLimited, imageCandidates } from "./images";
import { findCompanyLogo } from "./logo";
import { safeGetBuffer, sniffImage } from "./safe-fetch";
import { checkCaption, logoCaption, normalizeCaption } from "./caption";

const idOf = (url: string) => createHash("sha256").update(url).digest("hex").slice(0, 16);
export const entryId = (articleId: string) => `imglib:${articleId}`;
export const emptyEntry = (articleId: string): LibEntry => ({ id: entryId(articleId), articleId, foundAt: null, images: [], primary: null, notes: [], searched: {} });
export async function getEntry(articleId: string): Promise<LibEntry> {
  return (await getStore().get<LibEntry>("settings", entryId(articleId))) ?? emptyEntry(articleId);
}
export const saveEntry = (e: LibEntry) => getStore().upsert("settings", [e]);
export const shownCaption = (i: LibImage) => (i.captionEdited ?? i.caption) || "";

/** 이미지 파일을 확인해 형식·크기를 얻는다 (너무 작은 아이콘·추적 픽셀은 버린다). */
async function probe(url: string, minW: number, minH: number): Promise<{ mime: string; width: number | null; height: number | null; finalUrl: string } | null> {
  const f = await safeGetBuffer(url, { accept: "image/avif,image/webp,image/png,image/jpeg,image/svg+xml,image/*", maxBytes: 10_000_000, timeoutMs: 12_000 });
  if (!f) return null;
  const mime = sniffImage(f.buf);
  if (!mime) return null;
  if (mime === "image/svg+xml") return { mime, width: null, height: null, finalUrl: f.finalUrl };
  try {
    const m = await sharp(f.buf, { failOn: "none" }).metadata();
    if (!m.width || !m.height || m.width < minW || m.height < minH) return null;
    return { mime, width: m.width, height: m.height, finalUrl: f.finalUrl };
  } catch { return null; }
}

async function pageImages(pageUrl: string, type: LibImageType, sourceNote: string, max: number, seen: Set<string>): Promise<LibImage[]> {
  const page = await fetchLimited(pageUrl, "text/html,application/xhtml+xml", 4_000_000);
  if (!page || !/html/i.test(page.type)) return [];
  const out: LibImage[] = [];
  for (const c of imageCandidates(page.buf.toString("utf8"), page.finalUrl)) {
    if (out.length >= max) break;
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    const p = await probe(c.url, 320, 180);
    if (!p) continue;
    const alt = cleanCaption(c.caption).caption;
    out.push({ id: idOf(p.finalUrl), type, imageUrl: p.finalUrl, pageUrl: page.finalUrl, sourceSite: domainOf(page.finalUrl), sourceNote, mime: p.mime, width: p.width, height: p.height, alt, caption: "", captionBasis: "none", captionEdited: null, check: null });
  }
  return out;
}

const REAL = (a: Article) => (a.sourceTrace?.resolvedUrl && !/news\.google\.com/.test(a.sourceTrace.resolvedUrl) ? a.sourceTrace.resolvedUrl : a.url);

/** 유형별 이미지 검색. types 를 주면 해당 유형만(이미지가 없는 유형만 다시 찾기). 이미지·캡션 편집 내용은 보존한다. */
export async function searchLibrary(a: Article, ai: ReportAnalysis | null, types: LibImageType[] = ["article", "logo", "facility"]): Promise<LibEntry> {
  const entry = await getEntry(a.id);
  const company = ai?.company.value?.trim() || "";
  const found: LibImage[] = [];
  const notes: Record<LibImageType, string> = { article: "", logo: "", facility: "" };
  const seen = new Set<string>(entry.images.map((i) => i.imageUrl));

  if (types.includes("article")) {
    const url = REAL(a);
    if (/news\.google\.com/.test(url)) notes.article = "Google News 경유 링크만 있어 원문 이미지를 확인할 수 없음 — 원문 URL 복원 필요";
    else {
      const imgs = await pageImages(url, "article", "기사 원문에 게재된 이미지 (og:image·기사 사진)", 2, seen).catch(() => []);
      found.push(...imgs);
      if (!imgs.length) notes.article = "원문에서 사용할 수 있는 기사 이미지를 찾지 못함 (이미지 없음·접근 제한·너무 작음)";
    }
  }
  if (types.includes("logo")) {
    if (!company) notes.logo = "기업명이 확인되지 않아 CI를 찾지 않음 — 확인 필요";
    else {
      const r = await findCompanyLogo(company).catch(() => null);
      if (!r || !r.logos.length) notes.logo = r?.note || "공식 CI를 찾지 못함 — 확인 필요";
      for (const l of r?.logos ?? []) {
        if (seen.has(l.imageUrl)) continue;
        const p = await probe(l.imageUrl, 40, 20);
        if (!p) { notes.logo ||= "로고 파일을 내려받지 못함 — 확인 필요"; continue; }
        seen.add(l.imageUrl);
        found.push({ id: idOf(l.imageUrl), type: "logo", imageUrl: p.finalUrl, pageUrl: l.pageUrl, sourceSite: l.sourceSite, sourceNote: l.note, mime: p.mime, width: p.width, height: p.height, alt: "", caption: logoCaption(company), captionBasis: "fixed", captionEdited: null, check: l.kind === "commons" ? "공식 홈페이지가 아닌 Wikimedia Commons 출처 — 최신 공식 CI인지 확인" : null });
      }
    }
  }
  if (types.includes("facility")) {
    const pages = (a.sourceTrace?.support ?? []).filter((s) => s.kind === "official_press" && s.status === "ok").slice(0, 2);
    const imgs: LibImage[] = [];
    for (const s of pages) imgs.push(...(await pageImages(s.url, "facility", "기업 공식 보도자료·사업 소개 페이지 이미지", 1, seen).catch(() => [])));
    found.push(...imgs.slice(0, 2));
    if (!imgs.length) notes.facility = pages.length ? "공식 자료 페이지에서 사용할 이미지를 찾지 못함" : "기업 공식 보도자료·사업 소개 출처가 확인되지 않아 시설 이미지를 찾지 않음 (비슷한 산업 사진으로 대체하지 않음)";
  }

  const now = new Date().toISOString();
  const kept = entry.images.filter((i) => !types.includes(i.type) || i.captionEdited || entry.primary === i.id || found.every((f) => f.id !== i.id));
  const byId = new Map(kept.map((i) => [i.id, i]));
  for (const f of found) if (!byId.has(f.id)) byId.set(f.id, f);
  entry.images = [...byId.values()];
  entry.foundAt = now;
  for (const t of types) { entry.searched[t] = now; entry.notes = entry.notes.filter((n) => !n.startsWith(`${t}:`)); if (notes[t]) entry.notes.push(`${t}:${notes[t]}`); }
  await saveEntry(entry);
  await writeCaptions(a, ai, entry).catch(() => undefined); // 캡션 실패가 이미지 검색을 막지 않는다
  return getEntry(a.id);
}

/** 출처 설명(alt·figcaption)이 있는 이미지에 한해 Gemini 1회로 명사형 한 줄 캡션을 만든다. 이미 있는 캡션·사용자 수정본은 건드리지 않는다. */
export async function writeCaptions(a: Article, ai: ReportAnalysis | null, entry: LibEntry, opts: { only?: string; force?: boolean } = {}): Promise<LibEntry> {
  const todo = entry.images.filter((i) => !i.captionEdited && (opts.only ? i.id === opts.only : true) && (opts.force || !i.caption) && i.captionBasis !== "fixed");
  const need = todo.filter((i) => i.alt);
  for (const i of todo.filter((x) => !x.alt)) { i.caption = ""; i.captionBasis = "none"; }
  if (need.length && geminiConfigured()) {
    const facts = [`기사 제목: ${a.title}`, ai?.company.value ? `기업: ${ai.company.value}` : "", ai?.location.countryKo ? `국가: ${ai.location.countryKo}${ai.location.city ? ` ${ai.location.city}` : ""}` : "", ai?.facility.type ? `시설: ${ai.facility.type}` : "", ai?.summary.length ? `기사 요약: ${ai.summary.slice(0, 3).join(" / ")}` : ""].filter(Boolean).join("\n");
    const system = `보고서용 사진 설명(캡션) 작성기. 이미지 파일은 보지 못하며, 주어진 '출처 설명 원문'과 기사 사실만 사용한다.
- 한국어 15~40자 내외 한 줄, 명사형·명사구로 끝낼 것 (예: "자동창고 시스템이 설치된 물류센터 내부"). 마침표·서술형(~다/~했음/~됨) 금지.
- 출처 설명에 없는 장면·인물·장소·숫자를 만들지 말 것. 기업명·장소는 출처 설명이나 기사 사실에 있을 때만.
- 기사 제목을 그대로 반복하지 말 것. 근거가 부족하면 caption을 빈 문자열로.`;
    const user = `${facts}\n\n${need.map((i) => `[${i.id}] 유형=${i.type === "article" ? "기사 사진" : "공식 자료 이미지"} / 출처 설명 원문: ${i.alt}`).join("\n")}`;
    const schema = { type: "OBJECT", properties: { captions: { type: "ARRAY", items: { type: "OBJECT", properties: { id: { type: "STRING" }, caption: { type: "STRING" } }, required: ["id", "caption"] } } }, required: ["captions"] };
    try {
      const r = await generateJSON<{ captions?: { id: string; caption: string }[] }>({ system, user, schema, maxOutputTokens: 1200, temperature: 0.1 });
      const allowed = `${a.title} ${facts} ${need.map((i) => i.alt).join(" ")}`;
      for (const c of r.data.captions ?? []) {
        const img = need.find((i) => i.id === c.id);
        if (!img) continue;
        const text = normalizeCaption(c.caption ?? "");
        if (text && checkCaption(text, { title: a.title, allowedText: allowed }).ok) { img.caption = text; img.captionBasis = "ai"; }
      }
    } catch { /* 한도·네트워크 오류: 캡션만 비워 두고 사용자가 직접 입력 */ }
  }
  await saveEntry(entry);
  return entry;
}
