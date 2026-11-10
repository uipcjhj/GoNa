// Weekly report curation (separate from Industry Relevance Score / Opportunity Score, which are inputs only).
// Picks ~12 articles balancing priority tier, region, article type and duplicates, and records why;
// keeps 5–10 reference candidates with a rejection reason, and a "확인 필요" list (unverified date, out of period, unclear category).
import type { Curation, CurationEntry } from "@/lib/types";
import type { WeeklyRow } from "./view";
import { storyMatcher } from "./story";

export interface CurateOptions {
  target: number; // final picks (default 12)
  rejectCount: number; // 5–10
  includeUnverified: boolean; // include articles whose publication date could not be confirmed
  previous: { id: string; title: string }[]; // articles selected in the previous 2 weeks
}

const AMOUNT_BIG = /(\d[\d,.]*\s?조|\d{4,}[\d,.]*\s?억|\d{3}[\d,.]*\s?억|\$\s?\d+(\.\d+)?\s?(billion|bn|b)\b|\d+(\.\d+)?\s?billion|€\s?\d+(\.\d+)?\s?(billion|bn))/i;
const FOLLOW_UP = /(입찰|발주|착공|공고|사업자 선정|tender|groundbreaking|breaks ground|RFP)/i;
const INVEST_SUBS = ["투자·확장", "제조물류 투자", "스마트창고 투자", "콜드체인 투자"];
const TECH_SUBS = ["피지컬 AI", "자율물류", "자동화 운영확대", "스마트팩토리", "제조자동화", "R&D·피지컬 AI"];

function amountText(r: WeeklyRow) {
  return `${r.title} ${r.titleKo ?? ""} ${r.summary4.join(" ")}`;
}

/** Priority tier (spec 1–6) + adjustments; returns score and human-readable reasons. */
export function curationPriority(r: WeeklyRow): { score: number; reasons: string[]; side: "global" | "domestic" } {
  const j = r.judgment;
  const d = r.detail;
  const reasons: string[] = [];
  let base = 35;
  if (d && j) {
    if (d.group !== "competitor" && j.winPotential === "high") { base = 100; reasons.push("신규 투자 프로젝트 · 자동화 발주 여지"); }
    else if (d.group === "global" && INVEST_SUBS.includes(d.sub) && j.isNewProject) { base = AMOUNT_BIG.test(amountText(r)) ? 88 : 80; reasons.push(AMOUNT_BIG.test(amountText(r)) ? "대형 글로벌 시설 신설·증설" : "글로벌 시설 투자"); }
    else if (d.group === "domestic" && (INVEST_SUBS.includes(d.sub) || ["스마트팩토리", "제조자동화"].includes(d.sub)) && j.isNewProject) { base = AMOUNT_BIG.test(amountText(r)) ? 84 : 76; reasons.push("국내 물류·제조 자동화 투자"); }
    else if (d.group === "competitor") { base = j.competitorValue === "high" ? 74 : j.competitorValue === "medium" ? 60 : 46; reasons.push(`경쟁사 ${d.sub}`); }
    else if (TECH_SUBS.includes(d.sub)) { base = 62; reasons.push("핵심 기술 변화"); }
    else if (d.sub === "정책·지원") { base = 56; reasons.push("정책·지원 동향"); }
    else if (j.winPotential === "medium") { base = 58; reasons.push("투자 신호 (단계·규모 확인 필요)"); }
    else { base = (r.relevance ?? 0) < 40 ? 30 : 40; reasons.push("산업 동향"); }
    if (j.completed && d.group !== "competitor") { base -= 30; reasons.push("이미 준공·가동 (감점)"); }
    if (j.supplierStatus === "decided" && d.group !== "competitor") { base -= 15; reasons.push("공급사 확정 (영업기회 감점)"); }
    if (j.lowValueType && !(d.group === "competitor" && j.lowValueType === "제품 출시 중심")) { base -= 25; reasons.push(`${j.lowValueType} (감점)`); }
    if (j.basis === "title_only") base -= 4;
  }
  const rel = r.relevance ?? 0;
  const score = Math.round(base + rel * 0.25 + (r.oppScore && d?.group !== "competitor" ? r.oppScore * 0.05 : 0));
  if (rel) reasons.push(`관련도 ${rel}`);
  return { score, reasons, side: d?.group === "global" ? "global" : "domestic" };
}

function rejectReason(r: WeeklyRow, why: "duplicate" | "balance" | "rank"): string {
  const j = r.judgment;
  if (why === "duplicate") return "기존 기사와 중복";
  if (j?.completed) return "이미 준공·가동";
  if (j?.supplierStatus === "decided" && r.detail?.group !== "competitor") return "자동화 공급사 확정";
  if (j?.lowValueType === "제품 출시 중심") return "제품 공개 중심";
  if (j?.lowValueType && j.lowValueType !== "시장 전망·통계") return j.lowValueType;
  if (j?.lowValueType === "시장 전망·통계" || r.detail?.sub === "Industry") return "시장동향 중심";
  if (j?.lowValueType) return j.lowValueType;
  if (j?.directRelevance === "low") return "직접적인 물류자동화 연관성 낮음";
  if (j?.winPotential === "low" && r.detail?.group !== "competitor") return "수주 가능성 낮음";
  if (why === "balance") return "지역·유형 균형으로 후순위";
  return "우선순위 차순위";
}

/** v3: only Gemini-verified (or user-approved) articles are recommended. */
export const CURATION_VERSION = "c3";

export function curate(rows: WeeklyRow[], o: CurateOptions): Curation {
  const same = storyMatcher([...rows.map((r) => r.titleKo ?? r.title), ...o.previous.map((p) => p.title)]);
  const titleOf = (r: WeeklyRow) => r.titleKo ?? r.title;
  const needsCheck: Curation["needsCheck"] = [];
  const aiExcluded: Curation["rejects"] = [];
  let excludedPrevious = 0;
  let pendingAI = 0;

  const pool = rows.filter((r) => !r.isDemo && r.analysis !== "pending" && r.detail && r.reportStatus !== "excluded");
  const eligible: (WeeklyRow & { _p: ReturnType<typeof curationPriority> })[] = [];
  for (const r of pool) {
    const p = curationPriority(r);
    if (r.detail!.group === "review") { if ((r.relevance ?? 0) >= 40) needsCheck.push({ articleId: r.id, reason: "카테고리 확인 필요" }); continue; }
    if (r.dateStatus !== "verified" && !o.includeUnverified) {
      if (p.score >= 55) needsCheck.push({ articleId: r.id, reason: r.viaGoogleNews ? "발행일 미확인 (Google News 검색일만 있음 — 원문 확인 필요)" : "발행일 미확인" });
      continue;
    }
    if (r.publishedAt && !r.inPeriod) { if (p.score >= 55) needsCheck.push({ articleId: r.id, reason: "조사 기간 외 발행" }); continue; }
    // only Gemini-verified articles (or ones the user reviewed and approved) can be recommended for the report
    if (!r.gate.aiDone && !(r.gate.approved && (r.summary4.length === 4 || r.edits?.summary4?.some(Boolean)))) {
      pendingAI++;
      const reason = r.aiStatus === "failed" ? `AI 분석 실패 — 재분석 필요 (${r.ai?.error?.message.slice(0, 60) ?? ""})`
        : r.aiStatus === "insufficient_source" ? "원문 부족 — 발행 매체 원문 URL 확인 후 재분석"
        : r.aiStatus === "needs_review" ? `사용자 검토 필요 — ${r.ai?.reviewReasons[0] ?? ""}`
        : "AI 분석 필요 (Gemini 원문 검증 전)";
      if ((r.relevance ?? 0) >= 40 || r.ai) needsCheck.push({ articleId: r.id, reason });
      continue;
    }
    if (r.ai?.reportType === "exclude") {
      aiExcluded.push({ articleId: r.id, reason: `보고 제외 (AI 판단): ${r.ai.excludeReason || "광고·홍보·관련성 낮음"}`, detail: r.ai.titleKo || r.title, monitoring: false });
      continue;
    }
    // previously reported story: only a real follow-up (tender / groundbreaking) may be selected again
    const prev = o.previous.find((x) => x.id === r.id || same(titleOf(r), x.title));
    if (prev) {
      const followUp = FOLLOW_UP.test(titleOf(r)) && !FOLLOW_UP.test(prev.title);
      if (!followUp) { excludedPrevious++; continue; }
      p.reasons.unshift("지난 보고 프로젝트의 실질적 후속 업데이트 (입찰·착공 등)");
    }
    eligible.push({ ...r, _p: p });
  }
  eligible.sort((a, b) => b._p.score - a._p.score || (b.relevance ?? 0) - (a.relevance ?? 0));

  const picks: (typeof eligible)[number][] = [];
  const skipped = new Map<string, "duplicate" | "balance">();
  const half = Math.ceil(o.target / 2);
  const isDup = (r: WeeklyRow) => picks.some((p) => (r.dupGroup && p.dupGroup === r.dupGroup) || (r.opportunityId && p.opportunityId === r.opportunityId) || same(titleOf(r), titleOf(p)));
  const fits = (r: (typeof eligible)[number], strict: boolean) => {
    const sideCount = picks.filter((p) => p._p.side === r._p.side).length;
    if (strict && sideCount >= half) return false;
    if (r.detail!.group === "global" && r.detail!.country && picks.filter((p) => p.detail!.country === r.detail!.country).length >= (strict ? 2 : 3)) return false;
    if (picks.filter((p) => p.detail!.sub === r.detail!.sub && p.detail!.group === r.detail!.group).length >= (strict ? 3 : 4)) return false;
    if (r.detail!.group === "competitor" && picks.filter((p) => p.detail!.group === "competitor").length >= (strict ? 3 : 4)) return false;
    return true;
  };
  for (const strict of [true, false]) {
    for (const r of eligible) {
      if (picks.length >= o.target) break;
      if (picks.includes(r)) continue;
      if (isDup(r)) { skipped.set(r.id, "duplicate"); continue; }
      if (r._p.score < 45) continue; // never pad the report with weak items
      if (!fits(r, strict)) { skipped.set(r.id, "balance"); continue; }
      picks.push(r);
      skipped.delete(r.id);
    }
  }

  const pickEntries: CurationEntry[] = picks.map((r, i) => {
    const group = rows.filter((x) => x.id !== r.id && ((r.dupGroup && x.dupGroup === r.dupGroup) || same(titleOf(r), titleOf(x)))).length;
    const reasons = [...r._p.reasons];
    if (r.detail?.country) reasons.splice(1, 0, r.detail.country);
    if (group) reasons.push(`대표 기사 (동일 프로젝트 기사 ${group + 1}건 중)`);
    return { articleId: r.id, rank: i + 1, reasons, priority: r._p.score };
  });

  // reference candidates (후보 탈락): best non-picked items, keeping policy/competitor monitoring value visible
  const rest = eligible.filter((r) => !picks.includes(r) && r._p.score >= 25);
  const monitoring = (r: WeeklyRow) => r.detail?.group === "competitor" || r.detail?.sub === "정책·지원";
  const n = Math.max(5, Math.min(10, o.rejectCount));
  const chosen: typeof rest = [];
  const seen = (r: WeeklyRow) => chosen.some((c) => same(titleOf(c), titleOf(r)));
  for (const r of rest.filter(monitoring)) { if (chosen.length >= 3) break; if (!seen(r)) chosen.push(r); }
  for (const r of rest) { if (chosen.length >= n) break; if (!chosen.includes(r) && !seen(r)) chosen.push(r); }
  chosen.sort((a, b) => b._p.score - a._p.score);
  const rejects: Curation["rejects"] = chosen.map((r) => ({
    articleId: r.id,
    reason: rejectReason(r, skipped.get(r.id) ?? "rank"),
    detail: r._p.reasons.slice(0, 3).join(" · "),
    monitoring: monitoring(r),
  }));
  // keep at least 5 reference candidates: fill with the strongest "확인 필요" items (date not confirmed) — never padded with irrelevant news
  if (rejects.length < 5) {
    const byId = new Map(pool.map((r) => [r.id, r]));
    const extra = needsCheck
      .map((x) => ({ x, r: byId.get(x.articleId) }))
      .filter((v): v is { x: (typeof needsCheck)[number]; r: WeeklyRow } => Boolean(v.r) && !rejects.some((j) => j.articleId === v.x.articleId))
      .map((v) => ({ ...v, p: curationPriority(v.r) }))
      .filter((v) => v.p.score >= 55)
      .sort((a, b) => b.p.score - a.p.score);
    for (const v of extra) {
      if (rejects.length >= 5) break;
      if (rejects.some((j) => same(titleOf(byId.get(j.articleId)!), titleOf(v.r)))) continue;
      rejects.push({ articleId: v.r.id, reason: "발행일 미확인 (원문 확인 필요)", detail: v.p.reasons.slice(0, 3).join(" · "), monitoring: monitoring(v.r) });
    }
  }

  for (const x of aiExcluded) { if (rejects.length >= 10) break; rejects.push(x); }
  const typeOf = (r: (typeof picks)[number]) => r.ai?.reportType ?? (r.detail?.group === "competitor" ? "competitor" : "trend");
  return {
    version: CURATION_VERSION,
    shortfall: Math.max(0, o.target - picks.length),
    pendingAI,
    types: { opportunity: picks.filter((r) => typeOf(r) === "opportunity").length, competitor: picks.filter((r) => typeOf(r) === "competitor").length, trend: picks.filter((r) => typeOf(r) === "trend").length },
    generatedAt: new Date().toISOString(),
    target: o.target,
    includeUnverified: o.includeUnverified,
    picks: pickEntries,
    rejects,
    needsCheck: needsCheck.slice(0, 40),
    excludedPrevious,
    balance: {
      global: picks.filter((p) => p.detail!.group === "global").length,
      domestic: picks.filter((p) => p.detail!.group === "domestic").length,
      competitor: picks.filter((p) => p.detail!.group === "competitor").length,
    },
  };
}
