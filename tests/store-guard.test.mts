// 운영/개발 DB 분리: 개발 모드에서는 Supabase 키가 있어도 로컬 DB 사용, 운영(NODE_ENV=production / Vercel)에서만 Supabase.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.LOCAL_DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "gor-guard-"));
process.env.SUPABASE_URL = "https://example.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy-not-a-real-key";
const kind = async (env: Record<string, string | undefined>) => {
  const g = globalThis as { __gorStore?: unknown }; delete g.__gorStore;
  const old = { ...process.env };
  Object.assign(process.env, env); for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
  try { return (await import("@/lib/db/store")).getStore().kind; } finally { process.env = old; delete g.__gorStore; }
};

test("개발 모드는 로컬 DB, 옵트인·운영·Vercel 은 Supabase", async () => {
  assert.equal(await kind({ NODE_ENV: "development" }), "local");
  assert.equal(await kind({ NODE_ENV: "development", ALLOW_DEV_SUPABASE: "1" }), "supabase");
  assert.equal(await kind({ NODE_ENV: "production" }), "supabase");
  assert.equal(await kind({ NODE_ENV: "development", VERCEL: "1" }), "supabase");
});
