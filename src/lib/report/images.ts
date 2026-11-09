// Article image lookup for the PPT. Only images actually published with the article (og:image / figure) or by the
// company's official newsroom / press-release wire are considered — never stock or generated images.
// Every image keeps its source URL, page URL and usage basis. Press-release images (distributed for media use) are
// approved automatically; news-outlet images stay "candidate" until a user approves them.
import "server-only";
import * as cheerio from "cheerio";
import sharp from "sharp";
import { USER_AGENT } from "@/lib/util/http";
import { domainOf } from "@/lib/util/url";
import type { ImageSourceKind, ReportImage } from "@/lib/types";
import { saveAsset } from "./assets";

const PRESS_WIRES = ["prnewswire.com", "businesswire.com", "globenewswire.com", "newswire.co.kr", "accesswire.com", "einpresswire.com", "presswire.com", "newsroom"];
const GENERIC_IMG = /(logo|default|placeholder|no[-_]?image|noimg|blank|spacer|share[-_]?image|og[-_]?default|favicon|sprite|icon)/i;

export const RIGHTS: Record<ImageSourceKind, string> = {
  press_release: "기업 보도자료 배포 이미지 (언론 보도용 배포) — 출처 표기 권장",
  official: "기업 공식 홈페이지·뉴스룸 게시 이미지 — 사용 조건 확인 권장",
  article: "언론사 기사 게재 이미지 — 저작권은 언론사·원저작자에 있음. 내부 보고용 사용 여부를 확인한 뒤 승인하세요",
  upload: "사용자가 직접 업로드한 이미지 — 사용 권한은 업로더가 확인",
};

/** Block requests to local / private network hosts (SSRF guard). */
export function publicHttpUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h === "metadata.google.internal") return null;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h === "::1" || h.startsWith("[")) return null;
  return u;
}

function kindOf(pageUrl: string): ImageSourceKind {
  const d = domainOf(pageUrl);
  const p = (() => { try { return new URL(pageUrl).pathname.toLowerCase(); } catch { return ""; } })();
  if (PRESS_WIRES.some((w) => d.includes(w))) return "press_release";
  if (/\/(newsroom|press|press-release|pressroom|media-center|mediacenter)(\/|$)/.test(p) || /^(news|newsroom|press|media)\./.test(d)) return "official";
  return "article";
}

async function fetchLimited(url: string, accept: string, maxBytes: number, timeoutMs = 15000): Promise<{ buf: Buffer; type: string; finalUrl: string } | null> {
  if (!publicHttpUrl(url)) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": USER_AGENT, Accept: accept } });
    if (!res.ok || !res.body || !publicHttpUrl(res.url || url)) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > maxBytes) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) { ctrl.abort(); return null; }
      chunks.push(value);
    }
    return { buf: Buffer.concat(chunks), type: res.headers.get("content-type") ?? "", finalUrl: res.url || url };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

interface Candidate { url: string; caption: string; captionBasis: ReportImage["captionBasis"]; credit?: string | null }

/** og:image / twitter:image / first article figure — with the publisher's own alt text or caption. */
export function imageCandidates(html: string, pageUrl: string): Candidate[] {
  const $ = cheerio.load(html);
  const abs = (u: string | undefined) => { if (!u) return null; try { return new URL(u.trim(), pageUrl).toString(); } catch { return null; } };
  const meta = (sel: string) => $(sel).attr("content")?.trim();
  const out: Candidate[] = [];
  const alt = meta('meta[property="og:image:alt"]') || meta('meta[name="twitter:image:alt"]') || "";
  for (const u of [meta('meta[property="og:image:secure_url"]'), meta('meta[property="og:image"]'), meta('meta[name="twitter:image"]'), meta('meta[name="twitter:image:src"]'), $('link[rel="image_src"]').attr("href")]) {
    const a = abs(u);
    if (a) out.push({ url: a, caption: alt, captionBasis: alt ? "alt" : "none" });
  }
  $("article figure img, figure img, .article_view img, #articleBody img, .article-body img").slice(0, 4).each((_, el) => {
    const a = abs($(el).attr("src") || $(el).attr("data-src"));
    if (!a) return;
    const fig = $(el).closest("figure").find("figcaption").first().text().replace(/\s+/g, " ").trim();
    const altText = ($(el).attr("alt") ?? "").trim();
    out.push({ url: a, caption: fig || altText, captionBasis: fig ? "figcaption" : altText ? "alt" : "none" });
  });
  // og:image usually has no caption: borrow the figure caption of the same photo
  const base = (u: string) => u.split("?")[0]!.split("/").pop();
  for (const c of out) {
    if (c.caption) continue;
    const same = out.find((o) => o !== c && o.caption && base(o.url) === base(c.url));
    if (same) { c.caption = same.caption; c.captionBasis = same.captionBasis; }
  }
  const seen = new Set<string>();
  return out.filter((c) => !GENERIC_IMG.test(c.url) && !seen.has(c.url) && (seen.add(c.url), true)).map((c) => ({ ...c, ...cleanCaption(c.caption) }));
}

/** "▲ 로직스의 자동창고 (사진=로직스)" → caption "로직스의 자동창고", credit "로직스". */
export function cleanCaption(raw: string): { caption: string; credit: string | null } {
  let t = raw.replace(/\s+/g, " ").trim().replace(/^[▲△▶▷■□●○◆◇※*\-–·]+\s*/, "");
  let credit: string | null = null;
  const m = t.match(/[(\[]\s*(?:사진|이미지|자료|그래픽|출처|photo|image|credit)\s*(?:제공)?\s*[=:：]?\s*([^)\]]{1,40})[)\]]\s*$/i);
  if (m) { credit = m[1]!.trim(); t = t.slice(0, m.index).trim(); }
  return { caption: t, credit };
}

/** Normalize an image (rotate, ≤1600px, JPEG unless it has transparency) and store it. */
export async function storeImage(buf: Buffer): Promise<{ assetId: string; width: number; height: number; fit: "cover" | "contain" } | null> {
  try {
    const img = sharp(buf, { failOn: "none" }).rotate();
    const meta = await img.metadata();
    if (!meta.width || !meta.height) return null;
    const resized = img.resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true });
    // PNGs often carry an unused alpha channel: only real transparency counts (logos / cut-outs)
    const alpha = Boolean(meta.hasAlpha) && ((await sharp(buf, { failOn: "none" }).stats()).channels[3]?.min ?? 255) < 250;
    const out = alpha ? await resized.png().toBuffer() : await resized.jpeg({ quality: 86 }).toBuffer();
    const m = await sharp(out).metadata();
    const ratio = m.width! / m.height!;
    const assetId = await saveAsset(out, alpha ? "image/png" : "image/jpeg");
    // logos / transparent graphics / very wide or tall images are fitted, photos fill the box
    return { assetId, width: m.width!, height: m.height!, fit: alpha || ratio > 2.2 || ratio < 0.5 ? "contain" : "cover" };
  } catch {
    return null;
  }
}

export type FindResult = { ok: true; image: ReportImage } | { ok: false; reason: string };

/** Find the article's own representative image. Never guesses: no image → reason returned, nothing inserted. */
export async function findArticleImage(pageUrl: string): Promise<FindResult> {
  if (/news\.google\.com/.test(pageUrl)) return { ok: false, reason: "Google News 경유 링크만 있어 원문 이미지를 확인할 수 없습니다 — 발행 매체 직접 URL을 먼저 확인하세요." };
  const page = await fetchLimited(pageUrl, "text/html,application/xhtml+xml", 4_000_000);
  if (!page || !/html/i.test(page.type)) return { ok: false, reason: "원문 페이지를 불러오지 못했습니다 (접근 제한·유료 기사·차단 가능)." };
  const cands = imageCandidates(page.buf.toString("utf8"), page.finalUrl);
  if (!cands.length) return { ok: false, reason: "원문에 대표 이미지(og:image·기사 사진)가 없습니다." };
  let downloaded = 0;
  for (const c of cands.slice(0, 4)) {
    const file = await fetchLimited(c.url, "image/avif,image/webp,image/png,image/jpeg,image/*", 10_000_000);
    if (!file || !/^image\//i.test(file.type) || /svg/i.test(file.type)) continue;
    downloaded++;
    const stored = await storeImage(file.buf);
    if (!stored || stored.width < 320 || stored.height < 180) continue;
    const kind = kindOf(page.finalUrl);
    return {
      ok: true,
      image: {
        status: kind === "press_release" ? "approved" : "candidate",
        source: kind,
        imageUrl: file.finalUrl,
        pageUrl: page.finalUrl,
        rights: c.credit ? `${RIGHTS[kind]} · 사진 제공: ${c.credit}` : RIGHTS[kind],
        caption: c.caption.slice(0, 60),
        captionBasis: c.caption ? c.captionBasis : "none",
        ...stored,
        fetchedAt: new Date().toISOString(),
      },
    };
  }
  return { ok: false, reason: downloaded ? "원문 이미지가 너무 작아(320×180 미만) 보고서용으로 쓸 수 없습니다." : "원문 이미지 파일을 내려받지 못했습니다 (이미지 서버 접근 차단·네트워크 제한). 직접 업로드하세요." };
}
