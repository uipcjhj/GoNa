"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Target, Newspaper, Swords, FileSpreadsheet, Settings, History, Radar, Menu, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { SystemStatus } from "@/lib/status";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/opportunities", label: "Opportunities", icon: Target },
  { href: "/news", label: "News Feed", icon: Newspaper },
  { href: "/competitors", label: "Competitor Watch", icon: Swords },
  { href: "/report", label: "Weekly Report", icon: FileSpreadsheet },
  { href: "/runs", label: "실행 기록", icon: History },
  { href: "/settings", label: "Settings", icon: Settings },
];

function Dot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  return <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", ok ? (warn ? "bg-amber-400" : "bg-emerald-400") : "bg-slate-500")} />;
}

export function Sidebar({ status }: { status: SystemStatus }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const items = (
    <nav className="space-y-0.5 px-3">
      {NAV.map((n) => {
        const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors", active ? "bg-white/10 font-semibold text-white" : "text-slate-300 hover:bg-white/5 hover:text-white")}>
            <n.icon className="h-4 w-4" />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
  const statusBox = (
    <div className="mx-3 mt-6 space-y-1.5 rounded-lg bg-white/5 p-3 text-[11px] text-slate-300">
      <div className="mb-1 font-semibold uppercase tracking-wide text-slate-400">연결 상태</div>
      <div className="flex items-center gap-2"><Dot ok /> 뉴스: GDELT (키 불필요){status.gnews ? " + GNews" : ""}</div>
      <div className="flex items-center gap-2"><Dot ok={status.ai} /> AI: {status.ai ? status.aiModel : "미연결 (규칙 기반)"}</div>
      <div className="flex items-center gap-2"><Dot ok warn={status.storage !== "supabase"} /> DB: {status.storage === "supabase" ? "Supabase" : status.storage === "local" ? "로컬 파일 (개발용)" : "임시 저장소 (Supabase 미연결)"}</div>
      <div className="flex items-center gap-2"><Dot ok={status.cron} /> 자동 수집: {status.cron ? "스케줄러 연결" : "미연결 (CRON_SECRET)"}</div>
      <div className="flex items-center gap-2"><Dot ok={status.auth} warn={!status.auth} /> 접근 제어: {status.auth ? "비밀번호 보호" : "꺼짐"}</div>
    </div>
  );
  return (
    <>
      <button className="fixed bottom-4 left-4 z-40 rounded-full bg-brand p-3 text-white shadow-lg lg:hidden" onClick={() => setOpen(!open)} aria-label="메뉴">
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      <aside className={cn("fixed inset-y-0 left-0 z-30 w-60 shrink-0 bg-brand pb-6 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-14 items-center gap-2 px-5 text-white">
          <Radar className="h-5 w-5 text-sky-300" />
          <div className="leading-tight">
            <div className="text-sm font-bold">Opportunity Radar</div>
            <div className="text-[10px] tracking-widest text-slate-400">HYUNDAI MOVEX</div>
          </div>
        </div>
        <div className="mt-2">{items}</div>
        {statusBox}
      </aside>
    </>
  );
}
