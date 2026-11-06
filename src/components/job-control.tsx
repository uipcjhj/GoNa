"use client";
// "수주기회 탐색" button + live status of the server-side job (polls; survives page reloads).
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Radar, CheckCircle2, AlertTriangle, XCircle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui";
import type { Job } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

const PHASE: Record<string, string> = { discover: "뉴스 검색 중", analyze: "AI 분석 중", supplement: "추가 출처 탐색 중", done: "완료" };

export function JobControl({ aiConnected }: { aiConnected: boolean }) {
  const [job, setJob] = useState<Job | null>(null);
  const [active, setActive] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const wasActive = useRef(false);

  const poll = useCallback(async () => {
    try {
      const r = await fetch("/api/jobs/latest", { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as { job: Job | null; active: boolean };
      setJob(d.job);
      setActive(d.active);
      if (wasActive.current && !d.active) router.refresh(); // dashboard update when finished
      wasActive.current = d.active;
    } catch {
      /* ignore */
    }
  }, [router]);

  useEffect(() => {
    const first = setTimeout(poll, 0);
    const t = setInterval(poll, active ? 2500 : 15000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [poll, active]);

  async function start() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "실행 실패");
      setJob(d.job);
      setActive(true);
      wasActive.current = true;
      setOpen(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!job) return;
    await fetch(`/api/jobs/${job.id}/cancel`, { method: "POST" });
    poll();
  }

  const s = job?.stats;
  const running = active && job?.status === "running";
  return (
    <div className="relative flex items-center gap-2">
      {job && (
        <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600" /> : job.status === "completed" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : job.status === "failed" ? <XCircle className="h-3.5 w-3.5 text-red-600" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
          <span className="hidden md:inline">{running ? `${PHASE[job.phase]} · ${job.phase === "discover" ? `${s?.queriesDone}/${s?.queriesTotal}` : `${job.analyzeIndex}/${job.analyzeQueue.length}`}` : `마지막 수집 ${timeAgo(job.finishedAt ?? job.startedAt)}`}</span>
          <ChevronDown className="h-3 w-3" />
        </button>
      )}
      <Button onClick={start} disabled={busy || running}>
        {busy || running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
        <span className="hidden sm:inline">수주기회 탐색</span>
        <span className="sm:hidden">탐색</span>
      </Button>
      {(open || err) && (
        <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+4rem)] z-50 max-h-[75vh] overflow-y-auto rounded-xl border border-line bg-navy-900 p-4 text-sm shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[22rem]">
          {err && <div className="mb-2 rounded bg-red-50 p-2 text-xs text-red-700">{err}</div>}
          {job && s && (
            <>
              <div className="mb-2 flex items-center justify-between">
                <div className="font-semibold">{running ? PHASE[job.phase] : job.status === "completed" ? "수집 완료" : job.status === "failed" ? "실패" : job.status === "cancelled" ? "취소됨" : "완료 (일부 오류)"}</div>
                <button className="text-xs text-slate-400 hover:text-slate-700" onClick={() => setOpen(false)}>닫기</button>
              </div>
              {running && (
                <div className="mb-3 h-1.5 overflow-hidden rounded bg-slate-100">
                  <div className="h-full bg-sky-500 transition-all" style={{ width: `${job.phase === "discover" ? (40 * s.queriesDone) / Math.max(1, s.queriesTotal) : job.phase === "analyze" ? 40 + (55 * job.analyzeIndex) / Math.max(1, job.analyzeQueue.length) : 97}%` }} />
                </div>
              )}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <dt className="text-slate-500">검색 진행</dt><dd className="text-right tabular">{s.queriesDone} / {s.queriesTotal}</dd>
                <dt className="text-slate-500">수집된 기사</dt><dd className="text-right tabular">{s.found}</dd>
                <dt className="text-slate-500">신규 기사</dt><dd className="text-right tabular">{s.newArticles}</dd>
                <dt className="text-slate-500">중복 제거</dt><dd className="text-right tabular">{s.duplicates}</dd>
                <dt className="text-slate-500">관련성 필터 제외</dt><dd className="text-right tabular">{s.filtered}</dd>
                <dt className="text-slate-500">{aiConnected ? "AI 분석 완료" : "분석 완료 (규칙 기반)"}</dt><dd className="text-right tabular">{s.analyzed}{job.analyzeQueue.length ? ` / ${job.analyzeQueue.length}` : ""}</dd>
                <dt className="text-slate-500">신규 수주기회</dt><dd className="text-right font-semibold text-orange-600 tabular">{s.newOpportunities}</dd>
                <dt className="text-slate-500">기존 프로젝트 업데이트</dt><dd className="text-right tabular">{s.updatedOpportunities}</dd>
                <dt className="text-slate-500">오류</dt><dd className={cn("text-right tabular", s.errors ? "font-semibold text-red-600" : "")}>{s.errors}</dd>
              </dl>
              {job.error && <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">{job.error}</div>}
              <div className="mt-3 max-h-32 space-y-0.5 overflow-auto rounded bg-slate-50 p-2 font-mono text-[10px] leading-snug text-slate-600">
                {job.log.slice(-8).map((l, i) => (
                  <div key={i} className={l.level === "error" ? "text-red-600" : l.level === "warn" ? "text-amber-700" : ""}>{l.msg}</div>
                ))}
              </div>
              <div className="mt-3 flex justify-between">
                <a href="/runs" className="text-xs text-sky-700 hover:underline">전체 실행 기록 →</a>
                {running && <button onClick={cancel} className="text-xs text-red-600 hover:underline">작업 취소</button>}
              </div>
              <p className="mt-2 text-[10px] text-slate-400">작업은 서버에서 실행되므로 창을 닫거나 새로고침해도 계속 진행됩니다.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
