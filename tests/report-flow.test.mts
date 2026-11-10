// 통합: 기사 1건 재분석 → DB 저장 → 주간 view → 보고서 편집 값 → Excel/PPT 출력까지.
// 재현 사례: 중국 푸드로보틱스 기사 — '원문 검증 완료·승인됨'인데 편집 입력칸은 비고 예전 요약이 남던 상태.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";

process.env.LOCAL_DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "gor-flow-"));
process.env.GEMINI_API_KEY = "test-key"; process.env.GEMINI_BASE_URL = "https://gemini.test"; process.env.GEMINI_MIN_INTERVAL_MS = "0"; process.env.GEMINI_MODEL = "gemini-test-flash";

const { article, settings } = await import("./helpers");
const { getSettings, saveArticles, getArticle, saveSettings } = await import("@/lib/db/repo");
const { loadWeekly, approvalOf } = await import("@/lib/weekly/view");
const { resolvePeriod } = await import("@/lib/weekly/period");
const { getReport, setItem } = await import("@/lib/weekly/report");
const { analyzeForReport } = await import("@/lib/report/factcheck");
const { buildReportDoc } = await import("@/lib/report/data");
const { buildTemplateWorkbook } = await import("@/lib/report/xlsx-template");
const { buildTemplateDeck } = await import("@/lib/report/pptx-template");
const { effectiveOf, editsToSave, userSummaryDiffersFromGemini, revOf } = await import("@/lib/weekly/effective");
const { aiResult } = await import("./helpers");

const period = resolvePeriod({ p: "custom", start: "2026-11-02", end: "2026-11-08" });
const ID = "foodbot00000001";
const URL_ = "https://news.example.com/foodbot-kitchen";
const OLD = ["Foodbot, 한국 생산공장 신설 추진", "50억 달러 투자 계획", "AGV·자동창고 기반 생산라인 구축", "관련 설비 수요 동향 참고 필요"]; // 예전(p1) 부정확한 요약
const NEW = [
  "Foodbot Robotics, 중국 선전 로봇 자동화 중앙주방 개소",
  "1.2만㎡ 규모, 일 5만 식 생산 목표",
  "조리 로봇·컨베이어·자동 포장 셀 연결, 2027년 3월 가동 예정",
  "식자재·완제품 이송 자동화 확산 시 당사 컨베이어·분류 설비 적용 가능성",
];
const PAGE = [
  "Shenzhen-based Foodbot Robotics opened an automated central kitchen that uses robotic arms to cook and pack meals for chain restaurants.",
  "The 12,000-square-meter facility will produce up to 50,000 meals per day and links cooking robots with conveyor lines and automated packing cells.",
  "Foodbot said the plant is scheduled to start commercial operation in March 2027 after a six-month trial run of the cooking lines.",
  "The company did not disclose the investment amount or name the suppliers of its conveyor and packing equipment for the new kitchen.",
  "Chain restaurant customers in Guangdong province will receive chilled meals from the central kitchen through regional delivery routes.",
  "Industry analysts say automated central kitchens are spreading in China as restaurant chains look to cut labour costs and standardise quality.",
];
const GEMINI = {
  report_type: "trend", exclude_reason: "", title_ko: "중국 푸드로보틱스, 선전 자동화 중앙주방 개소",
  company: { value: "Foodbot Robotics", evidence: "Shenzhen-based Foodbot Robotics opened an automated central kitchen" },
  location: { country: "China", country_ko: "중국", city: "Shenzhen", evidence: "Shenzhen-based Foodbot Robotics opened an automated central kitchen" },
  facility: { kind: "production_plant", type: "자동화 중앙주방", evidence: "opened an automated central kitchen that uses robotic arms to cook and pack meals" },
  stage: { value: "completed_operating", evidence: "opened an automated central kitchen" },
  investment: { amount: "", purpose: "none", evidence: "" }, schedule: { value: "2027년 3월 상업 가동", evidence: "scheduled to start commercial operation in March 2027" },
  automation: { mentioned: true, items: ["조리 로봇", "컨베이어", "자동 포장 셀"], evidence: "links cooking robots with conveyor lines and automated packing cells" },
  supplier: { status: "unknown", name: "", evidence: "" }, construction_company: "", order_potential: "low",
  category: { group: "global", sub: "자동화 운영확대", country_ko: "중국" }, summary_status: "written", summary: NEW,
  line_evidence: ["opened an automated central kitchen that uses robotic arms to cook and pack meals", "The 12,000-square-meter facility will produce up to 50,000 meals per day", "links cooking robots with conveyor lines and automated packing cells", ""],
  confidence: "high", review_reasons: [],
};

let geminiCalls = 0;
const realFetch = globalThis.fetch;
before(async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const u = String(input);
    if (u.startsWith("https://gemini.test/v1beta/models?")) return new Response(JSON.stringify({ models: [{ name: "models/gemini-test-flash", supportedGenerationMethods: ["generateContent"] }] }), { status: 200 });
    if (u.startsWith("https://gemini.test")) { geminiCalls++; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(GEMINI) }] } }] }), { status: 200 }); }
    if (u.endsWith("/robots.txt")) return new Response("", { status: 404 });
    return new Response(`<html><head><meta property="article:published_time" content="2026-11-04T02:00:00Z"></head><body><article>${PAGE.map((p) => `<p>${p}</p>`).join("")}</article></body></html>`, { status: 200, headers: { "content-type": "text/html" } });
  }) as typeof fetch;
  await saveSettings({ ...(await getSettings()), showDemoData: false });
  // 예전 상태: 이전 프롬프트(p1)의 부정확한 요약이 '분석 완료'로 저장돼 있고, 사용자는 이미 선정·승인함
  const a = article({ id: ID, title: "Chinese food robotics firm opens automated central kitchen in Shenzhen", url: URL_, sourceName: "Foodtech Weekly", sourceDomain: "news.example.com", publishedAt: "2026-11-04T02:00:00.000Z", excerpt: PAGE[0], analysis: null });
  a.report = { ...aiResult({ summary: OLD, titleKo: "푸드로봇 한국 공장 신설", category: { group: "domestic", sub: "투자·확장", countryKo: "" }, analyzedAt: "2026-11-05T00:00:00.000Z" }), promptRev: "p1", sourceLevel: "body" };
  await saveArticles([a]);
  await setItem(period, ID, { status: "selected" });
  await setItem(period, ID, { approved: true, approvedFor: "2026-11-05T00:00:00.000Z" });
});
after(() => { globalThis.fetch = realFetch; fs.rmSync(process.env.LOCAL_DB_DIR!, { recursive: true, force: true }); });

const rowOf = async () => (await loadWeekly(period)).rows.find((r) => r.id === ID)!;
const sheetText = async (buf: Buffer) => (await (await JSZip.loadAsync(buf)).file("xl/sharedStrings.xml")!.async("string"));
const deckText = async (buf: Buffer) => { const z = await JSZip.loadAsync(buf); return (await Promise.all(Object.keys(z.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f)).map((f) => z.file(f)!.async("string")))).join("\n"); };
async function outputs() {
  const view = await loadWeekly(period);
  const doc = await buildReportDoc(period, view, await getReport(period));
  return { excel: await sheetText(await buildTemplateWorkbook(doc)), ppt: await deckText((await buildTemplateDeck(doc)).buf), doc };
}

describe("재분석 → 보고서 편집 → Excel/PPT 통합 (푸드로보틱스 재현)", () => {
  test("재현: 예전 요약이 '원문 검증 완료·승인'으로 보이는 상태", async () => {
    const r = await rowOf();
    assert.deepEqual(r.summary4, OLD);
    assert.equal(r.aiStatus, "done");
    assert.ok(r.approvedAt, "승인됨");
    assert.deepEqual(effectiveOf(r).lines, OLD);
  });

  test("1건 재분석 → 최신 요약·제목·카테고리가 편집값/Excel/PPT에 반영, 승인은 재승인 필요", async () => {
    const before = await getArticle(ID);
    const res = await analyzeForReport(before!, settings);
    assert.equal(res.status, "done", res.reviewReasons.join(" | "));
    before!.report = res;
    await saveArticles([before!]); // 라우트(/api/weekly/reanalyze)와 같은 저장 방식
    assert.equal(geminiCalls, 1, "재분석은 Gemini 1회");

    const r = await rowOf();
    assert.deepEqual(r.summary4, NEW);
    const e = effectiveOf(r);
    assert.deepEqual(e.lines, NEW, "편집 입력칸 초깃값 = 최신 Gemini");
    assert.equal(e.titleKo, "중국 푸드로보틱스, 선전 자동화 중앙주방 개소");
    assert.equal(e.label, "글로벌시장(중국) / 자동화 운영확대");
    assert.deepEqual([e.source.title, e.source.label, e.source.summary], ["gemini", "gemini", "gemini"]);
    assert.equal(r.approvedAt, null, "승인 후 요약이 바뀌었으므로 재승인 필요");
    assert.ok(r.gate.problems.some((p) => p.includes("재분석")));
    assert.equal(r.reportStatus, "selected", "선정 상태 유지");

    const out = await outputs();
    for (const l of NEW) assert.ok(out.excel.includes(l.replace(/&/g, "&amp;")), `Excel: ${l}`);
    for (const l of NEW) assert.ok(out.ppt.includes(l), `PPT: ${l}`);
    for (const l of OLD) assert.ok(!out.excel.includes(l) && !out.ppt.includes(l), "예전 요약이 출력에 남지 않음");
  });

  test("재승인: 승인은 검증 완료와 별도 상태, 요약 없는 기사는 승인 불가", async () => {
    await setItem(period, ID, { approved: true, approvedFor: (await getArticle(ID))!.report!.analyzedAt });
    assert.ok((await rowOf()).approvedAt);
    // 요약이 없는(분석 전) 기사는 승인이 유효하지 않음
    const item = { status: "selected" as const, category: null, recommended: false, updatedAt: "", approvedAt: "2026-11-06T00:00:00Z", approvedFor: "x" };
    assert.equal(approvalOf(item, null, null).valid, false);
    assert.match(approvalOf(item, null, null).note ?? "", /요약이 없습니다/);
    assert.equal(approvalOf({ ...item, edits: { summary4: NEW } }, null, null).valid, true, "사용자 요약이 있으면 유효");
  });

  test("빈 문자열 수정값이 최신 Gemini 요약을 가리지 않는다", async () => {
    const r = await rowOf();
    for (const edits of [{ summary4: ["", "", "", ""], titleKo: "", detailLabel: "" }, { summary4: ["  ", "", "", ""] }]) {
      const e = effectiveOf({ ...r, edits });
      assert.deepEqual(e.lines, NEW);
      assert.equal(e.titleKo, r.titleKo);
      assert.equal(e.source.summary, "gemini");
    }
  });

  test("저장: 바뀐 필드만 사용자 수정으로 저장 (변경 없음 → 빈 수정, 예전 요약 고정 방지)", async () => {
    const r = await rowOf();
    const draft = { titleKo: effectiveOf(r).titleKo, label: effectiveOf(r).label, lines: effectiveOf(r).lines };
    assert.deepEqual(editsToSave(draft, r), {}, "초깃값 그대로 저장해도 스냅샷이 남지 않음");
    assert.deepEqual(editsToSave({ ...draft, titleKo: "푸드로보틱스, 中 선전 자동화 중앙주방 개소" }, r), { titleKo: "푸드로보틱스, 中 선전 자동화 중앙주방 개소" });
    assert.deepEqual(Object.keys(editsToSave({ ...draft, lines: [NEW[0]!, "수정한 2줄 내용입니다", NEW[2]!, NEW[3]!] }, r)), ["summary4"]);
  });

  test("사용자 수정 > 최신 Gemini: 수정값이 Excel/PPT에 동일 출력, 재분석해도 보존, 승인·순서 유지", async () => {
    const MY = [NEW[0]!, "1.2만㎡ 규모, 일 5만 식 목표 (수정)", NEW[2]!, NEW[3]!];
    await setItem(period, ID, { edits: { titleKo: "푸드로보틱스 선전 중앙주방 (수정)", summary4: MY }, order: 1 });
    await setItem(period, ID, { approved: true, approvedFor: "user" });
    let r = await rowOf();
    assert.deepEqual(effectiveOf(r).lines, MY);
    assert.equal(effectiveOf(r).source.summary, "user");
    const out1 = await outputs();
    assert.ok(out1.excel.includes("일 5만 식 목표 (수정)") && out1.ppt.includes("일 5만 식 목표 (수정)"), "Excel·PPT 동일 반영");
    assert.ok(out1.excel.includes("푸드로보틱스 선전 중앙주방 (수정)") && out1.ppt.includes("푸드로보틱스 선전 중앙주방 (수정)"));
    // 다시 재분석(요약 문구가 달라진 결과) → 사용자 수정은 덮어쓰지 않음
    const a = (await getArticle(ID))!;
    const again = { ...a.report!, summary: [NEW[0]!, "1.2만㎡ 규모, 일 5만 식 생산 목표", NEW[2]!, NEW[3]!], analyzedAt: "2026-11-09T00:00:00.000Z" };
    a.report = { ...again };
    await saveArticles([a]);
    r = await rowOf();
    assert.deepEqual(effectiveOf(r).lines, MY, "사용자 수정 유지");
    assert.ok(r.approvedAt, "사용자 요약 기준 승인은 재분석으로 취소되지 않음");
    assert.equal(r.order, 1);
    assert.ok(userSummaryDiffersFromGemini(r), "최신 Gemini와 다름을 알림 (자동 교체 없음)");
    const item = (await getReport(period)).items[ID]!;
    assert.deepEqual(item.edits?.summary4, MY, "DB의 사용자 수정 보존");
  });

  test("편집 화면 갱신 키: 재분석·수정·승인이 바뀌면 revision도 바뀐다", async () => {
    const r = await rowOf();
    const k1 = revOf([r]);
    const k2 = revOf([{ ...r, ai: { ...r.ai!, analyzedAt: "2030-01-01T00:00:00.000Z" } }]);
    assert.notEqual(k1, k2);
  });
});
