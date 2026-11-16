import { NextResponse, after } from "next/server";
import { driveJob, startJob } from "@/lib/pipeline/job";
import { periodFromRequest } from "@/lib/weekly/api";
import { resolvePeriod } from "@/lib/weekly/period";
import { requireAdmin } from "@/lib/session";
import { geminiConfigured } from "@/lib/ai/gemini";
import { getJob } from "@/lib/db/repo";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 기사 수집: { p, w, start, end } period, optional { current: true } (이번 주) and { days: [...] } (누락 날짜만). */
export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { period: sel, body } = await periodFromRequest(req);
  const period = body.current ? resolvePeriod({ p: "this" }) : sel;
  const days = Array.isArray(body.days) ? (body.days as string[]).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : undefined;
  const { job, created, resumed } = await startJob("manual", "weekly", { start: period.start, end: period.end, startDate: period.startDate, endDate: period.endDate, days }, { resume: body.resume === "continue" || body.resume === "failed" ? body.resume : undefined });
  const origin = new URL(req.url).origin;
  const range = { start: period.start, end: period.end, startDate: period.startDate, endDate: period.endDate };
  if (created || resumed) after(async () => {
    await driveJob(job.id, origin);
    // collection finished → Gemini 원문 검증 of the selected + top-ranked candidates (one analysis at a time, free-tier paced)
    if (geminiConfigured() && !days?.length) {
      const done = await getJob(job.id);
      if (done && done.status !== "running" && done.status !== "cancelled" && done.status !== "failed") {
        const next = await startJob("manual", "weekly-analyze", range, { scope: "auto" });
        if (next.created) await driveJob(next.job.id, origin);
      }
    }
  });
  return NextResponse.json({ job, created, resumed, busy: !created && !resumed });
}
