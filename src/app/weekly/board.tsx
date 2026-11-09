"use client";
// 주간 업계동향 — curation workflow: 뉴스 수집 → AI 추천 → 사용자 검토 → 최종 선정 → Excel 출력
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight, Download, Loader2, MoreHorizontal, Newspaper, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import type { Period } from "@/lib/weekly/period";
import type { WeeklyView, WeeklyRow } from "@/lib/weekly/view";
import type { ReportStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { postJson } from "./parts";
import { RecommendTab } from "./rec-tab";
import { AllTab } from "./all-tab";
import { RejectsTab } from "./rejects-tab";
import { EditorTab } from "./editor-tab";

export type Tab = "rec" | "all" | "rejects" | "edit";

function periodQuery(p: Period): Record<string, string> {
  return p.key === "custom" && p.offset === 0 ? { p: "custom", start: p.startDate, end: p.endDate } : { w: String(p.offset) };
}

export function WeeklyBoard({ period, view, tab }: { period: Period; view: WeeklyView; tab: Tab }) {
  const router = useRouter();
  const pq = periodQuery(period);
  const [overrides, setOverrides] = useState<Record<string, ReportStatus>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [menu, setMenu] = useState<"collect" | "more" | null>(null);
  const [custom, setCustom] = useState({ open: period.key === "custom", start: period.startDate, end: period.endDate });

  const rows: WeeklyRow[] = useMemo(() => view.rows.map((r) => (overrides[r.id] ? { ...r, reportStatus: overrides[r.id] } : r)), [view.rows, overrides]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const selected = rows.filter((r) => r.reportStatus === "selected").length;
  const refresh = () => { setOverrides({}); router.refresh(); };

  const go = (params: Record<string, string>) => router.push(`/weekly?${new URLSearchParams({ ...params, tab })}`);
  const setTab = (t: Tab) => router.replace(`/weekly?${new URLSearchParams({ ...pq, tab: t })}`, { scroll: false });

  async function act(key: string, fn: () => Promise<string | void>) {
    setBusy(key);
    setMsg(null);
    setMenu(null);
    try {
      const m = await fn();
      if (m) setMsg({ text: m });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setBusy(null);
    }
  }
  async function setStatus(ids: string[], s: ReportStatus) {
    setOverrides((o) => ({ ...o, ...Object.fromEntries(ids.map((id) => [id, s])) }));
    try {
      await postJson("/api/weekly/item", { ...pq, ids, status: s });
      if (tab === "edit") router.refresh();
    } catch (e) {
      setMsg({ text: `상태 저장 실패: ${e instanceof Error ? e.message : e}`, error: true });
    }
  }
  const startJob = (key: string, url: string, body: object, label: string) =>
    act(key, async () => {
      const d = await postJson(url, { ...pq, ...body });
      return d.busy ? "이미 실행 중인 작업이 있습니다. 상단 진행 상태에서 확인하세요." : `${label} 작업을 시작했습니다. 완료되면 화면이 자동으로 갱신됩니다.`;
    });
  const regenerate = (includeUnverified = view.curation.includeUnverified) =>
    act("curate", async () => {
      const d = await postJson("/api/weekly/curate", { ...pq, action: "generate", includeUnverified });
      router.refresh();
      return `AI 추천을 다시 생성했습니다 — 추천 ${d.curation.picks.length}건, 후보 탈락 ${d.curation.rejects.length}건, 확인 필요 ${d.curation.needsCheck.length}건.`;
    });
  const selectAll = () =>
    act("selectall", async () => {
      const d = await postJson("/api/weekly/curate", { ...pq, action: "select_picks" });
      refresh();
      return `추천 기사 ${d.selected}건을 보고서에 선정했습니다. '보고서 편집'에서 순서와 문구를 확인하세요.`;
    });
  async function download() {
    await act("excel", async () => {
      const r = await fetch("/api/weekly/excel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pq) });
      if (!r.ok) throw new Error((await r.json()).error ?? "다운로드 실패");
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = decodeURIComponent((r.headers.get("Content-Disposition") ?? "").split("''")[1] ?? "주간업계동향.xlsx");
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  const kpis = [
    { label: "수집 기사", value: view.counts.collected, sub: `분석 ${rows.filter((r) => r.analysis !== "pending").length}건` },
    { label: "AI 추천", value: view.curation.picks.length, sub: `기준 ${view.target}건`, accent: true },
    { label: "보고서 선정", value: selected, sub: selected === view.target ? "기준 충족" : `기준 ${view.target}건` },
    { label: "후보 탈락", value: view.curation.rejects.length, sub: "참고 기사" },
    { label: "확인 필요", value: view.curation.needsCheck.length, sub: "발행일·구분 미확인", warn: view.curation.needsCheck.length > 0 },
  ];
  const tabs: { key: Tab; label: string; n?: number }[] = [
    { key: "rec", label: "AI 추천 기사", n: view.curation.picks.length },
    { key: "all", label: "전체 수집 기사", n: rows.length },
    { key: "rejects", label: "후보 탈락", n: view.curation.rejects.length },
    { key: "edit", label: "보고서 편집", n: selected },
  ];

  return (
    <div className="mx-auto max-w-[1120px] space-y-6 pb-10">
      {/* header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[13px] font-medium tracking-wide text-sky-700">WEEKLY MARKET INTELLIGENCE</p>
          <h1 className="mt-0.5 flex items-center gap-2 text-[26px] font-bold leading-tight text-slate-950"><CalendarRange className="h-6 w-6 text-brand" />주간 업계동향</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border border-line bg-surface">
              <button className="rounded-l-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="이전 주" onClick={() => go({ w: String(period.offset - 1) })}><ChevronLeft className="h-4 w-4" /></button>
              <span className="px-2 text-sm font-medium tabular text-slate-900">{period.startDate} ~ {period.endDate}</span>
              <button className="rounded-r-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label="다음 주" disabled={period.offset >= 0 || period.key === "custom"} onClick={() => go({ w: String(period.offset + 1) })}><ChevronRight className="h-4 w-4" /></button>
            </div>
            <select value={custom.open ? "custom" : period.key} onChange={(e) => (e.target.value === "custom" ? setCustom({ ...custom, open: true }) : go(e.target.value === "this" ? { w: "0" } : e.target.value === "prev" ? { w: "-2" } : { w: "-1" }))} className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-slate-800">
              <option value="last">지난주</option><option value="this">이번 주</option><option value="prev">이전 주</option><option value="custom">사용자 지정</option>
            </select>
            {custom.open && (
              <span className="flex flex-wrap items-center gap-1.5">
                <input type="date" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} className="h-9 rounded-lg border border-line bg-surface px-2 text-sm" />
                <span className="text-slate-400">~</span>
                <input type="date" value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} className="h-9 rounded-lg border border-line bg-surface px-2 text-sm" />
                <button onClick={() => go({ p: "custom", start: custom.start, end: custom.end })} className="h-9 rounded-lg border border-line px-3 text-sm text-slate-700 hover:border-sky-200">적용</button>
              </span>
            )}
            <span className="text-[13px] text-slate-500">한국시간 월 00:00 ~ 일 23:59 · 기사 발행일 기준</span>
          </div>
        </div>

        <div className="relative flex flex-wrap gap-2">
          <div className="relative">
            <button onClick={() => setMenu(menu === "collect" ? null : "collect")} disabled={!!busy} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-surface-2 px-3.5 text-sm text-slate-800 hover:border-sky-200 disabled:opacity-50">
              {busy === "collect" || busy === "this" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Newspaper className="h-4 w-4" />}기사 수집<ChevronDown className="h-3.5 w-3.5" />
            </button>
            {menu === "collect" && (
              <div className="absolute right-0 z-40 mt-1 w-72 rounded-xl border border-line bg-navy-900 p-1.5 shadow-2xl">
                <MenuItem title="선택 기간 다시 검색" desc="이 주간의 국내외 뉴스를 수집 (저장된 기사는 중복 저장 안 함)" onClick={() => startJob("collect", "/api/weekly/collect", {}, "선택 기간 검색")} />
                <MenuItem title="이번 주 기사 수집" desc="이번 주 월요일부터 오늘까지" onClick={() => startJob("this", "/api/weekly/collect", { current: true }, "이번 주 기사 수집")} />
                {view.missingDays.length > 0 && <MenuItem title={`누락 날짜 추가 수집 (${view.missingDays.length}일)`} desc={view.missingDays.join(", ")} onClick={() => startJob("days", "/api/weekly/collect", { days: view.missingDays }, "누락 날짜 수집")} />}
              </div>
            )}
          </div>
          <button onClick={() => regenerate()} disabled={!!busy} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-surface-2 px-3.5 text-sm text-slate-800 hover:border-sky-200 disabled:opacity-50">
            {busy === "curate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}AI 추천 다시 생성
          </button>
          <button onClick={download} disabled={!!busy || !selected} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-brand-ink disabled:opacity-40">
            {busy === "excel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Excel 다운로드
          </button>
          <div className="relative">
            <button onClick={() => setMenu(menu === "more" ? null : "more")} aria-label="더보기" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-surface-2 text-slate-600 hover:border-sky-200"><MoreHorizontal className="h-4 w-4" /></button>
            {menu === "more" && (
              <div className="absolute right-0 z-40 mt-1 w-80 rounded-xl border border-line bg-navy-900 p-1.5 shadow-2xl">
                <MenuItem icon={<RefreshCw className="h-4 w-4" />} title="분류 다시 적용 (무료)" desc="새 분류체계·판단 규칙을 저장된 기사에 적용합니다. 원문 링크·발행일·선정 상태는 그대로 유지되며 AI를 호출하지 않습니다." onClick={() => regenerate()} />
                <MenuItem icon={<Sparkles className="h-4 w-4" />} title={view.ai ? "AI 분석 (추천 후보만)" : "AI 분석 (AI 미연결 — 규칙 기반)"} desc={view.ai ? "미분석·규칙 기반 기사 중 관련도 상위 후보만 AI로 분석해 사용량을 아낍니다." : "GEMINI_API_KEY 또는 ANTHROPIC_API_KEY가 없어 규칙 기반으로 분류합니다."} onClick={() => startJob("analyze", "/api/weekly/analyze", {}, view.ai ? "AI 분석" : "규칙 기반 분류")} />
              </div>
            )}
          </div>
        </div>
      </header>

      {msg && <div role="status" className={cn("rounded-lg px-4 py-2.5 text-sm", msg.error ? "bg-red-50 text-red-700" : "bg-sky-50 text-sky-800")}>{msg.text}</div>}
      {!view.ai && <p className="text-[13px] text-amber-700">AI 미연결 — 구분·판단·4줄 요약은 규칙 기반(제목·발췌 근거)입니다. 보고서 편집에서 문장을 검토하세요.</p>}

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="요약 지표">
        {kpis.map((k) => (
          <div key={k.label} className={cn("rounded-2xl border bg-surface/90 px-4 py-3.5", k.accent ? "border-sky-200" : "border-line")}>
            <div className="text-[13px] text-slate-500">{k.label}</div>
            <div className={cn("mt-1 text-[28px] font-bold leading-none tabular", k.warn ? "text-amber-700" : k.accent ? "text-sky-700" : "text-slate-950")}>{k.value}</div>
            <div className="mt-1.5 text-xs text-slate-500">{k.sub}</div>
          </div>
        ))}
      </section>

      {/* tabs */}
      <nav className="flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="주간 업계동향 단계">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={cn("-mb-px shrink-0 border-b-2 px-4 py-3 text-[15px] transition-colors", tab === t.key ? "border-brand font-semibold text-slate-950" : "border-transparent text-slate-500 hover:text-slate-800")}>
            {t.label}{t.n != null && <span className={cn("ml-1.5 text-sm tabular", tab === t.key ? "text-sky-700" : "text-slate-400")}>{t.n}</span>}
          </button>
        ))}
      </nav>

      {tab === "rec" && <RecommendTab rows={byId} curation={view.curation} target={view.target} busy={!!busy} onSet={setStatus} onSelectAll={selectAll} onRegenerate={(inc) => regenerate(inc)} onRefresh={refresh} />}
      {tab === "all" && <AllTab rows={rows} curation={view.curation} onSet={setStatus} onRefresh={refresh} />}
      {tab === "rejects" && <RejectsTab rows={byId} curation={view.curation} onSet={setStatus} onRefresh={refresh} />}
      {tab === "edit" && <EditorTab rows={rows} target={view.target} pq={pq} onSet={setStatus} onRefresh={refresh} />}
    </div>
  );
}

function MenuItem({ title, desc, onClick, icon }: { title: string; desc: string; onClick: () => void; icon?: React.ReactNode }) {
  return (
    <button onClick={onClick} className="flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left hover:bg-sky-50">
      {icon && <span className="mt-0.5 text-slate-500">{icon}</span>}
      <span>
        <span className="block text-sm font-medium text-slate-900">{title}</span>
        <span className="block text-[13px] leading-snug text-slate-500">{desc}</span>
      </span>
    </button>
  );
}
