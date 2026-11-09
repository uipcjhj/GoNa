import { NextResponse, after } from "next/server";
import { driveJob, startJob } from "@/lib/pipeline/job";
import { periodFromRequest } from "@/lib/weekly/api";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** AI 관련도 분석 (AI 미연결 시 규칙 기반 분류). */
export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { period } = await periodFromRequest(req);
  const { job, created, resumed } = await startJob("manual", "weekly-analyze", { start: period.start, end: period.end, startDate: period.startDate, endDate: period.endDate });
  if (created || resumed) after(() => driveJob(job.id, new URL(req.url).origin));
  return NextResponse.json({ job, created, resumed, busy: !created && !resumed });
}
