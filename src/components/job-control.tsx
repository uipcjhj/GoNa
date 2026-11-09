"use client";
// "수주기회 탐색" — choose 빠른 테스트 (≤20 real articles) or 전체 탐색, and follow the server-side job live.
// State comes from the server (polling), so it survives page reloads and closed tabs.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Radar, CheckCircle2, AlertTriangle, XCircle, ChevronDown, Zap, Globe2, Clock3, RotateCw } from "lucide-react";
import { Button } from "@/components/ui";
import type { Job } from "@/lib/types";
import { cn } from "@/lib/utils";

const MODE_LABEL: Record<string, string> = { quick: "빠른 테스트", collect: "전체 탐색", weekly: "주간 업계동향 수집", "weekly-analyze": "주간 관련도 분석", reanalyze: "AI 재분석" };

function fmtElapsed(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s >= 3600 ? `${Math.floor(s / 3600)}시간 ${Math.floor((s % 3600) / 60)}분` : `${Math.floor(s / 60)}분 ${String(s % 60).padStart(2, "0")}초`;
}
const kst = (iso: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(iso));

export function JobControl({ aiConnected }: { aiConnected: boolean }) {
  const [job, setJob] = useState<Job | null>(null);
  const [active, setActive] = useState(false);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [netErr, setNetErr] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const router = useRouter();
  const wasActive = useRef(false);

  const poll = useCallback(async () => {
    try {
      const r = await fetch("/api/jobs/latest", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { job: Job | null; active: boolean };
      setNetErr(false);
      setJob(d.job);
      setActive(d.active);
      if (wasActive.current && !d.active) router.refresh(); // screens update when the job ends
      wasActive.current = d.active;
    } catch {
      setNetErr(true);
    }
  }, [router]);

  useEffect(() => {
    const first = setTimeout(poll, 0);
    const t = setInterval(poll, active ? 2000 : 15000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [poll, active]);

  const running = job?.status === "running";
  const stalled = running && !active;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  async function start(mode: "quick" | "collect") {
    setMenu(false);
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `실행 실패 (HTTP ${r.status})`);
      if (d.busy) setErr(`이미 '${MODE_LABEL[d.job.mode] ?? d.job.mode}' 작업이 진행 중입니다. 끝난 뒤 다시 실행하세요.`);
      setJob(d.job);
      setActive(true);
      wasActive.current = true;
      setNow(Date.now());
      setOpen(true);
    } catch (e) {
      setErr(`작업을 시작하지 못했습니다: ${e instanceof Error ? e.message : String(e)}`);
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
  const isRunningLive = running && active;
  const elapsed = job ? (job.finishedAt ? new Date(job.finishedAt).getTime() : now) - new Date(job.startedAt).getTime() : 0;
  const limitMs = job?.deadlineAt ? new Date(job.deadlineAt).getTime() - new Date(job.startedAt).getTime() : null;
  const pct = !job || !s ? 0 : job.status !== "running" ? 100 : job.phase === "discover" ? (45 * s.queriesDone) / Math.max(1, s.queriesTotal) : job.phase === "analyze" ? 50 + (45 * job.analyzeIndex) / Math.max(1, job.analyzeQueue.length) : 96;
  const failed = job?.failedSources ?? [];
  const title = !job ? "" : stalled ? "응답 없음" : running ? MODE_LABEL[job.mode] ?? "작업" : job.status === "completed" ? (job.timeLimited ? "제한시간 종료 (결과 저장됨)" : "완료") : job.status === "failed" ? "실패" : job.status === "cancelled" ? "취소됨" : "완료 (일부 검색 실패)";

  return (
    <div className="relative flex items-center gap-2">
      {job && (
        <button onClick={() => setOpen(!open)} aria-label="작업 상태 보기" className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">
          {isRunningLive ? <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600" /> : stalled ? <AlertTriangle className="h-3.5 w-3.5 text-red-500" /> : job.status === "completed" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : job.status === "failed" ? <XCircle className="h-3.5 w-3.5 text-red-600" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
          <span className="hidden md:inline">{isRunningLive ? `${MODE_LABEL[job.mode] ?? ""} · ${fmtElapsed(elapsed)}` : stalled ? "작업 응답 없음" : `${title}`}</span>
          <ChevronDown className="h-3 w-3" />
        </button>
      )}
      <div className="relative">
        <Button onClick={() => setMenu(!menu)} disabled={busy || isRunningLive} aria-haspopup="menu" aria-expanded={menu}>
          {busy || isRunningLive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radar className="h-4 w-4" />}
          <span className="hidden sm:inline">{isRunningLive ? "탐색 진행 중" : "수주기회 탐색"}</span>
          <span className="sm:hidden">{isRunningLive ? "진행 중" : "탐색"}</span>
          {!isRunningLive && <ChevronDown className="h-3.5 w-3.5" />}
        </Button>
        {menu && (
          <div role="menu" className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+4rem)] z-50 rounded-xl border border-line bg-navy-900 p-2 shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-80">
            <button role="menuitem" onClick={() => start("quick")} className="flex w-full items-start gap-3 rounded-lg p-3 text-left hover:bg-sky-50">
              <Zap className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
              <span>
                <span className="block text-sm font-semibold text-slate-900">빠른 테스트 <span className="ml-1 rounded bg-sky-100 px-1.5 text-[10px] text-sky-700">권장</span></span>
                <span className="block text-xs text-slate-500">실제 기사 최대 20건 (국내 10 · 글로벌 10 목표), 약 1~2분 · 최대 2분 30초, API 키 불필요</span>
              </span>
            </button>
            <button role="menuitem" onClick={() => start("collect")} className="flex w-full items-start gap-3 rounded-lg p-3 text-left hover:bg-sky-50">
              <Globe2 className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
              <span>
                <span className="block text-sm font-semibold text-slate-900">전체 탐색</span>
                <span className="block text-xs text-slate-500">설정된 모든 검색어·소스로 전체 수집 (수 분~20분, 제한시간은 설정에서 변경)</span>
              </span>
            </button>
          </div>
        )}
      </div>

      {(open || err) && (
        <div className="fixed inset-x-3 top-[calc(env(safe-area-inset-top)+4rem)] z-50 max-h-[78vh] overflow-y-auto rounded-xl border border-line bg-navy-900 p-4 text-sm shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[24rem]">
          {err && <div className="mb-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}
          {netErr && <div className="mb-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">서버 상태를 가져오지 못했습니다. 서버(npm run dev)가 실행 중인지 확인하세요. 자동으로 다시 시도합니다.</div>}
          {job && s && (
            <>
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="font-semibold text-slate-900">{title}</div>
                <button className="text-xs text-slate-400 hover:text-slate-700" onClick={() => { setOpen(false); setErr(null); }}>닫기</button>
              </div>
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                <span>{MODE_LABEL[job.mode] ?? job.mode}</span>
                <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />시작 {kst(job.startedAt)}</span>
                <span className="tabular">경과 {fmtElapsed(elapsed)}{limitMs ? ` / 제한 ${fmtElapsed(limitMs)}` : ""}</span>
              </div>

              <div className="mb-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                <span className="font-semibold">현재 단계: </span>{job.step ?? (running ? "진행 중" : "완료")}
              </div>
              <div className="mb-3 h-1.5 overflow-hidden rounded bg-slate-100">
                <div className={cn("h-full transition-all", stalled ? "bg-red-500" : "bg-brand")} style={{ width: `${pct}%` }} />
              </div>

              {stalled && (
                <div className="mb-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                  작업이 {fmtElapsed(now - new Date(job.heartbeatAt).getTime())} 동안 응답하지 않았습니다 (서버 재시작 또는 네트워크 문제 가능). 다시 실행하면 중단된 지점부터 이어서 진행합니다.
                  <button onClick={() => start(job.mode === "quick" ? "quick" : "collect")} className="mt-1 flex items-center gap-1 font-semibold underline"><RotateCw className="h-3 w-3" />이어서 실행</button>
                </div>
              )}
              {job.status === "failed" && <div className="mb-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">작업 실패: {job.error ?? "알 수 없는 오류"}</div>}
              {job.timeLimited && <div className="mb-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">제한시간에 도달해 지금까지 수집·분석한 결과만 저장하고 정상 종료했습니다.</div>}

              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <dt className="text-slate-500">검색 완료</dt><dd className="text-right tabular">{s.queriesDone} / {s.queriesTotal}건</dd>
                <dt className="text-slate-500">검색 결과 (원본)</dt><dd className="text-right tabular">{s.found}건</dd>
                <dt className="text-slate-500">실제 저장 기사</dt><dd className="text-right font-semibold tabular text-slate-900">{s.newArticles}건</dd>
                <dt className="text-slate-500">중복 제외</dt><dd className="text-right tabular">{s.duplicates}건</dd>
                <dt className="text-slate-500">{job.mode === "quick" ? "선별 제외 (미저장)" : "관련성 필터 제외"}</dt><dd className="text-right tabular">{s.filtered}건</dd>
                <dt className="text-slate-500">{aiConnected ? "AI 분석 완료" : "분석 완료 (규칙 기반)"}</dt><dd className="text-right tabular">{s.analyzed}{job.analyzeQueue.length ? ` / ${job.analyzeQueue.length}` : ""}건</dd>
                <dt className="text-slate-500">신규 수주기회</dt><dd className="text-right font-semibold tabular text-brand">{s.newOpportunities}건</dd>
                <dt className="text-slate-500">기존 프로젝트 업데이트</dt><dd className="text-right tabular">{s.updatedOpportunities}건</dd>
              </dl>

              <div className="mt-3">
                <div className="mb-1 text-xs font-semibold text-slate-600">실패한 검색 소스 ({failed.length})</div>
                {failed.length ? (
                  <ul className="max-h-24 space-y-0.5 overflow-auto rounded bg-red-50 p-2 text-[11px] text-red-700">{failed.map((f, i) => <li key={i}>• {f}</li>)}</ul>
                ) : (
                  <div className="text-[11px] text-slate-500">없음</div>
                )}
              </div>

              <details className="mt-2">
                <summary className="cursor-pointer text-[11px] text-slate-500">최근 로그</summary>
                <div className="mt-1 max-h-32 space-y-0.5 overflow-auto rounded bg-slate-50 p-2 font-mono text-[10px] leading-snug text-slate-600">
                  {job.log.slice(-10).map((l, i) => (
                    <div key={i} className={l.level === "error" ? "text-red-600" : l.level === "warn" ? "text-amber-700" : ""}>{l.msg}</div>
                  ))}
                </div>
              </details>
              <div className="mt-3 flex justify-between">
                <a href="/runs" className="text-xs text-sky-700 hover:underline">전체 실행 기록 →</a>
                {running && <button onClick={cancel} className="text-xs text-red-600 hover:underline">작업 취소</button>}
              </div>
              <p className="mt-2 text-[10px] text-slate-400">작업은 서버에서 실행되므로 창을 닫거나 새로고침해도 계속 진행되고, 다시 열면 이 상태가 그대로 보입니다.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
