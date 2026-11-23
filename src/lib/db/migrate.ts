// 로컬 DB(.data/db.json + assets) → Supabase 안전 이전 로직 (순수·테스트 가능).
// 원칙: 원본은 읽기만 한다 · 기본은 '없는 행만 추가'(운영에 이미 있는 행은 덮어쓰지 않음) · 행 삭제 없음 · 전후 요약 비교와 행 단위 해시 검증.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Row, TableName } from "./store";

export const TABLES: TableName[] = ["articles", "opportunities", "jobs", "settings", "reports"];
export type Tables = Record<TableName, Record<string, Row>>;

const stable = (v: unknown): string => (v && typeof v === "object" ? (Array.isArray(v) ? `[${v.map(stable).join(",")}]` : `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(",")}}`) : JSON.stringify(v));
export const rowHash = (r: unknown) => createHash("sha256").update(stable(r)).digest("hex").slice(0, 24);

/** .data 폴더 → 테이블 스냅샷. 로컬 assets(이미지 파일)는 Supabase 와 같은 형식의 settings 행(asset:<id>)으로 변환한다. */
export function loadLocalSnapshot(dir: string): Tables {
  const file = path.join(dir, "db.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<Tables>;
  const t = Object.fromEntries(TABLES.map((k) => [k, { ...(raw[k] ?? {}) }])) as Tables;
  const assets = path.join(dir, "assets");
  if (fs.existsSync(assets)) {
    for (const f of fs.readdirSync(assets)) {
      if (!/^[a-f0-9]{16,64}$/.test(f)) continue;
      const buf = fs.readFileSync(path.join(assets, f));
      const mimeFile = path.join(assets, `${f}.mime`);
      t.settings[`asset:${f}`] = { id: `asset:${f}`, mime: fs.existsSync(mimeFile) ? fs.readFileSync(mimeFile, "utf8") : "image/jpeg", data: buf.toString("base64"), size: buf.length, updatedAt: new Date().toISOString() } as Row;
    }
  }
  return t;
}

export interface Summary {
  articles: number; articlesByStatus: Record<string, number>; withSummary: number; summaryDone: number; summaryFailed: number;
  weeklyReports: number; selected: number; userEdited: number; approved: number; opportunities: number; jobs: number;
  settingsRows: number; assets: number; imageLibraryRows: number;
}

/** 기사·요약·선정 수 요약 (이전 전후 비교용). */
export function summarize(t: Tables): Summary {
  const arts = Object.values(t.articles) as unknown as { status?: string; report?: { status?: string; summary?: unknown[] } }[];
  const byStatus: Record<string, number> = {};
  for (const a of arts) byStatus[a.status ?? "?"] = (byStatus[a.status ?? "?"] ?? 0) + 1;
  const items = Object.values(t.reports).flatMap((r) => Object.values((r as unknown as { items?: Record<string, { status?: string; edits?: unknown; approvedAt?: unknown }> }).items ?? {}));
  const sid = Object.keys(t.settings);
  return {
    articles: arts.length, articlesByStatus: byStatus,
    withSummary: arts.filter((a) => a.report && Array.isArray(a.report.summary) && a.report.summary.length === 4).length,
    summaryDone: arts.filter((a) => a.report?.status === "done").length,
    summaryFailed: arts.filter((a) => a.report?.status === "failed").length,
    weeklyReports: Object.keys(t.reports).length,
    selected: items.filter((i) => i.status === "selected").length,
    userEdited: items.filter((i) => i.edits).length,
    approved: items.filter((i) => i.approvedAt).length,
    opportunities: Object.keys(t.opportunities).length, jobs: Object.keys(t.jobs).length,
    settingsRows: sid.filter((i) => !i.startsWith("asset:")).length, assets: sid.filter((i) => i.startsWith("asset:")).length,
    imageLibraryRows: sid.filter((i) => i.startsWith("imglib:")).length,
  };
}

export interface Target {
  /** 대상 테이블의 id → 행 해시 (읽기 전용) */
  hashes(table: TableName): Promise<Map<string, string>>;
  upsert(table: TableName, rows: Row[]): Promise<void>;
}

export interface Plan { table: TableName; source: number; insert: string[]; identical: number; conflicts: string[] }

export async function plan(src: Tables, target: Target): Promise<Plan[]> {
  const out: Plan[] = [];
  for (const table of TABLES) {
    const have = await target.hashes(table);
    const p: Plan = { table, source: Object.keys(src[table]).length, insert: [], identical: 0, conflicts: [] };
    for (const [id, row] of Object.entries(src[table])) {
      const h = have.get(id);
      if (h === undefined) p.insert.push(id);
      else if (h === rowHash(row)) p.identical++;
      else p.conflicts.push(id);
    }
    out.push(p);
  }
  return out;
}

/** 'missing'(기본): 대상에 없는 행만 추가. 'overwrite': 충돌 행도 원본으로 덮어씀. 삭제는 절대 하지 않는다. */
export async function apply(src: Tables, target: Target, plans: Plan[], mode: "missing" | "overwrite", log: (s: string) => void = () => undefined): Promise<void> {
  for (const p of plans) {
    const ids = mode === "overwrite" ? [...p.insert, ...p.conflicts] : p.insert;
    for (let i = 0; i < ids.length; i += 100) {
      await target.upsert(p.table, ids.slice(i, i + 100).map((id) => src[p.table][id]));
      log(`${p.table}: ${Math.min(i + 100, ids.length)}/${ids.length}`);
    }
  }
}

/** 이전 후 검증: 원본의 모든 행이 대상에 있는지(누락), 내용이 같은지(불일치), 대상에만 있는 행(운영 추가분)은 몇 건인지. */
export async function verify(src: Tables, target: Target): Promise<{ table: TableName; missing: number; mismatched: number; targetOnly: number; ok: boolean }[]> {
  const out = [];
  for (const table of TABLES) {
    const have = await target.hashes(table);
    let missing = 0, mismatched = 0;
    for (const [id, row] of Object.entries(src[table])) {
      const h = have.get(id);
      if (h === undefined) missing++; else if (h !== rowHash(row)) mismatched++;
    }
    out.push({ table, missing, mismatched, targetOnly: [...have.keys()].filter((id) => !(id in src[table])).length, ok: missing === 0 });
  }
  return out;
}
