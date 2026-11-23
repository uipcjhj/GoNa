import { NextResponse } from "next/server";
import { getStore } from "@/lib/db/store";
import { geminiConfigured } from "@/lib/ai/gemini";
import { authEnabled, viewerEnabled } from "@/lib/auth";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

/** 배포 점검용 (관리자 전용, 비밀값 없음): 어떤 DB를 쓰는지, 필수 설정이 들어갔는지. */
export async function GET() {
  const deny = await requireAdmin();
  if (deny) return deny;
  const store = getStore();
  let db: { ok: boolean; articles?: number; error?: string };
  try { db = { ok: true, articles: (await store.list("articles", { limit: 5000 })).length }; } catch (e) { db = { ok: false, error: e instanceof Error ? e.message.slice(0, 160) : "DB 오류" }; }
  return NextResponse.json({
    environment: process.env.VERCEL ? (process.env.VERCEL_ENV ?? "vercel") : process.env.NODE_ENV,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    database: { kind: store.kind, supabaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY), ...db, persistent: store.kind === "supabase" || store.kind === "local" },
    gemini: geminiConfigured(), login: { admin: authEnabled(), viewer: viewerEnabled() }, cronSecret: Boolean(process.env.CRON_SECRET),
    warnings: [
      store.kind === "local-ephemeral" ? "Supabase 환경변수가 없어 임시 저장소를 사용 중 — 서버가 재시작되면 데이터가 사라집니다" : "",
      !authEnabled() ? "APP_PASSWORD 미설정 — 누구나 접속·수정할 수 있습니다" : "",
      !process.env.CRON_SECRET ? "CRON_SECRET 미설정 — 자동 수집이 동작하지 않습니다" : "",
    ].filter(Boolean),
  });
}
