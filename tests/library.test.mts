// 보고서 이미지 자료실: 이미지·CI 검색, 이름 유사 기업 오연결 방지, 캡션 규칙·저장·보존, SSRF 방어. 외부 사이트·Gemini는 모의.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dns from "node:dns/promises";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";

process.env.LOCAL_DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "gor-lib-"));
process.env.GEMINI_API_KEY = "test-key"; process.env.GEMINI_BASE_URL = "https://gemini.test"; process.env.GEMINI_MODEL = "gemini-test-flash"; process.env.GEMINI_MIN_INTERVAL_MS = "0";
(dns as unknown as { lookup: unknown }).lookup = async (h: string) => (h.startsWith("internal") ? [{ address: "10.0.0.5", family: 4 }] : [{ address: "93.184.216.34", family: 4 }]);

const { article, aiResult } = await import("./helpers");
const { checkCaption, normalizeCaption, logoCaption } = await import("@/lib/report/caption");
const { pickEntity, normCompany, homepageLogo } = await import("@/lib/report/logo");
const { isPrivateIp, safeGetBuffer, sniffImage } = await import("@/lib/report/safe-fetch");
const { searchLibrary, getEntry, saveEntry, writeCaptions } = await import("@/lib/report/library");

describe("캡션 규칙", () => {
  test("좋은 예시는 통과", () => {
    for (const c of ["세종 사업장 생산시설을 점검하는 삼성전기 직원", "폴란드 신규 배터리 생산공장 조감도", "자동창고 시스템이 설치된 물류센터 내부", "생산라인에서 자재를 운반하는 자율주행 로봇", "KNAPP의 물류자동화 시스템 적용 현장", "삼성전기 공식 기업 CI"]) assert.ok(checkCaption(c).ok, `${c}: ${checkCaption(c).reason}`);
  });
  test("나쁜 예시는 거부 (서술형·'~됨'·마침표·제목 반복·근거 없는 숫자)", () => {
    for (const c of ["삼성전기가 세종 사업장을 방문했습니다.", "신규 공장을 건설할 예정입니다.", "물류자동화 시장의 성장이 기대됨.", "물류자동화 시장의 성장이 기대됨"]) assert.equal(checkCaption(c).ok, false, c);
    assert.equal(checkCaption("신규 공장 조감도", { title: "신규 공장 조감도" }).ok, false);
    assert.equal(checkCaption("연 5만 대 생산하는 공장 전경", { allowedText: "plant tour" }).ok, false);
    assert.equal(normalizeCaption("  “자동창고 내부”. "), "자동창고 내부");
    assert.equal(logoCaption("삼성전기"), "삼성전기 공식 기업 CI");
  });
});

describe("기업 CI 정확성", () => {
  const e = (id: string, label: string, extra: object = {}) => ({ id, labels: { en: { value: label } }, claims: { P856: [{ mainsnak: { datavalue: { value: "https://x.example" } } }] }, ...extra });
  test("이름이 정확히 같은 기업만 채택, 비슷한 이름은 거부", () => {
    assert.equal(pickEntity("Samsung Electro-Mechanics", [e("Q1", "Samsung Electronics"), e("Q2", "Samsung Electro-Mechanics Co., Ltd.")])?.id, "Q2");
    assert.equal(pickEntity("KNAPP", [e("Q3", "Knapp Industries"), e("Q4", "KNAPP AG")])?.id, "Q4");
    assert.equal(pickEntity("Hyundai", [e("Q5", "Hyundai Motor Company")]), null, "부분 일치는 오연결");
    assert.equal(pickEntity("Foo", [{ id: "Q6", labels: { en: { value: "Foo" } }, claims: {} }]), null, "공식 사이트·로고 정보 없음");
    assert.equal(normCompany("삼성전기(주)"), normCompany("삼성전기"));
  });
  test("홈페이지 로고: 파비콘은 제외하고 logo 이미지 선택", () => {
    assert.equal(homepageLogo('<header><img src="/favicon.ico"><a class="site-logo"><img src="/img/logo.svg"></a></header>', "https://corp.example/"), "https://corp.example/img/logo.svg");
    assert.equal(homepageLogo("<p>no images</p>", "https://corp.example/"), null);
  });
});

describe("안전한 다운로드", () => {
  test("사설 IP·내부 호스트·localhost 차단", async () => {
    assert.ok(isPrivateIp("10.1.2.3") && isPrivateIp("127.0.0.1") && isPrivateIp("169.254.169.254") && isPrivateIp("fd00::1") && isPrivateIp("::ffff:192.168.0.1"));
    assert.ok(!isPrivateIp("93.184.216.34"));
    assert.equal(await safeGetBuffer("http://localhost/x", { maxBytes: 1000 }), null);
    assert.equal(await safeGetBuffer("http://internal.example/x", { maxBytes: 1000 }), null, "DNS가 사설 IP로 해석");
    assert.equal(await safeGetBuffer("file:///etc/passwd", { maxBytes: 1000 }), null);
  });
  test("파일 내용으로 이미지 형식 판별 (Content-Type 불신)", async () => {
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#fff" } }).png().toBuffer();
    assert.equal(sniffImage(png), "image/png");
    assert.equal(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>')), "image/svg+xml");
    assert.equal(sniffImage(Buffer.from("<html><body>not an image</body></html>")), null);
  });
});

let geminiCalls = 0;
const realFetch = globalThis.fetch;
let big: Buffer, small: Buffer;
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><rect width="200" height="60" fill="#0a2"/></svg>';
before(async () => {
  big = await sharp({ create: { width: 800, height: 450, channels: 3, background: "#468" } }).jpeg().toBuffer();
  small = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#468" } }).png().toBuffer();
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const u = String(input);
    const html = (b: string, h = "") => new Response(`<html><head>${h}</head><body>${b}</body></html>`, { status: 200, headers: { "content-type": "text/html" } });
    if (u.startsWith("https://gemini.test/v1beta/models?")) return new Response(JSON.stringify({ models: [{ name: "models/gemini-test-flash", supportedGenerationMethods: ["generateContent"] }] }), { status: 200 });
    if (u.startsWith("https://gemini.test")) {
      geminiCalls++;
      const text: string = JSON.parse(String(init?.body)).contents[0].parts[0].text;
      const ids = [...text.matchAll(/\[(\w+)\] 유형/g)].map((m) => m[1]);
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ captions: ids.map((id) => ({ id, caption: "자동창고 시스템이 설치된 물류센터 내부" })) }) }] } }] }), { status: 200 });
    }
    if (u.startsWith("https://www.wikidata.org/w/api.php")) {
      const q = new URL(u).searchParams;
      if (q.get("action") === "wbsearchentities") return new Response(JSON.stringify({ search: [{ id: "Q1" }, { id: "Q2" }] }), { status: 200 });
      return new Response(JSON.stringify({ entities: {
        Q1: { id: "Q1", labels: { en: { value: "Acme Logistics Holdings" } }, claims: { P856: [{ mainsnak: { datavalue: { value: "https://other.example" } } }] } },
        Q2: { id: "Q2", labels: { en: { value: "Acme Robotics" } }, claims: { P856: [{ mainsnak: { datavalue: { value: "https://acme-robotics.example/" } } }], P154: [{ mainsnak: { datavalue: { value: "Acme Robotics logo.svg" } } }] } },
      } }), { status: 200 });
    }
    if (u === "https://acme-robotics.example/") return html('<header><a class="logo"><img src="/assets/logo.svg"></a></header>');
    if (u.endsWith("/assets/logo.svg") || u.includes("Special:FilePath")) return new Response(SVG, { status: 200, headers: { "content-type": "image/svg+xml" } });
    if (u === "https://news.example.com/acme-plant") return html("<p>body</p>", '<meta property="og:image" content="https://news.example.com/img/plant.jpg"><meta property="og:image:alt" content="Acme Robotics automated warehouse interior"><meta name="twitter:image" content="https://news.example.com/img/tiny.png">');
    if (u === "https://news.example.com/img/plant.jpg") return new Response(new Uint8Array(big), { status: 200, headers: { "content-type": "image/jpeg" } });
    if (u === "https://news.example.com/img/tiny.png") return new Response(new Uint8Array(small), { status: 200, headers: { "content-type": "image/png" } });
    if (u === "https://news.example.com/none") return html("<p>no images here</p>");
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
});
after(() => { globalThis.fetch = realFetch; fs.rmSync(process.env.LOCAL_DB_DIR!, { recursive: true, force: true }); });

describe("이미지 자료실 검색·저장", () => {
  const A = () => article({ id: "libart01", title: "Acme Robotics opens automated warehouse", url: "https://news.example.com/acme-plant", sourceDomain: "news.example.com" });
  const ai = () => aiResult({ company: { value: "Acme Robotics", evidence: "" } });

  test("기사 원문 이미지(작은 이미지 제외) + 공식 CI 검색, 출처·유형 기록, 캡션 생성", async () => {
    const entry = await searchLibrary(A(), ai());
    const art = entry.images.filter((i) => i.type === "article");
    assert.equal(art.length, 1, "너무 작은 이미지는 제외");
    assert.equal(art[0].sourceSite, "news.example.com");
    assert.equal(art[0].mime, "image/jpeg");
    assert.equal(art[0].caption, "자동창고 시스템이 설치된 물류센터 내부");
    assert.equal(art[0].captionBasis, "ai");
    const logos = entry.images.filter((i) => i.type === "logo");
    assert.equal(logos.length, 2);
    assert.equal(logos[0].sourceSite, "acme-robotics.example", "공식 홈페이지 로고 우선");
    assert.equal(logos[0].caption, "Acme Robotics 공식 기업 CI");
    assert.ok(logos[1].check, "Commons 로고는 확인 필요 표시");
    assert.ok(entry.notes.some((n) => n.startsWith("facility:")), "시설 이미지는 근거 없으면 '없음'으로 안내");
    assert.equal(geminiCalls, 1, "Gemini는 기사당 1회");
  });
  test("유사 이름 기업(Acme Logistics)의 로고는 연결하지 않음", async () => {
    const e = await getEntry("libart01");
    assert.ok(e.images.every((i) => !i.imageUrl.includes("other.example")));
  });
  test("재검색해도 직접 수정한 캡션·대표 이미지 보존, Gemini 재호출 없음", async () => {
    const e = await getEntry("libart01");
    const art = e.images.find((i) => i.type === "article")!;
    art.captionEdited = "Acme 자동화 창고 내부 전경"; e.primary = art.id;
    await saveEntry(e);
    const before = geminiCalls;
    const again = await searchLibrary(A(), ai());
    const same = again.images.find((i) => i.id === art.id)!;
    assert.equal(same.captionEdited, "Acme 자동화 창고 내부 전경");
    assert.equal(again.primary, art.id);
    await writeCaptions(A(), ai(), again);
    assert.equal(geminiCalls, before, "이미 있는 캡션·수정본은 다시 생성하지 않음");
  });
  test("이미지가 없는 기사: 빈 상태 안내, 임의 이미지 없음", async () => {
    const e = await searchLibrary(article({ id: "libart02", title: "No image story", url: "https://news.example.com/none" }), aiResult({ company: { value: "", evidence: "" } }));
    assert.equal(e.images.length, 0);
    assert.ok(e.notes.some((n) => n.startsWith("article:")) && e.notes.some((n) => n.startsWith("logo:")));
  });
});
