import { ExternalLink } from "lucide-react";
import type { Article } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Opens the real original article in a new tab. Demo items have no real source and are not clickable. */
export function SourceLink({ a, className, children, button }: { a: Pick<Article, "url" | "isDemo">; className?: string; children?: React.ReactNode; button?: boolean }) {
  if (a.isDemo)
    return (
      <span className={cn(button ? "inline-flex h-8 items-center gap-1 rounded-lg bg-slate-100 px-3 text-xs text-slate-400" : "", className)} title="데모 데이터 — 원문 없음">
        {children ?? "View Source"} {button && "(DEMO)"}
      </span>
    );
  return (
    <a href={a.url} target="_blank" rel="noopener noreferrer" className={cn(button ? "inline-flex h-8 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50" : "hover:text-sky-700 hover:underline", className)}>
      {children ?? "View Source"}
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}
