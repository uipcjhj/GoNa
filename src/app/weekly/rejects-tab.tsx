"use client";
import type { WeeklyRow } from "@/lib/weekly/view";
import type { Curation, ReportStatus } from "@/lib/types";
import { ArticleCard } from "./rec-tab";

export function RejectsTab({ rows, curation, onSet, onRefresh }: { rows: Map<string, WeeklyRow>; curation: Curation; onSet: (ids: string[], s: ReportStatus) => void; onRefresh: () => void }) {
  const rejects = curation.rejects.map((x) => ({ x, r: rows.get(x.articleId) })).filter((v): v is { x: Curation["rejects"][number]; r: WeeklyRow } => Boolean(v.r));
  const checks = curation.needsCheck.map((x) => ({ x, r: rows.get(x.articleId) })).filter((v): v is { x: Curation["needsCheck"][number]; r: WeeklyRow } => Boolean(v.r)).slice(0, 15);
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">후보 탈락 · 참고 기사 {rejects.length}건</h2>
          <p className="text-sm text-slate-500">최종 추천에서는 빠졌지만 참고 가치가 있는 기사입니다. 정책·경쟁사 기사는 수주기회 평가가 낮아도 모니터링 대상으로 남깁니다.</p>
        </div>
        {rejects.map(({ x, r }) => (
          <ArticleCard key={r.id} r={r} rejectReason={x.reason} monitoring={x.monitoring} reasons={x.detail ? [x.detail] : undefined} onSet={(s) => onSet([r.id], s)} onRefresh={onRefresh} />
        ))}
        {!rejects.length && <p className="rounded-2xl border border-line bg-surface p-6 text-center text-sm text-slate-500">후보 탈락 기사가 없습니다.</p>}
      </section>

      {checks.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">확인 필요 {curation.needsCheck.length}건</h2>
            <p className="text-sm text-slate-500">발행일을 원문에서 확인하지 못했거나(Google News 검색일만 있음), 조사 기간 밖이거나, 구분을 정하지 못한 기사입니다. 최종 추천에서 기본 제외되며, 펼쳐서 원문 URL을 검증하면 추천 대상이 됩니다.</p>
          </div>
          {checks.map(({ x, r }) => (
            <ArticleCard key={r.id} r={r} rejectReason={x.reason} onSet={(s) => onSet([r.id], s)} onRefresh={onRefresh} />
          ))}
        </section>
      )}
    </div>
  );
}
