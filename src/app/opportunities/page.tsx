import { loadData } from "@/lib/data";
import { OpportunityTable, type OppRow } from "./table";
import { DemoBanner } from "@/components/demo-banner";
import { Info } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage({ searchParams }: PageProps<"/opportunities">) {
  const sp = await searchParams;
  const { opportunities, articles } = await loadData();
  const byId = new Map(articles.map((a) => [a.id, a]));
  const rows: OppRow[] = opportunities.map((o) => ({
    ...o,
    verifiedOnlyOk: o.verifiedSourceCount > 0,
    primaryTitle: byId.get(o.primaryArticleId)?.title ?? "",
  }));
  return (
    <div className="space-y-4">
      <DemoBanner show={opportunities.some((o) => o.isDemo)} />
      <div>
        <h1 className="text-xl font-bold text-slate-900">Opportunities</h1>
        <p className="flex items-center gap-1 text-sm text-slate-500">
          <Info className="h-3.5 w-3.5" /> Opportunity Score는 실제 수주 확률이 아니라 영업기회 탐색을 위한 <b>우선순위 지표</b>입니다. 동일 프로젝트의 여러 기사는 하나로 통합되어 있습니다.
        </p>
      </div>
      <OpportunityTable rows={rows} initial={{ country: (sp.country as string) ?? "", priority: (sp.priority as string) ?? "" }} />
    </div>
  );
}
