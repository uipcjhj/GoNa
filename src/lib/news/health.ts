// 소스 상태(연속 실패 시 일시 보류)와 수집 이어하기(미완료·실패 검색 저장). 설정 테이블의 별도 행에 저장 — 기존 설정·기사 데이터와 분리.
import "server-only";
import { getStore } from "@/lib/db/store";
import type { PlannedQuery } from "@/lib/types";

interface HealthRow { id: string; sources: Record<string, { ok: number; fail: number; streak: number; lastOkAt: string | null; lastFailAt: string | null; lastError: string | null; quarantineUntil: string | null; lastItems: number }>; updatedAt: string }
const HEALTH_ID = "health:sources";
const QUARANTINE_AFTER = 3; // consecutive failures (across runs) before a source is paused
const QUARANTINE_HOURS = 24;

let cache: HealthRow | null = null;
export async function loadHealth(): Promise<HealthRow> {
  if (!cache) cache = (await getStore().get<HealthRow>("settings", HEALTH_ID)) ?? { id: HEALTH_ID, sources: {}, updatedAt: new Date().toISOString() };
  return cache;
}
export async function flushHealth(): Promise<void> {
  if (!cache) return;
  cache.updatedAt = new Date().toISOString();
  await getStore().upsert("settings", [cache]);
}
export function isQuarantined(h: HealthRow, key: string, now = Date.now()): string | null {
  const s = h.sources[key];
  return s?.quarantineUntil && Date.parse(s.quarantineUntil) > now ? s.quarantineUntil : null;
}
export function recordHealth(h: HealthRow, key: string, ok: boolean, items: number, error?: string, now = new Date()) {
  const s = (h.sources[key] ??= { ok: 0, fail: 0, streak: 0, lastOkAt: null, lastFailAt: null, lastError: null, quarantineUntil: null, lastItems: 0 });
  if (ok) { s.ok++; s.streak = 0; s.lastOkAt = now.toISOString(); s.lastItems = items; s.quarantineUntil = null; }
  else {
    s.fail++; s.streak++; s.lastFailAt = now.toISOString(); s.lastError = (error ?? "").slice(0, 120);
    // only feed-like sources are paused; the aggregated search providers are handled by the per-run circuit breaker
    if (s.streak >= QUARANTINE_AFTER && key.startsWith("rss:")) s.quarantineUntil = new Date(now.getTime() + QUARANTINE_HOURS * 3600_000).toISOString();
  }
}

// ---------------------------------------------------------------- resume
export interface ResumeRow { id: string; done: string[]; failed: PlannedQuery[]; pending: PlannedQuery[]; updatedAt: string }
const resumeId = (r: { startDate: string; endDate: string }) => `resume:${r.startDate}_${r.endDate}`;
const FRESH_MS = 24 * 3600_000;

export async function getResume(range: { startDate: string; endDate: string }): Promise<ResumeRow | null> {
  const r = await getStore().get<ResumeRow>("settings", resumeId(range));
  return r && Date.now() - Date.parse(r.updatedAt) < FRESH_MS ? r : null;
}
/** Remember which searches finished, failed or were not reached, so the next run can continue instead of starting over. */
export async function saveResume(range: { startDate: string; endDate: string }, queries: PlannedQuery[], cursor: number, failedLabels: Set<string>): Promise<ResumeRow> {
  const prev = await getResume(range);
  const doneNow = queries.slice(0, cursor).filter((q) => !failedLabels.has(q.label)).map((q) => q.label);
  const done = new Set([...(prev?.done ?? []), ...doneNow]);
  const failedQ = queries.slice(0, cursor).filter((q) => failedLabels.has(q.label));
  const failed = [...(prev?.failed ?? []).filter((q) => !done.has(q.label) && !failedQ.some((x) => x.label === q.label)), ...failedQ].filter((q) => !done.has(q.label));
  const pending = [...queries.slice(cursor), ...(prev?.pending ?? [])].filter((q, i, a) => !done.has(q.label) && a.findIndex((x) => x.label === q.label) === i);
  const row: ResumeRow = { id: resumeId(range), done: [...done], failed, pending, updatedAt: new Date().toISOString() };
  await getStore().upsert("settings", [row]);
  return row;
}
/** Plan for a continue / failed-only run: unfinished work first. RSS feeds are cheap and always refreshed. */
export function applyResume(plan: PlannedQuery[], row: ResumeRow, mode: "continue" | "failed"): PlannedQuery[] {
  const have = new Set<string>();
  const out: PlannedQuery[] = [];
  const push = (q: PlannedQuery) => { if (!have.has(q.label)) { have.add(q.label); out.push(q); } };
  [...row.failed, ...row.pending].forEach(push);
  if (mode === "continue") {
    plan.filter((q) => q.provider === "rss").forEach(push);
    plan.filter((q) => !row.done.includes(q.label)).forEach(push);
  }
  return out;
}
