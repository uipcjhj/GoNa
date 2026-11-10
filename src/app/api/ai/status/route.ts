import { NextResponse } from "next/server";
import { configuredModel, currentModelName, geminiConfigured, geminiHealth, geminiStats } from "@/lib/ai/gemini";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Gemini connection state (no secrets): configured?, model, call statistics. */
export async function GET() {
  const deny = await requireAdmin();
  if (deny) return deny;
  return NextResponse.json({ configured: geminiConfigured(), configuredModel: configuredModel(), model: currentModelName(), stats: geminiStats() });
}

/** Live check: list models (verifies the key + model name) and make one tiny generation call. */
export async function POST() {
  const deny = await requireAdmin();
  if (deny) return deny;
  return NextResponse.json({ ...(await geminiHealth()), stats: geminiStats() });
}
