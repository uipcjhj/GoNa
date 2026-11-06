// Storage abstraction. Two backends:
//  - Supabase (PostgreSQL) when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set (production)
//  - Local JSON file (.data/db.json) otherwise (development / demo; ephemeral on Vercel)
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type TableName = "articles" | "opportunities" | "jobs" | "settings" | "reports";

export interface Row {
  id: string;
}

export interface ListOptions {
  since?: string; // ISO, filters on sort_at >= since
  limit?: number;
}

export interface Store {
  kind: "supabase" | "local" | "local-ephemeral";
  list<T extends Row>(table: TableName, opts?: ListOptions): Promise<T[]>;
  get<T extends Row>(table: TableName, id: string): Promise<T | null>;
  getMany<T extends Row>(table: TableName, ids: string[]): Promise<T[]>;
  upsert<T extends Row>(table: TableName, rows: T[]): Promise<void>;
  remove(table: TableName, ids: string[]): Promise<void>;
}

/** Which timestamp each table is sorted / time-filtered by. */
function sortAt(table: TableName, row: Row): string {
  const r = row as unknown as Record<string, unknown>;
  const v =
    table === "articles"
      ? (r.publishedAt as string) || (r.discoveredAt as string)
      : table === "opportunities"
        ? (r.lastUpdatedAt as string)
        : table === "jobs"
          ? (r.startedAt as string)
          : table === "reports"
            ? (r.start as string)
            : null;
  return v || new Date().toISOString();
}

// ---------------------------------------------------------------- Supabase
class SupabaseStore implements Store {
  kind = "supabase" as const;
  constructor(private sb: SupabaseClient) {}

  async list<T extends Row>(table: TableName, opts: ListOptions = {}): Promise<T[]> {
    const out: T[] = [];
    const page = 1000;
    const limit = opts.limit ?? 20000;
    for (let from = 0; from < limit; from += page) {
      let q = this.sb.from(table).select("data").order("sort_at", { ascending: false });
      if (opts.since) q = q.gte("sort_at", opts.since);
      const { data, error } = await q.range(from, Math.min(from + page, limit) - 1);
      if (error) throw new Error(`Supabase list ${table}: ${error.message}`);
      out.push(...(data ?? []).map((d) => d.data as T));
      if (!data || data.length < page) break;
    }
    return out;
  }
  async get<T extends Row>(table: TableName, id: string): Promise<T | null> {
    const { data, error } = await this.sb.from(table).select("data").eq("id", id).maybeSingle();
    if (error) throw new Error(`Supabase get ${table}: ${error.message}`);
    return (data?.data as T) ?? null;
  }
  async getMany<T extends Row>(table: TableName, ids: string[]): Promise<T[]> {
    if (!ids.length) return [];
    const out: T[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await this.sb.from(table).select("data").in("id", ids.slice(i, i + 200));
      if (error) throw new Error(`Supabase getMany ${table}: ${error.message}`);
      out.push(...(data ?? []).map((d) => d.data as T));
    }
    return out;
  }
  async upsert<T extends Row>(table: TableName, rows: T[]): Promise<void> {
    if (!rows.length) return;
    const now = new Date().toISOString();
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200).map((r) => ({ id: r.id, data: r, sort_at: sortAt(table, r), updated_at: now }));
      const { error } = await this.sb.from(table).upsert(chunk, { onConflict: "id" });
      if (error) throw new Error(`Supabase upsert ${table}: ${error.message}`);
    }
  }
  async remove(table: TableName, ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await this.sb.from(table).delete().in("id", ids.slice(i, i + 200));
      if (error) throw new Error(`Supabase delete ${table}: ${error.message}`);
    }
  }
}

// ---------------------------------------------------------------- Local JSON
type LocalData = Record<TableName, Record<string, Row>>;

const TABLES: TableName[] = ["articles", "opportunities", "jobs", "settings", "reports"];

/**
 * Local JSON-file store. Safe against a second writer on the same file (e.g. an old dev server still finishing a
 * collection job after a restart): it re-reads the file when another process changed it, and on save it only
 * overwrites the rows this process changed, instead of rewriting the whole file from a stale in-memory copy.
 */
class LocalStore implements Store {
  kind: "local" | "local-ephemeral";
  private file: string;
  private data: LocalData | null = null;
  private mtimeMs = 0;
  private writeTimer: NodeJS.Timeout | null = null;
  private dirty: Record<TableName, Set<string>> = this.emptySets();
  private removed: Record<TableName, Set<string>> = this.emptySets();

  constructor(dir: string, ephemeral: boolean) {
    this.kind = ephemeral ? "local-ephemeral" : "local";
    this.file = path.join(dir, "db.json");
  }

  private emptySets(): Record<TableName, Set<string>> {
    return Object.fromEntries(TABLES.map((t) => [t, new Set<string>()])) as Record<TableName, Set<string>>;
  }

  private readDisk(): { data: LocalData; mtimeMs: number } {
    let data: LocalData;
    let mtimeMs = 0;
    try {
      mtimeMs = fs.statSync(this.file).mtimeMs;
      data = JSON.parse(fs.readFileSync(this.file, "utf8")) as LocalData;
    } catch {
      data = { articles: {}, opportunities: {}, jobs: {}, settings: {}, reports: {} };
    }
    for (const t of TABLES) data[t] ??= {};
    return { data, mtimeMs };
  }

  private diskMtime(): number {
    try {
      return fs.statSync(this.file).mtimeMs;
    } catch {
      return 0;
    }
  }

  /** Load once, and reload (keeping this process's unsaved changes) when another process wrote the file. */
  private load(): LocalData {
    if (this.data && this.diskMtime() === this.mtimeMs) return this.data;
    const disk = this.readDisk();
    if (this.data) {
      for (const t of TABLES) {
        for (const id of this.dirty[t]) if (this.data[t][id]) disk.data[t][id] = this.data[t][id];
        for (const id of this.removed[t]) delete disk.data[t][id];
      }
    }
    this.data = disk.data;
    this.mtimeMs = disk.mtimeMs;
    return this.data;
  }

  private persist() {
    if (this.writeTimer) return;
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      this.flush();
    }, 150);
  }

  flush() {
    if (!this.data) return;
    const data = this.load(); // merges any concurrent external write first
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, this.file);
    this.mtimeMs = this.diskMtime();
    this.dirty = this.emptySets();
    this.removed = this.emptySets();
  }

  async list<T extends Row>(table: TableName, opts: ListOptions = {}): Promise<T[]> {
    const rows = Object.values(this.load()[table]) as unknown as T[];
    let out = rows.map((r) => ({ r, s: sortAt(table, r) }));
    if (opts.since) out = out.filter((x) => x.s >= opts.since!);
    out.sort((a, b) => (a.s < b.s ? 1 : -1));
    return out.slice(0, opts.limit ?? 20000).map((x) => structuredClone(x.r));
  }
  async get<T extends Row>(table: TableName, id: string): Promise<T | null> {
    const r = this.load()[table][id];
    return r ? (structuredClone(r) as unknown as T) : null;
  }
  async getMany<T extends Row>(table: TableName, ids: string[]): Promise<T[]> {
    const t = this.load()[table];
    return ids.map((id) => t[id]).filter(Boolean).map((r) => structuredClone(r) as unknown as T);
  }
  async upsert<T extends Row>(table: TableName, rows: T[]): Promise<void> {
    const t = this.load()[table];
    for (const r of rows) {
      t[r.id] = structuredClone(r);
      this.dirty[table].add(r.id);
      this.removed[table].delete(r.id);
    }
    this.persist();
  }
  async remove(table: TableName, ids: string[]): Promise<void> {
    const t = this.load()[table];
    for (const id of ids) {
      delete t[id];
      this.removed[table].add(id);
      this.dirty[table].delete(id);
    }
    this.persist();
  }
}

const g = globalThis as unknown as { __gorStore?: Store };

export function supabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getStore(): Store {
  if (g.__gorStore) return g.__gorStore;
  if (supabaseConfigured()) {
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    g.__gorStore = new SupabaseStore(sb);
  } else {
    const onVercel = Boolean(process.env.VERCEL);
    const dir = process.env.LOCAL_DB_DIR || (onVercel ? "/tmp/gor-data" : path.join(process.cwd(), ".data"));
    g.__gorStore = new LocalStore(dir, onVercel);
  }
  return g.__gorStore;
}
