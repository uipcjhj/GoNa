import { getAsset } from "@/lib/report/assets";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Stored PPT image (admin preview only). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const a = await getAsset((await ctx.params).id);
  if (!a) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(a.buf), { headers: { "Content-Type": a.mime, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}
