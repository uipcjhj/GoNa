import { NextResponse, after } from "next/server";
import { driveJob, internalSecret } from "@/lib/pipeline/job";
import { safeEqual } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request, ctx: RouteContext<"/api/jobs/[id]/continue">) {
  const secret = req.headers.get("x-internal-secret") ?? "";
  if (!safeEqual(secret, internalSecret())) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const origin = new URL(req.url).origin;
  after(() => driveJob(id, origin));
  return NextResponse.json({ ok: true });
}
