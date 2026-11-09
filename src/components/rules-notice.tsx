import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/** Explains what the rule-based (no API key) analysis can and cannot do. */
export function RulesNotice({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 sm:p-4", className)}>
      <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold"><Info className="h-4 w-4" />규칙 기반 분석 결과입니다 (AI 미연결)</div>
      <p>기사 제목·요약의 키워드(신설·증설·착공·물류센터·자동창고·자동화 설비·입찰 등)로 판단한 결과이며, 수주기회 점수는 참고용입니다.</p>
      {!compact && (
        <details className="mt-1">
        <summary className="cursor-pointer font-medium">점수의 한계 자세히 보기</summary>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
          <li>기업명·프로젝트명·투자규모는 제목과 요약에 적힌 내용에서만 추출하며, 찾지 못하면 Unknown / Not Disclosed로 둡니다.</li>
          <li>프로젝트 진행 단계·발주 시점·사건 발생일은 판단하지 못하므로 점수가 실제보다 낮거나 높을 수 있습니다.</li>
          <li>한국어 4줄 요약, 영문 기사 번역, 과거 발표 재보도 판별은 AI 연결(ANTHROPIC_API_KEY) 후 제공됩니다.</li>
          <li>점수는 수주 확률이 아니라 검토 우선순위 지표입니다. 반드시 원문을 확인하세요.</li>
        </ul>
        </details>
      )}
    </div>
  );
}
