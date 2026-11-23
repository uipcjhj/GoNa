// Supabase 저장소 경로 검증 (모의 PostgREST 서버): 기사·요약·선정·캡션(자료실)·이미지 자산·작업이 서버 재시작(저장소 객체 재생성) 후에도 유지되는지.
// 로컬 파일(.data)을 쓰지 않는 것도 확인한다 (Render 무료 서버는 재시작 시 파일이 사라짐).
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

type R = { id: string; data: unknown; sort_at: string; updated_at: string };
const tables: Record<string, Map<string, R>> = { articles: new Map(), opportunities: new Map(), jobs: new Map(), settings: new Map(), reports: new Map() };
let srv: http.Server;
const localDir = fs.mkdtempSync(path.join(os.tmpdir(), "gor-sbtest-"));

before(async () => {
  srv = http.createServer((req, res) => {
    const u = new URL(req.url!, "http://x");
    const t = tables[u.pathname.replace("/rest/v1/", "")];
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (code: number, v: unknown) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(v)); };
      if (!t) return send(404, { message: "no table" });
      const filt = (rows: R[]) => {
        let out = rows;
        const id = u.searchParams.get("id");
        if (id?.startsWith("eq.")) out = out.filter((r) => r.id === id.slice(3));
        if (id?.startsWith("in.")) { const ids = id.slice(4, -1).split(",").map((x) => x.replace(/^"|"$/g, "")); out = out.filter((r) => ids.includes(r.id)); }
        const since = u.searchParams.get("sort_at");
        if (since?.startsWith("gte.")) out = out.filter((r) => r.sort_at >= since.slice(4));
        return out;
      };
      if (req.method === "GET") {
        let rows = filt([...t.values()]).sort((a, b) => b.sort_at.localeCompare(a.sort_at));
        const off = Number(u.searchParams.get("offset") ?? 0), lim = Number(u.searchParams.get("limit") ?? 1e9);
        const range = /^(\d+)-(\d+)$/.exec(String(req.headers["range"] ?? ""));
        rows = range ? rows.slice(Number(range[1]), Number(range[2]) + 1) : rows.slice(off, off + lim);
        const cols = (u.searchParams.get("select") ?? "*").split(",");
        const out = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => cols.includes("*") || cols.includes(k))));
        if (String(req.headers.accept).includes("pgrst.object")) return out.length === 1 ? send(200, out[0]) : send(406, { code: "PGRST116", message: "no rows", details: "", hint: "" });
        return send(200, out);
      }
      if (req.method === "POST") { for (const r of JSON.parse(body) as R[]) t.set(r.id, r); return send(201, []); }
      if (req.method === "DELETE") { for (const r of filt([...t.values()])) t.delete(r.id); return send(204, []); }
      send(405, {});
    });
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  process.env.SUPABASE_URL = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy-test-key"; process.env.ALLOW_DEV_SUPABASE = "1"; process.env.LOCAL_DB_DIR = localDir;
  process.env.GEMINI_NO_USAGE_TRACKING = "1";
});
after(() => { srv.close(); fs.rmSync(localDir, { recursive: true, force: true }); });

const restart = () => { delete (globalThis as { __gorStore?: unknown }).__gorStore; }; // 서버 재시작 = 메모리 상태 소멸

test("모든 영구 데이터가 Supabase에 저장되고, 재시작 후에도 조회·수정 가능 (로컬 파일 미사용)", async () => {
  const { article, aiResult } = await import("./helpers");
  const repo = await import("@/lib/db/repo");
  const { getStore } = await import("@/lib/db/store");
  const { saveAsset, getAsset } = await import("@/lib/report/assets");
  const { saveEntry, getEntry, emptyEntry } = await import("@/lib/report/library");
  const { setItem } = await import("@/lib/weekly/report");
  const { resolvePeriod } = await import("@/lib/weekly/period");

  assert.equal(getStore().kind, "supabase");
  const a = article({ id: "sb000001", title: "Persistence check", publishedAt: "2026-11-04T02:00:00Z" });
  a.report = aiResult({ summary: ["1줄", "2줄", "3줄", "4줄"] });
  await repo.saveArticles([a]);
  const period = resolvePeriod({ p: "custom", start: "2026-11-02", end: "2026-11-08" });
  await setItem(period, "sb000001", { status: "selected" });
  const e = emptyEntry("sb000001"); e.images.push({ id: "img1", type: "article", imageUrl: "https://x.example/a.jpg", pageUrl: "https://x.example", sourceSite: "x.example", sourceNote: "", mime: "image/jpeg", width: 1, height: 1, alt: "", caption: "", captionBasis: "none", captionEdited: "직접 수정한 캡션 문구", check: null }); e.primary = "img1";
  await saveEntry(e);
  const assetId = await saveAsset(Buffer.from([1, 2, 3, 4]), "image/png");
  await repo.saveJob({ id: "job_x", mode: "weekly-analyze", status: "running", startedAt: "2026-11-05T00:00:00Z", analyzeIndex: 7, analyzeQueue: ["a", "b"] } as never);

  restart(); // ── 서버 재시작(슬립 후 재기동) ──
  assert.equal((await repo.getArticle("sb000001"))!.report!.summary[3], "4줄", "요약 유지");
  const { getReport } = await import("@/lib/weekly/report");
  assert.equal((await getReport(period)).items["sb000001"].status, "selected", "선정 유지");
  const e2 = await getEntry("sb000001");
  assert.equal(e2.images[0].captionEdited, "직접 수정한 캡션 문구", "수정한 캡션 유지"); assert.equal(e2.primary, "img1");
  assert.deepEqual([...(await getAsset(assetId))!.buf], [1, 2, 3, 4], "이미지 자산 유지");
  assert.equal((await repo.getJob("job_x"))!.analyzeIndex, 7, "작업 진행 위치 유지 (이어서 처리)");
  assert.ok(!fs.existsSync(path.join(localDir, "db.json")), "로컬 db.json 미생성");
  assert.ok(!fs.existsSync(path.join(localDir, "assets")), "로컬 assets 미생성");
});
