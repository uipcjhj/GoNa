import Link from "next/link";
import { notFound } from "next/navigation";
import { getArticles, getOpportunity, getSettings } from "@/lib/db/repo";
import { ensureInitialized } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@/components/ui";
import { AccessBadge, ModeBadge, PriorityBadge, ScorePill, SourceTypeBadge, VerifyBadge } from "@/components/badges";
import { SourceLink } from "@/components/source-link";
import { RulesNotice } from "@/components/rules-notice";
import { SCORE_CRITERIA } from "@/lib/config/defaults";
import { fmtDate } from "@/lib/utils";
import { ArrowLeft, AlertTriangle, Info, Lightbulb, FileCheck2 } from "lucide-react";

export const dynamic = "force-dynamic";

const HIST: Record<string, string> = { announcement: "최초 발표", follow_up_investment: "후속 투자", groundbreaking: "착공", equipment_procurement: "설비 발주", tender: "입찰 공고", completion: "완공/가동", update: "업데이트" };

export default async function OpportunityDetail({ params }: PageProps<"/opportunities/[id]">) {
  await ensureInitialized();
  const { id } = await params;
  const o = await getOpportunity(id);
  if (!o) notFound();
  const [articles, settings] = await Promise.all([getArticles(o.articleIds), getSettings()]);
  articles.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  const totalW = SCORE_CRITERIA.reduce((s, c) => s + settings.weights[c.key], 0) || 100;
  const primary = articles.find((a) => a.id === o.primaryArticleId) ?? articles[0];

  const overview: [string, string][] = [
    ["기업", o.company], ["프로젝트", o.projectName], ["국가 / 도시", `${o.country}${o.city !== "Unknown" ? ` / ${o.city}` : ""}`], ["지역", o.region],
    ["산업", o.industry], ["시설 유형", o.facilityType], ["투자 신호", o.signalType], ["투자 규모", o.investmentAmount],
    ["진행 단계", o.projectStage], ["예상 일정", o.expectedTimeline], ["사건·발표일", o.eventDate ?? "확인되지 않음"], ["최근 기사 발행일", fmtDate(o.latestPublishedAt)],
  ];

  return (
    <div className="space-y-4">
      <Link href="/opportunities" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" />수주기회 목록</Link>
      {o.isDemo && <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-800"><b>DEMO</b> — 화면 확인용 가상 데이터입니다. 실제 기업·기사가 아닙니다.</div>}

      <div className="flex flex-wrap items-start gap-4">
        <ScorePill score={o.score} className="h-14 w-16 text-2xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><PriorityBadge p={o.priority} /><ModeBadge mode={o.analysisMode} />{o.competitorsInvolved.map((c) => <Badge key={c} tone="blue">경쟁사 관련: {c}</Badge>)}</div>
          <h1 className="mt-1 text-xl font-bold text-slate-900">{o.company} — {o.projectName}</h1>
          <p className="text-sm text-slate-500">{o.country} · {o.industry} · 근거 기사 {articles.length}건 (검증 {o.verifiedSourceCount}건)</p>
        </div>
        {primary && <SourceLink a={primary} button>대표 원문 보기</SourceLink>}
      </div>

      {o.analysisMode === "rules" && <RulesNotice />}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>프로젝트 개요</CardTitle><span className="text-[11px] text-slate-400">원문에 없는 정보는 Unknown / Not Disclosed로 표시</span></CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {overview.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] font-semibold tracking-wide text-slate-400">{k}</dt>
                  <dd className={`text-sm ${/^(unknown|not disclosed|확인되지 않음)$/i.test(v) ? "text-slate-400 italic" : "text-slate-800"}`}>{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 rounded-lg bg-slate-50 p-4">
              <div className="mb-1 text-xs font-semibold text-slate-500">AI 요약</div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{o.summaryKo.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>점수 세부 근거</CardTitle><span className="text-[11px] text-slate-400">가중치 반영</span></CardHeader>
          <CardContent className="space-y-3">
            {SCORE_CRITERIA.map((c) => {
              const item = o.scoreBreakdown[c.key];
              const pts = ((item.score / c.max) * settings.weights[c.key] * 100) / totalW;
              const maxPts = (settings.weights[c.key] * 100) / totalW;
              return (
                <div key={c.key}>
                  <div className="flex justify-between text-xs"><span className="font-medium text-slate-700">{c.labelKo}</span><span className="tabular text-slate-500">{pts.toFixed(1)} / {maxPts.toFixed(0)}</span></div>
                  <div className="mt-1 h-1.5 rounded bg-slate-100"><div className="h-full rounded bg-sky-600" style={{ width: `${(100 * item.score) / c.max}%` }} /></div>
                  <div className="mt-1 text-[11px] leading-snug text-slate-500">{item.reason}</div>
                </div>
              );
            })}
            {o.penalties.length > 0 && (
              <div className="rounded-lg border border-red-100 bg-red-50 p-3">
                <div className="mb-1 text-xs font-semibold text-red-700">감점 항목</div>
                {o.penalties.map((p) => <div key={p.code} className="flex justify-between text-xs text-red-700"><span>{p.label}</span><span>−{p.points}</span></div>)}
              </div>
            )}
            <p className="flex gap-1 text-[11px] text-slate-400"><Info className="mt-0.5 h-3 w-3 shrink-0" />점수는 실제 수주 확률이 아니라 영업기회 탐색을 위한 우선순위 지표입니다.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>AI 수주기회 분석</CardTitle><span className="text-[11px] text-slate-400">AI 추론과 기사 사실을 구분하여 표시</span></CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-slate-500"><Lightbulb className="h-3.5 w-3.5" />현대무벡스 관점의 의미</div>
              <p className="text-sm text-slate-800">{o.whyItMatters}</p>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-500">검토 가능한 현대무벡스 솔루션 <span className="font-normal text-slate-400">(검토 가능 솔루션 — 공급 확정 아님)</span></div>
              <div className="space-y-1.5">{o.solutions.map((s) => <div key={s.solution} className="text-sm"><Badge tone="blue">{s.solution}</Badge> <span className="text-slate-600">{s.reason}</span></div>)}{!o.solutions.length && <span className="text-sm text-slate-400">해당 없음</span>}</div>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-slate-500">예상 자동화 수요 <span className="font-normal text-slate-400">(추론)</span></div>
              <ul className="list-disc pl-5 text-sm text-slate-700">{o.automationNeeds.map((n) => <li key={n}>{n}</li>)}</ul>
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-emerald-700"><FileCheck2 className="h-3.5 w-3.5" />기사에 명시된 사실</div>
              <ul className="list-disc pl-5 text-sm text-slate-700">{o.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-sky-700">AI 추론 (원문에 명시되지 않음)</div>
              <ul className="list-disc pl-5 text-sm text-slate-600">{o.inferences.map((f, i) => <li key={i}>{f}</li>)}{!o.inferences.length && <li className="text-slate-400">없음</li>}</ul>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-amber-800"><AlertTriangle className="h-3.5 w-3.5" />주요 불확실성 및 추가 확인사항</div>
              <ul className="list-disc pl-5 text-sm text-amber-900">{o.uncertainties.map((f, i) => <li key={i}>{f}</li>)}</ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>근거 기사</CardTitle><span className="text-[11px] text-slate-400">모든 링크는 실제 수집된 원문 URL입니다 (새 탭)</span></CardHeader>
        <div className="divide-y divide-slate-100">
          {articles.map((a) => (
            <div key={a.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <SourceLink a={a} className="font-medium text-slate-900">{a.title}</SourceLink>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">{a.sourceName}</span>
                  <SourceTypeBadge t={a.sourceType} />
                  <VerifyBadge status={a.verification.status} demo={a.isDemo} />
                  <AccessBadge access={a.verification.access} />
                </div>
                <div className="mt-1 grid gap-x-4 text-[11px] text-slate-500 sm:grid-cols-2">
                  <span>발행일: <b className="text-slate-700">{fmtDate(a.publishedAt)}</b> <span className="text-slate-400">({a.publishedAtBasis})</span></span>
                  <span>사건/투자 발표일: <b className="text-slate-700">{a.analysis?.eventDate ?? "확인되지 않음"}</b>{a.analysis?.eventDate && a.publishedAt && a.analysis.flags.reReport && <Badge tone="amber" className="ml-1">과거 발표 재보도</Badge>}</span>
                  {!a.isDemo && <span className="truncate">URL: {a.url}</span>}
                  {a.verification.note && <span>검증: {a.verification.note}{a.verification.httpStatus ? ` · HTTP ${a.verification.httpStatus}` : ""}</span>}
                </div>
              </div>
              <SourceLink a={a} button />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader><CardTitle>프로젝트 이력</CardTitle><span className="text-[11px] text-slate-400">확인된 이력만 표시</span></CardHeader>
        <CardContent>
          <ol className="relative border-l border-slate-200 pl-5">
            {o.history.map((h) => (
              <li key={h.articleId} className="mb-4 last:mb-0">
                <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-sky-600" />
                <div className="flex flex-wrap items-center gap-2 text-xs"><b className="tabular text-slate-700">{h.date ?? "날짜 미확인"}</b><Badge tone={h.type === "completion" ? "red" : h.type === "tender" || h.type === "equipment_procurement" ? "violet" : "blue"}>{HIST[h.type] ?? h.type}</Badge></div>
                <div className="text-sm text-slate-800">{h.title}</div>
                <div className="text-[11px] text-slate-400">{h.note}</div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
