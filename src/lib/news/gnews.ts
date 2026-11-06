// Optional: GNews API (https://gnews.io) — free tier 100 requests/day. Enabled when GNEWS_API_KEY is set.
import { fetchWithRetry } from "@/lib/util/http";
import { domainOf } from "@/lib/util/url";
import type { RawArticle } from "./types";

export const gnewsEnabled = () => Boolean(process.env.GNEWS_API_KEY);

export async function searchGnews(query: string, sinceIso: string, max = 10): Promise<RawArticle[]> {
  const params = new URLSearchParams({ q: query, lang: "en", max: String(max), from: sinceIso.slice(0, 19) + "Z", sortby: "publishedAt", apikey: process.env.GNEWS_API_KEY! });
  const res = await fetchWithRetry(`https://gnews.io/api/v4/search?${params}`, { timeoutMs: 20000 }, 2);
  if (!res.ok) throw new Error(`GNews HTTP ${res.status}`);
  const json = (await res.json()) as { articles?: { title: string; description: string; url: string; publishedAt: string; source: { name: string; url: string } }[] };
  return (json.articles ?? []).map((a) => ({
    url: a.url,
    title: a.title,
    sourceName: a.source?.name || domainOf(a.url),
    domain: domainOf(a.url),
    publishedAt: a.publishedAt ?? null,
    publishedAtBasis: "GNews publishedAt",
    language: "English",
    sourceCountry: null,
    description: a.description ?? null,
    provider: "gnews",
    query,
  }));
}
