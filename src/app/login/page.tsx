"use client";
import { useState } from "react";
import { Eye, EyeOff, Loader2, Lock, Radar } from "lucide-react";

/** Only same-site relative paths are allowed as the post-login destination (no open redirect). */
function safeNext(): string {
  const n = new URLSearchParams(window.location.search).get("next") ?? "/";
  return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/";
}

export default function LoginPage() {
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) }).catch(() => null);
    if (r?.ok) {
      window.location.href = safeNext();
      return;
    }
    setErr(r ? ((await r.json().catch(() => ({}))).error ?? "로그인 실패") : "서버에 연결할 수 없습니다.");
    setBusy(false);
  }
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-200/40" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-200/30" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[760px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(46,242,196,0.10),transparent_60%)]" />
      <main className="relative w-full max-w-[400px] rounded-2xl border border-line bg-surface/95 p-7 shadow-2xl backdrop-blur sm:p-8">
        <div className="flex items-center gap-3">
          <span className="relative flex h-11 w-11 items-center justify-center rounded-full border border-sky-200 bg-sky-50">
            <Radar className="h-5 w-5 text-brand" />
            <span className="absolute inset-0 animate-ping rounded-full border border-sky-200 opacity-40 motion-reduce:hidden" />
          </span>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold tracking-[0.2em] text-sky-700">HYUNDAI MOVEX</div>
            <h1 className="text-glow text-xl font-bold text-slate-950">Global Opportunity Radar</h1>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-slate-500">글로벌 물류자동화 수주기회 · 주간 업계동향 공유 사이트입니다. 전달받은 접속 비밀번호를 입력하세요.</p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <label htmlFor="pw" className="block text-[13px] font-medium text-slate-700">접속 비밀번호</label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input id="pw" type={show ? "text" : "password"} autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus required
              className="h-12 w-full rounded-xl border border-slate-300 bg-surface-2 pl-10 pr-11 text-[15px] text-slate-950 outline-none placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-sky-200" placeholder="비밀번호" />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:text-slate-700">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {err && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
          <button type="submit" disabled={busy || !pw} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-[15px] font-semibold text-brand-ink transition-opacity disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}로그인
          </button>
        </form>
        <p className="mt-5 text-xs leading-relaxed text-slate-400">내부 공유용 사이트입니다. 비밀번호를 외부에 공유하지 마세요. 공유용 계정은 조회만 가능합니다.</p>
      </main>
    </div>
  );
}
