// Scheduled collection. Called by Vercel Cron (vercel.json) or any external scheduler (e.g. GitHub Actions)
// with header "Authorization: Bearer <CRON_SECRET>".
import { NextResponse, after } from "next/server";
import { driveJob, startJob, latestJob, isActive } from "@/lib/pipeline/job";
import { getSettings, listJobs } from "@/lib/db/repo";
import { safeEqual } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized (CRON_SECRET 필요)" }, { status: 401 });
  }
  const settings = await getSettings();
  const origin = new URL(req.url).origin;
  const latest = await latestJob();
  // resume a stalled job first
  if (latest && latest.status === "running" && !isActive(latest)) {
    const { job } = await startJob("scheduled");
    after(() => driveJob(job.id, origin));
    return NextResponse.json({ resumed: job.id });
  }
  if (!settings.autoCollect) return NextResponse.json({ skipped: "자동 수집 꺼짐 (Settings)" });
  const lastScheduled = (await listJobs(20)).find((j) => j.trigger === "scheduled");
  const sinceH = lastScheduled ? (Date.now() - new Date(lastScheduled.startedAt).getTime()) / 3600_000 : Infinity;
  const force = new URL(req.url).searchParams.get("force") === "1";
  if (!force && sinceH < settings.collectionIntervalHours - 0.5) {
    return NextResponse.json({ skipped: `수집 주기 미도래 (마지막 예약 실행 ${sinceH.toFixed(1)}시간 전, 주기 ${settings.collectionIntervalHours}시간)` });
  }
  const { job, created } = await startJob("scheduled");
  if (created) after(() => driveJob(job.id, origin));
  return NextResponse.json({ started: created ? job.id : null, running: created ? null : job.id });
}
