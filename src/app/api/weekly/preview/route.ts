import { NextResponse } from "next/server";
import { periodFromRequest } from "@/lib/weekly/api";
import { buildExport } from "@/lib/weekly/export";
import { loadWeekly } from "@/lib/weekly/view";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { period } = await periodFromRequest(req);
  const view = await loadWeekly(period);
  return NextResponse.json({ period, data: buildExport(view.rows) });
}
