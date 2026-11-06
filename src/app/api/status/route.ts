import { NextResponse } from "next/server";
import { systemStatus } from "@/lib/status";

export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json(systemStatus());
}
