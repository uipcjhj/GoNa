"use client";
// Shared building blocks for the 주간 업계동향 screens (cards, table detail panel, editor).
import { createContext, useContext, useState } from "react";
import { Check, ExternalLink, PauseCircle, CircleSlash, Loader2, Link2 } from "lucide-react";
import { RELEVANCE_CRITERIA } from "@/lib/weekly/categories";
import { LEVEL_LABEL, ORDER_ROOM_LABEL, SUPPLIER_LABEL } from "@/lib/weekly/taxonomy";
import type { WeeklyRow } from "@/lib/weekly/view";
import type { ReportStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export type PeriodQuery = Record<string, string>;
/** true for the shared read-only viewer: every write control is hidden (and blocked server-side). */
export const ReadOnlyContext = createContext(false);
export const useReadOnly = () => useContext(ReadOnlyContext);
export const STATUS_LABEL: Record<ReportStatus, string> = { unreviewed: "미검토", selected: "선정", excluded: "제외", hold: "보류" };

export async function postJson(url: string, body: object) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? `요청 실패 (HTTP ${r.status})`);
  return d;
}

/** 수주기회 / 경쟁사 markers (max 1 each) — mint for opportunity, neutral for competitor. */
export function isOpportunity(r: WeeklyRow) {
  return r.detail?.group !== "competitor" && (r.judgment?.winPotential === "high" || r.oppPriority === "HOT" || r.oppPriority === "WATCH");
}

export function CategoryText({ r, className }: { r: WeeklyRow; className?: string }) {
  const label = r.edits?.detailLabel || r.detail?.label || "확인 필요";
  const review = label === "확인 필요";
  return <span className={cn("text-[13px] font-medium", review ? "text-amber-700" : "text-slate-500", className)}>{label}</span>;
}

const AI_BADGE: Record<WeeklyRow["aiStatus"], { label: string; cls: string }> = {
  done: { label: "원문 검증 완료", cls: "bg-sky-50 text-sky-700" },
  needs_review: { label: "사용자 검토 필요", cls: "bg-amber-50 text-amber-700" },
  insufficient_source: { label: "원문 부족", cls: "bg-amber-50 text-amber-700" },
  failed: { label: "AI 분석 실패", cls: "bg-red-50 text-red-700" },
  none: { label: "AI 분석 필요", cls: "bg-slate-100 text-slate-500" },
  outdated: { label: "재분석 필요", cls: "bg-slate-100 text-slate-500" },
};
const TYPE_BADGE = { opportunity: "잠재 수주기회", competitor: "경쟁사 모니터링", trend: "기술·시장동향", exclude: "제외 후보" } as const;

export function Markers({ r }: { r: WeeklyRow }) {
  const ai = AI_BADGE[r.aiStatus];
  const type = r.ai && r.ai.reportType ? r.ai.reportType : null;
  return (
    <>
      {type ? (
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", type === "opportunity" ? "bg-sky-100 text-sky-700" : type === "exclude" ? "bg-slate-100 text-slate-500" : "bg-slate-100 text-slate-600")}>{TYPE_BADGE[type]}</span>
      ) : (
        <>
          {isOpportunity(r) && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">수주기회</span>}
          {r.detail?.group === "competitor" && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">경쟁사</span>}
        </>
      )}
      {!r.isDemo && r.analysis !== "pending" && <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", ai.cls)}>{ai.label}</span>}
      {r.detailBasis === "rules" && r.detail && <span className="text-xs text-slate-400">예비 분류</span>}
      {r.approvedAt && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">승인됨</span>}
    </>
  );
}

const SOURCE_LEVEL = { body: "기사 본문", excerpt: "제목·발췌문만 (본문 미확보)", title: "제목만" } as const;
const PURPOSE = { facility_capex: "시설 투자비", funding_round: "투자유치(펀딩)", acquisition: "인수 금액", total_program: "전체 투자계획", other: "기타", none: "—" } as Record<string, string>;
const STAGE = { planned: "계획", approved: "승인", under_construction: "착공·건설 중", completed_operating: "준공·가동", organisation: "조직 신설", announcement: "발표", other: "기타" } as Record<string, string>;
const FACILITY = { production_plant: "생산공장", warehouse_dc: "물류센터·창고", rnd_center: "연구소·기술센터", office_org: "조직·법인·사무소", product: "제품·광고", policy: "정책", other: "기타", none: "—" } as Record<string, string>;

function Quote({ q }: { q: string }) {
  return q ? <q className="mt-0.5 block text-xs italic leading-snug text-slate-500">{q}</q> : <span className="mt-0.5 block text-xs text-slate-400">원문 근거 구절 없음</span>;
}

/** Gemini facts with the verbatim source quote behind each one. */
export function AiEvidence({ r, onRefresh }: { r: WeeklyRow; onRefresh: () => void }) {
  const a = r.ai;
  const readOnly = useReadOnly();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  async function run(kind: "reanalyze" | "approve" | "unapprove") {
    setBusy(kind);
    setMsg(null);
    try {
      if (kind === "reanalyze") {
        const d = await postJson("/api/weekly/reanalyze", { articleId: r.id });
        setMsg(`재분석 결과: ${d.status === "done" ? "원문 검증 완료" : d.status === "needs_review" ? "검토 필요" : d.status === "insufficient_source" ? "원문 부족" : `실패 — ${d.error ?? ""}`}`);
      } else await postJson("/api/weekly/item", { ...periodOf(), articleId: r.id, approved: kind === "approve" });
      onRefresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-slate-900">Gemini 원문 검증 {a?.model ? <span className="font-normal text-slate-500">({a.model} · {a.analyzedAt.slice(0, 10)})</span> : null}</h4>
        {!readOnly && !r.isDemo && (
          <div className="flex gap-1.5">
            {(r.aiStatus !== "done" || !a) && <button disabled={!!busy} onClick={() => run("reanalyze")} className="rounded-lg border border-slate-300 px-2.5 py-1 text-[13px] text-slate-700 hover:border-sky-200 disabled:opacity-50">{busy === "reanalyze" ? "분석 중…" : a ? "이 기사만 재분석" : "이 기사 AI 분석"}</button>}
            {r.approvedAt
              ? <button disabled={!!busy} onClick={() => run("unapprove")} className="rounded-lg border border-slate-300 px-2.5 py-1 text-[13px] text-slate-600 disabled:opacity-50">승인 취소</button>
              : <button disabled={!!busy || (!r.summary4.length && !r.edits?.summary4?.some(Boolean))} onClick={() => run("approve")} className="rounded-lg bg-brand px-2.5 py-1 text-[13px] font-semibold text-brand-ink disabled:opacity-40">보고서 사용 승인</button>}
          </div>
        )}
      </div>
      {msg && <p className="mb-2 text-[13px] text-sky-700">{msg}</p>}
      {r.gate.problems.length > 0 && (
        <ul className="mb-2 space-y-0.5 rounded-lg bg-amber-50 p-2.5 text-[13px] text-amber-800">{r.gate.problems.map((p) => <li key={p}>• {p}</li>)}</ul>
      )}
      {!a ? (
        <p className="text-[13px] text-slate-500">아직 Gemini 원문 검증 분석을 하지 않았습니다. 규칙 기반 문장은 보고서 요약으로 쓰지 않습니다.</p>
      ) : a.status === "failed" || a.status === "insufficient_source" ? (
        <p className="text-[13px] text-slate-500">{a.reviewReasons.join(" · ")}</p>
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
            <Fact k="원문 확보 수준" v={`${SOURCE_LEVEL[a.sourceLevel]}${a.sourceChars ? ` · ${a.sourceChars.toLocaleString()}자` : ""}`} warn={a.sourceLevel !== "body"} />
            <Fact k="보고 유형" v={a.reportType ? TYPE_BADGE[a.reportType] : "—"} />
            <Fact k="기업" v={<>{a.company.value || "—"}<Quote q={a.company.evidence} /></>} />
            <Fact k="프로젝트 소재지" v={<>{[a.location.countryKo || a.location.country, a.location.city].filter(Boolean).join(" ") || "원문 미기재"}<Quote q={a.location.evidence} /></>} />
            <Fact k="시설 유형" v={<>{FACILITY[a.facility.kind] ?? a.facility.kind}{a.facility.type ? ` · ${a.facility.type}` : ""}<Quote q={a.facility.evidence} /></>} />
            <Fact k="추진 단계" v={<>{STAGE[a.stage.value] ?? a.stage.value}<Quote q={a.stage.evidence} /></>} />
            <Fact k="금액 · 용도" v={<>{a.investment.amount ? `${a.investment.amount} (${PURPOSE[a.investment.purpose] ?? a.investment.purpose})` : "원문에 금액 없음"}{a.investment.amount && <Quote q={a.investment.evidence} />}</>} warn={a.investment.purpose === "funding_round"} />
            <Fact k="일정" v={<>{a.schedule.value || "원문 미기재"}{a.schedule.value && <Quote q={a.schedule.evidence} />}</>} />
            <Fact k="자동화 설비 언급" v={<>{a.automation.mentioned ? a.automation.items.join(", ") || "언급 있음" : "원문에 언급 없음"}{a.automation.mentioned && <Quote q={a.automation.evidence} />}</>} />
            <Fact k="자동화 공급사" v={<>{a.supplier.status === "decided" ? `확정: ${a.supplier.name}` : a.supplier.status === "undecided" ? "미확정 (입찰·선정 예정)" : "원문 미기재"}{a.supplier.status !== "unknown" && <Quote q={a.supplier.evidence} />}{a.constructionCompany && <span className="block text-xs text-slate-500">시공사 {a.constructionCompany} (자동화 공급사와 별개)</span>}</>} />
          </dl>
          {a.summary.length === 4 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[13px] text-slate-600">요약 줄별 원문 근거 보기</summary>
              <ol className="mt-2 space-y-2 text-sm text-slate-800">
                {a.summary.map((l, i) => <li key={i}>{l}{i < 3 ? <Quote q={a.lineEvidence[i] ?? ""} /> : <span className="block text-xs text-slate-400">시사점 (분석가 판단)</span>}</li>)}
              </ol>
            </details>
          )}
          {a.reviewReasons.length > 0 && <p className="mt-2 text-xs text-amber-700">검토 사유: {a.reviewReasons.join(" · ")}</p>}
        </>
      )}
    </section>
  );
}

/** Period of the current weekly page (from the URL) for item updates made inside shared parts. */
function periodOf(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const q = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  for (const k of ["p", "w", "start", "end"]) { const v = q.get(k); if (v) out[k] = v; }
  return Object.keys(out).length ? out : { w: "-1" };
}

export function DateMeta({ r }: { r: WeeklyRow }) {
  return (
    <span className="text-[13px] text-slate-500">
      {r.dateStatus === "verified" && r.kstDate ? r.kstDate : <span className="text-amber-700">발행일 미확인</span>}
      <span className="mx-1.5 text-slate-300">·</span>
      {r.sourceName}
    </span>
  );
}

export function SourceButton({ r, compact }: { r: WeeklyRow; compact?: boolean }) {
  if (r.isDemo) return <span className="text-xs text-slate-400">DEMO · 원문 없음</span>;
  return (
    <a href={r.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className={cn("inline-flex items-center gap-1 rounded-lg text-sm font-medium text-slate-600 hover:text-sky-700", compact ? "" : "border border-slate-200 px-3 py-1.5 hover:border-sky-200")}>
      원문 보기<ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

export function StatusButtons({ r, onSet, size = "md" }: { r: WeeklyRow; onSet: (s: ReportStatus) => void; size?: "md" | "sm" }) {
  const readOnly = useReadOnly();
  if (readOnly) return r.reportStatus === "selected" ? <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">보고서 선정</span> : null;
  const sel = r.reportStatus === "selected";
  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => onSet(sel ? "unreviewed" : "selected")}
        className={cn("inline-flex items-center gap-1 rounded-lg font-semibold transition-colors", size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm", sel ? "bg-brand text-brand-ink" : "border border-sky-200 text-sky-700 hover:bg-sky-50")}
      >
        <Check className="h-4 w-4" />{sel ? "선정됨" : "보고서 선정"}
      </button>
      <button title="보류" onClick={() => onSet(r.reportStatus === "hold" ? "unreviewed" : "hold")} className={cn("rounded-lg p-1.5", r.reportStatus === "hold" ? "bg-amber-100 text-amber-700" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700")}><PauseCircle className="h-4 w-4" /></button>
      <button title="제외" onClick={() => onSet(r.reportStatus === "excluded" ? "unreviewed" : "excluded")} className={cn("rounded-lg p-1.5", r.reportStatus === "excluded" ? "bg-slate-200 text-slate-800" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700")}><CircleSlash className="h-4 w-4" /></button>
    </div>
  );
}

function Fact({ k, v, warn }: { k: string; v: React.ReactNode; warn?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{k}</dt>
      <dd className={cn("text-sm text-slate-800", warn && "text-amber-700")}>{v}</dd>
    </div>
  );
}

/** Direct-URL verification for Google News items (only a real fetch marks the article as verified). */
function DirectUrlForm({ r, onDone }: { r: WeeklyRow; onDone: () => void }) {
  const readOnly = useReadOnly();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const d = await postJson(`/api/articles/${r.id}/source`, { url });
      setMsg(`원문 확인 완료 · 발행일 ${d.publishedAt ? d.publishedAt.slice(0, 10) : "미확인"} (${d.basis})`);
      onDone();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  if (readOnly) return null;
  return (
    <form onSubmit={submit} className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-amber-800"><Link2 className="h-4 w-4" />발행 매체 원문 URL로 검증하기</div>
      <p className="mb-2 text-xs text-amber-800/90">Google News 경유 기사는 원문 주소와 발행일을 자동으로 확인할 수 없습니다. &lsquo;원문 보기&rsquo;로 연 기사 주소를 붙여 넣으면 실제로 접속해 발행일을 확인합니다.</p>
      <div className="flex gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://발행매체/기사주소" className="h-9 min-w-0 flex-1 rounded-lg border border-slate-300 bg-surface-2 px-3 text-sm outline-none focus:border-sky-500" />
        <button disabled={busy || !url} className="rounded-lg bg-brand px-3 text-sm font-semibold text-brand-ink disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "검증"}</button>
      </div>
      {msg && <div className="mt-2 text-xs text-slate-700">{msg}</div>}
    </form>
  );
}

/** Full detail (expanded card / side panel): 4-line summary, judgment, verification, scores. */
export function ArticleDetail({ r, reasons, rejectReason, onRefresh }: { r: WeeklyRow; reasons?: string[]; rejectReason?: string; onRefresh: () => void }) {
  const j = r.judgment;
  const lines = r.edits?.summary4?.some(Boolean) ? r.edits.summary4 : r.summary4;
  return (
    <div className="space-y-5">
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-slate-900">보고서 요약 (4줄)</h4>
          <span className={cn("text-xs", r.aiStatus === "done" ? "text-sky-700" : "text-amber-700")}>
            {r.edits?.summary4?.some(Boolean) ? "사용자 수정본" : r.summary4.length ? (r.aiStatus === "done" ? "Gemini 원문 검증 요약" : "Gemini 요약 — 검토 필요") : "요약 없음"}
          </span>
        </div>
        <ol className="space-y-1 rounded-lg bg-navy-900/60 p-3 text-sm leading-relaxed text-slate-800">
          {(lines ?? []).length ? lines!.map((l, i) => <li key={i}>{l}</li>) : <li className="text-slate-500">Gemini 원문 검증 요약이 없습니다 (AI 분석 필요). 키워드로 만든 문장은 보고서에 쓰지 않습니다.</li>}
        </ol>
        {r.ai?.sourceLevel === "excerpt" && r.summary4.length > 0 && <p className="mt-1.5 text-xs text-amber-700">기사 본문을 읽지 못해 제목·발췌문으로 확인되는 내용만 요약했습니다 (검증 수준 낮음).</p>}
      </section>

      <AiEvidence r={r} onRefresh={onRefresh} />

      {(reasons?.length || rejectReason) && (
        <section>
          <h4 className="mb-1.5 text-sm font-semibold text-slate-900">{rejectReason ? "후보 사유" : "추천 근거"}</h4>
          {rejectReason && <p className="mb-1 text-sm text-amber-700">{rejectReason}</p>}
          {reasons?.length ? <p className="text-[13px] text-slate-600">{reasons.join(" · ")}</p> : null}
        </section>
      )}

      {j && (
        <section>
          <h4 className="mb-2 text-sm font-semibold text-slate-900">수주기회 판단 <span className="font-normal text-slate-500">({r.ai && r.ai.status !== "failed" ? "Gemini 원문 분석 기반" : "키워드 예비 판단 — 확정 아님"} · 추정 포함)</span></h4>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
            <Fact k="현대무벡스 수주 가능성" v={LEVEL_LABEL[j.winPotential]} />
            <Fact k="신규 프로젝트" v={j.isNewProject === null ? "미확인" : j.isNewProject ? "예" : "아니오"} />
            <Fact k="준공·가동 여부" v={j.completed ? "이미 준공·가동" : "아니오 / 미확인"} warn={j.completed} />
            <Fact k="자동화 공급사" v={SUPPLIER_LABEL[j.supplierStatus]} />
            <Fact k="발주 여지" v={ORDER_ROOM_LABEL[j.orderRoom]} />
            <Fact k="사업 직접 연관성" v={LEVEL_LABEL[j.directRelevance]} />
            <Fact k="경쟁사 모니터링 가치" v={LEVEL_LABEL[j.competitorValue]} />
            {j.lowValueType && <Fact k="유형" v={j.lowValueType} warn />}
          </dl>
          <p className="mt-2 text-xs text-slate-500">{j.supplierNote}</p>
        </section>
      )}

      <section>
        <h4 className="mb-2 text-sm font-semibold text-slate-900">출처 · 날짜 검증</h4>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
          <Fact k="원문 제목" v={<span className="break-words">{r.title}</span>} />
          <Fact k="언론사" v={r.sourceName} />
          <Fact k="기사 발행일" v={r.dateStatus === "verified" ? r.kstDate : r.kstDate ? `미확인 (검색일 ${r.kstDate})` : "미확인"} warn={r.dateStatus !== "verified"} />
          <Fact k="사건·발표일" v={r.eventDate ?? "원문 미기재"} />
          <Fact k="원문 링크" v={r.viaGoogleNews ? "Google News 경유 (원문 미검증)" : r.verification === "verified" ? "검증됨" : r.verification === "broken" ? "링크 오류" : "확인 필요"} warn={r.viaGoogleNews || r.verification !== "verified"} />
          <Fact k="날짜 근거" v={<span className="text-[13px]">{r.publishedAtBasis}</span>} />
        </dl>
        {!r.inPeriod && r.publishedAt && <p className="mt-2 text-xs text-amber-700">조사 기간 밖에 발행된 기사입니다.</p>}
        {r.viaGoogleNews && !r.isDemo && <DirectUrlForm r={r} onDone={onRefresh} />}
      </section>

      <section>
        <h4 className="mb-2 text-sm font-semibold text-slate-900">점수 (보조 지표)</h4>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
          <Fact k="업계동향 관련도" v={r.relevance ?? "미분석"} />
          <Fact k="수주기회 점수" v={r.oppScore != null ? `${r.oppScore}${r.oppPriority ? ` · ${r.oppPriority}` : ""}` : "—"} />
          <Fact k="보고서 분석" v={AI_BADGE[r.aiStatus].label} warn={r.aiStatus !== "done"} />
        </dl>
        {r.relevanceBreakdown && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-slate-500">관련도 세부 근거</summary>
            <ul className="mt-1.5 space-y-1 text-xs text-slate-600">
              {RELEVANCE_CRITERIA.map((c) => <li key={c.key}>{c.label} {r.relevanceBreakdown![c.key].score}/{c.max} — {r.relevanceBreakdown![c.key].reason}</li>)}
            </ul>
          </details>
        )}
        {r.opportunityId && <a href={`/opportunities/${r.opportunityId}`} className="mt-2 inline-block text-[13px] text-sky-700 hover:underline">수주기회 상세 보기 →</a>}
      </section>
    </div>
  );
}
