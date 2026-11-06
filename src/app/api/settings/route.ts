import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/db/repo";
import { mergeSettings } from "@/lib/config/defaults";
import type { Settings } from "@/lib/types";
import { planQueries } from "@/lib/news/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({ settings, queries: planQueries(settings) });
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<Settings> | null;
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const cur = await getSettings();
  const next = mergeSettings({ ...cur, ...body, rotation: cur.rotation, lastScheduledRunAt: cur.lastScheduledRunAt });
  next.maxQueriesPerRun = Math.max(1, Math.min(60, Math.round(next.maxQueriesPerRun)));
  next.maxAnalyzePerRun = Math.max(1, Math.min(300, Math.round(next.maxAnalyzePerRun)));
  next.lookbackDays = Math.max(1, Math.min(30, Math.round(next.lookbackDays)));
  next.hotThreshold = Math.max(1, Math.min(100, next.hotThreshold));
  next.weekly.recommendCount = Math.max(5, Math.min(40, Math.round(next.weekly.recommendCount)));
  next.weekly.maxAnalyzePerRun = Math.max(10, Math.min(500, Math.round(next.weekly.maxAnalyzePerRun)));
  next.watchThreshold = Math.max(0, Math.min(next.hotThreshold - 1, next.watchThreshold));
  await saveSettings(next);
  return NextResponse.json({ settings: next, queries: planQueries(next) });
}
