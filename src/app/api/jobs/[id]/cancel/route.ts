import { NextResponse } from "next/server";
import { cancelJob } from "@/lib/pipeline/job";

export async function POST(_req: Request, ctx: RouteContext<"/api/jobs/[id]/cancel">) {
  const { id } = await ctx.params;
  return NextResponse.json({ job: await cancelJob(id) });
}
