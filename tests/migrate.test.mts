// 로컬 DB → Supabase 이전: 계획·적용·검증·중복 방지·충돌 보호 (대상은 메모리 모의). 운영 데이터는 삭제·덮어쓰기하지 않는다.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { TABLES, apply, loadLocalSnapshot, plan, rowHash, summarize, verify, type Target } from "@/lib/db/migrate";
import type { Row, TableName } from "@/lib/db/store";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gor-mig-"));
const db = {
  articles: {
    a1: { id: "a1", status: "analyzed", report: { status: "done", summary: ["a", "b", "c", "d"] } },
    a2: { id: "a2", status: "filtered" },
    a3: { id: "a3", status: "analyzed", report: { status: "failed", summary: [] } },
  },
  opportunities: { o1: { id: "o1" } }, jobs: { j1: { id: "j1" } },
  settings: { "gemini:usage": { id: "gemini:usage", count: 3 }, "imglib:a1": { id: "imglib:a1" } },
  reports: { "2026-11-02_2026-11-08": { id: "2026-11-02_2026-11-08", items: { a1: { status: "selected", edits: { titleKo: "x" }, approvedAt: "t" }, a2: { status: "hold" } } } },
};
fs.writeFileSync(path.join(dir, "db.json"), JSON.stringify(db));
fs.mkdirSync(path.join(dir, "assets"));
fs.writeFileSync(path.join(dir, "assets", "a".repeat(32)), Buffer.from([1, 2, 3]));
fs.writeFileSync(path.join(dir, "assets", `${"a".repeat(32)}.mime`), "image/png");

class Mem implements Target {
  data = Object.fromEntries(TABLES.map((t) => [t, new Map<string, Row>()])) as Record<TableName, Map<string, Row>>;
  writes = 0;
  async hashes(t: TableName) { return new Map([...this.data[t]].map(([id, r]) => [id, rowHash(r)])); }
  async upsert(t: TableName, rows: Row[]) { this.writes += rows.length; for (const r of rows) this.data[t].set(r.id, JSON.parse(JSON.stringify(r))); }
}

describe("DB 이전", () => {
  const src = loadLocalSnapshot(dir);
  test("원본 요약: 기사·요약·선정·수정·승인 수, 로컬 이미지 파일은 asset 행으로 변환", () => {
    const s = summarize(src);
    assert.equal(s.articles, 3); assert.equal(s.withSummary, 1); assert.equal(s.summaryFailed, 1);
    assert.equal(s.selected, 1); assert.equal(s.userEdited, 1); assert.equal(s.approved, 1);
    assert.equal(s.assets, 1); assert.equal(s.imageLibraryRows, 1); assert.equal(s.settingsRows, 2);
    assert.equal((src.settings[`asset:${"a".repeat(32)}`] as unknown as { mime: string }).mime, "image/png");
  });
  test("빈 대상: 전부 추가 → 검증 통과 → 재실행해도 중복·추가 쓰기 없음", async () => {
    const t = new Mem();
    const p = await plan(src, t);
    assert.equal(p.reduce((n, x) => n + x.insert.length, 0), 3 + 1 + 1 + 3 + 1);
    await apply(src, t, p, "missing");
    assert.ok((await verify(src, t)).every((r) => r.ok && r.mismatched === 0));
    assert.deepEqual(summarize(Object.fromEntries(TABLES.map((k) => [k, Object.fromEntries(t.data[k])])) as never), summarize(src), "이전 전후 요약 동일");
    const w = t.writes;
    await apply(src, t, await plan(src, t), "missing");
    assert.equal(t.writes, w, "두 번째 실행은 아무것도 쓰지 않음");
    assert.equal(t.data.articles.size, 3, "중복 없음");
  });
  test("운영에 이미 있는 (내용이 다른) 행은 기본적으로 덮어쓰지 않고, --overwrite 에서만 덮어씀. 삭제는 없음", async () => {
    const t = new Mem();
    await t.upsert("articles", [{ id: "a1", status: "analyzed", report: { status: "done", summary: ["운영에서 수정"] } } as Row, { id: "prod-only", x: 1 } as Row]);
    const p = await plan(src, t);
    assert.deepEqual(p.find((x) => x.table === "articles")!.conflicts, ["a1"]);
    await apply(src, t, p, "missing");
    assert.deepEqual((t.data.articles.get("a1") as unknown as { report: { summary: string[] } }).report.summary, ["운영에서 수정"]);
    assert.ok(t.data.articles.has("prod-only"), "대상 전용 행 유지");
    await apply(src, t, p, "overwrite");
    assert.equal((t.data.articles.get("a1") as unknown as { report: { summary: string[] } }).report.summary.length, 4);
    assert.ok(t.data.articles.has("prod-only"));
  });
  test("누락 감지", async () => {
    const t = new Mem();
    await apply(src, t, await plan(src, t), "missing");
    t.data.articles.delete("a2");
    const v = await verify(src, t);
    assert.equal(v.find((r) => r.table === "articles")!.missing, 1);
    assert.equal(v.find((r) => r.table === "articles")!.ok, false);
  });
});
