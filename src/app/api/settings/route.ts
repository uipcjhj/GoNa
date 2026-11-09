import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/db/repo";
import { mergeSettings } from "@/lib/config/defaults";
import type { Settings } from "@/lib/types";
import { planQueries } from "@/lib/news/queries";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const deny = await requireAdmin();
  if (deny) return deny;
  const settings = await getSettings();
  return NextResponse.json({ settings, queries: planQueries(settings) });
}

export async function PUT(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const body = (await req.json().catch(() => null)) as Partial<Settings> | null;
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const cur = await getSettings();
  const next = mergeSettings({ ...cur, ...body, rotation: cur.rotation, lastScheduledRunAt: cur.lastScheduledRunAt, demoPrefVersion: 2 });
  next.maxQueriesPerRun = Math.max(1, Math.min(60, Math.round(next.maxQueriesPerRun)));
  next.maxAnalyzePerRun = Math.max(1, Math.min(300, Math.round(next.maxAnalyzePerRun)));
  next.lookbackDays = Math.max(1, Math.min(30, Math.round(next.lookbackDays)));
  next.maxJobMinutes = Math.max(5, Math.min(120, Math.round(next.maxJobMinutes || 20)));
  next.hotThreshold = Math.max(1, Math.min(100, next.hotThreshold));
  next.weekly.recommendCount = Math.max(5, Math.min(30, Math.round(next.weekly.recommendCount)));
  next.weekly.rejectCount = Math.max(5, Math.min(10, Math.round(next.weekly.rejectCount ?? 8)));
  next.weekly.aiPerRun = Math.max(5, Math.min(200, Math.round(next.weekly.aiPerRun ?? 30)));
  next.weekly.maxAnalyzePerRun = Math.max(10, Math.min(500, Math.round(next.weekly.maxAnalyzePerRun)));
  next.watchThreshold = Math.max(0, Math.min(next.hotThreshold - 1, next.watchThreshold));
  await saveSettings(next);
  return NextResponse.json({ settings: next, queries: planQueries(next) });
}
