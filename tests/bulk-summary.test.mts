// 통합: 전체 기사 AI 요약(scope "all") — 중복 제외 전체 대상, 완료 요약 재사용, 필터 제외 기사 포함, 일일 한도 도달 시 저장 후 중단·이어서 처리.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.LOCAL_DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "gor-bulk-"));
process.env.GEMINI_API_KEY = "test-key"; process.env.GEMINI_BASE_URL = "https://gemini.test"; process.env.GEMINI_MIN_INTERVAL_MS = "0"; process.env.GEMINI_BATCH = "1"; /* 한도 도달 시점을 기사 단위로 검증 */ process.env.GEMINI_MODEL = "gemini-test-flash";

const { article, aiResult } = await import("./helpers");
delete process.env.GEMINI_NO_USAGE_TRACKING; // 이 테스트는 임시 DB에서 일일 사용량 한도를 검증한다
process.env.GEMINI_RPD = "3";
const { saveArticles, getArticle, getSettings, saveSettings, getJob } = await import("@/lib/db/repo");
const { loadWeekly } = await import("@/lib/weekly/view");
const { resolvePeriod } = await import("@/lib/weekly/period");
const { startJob, driveJob } = await import("@/lib/pipeline/job");
const { geminiUsage } = await import("@/lib/ai/gemini");

const period = resolvePeriod({ p: "custom", start: "2026-11-02", end: "2026-11-08" });
const range = { start: period.start, end: period.end, startDate: period.startDate, endDate: period.endDate };

const PAGE = [
  "Shenzhen-based Foodbot Robotics opened an automated central kitchen that uses robotic arms to cook and pack meals for chain restaurants.",
  "The 12,000-square-meter facility will produce up to 50,000 meals per day and links cooking robots with conveyor lines and automated packing cells.",
  "Foodbot said the plant is scheduled to start commercial operation in March 2027 after a six-month trial run of the cooking lines.",
  "The company did not disclose the investment amount or name the suppliers of its conveyor and packing equipment for the new kitchen.",
  "Chain restaurant customers in Guangdong province will receive chilled meals from the central kitchen through regional delivery routes.",
  "Industry analysts say automated central kitchens are spreading in China as restaurant chains look to cut labour costs and standardise quality.",
];
const NEW = [
  "Foodbot Robotics, 중국 선전 로봇 자동화 중앙주방 개소",
  "1.2만㎡ 규모, 일 5만 식 생산 목표",
  "조리 로봇·컨베이어·자동 포장 셀 연결, 2027년 3월 가동 예정",
  "식자재·완제품 이송 자동화 확산 시 당사 컨베이어·분류 설비 적용 가능성",
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
let calls = 0;
const realFetch = globalThis.fetch;
const mk = (id: string, status: "analyzed" | "queued" | "filtered" | "duplicate", extra: object = {}) =>
  article({ id, title: `Robotics kitchen story ${id}`, url: `https://news.example.com/${id}`, status, publishedAt: "2026-11-04T02:00:00.000Z", excerpt: PAGE[0], ...extra });

before(async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const u = String(input);
    if (u.startsWith("https://gemini.test/v1beta/models?")) return new Response(JSON.stringify({ models: [{ name: "models/gemini-test-flash", supportedGenerationMethods: ["generateContent"] }] }), { status: 200 });
    if (u.startsWith("https://gemini.test")) { calls++; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(GEMINI) }] } }] }), { status: 200 }); }
    if (u.endsWith("/robots.txt")) return new Response("", { status: 404 });
    return new Response(`<html><head><meta property="article:published_time" content="2026-11-04T02:00:00Z"></head><body><article>${PAGE.map((p) => `<p>${p}</p>`).join("")}</article></body></html>`, { status: 200, headers: { "content-type": "text/html" } });
  }) as typeof fetch;
  await saveSettings({ ...(await getSettings()), showDemoData: false });
  const done = mk("done0001", "analyzed");
  done.report = aiResult({ summary: ["기존 요약 1", "기존 요약 2", "기존 요약 3", "기존 요약 4"], analyzedAt: "2026-11-05T00:00:00.000Z" });
  await saveArticles([done, mk("queued01", "queued"), mk("filtr001", "filtered"), mk("analyz01", "analyzed"), mk("analyz02", "analyzed"), mk("dup00001", "duplicate", { duplicateOf: "done0001" })]);
});
after(() => { globalThis.fetch = realFetch; fs.rmSync(process.env.LOCAL_DB_DIR!, { recursive: true, force: true }); });

async function run(options: object) {
  const { job } = await startJob("manual", "weekly-analyze", range, options as never);
  for (let i = 0; i < 20; i++) { await driveJob(job.id, "http://localhost"); const j = await getJob(job.id); if (j && j.status !== "running") return j; }
  return (await getJob(job.id))!;
}

describe("전체 기사 AI 요약", () => {
  test("집계: 중복은 제외, 필터 제외·대기 기사는 요약 대상에 포함", async () => {
    const v = await loadWeekly(period);
    assert.equal(v.breakdown.duplicate, 1);
    assert.equal(v.summary.targets, 5);
    assert.equal(v.summary.done, 1);
    assert.equal(v.summary.remaining, 4);
    assert.equal(v.extraRows.length, 1);
    assert.equal(v.extraRows[0].articleStatus, "filtered");
  });
  test("일일 한도(3회)까지 요약하고, 한도 도달 시 실패로 기록하지 않고 중단 — 기존 요약은 그대로", async () => {
    const j = await run({ scope: "all" });
    assert.equal(calls, 3);
    assert.match(j.haltReason ?? "", /일일 한도|저장 후 중단/);
    const u = await geminiUsage();
    assert.equal(u.used, 3); assert.equal(u.remaining, 0);
    const v = await loadWeekly(period);
    assert.equal(v.summary.failed, 0, "한도 오류는 실패 요약으로 저장되지 않는다");
    assert.equal(v.summary.remaining, 1);
    assert.deepEqual((await getArticle("done0001"))!.report!.summary[0], "기존 요약 1", "완료된 요약은 덮어쓰지 않는다");
    assert.ok(v.extraRows[0].summary4.length === 4 || v.extraRows[0].summaryState === "none");
  });
  test("다음 날 한도가 풀리면 미분석 기사만 이어서 처리", async () => {
    process.env.GEMINI_RPD = "50";
    const before_ = calls;
    const j = await run({ scope: "all" });
    assert.equal(calls - before_, 1, "남은 1건만 호출");
    assert.equal(j.haltReason, null);
    const v = await loadWeekly(period);
    assert.equal(v.summary.remaining, 0);
    assert.equal(v.summary.done + v.summary.partial + v.summary.review + v.summary.unavailable, 5);
    assert.equal((await getArticle("dup00001"))!.report, undefined, "중복 기사는 요약 대상이 아니다");
  });
  test("재실행 시 완료된 요약은 재사용 (Gemini 호출 0건)", async () => {
    const before_ = calls;
    await run({ scope: "all" });
    assert.equal(calls, before_);
  });
  test("수집 기사 수 = 목록 + 필터 제외 (중복 별도), 필터 제외 기사 선정 시 보고서 목록으로 이동", async () => {
    const { setItem } = await import("@/lib/weekly/report");
    let v = await loadWeekly(period);
    assert.equal(v.counts.collected, v.rows.length + v.extraRows.length);
    assert.equal(v.dupRows.length, 1);
    assert.equal(v.extraRows.map((r) => r.id).join(), "filtr001");
    await setItem(period, "filtr001", { status: "selected" });
    v = await loadWeekly(period);
    assert.equal(v.counts.collected, v.rows.length + v.extraRows.length, "선정 후에도 합계 유지");
    assert.ok(v.rows.some((r) => r.id === "filtr001" && r.reportStatus === "selected"));
    assert.equal(v.extraRows.length, 0);
  });
  test("필터 제외 기사도 ids 지정 시 Gemini 요약 요청 가능", async () => {
    await saveArticles([mk("filtr002", "filtered")]);
    const before_ = calls;
    await run({ ids: ["filtr002"] });
    assert.equal(calls - before_, 1);
    assert.equal((await getArticle("filtr002"))!.report?.status, "done");
  });
});
