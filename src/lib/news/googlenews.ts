// Google News RSS search (free, no key). Supports Korean (hl=ko, gl=KR) and English.
// Item links are Google News redirect URLs: they open the original article in a browser, but the
// publisher URL cannot be resolved by machine, so such items are flagged `viaGoogleNews` and their
// date is treated as a search-service date (not a verified publication date).
import { XMLParser } from "fast-xml-parser";
import { fetchWithRetry, sleep } from "@/lib/util/http";
import { domainOf } from "@/lib/util/url";
import type { RawArticle } from "./types";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@" });
let lastCall = 0;

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function searchGoogleNews(
  query: string,
  opts: { lang: "ko" | "en"; startDate?: string; endDate?: string; max?: number; fast?: boolean; when?: string },
): Promise<RawArticle[]> {
  const wait = (opts.fast ? 800 : 1500) - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  let q = query;
  if (opts.startDate && opts.endDate) {
    // after/before are exclusive day bounds; widen by one day, exact filtering happens later in KST
    const s = new Date(`${opts.startDate}T00:00:00Z`);
    const e = new Date(`${opts.endDate}T00:00:00Z`);
    q += ` after:${ymd(new Date(s.getTime() - 86400_000))} before:${ymd(new Date(e.getTime() + 2 * 86400_000))}`;
  } else q += ` when:${opts.when ?? "7d"}`;
  const loc = opts.lang === "ko" ? "hl=ko&gl=KR&ceid=KR:ko" : "hl=en-US&gl=US&ceid=US:en";
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${loc}`;
  const res = await fetchWithRetry(url, { timeoutMs: opts.fast ? 8000 : 20000 }, opts.fast ? 1 : 2, opts.fast ? 1500 : 4000);
  if (!res.ok) throw new Error(`Google News HTTP ${res.status}`);
  const xml = parser.parse(await res.text());
  const items: Record<string, unknown>[] = [].concat(xml?.rss?.channel?.item ?? []);
  return items.slice(0, opts.max ?? 30).flatMap((it) => {
    const link = String(it.link ?? "");
    const rawTitle = String(it.title ?? "").trim();
    const src = it.source as { "#text"?: string; "@url"?: string } | string | undefined;
    const sourceName = typeof src === "object" ? src?.["#text"] ?? "" : String(src ?? "");
    const sourceUrl = typeof src === "object" ? src?.["@url"] ?? "" : "";
    if (!link || !rawTitle) return [];
    const title = sourceName && rawTitle.endsWith(` - ${sourceName}`) ? rawTitle.slice(0, -(sourceName.length + 3)) : rawTitle;
    const pub = it.pubDate ? new Date(String(it.pubDate)) : null;
    const cleanSource = /^https?:\/\//.test(sourceName) ? domainOf(sourceName) : sourceName;
    return [{
      url: link,
      title,
      sourceName: cleanSource || domainOf(sourceUrl) || "Google News",
      domain: domainOf(sourceUrl) || "news.google.com",
      publishedAt: pub && !isNaN(pub.getTime()) ? pub.toISOString() : null,
      publishedAtBasis: "Google News 검색 결과 날짜 (원문 미확인)",
      language: opts.lang === "ko" ? "Korean" : "English",
      sourceCountry: null,
      description: null,
      provider: "googlenews",
      query,
    }];
  });
}
