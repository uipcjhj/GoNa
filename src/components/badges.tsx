import { Badge } from "@/components/ui";
import type { AccessType, Priority, SourceType, VerificationStatus } from "@/lib/types";
import { CheckCircle2, AlertTriangle, XCircle, CircleDashed, Lock, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";

export function PriorityBadge({ p }: { p: Priority }) {
  return <Badge tone={p === "HOT" ? "red" : p === "WATCH" ? "amber" : "slate"} className="font-semibold">{p}</Badge>;
}

export function ScorePill({ score, className }: { score: number; className?: string }) {
  const color = score >= 80 ? "bg-red-500/20 text-red-300 ring-1 ring-red-400/60" : score >= 60 ? "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/50" : "bg-sky-50 text-sky-700 ring-1 ring-sky-200";
  return (
    <span className={cn("inline-flex h-7 w-10 items-center justify-center rounded-md text-sm font-bold tabular", color, className)} title="Opportunity Score (우선순위 지표, 수주확률 아님)">
      {score}
    </span>
  );
}

export function VerifyBadge({ status, demo }: { status: VerificationStatus; demo?: boolean }) {
  if (demo) return <Badge tone="violet">DEMO · 원문 없음</Badge>;
  if (status === "verified") return <Badge tone="green"><CheckCircle2 className="h-3 w-3" />링크 검증됨</Badge>;
  if (status === "needs_check") return <Badge tone="amber"><AlertTriangle className="h-3 w-3" />확인 필요</Badge>;
  if (status === "broken") return <Badge tone="red"><XCircle className="h-3 w-3" />링크 오류</Badge>;
  return <Badge><CircleDashed className="h-3 w-3" />미검증</Badge>;
}

export function AccessBadge({ access }: { access: AccessType }) {
  if (access === "paywall") return <Badge tone="orange"><Lock className="h-3 w-3" />유료/구독</Badge>;
  if (access === "free") return <Badge tone="blue"><Unlock className="h-3 w-3" />무료 열람</Badge>;
  return <Badge>열람조건 미확인</Badge>;
}

const SRC_SHORT: Record<SourceType, string> = {
  "Official Company Press Release": "기업 공식 보도자료",
  "Government Announcement": "정부 발표",
  "Media Report": "언론 보도",
  "Industry Publication": "산업 전문지",
  "Tender / Procurement Notice": "입찰/조달 공고",
};
export function SourceTypeBadge({ t }: { t: SourceType }) {
  const tone = t === "Official Company Press Release" || t === "Government Announcement" ? "green" : t === "Tender / Procurement Notice" ? "violet" : "slate";
  return <Badge tone={tone} title={t}>{SRC_SHORT[t] ?? t}</Badge>;
}

export function ModeBadge({ mode }: { mode: "ai" | "rules" | "demo" }) {
  if (mode === "ai") return <Badge tone="blue">AI 분석</Badge>;
  if (mode === "demo") return <Badge tone="violet">DEMO</Badge>;
  return <Badge tone="amber" title="AI 미연결 — 키워드 규칙 기반 분석">규칙 기반</Badge>;
}

export function CategoryBadge({ c }: { c: string }) {
  const m: Record<string, [string, "orange" | "blue" | "slate" | "red"]> = {
    opportunity: ["수주기회", "orange"],
    competitor: ["경쟁사", "blue"],
    industry: ["업계동향", "slate"],
    irrelevant: ["관련성 낮음", "slate"],
  };
  const [l, t] = m[c] ?? [c, "slate"];
  return <Badge tone={t}>{l}</Badge>;
}
