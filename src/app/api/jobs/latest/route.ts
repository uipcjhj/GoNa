import { NextResponse } from "next/server";
import { isActive, latestJob } from "@/lib/pipeline/job";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const deny = await requireAdmin();
  if (deny) return deny;
  const job = await latestJob();
  return NextResponse.json({ job, active: job ? isActive(job) : false });
}
