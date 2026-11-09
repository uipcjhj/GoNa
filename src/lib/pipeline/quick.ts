// Quick test mode: collect up to ~20 real articles (≈10 domestic + 10 global) fast, using free sources only.
// Investment / facility / automation-procurement signals are prioritised so the opportunity analysis can be tested.
import type { PlannedQuery, QuickCandidate, Settings } from "@/lib/types";
import { jaccard, normalizeTitle, tokens } from "@/lib/util/text";
import { isMarketResearchPR } from "@/lib/weekly/classify";

export const QUICK = {
  totalSeconds: 150, // overall job limit (results gathered so far are kept)
  discoverSeconds: 70, // search phase budget, the rest is for link checks + analysis
  perSide: 10, // domestic / global target
  maxTotal: 20,
  maxPerSource: 4,
  lookbackDays: 7,
};

const enc = (o: object) => JSON.stringify(o);

const KO_QUERIES = ["공장 신설 OR 공장 증설 투자", "물류센터 신설 OR 물류센터 착공", "자동창고 OR 스마트물류센터 구축", "물류 자동화 설비 도입", "생산라인 자동화 OR 스마트팩토리 구축", "물류 입찰 OR 물류시스템 발주"];
const EN_QUERIES = ["new factory investment", "plant expansion production capacity", "new distribution center construction", "automated warehouse investment", "warehouse automation contract", "logistics tender conveyor OR sorter"];

/** Ordered plan: direct publisher RSS first (real URLs + verified dates), then Google News, then one optional GDELT try. */
export function planQuickQueries(s: Settings): PlannedQuery[] {
  const plan: PlannedQuery[] = [];
  const feeds = s.rssFeeds.filter((f) => f.enabled);
  for (const f of feeds.filter((f) => f.lang === "ko")) plan.push({ provider: "rss", query: f.url, label: `RSS(국내) · ${f.name}` });
  for (const f of feeds.filter((f) => f.lang !== "ko")) plan.push({ provider: "rss", query: f.url, label: `RSS(글로벌) · ${f.name}` });
  if (s.weekly.googleNews) {
    KO_QUERIES.forEach((q) => plan.push({ provider: "googlenews", query: enc({ q, lang: "ko", when: "7d" }), label: `Google News(국문) · ${q}` }));
    EN_QUERIES.forEach((q) => plan.push({ provider: "googlenews", query: enc({ q, lang: "en", when: "7d" }), label: `Google News(영문) · ${q}` }));
  }
  if (s.weekly.gdelt) plan.push({ provider: "gdelt", query: enc({ q: '("new plant" OR "new factory" OR "distribution center") (investment OR expansion)', quick: true }), label: "GDELT(글로벌, 8초 제한 1회)" });
  return plan;
}

const INVEST_KO = ["신설", "증설", "착공", "건립", "투자", "투입", "공장", "생산라인", "생산시설", "물류센터", "풀필먼트", "자동창고", "자동화 설비", "자동화설비", "스마트팩토리", "스마트공장", "도입", "구축", "입찰", "발주", "수주", "확장"];
const INVEST_EN = ["new plant", "new factory", "expansion", "expand", "invest", "distribution center", "distribution centre", "fulfillment center", "warehouse", "automated", "automation", "tender", "contract", "groundbreaking", "breaks ground", "production line", "gigafactory", "facility", "capacity"];
const NOISE = ["주가", "증시", "코스피", "실적 발표", "인사", "부고", "배당", "은행", "보험", "증권", "금융지주", "코인", "정보보호", "국방", "군함", "stock", "shares", "earnings call", "dividend", "obituary", "bank"];
// must mention a physical facility / industrial operation to count as an investment-type article
const FACILITY = ["공장", "생산", "제조", "물류", "창고", "센터", "설비", "라인", "자동화", "로봇", "스마트팩토리", "스마트공장", "풀필먼트", "콜드체인", "터미널", "공항",
  "factory", "plant", "manufactur", "production", "warehouse", "distribution", "fulfil", "logistics", "automation", "automated", "facility", "facilities", "gigafactory", "cold storage", "terminal", "assembly"];

export function quickScore(title: string, desc: string | null): number {
  const t = `${title} ${desc ?? ""}`.toLowerCase();
  if (!FACILITY.some((w) => title.toLowerCase().includes(w))) return -1; // no facility/industry term in the headline
  if (isMarketResearchPR(title, "", "") || /\bmarket (forecast|size|report|to 20\d\d)/i.test(title)) return -1; // paid market-research releases
  let s = 0;
  // stopped / blocked / ceremonial news is not a new investment
  if (/(중단|제동|차질|불허|철회|무산|연기|표창|수상|기념|halts?|cancels?|scraps?|delays?|paused?|celebrat|anniversary|award)/i.test(title)) s -= 6;
  for (const w of INVEST_KO) if (title.includes(w)) s += 2;
  for (const w of INVEST_EN) if (t.includes(w)) s += title.toLowerCase().includes(w) ? 2 : 1;
  if (/(\d[\d,.]*\s?(조|억)\s?원|\$\s?[\d.,]+\s?(billion|million|bn|m)\b|[\d.,]+\s?(billion|million))/i.test(t)) s += 3;
  for (const w of NOISE) if (t.includes(w.toLowerCase())) s -= 4;
  return s;
}

export const isDomestic = (c: { title: string; language: string | null; domain: string }) =>
  c.language === "Korean" || /[가-힣]/.test(c.title) || c.domain.endsWith(".kr");

const GENERIC_LEAD = new Set(["美", "中", "日", "韓", "the", "a", "an", "how", "why", "new", "us", "u.s.", "정부", "국내", "글로벌", "올해", "내년", "단독", "creating", "report", "exclusive"]);

/** Lead entity of a headline ("SK하이닉스, …" / "Honda to invest …") used to avoid picking the same story 5 times. */
function leadKey(title: string): string | null {
  const t = title.replace(/^(\[[^\]]+\]|\([^)]+\))\s*/g, "").trim();
  const m = t.match(/^([A-Za-z0-9가-힣&.\-]{2,20})/);
  const k = m?.[1].replace(/(이|가|은|는|의)$/, "").toLowerCase() ?? null;
  return k && !GENERIC_LEAD.has(k) ? k : null;
}
const figures = (s: string) => [...s.matchAll(/(\d[\d,.]*)\s?(조|억|만|billion|million|bn|m(?![a-z]))/gi)].map((m) => `${m[1].replace(/,/g, "")}${m[2][0].toLowerCase()}`);

const stem = (t: string) => (/[가-힣]/.test(t) && t.length > 2 ? t.replace(/(으로|에서|에게|은|는|이|가|을|를|의|에|로|와|과|도)$/, "") : t);
const STOP = new Set(["공장", "증설", "투자", "신설", "물류", "센터", "생산", "물류센터", "스마트", "자동화", "로봇", "구축", "건립", "투입", "설비", "plant", "factory", "new", "invest", "investment", "expansion", "billion", "million", "warehouse", "logistics", "automation", "robot", "robots", "center", "centre", "usd", "eur", "plans", "manufacturing", "production", "facility"]);
const keyTokens = (title: string) => new Set(tokens(title).map(stem).filter((t) => t.length >= 2 && !STOP.has(t)));
let DF = new Map<string, number>(); // term frequency across the current pool (set by selectQuick)

function sameStory(a: QuickCandidate, b: QuickCandidate): boolean {
  const ta = normalizeTitle(a.title), tb = normalizeTitle(b.title);
  const sim = jaccard(ta, tb);
  if (sim >= 0.3) return true;
  // a shared, rare *entity* marks the same story across differently worded headlines:
  // a Latin-lettered name ("SK하이닉스", "Micron") or either headline's lead name ("농심", "다이소").
  // Common industry words and places ("물류센터", "부산") never count.
  const sa = keyTokens(a.title), sb = keyTokens(b.title);
  const leads = new Set([leadKey(a.title), leadKey(b.title)].filter((x): x is string => Boolean(x)).map(stem));
  const entity = [...sa].filter((t) => sb.has(t) && (DF.get(t) ?? 0) <= 6 && ((/[a-z]/.test(t) && t.length >= 3 && !STOP.has(t)) || leads.has(t)));
  if (entity.length) return true;
  const fa = figures(a.title), fb = figures(b.title);
  // same specific figure (e.g. 420억) + at least one shared non-numeric word (e.g. 부산)
  const sharedWord = [...sa].some((t) => sb.has(t) && !/\d/.test(t));
  if (fa.some((f) => fb.includes(f)) && sharedWord) return true;
  const ka = leadKey(a.title), kb = leadKey(b.title);
  return Boolean(ka && ka === kb);
}

/** Choose ≈10 domestic + 10 global candidates by investment signal, max 4 per source, one article per story. */
export function selectQuick(pool: QuickCandidate[], storedTitles: string[] = []): QuickCandidate[] {
  // direct publisher links (real URL, body text, verified date) rank above Google News redirect copies
  const rank = (c: QuickCandidate) => c.score + (c.provider === "googlenews" ? 0 : 2) + (c.description ? 1 : 0);
  DF = new Map();
  for (const c of pool) for (const t of keyTokens(c.title)) DF.set(t, (DF.get(t) ?? 0) + 1);
  const sorted = [...pool].filter((c) => c.score >= 3).sort((a, b) => rank(b) - rank(a) || (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  const perSource = new Map<string, number>();
  // stories already stored recently (from earlier runs) count as taken, so each run surfaces new projects
  const all: QuickCandidate[] = storedTitles.map((title) => ({ url: "", title, sourceName: "", domain: "", publishedAt: null, publishedAtBasis: "", language: null, sourceCountry: null, description: null, provider: "", query: "", score: 0, domestic: false }));
  const take = (list: QuickCandidate[], n: number, picked: QuickCandidate[]) => {
    for (const c of list) {
      if (picked.length >= n) break;
      if (picked.includes(c) || (perSource.get(c.domain) ?? 0) >= QUICK.maxPerSource) continue;
      if (all.some((p) => sameStory(p, c))) continue;
      all.push(c);
      perSource.set(c.domain, (perSource.get(c.domain) ?? 0) + 1);
      picked.push(c);
    }
    return picked;
  };
  const dom = take(sorted.filter((c) => c.domestic), QUICK.perSide, []);
  const glo = take(sorted.filter((c) => !c.domestic), QUICK.perSide, []);
  const out = [...dom, ...glo];
  // if one side came up short, fill from the other side (still only real, relevant articles)
  if (out.length < QUICK.maxTotal) take(sorted.filter((c) => !out.includes(c)), QUICK.maxTotal, out);
  return out.filter((c) => c.url).slice(0, QUICK.maxTotal);
}
