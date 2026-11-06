// Article analysis. Uses Claude (Anthropic API) when ANTHROPIC_API_KEY is set; otherwise a transparent
// rule-based extractor (clearly labelled "rules") so the pipeline still works without any keys.


import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { MOVEX_SOLUTIONS, PROJECT_STAGES } from "@/lib/config/defaults";
import { canonicalCountry, regionOf } from "@/lib/config/countries";
import { containsAny, isUnknown } from "@/lib/util/text";
import { computeScore } from "./scoring";
import type { Analysis, ArticleCategory, HistoryEventType, ScoreBreakdown, Settings, SourceType } from "@/lib/types";

export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);
export const aiModel = () => process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

export interface AnalysisInput {
  title: string;
  url: string;
  sourceName: string;
  sourceType: SourceType;
  publishedAt: string | null;
  sourceCountry: string | null;
  description: string | null;
  text: string | null;
}

const scoreItem = z.object({ score: z.number(), reason: z.string() });

const AnalysisSchema = z.object({
  is_relevant: z.boolean().describe("true if related to logistics automation, facility investment, manufacturing/warehouse projects or the listed competitors"),
  category: z.string().describe("One of: opportunity | competitor | industry | irrelevant"),
  company: z.string().describe("Investing / project owner company exactly as written, or 'Unknown'"),
  project_name: z.string().describe("Short project name, e.g. 'Debrecen battery plant'. 'Unknown' if none"),
  country: z.string().describe("Country of the project site (English short name) or 'Unknown'"),
  city: z.string().describe("City / site or 'Unknown'"),
  industry: z.string(),
  investment_amount: z.string().describe("Amount with currency exactly as stated, or 'Not Disclosed'"),
  facility_type: z.string().describe("e.g. Battery Plant, Distribution Center, Cold Storage, Air Cargo Terminal, or 'Unknown'"),
  signal_type: z.string(),
  project_stage: z.string().describe(`One of: ${PROJECT_STAGES.join(" | ")}`),
  expected_timeline: z.string().describe("Construction start / completion / operation dates as stated, or 'Unknown'"),
  event_date: z.string().describe("Date the investment/event was announced or occurred, ONLY if stated in the article (YYYY-MM-DD, YYYY-MM or YYYY). Empty string if not stated."),
  event_date_basis: z.string().describe("Quote or explanation of where event_date comes from, or 'Not stated'"),
  history_event_type: z.string().describe("One of: announcement | follow_up_investment | groundbreaking | equipment_procurement | tender | completion | update"),
  automation_needs: z.array(z.string()).describe("Potential automation needs (inference)"),
  solution_fit: z.array(z.object({ solution: z.string().describe(`One of: ${MOVEX_SOLUTIONS.join(" | ")}`), reason: z.string() })),
  score_investment_signal: scoreItem.describe("0-30: real facility investment / new project signal"),
  score_automation_potential: scoreItem.describe("0-25: logistics automation applicability"),
  score_stage_timing: scoreItem.describe("0-20: stage and procurement timing (early stage before equipment procurement scores highest; completed scores 0)"),
  score_solution_fit: scoreItem.describe("0-15: fit with Hyundai Movex solutions"),
  score_strategic_fit: scoreItem.describe("0-10: strategic region (US/North America, Poland, Hungary, Southeast Asia, UAE/Middle East, Australia) and key customer segment (EV/battery, automotive, tire, F&B, cold chain, e-commerce, airport)"),
  flag_completed_project: z.boolean(),
  flag_re_report: z.boolean().describe("true if the article merely re-mentions an investment announced long before (> ~12 months)"),
  flag_earnings_only: z.boolean(),
  flag_ma_without_capex: z.boolean(),
  flag_low_automation_relevance: z.boolean(),
  flag_insufficient_evidence: z.boolean(),
  summary: z.array(z.string()).describe("About 4 short key sentences in the requested language"),
  why_it_matters: z.string().describe("Why this matters to Hyundai Movex sales (requested language). Use hedged language; never imply a contract exists."),
  facts: z.array(z.string()).describe("Facts explicitly stated in the article"),
  inferences: z.array(z.string()).describe("Your inferences that are NOT stated in the article"),
  uncertainties: z.array(z.string()).describe("Key uncertainties / items to verify (requested language)"),
  competitors_mentioned: z.array(z.string()),
  competitor_activity: z.string().describe("If a competitor is involved: contract win / partnership / technology / investment / project delivery. Else ''"),
  source_type: z.string().describe("One of: Official Company Press Release | Government Announcement | Media Report | Industry Publication | Tender / Procurement Notice"),
  // ---- Weekly Market Intelligence fields (separate purpose from the opportunity score)
  title_ko: z.string().describe("Korean title for the weekly report (keep English proper nouns). If the original is Korean, repeat it."),
  weekly_categories: z.array(z.string()).describe("Zero or more of: domestic | global | competitor | policy | tech | opportunity. domestic = South Korea industry news; global = overseas industry news; competitor = news about the listed competitors' business; policy = government policy/regulation affecting logistics automation or manufacturing (not general politics); tech = technology/market trends; opportunity = concrete facility investment that could need automation."),
  weekly_primary_category: z.string().describe("The single best category from weekly_categories for the report, or 'none' if not relevant to an industry report"),
  weekly_summary: z.array(z.string()).describe("Korean weekly-report summary, about 4 lines, each ~20-30 Korean characters, noun-ending report style. Lines 1-3 start with '§ ' and state key facts/figures from the article; the last line starts with '⇒ ' and states the industry implication (policy: institutional change & industry impact; competitor: competitive landscape & orders; tech: technical meaning & market impact; opportunity: Hyundai Movex relevance). Never add facts not in the article; do not force a sales link."),
  rel_business: scoreItem.describe("0-30: relevance to Hyundai Movex business (intralogistics automation, smart factory, airport/rail systems)"),
  rel_impact: scoreItem.describe("0-25: industry impact and importance (scale, market significance, competitor major order, policy change). Pure product promotion scores low."),
  rel_strategic: scoreItem.describe("0-15: strategic region (Korea, North America, Poland/Hungary, Southeast Asia, UAE/Middle East, Australia) and key industry"),
  rel_credibility: scoreItem.describe("0-10: source credibility (official/government highest)"),
  competitor_checks: z.array(z.object({ name: z.string(), is_actual_competitor: z.boolean(), note: z.string() })).describe("For each listed competitor name appearing in the text: is it the intralogistics company or a similarly named person/entity?"),
  policy_kind: z.string().describe("For policy news: law | government_announcement | enforcement | other. Otherwise 'none'"),
  policy_effective_date: z.string().describe("Policy effective/enforcement date if stated (YYYY-MM-DD), else empty"),
});

export type WeeklyAIRaw = Pick<z.infer<typeof AnalysisSchema>, "title_ko" | "weekly_categories" | "weekly_primary_category" | "weekly_summary" | "rel_business" | "rel_impact" | "rel_strategic" | "rel_credibility" | "competitor_checks" | "policy_kind" | "policy_effective_date">;

const SYSTEM = `You are a market-intelligence analyst for HYUNDAI MOVEX, a Korean intralogistics automation company (AS/RS, 4-way shuttles, shuttle systems, AGV/AMR, conveyors, sorters, WMS/WCS, automated warehouses, production logistics, cold-chain automation, airport baggage & cargo handling systems).
Competitors: Daifuku, Dematic, SSI Schäfer, KNAPP, Vanderlande, Swisslog.

Analyse ONE news article and extract structured data to help find potential sales opportunities (new factories, distribution centers, warehouses, cold storage, production line expansions, logistics hubs, automation procurements, tenders).

Strict rules:
- Use ONLY information in the provided article text/metadata for factual fields. Never invent companies, amounts, dates, cities or timelines. Use "Unknown" or "Not Disclosed" when not stated.
- event_date must come from the article text; leave it empty if not stated. Do not assume the event date equals the publication date unless the article says the announcement happened that day.
- If the article only re-mentions an older investment, set flag_re_report=true. If the facility is already completed/operating, set flag_completed_project=true and give stage_timing a low score.
- Separate facts (stated) from inferences (your reasoning). Solution matches are possibilities to review, not confirmed supply.
- Keep original English titles and proper nouns as-is (company names, project names) even when writing in Korean.
- Be conservative: general industry news without a concrete facility project should score low.
- The weekly_* and rel_* fields serve a different purpose (weekly industry report): policy changes, competitor orders and technology shifts can be highly relevant there even when the opportunity score is low.
- Weekly summary style example (Korean report style):
  § 폴란드 생산시설 신설·현대화 투자 추진
  § 부품공장·생산라인 등 설비 확충 계획
  § 주요 제조기업의 생산능력 확대 전망
  ⇒ 중동부유럽 공정물류 자동화 수요 주목`;

const CATS: ArticleCategory[] = ["opportunity", "competitor", "industry", "irrelevant"];
const HIST: HistoryEventType[] = ["announcement", "follow_up_investment", "groundbreaking", "equipment_procurement", "tender", "completion", "update"];
const SRC: SourceType[] = ["Official Company Press Release", "Government Announcement", "Media Report", "Industry Publication", "Tender / Procurement Notice"];
function pick<T extends string>(v: string, allowed: readonly T[], fallback: T): T {
  const n = (v || "").trim().toLowerCase();
  return allowed.find((a) => a.toLowerCase() === n) ?? allowed.find((a) => n && (a.toLowerCase().includes(n) || n.includes(a.toLowerCase()))) ?? fallback;
}

export async function analyzeWithAI(input: AnalysisInput, settings: Settings): Promise<{ analysis: Analysis; weekly: WeeklyAIRaw }> {
  const client = new Anthropic({ maxRetries: 3, timeout: 120_000 });
  const lang = settings.analysisLanguage === "ko" ? "Korean (한국어)" : "English";
  const body = [
    `Today: ${new Date().toISOString().slice(0, 10)}`,
    `Requested language for summary / why_it_matters / uncertainties: ${lang}`,
    `Title: ${input.title}`,
    `Source: ${input.sourceName} (${input.url})`,
    `Source type hint (from domain): ${input.sourceType}`,
    `Publication date (metadata): ${input.publishedAt ?? "unknown"}`,
    input.sourceCountry ? `Source country (publisher): ${input.sourceCountry}` : "",
    input.description ? `Description: ${input.description}` : "",
    "",
    "Article text:",
    input.text ? input.text.slice(0, 8000) : "(Body text unavailable — only title/description could be read. Mark flag_insufficient_evidence=true unless the title alone clearly states a concrete facility project.)",
  ].join("\n");

  const res = await client.messages.parse({
    model: aiModel(),
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: "user", content: body }],
    output_config: { effort: "low", format: zodOutputFormat(AnalysisSchema) },
  });
  if (res.stop_reason === "refusal") throw new Error("AI declined to analyse this article (refusal)");
  const o = res.parsed_output;
  if (!o) throw new Error(`AI response could not be parsed (stop_reason=${res.stop_reason})`);

  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(v)));
  const breakdown: ScoreBreakdown = {
    investment_signal: { score: clamp(o.score_investment_signal.score, 30), reason: o.score_investment_signal.reason },
    automation_potential: { score: clamp(o.score_automation_potential.score, 25), reason: o.score_automation_potential.reason },
    stage_timing: { score: clamp(o.score_stage_timing.score, 20), reason: o.score_stage_timing.reason },
    solution_fit: { score: clamp(o.score_solution_fit.score, 15), reason: o.score_solution_fit.reason },
    strategic_fit: { score: clamp(o.score_strategic_fit.score, 10), reason: o.score_strategic_fit.reason },
  };
  const flags = {
    completedProject: o.flag_completed_project,
    reReport: o.flag_re_report,
    earningsOnly: o.flag_earnings_only,
    maWithoutCapex: o.flag_ma_without_capex,
    lowAutomationRelevance: o.flag_low_automation_relevance,
    insufficientEvidence: o.flag_insufficient_evidence,
  };
  const eventDate = /^\d{4}(-\d{2}){0,2}$/.test(o.event_date.trim()) ? o.event_date.trim() : null;
  const sc = computeScore(breakdown, flags, settings, { publishedAt: input.publishedAt, eventDate });
  const country = isUnknown(o.country) ? "Unknown" : canonicalCountry(o.country) ?? "Unknown";
  let category = pick(o.category, CATS, "industry");
  if (!o.is_relevant) category = "irrelevant";
  else if (category === "opportunity" && sc.score < 35) category = o.competitors_mentioned.length ? "competitor" : "industry";

  const weekly: WeeklyAIRaw = {
    title_ko: o.title_ko, weekly_categories: o.weekly_categories, weekly_primary_category: o.weekly_primary_category, weekly_summary: o.weekly_summary,
    rel_business: o.rel_business, rel_impact: o.rel_impact, rel_strategic: o.rel_strategic, rel_credibility: o.rel_credibility,
    competitor_checks: o.competitor_checks, policy_kind: o.policy_kind, policy_effective_date: o.policy_effective_date,
  };
  const analysis: Analysis = {
    mode: "ai",
    model: aiModel(),
    analyzedAt: new Date().toISOString(),
    isRelevant: o.is_relevant,
    category,
    company: o.company || "Unknown",
    projectName: o.project_name || "Unknown",
    country,
    city: o.city || "Unknown",
    region: regionOf(country),
    industry: o.industry || "Unknown",
    investmentAmount: o.investment_amount || "Not Disclosed",
    facilityType: o.facility_type || "Unknown",
    signalType: o.signal_type || "Unknown",
    projectStage: pick(o.project_stage, PROJECT_STAGES, "Unknown"),
    expectedTimeline: o.expected_timeline || "Unknown",
    eventDate,
    eventDateBasis: o.event_date_basis || "Not stated",
    historyEventType: pick(o.history_event_type, HIST, "update"),
    automationNeeds: o.automation_needs,
    solutionFit: o.solution_fit.filter((x) => MOVEX_SOLUTIONS.some((m) => m.toLowerCase() === x.solution.trim().toLowerCase())).map((x) => ({ solution: MOVEX_SOLUTIONS.find((m) => m.toLowerCase() === x.solution.trim().toLowerCase())!, reason: x.reason })),
    scoreBreakdown: breakdown,
    flags: sc.flags,
    penalties: sc.penalties,
    score: sc.score,
    priority: sc.priority,
    summaryKo: o.summary,
    whyItMatters: o.why_it_matters,
    facts: o.facts,
    inferences: o.inferences,
    uncertainties: o.uncertainties,
    competitorsMentioned: o.competitors_mentioned,
    competitorActivity: o.competitor_activity,
    sourceType: pick(o.source_type, SRC, input.sourceType),
  };
  return { analysis, weekly };
}

// ------------------------------------------------------------------ rule-based fallback

const FACILITY_RULES: { re: RegExp; facility: string; industry?: string; solutions: string[]; needs: string[] }[] = [
  { re: /gigafactory|battery (cell )?(plant|factory|manufacturing)|cathode|anode|battery production/i, facility: "Battery Plant", industry: "EV & Battery", solutions: ["Production Logistics", "AGV", "AMR", "AS/RS", "Automated Warehouse"], needs: ["공정 간 물류 자동화", "원자재/완제품 자동창고"] },
  { re: /cold (storage|chain)|refrigerated|frozen|temperature-controlled/i, facility: "Cold Storage", industry: "Cold Chain", solutions: ["Cold Chain Automation", "AS/RS", "4-Way Shuttle", "WMS"], needs: ["냉동냉장 자동보관", "저온 환경 입출고 자동화"] },
  { re: /air ?cargo|cargo terminal|baggage|airport/i, facility: "Airport / Air Cargo Facility", industry: "Airport & Air Cargo", solutions: ["Airport Cargo Handling System", "Airport Baggage Handling System", "Conveyor System"], needs: ["화물/수하물 처리 자동화"] },
  { re: /distribution (center|centre)|fulfil?ment (center|centre)|warehouse|logistics (hub|park|center|centre)/i, facility: "Distribution Center / Warehouse", industry: "Logistics Automation", solutions: ["AS/RS", "Shuttle System", "Conveyor System", "Sorter", "WMS", "WCS"], needs: ["입출고·피킹 자동화", "보관 자동화", "분류(소팅) 자동화"] },
  { re: /tire|tyre/i, facility: "Tire Plant", industry: "Tire", solutions: ["Production Logistics", "AS/RS", "Conveyor System", "AGV"], needs: ["그린타이어/완제품 자동 보관·이송"] },
  { re: /brewery|beverage|bottling|dairy|food (processing|plant|factory)/i, facility: "Food & Beverage Plant", industry: "Food & Beverage", solutions: ["AS/RS", "Conveyor System", "WMS", "Production Logistics"], needs: ["완제품 팔레트 자동창고", "출하 자동화"] },
  { re: /petrochemical|chemical plant|polymer|refinery/i, facility: "Petrochemical Plant", industry: "Petrochemical", solutions: ["AS/RS", "Conveyor System", "WMS"], needs: ["포장 제품 자동창고/출하"] },
  { re: /(car|vehicle|auto(motive)?|ev) (plant|factory|assembly)|automaker|auto parts/i, facility: "Automotive Plant", industry: "Automotive", solutions: ["Production Logistics", "AGV", "AMR", "Conveyor System"], needs: ["부품 공급 물류 자동화"] },
  { re: /(\$|€|£|usd|eur)\s?[\d.,]+\s?(billion|million|bn|mn)?[^.]{0,40}\b(expansion|investment|facility|campus|site)\b/i, facility: "Manufacturing Plant", industry: "Manufacturing", solutions: ["Production Logistics", "AGV", "AS/RS"], needs: ["생산 물류 자동화 (투자 규모 기반 추정)"] },
  { re: /factory|plant|manufacturing (facility|expansion|site|campus|hub|operations)|production (line|facility|capacity)/i, facility: "Manufacturing Plant", industry: "Manufacturing", solutions: ["Production Logistics", "AGV", "AS/RS"], needs: ["생산 물류 자동화"] },
];

function extractAmount(text: string): string {
  const m = text.match(/(?:US\$|\$|€|£|¥|₩|AED|SAR|A\$|AU\$|RM|VND|IDR|THB|PLN|HUF|EUR|USD)\s?\d[\d,.]*\s?(?:billion|million|bn|mn|m|b|trillion)?\b|\d[\d,.]*\s?(?:billion|million|bn|mn)\s?(?:dollars|euros|USD|EUR|won|yen|baht|ringgit|rupiah|dirhams|riyals|zloty|forint)/i);
  return m ? m[0].trim() : "Not Disclosed";
}

function guessCompany(rawTitle: string): string {
  // headline case ("Kia Plans ...") -> lower-case the verbs so the pattern can find the subject
  const title = rawTitle.replace(/\b(To|Plans?|Will|Invests?|Opens?|Breaks|Announces?|Unveils?|Expands?|Builds?|Selects?|Signs?|Starts?|Launches?|Commits?|Eyes|Picks|Wins)\b/g, (m) => m.toLowerCase());
  const m = title.match(/^([A-Z][\w&.'’-]*(?:\s+[A-Z][\w&.'’-]*){0,3})\s+(?:to|plans?|will|invests?|opens?|breaks|announces?|unveils?|expands?|builds?|selects?|signs?|starts?|launches?|commits?|eyes|picks|wins)\b/);
  return m ? m[1] : "Unknown";
}

export function analyzeWithRules(input: AnalysisInput, settings: Settings): Analysis {
  const text = `${input.title}\n${input.description ?? ""}\n${input.text ?? ""}`;
  const head = `${input.title} ${input.description ?? ""}`;
  const rule = FACILITY_RULES.find((r) => r.re.test(head)) ?? FACILITY_RULES.find((r) => r.re.test(text));

  const signal = settings.signals.find((s) => containsAny(head, s.keywords).length);
  const industryGroup = settings.industries.find((g) => containsAny(head, g.keywords).length);
  let country = "Unknown";
  for (const c of settings.countries) {
    if (containsAny(head, [c.name, ...c.aliases]).length) {
      country = c.name;
      break;
    }
  }
  if (country === "Unknown") {
    for (const c of settings.countries) if (containsAny(text.slice(0, 3000), [c.name]).length) { country = c.name; break; }
  }
  const competitors = settings.competitors.filter((c) => containsAny(text, c.aliases.length ? c.aliases : [c.name]).length).map((c) => c.name);

  const investment = /invest|build|construct|expan|new (plant|factory|facility|warehouse|distribution)|break(s)? ground|groundbreaking|tender|rfp/i.test(head);
  const completed = /\b(opens|opened|inaugurat|officially launch|begins operations|started operations)\b/i.test(head);
  const earnings = /\b(quarter|q[1-4]|earnings|revenue|profit|results)\b/i.test(input.title) && !investment;
  const isTender = /tender|rfp|request for proposal|procurement/i.test(head);

  const strategic = settings.countries.find((c) => c.name === country)?.priority ?? false;
  const bd: ScoreBreakdown = {
    investment_signal: { score: investment ? (signal ? 22 : 16) : 4, reason: investment ? `제목/요약에 투자·건설 신호 키워드 확인${signal ? ` (${signal.name})` : ""}` : "명확한 시설 투자 신호 없음" },
    automation_potential: { score: rule ? (/(warehouse|distribution|cold|fulfil|cargo|baggage|automat)/i.test(rule.facility + head) ? 18 : 12) : 4, reason: rule ? `시설 유형(${rule.facility}) 기준 자동화 적용 가능성 추정` : "시설 유형 불명확" },
    stage_timing: { score: completed ? 2 : isTender ? 18 : investment ? 12 : 4, reason: completed ? "가동/개소 단계로 판단" : isTender ? "입찰/발주 단계 신호" : investment ? "발표/계획 단계로 추정" : "단계 판단 불가" },
    solution_fit: { score: rule ? 10 : 2, reason: rule ? `연관 솔루션: ${rule.solutions.slice(0, 3).join(", ")}` : "솔루션 연관성 불명확" },
    strategic_fit: { score: strategic ? 8 : country !== "Unknown" ? 4 : 1, reason: strategic ? `전략 지역(${country})` : country !== "Unknown" ? `${country}` : "국가 불명" },
  };
  const flags = {
    completedProject: completed,
    reReport: false,
    earningsOnly: earnings,
    maWithoutCapex: /\b(acquires?|acquisition|merger|takeover)\b/i.test(input.title) && !investment,
    lowAutomationRelevance: !rule,
    insufficientEvidence: !input.text,
  };
  const sc = computeScore(bd, flags, settings, { publishedAt: input.publishedAt, eventDate: null });
  const relevant = Boolean(rule || competitors.length || investment);
  let category: ArticleCategory = !relevant ? "irrelevant" : sc.score >= 35 && investment ? "opportunity" : competitors.length ? "competitor" : "industry";
  if (category === "opportunity" && competitors.length && !investment) category = "competitor";

  const sentences = (input.description || input.text || "").split(/(?<=[.!?])\s+/).filter((s) => s.length > 30).slice(0, 3);
  return {
    mode: "rules",
    model: null,
    analyzedAt: new Date().toISOString(),
    isRelevant: relevant,
    category,
    company: guessCompany(input.title),
    projectName: "Unknown",
    country,
    city: "Unknown",
    region: regionOf(country),
    industry: industryGroup?.name ?? rule?.industry ?? "Unknown",
    investmentAmount: extractAmount(text),
    facilityType: rule?.facility ?? "Unknown",
    signalType: signal?.name ?? (isTender ? "RFP / Tender" : "Unknown"),
    projectStage: completed ? "Operational / Completed" : isTender ? "Equipment Procurement / Tender" : investment ? "Announced / Planned" : "Unknown",
    expectedTimeline: "Unknown",
    eventDate: null,
    eventDateBasis: "규칙 기반 분석은 사건일을 추정하지 않음",
    historyEventType: completed ? "completion" : isTender ? "tender" : "announcement",
    automationNeeds: rule?.needs ?? [],
    solutionFit: (rule?.solutions ?? []).map((s) => ({ solution: s, reason: "시설 유형 키워드 기반 매칭 (검토 필요)" })),
    scoreBreakdown: bd,
    flags: sc.flags,
    penalties: sc.penalties,
    score: sc.score,
    priority: sc.priority,
    summaryKo: ["[AI 미연결 — 규칙 기반 분석] 원문 발췌:", ...(sentences.length ? sentences : [input.title])],
    whyItMatters: rule ? `${rule.facility} 관련 투자 신호 — ${rule.solutions.slice(0, 3).join(", ")} 등 검토 가능 (규칙 기반 추정)` : "규칙 기반 분석: 관련성 확인 필요",
    facts: [input.title],
    inferences: rule ? [`시설 유형 '${rule.facility}'은 키워드 매칭 결과입니다.`] : [],
    uncertainties: ["AI 분석 미연결 상태로 기업명·프로젝트명·일정은 원문 확인이 필요합니다."],
    competitorsMentioned: competitors,
    competitorActivity: competitors.length ? "경쟁사 언급 (세부 활동 미분류)" : "",
    sourceType: input.sourceType,
  };
}

export async function analyzeArticle(input: AnalysisInput, settings: Settings): Promise<{ analysis: Analysis; warning: string | null; weeklyAI?: WeeklyAIRaw }> {
  if (!aiConfigured()) return { analysis: analyzeWithRules(input, settings), warning: null };
  try {
    const r = await analyzeWithAI(input, settings);
    return { analysis: r.analysis, weeklyAI: r.weekly, warning: null };
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `Anthropic API ${e.status ?? ""}: ${e.message}` : e instanceof Error ? e.message : String(e);
    // fail soft: keep the pipeline running with rules, but report the AI error
    return { analysis: analyzeWithRules(input, settings), warning: `AI 분석 실패 → 규칙 기반 대체: ${msg.slice(0, 200)}` };
  }
}
