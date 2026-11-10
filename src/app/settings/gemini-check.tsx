"use client";
// Gemini 연결 점검: 모델 목록(키·모델명 확인) + 짧은 생성 호출. 비밀키는 표시하지 않음.
import { useState } from "react";
import { Loader2 } from "lucide-react";

type Health = { configured: boolean; configuredModel: string | null; resolvedModel: string | null; note: string; flashModels: string[]; test: { ok: boolean; ms?: number; error?: string; kind?: string; status?: number | null }; stats: { ok: number; failed: Record<string, number>; lastError: { kind: string; status: number | null; message: string; at: string } | null } };

export function GeminiCheck() {
  const [h, setH] = useState<Health | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/ai/status", { method: "POST" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setH(await r.json());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="col-span-full mt-2 rounded-lg border border-line p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><b className="text-slate-900">Gemini 연결 점검</b> <span className="text-[13px] text-slate-500">— API 키 권한·모델명·무료 한도를 실제 호출로 확인 (호출 1회 사용)</span></div>
        <button onClick={run} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm text-slate-800 hover:border-sky-200 disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}연결 점검</button>
      </div>
      {err && <p className="mt-2 text-red-700">{err}</p>}
      {h && (
        <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
          <div><dt className="inline text-slate-500">API 키: </dt><dd className="inline">{h.configured ? "설정됨 (값은 표시하지 않음)" : "미설정 — .env.local에 GEMINI_API_KEY 필요"}</dd></div>
          <div><dt className="inline text-slate-500">설정 모델: </dt><dd className="inline">{h.configuredModel ?? "없음 (자동 선택)"}</dd></div>
          <div><dt className="inline text-slate-500">사용 모델: </dt><dd className="inline font-semibold text-slate-900">{h.resolvedModel ?? "—"}</dd></div>
          <div><dt className="inline text-slate-500">판단: </dt><dd className="inline">{h.note}</dd></div>
          <div className="sm:col-span-2"><dt className="inline text-slate-500">호출 테스트: </dt><dd className={h.test.ok ? "inline text-sky-700" : "inline text-red-700"}>{h.test.ok ? `성공 (${h.test.ms}ms)` : `실패 — ${h.test.error}`}</dd></div>
          {h.flashModels.length > 0 && <div className="sm:col-span-2"><dt className="inline text-slate-500">사용 가능한 flash 모델: </dt><dd className="inline">{h.flashModels.slice(0, 12).join(", ")}</dd></div>}
          <div className="sm:col-span-2"><dt className="inline text-slate-500">이 서버 실행 후 호출: </dt><dd className="inline">성공 {h.stats.ok}건{Object.entries(h.stats.failed).map(([k, n]) => ` · ${k} ${n}건`).join("")}{h.stats.lastError ? ` · 최근 오류 ${h.stats.lastError.message}` : ""}</dd></div>
        </dl>
      )}
    </div>
  );
}
