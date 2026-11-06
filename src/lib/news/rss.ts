import { XMLParser } from "fast-xml-parser";
import { fetchWithRetry } from "@/lib/util/http";
import { domainOf } from "@/lib/util/url";
import type { RawArticle } from "./types";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@" });

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && v && "#text" in v) return String((v as Record<string, unknown>)["#text"]);
  return String(v);
}

const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

export async function fetchRss(name: string, url: string, sinceIso: string, lang: "ko" | "en" = "en"): Promise<RawArticle[]> {
  const res = await fetchWithRetry(url, { timeoutMs: 20000, headers: { Accept: "application/rss+xml, application/xml, text/xml" } }, 2);
  if (!res.ok) throw new Error(`RSS ${name} HTTP ${res.status}`);
  const xml = parser.parse(await res.text());
  const items: Record<string, unknown>[] = [].concat(xml?.rss?.channel?.item ?? xml?.feed?.entry ?? []);
  const out: RawArticle[] = [];
  for (const it of items) {
    let link = text(it.link);
    if (!link && Array.isArray(it.link)) link = (it.link[0] as Record<string, string>)?.["@href"] ?? "";
    if (!link && typeof it.link === "object" && it.link) link = (it.link as Record<string, string>)["@href"] ?? "";
    const title = strip(text(it.title));
    if (!link || !title) continue;
    let d = text(it.pubDate || it.published || it.updated || it["dc:date"]).trim();
    // Korean CMS feeds often publish "YYYY-MM-DD HH:mm:ss" without a timezone -> Korea Standard Time
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(d)) d = `${d.replace(" ", "T")}${d.length === 16 ? ":00" : ""}+09:00`;
    const pub = d ? new Date(d) : null;
    const publishedAt = pub && !isNaN(pub.getTime()) ? pub.toISOString() : null;
    if (publishedAt && publishedAt < sinceIso) continue;
    out.push({
      url: link.trim(),
      title,
      sourceName: name,
      domain: domainOf(link),
      publishedAt,
      publishedAtBasis: publishedAt ? "발행 매체 RSS pubDate" : "unknown",
      language: lang === "ko" ? "Korean" : "English",
      sourceCountry: null,
      description: strip(text(it.description || it.summary)).slice(0, 600) || null,
      provider: "rss",
      query: `RSS: ${name}`,
    });
  }
  return out;
}
