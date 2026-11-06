// shadcn/ui-style primitives (Tailwind) — Dark Navy + Neon Mint design system.
import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glow-card min-w-0 rounded-xl border border-line bg-surface/90", className)} {...p} />;
}
export function CardHeader({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5", className)} {...p} />;
}
export function CardTitle({ className, ...p }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-sm font-semibold tracking-tight text-slate-900", className)} {...p} />;
}
export function CardContent({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 sm:p-5", className)} {...p} />;
}

type Variant = "default" | "outline" | "ghost" | "danger" | "subtle";
export function Button({ className, variant = "default", size = "md", ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  const v: Record<Variant, string> = {
    default: "bg-brand text-brand-ink font-semibold hover:bg-brand-600 glow-mint",
    outline: "border border-slate-300 bg-surface-2 text-slate-800 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700",
    ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    danger: "bg-red-600 text-white hover:bg-red-500",
    subtle: "bg-slate-100 text-slate-700 hover:bg-slate-200",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200 disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm",
        v[variant],
        className,
      )}
      {...p}
    />
  );
}

export function Badge({ className, tone = "slate", ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: "slate" | "red" | "amber" | "green" | "blue" | "violet" | "orange" }) {
  const t = {
    slate: "bg-slate-100 text-slate-600 ring-slate-200",
    red: "bg-red-50 text-red-700 ring-red-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    blue: "bg-sky-50 text-sky-700 ring-sky-200",
    violet: "bg-violet-50 text-violet-700 ring-violet-200",
    orange: "bg-orange-50 text-orange-700 ring-orange-200",
  }[tone];
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset", t, className)} {...p} />;
}

const field = "rounded-lg border border-slate-300 bg-surface-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100";

export function Input({ className, ...p }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("h-9 w-full px-3", field, className)} {...p} />;
}

export function Select({ className, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn("h-9 max-w-full px-2", field, className)} {...p} />;
}

export function Textarea({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("w-full px-3 py-2", field, className)} {...p} />;
}

export function Th({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn("whitespace-nowrap border-b border-line bg-navy-900/80 px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-sky-700/90", className)} {...p} />;
}
export function Td({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("border-b border-line/70 px-3 py-2.5 align-top text-sm text-slate-800", className)} {...p} />;
}
