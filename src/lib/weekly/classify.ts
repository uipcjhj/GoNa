// Weekly Market Intelligence: category classification + Industry Relevance Score.
// Separate from the Opportunity Score: a policy change or a competitor contract can be highly
// relevant to the weekly report even when it is not a sales opportunity.
import { COMPETITOR_RULES, KW } from "./categories";
import type { Article, CompetitorCheck, DateStatus, Opportunity, RelevanceBreakdown, Settings, WeeklyAnalysis, WeeklyCategory } from "@/lib/types";

const KO_COUNTRIES: Record<string, string> = {
  미국: "United States", 캐나다: "Canada", 멕시코: "Mexico", 폴란드: "Poland", 헝가리: "Hungary", 체코: "Czech Republic", 슬로바키아: "Slovakia",
  독일: "Germany", 영국: "United Kingdom", 스페인: "Spain", 프랑스: "France", 베트남: "Vietnam", 인도네시아: "Indonesia", 태국: "Thailand",
  말레이시아: "Malaysia", 필리핀: "Philippines", 싱가포르: "Singapore", 인도: "India", 아랍에미리트: "United Arab Emirates", UAE: "United Arab Emirates",
  두바이: "United Arab Emirates", 사우디: "Saudi Arabia", 카타르: "Qatar", 호주: "Australia", 중국: "China", 일본: "Japan", 대만: "Taiwan", 브라질: "Brazil",
};

const lc = (s: string) => s.toLowerCase();
const hits = (text: string, words: string[]) => {
  const t = lc(text);
  return words.filter((w) => t.includes(lc(w)));
};

export function dateStatus(a: Pick<Article, "publishedAt" | "publishedAtBasis">): DateStatus {
  if (!a.publishedAt) return "unknown";
  const b = a.publishedAtBasis || "";
  if (b.startsWith("원문 메타데이터") || b.startsWith("발행 매체 RSS") || b === "RSS pubDate") return "verified";
  return "search";
}

export function isKoreanArticle(a: Pick<Article, "language" | "sourceDomain" | "title">): boolean {
  return a.language === "Korean" || a.sourceDomain.endsWith(".kr") || /[가-힣]/.test(a.title);
}

export function checkCompetitors(text: string, settings: Settings): CompetitorCheck[] {
  const t = lc(text);
  const context = KW.logisticsContext.some((w) => t.includes(lc(w)));
  const out: CompetitorCheck[] = [];
  for (const c of settings.competitors.filter((x) => x.enabled)) {
    const rule = COMPETITOR_RULES[c.name];
    const koHit = rule?.ko.some((k) => text.includes(k));
    if (rule?.caseSensitive) {
      // e.g. "KNAPP" vs the surname "Knapp": require exact company spelling + logistics context
      const exact = rule.caseSensitive.some((k) => text.includes(k));
      const loose = c.aliases.some((k) => t.includes(lc(k))) || t.includes(lc(c.name));
      if (exact || koHit) out.push({ name: c.name, confirmed: context, note: context ? "회사명 일치 + 물류·자동화 문맥 확인" : "회사명은 일치하나 물류 문맥 없음 — 확인 필요" });
      else if (loose) out.push({ name: c.name, confirmed: false, note: "유사 명칭(인명·일반어 가능성) — 경쟁사로 보지 않음" });
      continue;
    }
    if (koHit || [c.name, ...c.aliases].some((k) => t.includes(lc(k)))) {
      out.push({ name: c.name, confirmed: true, note: context ? "회사명 일치 + 물류·자동화 문맥 확인" : "회사명 일치" });
    }
  }
  return out;
}

function detectCountry(title: string, body: string, settings: Settings, korean: boolean): string {
  for (const [ko, en] of Object.entries(KO_COUNTRIES)) if (title.includes(ko)) return en;
  for (const c of settings.countries) if (hits(title, [c.name, ...c.aliases.filter((x) => x.length > 2)]).length) return c.name;
  if (korean) return "South Korea";
  for (const [ko, en] of Object.entries(KO_COUNTRIES)) if (body.includes(ko)) return en;
  for (const c of settings.countries) if (hits(body.slice(0, 1500), [c.name]).length) return c.name;
  return "Unknown";
}

function detectIndustry(text: string): string {
  let best = "Unknown";
  let n = 0;
  for (const [name, words] of Object.entries(KW.industry)) {
    const h = hits(text, words).length;
    if (h > n) { n = h; best = name; }
  }
  return best;
}

export function recencyScore(publishedAt: string | null, ref: string, reReport: boolean): { score: number; reason: string } {
  if (!publishedAt) return { score: 6, reason: "발행일 미확인" };
  const days = (new Date(ref).getTime() - new Date(publishedAt).getTime()) / 86400_000;
  let s = days <= 7 ? 20 : days <= 14 ? 14 : days <= 30 ? 8 : 2;
  let reason = days <= 7 ? "최근 7일 이내 기사" : days <= 14 ? "최근 2주 이내" : days <= 30 ? "최근 1개월 이내" : "1개월 이상 경과";
  if (reReport) { s = Math.min(s, 4); reason += " · 과거 발표 재보도"; }
  return { score: s, reason };
}

export function credibilityScore(a: Pick<Article, "sourceType" | "verification" | "viaGoogleNews">): { score: number; reason: string } {
  const base: Record<string, number> = { "Official Company Press Release": 10, "Government Announcement": 10, "Tender / Procurement Notice": 9, "Industry Publication": 8, "Media Report": 6 };
  let s = base[a.sourceType] ?? 6;
  const notes: string[] = [a.sourceType];
  if (a.verification.status === "broken") { s = 0; notes.push("링크 오류"); }
  else if (a.viaGoogleNews) { s -= 2; notes.push("Google News 경유(원문 URL 미확정)"); }
  else if (a.verification.status === "needs_check") { s -= 1; notes.push("링크 확인 필요"); }
  else if (a.verification.status === "verified") notes.push("원문 링크 검증됨");
  return { score: Math.max(0, s), reason: notes.join(" · ") };
}

const sum = (b: RelevanceBreakdown) => b.business.score + b.impact.score + b.recency.score + b.strategic.score + b.credibility.score;

export function pickPrimary(cats: WeeklyCategory[]): WeeklyCategory | null {
  for (const c of ["competitor", "opportunity", "policy", "tech", "domestic", "global"] as WeeklyCategory[]) if (cats.includes(c)) return c;
  return null;
}

/** Paid market-research press releases ("X Market to Hit USD 156 Billion by 2034") — low report value. */
export function isMarketResearchPR(title: string, domain: string, source: string): boolean {
  const spamHost = /openpr|einpresswire|marketsandmarkets|researchandmarkets|precedenceresearch|marketresearch|fortunebusinessinsights|alliedmarketresearch|indexbox|market\.us|coherentmi|imarcgroup|grandviewresearch|mordorintelligence|persistencemarketresearch/i.test(`${domain} ${source}`);
  if (spamHost && /\bmarket\b/i.test(title)) return true;
  return /\bmarket\b.{0,40}\b(to (hit|reach|surpass|witness|grow|boom)|is going to|poised|projected|expected to|size|share|cagr|forecast)\b.*(usd|\$|billion|cagr|20[3-4]\d)/i.test(title) && /cagr|by 20[3-4]\d|to 20[3-4]\d|usd/i.test(title);
}

/** Rule-based weekly analysis (used when no AI key, and for articles analysed before this feature). */
export function weeklyRules(a: Article, settings: Settings, opp: Opportunity | null, bodyText?: string | null): WeeklyAnalysis {
  const body = `${a.excerpt ?? ""}\n${bodyText ?? ""}`;
  const text = `${a.title}\n${body}`;
  const korean = isKoreanArticle(a);
  const country = a.analysis && a.analysis.country !== "Unknown" && !korean ? a.analysis.country : detectCountry(a.title, body, settings, korean);
  const scope: "domestic" | "global" = country === "South Korea" || (korean && country === "Unknown") ? "domestic" : "global";
  const industry = detectIndustry(text) !== "Unknown" ? detectIndustry(text) : a.analysis?.industry ?? "Unknown";
  const comps = checkCompetitors(text, settings);
  const confirmed = comps.filter((c) => c.confirmed);

  const bizTitle = hits(a.title, KW.business);
  const bizBody = hits(body, KW.business);
  const invest = hits(a.title, KW.facilityInvest);
  const policyT = hits(a.title, KW.policy);
  const policyB = hits(body, KW.policy);
  const policyInd = hits(text, KW.policyIndustry);
  const techT = hits(a.title, KW.tech);
  const techB = hits(body, KW.tech);
  const noise = hits(a.title, KW.noise).length > 0;
  const promo = hits(a.title, KW.promo).length > 0;
  const amount = /(\d[\d,.]*\s?(조|억)\s?원|\$\s?[\d.,]+\s?(billion|million|bn|m)\b|[\d.,]+\s?(billion|million)\s?(dollars|euros|usd|eur)?|€\s?[\d.,]+\s?(billion|million|bn|m)?)/i.exec(text);
  const big = /(\d+\s?조\s?원|billion|\bbn\b)/i.test(amount?.[0] ?? "");
  const contract = /(수주|공급 계약|계약 체결|낙찰|선정|contract|wins|selects|order|awarded|partnership|제휴|협약|MOU)/i.test(a.title);

  const cats = new Set<WeeklyCategory>();
  if (confirmed.length) cats.add("competitor");
  // weekly "잠재 수주기회": linked project scoring ≥ 45 (dashboard HOT/WATCH thresholds are unchanged)
  if ((opp && (opp.priority !== "GENERAL" || opp.score >= 45)) || (a.analysis?.category === "opportunity" && (a.analysis.score ?? 0) >= 45)) cats.add("opportunity");
  if (!noise && policyInd.length && (policyT.length >= 1 || policyB.length >= 3)) cats.add("policy");
  if (!noise && (techT.length >= 1 || (techB.length >= 2 && bizBody.length >= 1))) cats.add("tech");
  const industryHit = industry !== "Unknown";
  if (!noise && (bizTitle.length || bizBody.length >= 2 || (invest.length && industryHit) || cats.size)) cats.add(scope);

  // --- Industry Relevance Score
  let business = bizTitle.length ? Math.min(30, 18 + 4 * (bizTitle.length - 1) + 2 * bizBody.length) : bizBody.length ? Math.min(22, 8 + 3 * bizBody.length) : industryHit ? 6 : 0;
  if (confirmed.length) business = Math.max(business, 20);
  if (cats.has("policy") && hits(text, ["물류", "로봇", "자동화", "스마트공장", "logistics", "robot", "automation"]).length) business = Math.max(business, 14);
  let impact = 0;
  const impactNotes: string[] = [];
  if (amount) { impact += big ? 15 : 10; impactNotes.push(`투자·금액 명시 (${amount[0].trim()})`); }
  if (contract && confirmed.length) { impact += 12; impactNotes.push("경쟁사 수주·계약"); }
  else if (contract) { impact += 6; impactNotes.push("계약·제휴"); }
  if (cats.has("policy") && /(예산|시행|발표|확정|budget|enact|announce)/i.test(text)) { impact += 8; impactNotes.push("정책 시행·발표"); }
  if (opp && opp.score >= 60) { impact += 8; impactNotes.push(`수주기회 ${opp.priority}`); }
  if (techT.length && /(시장|market|forecast|전망)/i.test(a.title)) { impact += 6; impactNotes.push("시장 동향"); }
  if (invest.length && industryHit) { impact += 5; impactNotes.push("시설 투자 신호"); }
  if (promo && !amount && !contract) { impact = Math.min(impact, 6); impactNotes.push("제품 홍보성 기사"); }
  impact = Math.min(25, impact);
  const strategicCountry = country === "South Korea" || settings.countries.find((c) => c.name === country)?.priority;
  const strategic = Math.min(15, (strategicCountry ? 8 : country !== "Unknown" ? 3 : 1) + (industryHit ? 7 : 0));
  const ref = new Date().toISOString();
  const rec = recencyScore(a.publishedAt, ref, Boolean(a.analysis?.flags.reReport));
  const cred = credibilityScore(a);

  const breakdown: RelevanceBreakdown = {
    business: { score: business, reason: bizTitle.length || bizBody.length ? `사업 키워드: ${[...new Set([...bizTitle, ...bizBody])].slice(0, 4).join(", ")}` : confirmed.length ? "경쟁사 관련" : "직접 연관 키워드 없음" },
    impact: { score: impact, reason: impactNotes.join(" · ") || "파급력 근거 부족" },
    recency: rec,
    strategic: { score: strategic, reason: `${country === "Unknown" ? "국가 미확인" : country}${industryHit ? ` · ${industry}` : ""}` },
    credibility: cred,
  };
  let relevance = sum(breakdown);
  if (noise) relevance = Math.min(relevance, 15);
  if (isMarketResearchPR(a.title, a.sourceDomain, a.sourceName)) {
    relevance = Math.min(relevance, 30);
    breakdown.impact = { score: Math.min(breakdown.impact.score, 4), reason: "시장조사 보도자료(홍보성) — 중요도 낮게 평가" };
  }
  if (!cats.size) relevance = Math.min(relevance, 25);

  // summary: no AI -> only quote the article's own sentences (clearly labelled as excerpt)
  const src = (a.excerpt || bodyText || "").replace(/\s+/g, " ").trim();
  const sentences = src.split(/(?<=[.!?。]|다\.)\s+/).map((x) => x.trim()).filter((x) => x.length > 15).slice(0, 3);
  const cats2 = [...cats];
  return {
    mode: "rules",
    analyzedAt: ref,
    categories: cats2,
    primaryCategory: pickPrimary(cats2),
    scope,
    country,
    industry,
    titleKo: korean ? a.title : null,
    summaryLines: sentences.map((x) => (x.length > 90 ? x.slice(0, 88) + "…" : x)),
    summaryIsExcerpt: true,
    relevance: Math.round(relevance),
    relevanceBreakdown: breakdown,
    competitorChecks: comps,
    policy: cats.has("policy") ? { kind: /(법|시행령|개정|act|bill|law)/i.test(a.title) ? "law" : /(시행|enforce|effective)/i.test(a.title) ? "enforcement" : "government_announcement", effectiveDate: null, note: "규칙 기반 판별 — 시행일은 원문 확인 필요" } : null,
    eventDate: a.analysis?.eventDate ?? null,
  };
}

/** Weekly pre-filter score (category-aware), so policy/tech/competitor news is not dropped by the opportunity filter. */
export function weeklyPreScore(title: string, desc: string | null): number {
  const text = `${title} ${desc ?? ""}`;
  if (hits(title, KW.noise).length) return -5;
  let s = 0;
  s += 2 * hits(title, KW.business).length + hits(desc ?? "", KW.business).length;
  if (hits(title, KW.policy).length && hits(text, KW.policyIndustry).length) s += 2;
  s += hits(title, KW.tech).length;
  if (hits(title, KW.facilityInvest).length && detectIndustry(text) !== "Unknown") s += 2;
  if (Object.values(COMPETITOR_RULES).some((r) => r.ko.some((k) => title.includes(k)))) s += 3;
  return s;
}

const WCATS: WeeklyCategory[] = ["domestic", "global", "competitor", "policy", "tech", "opportunity"];

/** Build the weekly analysis from the AI output; final relevance is computed here (recency server-side). */
export function weeklyFromAI(a: Article, raw: import("@/lib/pipeline/analyze").WeeklyAIRaw, settings: Settings, opp: Opportunity | null): WeeklyAnalysis {
  const base = weeklyRules(a, settings, opp); // country/scope/industry fallbacks + recency/credibility
  const prSpam = isMarketResearchPR(a.title, a.sourceDomain, a.sourceName);
  const clamp = (v: number, m: number) => Math.max(0, Math.min(m, Math.round(v)));
  const cats = [...new Set(raw.weekly_categories.map((c) => c.trim().toLowerCase()).filter((c): c is WeeklyCategory => (WCATS as string[]).includes(c)))];
  if (opp && (opp.priority !== "GENERAL" || opp.score >= 45) && !cats.includes("opportunity")) cats.push("opportunity");
  const prim = raw.weekly_primary_category.trim().toLowerCase();
  const breakdown: RelevanceBreakdown = {
    business: { score: clamp(raw.rel_business.score, 30), reason: raw.rel_business.reason },
    impact: { score: clamp(raw.rel_impact.score, 25), reason: raw.rel_impact.reason },
    recency: base.relevanceBreakdown.recency,
    strategic: { score: clamp(raw.rel_strategic.score, 15), reason: raw.rel_strategic.reason },
    credibility: { score: Math.min(clamp(raw.rel_credibility.score, 10), base.relevanceBreakdown.credibility.score + 2), reason: raw.rel_credibility.reason },
  };
  const policyKinds = ["law", "government_announcement", "enforcement", "other"] as const;
  const pk = policyKinds.find((k) => k === raw.policy_kind.trim().toLowerCase());
  return {
    ...base,
    mode: "ai",
    categories: cats,
    primaryCategory: (WCATS as string[]).includes(prim) && cats.includes(prim as WeeklyCategory) ? (prim as WeeklyCategory) : pickPrimary(cats),
    titleKo: raw.title_ko?.trim() || base.titleKo,
    summaryLines: raw.weekly_summary.map((x) => x.trim()).filter(Boolean).slice(0, 5),
    summaryIsExcerpt: false,
    relevance: Math.round(prSpam ? Math.min(30, sum(breakdown)) : sum(breakdown)),
    relevanceBreakdown: breakdown,
    competitorChecks: raw.competitor_checks.map((c) => ({ name: c.name, confirmed: c.is_actual_competitor, note: c.note })),
    policy: pk ? { kind: pk, effectiveDate: /^\d{4}-\d{2}-\d{2}$/.test(raw.policy_effective_date.trim()) ? raw.policy_effective_date.trim() : null, note: "AI 분석" } : null,
  };
}
