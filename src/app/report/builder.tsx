"use client";
import { useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button, Card, CardHeader, CardTitle, Badge } from "@/components/ui";
import { ModeBadge, VerifyBadge } from "@/components/badges";
import { SourceLink } from "@/components/source-link";
import type { VerificationStatus } from "@/lib/types";
import { fmtDate, cn } from "@/lib/utils";

export interface ReportItem {
  id: string; url: string; title: string; sourceName: string; publishedAt: string | null; isDemo: boolean; category: string; competitors: string[];
  summary: string[]; score: number; whyItMatters: string; feedback: "useful" | "not_useful" | null; verified: VerificationStatus; opportunityId: string | null; mode: "ai" | "rules" | "demo";
}

const GROUPS: { key: string; title: string; tone: string }[] = [
  { key: "opportunity", title: "수주기회", tone: "border-l-orange-500" },
  { key: "competitor", title: "경쟁사 동향", tone: "border-l-sky-500" },
  { key: "industry", title: "업계 동향", tone: "border-l-slate-300" },
];

export function ReportBuilder({ items, periodLabel, fileLabel }: { items: ReportItem[]; periodLabel: string; fileLabel: string }) {
  const [sel, setSel] = useState<Set<string>>(() => new Set(items.filter((i) => i.feedback !== "not_useful" && (i.category !== "industry" || i.feedback === "useful")).map((i) => i.id)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const grouped = useMemo(() => GROUPS.map((g) => ({ ...g, items: items.filter((i) => i.category === g.key).sort((a, b) => b.score - a.score) })), [items]);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const setGroup = (ids: string[], on: boolean) => setSel((s) => { const n = new Set(s); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; });

  async function download() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/report/excel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [...sel], periodLabel, fileLabel }) });
      if (!r.ok) throw new Error((await r.json()).error ?? "다운로드 실패");
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Global_Opportunity_Radar_주간동향_${fileLabel}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-sm text-slate-600">
          기간 내 기사 <b>{items.length}</b>건 중 <b className="text-sky-700">{sel.size}</b>건 선택 · 컬럼: Category, Date, Title, Media, URL, Summary, Opportunity Score, Why It Matters (제목·URL 하이퍼링크)
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setSel(new Set(items.map((i) => i.id)))}>전체 선택</Button>
          <Button variant="outline" size="sm" onClick={() => setSel(new Set())}>선택 해제</Button>
          <Button onClick={download} disabled={!sel.size || busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Excel 다운로드</Button>
        </div>
        {err && <div className="w-full text-sm text-red-600">{err}</div>}
      </Card>
      {grouped.map((g) => (
        <Card key={g.key}>
          <CardHeader>
            <CardTitle>{g.title} <span className="ml-1 font-normal text-slate-400">{g.items.length}건</span></CardTitle>
            {g.items.length > 0 && (
              <div className="flex gap-2 text-xs">
                <button className="text-sky-700 hover:underline" onClick={() => setGroup(g.items.map((i) => i.id), true)}>모두 선택</button>
                <button className="text-slate-500 hover:underline" onClick={() => setGroup(g.items.map((i) => i.id), false)}>모두 해제</button>
              </div>
            )}
          </CardHeader>
          <div className="divide-y divide-slate-100">
            {g.items.map((i) => (
              <label key={i.id} className={cn("flex cursor-pointer gap-3 border-l-4 px-4 py-3 hover:bg-slate-50", g.tone, !sel.has(i.id) && "opacity-60")}>
                <input type="checkbox" className="mt-1" checked={sel.has(i.id)} onChange={() => toggle(i.id)} />
                <div className="w-20 shrink-0 text-xs text-slate-500 tabular">{fmtDate(i.publishedAt)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {i.category === "opportunity" && <Badge tone={i.score >= 80 ? "red" : i.score >= 60 ? "amber" : "slate"}>Score {i.score}</Badge>}
                    {i.competitors.map((c) => <Badge key={c} tone="blue">{c}</Badge>)}
                    <ModeBadge mode={i.mode} />
                    <VerifyBadge status={i.verified} demo={i.isDemo} />
                    {i.feedback === "useful" && <Badge tone="green">Useful</Badge>}
                    {i.feedback === "not_useful" && <Badge tone="red">Not Useful</Badge>}
                  </div>
                  <SourceLink a={i} className="mt-0.5 block font-medium text-slate-900">{i.title}</SourceLink>
                  <div className="text-xs text-slate-500">{i.sourceName}</div>
                  <ul className="mt-1 list-disc pl-5 text-sm text-slate-600">{i.summary.slice(0, 4).map((s, k) => <li key={k}>{s}</li>)}</ul>
                  {i.category === "opportunity" && <div className="mt-1 text-xs text-orange-800"><b>Why it matters:</b> {i.whyItMatters}</div>}
                </div>
              </label>
            ))}
            {!g.items.length && <div className="px-5 py-6 text-center text-sm text-slate-400">해당 기간 기사 없음</div>}
          </div>
        </Card>
      ))}
    </div>
  );
}
