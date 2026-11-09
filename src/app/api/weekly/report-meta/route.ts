import { periodFromRequest } from "@/lib/weekly/api";
import { getReport, saveReport } from "@/lib/weekly/report";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

/** PPT 표지 Vol.·월/연도, 주차 제목 저장 (빈 값 → 자동). */
export async function POST(req: Request) {
  const deny = await requireAdmin();
  if (deny) return deny;
  const { period, body } = await periodFromRequest(req);
  const r = await getReport(period);
  const meta = { ...(r.pptMeta ?? {}) };
  if ("vol" in body) {
    const v = Number(body.vol);
    if (body.vol === null || body.vol === "") delete meta.vol;
    else if (Number.isInteger(v) && v > 0 && v < 10000) meta.vol = v;
    else return Response.json({ error: "Vol.은 1~9999 사이 숫자여야 합니다." }, { status: 400 });
  }
  for (const k of ["coverDate", "weekTitle"] as const) {
    if (!(k in body)) continue;
    const s = typeof body[k] === "string" ? (body[k] as string).trim().slice(0, 30) : "";
    if (s) meta[k] = s;
    else delete meta[k];
  }
  r.pptMeta = meta;
  await saveReport(r);
  return Response.json({ ok: true, pptMeta: meta });
}
