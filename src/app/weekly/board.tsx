"use client";
// 주간 업계동향 (Weekly Market Intelligence) — review board
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarRange, ChevronLeft, ChevronRight, Download, ExternalLink, Eye, Layers, Loader2, Newspaper, RefreshCw, Search, Sparkles, Wand2, X, Info, AlertTriangle, CheckCircle2, CircleSlash, PauseCircle, Flame,
} from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Select, Td, Th } from "@/components/ui";
import { ModeBadge, VerifyBadge, AccessBadge, PriorityBadge } from "@/components/badges";
import { CAT_LABEL, CAT_SHORT, RELEVANCE_CRITERIA, WEEKLY_CATEGORIES } from "@/lib/weekly/categories";
import type { Period } from "@/lib/weekly/period";
import type { WeeklyRow, WeeklyView } from "@/lib/weekly/view";
import type { ExportData } from "@/lib/weekly/export";
import type { ReportStatus, WeeklyCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tab = "all" | WeeklyCategory;
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "전체" }, { key: "domestic", label: "국내" }, { key: "global", label: "글로벌" }, { key: "competitor", label: "경쟁사" },
  { key: "policy", label: "정책" }, { key: "tech", label: "기술·시장" }, { key: "opportunity", label: "수주기회" },
];
const STATUS_LABEL: Record<ReportStatus, string> = { unreviewed: "미검토", selected: "선정", excluded: "제외", hold: "보류" };
const CAT_TONE: Record<WeeklyCategory, "blue" | "violet" | "orange" | "green" | "amber" | "red"> = { domestic: "green", global: "blue", competitor: "violet", policy: "amber", tech: "blue", opportunity: "orange" };

function periodQuery(p: Period) {
  return p.key === "custom" && p.offset === 0 ? { p: "custom", start: p.startDate, end: p.endDate } : { w: String(p.offset) };
}

function DateCell({ r }: { r: WeeklyRow }) {
  return (
    <div className="whitespace-nowrap text-xs tabular">
      <div className={cn(r.dateStatus !== "verified" && "text-amber-700")}>{r.kstDate ?? "미확인"}</div>
      <div className="text-[10px] text-slate-400" title={r.dateBasis}>{r.dateStatus === "verified" ? "원문 확인" : r.dateStatus === "search" ? "검색일 (미확정)" : "날짜 미확인"}</div>
      {!r.inPeriod && r.publishedAt && <Badge tone="amber" className="mt-0.5">기간 외</Badge>}
      {r.eventDate && <div className="text-[10px] text-slate-500">사건일 {r.eventDate}</div>}
      {r.reReport && <Badge tone="amber" className="mt-0.5">과거 발표 재보도</Badge>}
    </div>
  );
}

function RelevanceCell({ r }: { r: WeeklyRow }) {
  if (r.relevance == null) return <span className="text-xs text-slate-400">미분석</span>;
  const tone = r.relevance >= 70 ? "bg-emerald-600" : r.relevance >= 50 ? "bg-sky-600" : "bg-slate-400";
  return (
    <details className="group relative">
      <summary className="cursor-pointer list-none">
        <span className={cn("inline-flex h-6 w-9 items-center justify-center rounded text-xs font-bold text-white tabular", tone)}>{r.relevance}</span>
      </summary>
      <div className="absolute left-0 z-30 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-3 text-[11px] shadow-xl">
        <div className="mb-1 font-semibold text-slate-700">Industry Relevance Score 근거 ({r.analysis === "ai" ? "AI" : "규칙 기반"})</div>
        {r.relevanceBreakdown && RELEVANCE_CRITERIA.map((c) => (
          <div key={c.key} className="mb-1">
            <div className="flex justify-between"><span>{c.label}</span><b className="tabular">{r.relevanceBreakdown![c.key].score}/{c.max}</b></div>
            <div className="text-slate-500">{r.relevanceBreakdown![c.key].reason}</div>
          </div>
        ))}
      </div>
    </details>
  );
}

function Summary({ r }: { r: WeeklyRow }) {
  if (r.analysis === "pending") return <span className="text-xs text-slate-400">미분석 — &apos;AI 분석&apos; 실행 필요</span>;
  if (!r.summaryLines.length) return <span className="text-xs text-slate-400">{r.analysis === "rules" ? "요약 미생성 (AI 미연결)" : "-"}</span>;
  return (
    <div className="text-xs leading-snug">
      {r.summaryIsExcerpt && <div className="mb-0.5 text-[10px] font-medium text-amber-700">원문 발췌 · AI 요약 아님</div>}
      {r.summaryLines.slice(0, 5).map((l, i) => (
        <div key={i} className={cn(l.trim().startsWith("⇒") ? "font-semibold text-brand" : "text-slate-700", r.summaryIsExcerpt && "line-clamp-2")}>{l}</div>
      ))}
    </div>
  );
}

export function WeeklyBoard({ period, view }: { period: Period; view: WeeklyView }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");
  const [industry, setIndustry] = useState("");
  const [day, setDay] = useState("");
  const [minRel, setMinRel] = useState(0);
  const [verify, setVerify] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<"date" | "relevance">("date");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, { status?: ReportStatus; category?: WeeklyCategory | null }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showDup, setShowDup] = useState(false);
  const [preview, setPreview] = useState<ExportData | null>(null);
  const [pvTab, setPvTab] = useState<"industry" | "opportunity" | "competitor">("industry");
  const [custom, setCustom] = useState({ start: period.startDate, end: period.endDate });

  const rows = useMemo(() => view.rows.map((r) => {
    const o = overrides[r.id];
    return o ? { ...r, reportStatus: o.status ?? r.reportStatus, category: o.category !== undefined ? o.category : r.category } : r;
  }), [view.rows, overrides]);

  const countries = useMemo(() => [...new Set(rows.map((r) => r.country).filter((c) => c && c !== "Unknown"))].sort(), [rows]);
  const industries = useMemo(() => [...new Set(rows.map((r) => r.industry).filter((c) => c && c !== "Unknown"))].sort(), [rows]);
  const tabCount = (t: Tab) => (t === "all" ? rows.length : rows.filter((r) => r.categories.includes(t) || r.category === t).length);

  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    const out = rows.filter((r) =>
      (tab === "all" || r.categories.includes(tab) || r.category === tab) &&
      (!country || r.country === country) && (!industry || r.industry === industry) && (!day || r.kstDate === day) &&
      (r.relevance ?? 0) >= minRel && (!verify || (verify === "google" ? r.viaGoogleNews : r.verification === verify)) && (!status || r.reportStatus === status) &&
      (!ql || `${r.title} ${r.titleKo ?? ""} ${r.sourceName} ${r.summaryLines.join(" ")}`.toLowerCase().includes(ql)));
    out.sort((a, b) => sort === "relevance" ? (b.relevance ?? -1) - (a.relevance ?? -1) : (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    return out;
  }, [rows, tab, country, industry, day, minRel, verify, status, q, sort]);

  const selected = rows.filter((r) => r.reportStatus === "selected");
  const pq = periodQuery(period);

  async function post(url: string, body: object) {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...pq, ...body }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error ?? "요청 실패");
    return d;
  }
  async function act(key: string, fn: () => Promise<string | void>) {
    setBusy(key); setMsg(null);
    try { const m = await fn(); if (m) setMsg(m); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }
  const startJob = (key: string, url: string, body: object, label: string) => act(key, async () => {
    const d = await post(url, body);
    return d.busy ? "이미 실행 중인 작업이 있습니다. 상단 상태 표시에서 진행 상황을 확인하세요." : `${label} 작업을 서버에서 시작했습니다. 완료되면 화면이 자동으로 갱신됩니다 (상단 상태 표시 참조).`;
  });
  async function setRowStatus(ids: string[], s: ReportStatus) {
    setOverrides((o) => ({ ...o, ...Object.fromEntries(ids.map((id) => [id, { ...o[id], status: s }])) }));
    await post("/api/weekly/item", { ids, status: s }).catch((e) => setMsg(e.message));
  }
  async function setRowCategory(id: string, c: WeeklyCategory) {
    setOverrides((o) => ({ ...o, [id]: { ...o[id], category: c } }));
    await post("/api/weekly/item", { articleId: id, category: c }).catch((e) => setMsg(e.message));
  }
  async function openPreview() {
    await act("preview", async () => { const d = await post("/api/weekly/preview", {}); setPreview(d.data); setPvTab("industry"); });
  }
  async function download() {
    await act("excel", async () => {
      const r = await fetch("/api/weekly/excel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(pq) });
      if (!r.ok) throw new Error((await r.json()).error ?? "다운로드 실패");
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `현대무벡스_주간업계동향_${period.startDate}_${period.endDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }
  const go = (params: Record<string, string>) => router.push(`/weekly?${new URLSearchParams(params)}`);

  const kpis = [
    { label: "수집 기사", v: view.counts.collected, icon: Newspaper },
    { label: "국내 산업동향", v: view.counts.domestic },
    { label: "글로벌 산업동향", v: view.counts.global },
    { label: "경쟁사 동향", v: view.counts.competitor },
    { label: "정책·규제 동향", v: view.counts.policy },
    { label: "잠재 수주기회", v: view.counts.opportunity },
    { label: "보고서 선정", v: selected.length, accent: true },
  ];

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900"><CalendarRange className="h-5 w-5 text-sky-600" />주간 업계동향</h1>
          <p className="text-sm text-slate-500">국내외 산업·경쟁사·정책·기술 동향과 잠재 수주기회 기사를 기간별로 수집·검토하고 주간 보고서 Excel로 출력합니다. (기준: 한국시간 월 00:00 ~ 일 23:59)</p>
        </div>
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-0.5">
            <button className="rounded p-1 hover:bg-slate-100" title="이전 주" onClick={() => go({ w: String(period.offset - 1) })}><ChevronLeft className="h-4 w-4" /></button>
            <span className="px-2 text-sm font-semibold tabular text-slate-800">{period.label}</span>
            <button className="rounded p-1 hover:bg-slate-100 disabled:opacity-30" title="다음 주" disabled={period.offset >= 0 || period.key === "custom"} onClick={() => go({ w: String(period.offset + 1) })}><ChevronRight className="h-4 w-4" /></button>
          </div>
          <Select value={period.key} onChange={(e) => (e.target.value === "custom" ? null : go(e.target.value === "this" ? { w: "0" } : e.target.value === "prev" ? { w: "-2" } : { w: "-1" }))}>
            <option value="last">지난주</option><option value="this">이번 주</option><option value="prev">이전 주</option><option value="custom">사용자 지정</option>
          </Select>
          <Input type="date" className="w-36" value={custom.start} onChange={(e) => setCustom({ ...custom, start: e.target.value })} />
          <span className="text-slate-400">~</span>
          <Input type="date" className="w-36" value={custom.end} onChange={(e) => setCustom({ ...custom, end: e.target.value })} />
          <Button variant="outline" size="sm" onClick={() => go({ p: "custom", start: custom.start, end: custom.end })}>기간 적용</Button>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => startJob("this", "/api/weekly/collect", { current: true }, "이번 주 기사 수집")}><Newspaper className="h-3.5 w-3.5" />이번 주 기사 수집</Button>
            <Button size="sm" disabled={!!busy} onClick={() => startJob("collect", "/api/weekly/collect", {}, "선택 기간 다시 검색")}>{busy === "collect" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}선택 기간 다시 검색</Button>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => startJob("analyze", "/api/weekly/analyze", {}, view.ai ? "AI 관련도 분석" : "규칙 기반 관련도 분류")}><Sparkles className="h-3.5 w-3.5" />AI 관련도 분석</Button>
            <Button size="sm" variant="outline" onClick={() => setShowDup(!showDup)}><Layers className="h-3.5 w-3.5" />중복 기사 확인 ({view.dupGroups.length})</Button>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act("rec", async () => { const d = await post("/api/weekly/recommend", {}); router.refresh(); setOverrides({}); return `추천 ${d.recommended}건 선정 (총 선정 ${d.totalSelected}건). 사용자가 직접 정한 상태는 유지됩니다.`; })}><Wand2 className="h-3.5 w-3.5" />보고서 생성 (추천)</Button>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={openPreview}><Eye className="h-3.5 w-3.5" />미리보기</Button>
            <Button size="sm" disabled={!!busy || !selected.length} onClick={download}>{busy === "excel" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}엑셀 다운로드</Button>
          </div>
        </div>
        {msg && <div className="mt-2 rounded bg-sky-50 px-3 py-1.5 text-sm text-sky-800">{msg}</div>}
        {!view.ai && <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-700"><Info className="h-3.5 w-3.5" />AI 미연결: 카테고리·관련도는 규칙 기반 분류이며, 한국어 제목 번역과 4줄 요약은 생성되지 않습니다 (국문 기사는 원문 발췌 표시).</div>}
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {kpis.map((k) => (
          <Card key={k.label} className={cn("p-3", k.accent && "ring-2 ring-sky-500")}>
            <div className="text-[11px] font-semibold text-slate-500">{k.label}</div>
            <div className="mt-1 text-2xl font-bold tabular text-slate-900">{k.v}</div>
          </Card>
        ))}
      </div>

      {view.missingDays.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4" />
          수집 기사가 없는 날짜: {view.missingDays.join(", ")}
          <Button size="sm" variant="outline" className="ml-auto" disabled={!!busy} onClick={() => startJob("days", "/api/weekly/collect", { days: view.missingDays }, "누락 날짜 추가 수집")}>누락 날짜 추가 수집</Button>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="p-3 text-xs text-slate-600">
          <b className="text-slate-800">Industry Relevance Score (주간 업계동향용)</b> — 현대무벡스 사업 연관성 30 · 업계 파급력 25 · 최신성 20 · 전략지역·산업 15 · 근거 신뢰성 10. 정책·경쟁사·기술 기사도 높게 평가될 수 있습니다.
        </Card>
        <Card className="p-3 text-xs text-slate-600">
          <b className="text-slate-800">Opportunity Score (수주기회 탐지용)</b> — 시설 투자 신호·자동화 적용 가능성·발주 시점·솔루션 적합도·전략지역. 수주 확률이 아닌 영업 우선순위 지표이며, 점수가 낮아도 업계동향 기사는 삭제되지 않습니다.
        </Card>
      </div>

      {showDup && (
        <Card>
          <CardHeader><CardTitle>중복·동일 프로젝트 기사 그룹 ({view.dupGroups.length})</CardTitle><button onClick={() => setShowDup(false)}><X className="h-4 w-4 text-slate-400" /></button></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!view.dupGroups.length && <div className="text-slate-400">이 기간에 중복으로 판단된 기사가 없습니다.</div>}
            {view.dupGroups.map((g) => (
              <div key={g.key} className="rounded-lg border border-slate-200 p-2">
                <div className="mb-1 text-[11px] text-slate-500">{g.key.startsWith("opp:") ? "동일 수주기회 프로젝트" : g.key.startsWith("dup:") ? "재배포(동일 기사)" : "제목 유사"} — 보고서 추천 시 1건만 선정됩니다</div>
                {g.ids.map((id) => { const r = rows.find((x) => x.id === id); return r ? <div key={id} className="flex items-center gap-2 text-xs"><Badge>{STATUS_LABEL[r.reportStatus]}</Badge><a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:underline">{r.titleKo ?? r.title}</a><span className="text-slate-400">{r.sourceName}</span></div> : null; })}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {view.hotWatch.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-1.5"><Flame className="h-4 w-4 text-red-500" />이 기간의 HOT·WATCH 수주기회</CardTitle><Link href="/opportunities" className="text-xs text-sky-700 hover:underline">수주기회 대시보드 →</Link></CardHeader>
          <div className="divide-y divide-slate-100">
            {view.hotWatch.map((o) => {
              const r = rows.find((x) => x.id === o.articleId);
              return (
                <div key={o.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <PriorityBadge p={o.priority} /><b className="tabular">{o.score}</b>
                  <Link href={`/opportunities/${o.id}`} className="flex-1 hover:underline">{o.company} — {o.projectName} <span className="text-xs text-slate-400">({o.country})</span>{o.isDemo && <Badge tone="violet" className="ml-1">DEMO</Badge>}</Link>
                  {r?.reportStatus === "selected" ? <Badge tone="green">보고서 선정됨</Badge> : <Button size="sm" variant="outline" onClick={() => { setRowStatus([o.articleId], "selected"); setRowCategory(o.articleId, "opportunity"); }}>보고서에 추가</Button>}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* main table */}
      <Card>
        <div className="flex flex-wrap gap-1 border-b border-slate-100 px-3 pt-3">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={cn("rounded-t-lg px-3 py-2 text-sm", tab === t.key ? "border-b-2 border-brand font-semibold text-brand" : "text-slate-500 hover:text-slate-800")}>
              {t.label} <span className="ml-0.5 rounded bg-slate-100 px-1.5 text-[11px] tabular">{tabCount(t.key)}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <div className="relative min-w-48 flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><Input className="pl-8" placeholder="제목·매체·요약 검색" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select value={country} onChange={(e) => setCountry(e.target.value)}><option value="">전체 국가</option>{countries.map((c) => <option key={c}>{c}</option>)}</Select>
          <Select value={industry} onChange={(e) => setIndustry(e.target.value)}><option value="">전체 산업</option>{industries.map((c) => <option key={c}>{c}</option>)}</Select>
          <Select value={day} onChange={(e) => setDay(e.target.value)}><option value="">전체 날짜</option>{view.dayCounts.map((d) => <option key={d.date} value={d.date}>{d.date} ({d.n})</option>)}</Select>
          <Select value={minRel} onChange={(e) => setMinRel(Number(e.target.value))}>{[0, 30, 50, 70].map((v) => <option key={v} value={v}>{v ? `관련도 ≥ ${v}` : "전체 관련도"}</option>)}</Select>
          <Select value={verify} onChange={(e) => setVerify(e.target.value)}><option value="">전체 검증상태</option><option value="verified">링크 검증됨</option><option value="needs_check">확인 필요</option><option value="google">Google News 경유</option><option value="broken">링크 오류</option></Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">전체 보고서 상태</option>{(Object.keys(STATUS_LABEL) as ReportStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value as "date" | "relevance")}><option value="date">최근 기사 우선</option><option value="relevance">관련도순</option></Select>
        </div>
        {checked.size > 0 && (
          <div className="flex items-center gap-2 border-b border-slate-100 bg-sky-50 px-3 py-2 text-sm">
            <span>{checked.size}건 선택</span>
            <Button size="sm" onClick={() => { setRowStatus([...checked], "selected"); setChecked(new Set()); }}>보고서 선정</Button>
            <Button size="sm" variant="outline" onClick={() => { setRowStatus([...checked], "hold"); setChecked(new Set()); }}>보류</Button>
            <Button size="sm" variant="outline" onClick={() => { setRowStatus([...checked], "excluded"); setChecked(new Set()); }}>제외</Button>
            <button className="ml-auto text-xs text-slate-500" onClick={() => setChecked(new Set())}>선택 해제</button>
          </div>
        )}
        <div className="px-3 py-2 text-xs text-slate-500">{filtered.length}건 표시 · 제외한 기사도 DB에서 삭제되지 않습니다</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1250px]">
            <thead>
              <tr>
                <Th className="w-8"><input type="checkbox" checked={filtered.length > 0 && filtered.every((r) => checked.has(r.id))} onChange={(e) => setChecked(e.target.checked ? new Set(filtered.map((r) => r.id)) : new Set())} /></Th>
                <Th>카테고리</Th><Th>기사 날짜</Th><Th>한국어 제목</Th><Th>매체</Th><Th title="Industry Relevance Score">관련도</Th><Th title="Opportunity Score">수주기회</Th><Th>요약</Th><Th>원문</Th><Th>보고서 상태</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className={cn("hover:bg-slate-50", r.reportStatus === "selected" && "bg-emerald-50/50", r.reportStatus === "excluded" && "opacity-50")}>
                  <Td><input type="checkbox" checked={checked.has(r.id)} onChange={(e) => setChecked((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} /></Td>
                  <Td className="w-36">
                    {r.analysis === "pending" ? <Badge>미분석</Badge> : (
                      <Select className="h-7 w-32 text-xs" value={r.category ?? ""} onChange={(e) => setRowCategory(r.id, e.target.value as WeeklyCategory)}>
                        <option value="" disabled>대상 아님</option>
                        {WEEKLY_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                      </Select>
                    )}
                    <div className="mt-1 flex flex-wrap gap-0.5">{r.categories.filter((c) => c !== r.category).map((c) => <Badge key={c} tone={CAT_TONE[c]} className="text-[10px]">{CAT_SHORT[c]}</Badge>)}</div>
                  </Td>
                  <Td><DateCell r={r} /></Td>
                  <Td className="max-w-80">
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-medium text-slate-900 hover:text-sky-700 hover:underline">{r.titleKo ?? r.title}</a>
                    {r.titleKo && r.titleKo !== r.title && <div className="mt-0.5 text-[11px] text-slate-400">{r.title}</div>}
                    {!r.titleKo && r.analysis !== "pending" && <Badge className="mt-0.5">번역 전 (AI 미연결)</Badge>}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.analysis !== "pending" && <ModeBadge mode={r.analysis === "ai" ? "ai" : r.analysis === "demo" ? "demo" : "rules"} />}
                      {r.recommended && <Badge tone="violet">자동 추천</Badge>}
                      {r.competitors.map((c) => <Badge key={c} tone="violet">{c}</Badge>)}
                      {r.competitorNotes.length > 0 && <Badge tone="amber" title={r.competitorNotes.join("\n")}>유사 명칭</Badge>}
                      {r.policyNote && <Badge tone="amber">{r.policyNote}</Badge>}
                      {r.dupGroup && <Badge title="중복 기사 확인에서 그룹 보기">중복 그룹</Badge>}
                    </div>
                  </Td>
                  <Td className="text-xs">{r.sourceName}<div className="text-[10px] text-slate-400">{r.country !== "Unknown" ? r.country : ""}{r.industry !== "Unknown" ? ` · ${r.industry}` : ""}</div></Td>
                  <Td><RelevanceCell r={r} /></Td>
                  <Td className="text-xs tabular">{r.oppScore != null ? <span className={cn("font-semibold", r.oppPriority === "HOT" ? "text-red-600" : r.oppPriority === "WATCH" ? "text-amber-600" : "text-slate-500")}>{r.oppScore}{r.oppPriority && r.oppPriority !== "GENERAL" ? ` ${r.oppPriority}` : ""}</span> : "-"}</Td>
                  <Td className="max-w-80"><Summary r={r} /></Td>
                  <Td className="whitespace-nowrap">
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">원문 보기<ExternalLink className="h-3 w-3" /></a>
                    <div className="mt-1 flex flex-col items-start gap-0.5">
                      {r.viaGoogleNews ? <Badge tone="amber" title="클릭하면 원문으로 이동하지만 원문 URL은 자동 확인되지 않았습니다">Google News 경유</Badge> : <VerifyBadge status={r.verification} demo={r.isDemo} />}
                      {r.access === "paywall" && <AccessBadge access="paywall" />}
                      {r.altState === "none" && <Badge tone="red">무료 대체 출처 없음</Badge>}
                      {r.altState === "found" && <Badge tone="green">무료 대체 출처 있음</Badge>}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <div className="mb-1 text-xs font-semibold">{STATUS_LABEL[r.reportStatus]}</div>
                    <div className="flex gap-1">
                      <button title="보고서 선정" onClick={() => setRowStatus([r.id], r.reportStatus === "selected" ? "unreviewed" : "selected")} className={cn("rounded p-1", r.reportStatus === "selected" ? "bg-emerald-600 text-white" : "text-emerald-700 hover:bg-emerald-50")}><CheckCircle2 className="h-4 w-4" /></button>
                      <button title="보류" onClick={() => setRowStatus([r.id], r.reportStatus === "hold" ? "unreviewed" : "hold")} className={cn("rounded p-1", r.reportStatus === "hold" ? "bg-amber-500 text-white" : "text-amber-600 hover:bg-amber-50")}><PauseCircle className="h-4 w-4" /></button>
                      <button title="제외" onClick={() => setRowStatus([r.id], r.reportStatus === "excluded" ? "unreviewed" : "excluded")} className={cn("rounded p-1", r.reportStatus === "excluded" ? "bg-slate-600 text-white" : "text-slate-500 hover:bg-slate-100")}><CircleSlash className="h-4 w-4" /></button>
                    </div>
                  </Td>
                </tr>
              ))}
              {!filtered.length && <tr><Td colSpan={10} className="py-10 text-center text-slate-400">이 기간·조건에 해당하는 기사가 없습니다. &apos;선택 기간 다시 검색&apos;으로 수집하세요.</Td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* report area */}
      <Card>
        <CardHeader><CardTitle>주간 보고서 작성 영역 — 선정 기사 {selected.length}건</CardTitle><span className="text-xs text-slate-400">권장 15~20건 · 카테고리는 표에서 변경 가능</span></CardHeader>
        <CardContent className="space-y-3">
          {WEEKLY_CATEGORIES.map((c) => {
            const list = selected.filter((r) => (r.category ?? "global") === c.key);
            if (!list.length) return null;
            return (
              <div key={c.key}>
                <div className="mb-1 text-xs font-semibold text-slate-500">{c.label} ({list.length})</div>
                {list.map((r) => (
                  <div key={r.id} className="flex items-start gap-2 border-l-2 border-sky-500 py-1 pl-3 text-sm">
                    <span className="w-24 shrink-0 text-xs tabular text-slate-500">{r.dateStatus === "verified" ? r.kstDate : <span className="text-amber-700">미확인</span>}</span>
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex-1 hover:underline">{r.titleKo ?? r.title}</a>
                    <span className="text-xs text-slate-400">{r.sourceName}</span>
                    <button title="선정 취소" onClick={() => setRowStatus([r.id], "unreviewed")}><X className="h-3.5 w-3.5 text-slate-400 hover:text-red-500" /></button>
                  </div>
                ))}
              </div>
            );
          })}
          {!selected.length && <div className="text-sm text-slate-400">선정된 기사가 없습니다. 표에서 ✓ 버튼으로 선정하거나 &apos;보고서 생성 (추천)&apos;을 누르세요.</div>}
        </CardContent>
      </Card>

      {/* preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-slate-900/50 p-4">
          <div className="w-full max-w-6xl rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <b>Excel 미리보기 — {period.startDate} ~ {period.endDate}</b>
              <div className="flex gap-2"><Button size="sm" onClick={download} disabled={!preview.industry.length}><Download className="h-3.5 w-3.5" />엑셀 다운로드</Button><button onClick={() => setPreview(null)}><X className="h-5 w-5 text-slate-400" /></button></div>
            </div>
            {preview.warnings.length > 0 && (
              <div className="mx-5 mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <div className="mb-1 flex items-center gap-1 font-semibold"><AlertTriangle className="h-3.5 w-3.5" />출력 전 확인 사항</div>
                <ul className="list-disc pl-5">{preview.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>
            )}
            <div className="flex gap-1 px-5 pt-3">
              {([["industry", "시트1 주간 업계동향"], ["opportunity", "시트2 잠재 수주기회"], ["competitor", "시트3 경쟁사 동향"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setPvTab(k)} className={cn("rounded-t px-3 py-1.5 text-sm", pvTab === k ? "bg-brand text-white" : "bg-slate-100 text-slate-600")}>{l} ({preview[k].length})</button>
              ))}
            </div>
            <div className="max-h-[65vh] overflow-auto px-5 pb-5">
              <table className="w-full border border-slate-200 text-xs">
                <thead><tr className="bg-brand text-white">
                  <th className="p-2 text-left">{pvTab === "competitor" ? "경쟁사" : "카테고리"}</th><th className="p-2 text-left">날짜</th><th className="p-2 text-left">제목</th><th className="p-2 text-left">매체</th><th className="p-2 text-left">요약</th>
                  {pvTab === "opportunity" && <><th className="p-2">점수</th><th className="p-2 text-left">판단 근거</th><th className="p-2 text-left">연관 솔루션</th></>}
                  {pvTab === "competitor" && <th className="p-2 text-left">비고</th>}
                </tr></thead>
                <tbody>
                  {preview[pvTab].map((r) => (
                    <tr key={r.id} className="border-t border-slate-200 align-top">
                      <td className="p-2">{pvTab === "competitor" ? r.competitor : r.category}</td>
                      <td className={cn("whitespace-nowrap p-2", r.dateWarning && "text-amber-700")}>{r.date}</td>
                      <td className="p-2"><a href={r.url} target="_blank" rel="noopener noreferrer" className="text-sky-700 underline">{r.title}</a></td>
                      <td className="p-2">{r.media}</td>
                      <td className="p-2">{r.summary.map((l, i) => <div key={i} className={cn(l.trim().startsWith("⇒") && "font-bold text-brand", l.startsWith("[") && "italic text-amber-700")}>{l}</div>)}</td>
                      {pvTab === "opportunity" && <><td className="p-2 text-center font-bold">{r.score ?? "-"}</td><td className="p-2">{r.basis}</td><td className="p-2">{r.solutions}</td></>}
                      {pvTab === "competitor" && <td className="p-2">{r.note}</td>}
                    </tr>
                  ))}
                  {!preview[pvTab].length && <tr><td colSpan={9} className="p-6 text-center text-slate-400">해당 기사 없음</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      <p className="text-[11px] text-slate-400">{CAT_LABEL.opportunity}은(는) 수주기회 탐지 시스템과 같은 기사 데이터를 공유합니다. 한 번 수집한 기사는 두 화면에서 함께 사용됩니다.</p>
    </div>
  );
}
