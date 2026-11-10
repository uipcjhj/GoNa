// Regression tests for the weekly-report accuracy problems found in the generated Excel (2026-11 review).
// Run: npm test
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { containsAny } from "@/lib/util/text";
import { weeklyRules } from "@/lib/weekly/classify";
import { analyzeWithRules } from "@/lib/pipeline/analyze";
import { amountsIn, normalizeNumbers, unsupportedAutomation, unsupportedNumbers, validateSummary, fillerLines } from "@/lib/report/validate";
import { buildReportAnalysis, analyzeForReport, quoteInSource, type SourceText } from "@/lib/report/factcheck";
import { chooseModel } from "@/lib/ai/gemini";
import { curate } from "@/lib/weekly/curate";
import { storyMatcher } from "@/lib/weekly/story";
import { reportLines, NO_SUMMARY } from "@/lib/weekly/export";
import { article, aiResult, row, settings } from "./helpers";

const rulesOf = (title: string, excerpt: string | null = null) => weeklyRules(article({ title, excerpt }), settings, null);

describe("국가·소재지", () => {
  test("Indiana(미국)를 India(인도)로 분류하지 않는다", () => {
    assert.deepEqual(containsAny("Haviland Pool & Spa to expand manufacturing plant in Indiana", ["India"]), []);
    const w = rulesOf("Haviland Pool & Spa to expand manufacturing plant in Indiana", "The pool chemicals maker will add 120 jobs at its facility in Indiana.");
    assert.notEqual(w.country, "India");
    assert.equal(w.country, "United States");
    const a = analyzeWithRules({ title: "Haviland Pool & Spa to expand manufacturing plant in Indiana", url: "https://x", sourceName: "x", sourceType: "Media Report", publishedAt: null, sourceCountry: null, description: null, text: null }, settings);
    assert.equal(a.country, "United States");
  });
  test("Andhra Pradesh 기사는 인도로 인식 (India 단어 있음)", () => {
    const w = rulesOf("Kia India Plans $1.5 Billion Investment in Andhra Pradesh");
    assert.equal(w.country, "India");
  });
  test("AI가 Indiana 기사를 인도로 쓰면 검토 대상으로 막는다", () => {
    const r = validateSummary(["Haviland, 인도 공장 증설 추진", "120명 신규 고용 계획", "수영장 화학제품 생산 확대", "제조 물류 수요 참고 필요"], "Haviland will add 120 jobs at its plant in Indiana.", { countryKo: "인도" });
    assert.ok(r.some((x) => x.includes("Indiana")), r.join(" | "));
  });
});

describe("금액 파싱", () => {
  test("GDELT식 '$1 . 5 Billion'은 $1이 아니라 15억 달러", () => {
    const n = normalizeNumbers("Kia Plans $1 . 5 Billion Andhra Pradesh Expansion");
    assert.match(n, /\$1\.5 Billion/);
    const amts = amountsIn("Kia Plans $1 . 5 Billion Andhra Pradesh Expansion");
    assert.equal(amts[0]?.value, 1.5e9);
    assert.equal(amts[0]?.currency, "USD");
    const a = analyzeWithRules({ title: "Kia Plans $1 . 5 Billion Andhra Pradesh Expansion", url: "https://x", sourceName: "x", sourceType: "Media Report", publishedAt: null, sourceCountry: null, description: null, text: null }, settings);
    assert.notEqual(a.investmentAmount, "$1");
  });
  test("요약의 '15억 달러'는 원문 '$1.5 billion'과 일치, '$1 규모'는 불일치", () => {
    const src = "Kia plans $1 . 5 billion investment to expand Andhra Pradesh plant";
    assert.deepEqual(unsupportedNumbers(["15억 달러 투자로 증설 추진"], src), []);
    assert.ok(unsupportedNumbers(["$1 규모"], src).length > 0);
    assert.ok(unsupportedNumbers(["20억 달러 투자"], src).length > 0, "없는 금액은 거부");
  });
  test("단위 환산 수치(41.3만 ft² = 413,000 sq ft, 35명)는 통과, 없는 연도는 거부", () => {
    const src = "a 413,000-square-foot facility opening in 2027 that will create 35 jobs";
    assert.deepEqual(unsupportedNumbers(["41.3만ft² 규모 시설", "2027년 가동 목표, 35명 고용"], src), []);
    assert.deepEqual(unsupportedNumbers(["2028년 완공 목표"], src), ["2028년"]);
  });
});

describe("투자유치 vs 시설 투자", () => {
  const src = "Zipline raised $1.5 billion in new funding led by investors. The drone delivery company also plans a new manufacturing facility in Dallas.";
  test("투자유치 금액을 공장 투자로 쓰면 거부", () => {
    const r = validateSummary(["Zipline, 미국 드론 배송 사업 확대", "15억 달러 공장 투자 추진", "댈러스 신규 제조시설 계획", "댈러스 제조시설 신설 시 공정물류 자동화 적용 가능성"], src, { investmentPurpose: "funding_round" });
    assert.ok(r.some((x) => x.includes("투자유치")), r.join(" | "));
  });
  test("투자유치로 정확히 쓰면 통과", () => {
    const r = validateSummary(["Zipline, 신규 투자유치로 사업 확대", "15억 달러 규모 펀딩 유치", "댈러스 신규 제조시설 계획 발표", "댈러스 제조시설 신설 시 공정물류 자동화 적용 가능성"], src, { investmentPurpose: "funding_round" });
    assert.deepEqual(r, []);
  });
  test("규칙 분류: 펀딩 기사는 제조물류 투자로 분류하지 않는다", () => {
    const w = rulesOf("Zipline raises $1.5 billion to expand drone delivery");
    assert.notEqual(w.detail?.sub, "제조물류 투자");
  });
});

describe("시설 유형 오분류", () => {
  test("제품 광고(Zed Black Diwali 캠페인)를 공장·반도체 투자로 분류하지 않는다", () => {
    const w = rulesOf("Zed Black Agarbatti launches Diwali campaign with new TVC", "The incense brand from India unveiled a festive advertising campaign.");
    assert.ok(!["제조물류 투자", "투자·확장", "스마트창고 투자"].includes(w.detail?.sub ?? ""), w.detail?.label);
    assert.equal(w.judgment?.lowValueType, "광고·홍보");
    assert.deepEqual(w.summary4, [], "규칙 기반 요약은 만들지 않는다");
  });
  test("로봇 연구소·조직 신설을 제조공장 신설로 분류하지 않는다", () => {
    for (const t of ["Toyota creates new robotics organization to accelerate automation", "Pfizer to build $650M manufacturing technology center in Connecticut"]) {
      const w = rulesOf(t);
      assert.notEqual(w.detail?.sub, "제조물류 투자", `${t} → ${w.detail?.label}`);
      assert.notEqual(w.judgment?.isNewProject, true, t);
    }
  });
  test("KNAPP 로보틱스 연구소는 경쟁사 R&D로 분류", () => {
    const w = rulesOf("Knapp opens U.S. robotics and AI innovation hub", "The intralogistics company KNAPP opened a robotics lab in Boston.");
    assert.equal(w.detail?.group, "competitor");
    assert.equal(w.detail?.sub, "R&D·피지컬 AI");
  });
  test("인명 Knapp(Sean Knapp)은 경쟁사가 아니다", () => {
    const w = rulesOf("Apple acquires Sean Knapp's Ascend.io", "The data automation startup was founded by Sean Knapp.");
    assert.notEqual(w.detail?.group, "competitor");
  });
});

describe("요약 품질 가드", () => {
  test("원문에 없는 자동화 설비명(AGV·자동창고)을 막는다", () => {
    const src = "Kia plans $1.5 billion investment to expand its Andhra Pradesh plant and raise production capacity.";
    assert.deepEqual(unsupportedAutomation(["Kia, 인도 공장 증설 추진", "15억 달러 투자", "AGV·자동창고 도입", "공정물류 수요 주목"], src).sort(), ["AGV", "자동창고"].sort());
    assert.deepEqual(unsupportedAutomation(["Kia, 인도 공장 증설 추진", "15억 달러 투자", "생산능력 확대 계획", "공정물류 자동화 수요 주목"], src), []);
  });
  test("무의미한 반복 문장을 막는다", () => {
    assert.equal(fillerLines(["Knapp, 미국 관련 소식", "미국 소재", "로봇 관련 내용 언급", "업계 동향 참고"]).length, 4);
    assert.equal(fillerLines(["투자규모·일정 원문 미기재", "자동화 설비 도입 여부 원문 미확인"]).length, 2);
  });
  test("근거 구절은 원문에 실제로 있어야 인정", () => {
    const src = "TITLE: X\n\nBODY:\nThe company will invest $650 million in a new technology center in Groton, Connecticut.";
    assert.ok(quoteInSource("invest $650 million in a new technology center", src));
    assert.ok(!quoteInSource("invest $900 million in a new factory", src));
  });
});

describe("Gemini 결과 검증 → 상태", () => {
  const src: SourceText = { level: "body", chars: 900, url: null, publishedAt: null, publishedAtBasis: null,
    text: "TITLE: Pfizer to build $650M manufacturing technology center in Connecticut\n\nBODY:\nPfizer will invest $650 million to build a manufacturing technology center in Groton, Connecticut, to develop new production processes. Construction starts in 2027 and the center will employ 200 scientists and engineers." };
  const good = {
    report_type: "trend", exclude_reason: "", title_ko: "화이자, 코네티컷 제조기술센터 건립",
    company: { value: "Pfizer", evidence: "Pfizer will invest $650 million" },
    location: { country: "United States", country_ko: "미국", city: "Groton", evidence: "in Groton, Connecticut" },
    facility: { kind: "rnd_center", type: "제조기술센터", evidence: "build a manufacturing technology center in Groton" },
    stage: { value: "planned", evidence: "Construction starts in 2027" },
    investment: { amount: "$650 million", purpose: "facility_capex", evidence: "Pfizer will invest $650 million to build a manufacturing technology center" },
    schedule: { value: "2027년 착공", evidence: "Construction starts in 2027" }, automation: { mentioned: false, items: [], evidence: "" },
    supplier: { status: "unknown", name: "", evidence: "" }, construction_company: "", order_potential: "low",
    category: { group: "global", sub: "Industry", country_ko: "미국" },
    summary: ["Pfizer, 미국 코네티컷 제조기술센터 건립", "6.5억 달러 투자·2027년 착공 예정", "신규 생산공정 개발 거점, 200명 근무", "생산공정 개발 거점 확대로 제약 고객 자동화 사업기회 부각"],
    line_evidence: ["build a manufacturing technology center in Groton, Connecticut", "Pfizer will invest $650 million", "the center will employ 200 scientists and engineers", ""],
    confidence: "high", review_reasons: [],
  };
  test("근거가 맞는 결과는 '분석 완료'", () => {
    const r = buildReportAnalysis(good, src, "gemini-test");
    assert.equal(r.status, "done", r.reviewReasons.join(" | "));
    assert.equal(r.facility.kind, "rnd_center");
  });
  test("연구센터를 '생산공장 신설'로 쓰고 없는 수치를 넣으면 '검토 필요'", () => {
    const bad = { ...good, summary: ["Pfizer, 미국 생산공장 신설 추진", "9억 달러 투자 계획", "AGV·자동창고 도입", "업계 동향 참고"] };
    const r = buildReportAnalysis(bad, src, "gemini-test");
    assert.equal(r.status, "needs_review");
    assert.ok(r.reviewReasons.some((x) => x.includes("원문에 없는 수치")));
    assert.ok(r.reviewReasons.some((x) => x.includes("자동화 설비")));
    assert.ok(r.reviewReasons.some((x) => x.includes("의미 없는 문장")));
  });
  test("원문에 없는 근거 인용은 버린다", () => {
    const r = buildReportAnalysis({ ...good, investment: { amount: "$650 million", purpose: "facility_capex", evidence: "Pfizer will spend $900 million on a plant" } }, src, "m");
    assert.equal(r.investment.evidence, "");
    assert.equal(r.status, "needs_review");
  });
  test("요약 불가로 답하면 4줄을 만들지 않는다", () => {
    const r = buildReportAnalysis({ ...good, summary: [], review_reasons: ["원문 정보 부족"] }, src, "m");
    assert.deepEqual(r.summary, []);
    assert.notEqual(r.status, "done");
  });
});

const KIA_OK = {
  report_type: "opportunity", exclude_reason: "", title_ko: "기아, 인도 안드라프라데시 공장 증설에 15억 달러 투자",
  company: { value: "Kia", evidence: "Kia plans a $1.5 billion investment" },
  location: { country: "India", country_ko: "인도", city: "Andhra Pradesh", evidence: "expand its Andhra Pradesh plant in India" },
  facility: { kind: "production_plant", type: "완성차 공장", evidence: "expand its Andhra Pradesh plant in India" },
  stage: { value: "planned", evidence: "Kia plans a $1.5 billion investment" },
  investment: { amount: "$1.5 billion", purpose: "facility_capex", evidence: "Kia plans a $1.5 billion investment to expand its Andhra Pradesh plant" },
  schedule: { value: "", evidence: "" }, automation: { mentioned: false, items: [], evidence: "" }, supplier: { status: "unknown", name: "", evidence: "" },
  construction_company: "", order_potential: "medium", category: { group: "global", sub: "제조물류 투자", country_ko: "인도" },
  summary: ["Kia, 인도 안드라프라데시 공장 증설 추진", "15억 달러 투자 계획 발표", "연간 생산능력 10만 대 확대 목표", "완성차 증설에 따른 공정물류 수요 주목"],
  line_evidence: ["expand its Andhra Pradesh plant in India", "Kia plans a $1.5 billion investment", "raise annual production capacity by 100,000 units", ""],
  confidence: "high", review_reasons: [],
};

describe("Gemini 실패 시 가짜 요약 금지", () => {
  const realFetch = globalThis.fetch;
  const env = { ...process.env };
  let geminiStatus = 429;
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_BASE_URL = "https://gemini.test";
    process.env.GEMINI_MIN_INTERVAL_MS = "0";
    process.env.GEMINI_MODEL = "gemini-test-flash";
    (globalThis as unknown as { __gemini?: unknown }).__gemini = undefined;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://gemini.test/v1beta/models?")) return new Response(JSON.stringify({ models: [{ name: "models/gemini-test-flash", supportedGenerationMethods: ["generateContent"] }] }), { status: 200 });
      if (url.startsWith("https://gemini.test") && geminiStatus === 200) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(KIA_OK) }] } }] }), { status: 200 });
      if (url.startsWith("https://gemini.test")) return new Response(JSON.stringify({ error: { message: `mock ${geminiStatus}`, status: "X", details: geminiStatus === 429 ? [{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }] : [] } }), { status: geminiStatus });
      const body = `<html><head><title>Kia plans $1.5 billion investment</title><meta property="article:published_time" content="2026-11-06T09:31:23Z"></head><body><article>${Array.from({ length: 8 }, (_, i) => `<p>Paragraph ${i + 1}: Kia plans a $1.5 billion investment to expand its Andhra Pradesh plant in India and raise annual production capacity by 100,000 units.</p>`).join("")}</article></body></html>`;
      return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch;
  });
  afterEach(() => { globalThis.fetch = realFetch; process.env = { ...env }; });

  for (const [status, kind] of [[429, "quota_daily"], [401, "auth"], [403, "permission"], [404, "model_not_found"]] as const) {
    test(`HTTP ${status} → 상태 'AI 분석 실패'(${kind}), 4줄 없음`, async () => {
      geminiStatus = status;
      const r = await analyzeForReport(article({ title: "Kia plans $1.5 billion investment to expand Andhra Pradesh plant", url: "https://news.example.com/kia" }), settings);
      assert.equal(r.status, "failed");
      assert.equal(r.error?.kind, kind, r.error?.message);
      assert.deepEqual(r.summary, []);
      assert.ok(!JSON.stringify(r).includes("test-key"), "API 키가 결과에 남으면 안 됨");
    });
  }
  test("정상 응답 + 원문 근거 일치 → '분석 완료', 본문 기준", async () => {
    geminiStatus = 200;
    const r = await analyzeForReport(article({ title: "Kia plans $1.5 billion investment to expand Andhra Pradesh plant", url: "https://news.example.com/kia" }), settings);
    assert.equal(r.status, "done", r.reviewReasons.join(" | "));
    assert.equal(r.sourceLevel, "body");
    assert.equal(r.location.countryKo, "인도");
    assert.ok(r.investment.evidence.includes("$1.5 billion"));
  });
  test("실패한 기사는 Excel/PPT에 '[검토 필요]'만 표시 (규칙 문장 대체 없음)", () => {
    const r = row({ id: "x", title: "Kia", ai: { ...aiResult(), status: "failed", summary: [] }, summary4: [] });
    assert.deepEqual(reportLines(r), [NO_SUMMARY, "", "", ""]);
  });
});

describe("기사 선정", () => {
  const base = { reportStatus: "unreviewed" as const };
  test("발행일 미확인 기사는 자동 추천하지 않는다", () => {
    const c = curate([
      row({ id: "ok", title: "OO plant", ...base }),
      row({ id: "nodate", title: "Unverified date plant story", dateStatus: "search", ...base }),
    ], { target: 12, rejectCount: 5, includeUnverified: false, previous: [] });
    assert.deepEqual(c.picks.map((p) => p.articleId), ["ok"]);
    assert.ok(c.needsCheck.some((n) => n.articleId === "nodate"));
  });
  test("Gemini 검증 전·실패 기사는 추천하지 않고, 12건을 억지로 채우지 않는다", () => {
    const c = curate([
      row({ id: "ok", title: "OO plant", ...base }),
      row({ id: "pending", title: "Pending", ai: null, summary4: [], ...base }),
      row({ id: "failed", title: "Failed", ai: { ...aiResult(), status: "failed", summary: [] }, summary4: [], ...base }),
      row({ id: "review", title: "Review", ai: { ...aiResult(), status: "needs_review", reviewReasons: ["원문에 없는 수치"] }, ...base }),
    ], { target: 12, rejectCount: 5, includeUnverified: false, previous: [] });
    assert.deepEqual(c.picks.map((p) => p.articleId), ["ok"]);
    assert.equal(c.shortfall, 11);
    assert.equal(c.pendingAI, 3);
  });
  test("광고·홍보로 판단된 기사는 추천하지 않는다", () => {
    const c = curate([row({ id: "ad", title: "Diwali campaign", ai: aiResult({ reportType: "exclude", excludeReason: "제품 광고 캠페인" }), ...base })], { target: 12, rejectCount: 5, includeUnverified: false, previous: [] });
    assert.equal(c.picks.length, 0);
    assert.ok(c.rejects.some((r) => r.articleId === "ad" && r.reason.includes("광고")));
  });
  test("같은 프로젝트 중복 보도는 대표 기사 1건만", () => {
    const titles = ["Kia Plans $1 . 5 Billion Andhra Pradesh Expansion", "Kia India Plans $1.5 Billion Investment in Andhra Pradesh – Production Capacity Could Rise", "Kia plans $1.5 billion investment to expand Andhra Pradesh plant"];
    const same = storyMatcher(titles);
    assert.ok(same(titles[0]!, titles[1]!) && same(titles[1]!, titles[2]!));
    const c = curate(titles.map((t, i) => row({ id: `k${i}`, title: t, relevance: 70 + i, ...base })), { target: 12, rejectCount: 5, includeUnverified: false, previous: [] });
    assert.equal(c.picks.length, 1);
  });
});

describe("Gemini 모델 확인", () => {
  const list = (names: string[]) => names.map((n) => ({ name: n, displayName: n, methods: ["generateContent"], inputTokenLimit: null }));
  test("설정 모델이 있으면 그대로 사용", () => {
    assert.equal(chooseModel(list(["gemini-2.5-flash", "gemini-2.5-flash-lite"]), "gemini-2.5-flash-lite").model, "gemini-2.5-flash-lite");
  });
  test("존재하지 않는 모델명이면 사용 가능한 최신 안정 flash로 변경", () => {
    const r = chooseModel(list(["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro", "gemini-2.5-flash-preview-tts"]), "gemini-3.5-flash-lite");
    assert.equal(r.model, "gemini-2.5-flash");
    assert.match(r.note, /사용할 수 없어/);
  });
  test("generateContent를 지원하지 않는 모델은 고르지 않는다", () => {
    const r = chooseModel([{ name: "gemini-9-flash", displayName: "", methods: ["embedContent"], inputTokenLimit: null }, ...list(["gemini-2.0-flash"])], null);
    assert.equal(r.model, "gemini-2.0-flash");
  });
});

describe("PPT 표지 프롬프트", () => {
  test("선정 기사 주제 반영 + 텍스트·로고 금지 문구 포함", async () => {
    const { coverPromptOf } = await import("@/lib/report/data");
    const p = coverPromptOf([{ label: "글로벌시장(미국) / 스마트창고 투자", title: "OO, 자동창고 물류센터 신설" }, { label: "경쟁사 / R&D·피지컬 AI", title: "휴머노이드 로봇 공개" }]);
    assert.match(p, /automated warehouse/);
    assert.match(p, /humanoid/);
    assert.match(p, /No text, no letters, no logos/);
    assert.match(p, /dark navy/i);
  });
});

// ---------------------------------------------------------------- 4줄 요약 품질 (p2)
import { readFileSync } from "node:fs";
import { amountTable, fixAmountScale, koreanAmount, natureAt } from "@/lib/report/validate";
import { needsAnalysis, PROMPT_REV } from "@/lib/report/factcheck";

const NEROS = readFileSync(new URL("./fixtures/neros-manufacturingdive.txt", import.meta.url), "utf8");
const nerosSrc: SourceText = { level: "body", chars: NEROS.length, url: null, publishedAt: null, publishedAtBasis: null, text: NEROS };
const nerosRaw = (summary: string[], extra: object = {}) => ({
  report_type: "trend", exclude_reason: "", title_ko: "Neros, 美 드론 생산 확대에 6.15억 달러 투입",
  company: { value: "Neros", evidence: "small drone maker Neros a conditional loan of up to $450 million" },
  location: { country: "United States", country_ko: "미국", city: "", evidence: "support the company’s expansion plans in the United States" },
  facility: { kind: "production_plant", type: "드론 생산시설", evidence: "increase Neros’ manufacturing capacity to produce dual-use small unmanned aircraft systems" },
  stage: { value: "planned", evidence: "support the company’s expansion plans in the United States" },
  investment: { amount: "$615 million", purpose: "total_program", evidence: "bringing the investment amount to $615 million" },
  schedule: { value: "2028년 연 100만 대", evidence: "manufacture 1 million drones per year by 2028" },
  automation: { mentioned: false, items: [], evidence: "" }, supplier: { status: "unknown", name: "", evidence: "" }, construction_company: "",
  order_potential: "low", category: { group: "global", sub: "제조물류 투자", country_ko: "미국" }, summary_status: "written",
  summary,
  line_evidence: ["support the company’s expansion plans in the United States", "Neros pledged $165 million in equity toward the project, bringing the investment amount to $615 million", "produce critical components such as motors, radios, flight electronics, sensors and batteries", ""],
  confidence: "high", review_reasons: [], ...extra,
});

describe("금액 환산·성격 (Zipline·Neros 실제 사례)", () => {
  test("Zipline: $21.5 billion은 215억 달러 (21.5억 달러는 오류 → 자동 보정)", () => {
    assert.equal(koreanAmount(21.5e9, "USD"), "215억 달러");
    const src = "Zipline … $21.5 billion"; // 사용자가 보고한 실제 오류 금액 (기사 원문 접근 불가 — 금액만 사용)
    assert.ok(unsupportedNumbers(["21.5억 달러 규모"], src).length > 0, "잘못된 환산은 검출");
    const f = fixAmountScale(["Zipline, 21.5억달러 규모 평가"], src);
    assert.equal(f.lines[0], "Zipline, 215억 달러 규모 평가");
    assert.equal(f.fixes.length, 1);
    assert.deepEqual(unsupportedNumbers(f.lines, src), []);
  });
  test("Neros 원문 금액 성격: 4.5억 조건부 대출 · 1.65억 자기자본 · 6.15억 총액", () => {
    const t = amountTable(NEROS);
    const by = (raw: string) => t.find((x) => x.raw.startsWith(raw));
    assert.equal(by("$450 million")?.ko, "4.5억 달러");
    assert.equal(natureAt(NEROS, "$450 million"), "loan");
    assert.equal(natureAt(NEROS, "$165 million"), "equity");
    assert.equal(by("$615 million")?.ko, "6.15억 달러");
  });
  test("조건부 대출을 '투자 유치'로 쓰면 검토 필요", () => {
    const r = validateSummary(["Neros, 미국 소형 드론 생산능력 확충 추진", "4.5억 달러 투자 유치로 생산 확대", "모터·무선·배터리 등 핵심 부품 생산 내재화", "드론 공급망 자국화에 따른 제조 투자 확대 부각"], NEROS);
    assert.ok(r.some((x) => x.includes("대출")), r.join(" | "));
  });
});

const good = ["Neros, 미국 소형 드론 생산능력 확충 추진", "총 6.15억 달러, 4.5억 달러 조건부 대출 포함", "모터·무선·배터리 등 핵심 부품 생산 확대", "드론 양산 전환 시 부품 입고·조립 공정물류 자동화 가능성"];
describe("Neros 실제 기사 4줄 구성", () => {
  test("원문 사실·수치가 맞는 4줄은 '분석 완료'", () => {
    const r = buildReportAnalysis(nerosRaw(good), nerosSrc, "m");
    assert.equal(r.status, "done", r.reviewReasons.join(" | "));
    assert.equal(r.summary.length, 4);
    assert.ok(r.summary.every((l) => l.length >= 10 && l.length <= 46));
  });
  test("원문에 없는 AGV·자동창고를 사실로 쓰면 검토 필요, 4줄 잠재 수요 표현은 허용", () => {
    const bad = buildReportAnalysis(nerosRaw([good[0]!, good[1]!, "AGV·자동창고 기반 생산라인 구축", good[3]!]), nerosSrc, "m");
    assert.equal(bad.status, "needs_review");
    const hedged = buildReportAnalysis(nerosRaw([good[0]!, good[1]!, good[2]!, "드론 부품 대량생산 시 자동창고 잠재 수요 가능성"]), nerosSrc, "m");
    assert.equal(hedged.status, "done", hedged.reviewReasons.join(" | "));
  });
  test("상투문구·반복·예시 고유명사 혼입은 검토 필요", () => {
    for (const lines of [
      [good[0]!, good[1]!, good[2]!, "관련 설비 수요 동향 참고 필요"],
      [good[0]!, good[1]!, "Neros, 미국 소형 드론 생산능력 확충", good[3]!],
      [good[0]!, good[1]!, "AutoStore 로봇 기반 부품 보관 도입", good[3]!],
    ]) assert.equal(buildReportAnalysis(nerosRaw(lines), nerosSrc, "m").status, "needs_review", lines.join(" / "));
  });
});

describe("요약 작성 ≠ 수주 가능성", () => {
  test("원문이 충분한데 요약을 비우면 '원문 부족'이 아니라 재분석 대상", () => {
    const r = buildReportAnalysis(nerosRaw([], { summary_status: "insufficient_source", review_reasons: ["현대무벡스와 관련성 낮음"] }), nerosSrc, "m");
    assert.equal(r.status, "needs_review");
    assert.ok(r.reviewReasons.some((x) => x.includes("재분석")));
    assert.ok(needsAnalysis(article({ title: "x", report: r }), { retryFailed: true }), "실패·재분석 대상에 포함");
  });
  test("원문이 제목뿐이면 '원문 부족'", () => {
    const r = buildReportAnalysis(nerosRaw([], { summary_status: "insufficient_source" }), { ...nerosSrc, level: "title", chars: 0, text: "TITLE: Neros plans $615M drone manufacturing expansion in US" }, "m");
    assert.equal(r.status, "insufficient_source");
  });
  test("수주 가능성 낮은 동향 기사도 요약은 정상 완료 (추천 여부와 별개)", () => {
    const r = buildReportAnalysis(nerosRaw(good, { report_type: "trend", order_potential: "low" }), nerosSrc, "m");
    assert.equal(r.status, "done");
    assert.equal(r.reportType, "trend");
  });
  test("기존 분석은 자동 덮어쓰지 않고, 직접 요청 시에만 새 기준으로 재분석", () => {
    const old = { ...buildReportAnalysis(nerosRaw(good), nerosSrc, "m"), promptRev: "p1" };
    const a = article({ title: "x", report: old });
    assert.equal(needsAnalysis(a, { retryFailed: true }), false);
    assert.equal(needsAnalysis(a, { retryFailed: true, upgrade: true }), true);
    assert.equal(PROMPT_REV, "p3");
  });
});

// ---------------------------------------------------------------- Neros 실제 출력 회귀 (p3)
import { cleanSummaryLines, line4Issues, componentIssues } from "@/lib/report/validate";

const NEROS_ACTUAL = [
  "1. Neros, 미국 내 드론 제조 시설 확장 계획 발표",
  "2. 6억 1,500만 달러 투자와 2028년 생산 목표 설정",
  "3. 소형 무인 항공기 및 부품 생산 라인 구축 추진",
  "4. 대규모 방산 제조 시설 확장 관련 물류자동화 수요 동향 참고 필요",
];
const NEROS_GOOD = [
  "Neros, 美 소형 드론 생산능력 확충 추진",
  "총 6.15억 달러, 조건부 대출 4.5억·자기자본 1.65억",
  "모터·배터리 등 핵심 부품 내재화, 2028년 연 100만 대 목표",
  "드론 양산 전환 시 부품 입고·조립 공정물류 자동화 가능성",
];

describe("Neros 실제 출력 회귀", () => {
  test("번호 제거 (배열·한 문자열 모두)", () => {
    assert.equal(cleanSummaryLines(NEROS_ACTUAL)[0], "Neros, 미국 내 드론 제조 시설 확장 계획 발표");
    assert.equal(cleanSummaryLines([NEROS_ACTUAL.join("\n")]).length, 4);
    assert.ok(cleanSummaryLines(["① 첫 줄 내용입니다", "2) 둘째 줄", "4줄: 넷째", "시사점: 다섯"]).every((l) => !/^[①\d]|^(4줄|시사점)/.test(l)));
  });
  test("'6억 1,500만 달러'는 하나의 금액(6.15억 달러)으로 해석", () => {
    assert.deepEqual(unsupportedNumbers(["6억 1,500만 달러 투자"], NEROS), []);
  });
  test("실제 출력은 대출·자기자본 뭉뚱그림 + 4줄 상투문구로 검토 필요", () => {
    const lines = cleanSummaryLines(NEROS_ACTUAL);
    assert.ok(componentIssues(lines, NEROS).length > 0, "대출·자기자본 구성 누락 검출");
    assert.ok(line4Issues(lines, NEROS).some((x) => x.includes("상투")));
    const r = buildReportAnalysis(nerosRaw(NEROS_ACTUAL), nerosSrc, "m");
    assert.equal(r.status, "needs_review");
    assert.ok(r.summary.every((l) => !/^\d\s?[.)]\s/.test(l)), "저장되는 요약에 번호 없음");
    assert.equal(r.summary[0], "Neros, 미국 내 드론 제조 시설 확장 계획 발표");
  });
  test("개선된 4줄은 통과 (구성·수치·4줄 구체성)", () => {
    const r = buildReportAnalysis(nerosRaw(NEROS_GOOD), nerosSrc, "m");
    assert.equal(r.status, "done", r.reviewReasons.join(" | "));
  });
  test("4줄: 다른 기사에 붙일 수 있는 일반 문장·현대무벡스 관점 없음은 거부", () => {
    assert.ok(line4Issues([...NEROS_GOOD.slice(0, 3), "제조업 전반의 자동화 사업기회 확대 기대"], NEROS).some((x) => x.includes("고유")));
    assert.ok(line4Issues([...NEROS_GOOD.slice(0, 3), "미국 드론 산업 성장세 지속 부각"], NEROS).some((x) => x.includes("현대무벡스")));
  });
});

describe("분석 흐름: 파싱 → 검증 → 1회 재작성 → 저장값", () => {
  const realFetch = globalThis.fetch;
  const env = { ...process.env };
  let answers: object[] = [];
  let calls = 0;
  beforeEach(() => {
    calls = 0;
    process.env.GEMINI_API_KEY = "test-key"; process.env.GEMINI_BASE_URL = "https://gemini.test"; process.env.GEMINI_MIN_INTERVAL_MS = "0"; process.env.GEMINI_MODEL = "gemini-test-flash";
    (globalThis as unknown as { __gemini?: unknown }).__gemini = undefined;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://gemini.test/v1beta/models?")) return new Response(JSON.stringify({ models: [{ name: "models/gemini-test-flash", supportedGenerationMethods: ["generateContent"] }] }), { status: 200 });
      if (url.startsWith("https://gemini.test")) { const a = answers[Math.min(calls, answers.length - 1)]; calls++; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(a) }] } }] }), { status: 200 }); }
      const body = NEROS.split("\n").filter((l) => !l.startsWith("#")).map((l) => `<p>${l}</p>`).join("");
      return new Response(`<html><head><meta property="article:published_time" content="2026-11-03T00:00:00Z"></head><body><article>${body}</article></body></html>`, { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch;
  });
  afterEach(() => { globalThis.fetch = realFetch; process.env = { ...env }; });
  const neros = () => article({ title: "Neros plans $615M drone manufacturing expansion in US", url: "https://www.manufacturingdive.com/news/neros" });

  test("실제 불량 출력 → 1회 재작성 → 개선본 저장 (호출 2회)", async () => {
    answers = [nerosRaw(NEROS_ACTUAL), nerosRaw(NEROS_GOOD)];
    const r = await analyzeForReport(neros(), settings);
    assert.equal(calls, 2);
    assert.equal(r.status, "done", r.reviewReasons.join(" | "));
    assert.deepEqual(r.summary, NEROS_GOOD);
    assert.ok(r.autoFixes?.some((x) => x.includes("재작성본 채택")));
  });
  test("재작성도 미달이면 사용자 검토 필요 (추가 호출 없음)", async () => {
    answers = [nerosRaw(NEROS_ACTUAL), nerosRaw(NEROS_ACTUAL)];
    const r = await analyzeForReport(neros(), settings);
    assert.equal(calls, 2);
    assert.equal(r.status, "needs_review");
    assert.ok(r.summary.every((l) => !/^\d\./.test(l)));
  });
  test("처음부터 기준 충족이면 재작성 호출 없음", async () => {
    answers = [nerosRaw(NEROS_GOOD)];
    const r = await analyzeForReport(neros(), settings);
    assert.equal(calls, 1);
    assert.equal(r.status, "done", r.reviewReasons.join(" | "));
  });
});
