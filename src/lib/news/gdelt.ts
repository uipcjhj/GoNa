// GDELT DOC 2.0 API — free, no API key. https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
import { fetchWithRetry, sleep } from "@/lib/util/http";
import { domainOf } from "@/lib/util/url";
import type { RawArticle } from "./types";

const ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";
let lastCall = 0;

export class RateLimitError extends Error {}

function parseSeenDate(s: string | undefined): string | null {
  // 20261105T123000Z
  const m = s?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
}

export async function searchGdelt(query: string, opts: { timespanDays: number; max: number; englishOnly: boolean; start?: string; end?: string }): Promise<RawArticle[]> {
  // GDELT asks clients to keep to ~1 request / 5 seconds.
  const wait = 6500 - (Date.now() - lastCall);
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();

  const q = opts.englishOnly ? `${query} sourcelang:english` : query;
  const params = new URLSearchParams({
    query: q,
    mode: "artlist",
    format: "json",
    maxrecords: String(Math.min(opts.max, 250)),
    sort: "datedesc",
  });
  const gd = (iso: string) => iso.replace(/[-:T]/g, "").slice(0, 14); // YYYYMMDDHHMMSS (UTC)
  if (opts.start && opts.end) {
    params.set("startdatetime", gd(opts.start));
    params.set("enddatetime", gd(opts.end));
  } else params.set("timespan", `${Math.max(1, opts.timespanDays)}d`);
  const res = await fetchWithRetry(`${ENDPOINT}?${params}`, { timeoutMs: 30000 }, 2, 12000);
  const text = await res.text();
  lastCall = Date.now();
  if (res.status === 429) throw new RateLimitError(`GDELT 호출 제한 (429): ${text.slice(0, 120)}`);
  if (!res.ok) throw new Error(`GDELT HTTP ${res.status}: ${text.slice(0, 160)}`);
  if (!text.trim()) return [];
  let json: { articles?: { url: string; title: string; seendate?: string; domain?: string; language?: string; sourcecountry?: string }[] };
  try {
    json = JSON.parse(text);
  } catch {
    // GDELT returns plain-text messages for invalid queries / throttling
    throw new Error(`GDELT: ${text.slice(0, 200)}`);
  }
  return (json.articles ?? [])
    .filter((a) => a.url && a.title)
    .map((a) => ({
      url: a.url,
      title: a.title.trim(),
      sourceName: a.domain || domainOf(a.url),
      domain: a.domain || domainOf(a.url),
      publishedAt: parseSeenDate(a.seendate),
      publishedAtBasis: "GDELT first-seen time (원문 발행일 확인 전)",
      language: a.language ?? null,
      sourceCountry: a.sourcecountry ?? null,
      description: null,
      provider: "gdelt",
      query,
    }));
}
