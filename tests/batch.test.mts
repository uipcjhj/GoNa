// 배치 요약(기사 여러 건을 Gemini 1회 호출) — 기사 ID 매칭·누락 재시도·내용 혼입 차단·한도 중단·속도 비교. Gemini/원문 사이트는 모의 서버.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.LOCAL_DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "gor-batch-"));
process.env.GEMINI_API_KEY = "test-key"; process.env.GEMINI_BASE_URL = "https://gemini.test"; process.env.GEMINI_MODEL = "gemini-test-flash";
process.env.GEMINI_MIN_INTERVAL_MS = "300"; process.env.FETCH_DOMAIN_GAP_MS = "0"; process.env.GEMINI_BATCH = "5";

const { article } = await import("./helpers");
const { getSettings } = await import("@/lib/db/repo");
const { analyzeBatch, resetBatchSize } = await import("@/lib/report/batch");
const { analyzeForReport } = await import("@/lib/report/factcheck");
const { resetFetchPolicy, readArticleSource } = await import("@/lib/report/source");
const { takeTimings } = await import("@/lib/util/timing");

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
const PAGE_MS = 80, GEMINI_MS = 150;
const marker = (n: number) => `Foodbot${n} Robotics`;
const pageOf = (n: number) => `<html><head><meta property="article:published_time" content="2026-11-04T02:00:00Z"></head><body><article>${PAGE.map((p) => `<p>${p.replaceAll("Foodbot Robotics", marker(n))}</p>`).join("")}</article></body></html>`;
const resp = (n: number) => JSON.parse(JSON.stringify({ ...GEMINI, company: { ...GEMINI.company, value: marker(n), evidence: GEMINI.company.evidence.replaceAll("Foodbot Robotics", marker(n)) }, summary: NEW.map((l) => l.replaceAll("Foodbot Robotics", marker(n))), line_evidence: GEMINI.line_evidence.map((l) => l.replaceAll("Foodbot Robotics", marker(n))) }));
const idNum = new Map<string, number>();
const mk = (n: number, extra: object = {}) => { const id = `art${String(n).padStart(3, "0")}`; idNum.set(id, n); return article({ id, title: `Robotics kitchen story ${n}`, url: `https://site${n}.example.com/a`, sourceDomain: `site${n}.example.com`, excerpt: PAGE[0].replaceAll("Foodbot Robotics", marker(n)), ...extra }); };

let geminiCalls = 0, pageFetches = 0;
let mode: "ok" | "omit" | "swap" | "garbage" | "quota" = "ok";
let omitId = "", dead = new Set<number>();
const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input);
    if (u.startsWith("https://gemini.test/v1beta/models?")) return new Response(JSON.stringify({ models: [{ name: "models/gemini-test-flash", supportedGenerationMethods: ["generateContent"] }] }), { status: 200 });
    if (u.startsWith("https://gemini.test")) {
      geminiCalls++;
      await new Promise((r) => setTimeout(r, GEMINI_MS));
      if (mode === "quota") return new Response(JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded for metric generate_content_free_tier_requests, limit: 200 per day" } }), { status: 429 });
      const body = JSON.parse(String(init?.body ?? "{}"));
      const text: string = body.contents?.[0]?.parts?.[0]?.text ?? "";
      const ids = [...text.matchAll(/\[ARTICLE id=(\w+)\]/g)].map((m) => m[1]);
      let out: unknown;
      if (!ids.length) out = resp(idNum.get([...idNum.keys()].find((k) => text.includes(marker(idNum.get(k)!)))!) ?? 0);
      else {
        let list = ids.filter((i) => !(mode === "omit" && i === omitId)).map((i) => ({ id: i, ...resp(idNum.get(i)!) }));
        if (mode === "swap") list = list.map((x, k) => ({ ...resp(idNum.get(ids[(k + 1) % ids.length])!), id: x.id })); // 다른 기사 내용이 섞여 온 응답
        out = { results: list };
      }
      const textOut = mode === "garbage" && ids.length ? "{not json" : JSON.stringify(out);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: textOut }] } }] }), { status: 200 });
    }
    if (u.endsWith("/robots.txt")) return new Response("", { status: 404 });
    pageFetches++;
    await new Promise((r) => setTimeout(r, PAGE_MS));
    const n = Number(/site(\d+)\./.exec(u)?.[1]);
    if (dead.has(n)) return new Response("nope", { status: 503 });
    return new Response(pageOf(n), { status: 200, headers: { "content-type": "text/html" } });
  }) as typeof fetch;
});
after(() => { globalThis.fetch = realFetch; fs.rmSync(process.env.LOCAL_DB_DIR!, { recursive: true, force: true }); });

const fresh = async (from: number, n: number) => { resetFetchPolicy(); resetBatchSize(); geminiCalls = 0; pageFetches = 0; mode = "ok"; dead = new Set(); return Array.from({ length: n }, (_, i) => mk(from + i)); };

describe("배치 요약", () => {
  test("10건 → Gemini 2회 호출, 기사 ID별로 자기 내용만 저장", async () => {
    const arts = await fresh(1, 10);
    const out = await analyzeBatch(arts, await getSettings());
    assert.equal(geminiCalls, 2);
    assert.equal(out.results.size, 10);
    for (const a of arts) {
      const r = out.results.get(a.id)!;
      assert.equal(r.status, "done", `${a.id}: ${r.reviewReasons.join(",")}`);
      assert.ok(r.company.value.includes(marker(idNum.get(a.id)!)), "자기 기사 기업명");
      assert.ok(r.summary[0].includes(marker(idNum.get(a.id)!)));
    }
  });
  test("응답에서 빠진 기사만 1건씩 다시 요청", async () => {
    const arts = await fresh(21, 5); mode = "omit"; omitId = arts[2].id;
    const out = await analyzeBatch(arts, await getSettings());
    assert.equal(geminiCalls, 2, "배치 1 + 누락 1건 개별 1");
    assert.equal(out.stats.singles, 1);
    assert.equal(out.results.get(omitId)!.status, "done");
  });
  test("다른 기사 내용이 섞인 응답은 '완료'로 저장하지 않음", async () => {
    const arts = await fresh(31, 4); mode = "swap";
    const out = await analyzeBatch(arts, await getSettings());
    // 혼입 응답은 그대로 저장되지 않고(기업명 불일치 감지) 기사별 재작성으로 자기 원문 내용으로 교정된다
    assert.ok(geminiCalls >= 1 + arts.length, "혼입 감지 → 기사별 재요청");
    for (const a of arts) assert.ok(out.results.get(a.id)!.company.value.includes(marker(idNum.get(a.id)!)), "자기 기사 기업명으로 교정");
  });
  test("배치 응답 파싱 실패 → 배치 크기 축소, 기사별 개별 처리로 모두 저장", async () => {
    const arts = await fresh(41, 4); mode = "garbage";
    const out = await analyzeBatch(arts, await getSettings());
    assert.equal(out.results.size, 4);
    for (const a of arts) assert.equal(out.results.get(a.id)!.status, "done");
    const { batchSize } = await import("@/lib/report/batch");
    assert.ok(batchSize() < 5, "배치 크기 축소");
  });
  test("일일 한도(429) → 저장 없이 중단, 기사는 미분석 상태 유지", async () => {
    const arts = await fresh(51, 5); mode = "quota";
    const out = await analyzeBatch(arts, await getSettings());
    assert.ok(out.halt);
    assert.equal(out.results.size, 0);
    assert.equal(geminiCalls, 1, "한도 오류 후 재시도 없음");
  });
  test("원문 접근 실패 기사는 대기하지 않고 '원문 부족'으로 기록, 나머지는 정상", async () => {
    const arts = await fresh(61, 5); dead = new Set([62]); arts[1].excerpt = null;
    const out = await analyzeBatch(arts, await getSettings());
    assert.equal(out.results.get(arts[1].id)!.status, "insufficient_source");
    assert.equal(out.results.size, 5);
  });
  test("같은 URL 재조회는 캐시 사용 (원문 재다운로드 없음)", async () => {
    const [a] = await fresh(71, 1);
    await readArticleSource(a); const n = pageFetches; await readArticleSource(a);
    assert.equal(pageFetches, n);
  });
  test("속도 비교: 기존 순차 방식 vs 개선(병렬 원문 + 배치) — 10건", async () => {
    const seqArts = await fresh(101, 10);
    const settings = await getSettings();
    let t = Date.now();
    for (const a of seqArts) await analyzeForReport(a, settings);
    const seq = Date.now() - t, seqCalls = geminiCalls;
    const batArts = await fresh(201, 10);
    takeTimings(); t = Date.now();
    await analyzeBatch(batArts, settings);
    const bat = Date.now() - t, batCalls = geminiCalls;
    console.log(`[벤치] 순차 ${(seq / 10).toFixed(0)}ms/건 (호출 ${seqCalls}) → 개선 ${(bat / 10).toFixed(0)}ms/건 (호출 ${batCalls}) · ${(seq / bat).toFixed(1)}배`);
    assert.ok(bat < seq && batCalls < seqCalls);
  });
});
