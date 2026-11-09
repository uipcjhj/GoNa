"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LayoutDashboard, Target, Newspaper, Swords, FileSpreadsheet, Settings, History, Radar, Menu, X, CalendarRange, Eye, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SystemStatus } from "@/lib/status";

export const NAV = [
  { href: "/", label: "대시보드", desc: "수주기회 탐지 현황", icon: LayoutDashboard, viewer: true },
  { href: "/opportunities", label: "수주기회", desc: "프로젝트 목록·상세", icon: Target, viewer: true },
  { href: "/weekly", label: "주간 업계동향", desc: "주간 스크랩·보고서", icon: CalendarRange, viewer: true },
  { href: "/news", label: "뉴스 피드", desc: "수집 기사 전체", icon: Newspaper, viewer: true },
  { href: "/competitors", label: "경쟁사 동향", desc: "경쟁사 모니터링", icon: Swords, viewer: true },
  { href: "/report", label: "수주기회 Excel", desc: "간편 엑셀 출력", icon: FileSpreadsheet, viewer: false },
  { href: "/runs", label: "실행 기록", desc: "수집 작업 이력", icon: History, viewer: false },
  { href: "/settings", label: "설정", desc: "키워드·가중치·수집", icon: Settings, viewer: false },
];

export type NavRole = "admin" | "viewer";
const navFor = (role: NavRole) => NAV.filter((n) => role === "admin" || n.viewer);

/** Read-only badge + logout (shown when password protection is on). */
export function AccountBox({ role, auth }: { role: NavRole; auth: boolean }) {
  if (!auth) return null;
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.replace("/login");
  }
  return (
    <div className="space-y-2 rounded-lg border border-line bg-navy-900/70 p-3 text-xs text-slate-600">
      {role === "viewer" ? (
        <div className="flex items-start gap-2"><Eye className="mt-0.5 h-4 w-4 shrink-0 text-brand" /><span><b className="text-slate-900">읽기 전용 공유 모드</b><br />조회만 가능합니다. 수집·분석·편집 기능은 관리자만 사용할 수 있습니다.</span></div>
      ) : (
        <div className="text-slate-500">관리자로 로그인됨</div>
      )}
      <button type="button" onClick={logout} className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900"><LogOut className="h-3.5 w-3.5" /> 로그아웃</button>
    </div>
  );
}

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

function Dot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  return <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", ok ? (warn ? "bg-amber-400" : "bg-brand shadow-[0_0_6px_#2ef2c4]") : "bg-slate-400")} />;
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative flex h-8 w-8 items-center justify-center rounded-full border border-sky-200 bg-sky-50">
        <Radar className="h-4 w-4 text-brand" />
        <span className="absolute inset-0 animate-ping rounded-full border border-sky-200 opacity-40 motion-reduce:hidden" />
      </span>
      <div className="leading-tight">
        <div className="text-sm font-bold text-slate-900">기회 레이더</div>
        <div className="text-[10px] tracking-[0.2em] text-sky-700/80">HYUNDAI MOVEX</div>
      </div>
    </div>
  );
}

function StatusBox({ status }: { status: SystemStatus }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-line bg-navy-900/70 p-3 text-[11px] text-slate-600">
      <div className="mb-1 font-semibold tracking-wide text-slate-500">연결 상태</div>
      <div className="flex items-center gap-2"><Dot ok /> 뉴스 수집: 무료 소스 연결{status.gnews ? " + GNews" : ""}</div>
      <div className="flex items-center gap-2"><Dot ok={status.ai} /> AI 분석: {status.ai ? status.aiModel : "미연결 (규칙 기반)"}</div>
      <div className="flex items-center gap-2"><Dot ok warn={status.storage !== "supabase"} /> DB: {status.storage === "supabase" ? "Supabase" : status.storage === "local" ? "로컬 파일 (개발용)" : "임시 저장소"}</div>
      <div className="flex items-center gap-2"><Dot ok={status.cron} /> 자동 수집: {status.cron ? "스케줄러 연결" : "미연결"}</div>
      <div className="flex items-center gap-2"><Dot ok={status.auth} warn={!status.auth} /> 접근 제어: {status.auth ? "비밀번호 보호" : "꺼짐"}</div>
    </div>
  );
}

function NavList({ onNavigate, large, role }: { onNavigate?: () => void; large?: boolean; role: NavRole }) {
  const path = usePathname();
  return (
    <nav className="space-y-1" aria-label="주 메뉴">
      {navFor(role).map((n) => {
        const active = isActive(path, n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-lg border px-3 transition-colors",
              large ? "py-3 text-base" : "py-2 text-sm",
              active ? "border-sky-200 bg-sky-50 font-semibold text-sky-700" : "border-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            <n.icon className={cn("shrink-0", large ? "h-5 w-5" : "h-4 w-4", active ? "text-brand" : "text-slate-400 group-hover:text-sky-600")} />
            <span className="flex-1">
              {n.label}
              {large && <span className="block text-xs font-normal text-slate-400">{n.desc}</span>}
            </span>
            {active && <span className="h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_8px_#2ef2c4]" />}
          </Link>
        );
      })}
    </nav>
  );
}

/** Desktop sidebar (≥ lg). */
export function Sidebar({ status, role }: { status: SystemStatus; role: NavRole }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r border-line bg-navy-950/90 px-3 pb-6 lg:flex">
      <div className="flex h-14 items-center px-2"><Brand /></div>
      <NavList role={role} />
      <div className="mt-auto space-y-3">{role === "admin" && <StatusBox status={status} />}<AccountBox role={role} auth={status.auth} /></div>
    </aside>
  );
}

/** Mobile/tablet hamburger (< lg): button in the top header + full-height drawer. */
export function MobileNav({ status, role }: { status: SystemStatus; role: NavRole }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const current = NAV.find((n) => isActive(path, n.href));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="flex min-w-0 items-center gap-2 lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="메뉴 열기"
        aria-expanded={open}
        aria-controls="mobile-menu"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-brand"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="min-w-0 truncate text-sm font-semibold text-slate-900">{current?.label ?? "기회 레이더"}</div>

      {open && typeof document !== "undefined" && createPortal(
        <div id="mobile-menu" role="dialog" aria-modal="true" aria-label="메뉴" className="fixed inset-0 z-50">
          <button aria-label="메뉴 닫기" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-xs flex-col gap-5 overflow-y-auto border-r border-line bg-navy-950 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] shadow-2xl">
            <div className="flex h-12 items-center justify-between">
              <Brand />
              <button onClick={() => setOpen(false)} aria-label="메뉴 닫기" className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavList large role={role} onNavigate={() => setOpen(false)} />
            <div className="mt-auto space-y-3">{role === "admin" && <StatusBox status={status} />}<AccountBox role={role} auth={status.auth} /></div>
          </div>
        </div>,
        document.body, // rendered at the root: the blurred sticky header would otherwise clip a fixed overlay
      )}
    </div>
  );
}
