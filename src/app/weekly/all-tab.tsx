"use client";
// 전체 수집 기사: compact 7-column table, 25 per page; everything else lives in the side panel.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ExternalLink, Search, X } from "lucide-react";
import type { WeeklyRow } from "@/lib/weekly/view";
import type { Curation, ReportStatus, WeeklyCategory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ArticleDetail, CategoryText, Markers, STATUS_LABEL, SourceButton, StatusButtons } from "./parts";

const PAGE = 25;
const FILTERS: { key: "all" | WeeklyCategory | "review"; label: string }[] = [
  { key: "all", label: "전체" }, { key: "domestic", label: "국내" }, { key: "global", label: "글로벌" }, { key: "competitor", label: "경쟁사" },
  { key: "policy", label: "정책" }, { key: "tech", label: "기술·시장" }, { key: "opportunity", label: "수주기회" }, { key: "review", label: "확인 필요" },
];

export function DetailPanel({ r, curation, onClose, onSet, onRefresh }: { r: WeeklyRow; curation: Curation; onClose: () => void; onSet: (s: ReportStatus) => void; onRefresh: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const pick = curation.picks.find((p) => p.articleId === r.id);
  const rej = curation.rejects.find((p) => p.articleId === r.id);
  const chk = curation.needsCheck.find((p) => p.articleId === r.id);
  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="기사 상세">
      <button aria-label="닫기" className="absolute inset-0 bg-black/55" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-[560px] flex-col border-l border-line bg-navy-950 shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2"><CategoryText r={r} /><Markers r={r} /></div>
            <h3 className="text-lg font-semibold leading-snug text-slate-950">{r.edits?.titleKo || r.titleKo || r.title}</h3>
          </div>
          <button onClick={onClose} aria-label="닫기" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
          <SourceButton r={r} />
          <StatusButtons r={r} onSet={onSet} />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {pick && <p className="mb-4 rounded-lg bg-sky-50 px-3 py-2 text-[13px] text-sky-800">AI 추천 {pick.rank}위 기사입니다.</p>}
          {chk && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">확인 필요: {chk.reason}</p>}
          <ArticleDetail r={r} reasons={pick?.reasons} rejectReason={rej?.reason} onRefresh={onRefresh} />
        </div>
      </aside>
    </div>,
    document.body,
  );
}

export function AllTab({ rows, curation, onSet, onRefresh }: { rows: WeeklyRow[]; curation: Curation; onSet: (ids: string[], s: ReportStatus) => void; onRefresh: () => void }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<"date" | "relevance">("date");
  const [page, setPage] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const review = useMemo(() => new Set(curation.needsCheck.map((x) => x.articleId)), [curation]);

  const matches = (r: WeeklyRow, key: (typeof FILTERS)[number]["key"]) =>
    key === "all" ? true : key === "review" ? review.has(r.id) || r.detail?.group === "review" || r.analysis === "pending" : r.categories.includes(key) || r.category === key;

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const out = rows.filter((r) => matches(r, f) && (!status || r.reportStatus === status) && (!ql || `${r.title} ${r.titleKo ?? ""} ${r.sourceName} ${r.detail?.label ?? ""}`.toLowerCase().includes(ql)));
    out.sort((a, b) => (sort === "relevance" ? (b.relevance ?? -1) - (a.relevance ?? -1) : (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "")));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, f, status, sort, review]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const shown = filtered.slice(cur * PAGE, cur * PAGE + PAGE);
  const open = openId ? rows.find((r) => r.id === openId) ?? null : null;
  const go = (n: number) => setPage(Math.max(0, Math.min(pages - 1, n)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="구분 필터">
        {FILTERS.map((x) => {
          const n = rows.filter((r) => matches(r, x.key)).length;
          return (
            <button key={x.key} onClick={() => { setF(x.key); setPage(0); }} className={cn("rounded-full px-3.5 py-1.5 text-sm transition-colors", f === x.key ? "bg-brand font-semibold text-brand-ink" : "bg-slate-100 text-slate-600 hover:text-slate-900")}>
              {x.label} <span className="tabular opacity-70">{n}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="제목·언론사·구분 검색" className="h-9 w-full rounded-lg border border-slate-300 bg-surface-2 pl-9 pr-3 text-sm outline-none focus:border-sky-500" />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} className="h-9 rounded-lg border border-slate-300 bg-surface-2 px-2 text-sm">
          <option value="">보고서 상태 전체</option>{(Object.keys(STATUS_LABEL) as ReportStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as "date" | "relevance")} className="h-9 rounded-lg border border-slate-300 bg-surface-2 px-2 text-sm">
          <option value="date">최신순</option><option value="relevance">관련도순</option>
        </select>
      </div>

      {checked.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-sm">
          <span className="text-slate-700">{checked.size}건 선택</span>
          <button className="rounded-lg bg-brand px-3 py-1 text-sm font-semibold text-brand-ink" onClick={() => { onSet([...checked], "selected"); setChecked(new Set()); }}>보고서 선정</button>
          <button className="rounded-lg border border-slate-300 px-3 py-1 text-sm" onClick={() => { onSet([...checked], "hold"); setChecked(new Set()); }}>보류</button>
          <button className="rounded-lg border border-slate-300 px-3 py-1 text-sm" onClick={() => { onSet([...checked], "excluded"); setChecked(new Set()); }}>제외</button>
          <button className="ml-auto text-[13px] text-slate-500" onClick={() => setChecked(new Set())}>선택 해제</button>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface/90">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[13px] text-slate-500">
              <th className="w-10 px-3 py-3"><input type="checkbox" aria-label="이 페이지 전체 선택" checked={shown.length > 0 && shown.every((r) => checked.has(r.id))} onChange={(e) => setChecked((s) => { const n = new Set(s); shown.forEach((r) => (e.target.checked ? n.add(r.id) : n.delete(r.id))); return n; })} /></th>
              <th className="w-52 px-3 py-3 font-medium">구분</th>
              <th className="w-24 px-3 py-3 font-medium">날짜</th>
              <th className="px-3 py-3 font-medium">제목</th>
              <th className="w-32 px-3 py-3 font-medium">언론사</th>
              <th className="w-16 px-3 py-3 text-right font-medium">관련도</th>
              <th className="w-20 px-3 py-3 font-medium">상태</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} onClick={() => setOpenId(r.id)} className={cn("cursor-pointer border-b border-line/60 last:border-0 hover:bg-slate-50", r.reportStatus === "selected" && "bg-sky-50/60", r.reportStatus === "excluded" && "opacity-55")}>
                <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label="선택" checked={checked.has(r.id)} onChange={(e) => setChecked((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} /></td>
                <td className="px-3 py-3"><CategoryText r={r} className="line-clamp-2" /></td>
                <td className={cn("whitespace-nowrap px-3 py-3 tabular", r.dateStatus === "verified" ? "text-slate-600" : "text-amber-700")}>{r.dateStatus === "verified" ? r.kstDate?.slice(5) : "미확인"}</td>
                <td className="px-3 py-3">
                  <div className="flex items-start gap-2">
                    <span className="line-clamp-2 font-medium text-slate-900">{r.edits?.titleKo || r.titleKo || r.title}</span>
                    <a href={r.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} aria-label="원문 열기" className="mt-0.5 shrink-0 text-slate-400 hover:text-sky-700"><ExternalLink className="h-4 w-4" /></a>
                  </div>
                </td>
                <td className="truncate px-3 py-3 text-slate-600">{r.sourceName}</td>
                <td className="px-3 py-3 text-right tabular text-slate-700">{r.relevance ?? "—"}</td>
                <td className={cn("px-3 py-3", r.reportStatus === "selected" ? "font-semibold text-sky-700" : r.reportStatus === "hold" ? "text-amber-700" : "text-slate-500")}>{STATUS_LABEL[r.reportStatus]}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={7} className="px-3 py-12 text-center text-slate-500">조건에 맞는 기사가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{filtered.length}건 중 {filtered.length ? cur * PAGE + 1 : 0}–{Math.min(filtered.length, (cur + 1) * PAGE)}</span>
        <div className="flex items-center gap-1">
          <button onClick={() => go(cur - 1)} disabled={cur === 0} aria-label="이전 페이지" className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
          <span className="tabular">{cur + 1} / {pages}</span>
          <button onClick={() => go(cur + 1)} disabled={cur >= pages - 1} aria-label="다음 페이지" className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      {open && <DetailPanel r={open} curation={curation} onClose={() => setOpenId(null)} onSet={(s) => onSet([open.id], s)} onRefresh={onRefresh} />}
    </div>
  );
}
