"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp, CheckCheck, Info } from "lucide-react";
import type { WeeklyRow } from "@/lib/weekly/view";
import type { Curation, ReportStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ArticleDetail, CategoryText, DateMeta, Markers, SourceButton, StatusButtons, useReadOnly } from "./parts";

export function importanceOf(priority: number) {
  return priority >= 85 ? { label: "중요도 높음", cls: "text-sky-700" } : priority >= 65 ? { label: "중요도 중간", cls: "text-slate-600" } : { label: "참고", cls: "text-slate-500" };
}

/** One readable card: title first, one core line, why it was recommended; details on demand. */
export function ArticleCard({ r, rank, priority, reasons, rejectReason, monitoring, onSet, onRefresh }: {
  r: WeeklyRow; rank?: number; priority?: number; reasons?: string[]; rejectReason?: string; monitoring?: boolean;
  onSet: (s: ReportStatus) => void; onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const lines = r.edits?.summary4?.some(Boolean) ? r.edits.summary4! : r.summary4;
  const core = lines[0] && lines[1] ? `${lines[0]} · ${lines[1]}` : lines[0] ?? "";
  const imp = priority != null ? importanceOf(priority) : null;
  const selected = r.reportStatus === "selected";
  return (
    <article className={cn("rounded-2xl border bg-surface/90 p-4 transition-colors sm:p-5", selected ? "border-sky-200 shadow-[0_0_0_1px_rgba(46,242,196,0.25)]" : "border-line", r.reportStatus === "excluded" && "opacity-55")}>
      <div className="flex gap-3 sm:gap-4">
        {rank != null && <div className="w-7 shrink-0 pt-0.5 text-right text-lg font-bold tabular text-slate-400">{String(rank).padStart(2, "0")}</div>}
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <CategoryText r={r} />
            <Markers r={r} />
            {imp && <span className={cn("text-xs font-medium", imp.cls)}>{imp.label}</span>}
            {rejectReason && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">{rejectReason}</span>}
            {monitoring && <span className="text-xs text-slate-500">모니터링 가치</span>}
          </div>
          <h3 className="text-base font-semibold leading-snug text-slate-950">
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:text-sky-700">{r.edits?.titleKo || r.titleKo || r.title}</a>
          </h3>
          <div className="mt-1"><DateMeta r={r} /></div>
          {lines.length ? <p className={cn("mt-2 text-sm leading-relaxed text-slate-700", !open && "line-clamp-2")}>{core}</p>
            : <p className="mt-2 text-sm text-amber-700">{r.aiStatus === "failed" ? "AI 분석 실패 — 요약 없음" : r.aiStatus === "insufficient_source" ? "원문 부족 — 요약 없음" : "Gemini 원문 검증 전 — 요약 없음"}</p>}
          {reasons?.length ? <p className="mt-1.5 text-[13px] text-slate-500"><span className="text-slate-600">추천 이유</span> · {reasons.slice(0, 3).join(" · ")}</p> : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <SourceButton r={r} />
              <button onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
                {open ? <>접기<ChevronUp className="h-4 w-4" /></> : <>펼치기<ChevronDown className="h-4 w-4" /></>}
              </button>
            </div>
            <StatusButtons r={r} onSet={onSet} />
          </div>
          {open && <div className="mt-4 border-t border-line pt-4"><ArticleDetail r={r} reasons={reasons} rejectReason={rejectReason} onRefresh={onRefresh} /></div>}
        </div>
      </div>
    </article>
  );
}

export function RecommendTab({ rows, curation, target, onSet, onSelectAll, onRegenerate, onRefresh, busy }: {
  rows: Map<string, WeeklyRow>; curation: Curation; target: number; busy: boolean;
  onSet: (ids: string[], s: ReportStatus) => void; onSelectAll: () => void; onRegenerate: (includeUnverified: boolean) => void; onRefresh: () => void;
}) {
  const picks = curation.picks.map((p) => ({ p, r: rows.get(p.articleId) })).filter((x): x is { p: typeof x.p; r: WeeklyRow } => Boolean(x.r));
  const selectedPicks = picks.filter(({ r }) => r.reportStatus === "selected").length;
  const readOnly = useReadOnly();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-navy-900/50 px-4 py-3">
        <div className="text-sm text-slate-600">
          추천 <b className="text-slate-900">{picks.length}</b>건
          <span className="mx-1.5 text-slate-300">|</span>글로벌 {curation.balance.global} · 국내 {curation.balance.domestic} · 경쟁사 {curation.balance.competitor}
          {curation.excludedPrevious > 0 && <><span className="mx-1.5 text-slate-300">|</span>지난 2주 보고 프로젝트 {curation.excludedPrevious}건 제외</>}
          {curation.types && <><span className="mx-1.5 text-slate-300">|</span>잠재 수주기회 {curation.types.opportunity} · 경쟁사 모니터링 {curation.types.competitor} · 기술·시장동향 {curation.types.trend}</>}
          {(curation.shortfall ?? 0) > 0 && <><span className="mx-1.5 text-slate-300">|</span><span className="text-amber-700">기준 대비 {curation.shortfall}건 부족 — 검증된 기사만 추천</span></>}
          {(curation.pendingAI ?? 0) > 0 && <><span className="mx-1.5 text-slate-300">|</span><span className="text-amber-700">AI 원문 검증 대기·검토 {curation.pendingAI}건</span></>}
          {curation.needsCheck.length > 0 && <><span className="mx-1.5 text-slate-300">|</span><span className="text-amber-700">확인 필요 {curation.needsCheck.length}건 별도 보관</span></>}
        </div>
        {!readOnly && <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[13px] text-slate-500">
            <input type="checkbox" checked={curation.includeUnverified} disabled={busy} onChange={(e) => onRegenerate(e.target.checked)} />발행일 미확인 기사 포함
          </label>
          <button disabled={busy || !picks.length || selectedPicks === picks.length} onClick={onSelectAll} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-brand-ink disabled:opacity-40">
            <CheckCheck className="h-4 w-4" />추천 {picks.length}건 모두 선정
          </button>
        </div>}
      </div>

      {!picks.length && (
        <div className="rounded-2xl border border-line bg-surface p-8 text-center">
          <p className="text-base font-semibold text-slate-900">추천할 기사가 없습니다</p>
          <p className="mt-1 text-sm text-slate-500">
            {readOnly
              ? "이 기간에 검증이 끝난 추천 기사가 아직 없습니다."
              : (curation.pendingAI ?? 0) > 0
                ? <>발행일이 확인된 후보 {curation.pendingAI}건이 Gemini 원문 검증을 기다리고 있습니다. 더보기(…) → &lsquo;Gemini 원문 검증 분석&rsquo;을 실행하세요. 검증되지 않은 기사는 추천하지 않습니다.</>
                : <>이 기간의 실제 기사가 없거나, 발행일이 확인된 기사가 없습니다. &lsquo;기사 수집&rsquo;을 실행해 보세요.</>}
          </p>
        </div>
      )}
      <div className="space-y-3">
        {picks.map(({ p, r }) => (
          <ArticleCard key={r.id} r={r} rank={p.rank} priority={p.priority} reasons={p.reasons} onSet={(s) => onSet([r.id], s)} onRefresh={onRefresh} />
        ))}
      </div>
      {picks.length > 0 && (
        <p className="flex items-start gap-1.5 text-[13px] text-slate-500">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          추천은 점수 상위 순이 아니라 수주 가능성·대형 투자·경쟁사 실적·기술·정책의 우선순위와 지역 다양성, 동일 프로젝트 중복, 지난 2주 보고 여부를 함께 고려해 정했습니다. 선정 {selectedPicks}/{picks.length} · 기준 {target}건.
        </p>
      )}
    </div>
  );
}
