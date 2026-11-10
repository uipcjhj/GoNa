import { NextResponse, after } from "next/server";
import { driveJob, startJob } from "@/lib/pipeline/job";
import { periodFromRequest } from "@/lib/weekly/api";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 보고서 후보 기사 Gemini 원문 검증 분석 (이미 분석된 기사는 재사용; retryFailed=true면 실패·원문 부족 기사도 재분석). */
export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { period, body } = await periodFromRequest(req);
  const { job, created, resumed } = await startJob("manual", "weekly-analyze", { start: period.start, end: period.end, startDate: period.startDate, endDate: period.endDate }, {
    retryFailed: body.retryFailed === true,
    ids: Array.isArray(body.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 30) : undefined,
    scope: body.scope === "selected" ? "selected" : undefined,
  });
  if (created || resumed) after(() => driveJob(job.id, new URL(req.url).origin));
  return NextResponse.json({ job, created, resumed, busy: !created && !resumed });
}
