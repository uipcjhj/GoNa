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
import { amountTable, cleanSummaryLines, fixAmountScale, normalizeNumbers, validateSummary } from "./validate";

/** Bump when the prompt or the validation rules change: older results are re-analysed, current ones reused. */
export const REPORT_ANALYSIS_VERSION = "r3.1";
/** Prompt / post-processing revision. Older results stay valid (no automatic overwrite) but can be re-run on request. */
export const PROMPT_REV = "p3";

const SYSTEM = `당신은 현대무벡스(HYUNDAI MOVEX, 물류자동화: 자동창고 AS/RS·셔틀·AGV/AMR·컨베이어·소터·WMS/WCS, 제조물류, 공항 수하물·화물 시스템) 주간 업계동향 보고서 담당 애널리스트입니다.
기사 1건을 [SOURCE]만 근거로 분석해 JSON으로 답합니다.

절대 규칙
1. 사실은 [SOURCE]에 적힌 것만 사용. 기업명·금액·수치·연도·장소·설비·공급사를 지어내지 않는다. 모르면 빈 문자열.
2. 각 사실의 evidence에는 [SOURCE]의 원문 구절을 그대로(번역 없이, 40~200자) 인용한다. 인용할 구절이 없으면 그 사실은 빈 값.
3. 소재지(location)는 프로젝트·시설이 실제로 있는 곳. 기업 국적과 혼동 금지. Indiana/Indianapolis = 미국(인디애나주), Andhra Pradesh = 인도. 한국 소재 시설이면 국내.
4. 금액 성격(investment.purpose)을 구분: facility_capex(시설 건설·증설 투자) · funding_round(투자유치·펀딩) · conditional_loan(조건부 대출·융자) · equity(자기자본 투입) · valuation(기업가치) · contract_value(계약·수주액) · acquisition(인수) · total_program(전체 투자계획) · other · none. 서로 다른 금액(예: 대출+자기자본=총사업비)을 섞지 않는다.
5. 시설 유형(facility.kind): production_plant(생산공장) · warehouse_dc(물류센터·창고) · rnd_center(연구소·R&D센터·innovation hub·lab·technology center) · office_org(조직 신설·법인·사무소) · product(제품·광고·캠페인) · policy · other · none. 연구소·기술센터·조직 신설을 '생산공장 신설'로 쓰지 않는다. 'manufacturing technology center'는 rnd_center.
6. 단계(stage): planned · approved · under_construction · completed_operating · organisation · announcement · other. 계획·착공·준공·가동을 구분한다.
7. 자동화(automation): 원문에 명시된 설비·기술만 items에 넣는다. 없으면 mentioned=false, items=[]. 원문에 없는 AGV·AMR·자동창고·컨베이어 등을 요약에 쓰지 않는다.
8. 공급사(supplier): 원문이 자동화 설비 공급사를 명시하면 decided. 입찰·선정 예정이면 undecided. 그 외 unknown. 건설사·시공사는 constructionCompany에 따로 쓰고 자동화 공급사로 보지 않는다.
9. report_type: opportunity(신규 시설 투자로 물류자동화 발주 가능성) · competitor(경쟁사 자체 활동: 수주·제품·R&D·M&A·진출) · trend(기술·시장·정책 동향) · exclude(광고·브랜드 캠페인·일반 홍보·인사·주가·사고 등 보고 가치 없음). 제품 광고·명절 캠페인은 exclude.
10. 분류(category.group/sub)는 아래 목록의 문자열만 사용. 국내 시설=domestic, 해외 시설=global(countryKo=국가 한국어), 경쟁사 자체 활동=competitor.
${Object.entries(TAXONOMY).map(([k, v]) => `   - ${k}: ${v.subs.join(" | ")}`).join("\n")}
   - review: 판단 불가

4줄 요약(summary) — 요약 작성은 수주 가능성·관련성 판단과 완전히 별개
 - [SOURCE]에 사실이 충분하면 수주 가능성이 낮아도 반드시 4줄을 쓴다. 경쟁사 동향, 피지컬 AI, 서비스로봇, 드론·방산 제조, 시장·정책동향도 정상 요약한다.
 - 관련성이 낮다는 판단은 report_type / order_potential에만 반영하고, 요약을 비우는 이유가 될 수 없다.
 - summary를 비우는 경우는 [SOURCE]가 제목 한 줄뿐이거나 확인 가능한 사실이 2개 미만일 때만이며, 그때 summary_status="insufficient_source".
 형식: summary 배열에 정확히 4개 문자열, 각 줄 20~40자, 명사형 보고서체(…추진/확대/계획/예정/부각). 번호(1. 2.)·기호·머리말·따옴표 없이 문장만
 1줄: 주체와 핵심 사업 (누가, 어디서, 무엇을)
 2줄: 투자규모·시설규모·일정 등 구체적 수치 (금액은 성격을 함께: 시설 투자 / 투자유치 / 조건부 대출 / 자기자본 / 기업가치 / 계약액). 원문이 금액을 대출·자기자본 등으로 나누면 구성을 밝힌다 (예: "총 X억 달러, 조건부 대출 Y억·자기자본 Z억"). 수치가 없으면 확인된 다른 핵심 사실
 3줄: 실제 설비·기술·사업범위 (원문에 확정된 내용만)
 4줄: 현대무벡스 관점의 구체적 사업 시사점 — 기사 유형별로:
   · 신규 물류센터 → 당사 자동창고·Sorter·이송설비 잠재 수요
   · 제조공장 신·증설 → 공정물류·AGV·자동창고 적용 가능성
   · 콜드체인 → 저온 자동보관·이송 설비 수요
   · 경쟁사 수주·M&A → 당사 경쟁 구도와 시장 영향
   · 경쟁사 신제품 → 솔루션 경쟁력·차별화 필요성
   · 피지컬 AI·로봇 → 당사 로봇·통합제어 사업 연관성
   · 정책·시장동향 → 당사 고객 산업의 투자환경·사업기회 변화
   추정은 '가능성', '잠재 수요'로 표현하고, 기사 고유의 산업·제품·지역을 넣어 다른 기사에 그대로 붙일 수 없게 쓴다. 관련성이 낮으면 수주기회를 억지로 만들지 말고 고객 산업 관점으로 쓴다.
   나쁜 4줄 예: "대규모 방산 제조 시설 확장 관련 물류자동화 수요 동향 참고 필요" (상투적·비구체적)
   좋은 4줄 예: "드론 양산 전환 시 부품 입고·조립 공정물류 자동화 수요 가능성" (산업·공정·당사 설비 연결)
 - 네 줄은 서로 다른 핵심 정보. 같은 내용 반복·기업명 반복 금지(기업명은 1줄에만).
 - 원문 확정 사실(1~3줄)과 현대무벡스 관점 추정(4줄)을 섞지 않는다. 원문에 없는 AGV·AMR·자동창고·컨베이어 도입을 사실처럼 쓰지 않는다.
 - 금액은 [AMOUNTS]에 주어진 한국어 환산값을 그대로 쓴다 (직접 환산 금지: "$21.5 billion"은 "215억 달러"이지 "21.5억 달러"가 아님).
 - 금지 문장: "업계 동향 참고", "관련 설비 수요 동향 참고 필요", "…동향 주목", "…참고 필요", "자동화 설비 도입 여부 원문 미확인", "원문 미기재", "관련 내용 언급", "○○ 소재" 등 정보 없는 상투문구.
 line_evidence: 1~3줄 각각을 뒷받침하는 원문 구절(그대로 인용), 4줄은 "".

문장 밀도 예시 — 현대무벡스 실제 보고서. 문체·밀도만 참고하고, 예시의 기업명·금액·설비·지명은 절대 다른 기사에 쓰지 말 것:
 [예시1 신규 투자]
 Worldpac, 美 조지아 포레스트파크에 41.3만ft² 물류센터 추진
 AutoStore 로봇 기반 자동보관·피킹 시스템 도입 계획
 2027년 상반기 가동 예정, 기존 센터 대비 25만ft² 이상 확대
 자동차 부품 유통망의 고밀도 보관·자동피킹 투자 확대 부각
 [예시2 경쟁사 M&A]
 노르웨이 AutoStore, 네덜란드 Logiqs 인수 합의
 최대 3,000만 유로 거래, 2026년 4분기 종결 예정
 Logiqs 팔레트 이송·보관 로봇 기술, 약 30개 고객 현장 적용
 박스형 자동창고에서 팔레트 AS/RS로 솔루션 확장 가속
 [예시3 경쟁사 수주]
 티로보틱스, 포드에너지 ESS 자동화 설비 약 40억원 추가 수주
 포트 컨베이어·전기제어·설치·테스트까지 공급 범위 확대
 기존 AMR·랙 자동화 포함 누적 수주 약 230억원 기록
 북미 배터리 제조물류 자동화 경쟁 심화
 [예시4 기술·시장 동향]
 LG CNS, 로봇 전환 플랫폼 피지컬웍스 기반 사업화 추진
 로봇 학습 포지·통합운영 바통 활용, 제조·물류 PoC 확대
 포스코DX, 제철소 크레인·원료이송 설비 AI 지능화 추진
 제조·물류 설비와 다종 로봇 통합관제 시장 경쟁 심화 부각`;

const PURPOSES = ["facility_capex", "funding_round", "conditional_loan", "equity", "valuation", "contract_value", "acquisition", "total_program", "other", "none"] as const;
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
    investment: { type: "OBJECT", properties: { amount: S, purpose: { type: "STRING", enum: PURPOSES as unknown as string[] }, evidence: S }, required: ["amount", "purpose", "evidence"] },
    schedule: fact,
    automation: { type: "OBJECT", properties: { mentioned: { type: "BOOLEAN" }, items: { type: "ARRAY", items: S }, evidence: S }, required: ["mentioned", "items", "evidence"] },
    supplier: { type: "OBJECT", properties: { status: { type: "STRING", enum: ["decided", "undecided", "unknown"] }, name: S, evidence: S }, required: ["status", "name", "evidence"] },
    construction_company: S,
    order_potential: { type: "STRING", enum: ["high", "medium", "low"] },
    category: { type: "OBJECT", properties: { group: { type: "STRING", enum: ["global", "domestic", "competitor", "review"] }, sub: S, country_ko: S }, required: ["group", "sub", "country_ko"] },
    summary_status: { type: "STRING", enum: ["written", "insufficient_source"] },
    summary: { type: "ARRAY", items: S },
    line_evidence: { type: "ARRAY", items: S },
    confidence: { type: "STRING", enum: ["high", "medium", "low"] },
    review_reasons: { type: "ARRAY", items: S },
  },
  required: ["report_type", "exclude_reason", "title_ko", "company", "location", "facility", "stage", "investment", "schedule", "automation", "supplier", "construction_company", "order_potential", "category", "summary_status", "summary", "line_evidence", "confidence", "review_reasons"],
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
  summary_status?: string; summary?: string[]; line_evidence?: string[]; confidence?: string; review_reasons?: string[];
}

export interface SourceText { level: SourceLevel; text: string; chars: number; url: string | null; publishedAt: string | null; publishedAtBasis: string | null }

/** Read the article: direct publisher page body when possible; otherwise title + excerpt only. */
export async function readSource(a: Article): Promise<SourceText> {
  const excerpt = (a.excerpt ?? "").trim();
  let body = "";
  let url: string | null = null;
  let publishedAt: string | null = null;
  let basis: string | null = null;
  if (a.manualBody && a.manualBody.trim().length > 100) {
    body = a.manualBody.trim(); // 사용자가 직접 붙여넣은 원문 본문
    url = null;
  } else if (!a.viaGoogleNews && !/news\.google\.com/.test(a.url)) {
    for (const timeout of [15000, 30000]) { // one retry with a longer timeout
      try {
        const page = await verifyAndFetch(a.url, timeout);
        if (page.publishedAt) { publishedAt = page.publishedAt; basis = page.publishedAtBasis; }
        if (page.text && page.text.length > 200) { body = page.text; url = page.verification.finalUrl || a.url; break; }
        if (page.verification.status === "verified") break; // page read fine, just no article text
      } catch { /* retry once */ }
    }
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
  const cleaned = cleanSummaryLines(raw.summary ?? []).map((l) => l.slice(0, 80)); // numbering / labels / quotes removed, "\n" splits
  const scale = fixAmountScale(cleaned, src.text); // "21.5억 달러" for "$21.5 billion" → "215억 달러"
  const summary = scale.lines;
  const lineEvidence = [0, 1, 2, 3].map((i) => (i < 3 ? ev(raw.line_evidence?.[i]) : ""));
  const group = oneOf(raw.category?.group, ["global", "domestic", "competitor", "review"] as const, "review");
  const subs = group === "review" ? [] : (TAXONOMY[group].subs as readonly string[]);
  const sub = subs.includes(str(raw.category?.sub)) ? str(raw.category?.sub) : "";
  const location = { country: str(raw.location?.country, 60), countryKo: str(raw.location?.country_ko, 30), city: str(raw.location?.city, 60), evidence: ev(raw.location?.evidence) };
  const investment = { amount: str(raw.investment?.amount, 80), purpose: oneOf(raw.investment?.purpose, PURPOSES, "none"), evidence: ev(raw.investment?.evidence) };
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
  // summarising does not depend on relevance: an empty summary is only acceptable when the source is too thin
  const refused = !summary.length && src.level !== "title" && src.chars >= 400;
  if (!summary.length) reasons.unshift(refused ? "원문이 충분한데 AI가 요약을 비움 (관련성 판단과 혼동) — 재분석 필요" : "원문 정보 부족으로 요약 보류");
  else reasons.push(...validateSummary(summary, src.text, { countryKo: location.countryKo || r.category.countryKo, investmentPurpose: investment.purpose }));
  if (summary.length && lineEvidence.slice(0, 3).filter(Boolean).length < 2) reasons.push("요약 근거 원문 구절 확인 부족 (1~3줄 중 2줄 이상 인용 필요)");
  if (investment.amount && !investment.evidence) reasons.push("투자금액의 원문 근거 구절 없음");
  if (r.category.group === "review") reasons.push("카테고리 판단 불가");
  if (r.confidence === "low") reasons.push("AI 신뢰도 낮음");
  if (src.level === "title") reasons.push("원문 본문·발췌를 읽지 못해 제목만으로 분석");
  if (r.supplier.status === "decided" && !r.supplier.evidence) { r.supplier = { status: "unknown", name: "", evidence: "" }; reasons.push("공급사 확정 근거 없음 → 확인 불가로 변경"); }
  if (r.automation.mentioned && !r.automation.evidence) { r.automation = { mentioned: false, items: [], evidence: "" }; reasons.push("자동화 언급 근거 없음 → 미언급으로 변경"); }
  r.reviewReasons = [...new Set(reasons)];
  r.autoFixes = scale.fixes;
  r.promptRev = PROMPT_REV;
  r.status = !summary.length && !refused ? "insufficient_source" : r.reviewReasons.length ? "needs_review" : "done";
  return r;
}

/** Rewrite only for summary-quality problems the model can fix (not for missing source / category doubts). */
export function shouldRewrite(r: ReportAnalysis): boolean {
  if (r.status !== "needs_review") return false;
  return r.reviewReasons.some((x) => /(4줄|줄|요약을 비움|반복|상투|의미 없는|원문에 없는 수치|원문에 없는 자동화|금액|대출|자기자본|기업가치|투자유치|예시 문장|기호|길|짧은)/.test(x));
}
export function pickBetter(a: ReportAnalysis, b: ReportAnalysis): ReportAnalysis {
  const score = (r: ReportAnalysis) => (r.status === "done" ? 0 : 100) + r.reviewReasons.length * 10 - r.summary.length;
  const best = score(b) <= score(a) ? b : a;
  return { ...best, autoFixes: [...(best.autoFixes ?? []), `Gemini 1회 재작성 (${best === b ? "재작성본 채택" : "원본 유지"})`] };
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
export function needsAnalysis(a: Article, opts: { retryFailed: boolean; upgrade?: boolean }): boolean {
  const r = a.report;
  if (!r || r.version !== REPORT_ANALYSIS_VERSION) return true;
  if (r.status === "failed" || r.status === "insufficient_source") return opts.retryFailed;
  // summary left empty although the source was readable (old prompt refused low-relevance articles)
  if (!r.summary.length && r.sourceLevel !== "title") return opts.retryFailed;
  if (opts.upgrade && r.promptRev !== PROMPT_REV) return true; // explicit re-run with the newer prompt
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
    "[AMOUNTS] 원문 금액 → 한국어 환산 (요약에는 이 환산값만 사용, 성격은 원문 문맥 기준 추정):",
    ...(amountTable(src.text).map((x) => `- ${x.raw} = ${x.ko} (${x.nature})`) || []),
    "[/AMOUNTS]",
    "",
    "[SOURCE]",
    src.text,
    "[/SOURCE]",
  ].join("\n");
  try {
    const r = await generateJSON<Raw>({ system: SYSTEM, user, schema: RESPONSE_SCHEMA, maxOutputTokens: 6000, temperature: 0.1 });
    const first = buildReportAnalysis(r.data, src, r.model);
    if (!shouldRewrite(first)) return first;
    // one rewrite with the concrete problems; if it still fails, the better result is kept as 사용자 검토 필요
    try {
      const fix = [
        user, "", "[REVISE] 직전 답변의 4줄 요약이 기준에 미달했습니다. 같은 원문 사실만으로 JSON 전체를 다시 작성하세요.",
        `직전 요약: ${first.summary.join(" / ") || "(비어 있음)"}`,
        `문제: ${first.reviewReasons.join(" · ")}`,
      ].join("\n");
      const r2 = await generateJSON<Raw>({ system: SYSTEM, user: fix, schema: RESPONSE_SCHEMA, maxOutputTokens: 6000, temperature: 0.2 });
      const second = buildReportAnalysis(r2.data, src, r2.model);
      return pickBetter(first, second);
    } catch {
      return first; // rewrite call failed (quota etc.) → keep the first result for review
    }
  } catch (e) {
    return failedAnalysis(e, src, null);
  }
}
