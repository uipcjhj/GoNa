// Builds search queries by combining country x industry x signal keywords, with rotation across runs
// so that every combination is covered over several days and no region dominates.
import type { PlannedQuery, Settings } from "@/lib/types";
import { gnewsEnabled } from "./gnews";

const q = (s: string) => (/\s|\//.test(s) ? `"${s.replace(/"/g, "")}"` : s);
const orGroup = (arr: string[]) => (arr.length === 1 ? q(arr[0]) : `(${arr.map(q).join(" OR ")})`);

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function rotate<T>(arr: T[], by: number): T[] {
  if (!arr.length) return arr;
  const k = ((by % arr.length) + arr.length) % arr.length;
  return [...arr.slice(k), ...arr.slice(0, k)];
}

export function planQueries(s: Settings): PlannedQuery[] {
  const rot = s.rotation ?? 0;
  const countries = s.countries.filter((c) => c.enabled);
  const signals = s.signals.filter((x) => x.enabled && x.keywords.length);
  const industries = s.industries.filter((x) => x.enabled && x.keywords.length);

  // signal phrases (first 2 keywords of each signal), grouped in chunks of ~6 phrases
  const signalPhrases = signals.flatMap((x) => x.keywords.slice(0, 2));
  const signalChunks = chunk(signalPhrases, 6);

  const byRegion = new Map<string, string[]>();
  for (const c of countries) {
    const list = byRegion.get(c.region) ?? [];
    list.push(c.name);
    byRegion.set(c.region, list);
  }

  const regional: PlannedQuery[] = [];
  const regions = rotate([...byRegion.keys()], rot);
  // two passes so each region gets two different signal chunks per run
  for (let pass = 0; pass < 2; pass++) {
    regions.forEach((region, i) => {
      const names = byRegion.get(region)!;
      const cChunks = chunk(names, 6);
      const cGroup = cChunks[(rot + pass) % cChunks.length];
      const sGroup = signalChunks[(rot * 2 + pass + i) % Math.max(1, signalChunks.length)];
      if (!sGroup || !cGroup) return;
      regional.push({
        provider: "gdelt",
        query: `${orGroup(sGroup)} ${orGroup(cGroup)}`,
        label: `${region} · ${sGroup.slice(0, 2).join(", ")}…`,
      });
    });
  }

  const investWords = ["invest", "investment", "construction", "expansion", "new plant", "new facility", "groundbreaking"];
  const industryQs: PlannedQuery[] = rotate(industries, rot)
    .slice(0, 5)
    .map((ind) => ({
      provider: "gdelt",
      query: `${orGroup(ind.keywords.slice(0, 4))} ${orGroup(investWords)}`,
      label: `Industry · ${ind.name}`,
    }));

  const comps = s.competitors.filter((c) => c.enabled).flatMap((c) => c.aliases.slice(0, 1).length ? c.aliases.slice(0, 1) : [c.name]);
  const competitorQs: PlannedQuery[] = chunk(comps, 6).map((grp) => ({
    provider: "gdelt",
    query: `(${grp.map((x) => `"${x}"`).join(" OR ")}) (warehouse OR logistics OR automation OR contract OR "distribution center" OR intralogistics)`,
    label: `Competitors · ${grp.join(", ")}`,
  }));

  const custom: PlannedQuery[] = s.customQueries.filter(Boolean).map((cq) => ({ provider: "gdelt", query: cq, label: `Custom · ${cq}` }));

  // interleave so a truncated plan still covers all categories
  const gdelt: PlannedQuery[] = [];
  const pools = [regional, industryQs, competitorQs, custom];
  let added = true;
  for (let i = 0; added; i++) {
    added = false;
    for (const p of pools) if (p[i]) { gdelt.push(p[i]); added = true; }
  }
  const plan = gdelt.slice(0, Math.max(1, s.maxQueriesPerRun));

  for (const f of s.rssFeeds.filter((f) => f.enabled)) plan.push({ provider: "rss", query: f.url, label: `RSS · ${f.name}` });

  if (gnewsEnabled()) {
    // keep within GNews free quota (100/day): a handful of simple keyword queries per run
    const simple = rotate(signals, rot).slice(0, 4).map((x) => x.keywords[0]);
    for (const k of simple) plan.push({ provider: "gnews", query: `"${k}"`, label: `GNews · ${k}` });
  }
  return plan;
}

/** Cheap relevance pre-filter (title + description) to avoid spending AI calls on noise. */
export function preScore(title: string, desc: string | null, s: Settings): number {
  const text = `${title} ${desc ?? ""}`.toLowerCase();
  let score = 0;
  const strong = ["factory", "plant", "warehouse", "distribution center", "distribution centre", "fulfillment", "fulfilment", "logistics hub", "logistics park", "cold storage", "gigafactory", "production line", "facility", "tender", "automation", "automated", "as/rs", "conveyor", "sorter", "agv", "amr", "cargo terminal", "baggage"];
  const action = ["build", "construct", "invest", "expan", "open", "break ground", "breaks ground", "groundbreaking", "plans", "announce", "launch", "new ", "billion", "million", "contract", "selects", "award", "tender", "procure"];
  for (const w of strong) if (text.includes(w)) score += 2;
  for (const w of action) if (text.includes(w)) score += 1;
  for (const c of s.competitors) if (c.aliases.some((a) => text.includes(a.toLowerCase()))) score += 4;
  const negative = ["stock price", "shares fell", "shares rose", "dividend", "quarterly results", "earnings call", "obituary", "football", "election", "celebrity"];
  for (const w of negative) if (text.includes(w)) score -= 3;
  return score;
}
