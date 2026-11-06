import Link from "next/link";
import { loadData } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui";
import { WorldMap } from "@/components/world-map";
import { HBar, ScoreHistogram } from "@/components/charts";
import { PriorityBadge, ScorePill, ModeBadge } from "@/components/badges";
import { DemoBanner } from "@/components/demo-banner";
import { fmtDate, daysAgoIso } from "@/lib/utils";
import { Flame, Eye, Sparkles, Swords, ShieldCheck, Info } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const range = sp.range === "30" ? 30 : 7;
  const since = daysAgoIso(range);
  const { opportunities, articles } = await loadData(Math.max(range, 30) + 30);

  const inRange = opportunities.filter((o) => (o.latestPublishedAt ?? o.firstSeenAt) >= since || o.firstSeenAt >= since);
  const newOpps = opportunities.filter((o) => o.firstSeenAt >= since);
  const hot = inRange.filter((o) => o.priority === "HOT");
  const watch = inRange.filter((o) => o.priority === "WATCH");
  const artsInRange = articles.filter((a) => (a.publishedAt ?? a.discoveredAt) >= since);
  const competitorNews = artsInRange.filter((a) => a.competitors.length > 0 && a.status === "analyzed");
  const verified = articles.filter((a) => a.verification.status === "verified" && (a.verification.checkedAt ?? "") >= since);
  const demoShown = articles.some((a) => a.isDemo);

  const counts: Record<string, { total: number; hot: number }> = {};
  for (const o of inRange) {
    if (!o.country || o.country === "Unknown") continue;
    counts[o.country] ??= { total: 0, hot: 0 };
    counts[o.country].total++;
    if (o.priority === "HOT") counts[o.country].hot++;
  }
  const byCountry = Object.entries(counts).map(([name, c]) => ({ name, value: c.total })).sort((a, b) => b.value - a.value).slice(0, 10);
  const ind: Record<string, number> = {};
  for (const o of inRange) ind[o.industry || "Unknown"] = (ind[o.industry || "Unknown"] ?? 0) + 1;
  const byIndustry = Object.entries(ind).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 10);
  const buckets = ["0-19", "20-39", "40-59", "60-79", "80-100"].map((name) => {
    const lo = Number(name.split("-")[0]);
    return { name, value: inRange.filter((o) => o.score >= lo && o.score <= (lo === 80 ? 100 : lo + 19)).length };
  });
  const top = [...inRange].sort((a, b) => b.score - a.score).slice(0, 8);

  const kpis = [
    { label: "New Opportunities This Week", sub: range === 7 ? "최근 7일 신규 프로젝트" : "최근 30일 신규 프로젝트", value: newOpps.length, icon: Sparkles, color: "text-sky-600", href: "/opportunities" },
    { label: "HOT Opportunities", sub: "80점 이상", value: hot.length, icon: Flame, color: "text-red-600", href: "/opportunities?priority=HOT" },
    { label: "WATCH Opportunities", sub: "60~79점", value: watch.length, icon: Eye, color: "text-amber-500", href: "/opportunities?priority=WATCH" },
    { label: "Competitor News", sub: "경쟁사 관련 기사", value: competitorNews.length, icon: Swords, color: "text-violet-600", href: "/competitors" },
    { label: "Newly Verified Sources", sub: "링크 검증 완료 원문", value: verified.length, icon: ShieldCheck, color: "text-emerald-600", href: "/news" },
  ];

  return (
    <div className="space-y-5">
      <DemoBanner show={demoShown} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">글로벌 신규 투자 프로젝트와 잠재 수주기회 현황</p>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {[7, 30].map((r) => (
            <Link key={r} href={`/?range=${r}`} className={`rounded-md px-3 py-1 ${range === r ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              최근 {r}일
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href}>
            <Card className="h-full p-4 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k.label}</div>
                <k.icon className={`h-4 w-4 ${k.color}`} />
              </div>
              <div className="mt-2 text-3xl font-bold text-slate-900 tabular">{k.value}</div>
              <div className="text-xs text-slate-400">{k.sub}</div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>국가별 기회 현황</CardTitle><span className="text-xs text-slate-400">최근 {range}일 · {inRange.length}개 프로젝트</span></CardHeader>
          <CardContent className="pt-3"><WorldMap counts={counts} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>국가별 프로젝트 분포</CardTitle></CardHeader>
          <CardContent className="pt-2"><HBar data={byCountry} height={300} /></CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>산업별 기회 분포</CardTitle></CardHeader>
          <CardContent className="pt-2"><HBar data={byIndustry} color="#0b2a4a" /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Opportunity Score 분포</CardTitle>
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400"><Info className="h-3 w-3" />실제 수주 확률이 아닌 우선순위 지표</span>
          </CardHeader>
          <CardContent className="pt-2"><ScoreHistogram data={buckets} /></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>최근 발견된 주요 투자 프로젝트</CardTitle><Link href="/opportunities" className="text-xs text-sky-700 hover:underline">전체 보기 →</Link></CardHeader>
        <div className="divide-y divide-slate-100">
          {top.length === 0 && <div className="p-6 text-center text-sm text-slate-400">해당 기간에 발견된 프로젝트가 없습니다. 상단 <b>Find Opportunities</b>를 눌러 수집을 시작하세요.</div>}
          {top.map((o) => (
            <Link key={o.id} href={`/opportunities/${o.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50">
              <ScorePill score={o.score} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{o.company}</span>
                  <span className="truncate text-sm text-slate-600">{o.projectName}</span>
                  {o.isDemo && <Badge tone="violet">DEMO</Badge>}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">{o.country}{o.city !== "Unknown" ? ` · ${o.city}` : ""} · {o.industry} · {o.signalType} · {o.investmentAmount}</div>
              </div>
              <div className="hidden text-right text-xs text-slate-500 md:block">
                <PriorityBadge p={o.priority} /> <ModeBadge mode={o.analysisMode} />
                <div className="mt-1">{fmtDate(o.latestPublishedAt)} · 근거 {o.articleIds.length}건</div>
              </div>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
