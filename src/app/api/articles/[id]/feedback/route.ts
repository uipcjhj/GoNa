import { NextResponse } from "next/server";
import { getArticle, saveArticles } from "@/lib/db/repo";
import { requireAdmin } from "@/lib/session";

export async function POST(req: Request, ctx: RouteContext<"/api/articles/[id]/feedback">) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { id } = await ctx.params;
  const { value } = (await req.json().catch(() => ({}))) as { value?: "useful" | "not_useful" | null };
  const a = await getArticle(id);
  if (!a) return NextResponse.json({ error: "not found" }, { status: 404 });
  a.feedback = value === "useful" || value === "not_useful" ? value : null;
  a.feedbackAt = new Date().toISOString();
  await saveArticles([a]);
  return NextResponse.json({ ok: true, feedback: a.feedback });
}
