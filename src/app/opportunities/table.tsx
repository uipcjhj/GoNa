"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { Card, Input, Select, Td, Th, Badge, Button } from "@/components/ui";
import { PriorityBadge, ScorePill, ModeBadge } from "@/components/badges";
import { PROJECT_STAGES } from "@/lib/config/defaults";
import type { Opportunity } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

export type OppRow = Opportunity & { verifiedOnlyOk: boolean; primaryTitle: string };
type SortKey = "score" | "company" | "country" | "latestPublishedAt" | "industry";

const uniq = (arr: string[]) => [...new Set(arr.filter((x) => x && x !== "Unknown"))].sort();

export function OpportunityTable({ rows, initial }: { rows: OppRow[]; initial: { country: string; priority: string } }) {
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");
  const [country, setCountry] = useState(initial.country);
  const [industry, setIndustry] = useState("");
  const [signal, setSignal] = useState("");
  const [stage, setStage] = useState("");
  const [priority, setPriority] = useState(initial.priority);
  const [minScore, setMinScore] = useState(0);
  const [days, setDays] = useState(0);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [now] = useState(() => Date.now());
  const [sort, setSort] = useState<{ k: SortKey; asc: boolean }>({ k: "score", asc: false });

  const opts = useMemo(() => ({
    regions: uniq(rows.map((r) => r.region)),
    countries: uniq(rows.filter((r) => !region || r.region === region).map((r) => r.country)),
    industries: uniq(rows.map((r) => r.industry)),
    signals: uniq(rows.map((r) => r.signalType)),
  }), [rows, region]);

  const filtered = useMemo(() => {
    const since = days ? new Date(now - days * 86400_000).toISOString() : "";
    const ql = q.trim().toLowerCase();
    const out = rows.filter((r) =>
      (!region || r.region === region) &&
      (!country || r.country === country) &&
      (!industry || r.industry === industry) &&
      (!signal || r.signalType === signal) &&
      (!stage || r.projectStage === stage) &&
      (!priority || r.priority === priority) &&
      r.score >= minScore &&
      (!since || (r.latestPublishedAt ?? "") >= since) &&
      (!verifiedOnly || r.verifiedOnlyOk) &&
      (!ql || [r.company, r.projectName, r.country, r.city, r.industry, r.facilityType, r.primaryTitle, ...r.solutions.map((s) => s.solution)].join(" ").toLowerCase().includes(ql)),
    );
    out.sort((a, b) => {
      const av = (a[sort.k] ?? "") as string | number;
      const bv = (b[sort.k] ?? "") as string | number;
      const c = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.asc ? c : -c;
    });
    return out;
  }, [rows, q, region, country, industry, signal, stage, priority, minScore, days, verifiedOnly, sort, now]);

  const sortBtn = (k: SortKey, children: React.ReactNode) => (
    <button className="inline-flex items-center gap-0.5 uppercase" onClick={() => setSort((s) => ({ k, asc: s.k === k ? !s.asc : k !== "score" && k !== "latestPublishedAt" }))}>
      {children}
      {sort.k === k && (sort.asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
    </button>
  );

  const reset = () => { setQ(""); setRegion(""); setCountry(""); setIndustry(""); setSignal(""); setStage(""); setPriority(""); setMinScore(0); setDays(0); setVerifiedOnly(false); };

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input className="pl-8" placeholder="기업, 프로젝트, 국가, 솔루션 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={region} onChange={(e) => { setRegion(e.target.value); setCountry(""); }}><option value="">전체 Region</option>{opts.regions.map((x) => <option key={x}>{x}</option>)}</Select>
        <Select value={country} onChange={(e) => setCountry(e.target.value)}><option value="">전체 Country</option>{opts.countries.map((x) => <option key={x}>{x}</option>)}</Select>
        <Select value={industry} onChange={(e) => setIndustry(e.target.value)}><option value="">전체 Industry</option>{opts.industries.map((x) => <option key={x}>{x}</option>)}</Select>
        <Select value={signal} onChange={(e) => setSignal(e.target.value)}><option value="">전체 Signal</option>{opts.signals.map((x) => <option key={x}>{x}</option>)}</Select>
        <Select value={stage} onChange={(e) => setStage(e.target.value)}><option value="">전체 Stage</option>{PROJECT_STAGES.map((x) => <option key={x}>{x}</option>)}</Select>
        <Select value={priority} onChange={(e) => setPriority(e.target.value)}><option value="">전체 우선순위</option><option>HOT</option><option>WATCH</option><option>GENERAL</option></Select>
        <Select value={minScore} onChange={(e) => setMinScore(Number(e.target.value))}>{[0, 40, 60, 80].map((x) => <option key={x} value={x}>{x ? `Score ≥ ${x}` : "전체 Score"}</option>)}</Select>
        <Select value={days} onChange={(e) => setDays(Number(e.target.value))}>{[[0, "전체 기간"], [7, "최근 7일"], [30, "최근 30일"], [90, "최근 90일"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} /> Verified Sources Only</label>
        <Button variant="ghost" size="sm" onClick={reset}>초기화</Button>
      </div>
      <div className="px-3 py-2 text-xs text-slate-500">{filtered.length}개 프로젝트</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px]">
          <thead>
            <tr>
              <Th>{sortBtn("score", "Score")}</Th>
              <Th>{sortBtn("company", "Company")}</Th>
              <Th>Project</Th>
              <Th>{sortBtn("country", "Country")}</Th>
              <Th>{sortBtn("industry", "Industry")}</Th>
              <Th>Signal Type</Th>
              <Th>Investment</Th>
              <Th>Potential Solutions</Th>
              <Th>Stage</Th>
              <Th>{sortBtn("latestPublishedAt", "Published")}</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td><div className="flex flex-col items-start gap-1"><ScorePill score={r.score} /><PriorityBadge p={r.priority} /></div></Td>
                <Td className="font-semibold text-slate-900"><Link href={`/opportunities/${r.id}`} className="hover:text-sky-700 hover:underline">{r.company}</Link>{r.isDemo && <Badge tone="violet" className="ml-1">DEMO</Badge>}</Td>
                <Td className="max-w-64"><Link href={`/opportunities/${r.id}`} className="hover:underline">{r.projectName}</Link><div className="mt-1 flex gap-1"><ModeBadge mode={r.analysisMode} /><span className="text-[11px] text-slate-400">근거 {r.articleIds.length}건 · 검증 {r.verifiedSourceCount}</span></div></Td>
                <Td>{r.country}{r.city !== "Unknown" && <div className="text-xs text-slate-500">{r.city}</div>}</Td>
                <Td className="text-xs">{r.industry}</Td>
                <Td className="text-xs">{r.signalType}</Td>
                <Td className="text-xs tabular">{r.investmentAmount}</Td>
                <Td className="max-w-56"><div className="flex flex-wrap gap-1">{r.solutions.slice(0, 4).map((s) => <Badge key={s.solution} tone="blue">{s.solution}</Badge>)}</div></Td>
                <Td className="text-xs">{r.projectStage}</Td>
                <Td className="whitespace-nowrap text-xs tabular">{fmtDate(r.latestPublishedAt)}</Td>
              </tr>
            ))}
            {!filtered.length && <tr><Td colSpan={10} className="py-10 text-center text-slate-400">조건에 맞는 프로젝트가 없습니다.</Td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
