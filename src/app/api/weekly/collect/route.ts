import { NextResponse, after } from "next/server";
import { driveJob, startJob } from "@/lib/pipeline/job";
import { periodFromRequest } from "@/lib/weekly/api";
import { resolvePeriod } from "@/lib/weekly/period";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 기사 수집: { p, w, start, end } period, optional { current: true } (이번 주) and { days: [...] } (누락 날짜만). */
export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { period: sel, body } = await periodFromRequest(req);
  const period = body.current ? resolvePeriod({ p: "this" }) : sel;
  const days = Array.isArray(body.days) ? (body.days as string[]).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : undefined;
  const { job, created, resumed } = await startJob("manual", "weekly", { start: period.start, end: period.end, startDate: period.startDate, endDate: period.endDate, days });
  if (created || resumed) after(() => driveJob(job.id, new URL(req.url).origin));
  return NextResponse.json({ job, created, resumed, busy: !created && !resumed });
}
