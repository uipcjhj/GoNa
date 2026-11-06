import { NextResponse } from "next/server";
import { removeDemo, seedDemo } from "@/lib/demo";

export async function POST(req: Request) {
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action === "remove") {
    await removeDemo();
    return NextResponse.json({ ok: true });
  }
  const n = await seedDemo();
  return NextResponse.json({ ok: true, inserted: n });
}
