"use client";
// 전체 기사 AI 요약 — 진행 현황(전체/완료/실패/잔여) + 시험·배치·전체 실행 버튼.
// 요약은 AI 추천·보고서 선정과 독립적이다. 완료된 요약은 재사용하고, 한도(429) 도달 시 저장 후 중단 → 다시 누르면 이어서 처리.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import type { WeeklyView } from "@/lib/weekly/view";
import type { Job } from "@/lib/types";
import { cn } from "@/lib/utils";
import { postJson, useReadOnly } from "./parts";

interface Budget { usage: { day: string; used: number; limit: number; remaining: number; blocked: boolean }; limits: { rpm: number; rpd: number } }

export function SummaryPanel({ view, pq }: { view: WeeklyView; pq: Record<string, string> }) {
  const readOnly = useReadOnly();
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const was = useRef(false);
  const s = view.summary;
  const b = view.breakdown;

  const poll = useCallback(async () => {
    if (readOnly) return;
    try {
      const d = (await (await fetch("/api/jobs/latest", { cache: "no-store" })).json()) as { job: Job | null; active: boolean };
      const mine = d.job?.mode === "weekly-analyze" && d.job.options?.scope === "all" ? d.job : null;
      setJob(mine);
      const act = Boolean(mine && d.active);
      if (act) router.refresh(); // 요약이 쌓이는 동안 목록·진행률 갱신
      if (was.current && !act) fetch("/api/ai/status", { cache: "no-store" }).then((r) => r.json()).then(setBudget).catch(() => {});
      was.current = act;
    } catch { /* offline: keep last state */ }
  }, [router, readOnly]);
  const active = Boolean(job && job.status === "running");
  useEffect(() => {
    const t0 = setTimeout(poll, 0);
    const t = setInterval(poll, active ? 8000 : 20000);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, [poll, active]);
  useEffect(() => { if (!readOnly) fetch("/api/ai/status", { cache: "no-store" }).then((r) => r.json()).then(setBudget).catch(() => {}); }, [readOnly]);

  async function run(body: object, label: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true); setMsg(null);
    try {
      const d = await postJson("/api/weekly/analyze", { ...pq, scope: "all", ...body });
      setMsg({ text: d.busy ? "이미 실행 중인 작업이 있습니다." : `${label}을 시작했습니다. 진행 상황이 자동으로 갱신됩니다.` });
      poll();
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : String(e), error: true }); } finally { setBusy(false); }
  }

  const failedN = s.failed + s.unavailable;
  const done = s.done + s.partial + s.review;
  const pct = s.targets ? Math.round((done / s.targets) * 100) : 0;
  const runDone = job ? Math.min(job.analyzeIndex, job.analyzeQueue.length) : 0;
  const halted = job?.haltReason && job.status !== "running" ? job.haltReason : null;
  const rem = s.remaining;
  const noKey = !view.ai;
  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface/90 px-4 py-3.5" aria-label="전체 기사 AI 요약">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[15px] font-semibold text-slate-950">전체 기사 AI 요약 <span className="ml-1 text-[13px] font-normal text-slate-500">· 한국어 4줄 요약 (AI 추천과 별개)</span></div>
        <div className="tabular text-sm text-slate-600">완료 <b className="text-slate-950">{done}</b> / {s.targets}건 ({pct}%)</div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand transition-all" style={{ width: `${pct}%` }} /></div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate-600">
        <span>전체 {s.targets}</span><span>완료 {s.done}</span><span>부분 검증 {s.partial}</span><span>검토 필요 {s.review}</span>
        <span className={cn(s.unavailable && "text-amber-700")}>요약 불가 {s.unavailable}</span><span className={cn(s.failed && "text-red-700")}>실패 {s.failed}</span><b className="text-slate-900">잔여 {rem}</b>
      </div>
      <p className="text-[12px] leading-relaxed text-slate-500">
        집계 기준: 이 주간에 저장된 기사 {b.period}건 − 중복 {b.duplicate}건 = <b>수집 기사 {view.counts.collected}건</b> (요약 대상 {s.targets}건 = 목록 {view.rows.length} + 필터 제외·오류 {view.extraRows.length}).
        {" "}필터 제외 기사도 요약할 수 있으며, 추천·보고서 후보와는 별도로 표시됩니다.
      </p>
      {active && job && (
        <p className="flex items-center gap-2 text-sm text-sky-800"><Loader2 className="h-4 w-4 animate-spin" />요약 중 — 이번 실행 {runDone}/{job.analyzeQueue.length}건 (성공 {job.stats.analyzed} · 실패 {job.stats.errors}) · {job.step}</p>
      )}
      {halted && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">중단됨: {halted}</p>}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <button disabled={busy || active || noKey || rem === 0} onClick={() => run({ limit: 5 }, "5건 시험 요약", "미분석 기사 5건만 실제 Gemini로 요약해 연결·요약·저장을 확인합니다. 진행할까요?")} className="rounded-lg border border-sky-200 px-3 py-1.5 text-sm text-sky-700 hover:bg-sky-50 disabled:opacity-40">5건 시험 요약</button>
          <button disabled={busy || active || noKey || rem === 0} onClick={() => run({ limit: 20 }, "다음 20건 요약")} className="rounded-lg border border-sky-200 px-3 py-1.5 text-sm text-sky-700 hover:bg-sky-50 disabled:opacity-40">다음 20건</button>
          <button disabled={busy || active || noKey || rem === 0} onClick={() => run({}, "전체 기사 AI 요약", `미분석 ${rem}건을 순서대로 Gemini로 요약합니다.\n무료 한도(분당 ${budget?.limits.rpm ?? 9}회 · 하루 ${budget?.limits.rpd ?? 200}회)에 맞춰 천천히 진행하며, 한도에 도달하면 저장 후 중단합니다 (다시 누르면 이어서 처리).\n완료된 요약은 다시 호출하지 않습니다. 시작할까요?`)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-sm font-semibold text-brand-ink disabled:opacity-40">
            {active ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{s.done + s.partial + s.review > 0 && rem > 0 ? "이어서 요약" : "전체 기사 AI 요약"} ({rem}건)
          </button>
          {failedN > 0 && <button disabled={busy || active || noKey} onClick={() => run({ retryFailed: true, limit: 20 }, "실패·요약 불가 재시도")} className="rounded-lg border border-line px-3 py-1.5 text-sm text-slate-700 hover:border-sky-200 disabled:opacity-40">실패·요약 불가 재시도 ({failedN})</button>}
          {budget && <span className="ml-auto text-[12px] text-slate-500 tabular">오늘(미국 태평양시 {budget.usage.day}) Gemini 호출 {budget.usage.used}/{budget.usage.limit}{budget.usage.blocked ? " · 일일 한도 도달" : ""} · 분당 {budget.limits.rpm}회</span>}
        </div>
      )}
      {noKey && !readOnly && <p className="text-[13px] text-amber-700">GEMINI_API_KEY가 설정되지 않아 요약을 실행할 수 없습니다.</p>}
      {msg && <p role="status" className={cn("text-[13px]", msg.error ? "text-red-700" : "text-sky-800")}>{msg.text}</p>}
    </section>
  );
}
