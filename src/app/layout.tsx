import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { MobileNav, Sidebar } from "@/components/sidebar";
import { JobControl } from "@/components/job-control";
import { systemStatus } from "@/lib/status";
import { currentRole } from "@/lib/session";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "기회 레이더 — HYUNDAI MOVEX 글로벌 수주기회 탐지",
  description: "글로벌 물류자동화 수주기회 탐지 및 주간 업계동향 시스템",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#050c18",
  colorScheme: "dark",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const status = systemStatus();
  const role = await currentRole();
  if (!role) {
    // not signed in (login screen): no navigation, no system status
    return (
      <html lang="ko" className={`${geistSans.variable} ${geistMono.variable}`}>
        <body className="antialiased">{children}</body>
      </html>
    );
  }
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        <div className="flex min-h-screen">
          <Sidebar status={status} role={role} />
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-30 border-b border-line bg-ink/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
              <div className="flex h-14 items-center justify-between gap-3 px-3 sm:px-4 lg:px-6">
                <MobileNav status={status} role={role} />
                <div className="hidden min-w-0 text-xs text-slate-500 lg:block">
                  <span className="font-semibold text-slate-900">글로벌 기회 레이더</span>
                  <span className="mx-2">·</span>
                  <span>현대무벡스 글로벌 물류자동화 수주기회 탐지</span>
                </div>
                {role === "admin" ? <JobControl aiConnected={status.ai} /> : <span className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">읽기 전용</span>}
              </div>
            </header>
            <main className="min-w-0 flex-1 p-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-4 lg:p-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
