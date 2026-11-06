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

export async function fetchRss(name: string, url: string, sinceIso: string): Promise<RawArticle[]> {
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
    const d = text(it.pubDate || it.published || it.updated || it["dc:date"]);
    const pub = d ? new Date(d) : null;
    const publishedAt = pub && !isNaN(pub.getTime()) ? pub.toISOString() : null;
    if (publishedAt && publishedAt < sinceIso) continue;
    out.push({
      url: link.trim(),
      title,
      sourceName: name,
      domain: domainOf(link),
      publishedAt,
      publishedAtBasis: publishedAt ? "RSS pubDate" : "unknown",
      language: "English",
      sourceCountry: null,
      description: strip(text(it.description || it.summary)).slice(0, 600) || null,
      provider: "rss",
      query: `RSS: ${name}`,
    });
  }
  return out;
}
