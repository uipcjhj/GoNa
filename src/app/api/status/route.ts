import { NextResponse } from "next/server";
import { systemStatus } from "@/lib/status";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";
export async function GET() {
  const deny = await requireAdmin();
  if (deny) return deny;
  return NextResponse.json(systemStatus());
}
