import "server-only";
import { resolvePeriod, type Period } from "./period";

export async function periodFromRequest(req: Request): Promise<{ period: Period; body: Record<string, unknown> }> {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : typeof body[k] === "number" ? String(body[k]) : undefined);
  return { period: resolvePeriod({ p: s("p"), w: s("w"), start: s("start"), end: s("end") }), body };
}
