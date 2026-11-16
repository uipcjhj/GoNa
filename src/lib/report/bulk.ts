// 전체 기사 AI 요약 대상 선정 (순수 함수): 해당 주간의 모든 수집 기사(중복 제외)를 대상으로, 이미 현재 기준으로 분석된 기사는 재사용한다.
// 요약 생성은 AI 추천·보고서 선정·원문 검증 여부와 무관하게 동작한다. 우선순위(추천 후보·선정 기사 먼저)는 처리 순서에만 영향을 준다.
import type { Article } from "@/lib/types";
import { needsAnalysis } from "./factcheck";

export interface BulkOptions { retryFailed: boolean; limit?: number; priorityIds?: string[]; selectedIds?: Set<string> }

export function bulkCandidates(articles: Article[], range: { start: string; end: string }, o: BulkOptions): { targets: Article[]; pending: Article[] } {
  const when = (a: Article) => a.publishedAt ?? a.discoveredAt;
  // every article of the week except duplicates / demo data (filtered and queued articles are summarised too)
  const targets = articles.filter((a) => !a.isDemo && a.status !== "duplicate" && when(a) >= range.start && when(a) < range.end);
  const order = new Map((o.priorityIds ?? []).map((id, i) => [id, i]));
  const rank = (a: Article) => (o.selectedIds?.has(a.id) ? -1 : order.get(a.id) ?? 1_000_000);
  const pending = targets
    .filter((a) => needsAnalysis(a, { retryFailed: o.retryFailed }))
    .sort((a, b) => rank(a) - rank(b) || (b.preScore ?? 0) - (a.preScore ?? 0) || when(b).localeCompare(when(a)));
  return { targets, pending: o.limit ? pending.slice(0, o.limit) : pending };
}

/** Errors after which the run stops WITHOUT recording a failed result for the article (it stays pending and is retried later). */
export const HALTING_ERRORS = ["not_configured", "auth", "permission", "model_not_found", "quota_daily", "rate_limit"] as const;
export const isHaltingError = (kind: string | undefined) => Boolean(kind && (HALTING_ERRORS as readonly string[]).includes(kind));
