import { NextResponse } from "next/server";
import { removeDemo, seedDemo } from "@/lib/demo";
import { requireAdmin } from "@/lib/session";

export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action === "remove") {
    await removeDemo();
    return NextResponse.json({ ok: true });
  }
  const n = await seedDemo();
  return NextResponse.json({ ok: true, inserted: n });
}
