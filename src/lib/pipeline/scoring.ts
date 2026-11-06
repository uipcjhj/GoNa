import { SCORE_CRITERIA } from "@/lib/config/defaults";
import type { Analysis, Penalty, Priority, ScoreBreakdown, Settings } from "@/lib/types";

export const PENALTY_RULES: { code: keyof Analysis["flags"]; label: string; points: number }[] = [
  { code: "completedProject", label: "이미 완공/가동 중인 프로젝트", points: 30 },
  { code: "reReport", label: "과거 투자 발표의 재보도", points: 25 },
  { code: "earningsOnly", label: "단순 실적 발표", points: 30 },
  { code: "maWithoutCapex", label: "설비투자와 무관한 M&A", points: 25 },
  { code: "lowAutomationRelevance", label: "물류자동화 관련성 낮음", points: 15 },
  { code: "insufficientEvidence", label: "투자 근거 불충분", points: 15 },
];

export function priorityOf(score: number, s: Pick<Settings, "hotThreshold" | "watchThreshold">): Priority {
  return score >= s.hotThreshold ? "HOT" : score >= s.watchThreshold ? "WATCH" : "GENERAL";
}

function monthsBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / (30.44 * 86400_000);
}

/** Final score = Σ(item/max × weight) normalised to 100, minus penalties. Deterministic, server-side. */
export function computeScore(
  breakdown: ScoreBreakdown,
  flags: Analysis["flags"],
  settings: Settings,
  ctx: { publishedAt: string | null; eventDate: string | null },
): { score: number; priority: Priority; penalties: Penalty[]; flags: Analysis["flags"] } {
  const w = settings.weights;
  const totalW = SCORE_CRITERIA.reduce((s, c) => s + Math.max(0, w[c.key]), 0) || 100;
  let raw = 0;
  for (const c of SCORE_CRITERIA) {
    const item = breakdown[c.key];
    const ratio = Math.max(0, Math.min(1, (item?.score ?? 0) / c.max));
    raw += ratio * Math.max(0, w[c.key]);
  }
  let score = (raw / totalW) * 100;

  const f = { ...flags };
  // date sanity: event announced > 12 months before publication => re-report
  if (ctx.eventDate && ctx.publishedAt && /^\d{4}(-\d{2})?(-\d{2})?$/.test(ctx.eventDate)) {
    const ev = ctx.eventDate.length === 4 ? `${ctx.eventDate}-07-01` : ctx.eventDate.length === 7 ? `${ctx.eventDate}-15` : ctx.eventDate;
    if (monthsBetween(ev, ctx.publishedAt) > 12) f.reReport = true;
  }
  const penalties: Penalty[] = [];
  for (const p of PENALTY_RULES) if (f[p.code]) penalties.push({ code: p.code, label: p.label, points: p.points });
  score -= penalties.reduce((s, p) => s + p.points, 0);
  score = Math.round(Math.max(0, Math.min(100, score)));
  return { score, priority: priorityOf(score, settings), penalties, flags: f };
}
