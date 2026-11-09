import { loadData } from "@/lib/data";
import { NewsList, type NewsItem } from "./list";
import { isAdmin } from "@/lib/session";
import { DemoBanner } from "@/components/demo-banner";

export const dynamic = "force-dynamic";

export default async function NewsPage() {
  const { articles, opportunities } = await loadData(90);
  const opp = new Map(opportunities.map((o) => [o.id, o]));
  const items: NewsItem[] = articles.map((a) => ({
    id: a.id, url: a.url, title: a.title, sourceName: a.sourceName, sourceType: a.sourceType, publishedAt: a.publishedAt, discoveredAt: a.discoveredAt,
    isDemo: a.isDemo, status: a.status, statusNote: a.statusNote, verification: a.verification, competitors: a.competitors, feedback: a.feedback,
    category: a.analysis?.category ?? (a.status === "filtered" ? "irrelevant" : "pending"),
    country: a.analysis?.country ?? "Unknown", industry: a.analysis?.industry ?? "Unknown",
    summary: a.analysis?.summaryKo ?? [], excerpt: a.excerpt, score: a.analysis?.score ?? null, mode: a.analysis?.mode ?? null,
    opportunityId: a.opportunityId, oppName: a.opportunityId ? `${opp.get(a.opportunityId)?.company ?? ""} — ${opp.get(a.opportunityId)?.projectName ?? ""}` : null,
  }));
  items.sort((a, b) => (b.publishedAt ?? b.discoveredAt).localeCompare(a.publishedAt ?? a.discoveredAt));
  return (
    <div className="space-y-4">
      <DemoBanner show={articles.some((a) => a.isDemo)} />
      <div>
        <h1 className="text-xl font-bold text-slate-900">뉴스 피드</h1>
        <p className="text-sm text-slate-500">수집된 전체 뉴스 (최근 90일, 최신순). 수주기회로 분류되지 않은 일반 산업동향도 포함됩니다.</p>
      </div>
      <NewsList items={items} readOnly={!(await isAdmin())} />
    </div>
  );
}
