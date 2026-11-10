// 보고서용 원문 검증 분석 (Gemini). Separate from the rule-based pre-classification:
//   1. read the publisher page (body text) — Google News redirects and unreadable pages lower the source level
//   2. Gemini extracts facts WITH verbatim evidence quotes and writes the 4-line summary from those facts only
//   3. deterministic guards (lib/report/validate) reject invented numbers / equipment / filler / India≠Indiana …
//   4. status: done · needs_review · insufficient_source · failed — never replaced by rule-generated text
import "server-only";
import type { Article, ReportAnalysis, Settings, SourceLevel } from "@/lib/types";
import { GeminiError, generateJSON, geminiConfigured } from "@/lib/ai/gemini";
import { verifyAndFetch } from "@/lib/pipeline/verify";
import { TAXONOMY } from "@/lib/weekly/taxonomy";
import { normalizeNumbers, validateSummary } from "./validate";

/** Bump when the prompt or the validation rules change: older results are re-analysed, current ones reused. */
export const REPORT_ANALYSIS_VERSION = "r3.1";

const SYSTEM = `당신은 현대무벡스(HYUNDAI MOVEX, 물류자동화: 자동창고 AS/RS·셔틀·AGV/AMR·컨베이어·소터·WMS/WCS, 제조물류, 공항 수하물·화물 시스템) 주간 업계동향 보고서 담당 애널리스트입니다.
기사 1건을 [SOURCE]만 근거로 분석해 JSON으로 답합니다.

절대 규칙
1. 사실은 [SOURCE]에 적힌 것만 사용. 기업명·금액·수치·연도·장소·설비·공급사를 지어내지 않는다. 모르면 빈 문자열.
2. 각 사실의 evidence에는 [SOURCE]의 원문 구절을 그대로(번역 없이, 40~200자) 인용한다. 인용할 구절이 없으면 그 사실은 빈 값.
3. 소재지(location)는 프로젝트·시설이 실제로 있는 곳. 기업 국적과 혼동 금지. Indiana/Indianapolis = 미국(인디애나주), Andhra Pradesh = 인도. 한국 소재 시설이면 국내.
4. 투자금액 용도(investment.purpose)를 구분: facility_capex(공장·센터 건설/증설 비용) · funding_round(투자유치·펀딩·시리즈 투자) · acquisition(인수) · total_program(그룹 전체 투자계획) · other · none. 투자유치 금액을 시설 투자비로 쓰지 않는다.
5. 시설 유형(facility.kind): production_plant(생산공장) · warehouse_dc(물류센터·창고) · rnd_center(연구소·R&D센터·innovation hub·lab·technology center) · office_org(조직 신설·법인·사무소) · product(제품·광고·캠페인) · policy · other · none. 연구소·기술센터·조직 신설을 '생산공장 신설'로 쓰지 않는다. 'manufacturing technology center'는 rnd_center.
6. 단계(stage): planned · approved · under_construction · completed_operating · organisation · announcement · other. 계획·착공·준공·가동을 구분한다.
7. 자동화(automation): 원문에 명시된 설비·기술만 items에 넣는다. 없으면 mentioned=false, items=[]. 원문에 없는 AGV·AMR·자동창고·컨베이어 등을 요약에 쓰지 않는다.
8. 공급사(supplier): 원문이 자동화 설비 공급사를 명시하면 decided. 입찰·선정 예정이면 undecided. 그 외 unknown. 건설사·시공사는 constructionCompany에 따로 쓰고 자동화 공급사로 보지 않는다.
9. report_type: opportunity(신규 시설 투자로 물류자동화 발주 가능성) · competitor(경쟁사 자체 활동: 수주·제품·R&D·M&A·진출) · trend(기술·시장·정책 동향) · exclude(광고·브랜드 캠페인·일반 홍보·인사·주가·사고 등 보고 가치 없음). 제품 광고·명절 캠페인은 exclude.
10. 분류(category.group/sub)는 아래 목록의 문자열만 사용. 국내 시설=domestic, 해외 시설=global(countryKo=국가 한국어), 경쟁사 자체 활동=competitor.
${Object.entries(TAXONOMY).map(([k, v]) => `   - ${k}: ${v.subs.join(" | ")}`).join("\n")}
   - review: 판단 불가

4줄 요약(summary) — 현대무벡스 주간 업계동향 보고서 문체(명사형 종결, 각 줄 20~40자, 기호 없음)
 1줄: 기업·기관의 실제 움직임 (누가, 어디서, 무엇을)
 2줄: 원문에서 확인된 핵심 수치(투자금액과 용도, 규모, 일정). 수치가 없으면 확인된 다른 핵심 사실
 3줄: 실제 사업 내용·기술·설비·추진 단계 (원문에 있는 내용만)
 4줄: 현대무벡스 사업 관점 시사점 (단정 금지, '…가능성 주목', '…동향 참고 필요' 등 완곡 표현. 원문에 없는 설비명 금지)
 - 기업명은 1줄에만. 줄끼리 같은 내용 반복 금지. 기사마다 고유한 사실과 수치 반영.
 - 금액은 원문 통화로: "$1.5 billion" → "15억 달러", "$650 million" → "6.5억 달러", "€39 million" → "3,900만 유로", "Rs 4,000 crore" → "4,000크로르 루피". '천만' 같은 혼합 단위는 쓰지 않는다.
 - 금지 문장: "업계 동향 참고", "원문 미기재", "관련 내용 언급", "○○ 소재", "자동화 설비 도입 여부 미확인"처럼 정보가 없는 문장.
 - 4줄을 원문 사실로 신뢰성 있게 채울 수 없으면 summary=[]로 두고 review_reasons에 이유를 쓴다.
 line_evidence: 1~3줄 각각을 뒷받침하는 원문 구절(그대로 인용), 4줄은 "".

형식 예시(가상의 'OO사' — 문체만 참고하고 내용·수치는 반드시 이 기사에서만):
 OO사, 미국 텍사스 물류센터 신설 추진
 5억 달러 투자·2027년 가동 목표
 자동창고·소터 도입 계획 원문 명시
 대형 물류거점 자동화 설비 수요 주목
 (자동화 언급이 없는 기사라면 3줄에 원문에 있는 실제 사업 내용을 쓰고, 4줄도 설비명 없이 작성)`;

const S = { type: "STRING" } as const;
const fact = { type: "OBJECT", properties: { value: S, evidence: S }, required: ["value", "evidence"] } as const;
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    report_type: { type: "STRING", enum: ["opportunity", "competitor", "trend", "exclude"] },
    exclude_reason: S,
    title_ko: S,
    company: fact,
    location: { type: "OBJECT", properties: { country: S, country_ko: S, city: S, evidence: S }, required: ["country", "country_ko", "city", "evidence"] },
    facility: { type: "OBJECT", properties: { kind: { type: "STRING", enum: ["production_plant", "warehouse_dc", "rnd_center", "office_org", "product", "policy", "other", "none"] }, type: S, evidence: S }, required: ["kind", "type", "evidence"] },
    stage: { type: "OBJECT", properties: { value: { type: "STRING", enum: ["planned", "approved", "under_construction", "completed_operating", "organisation", "announcement", "other"] }, evidence: S }, required: ["value", "evidence"] },
    investment: { type: "OBJECT", properties: { amount: S, purpose: { type: "STRING", enum: ["facility_capex", "funding_round", "acquisition", "total_program", "other", "none"] }, evidence: S }, required: ["amount", "purpose", "evidence"] },
    schedule: fact,
    automation: { type: "OBJECT", properties: { mentioned: { type: "BOOLEAN" }, items: { type: "ARRAY", items: S }, evidence: S }, required: ["mentioned", "items", "evidence"] },
    supplier: { type: "OBJECT", properties: { status: { type: "STRING", enum: ["decided", "undecided", "unknown"] }, name: S, evidence: S }, required: ["status", "name", "evidence"] },
    construction_company: S,
    order_potential: { type: "STRING", enum: ["high", "medium", "low"] },
    category: { type: "OBJECT", properties: { group: { type: "STRING", enum: ["global", "domestic", "competitor", "review"] }, sub: S, country_ko: S }, required: ["group", "sub", "country_ko"] },
    summary: { type: "ARRAY", items: S },
    line_evidence: { type: "ARRAY", items: S },
    confidence: { type: "STRING", enum: ["high", "medium", "low"] },
    review_reasons: { type: "ARRAY", items: S },
  },
  required: ["report_type", "exclude_reason", "title_ko", "company", "location", "facility", "stage", "investment", "schedule", "automation", "supplier", "construction_company", "order_potential", "category", "summary", "line_evidence", "confidence", "review_reasons"],
};

interface Raw {
  report_type?: string; exclude_reason?: string; title_ko?: string;
  company?: { value?: string; evidence?: string };
  location?: { country?: string; country_ko?: string; city?: string; evidence?: string };
  facility?: { kind?: string; type?: string; evidence?: string };
  stage?: { value?: string; evidence?: string };
  investment?: { amount?: string; purpose?: string; evidence?: string };
  schedule?: { value?: string; evidence?: string };
  automation?: { mentioned?: boolean; items?: string[]; evidence?: string };
  supplier?: { status?: string; name?: string; evidence?: string };
  construction_company?: string; order_potential?: string;
  category?: { group?: string; sub?: string; country_ko?: string };
  summary?: string[]; line_evidence?: string[]; confidence?: string; review_reasons?: string[];
}

export interface SourceText { level: SourceLevel; text: string; chars: number; url: string | null; publishedAt: string | null; publishedAtBasis: string | null }

/** Read the article: direct publisher page body when possible; otherwise title + excerpt only. */
export async function readSource(a: Article): Promise<SourceText> {
  const excerpt = (a.excerpt ?? "").trim();
  let body = "";
  let url: string | null = null;
  let publishedAt: string | null = null;
  let basis: string | null = null;
  if (!a.viaGoogleNews && !/news\.google\.com/.test(a.url)) {
    try {
      const page = await verifyAndFetch(a.url, 15000);
      if (page.text && page.text.length > 200) { body = page.text; url = page.verification.finalUrl || a.url; }
      if (page.publishedAt) { publishedAt = page.publishedAt; basis = page.publishedAtBasis; }
    } catch { /* unreadable → excerpt level */ }
  }
  const text = normalizeNumbers([`TITLE: ${a.title}`, excerpt ? `EXCERPT: ${excerpt}` : "", body ? `BODY:\n${body.slice(0, 9000)}` : ""].filter(Boolean).join("\n\n"));
  const level: SourceLevel = body.length >= 600 ? "body" : excerpt.length >= 100 || body.length > 200 ? "excerpt" : "title";
  return { level, text, chars: body.length || excerpt.length, url, publishedAt, publishedAtBasis: basis };
}

const str = (v: unknown, n = 300) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed as readonly string[]).includes(str(v)) ? (str(v) as T) : d;
/** An evidence quote only counts if it really occurs in the source (whitespace-insensitive). */
export function quoteInSource(quote: string, source: string): boolean {
  const q = normalizeNumbers(quote).replace(/\s+/g, " ").trim().toLowerCase();
  if (q.length < 8) return false;
  const s = normalizeNumbers(source).replace(/\s+/g, " ").toLowerCase();
  if (s.includes(q)) return true;
  // allow trimmed / elided quotes: every 30-char chunk must be present
  const chunks = q.split(/…|\.\.\./).map((x) => x.trim()).filter((x) => x.length >= 12);
  return chunks.length > 0 && chunks.every((c) => s.includes(c.slice(0, 60)));
}

/** Map + validate a Gemini result. Pure (no I/O) so it can be unit-tested with recorded responses. */
export function buildReportAnalysis(raw: Raw, src: SourceText, model: string | null): ReportAnalysis {
  const reasons: string[] = [...(raw.review_reasons ?? []).map((x) => str(x, 160)).filter(Boolean)];
  const ev = (q: unknown) => { const s = str(q, 400); return s && quoteInSource(s, src.text) ? s : ""; };
  const summary = (raw.summary ?? []).map((l) => str(l, 80).replace(/^\s*([§⇒•\-*·]|\d{1,2}[.)](?!\d))\s*/u, "")).filter(Boolean);
  const lineEvidence = [0, 1, 2, 3].map((i) => (i < 3 ? ev(raw.line_evidence?.[i]) : ""));
  const group = oneOf(raw.category?.group, ["global", "domestic", "competitor", "review"] as const, "review");
  const subs = group === "review" ? [] : (TAXONOMY[group].subs as readonly string[]);
  const sub = subs.includes(str(raw.category?.sub)) ? str(raw.category?.sub) : "";
  const location = { country: str(raw.location?.country, 60), countryKo: str(raw.location?.country_ko, 30), city: str(raw.location?.city, 60), evidence: ev(raw.location?.evidence) };
  const investment = { amount: str(raw.investment?.amount, 80), purpose: oneOf(raw.investment?.purpose, ["facility_capex", "funding_round", "acquisition", "total_program", "other", "none"] as const, "none"), evidence: ev(raw.investment?.evidence) };
  const r: ReportAnalysis = {
    version: REPORT_ANALYSIS_VERSION,
    status: "done",
    analyzedAt: new Date().toISOString(),
    model,
    sourceLevel: src.level,
    sourceChars: src.chars,
    sourceUrl: src.url,
    error: null,
    reviewReasons: [],
    reportType: oneOf(raw.report_type, ["opportunity", "competitor", "trend", "exclude"] as const, "trend"),
    excludeReason: str(raw.exclude_reason, 160),
    titleKo: str(raw.title_ko, 200),
    company: { value: str(raw.company?.value, 80), evidence: ev(raw.company?.evidence) },
    location,
    facility: { kind: oneOf(raw.facility?.kind, ["production_plant", "warehouse_dc", "rnd_center", "office_org", "product", "policy", "other", "none"] as const, "none"), type: str(raw.facility?.type, 80), evidence: ev(raw.facility?.evidence) },
    stage: { value: oneOf(raw.stage?.value, ["planned", "approved", "under_construction", "completed_operating", "organisation", "announcement", "other"] as const, "other"), evidence: ev(raw.stage?.evidence) },
    investment,
    schedule: { value: str(raw.schedule?.value, 80), evidence: ev(raw.schedule?.evidence) },
    automation: { mentioned: raw.automation?.mentioned === true, items: (raw.automation?.items ?? []).map((x) => str(x, 40)).filter(Boolean).slice(0, 8), evidence: ev(raw.automation?.evidence) },
    supplier: { status: oneOf(raw.supplier?.status, ["decided", "undecided", "unknown"] as const, "unknown"), name: str(raw.supplier?.name, 80), evidence: ev(raw.supplier?.evidence) },
    constructionCompany: str(raw.construction_company, 80),
    orderPotential: oneOf(raw.order_potential, ["high", "medium", "low"] as const, "low"),
    category: { group: group === "review" || sub ? group : "review", sub: sub || "확인 필요", countryKo: group === "global" ? str(raw.category?.country_ko, 30) : "" },
    summary: summary.slice(0, 4),
    lineEvidence,
    confidence: oneOf(raw.confidence, ["high", "medium", "low"] as const, "low"),
  };

  // ---- guards
  if (!summary.length) reasons.unshift("AI가 원문만으로 4줄 요약을 작성할 수 없다고 판단");
  else reasons.push(...validateSummary(summary, src.text, { countryKo: location.countryKo || r.category.countryKo, investmentPurpose: investment.purpose }));
  if (summary.length && lineEvidence.slice(0, 3).filter(Boolean).length < 2) reasons.push("요약 근거 원문 구절 확인 부족 (1~3줄 중 2줄 이상 인용 필요)");
  if (investment.amount && !investment.evidence) reasons.push("투자금액의 원문 근거 구절 없음");
  if (r.category.group === "review") reasons.push("카테고리 판단 불가");
  if (r.confidence === "low") reasons.push("AI 신뢰도 낮음");
  if (src.level === "title") reasons.push("원문 본문·발췌를 읽지 못해 제목만으로 분석");
  if (r.supplier.status === "decided" && !r.supplier.evidence) { r.supplier = { status: "unknown", name: "", evidence: "" }; reasons.push("공급사 확정 근거 없음 → 확인 불가로 변경"); }
  if (r.automation.mentioned && !r.automation.evidence) { r.automation = { mentioned: false, items: [], evidence: "" }; reasons.push("자동화 언급 근거 없음 → 미언급으로 변경"); }
  r.reviewReasons = [...new Set(reasons)];
  r.status = !summary.length && src.level === "title" ? "insufficient_source" : r.reviewReasons.length ? "needs_review" : "done";
  return r;
}

export function failedAnalysis(e: unknown, src: SourceText | null, model: string | null): ReportAnalysis {
  const ge = e instanceof GeminiError ? e : null;
  return {
    version: REPORT_ANALYSIS_VERSION, status: "failed", analyzedAt: new Date().toISOString(), model,
    sourceLevel: src?.level ?? "title", sourceChars: src?.chars ?? 0, sourceUrl: src?.url ?? null,
    error: { kind: ge?.kind ?? "error", message: (e instanceof Error ? e.message : String(e)).slice(0, 240), status: ge?.status ?? null },
    reviewReasons: ["AI 분석 실패 — 요약을 만들지 않음 (규칙 기반 문장으로 대체하지 않음)"],
    reportType: null, excludeReason: "", titleKo: "", company: { value: "", evidence: "" }, location: { country: "", countryKo: "", city: "", evidence: "" },
    facility: { kind: "none", type: "", evidence: "" }, stage: { value: "other", evidence: "" }, investment: { amount: "", purpose: "none", evidence: "" },
    schedule: { value: "", evidence: "" }, automation: { mentioned: false, items: [], evidence: "" }, supplier: { status: "unknown", name: "", evidence: "" },
    constructionCompany: "", orderPotential: "low", category: { group: "review", sub: "확인 필요", countryKo: "" }, summary: [], lineEvidence: ["", "", "", ""], confidence: "low",
  };
}

export function insufficientAnalysis(src: SourceText): ReportAnalysis {
  return { ...failedAnalysis(new Error("원문 부족"), src, null), status: "insufficient_source", error: null, reviewReasons: ["원문 본문·발췌를 확보하지 못함 — 제목만으로는 요약하지 않음 (원문 URL 확인 필요)"] };
}

/** Reuse policy (protects the free quota): current-version results are kept; failed / insufficient / old ones may be re-run. */
export function needsAnalysis(a: Article, opts: { retryFailed: boolean }): boolean {
  const r = a.report;
  if (!r || r.version !== REPORT_ANALYSIS_VERSION) return true;
  if (r.status === "failed" || r.status === "insufficient_source") return opts.retryFailed;
  return false;
}

/** Full pipeline for one article. Updates the article's date from the page metadata when found. */
export async function analyzeForReport(a: Article, settings: Settings): Promise<ReportAnalysis> {
  void settings;
  if (!geminiConfigured()) return failedAnalysis(new GeminiError("not_configured", null, ""), null, null);
  const src = await readSource(a);
  if (src.publishedAt && !/^원문 메타데이터/.test(a.publishedAtBasis ?? "")) {
    a.publishedAt = src.publishedAt;
    a.publishedAtBasis = `원문 메타데이터 (${src.publishedAtBasis})`;
  }
  if (src.level === "title") return insufficientAnalysis(src);
  const comps = settings.competitors.map((c) => c.name).join(", ");
  const user = [
    `발행 매체: ${a.sourceName} (${a.sourceDomain})`,
    `발행일(메타데이터): ${a.publishedAt ?? "미확인"}`,
    `원문 확보 수준: ${src.level === "body" ? "기사 본문" : "제목·발췌문만 (본문 미확보 — 발췌에 없는 사실은 쓰지 말 것)"}`,
    `경쟁사 목록: ${comps}. ESR·Prologis·GLP 등 물류부동산 개발사는 경쟁사가 아님. LG CNS·포스코DX·삼성SDS·LX판토스는 물류자동화 사업 기사일 때만 경쟁사.`,
    "",
    "[SOURCE]",
    src.text,
    "[/SOURCE]",
  ].join("\n");
  try {
    const r = await generateJSON<Raw>({ system: SYSTEM, user, schema: RESPONSE_SCHEMA, maxOutputTokens: 6000, temperature: 0.1 });
    return buildReportAnalysis(r.data, src, r.model);
  } catch (e) {
    return failedAnalysis(e, src, null);
  }
}
