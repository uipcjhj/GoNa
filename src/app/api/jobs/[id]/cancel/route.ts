import { NextResponse } from "next/server";
import { cancelJob } from "@/lib/pipeline/job";
import { requireAdmin } from "@/lib/session";

export async function POST(_req: Request, ctx: RouteContext<"/api/jobs/[id]/cancel">) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { id } = await ctx.params;
  return NextResponse.json({ job: await cancelJob(id) });
}
