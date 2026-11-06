import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { JobControl } from "@/components/job-control";
import { systemStatus } from "@/lib/status";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Global Opportunity Radar — HYUNDAI MOVEX",
  description: "글로벌 물류자동화 수주기회 탐지 시스템",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const status = systemStatus();
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        <div className="flex min-h-screen">
          <Sidebar status={status} />
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:px-6">
              <div className="min-w-0 text-xs text-slate-500">
                <span className="font-semibold text-slate-800">Global Opportunity Radar</span>
                <span className="mx-2 hidden sm:inline">·</span>
                <span className="hidden sm:inline">HYUNDAI MOVEX 글로벌 물류자동화 수주기회 탐지</span>
              </div>
              <JobControl aiConnected={status.ai} />
            </header>
            <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
