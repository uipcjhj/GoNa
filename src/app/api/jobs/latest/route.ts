import { NextResponse } from "next/server";
import { isActive, latestJob } from "@/lib/pipeline/job";

export const dynamic = "force-dynamic";

export async function GET() {
  const job = await latestJob();
  return NextResponse.json({ job, active: job ? isActive(job) : false });
}
