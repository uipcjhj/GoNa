import Link from "next/link";
import { loadData } from "@/lib/data";
import { weekRange } from "@/lib/util/week";
import { ReportBuilder, type ReportItem } from "./builder";
import { DemoBanner } from "@/components/demo-banner";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ReportPage({ searchParams }: PageProps<"/report">) {
  const sp = await searchParams;
  const offset = Math.min(0, Number(sp.w ?? 0) || 0);
  const { articles, opportunities, settings } = await loadData(120);
  const weeks = Math.max(1, Math.round(settings.reportPeriodDays / 7));
  const endW = weekRange(new Date(), settings.reportTimezone, offset);
  const startW = weekRange(new Date(), settings.reportTimezone, offset - (weeks - 1));
  const label = `${startW.startDate} (월) ~ ${endW.endDate} (일)`;
  const opp = new Map(opportunities.map((o) => [o.id, o]));
  const items: ReportItem[] = articles
    .filter((a) => a.status === "analyzed" && a.analysis && a.analysis.category !== "irrelevant")
    .filter((a) => { const d = a.publishedAt ?? a.discoveredAt; return d >= startW.start && d < endW.end; })
    .map((a) => {
      const o = a.opportunityId ? opp.get(a.opportunityId) : undefined;
      let category = a.analysis!.category;
      if (category !== "opportunity" && a.competitors.length) category = "competitor";
      return {
        id: a.id, url: a.url, title: a.title, sourceName: a.sourceName, publishedAt: a.publishedAt, isDemo: a.isDemo, category,
        competitors: a.competitors, summary: a.analysis!.summaryKo, score: o?.score ?? a.analysis!.score, whyItMatters: o?.whyItMatters ?? a.analysis!.whyItMatters,
        feedback: a.feedback, verified: a.verification.status, opportunityId: a.opportunityId, mode: a.analysis!.mode,
      };
    });
  return (
    <div className="space-y-4">
      <DemoBanner show={items.some((i) => i.isDemo)} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Weekly Report</h1>
          <p className="text-sm text-slate-500">보고서에 포함할 기사를 선택하고 기존 주간동향 형식의 Excel로 다운로드합니다. (기준: 월~일, {settings.reportTimezone})</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 text-sm">
          <Link href={`/report?w=${offset - 1}`} className="rounded p-1 hover:bg-slate-100"><ChevronLeft className="h-4 w-4" /></Link>
          <span className="px-2 font-medium tabular">{label}</span>
          {offset < 0 ? <Link href={`/report?w=${offset + 1}`} className="rounded p-1 hover:bg-slate-100"><ChevronRight className="h-4 w-4" /></Link> : <span className="p-1 text-slate-300"><ChevronRight className="h-4 w-4" /></span>}
        </div>
      </div>
      <ReportBuilder items={items} periodLabel={label} fileLabel={`${startW.startDate}_${endW.endDate}`} />
    </div>
  );
}
