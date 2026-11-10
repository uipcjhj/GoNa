// Google News redirect → publisher URL, and same-story alternative sources when the article page cannot be read.
//  1. offline: older article ids embed the URL (base64 protobuf)
//  2. Google's own decoder endpoint (batchexecute) — Google may answer with a captcha ("/sorry") from datacenter IPs
//  3. fallback: one GDELT title search for the same story on other sites (official press releases included)
import "server-only";
import { USER_AGENT } from "@/lib/util/http";
import { jaccard, normalizeTitle } from "@/lib/util/text";

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
export const isGoogleNews = (u: string) => /^https?:\/\/news\.google\.com\//.test(u);

export type ResolveResult = { url: string; method: "offline" | "decoder" } | { url: null; reason: "google_blocked" | "decode_failed" | "network_error"; note: string };

function articleId(u: string): string | null {
  try { return new URL(u).pathname.split("/").filter(Boolean).pop() ?? null; } catch { return null; }
}

/** Old-format ids carry the URL in the payload (base64url protobuf). */
export function decodeOffline(id: string): string | null {
  try {
    const bin = Buffer.from(id.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("latin1");
    const m = bin.match(/https?:\/\/[\x21-\x7e]+/);
    if (!m) return null;
    const url = m[0].replace(/[\x00-\x1f].*$/, "");
    return /^https?:\/\/[^/]+\.[^/]+/.test(url) && !url.includes("news.google.com") ? url : null;
  } catch {
    return null;
  }
}

async function timed(url: string, init: RequestInit, ms = 12000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); } finally { clearTimeout(t); }
}

export async function resolveGoogleNewsUrl(u: string): Promise<ResolveResult> {
  const id = articleId(u);
  if (!id) return { url: null, reason: "decode_failed", note: "Google News 기사 ID 없음" };
  const off = decodeOffline(id);
  if (off) return { url: off, method: "offline" };
  try {
    const page = await timed(`https://news.google.com/articles/${id}?hl=en-US&gl=US&ceid=US:en`, { headers: { "User-Agent": BROWSER_UA }, redirect: "manual" });
    const loc = page.headers.get("location") ?? "";
    if (/google\.com\/sorry/.test(loc) || page.status === 429) return { url: null, reason: "google_blocked", note: "Google이 이 서버의 요청을 자동화 트래픽으로 차단 (captcha)" };
    const html = await page.text();
    const sg = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
    const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
    if (!sg || !ts) return { url: null, reason: "decode_failed", note: `Google News 페이지에서 서명 값을 찾지 못함 (HTTP ${page.status})` };
    const inner = JSON.stringify(["garturlreq", [["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1], "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0], id, Number(ts), sg]);
    const res = await timed("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": BROWSER_UA },
      body: "f.req=" + encodeURIComponent(JSON.stringify([[["Fbv4je", inner, null, "generic"]]])),
    });
    const text = await res.text();
    const url = text.match(/\[\\"garturlres\\",\\"(https?:[^\\"]+)\\"/)?.[1];
    return url ? { url: url.replace(/\\u0026/g, "&"), method: "decoder" } : { url: null, reason: "decode_failed", note: `디코더 응답에 URL 없음 (HTTP ${res.status})` };
  } catch (e) {
    return { url: null, reason: "network_error", note: `Google News 접속 실패: ${(e as Error).message?.slice(0, 80)}` };
  }
}

export interface AltSource { url: string; title: string; domain: string; similarity: number }

/** One GDELT search for the same headline on other sites (no Google). Best matches first. */
export async function searchSameStory(title: string, opts: { exclude?: string[]; max?: number } = {}): Promise<AltSource[]> {
  const words = title.replace(/[“”"'’‘|–—-]/g, " ").replace(/\s+-\s+[^-]+$/, "").split(/\s+/).filter((w) => w.length > 2).slice(0, 8);
  if (words.length < 3) return [];
  const q = encodeURIComponent(words.join(" "));
  try {
    const res = await timed(`https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&format=json&maxrecords=25&timespan=1month&sort=hybridrel`, { headers: { "User-Agent": USER_AGENT } }, 15000);
    if (!res.ok) return [];
    const j = JSON.parse(await res.text()) as { articles?: { url: string; title: string; domain: string }[] };
    const want = normalizeTitle(title);
    return (j.articles ?? [])
      .filter((a) => !isGoogleNews(a.url) && !(opts.exclude ?? []).some((x) => a.url.includes(x)))
      .map((a) => ({ url: a.url, title: a.title, domain: a.domain, similarity: jaccard(want, normalizeTitle(a.title)) }))
      .filter((a) => a.similarity >= 0.45)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, opts.max ?? 3);
  } catch {
    return []; // GDELT is slow / rate limited at times — the article simply stays without alternatives
  }
}
