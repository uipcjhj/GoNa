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
import { normalizeNumbers } from "@/lib/report/validate";
import { GeminiError, currentModelName, generateJSON, geminiStats } from "@/lib/ai/gemini";
import type { Analysis, ArticleCategory, HistoryEventType, ScoreBreakdown, Settings, SourceType } from "@/lib/types";

export const aiConfigured = () => Boolean(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY);
export const aiModel = () => process.env.GEMINI_API_KEY ? currentModelName() : (process.env.ANTHROPIC_MODEL || "claude-opus-5-5");

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
  // ---- v2: Hyundai Movex weekly report taxonomy + internal judgment (optional: rules fill gaps)
  report_summary: z.array(z.string()).optional().describe("EXACTLY 4 Korean lines for the weekly report, no bullets or symbols (no §, ⇒). Line1: who does what. Line2: key figures (investment, size, location, schedule) as stated. Line3: technology / automation content / business scope as stated (if automation is not in the article, say it is not mentioned). Line4: meaning for Hyundai Movex or the industry (inference allowed but hedged). Each line ~20-30 Korean characters, concise report style ending in nouns like 추진/확대/구축/강화/부각. Never invent companies, amounts, equipment or suppliers; do not just restate the title."),
  detail_group: z.string().optional().describe("global | domestic | competitor | review (review = cannot decide)"),
  detail_country: z.string().optional().describe("For global: the project country in Korean (e.g. 폴란드, 미국, 호주) if stated, else empty"),
  detail_sub: z.string().optional().describe("global: 투자·확장 | 제조물류 투자 | 스마트창고 투자 | 콜드체인 투자 | 자동화 운영확대 | Industry. domestic: 투자·확장 | 스마트팩토리 | 제조자동화 | 자율물류 | 피지컬 AI | 정책·지원 | 항만자동화 | Industry. competitor: 수주·계약 | 사업전략 | M&A·사업확장 | 제품·솔루션 공개 | 실증·도입 | R&D·피지컬 AI | 국내시장 진출"),
  win_potential: z.string().optional().describe("Hyundai Movex order-win potential: high | medium | low. High only for new facility projects (planned / early construction) where automation (AS/RS, AGV/AMR, conveyor, sorter, WMS/WCS) could still be ordered. Low for completed/operating facilities, supplier already chosen, real-estate deals, leases, outlooks, product launches, exhibitions, R&D centers, MOUs without investment."),
  is_new_project: z.boolean().optional(),
  completed_or_operating: z.boolean().optional(),
  supplier_status: z.string().optional().describe("undecided (article says supplier not yet chosen / tender) | decided (article names the automation equipment supplier) | unknown (cannot tell) | order_unconfirmed (article does not say whether automation will be ordered). A construction contractor is NOT an automation supplier. Do not assume undecided just because no supplier is named."),
  supplier_note: z.string().optional().describe("Short Korean note with the evidence (quote the supplier name only if in the article)"),
  order_room: z.string().optional().describe("yes | no | unknown — room for future automation orders"),
  direct_relevance: z.string().optional().describe("high | medium | low — direct link to intralogistics automation / manufacturing logistics"),
  competitor_value: z.string().optional().describe("high | medium | low | none — monitoring value as competitor news (real competitors only: KNAPP, AutoStore, Jungheinrich, Swisslog, SSI Schäfer, Daifuku, TGW, Dematic, Geek+, Hai Robotics, Exotec, Kardex, Symbotic, Korean logistics-automation SIs; LG CNS/포스코DX/삼성SDS/LX판토스 only when the article is about their logistics-automation business; ESR/Prologis are developers, not competitors)"),
  low_value_type: z.string().optional().describe("If applicable, one of: 물류부동산 매입·매각·임대 | 전시회·행사 | R&D센터·연구소 개설 | 실투자 근거 부족한 MOU | 제품 출시 중심 | 시장 전망·통계 ; else empty"),
});

export type WeeklyAIRaw = Pick<z.infer<typeof AnalysisSchema>, "title_ko" | "weekly_categories" | "weekly_primary_category" | "weekly_summary" | "rel_business" | "rel_impact" | "rel_strategic" | "rel_credibility" | "competitor_checks" | "policy_kind" | "policy_effective_date" | "report_summary" | "detail_group" | "detail_country" | "detail_sub" | "win_potential" | "is_new_project" | "completed_or_operating" | "supplier_status" | "supplier_note" | "order_room" | "direct_relevance" | "competitor_value" | "low_value_type">;

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
- report_summary: exactly 4 lines in Hyundai Movex weekly-report style, without symbols. Style examples (style only — use facts from THIS article):
  아성다이소, 경기 양주 신규 물류허브 건설 추진
  6,000억원 투자·2029년 완공 목표
  자동창고·GTP 등 고도 물류자동화 설비 적용
  대형 리테일 물류거점의 자동화 투자 확대
  (or)
  폴란드 제조기업, 신규 생산시설 신설·현대화 추진
  부품공장·차체용접라인 등 생산설비 확충
  신규 제조거점 중심으로 생산능력 확대
  공정물류·자동창고·AGV 발주 가능성 주목
  If automation is not stated in the article, line 3 must not present it as fact (e.g. "자동화 설비 도입 여부 미공개"). If only the title/excerpt is available, summarise only what they confirm.
- Distinguish announcement / approval / groundbreaking dates from the article's publication date.`;

const CATS: ArticleCategory[] = ["opportunity", "competitor", "industry", "irrelevant"];
const HIST: HistoryEventType[] = ["announcement", "follow_up_investment", "groundbreaking", "equipment_procurement", "tender", "completion", "update"];
const SRC: SourceType[] = ["Official Company Press Release", "Government Announcement", "Media Report", "Industry Publication", "Tender / Procurement Notice"];
function pick<T extends string>(v: string, allowed: readonly T[], fallback: T): T {
  const n = (v || "").trim().toLowerCase();
  return allowed.find((a) => a.toLowerCase() === n) ?? allowed.find((a) => n && (a.toLowerCase().includes(n) || n.includes(a.toLowerCase()))) ?? fallback;
}

export async function analyzeWithAI(input: AnalysisInput, settings: Settings): Promise<{ analysis: Analysis; weekly: WeeklyAIRaw }> {
  const client = process.env.GEMINI_API_KEY ? null : new Anthropic({ maxRetries: 3, timeout: 120_000 });
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

  let o: z.infer<typeof AnalysisSchema>;
  if (process.env.GEMINI_API_KEY) {
    // Gemini Developer API (free tier). Model is verified via ListModels; errors are classified (see lib/ai/gemini).
    const r = await generateJSON<unknown>({
      system: SYSTEM + "\nReturn exactly one valid JSON object. All keys defined by the requested schema must be present; no markdown or prose outside JSON.",
      user: body + "\n\nReturn a JSON object with ALL of these fields and their documented types. Do not add fields:\n" + JSON.stringify(z.toJSONSchema(AnalysisSchema)),
      maxOutputTokens: 12000,
    });
    const parsed = AnalysisSchema.safeParse(r.data);
    if (!parsed.success) throw new GeminiError("parse", 200, `필드 누락: ${parsed.error.issues.slice(0, 3).map((x) => x.path.join(".")).join(", ")}`);
    o = parsed.data;
  } else {
    const res = await client!.messages.parse({
      model: aiModel(),
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: "user", content: body }],
      output_config: { effort: "low", format: zodOutputFormat(AnalysisSchema) },
    });
    if (res.stop_reason === "refusal") throw new Error("AI declined to analyse this article (refusal)");
    if (!res.parsed_output) throw new Error(`AI response could not be parsed (stop_reason=${res.stop_reason})`);
    o = res.parsed_output;
  }

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
    report_summary: o.report_summary, detail_group: o.detail_group, detail_country: o.detail_country, detail_sub: o.detail_sub, win_potential: o.win_potential,
    is_new_project: o.is_new_project, completed_or_operating: o.completed_or_operating, supplier_status: o.supplier_status, supplier_note: o.supplier_note,
    order_room: o.order_room, direct_relevance: o.direct_relevance, competitor_value: o.competitor_value, low_value_type: o.low_value_type,
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

const FACILITY_RULES: { re: RegExp; facility: string; ko: string; industry?: string; solutions: string[]; needs: string[] }[] = [
  { re: /gigafactory|battery (cell )?(plant|factory|manufacturing)|cathode|anode|battery production|배터리 ?(공장|셀|생산)|이차전지|2차전지|양극재|음극재/i, facility: "Battery Plant", ko: "배터리 공장", industry: "EV & Battery", solutions: ["Production Logistics", "AGV", "AMR", "AS/RS", "Automated Warehouse"], needs: ["공정 간 물류 자동화", "원자재/완제품 자동창고"] },
  { re: /cold (storage|chain)|refrigerated|frozen|temperature-controlled|콜드체인|냉동|냉장|저온 ?물류/i, facility: "Cold Storage", ko: "냉동냉장 물류센터", industry: "Cold Chain", solutions: ["Cold Chain Automation", "AS/RS", "4-Way Shuttle", "WMS"], needs: ["냉동냉장 자동보관", "저온 환경 입출고 자동화"] },
  { re: /air ?cargo|cargo terminal|baggage|airport|공항|수하물|항공화물|화물터미널/i, facility: "Airport / Air Cargo Facility", ko: "공항·항공화물 시설", industry: "Airport & Air Cargo", solutions: ["Airport Cargo Handling System", "Airport Baggage Handling System", "Conveyor System"], needs: ["화물/수하물 처리 자동화"] },
  { re: /distribution (center|centre)|fulfil?ment (center|centre)|warehouse|logistics (hub|park|center|centre)|물류센터|풀필먼트|물류창고|자동창고|물류단지|물류허브|물류 ?거점|스마트 ?물류/i, facility: "Distribution Center / Warehouse", ko: "물류센터", industry: "Logistics Automation", solutions: ["AS/RS", "Shuttle System", "Conveyor System", "Sorter", "WMS", "WCS"], needs: ["입출고·피킹 자동화", "보관 자동화", "분류(소팅) 자동화"] },
  { re: /tire|tyre|타이어/i, facility: "Tire Plant", ko: "타이어 공장", industry: "Tire", solutions: ["Production Logistics", "AS/RS", "Conveyor System", "AGV"], needs: ["그린타이어/완제품 자동 보관·이송"] },
  { re: /brewery|beverage|bottling|dairy|food (processing|plant|factory)|식품 ?공장|음료|맥주|제과|유제품/i, facility: "Food & Beverage Plant", ko: "식음료 공장", industry: "Food & Beverage", solutions: ["AS/RS", "Conveyor System", "WMS", "Production Logistics"], needs: ["완제품 팔레트 자동창고", "출하 자동화"] },
  { re: /petrochemical|chemical plant|polymer|refinery|석유화학|화학 ?공장|정유/i, facility: "Petrochemical Plant", ko: "석유화학 공장", industry: "Petrochemical", solutions: ["AS/RS", "Conveyor System", "WMS"], needs: ["포장 제품 자동창고/출하"] },
  { re: /(car|vehicle|auto(motive)?|ev) (plant|factory|assembly)|automaker|auto parts|완성차|자동차 ?(공장|부품)|전기차 ?공장/i, facility: "Automotive Plant", ko: "자동차 공장", industry: "Automotive", solutions: ["Production Logistics", "AGV", "AMR", "Conveyor System"], needs: ["부품 공급 물류 자동화"] },
  { ko: "생산시설", re: /(\$|€|£|usd|eur)\s?[\d.,]+\s?(billion|million|bn|mn)?[^.]{0,40}\b(expansion|investment|facility|campus|site)\b/i, facility: "Manufacturing Plant", industry: "Manufacturing", solutions: ["Production Logistics", "AGV", "AS/RS"], needs: ["생산 물류 자동화 (투자 규모 기반 추정)"] },
  { ko: "생산공장", re: /자동화 ?설비|공정 ?자동화|물류 ?자동화|로봇 ?도입|생산라인|생산시설|생산기지|제조시설|스마트 ?팩토리|스마트 ?공장|공장|factory|plant|manufacturing (facility|expansion|site|campus|hub|operations)|production (line|facility|capacity)/i, facility: "Manufacturing Plant", industry: "Manufacturing", solutions: ["Production Logistics", "AGV", "AS/RS"], needs: ["생산 물류 자동화"] },
];

const US_STATES = ["Texas", "California", "Ohio", "Georgia", "Indiana", "Arizona", "Tennessee", "Kentucky", "Michigan", "Alabama", "South Carolina", "North Carolina", "Illinois", "Pennsylvania", "New York", "Nevada", "Oklahoma", "Kansas", "Missouri", "Wisconsin", "Minnesota", "Virginia", "Florida", "Louisiana", "Mississippi", "Utah", "Colorado", "Oregon", "Washington State", "New Jersey", "Iowa", "Arkansas"];
const KO_DISPLAY: Record<string, string> = { 美: "미국", 中: "중국", 日: "일본", UAE: "UAE" };
const KO_REGIONS = ["서울", "부산", "인천", "대구", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주",
  "평택", "이천", "용인", "화성", "안성", "김포", "양주", "파주", "시흥", "안산", "광명", "여주", "포천", "평창", "천안", "아산", "당진", "서산", "청주", "충주", "오창", "음성", "진천",
  "구미", "포항", "경주", "창원", "김해", "양산", "거제", "광양", "여수", "순천", "군산", "새만금", "익산", "전주", "원주", "춘천", "강릉", "오산", "칠곡", "밀양", "영천", "상주", "나주"];
const KO_COUNTRY: Record<string, string> = { 미국: "United States", 美: "United States", 캐나다: "Canada", 멕시코: "Mexico", 폴란드: "Poland", 헝가리: "Hungary", 체코: "Czech Republic", 독일: "Germany", 영국: "United Kingdom", 스페인: "Spain", 베트남: "Vietnam", 인도네시아: "Indonesia", 태국: "Thailand", 말레이시아: "Malaysia", 필리핀: "Philippines", 싱가포르: "Singapore", 인도: "India", 아랍에미리트: "United Arab Emirates", UAE: "United Arab Emirates", 사우디: "Saudi Arabia", 카타르: "Qatar", 호주: "Australia", 중국: "China", 中: "China", 일본: "Japan", 日: "Japan", 대만: "Taiwan", 브라질: "Brazil" };

function extractAmountKo(text: string): string | null {
  const m = text.match(/\d[\d,.]*\s?조(?:\s?\d[\d,.]*\s?억)?\s?원?|\d[\d,.]*\s?억\s?(?:원|달러|유로)?|\d[\d,.]*\s?만\s?달러/);
  return m ? m[0].trim().replace(/(\d)\s+(조|억|만)/g, "$1$2") : null;
}

function guessCompanyKo(rawTitle: string): string {
  const t = rawTitle.replace(/^(\[[^\]]+\]|\([^)]+\)|【[^】]+】)\s*/g, "").trim();
  const m = t.match(/^([A-Za-z0-9가-힣&·.\-]{2,20}?)(?:,|\s?…|\s?·\s|(?:이|가|은|는)\s)/);
  if (!m) return "Unknown";
  const name = m[1].replace(/(이|가|은|는)$/, "");
  return /^(정부|국토부|산업부|중기부|지자체|올해|내년|국내|글로벌|업계|美|中|日)$/.test(name) ? "Unknown" : name;
}

function extractAmount(text: string): string {
  const m = text.match(/(?:US\$|\$|€|£|¥|₩|AED|SAR|A\$|AU\$|RM|VND|IDR|THB|PLN|HUF|EUR|USD)\s?\d[\d,.]*\s?(?:billion|million|bln|mln|bn|mn|m|b|trillion)?\b|\d[\d,.]*\s?(?:billion|million|bn|mn)\s?(?:dollars|euros|USD|EUR|won|yen|baht|ringgit|rupiah|dirhams|riyals|zloty|forint)/i);
  return m ? m[0].trim() : "Not Disclosed";
}

function guessCompany(rawTitle: string): string {
  // headline case ("Kia Plans ...") -> lower-case the verbs so the pattern can find the subject
  const VERBS = "to|plans?|may|might|could|would|will|invests?|opens?|breaks?|announces?|unveils?|expands?|builds?|selects?|signs?|starts?|launches?|commits?|eyes|picks|wins|adds?|secures?|unveils?|begins?|completes?|awards?|taps|chooses|is|has";
  const title = rawTitle.replace(new RegExp(`\\b(${VERBS})\\b`, "gi"), (m) => m.toLowerCase());
  const m = title.match(new RegExp(`^([A-Z][\\w&.'’-]*(?:(?:\\s+|,\\s*|\\s+and\\s+|\\s*&\\s*)[A-Z][\\w&.'’-]*){0,3})\\s+(?:${VERBS})\\b`));
  return m && !/^(New|The|A|An|How|Why|What|This|Report)\b/.test(m[1]) ? m[1] : "Unknown";
}

export function analyzeWithRules(input: AnalysisInput, settings: Settings): Analysis {
  const text = normalizeNumbers(`${input.title}\n${input.description ?? ""}\n${input.text ?? ""}`);
  const head = normalizeNumbers(`${input.title} ${input.description ?? ""}`);
  const rule = FACILITY_RULES.find((r) => r.re.test(head)) ?? FACILITY_RULES.find((r) => r.re.test(text));

  const korean = /[가-힣]/.test(input.title);
  const signal = settings.signals.find((s) => containsAny(head, s.keywords).length);
  const industryGroup = settings.industries.find((g) => containsAny(head, g.keywords).length);
  let country = "Unknown";
  for (const c of settings.countries) {
    if (containsAny(head, [c.name, ...c.aliases]).length) {
      country = c.name;
      break;
    }
  }
  if (!korean && country === "Unknown") {
    const st = US_STATES.find((x) => new RegExp(`\\b${x}\\b`).test(input.title));
    if (st) country = "United States";
  }
  if (korean) {
    const foreign = Object.keys(KO_COUNTRY).find((k) => input.title.includes(k));
    country = foreign ? KO_COUNTRY[foreign] : country === "Unknown" ? "South Korea" : country;
  }
  if (country === "Unknown") {
    for (const c of settings.countries) if (containsAny(text.slice(0, 3000), [c.name]).length) { country = c.name; break; }
  }
  const city = korean && country === "South Korea" ? KO_REGIONS.find((r) => input.title.includes(r)) ?? KO_REGIONS.find((r) => (input.description ?? "").includes(r)) ?? "Unknown" : "Unknown";
  const competitors = settings.competitors.filter((c) => containsAny(text, c.aliases.length ? c.aliases : [c.name]).length).map((c) => c.name);

  const investment = /invest|build|construct|expan|new (plant|factory|facility|warehouse|distribution)|break(s)? ground|groundbreaking|tender|rfp|\bplans?\b|\badds?\b|to open|commits?|\bsecures?\b|신설|증설|착공|건립|투자|투입|확장|구축|도입|입찰|발주|짓는|짓기|세운다|조성/i.test(head);
  const completed = /\b(opens|opened|inaugurat|officially launch|begins operations|started operations)\b/i.test(head) || (/(준공|개소|가동 시작|가동에 들어|문을 열)/.test(input.title) && !/(예정|계획|목표|추진)/.test(input.title));
  const earnings = (/\b(quarter|q[1-4]|earnings|revenue|profit|results)\b/i.test(input.title) || /(실적|영업이익|순이익|분기 매출)/.test(input.title)) && !investment;
  const isTender = /tender|rfp|request for proposal|procurement|입찰|발주|사업자 선정|공고/i.test(head);

  // South Korea = home market (HQ) — treated as strategic
  const strategic = country === "South Korea" || (settings.countries.find((c) => c.name === country)?.priority ?? false);
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
    maWithoutCapex: (/\b(acquires?|acquisition|merger|takeover)\b/i.test(input.title) || /(인수|합병)/.test(input.title)) && !investment,
    lowAutomationRelevance: !rule,
    insufficientEvidence: !input.text,
  };
  const sc = computeScore(bd, flags, settings, { publishedAt: input.publishedAt, eventDate: null });
  const relevant = Boolean(rule || competitors.length || investment);
  let category: ArticleCategory = !relevant ? "irrelevant" : sc.score >= 35 && investment ? "opportunity" : competitors.length ? "competitor" : "industry";
  if (category === "opportunity" && competitors.length && !investment) category = "competitor";

  const sentences = (input.description || input.text || "").split(/(?<=[.!?])\s+/).filter((s) => s.length > 30).slice(0, 3);
  const company = korean ? guessCompanyKo(input.title) : guessCompany(input.title);
  const amount = (korean ? extractAmountKo(head) ?? extractAmountKo(text.slice(0, 3000)) : null) ?? extractAmount(text);
  // project name only from words actually in the title (location + facility keyword); otherwise Unknown
  const place = city !== "Unknown" ? city : country !== "Unknown" && country !== "South Korea" ? (korean ? ((k) => (k ? KO_DISPLAY[k] ?? k : country))(Object.keys(KO_COUNTRY).find((k) => KO_COUNTRY[k] === country && input.title.includes(k))) : country) : "";
  const projectName = rule && investment ? `${place ? `${place} ` : ""}${korean ? rule.ko : rule.facility}${isTender ? (korean ? " 입찰·발주" : " tender") : completed ? "" : korean ? " 투자" : " project"}` : "Unknown";
  return {
    mode: "rules",
    model: null,
    analyzedAt: new Date().toISOString(),
    isRelevant: relevant,
    category,
    company,
    projectName,
    country,
    city,
    region: regionOf(country),
    industry: industryGroup?.name ?? rule?.industry ?? "Unknown",
    investmentAmount: amount,
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
    whyItMatters: rule ? `${korean ? rule.ko : rule.facility} 관련 투자 신호 — ${rule.solutions.slice(0, 3).join(", ")} 등 검토 가능 (규칙 기반 추정)` : "규칙 기반 분석: 관련성 확인 필요",
    facts: [input.title],
    inferences: [
      ...(rule ? [`시설 유형 '${rule.facility}'은 키워드 매칭 결과입니다.`] : []),
      ...(projectName !== "Unknown" ? ["프로젝트명은 제목에 나온 지역·시설 단어로 구성한 규칙 기반 표기입니다."] : []),
      ...(company !== "Unknown" ? ["기업명은 제목 첫머리에서 추출했습니다 (원문 확인 필요)."] : []),
    ],
    uncertainties: ["AI 분석 미연결 상태로 기업명·프로젝트명·일정은 원문 확인이 필요합니다."],
    competitorsMentioned: competitors,
    competitorActivity: competitors.length ? "경쟁사 언급 (세부 활동 미분류)" : "",
    sourceType: input.sourceType,
  };
}

export async function analyzeArticle(input: AnalysisInput, settings: Settings): Promise<{ analysis: Analysis; warning: string | null; weeklyAI?: WeeklyAIRaw }> {
  if (!aiConfigured()) return { analysis: analyzeWithRules(input, settings), warning: null };
  // circuit breaker: after a key / permission / model / daily-quota error, stop calling Gemini for 15 minutes
  const last = process.env.GEMINI_API_KEY ? geminiStats().lastError : null;
  if (last && ["auth", "permission", "model_not_found", "quota_daily", "not_configured"].includes(last.kind) && Date.now() - Date.parse(last.at) < 15 * 60_000) {
    return { analysis: analyzeWithRules(input, settings), warning: `Gemini 사용 불가 (${last.message}) — 수주기회 점수만 규칙 기반으로 계산 (보고서 요약은 만들지 않음)` };
  }
  try {
    const r = await analyzeWithAI(input, settings);
    return { analysis: r.analysis, weeklyAI: r.weekly, warning: null };
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `Anthropic API ${e.status ?? ""}: ${e.message}` : e instanceof Error ? e.message : String(e);
    // fail soft: keep the pipeline running with rules, but report the AI error
    return { analysis: analyzeWithRules(input, settings), warning: `AI 분석 실패 (${msg.slice(0, 200)}) — 수주기회 점수만 규칙 기반, 보고서 요약은 만들지 않음` };
  }
}
