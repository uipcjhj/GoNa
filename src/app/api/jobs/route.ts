import { NextResponse, after } from "next/server";
import { driveJob, startJob } from "@/lib/pipeline/job";
import { listJobs } from "@/lib/db/repo";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json({ jobs: await listJobs(30) });
}

/** 수주기회 탐색: start (or resume) a collection job on the server — mode quick (≤20 articles) or collect (full). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { mode?: "collect" | "quick" | "reanalyze" };
  const mode = body.mode === "reanalyze" ? "reanalyze" : body.mode === "quick" ? "quick" : "collect";
  const { job, created, resumed } = await startJob("manual", mode);
  if (created || resumed) {
    const origin = new URL(req.url).origin;
    after(() => driveJob(job.id, origin));
  }
  return NextResponse.json({ job, created, resumed, busy: !created && !resumed });
}
