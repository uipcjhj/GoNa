import { NextResponse } from "next/server";
import { periodFromRequest } from "@/lib/weekly/api";
import { setItem } from "@/lib/weekly/report";
import type { ReportStatus, WeeklyCategory } from "@/lib/types";

const STATUSES: ReportStatus[] = ["unreviewed", "selected", "excluded", "hold"];
const CATS: WeeklyCategory[] = ["domestic", "global", "competitor", "policy", "tech", "opportunity"];

/** 보고서 상태(선정/제외/보류) 또는 보고서 카테고리 변경. 기사 자체는 삭제하지 않음. */
export async function POST(req: Request) {
  const { period, body } = await periodFromRequest(req);
  const ids = (Array.isArray(body.ids) ? body.ids : [body.articleId]).filter((x): x is string => typeof x === "string");
  if (!ids.length) return NextResponse.json({ error: "articleId 필요" }, { status: 400 });
  const status = STATUSES.includes(body.status as ReportStatus) ? (body.status as ReportStatus) : undefined;
  const category = body.category === null ? null : CATS.includes(body.category as WeeklyCategory) ? (body.category as WeeklyCategory) : undefined;
  let report;
  for (const id of ids) report = await setItem(period, id, { status, category });
  return NextResponse.json({ ok: true, items: Object.fromEntries(ids.map((id) => [id, report!.items[id]])) });
}
