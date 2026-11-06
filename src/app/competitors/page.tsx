import Link from "next/link";
import { loadData } from "@/lib/data";
import { Card, CardHeader, CardTitle, Badge } from "@/components/ui";
import { SourceTypeBadge, VerifyBadge } from "@/components/badges";
import { SourceLink } from "@/components/source-link";
import { DemoBanner } from "@/components/demo-banner";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CompetitorsPage({ searchParams }: PageProps<"/competitors">) {
  const sp = await searchParams;
  const { articles, opportunities, settings } = await loadData(120);
  const opp = new Map(opportunities.map((o) => [o.id, o]));
  const comp = articles.filter((a) => a.competitors.length > 0 && a.status !== "duplicate");
  const sel = (sp.c as string) || "";
  const list = comp.filter((a) => !sel || a.competitors.includes(sel)).sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  return (
    <div className="space-y-4">
      <DemoBanner show={comp.some((a) => a.isDemo)} />
      <div>
        <h1 className="text-xl font-bold text-slate-900">경쟁사 동향</h1>
        <p className="text-sm text-slate-500">경쟁사의 신규 수주, 공급 계약, 파트너십, 기술 발표, 투자, 구축 사례 (최근 120일). 잠재 수주기회와 연결된 경우 함께 표시됩니다.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {settings.competitors.filter((c) => c.enabled).map((c) => {
          const n = comp.filter((a) => a.competitors.includes(c.name)).length;
          return (
            <Link key={c.name} href={sel === c.name ? "/competitors" : `/competitors?c=${encodeURIComponent(c.name)}`}>
              <Card className={`p-4 transition-shadow hover:shadow-md ${sel === c.name ? "ring-2 ring-sky-500" : ""}`}>
                <div className="text-sm font-semibold text-slate-800">{c.name}</div>
                <div className="mt-1 text-2xl font-bold tabular">{n}</div>
                <div className="text-[11px] text-slate-400">관련 기사</div>
              </Card>
            </Link>
          );
        })}
      </div>
      <Card>
        <CardHeader><CardTitle>{sel ? `${sel} 관련 뉴스` : "전체 경쟁사 뉴스"}</CardTitle><span className="text-xs text-slate-400">{list.length}건</span></CardHeader>
        <div className="divide-y divide-slate-100">
          {list.map((a) => {
            const o = a.opportunityId ? opp.get(a.opportunityId) : null;
            return (
              <div key={a.id} className="flex gap-3 px-5 py-3">
                <div className="w-20 shrink-0 text-xs text-slate-500 tabular">{fmtDate(a.publishedAt)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-1">{a.competitors.map((c) => <Badge key={c} tone="blue">{c}</Badge>)}{a.analysis?.competitorActivity && <Badge>{a.analysis.competitorActivity}</Badge>}</div>
                  <SourceLink a={a} className="mt-1 block font-medium text-slate-900">{a.title}</SourceLink>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500"><span>{a.sourceName}</span><SourceTypeBadge t={a.sourceType} /><VerifyBadge status={a.verification.status} demo={a.isDemo} /></div>
                  {a.analysis?.summaryKo?.length ? <ul className="mt-1 list-disc pl-5 text-sm text-slate-600">{a.analysis.summaryKo.slice(0, 3).map((s, i) => <li key={i}>{s}</li>)}</ul> : a.excerpt ? <p className="mt-1 line-clamp-2 text-sm text-slate-500">{a.excerpt}</p> : null}
                  {o && <Link href={`/opportunities/${o.id}`} className="mt-1 inline-block text-xs font-medium text-orange-700 hover:underline">⚑ 잠재 수주기회와 연결: {o.company} — {o.projectName} (Score {o.score})</Link>}
                  {a.status === "queued" && <div className="text-[11px] text-slate-400">분석 대기 중</div>}
                </div>
              </div>
            );
          })}
          {!list.length && <div className="py-10 text-center text-sm text-slate-400">경쟁사 관련 뉴스가 없습니다.</div>}
        </div>
      </Card>
    </div>
  );
}
