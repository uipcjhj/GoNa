// Storage abstraction. Two backends:
//  - Supabase (PostgreSQL) when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set (production)
//  - Local JSON file (.data/db.json) otherwise (development / demo; ephemeral on Vercel)
import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type TableName = "articles" | "opportunities" | "jobs" | "settings";

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

class LocalStore implements Store {
  kind: "local" | "local-ephemeral";
  private file: string;
  private data: LocalData | null = null;
  private writeTimer: NodeJS.Timeout | null = null;

  constructor(dir: string, ephemeral: boolean) {
    this.kind = ephemeral ? "local-ephemeral" : "local";
    this.file = path.join(dir, "db.json");
  }

  private load(): LocalData {
    if (this.data) return this.data;
    try {
      this.data = JSON.parse(fs.readFileSync(this.file, "utf8")) as LocalData;
    } catch {
      this.data = { articles: {}, opportunities: {}, jobs: {}, settings: {} };
    }
    for (const t of ["articles", "opportunities", "jobs", "settings"] as TableName[]) this.data[t] ??= {};
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
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }

  async list<T extends Row>(table: TableName, opts: ListOptions = {}): Promise<T[]> {
    const rows = Object.values(this.load()[table]) as T[];
    let out = rows.map((r) => ({ r, s: sortAt(table, r) }));
    if (opts.since) out = out.filter((x) => x.s >= opts.since!);
    out.sort((a, b) => (a.s < b.s ? 1 : -1));
    return out.slice(0, opts.limit ?? 20000).map((x) => structuredClone(x.r));
  }
  async get<T extends Row>(table: TableName, id: string): Promise<T | null> {
    const r = this.load()[table][id];
    return r ? (structuredClone(r) as T) : null;
  }
  async getMany<T extends Row>(table: TableName, ids: string[]): Promise<T[]> {
    const t = this.load()[table];
    return ids.map((id) => t[id]).filter(Boolean).map((r) => structuredClone(r) as T);
  }
  async upsert<T extends Row>(table: TableName, rows: T[]): Promise<void> {
    const t = this.load()[table];
    for (const r of rows) t[r.id] = structuredClone(r);
    this.persist();
  }
  async remove(table: TableName, ids: string[]): Promise<void> {
    const t = this.load()[table];
    for (const id of ids) delete t[id];
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
