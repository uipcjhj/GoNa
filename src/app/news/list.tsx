"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Card, Input, Select, Badge } from "@/components/ui";
import { CategoryBadge, ModeBadge, SourceTypeBadge, VerifyBadge, AccessBadge } from "@/components/badges";
import { SourceLink } from "@/components/source-link";
import { Feedback } from "@/components/feedback";
import type { ArticleStatus, SourceType, Verification } from "@/lib/types";
import { fmtDate } from "@/lib/utils";

export interface NewsItem {
  id: string; url: string; title: string; sourceName: string; sourceType: SourceType; publishedAt: string | null; discoveredAt: string;
  isDemo: boolean; status: ArticleStatus; statusNote: string | null; verification: Verification; competitors: string[]; feedback: "useful" | "not_useful" | null;
  category: string; country: string; industry: string; summary: string[]; excerpt: string | null; score: number | null; mode: "ai" | "rules" | "demo" | null;
  opportunityId: string | null; oppName: string | null;
}

const PAGE = 60;

export function NewsList({ items, readOnly = false }: { items: NewsItem[]; readOnly?: boolean }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [country, setCountry] = useState("");
  const [industry, setIndustry] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const countries = useMemo(() => [...new Set(items.map((i) => i.country).filter((c) => c && c !== "Unknown"))].sort(), [items]);
  const industries = useMemo(() => [...new Set(items.map((i) => i.industry).filter((c) => c && c !== "Unknown"))].sort(), [items]);
  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    return items.filter((i) =>
      (showAll || (i.status === "analyzed" && i.category !== "irrelevant")) &&
      (!cat || i.category === cat || (cat === "competitor" && i.competitors.length > 0)) &&
      (!country || i.country === country) && (!industry || i.industry === industry) &&
      (!ql || `${i.title} ${i.sourceName} ${i.summary.join(" ")}`.toLowerCase().includes(ql)));
  }, [items, q, cat, country, industry, showAll]);
  const counts = { total: items.length, analyzed: items.filter((i) => i.status === "analyzed").length, queued: items.filter((i) => i.status === "queued").length };

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <div className="relative min-w-56 flex-1"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><Input className="pl-8" placeholder="제목, 매체, 요약 검색" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">전체 카테고리</option><option value="opportunity">수주기회</option><option value="competitor">경쟁사</option><option value="industry">업계동향</option><option value="irrelevant">관련성 낮음</option><option value="pending">분석 대기</option></Select>
        <Select value={country} onChange={(e) => setCountry(e.target.value)}><option value="">전체 국가</option>{countries.map((c) => <option key={c}>{c}</option>)}</Select>
        <Select value={industry} onChange={(e) => setIndustry(e.target.value)}><option value="">전체 산업</option>{industries.map((c) => <option key={c}>{c}</option>)}</Select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />필터·중복·대기 기사 포함</label>
      </div>
      <div className="px-4 py-2 text-xs text-slate-500">표시 {filtered.length}건 · 전체 수집 {counts.total} · 분석 완료 {counts.analyzed} · 분석 대기 {counts.queued}</div>
      <div className="divide-y divide-slate-100">
        {filtered.slice(0, limit).map((i) => (
          <article key={i.id} className="flex gap-3 px-4 py-3">
            <div className="w-20 shrink-0 text-xs text-slate-500 tabular">{fmtDate(i.publishedAt)}</div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <CategoryBadge c={i.category} />
                {i.competitors.map((c) => <Badge key={c} tone="blue">{c}</Badge>)}
                {i.score != null && i.category === "opportunity" && <Badge tone={i.score >= 80 ? "red" : i.score >= 60 ? "amber" : "slate"}>Score {i.score}</Badge>}
                {i.mode && <ModeBadge mode={i.mode} />}
                {i.status !== "analyzed" && <Badge>{i.status === "queued" ? "분석 대기" : i.status === "duplicate" ? "중복" : i.status === "filtered" ? "필터 제외" : "오류"}</Badge>}
              </div>
              <SourceLink a={i} className="mt-1 block font-medium text-slate-900">{i.title}</SourceLink>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                <span>{i.sourceName}</span><SourceTypeBadge t={i.sourceType} /><VerifyBadge status={i.verification.status} demo={i.isDemo} />{i.verification.access !== "unknown" && <AccessBadge access={i.verification.access} />}
                {i.country !== "Unknown" && <span>· {i.country}</span>}{i.industry !== "Unknown" && <span>· {i.industry}</span>}
              </div>
              {i.summary.length > 0 ? (
                <ul className="mt-1.5 list-disc pl-5 text-sm text-slate-600">{i.summary.slice(0, 4).map((s, k) => <li key={k}>{s}</li>)}</ul>
              ) : i.excerpt ? <p className="mt-1 line-clamp-2 text-sm text-slate-500">{i.excerpt}</p> : null}
              {i.statusNote && <div className="mt-1 text-[11px] text-slate-400">{i.statusNote}</div>}
              {i.opportunityId && <Link href={`/opportunities/${i.opportunityId}`} className="mt-1 inline-block text-xs font-medium text-orange-700 hover:underline">→ 연결된 수주기회: {i.oppName}</Link>}
            </div>
            {!readOnly && <Feedback id={i.id} initial={i.feedback} />}
          </article>
        ))}
        {!filtered.length && <div className="py-10 text-center text-sm text-slate-400">표시할 뉴스가 없습니다.</div>}
      </div>
      {filtered.length > limit && <button onClick={() => setLimit(limit + PAGE)} className="w-full border-t border-slate-100 py-3 text-sm text-sky-700 hover:bg-slate-50">더 보기 ({filtered.length - limit}건 남음)</button>}
    </Card>
  );
}
