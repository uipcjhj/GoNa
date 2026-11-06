"use client";
import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function Feedback({ id, initial }: { id: string; initial: "useful" | "not_useful" | null }) {
  const [v, setV] = useState(initial);
  async function set(next: "useful" | "not_useful") {
    const value = v === next ? null : next;
    setV(value);
    await fetch(`/api/articles/${id}/feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value }) });
  }
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => set("useful")} title="Useful" className={cn("rounded-md p-1.5 hover:bg-emerald-50", v === "useful" ? "bg-emerald-100 text-emerald-700" : "text-slate-400")}><ThumbsUp className="h-3.5 w-3.5" /></button>
      <button onClick={() => set("not_useful")} title="Not Useful" className={cn("rounded-md p-1.5 hover:bg-red-50", v === "not_useful" ? "bg-red-100 text-red-700" : "text-slate-400")}><ThumbsDown className="h-3.5 w-3.5" /></button>
    </div>
  );
}
