import Link from "next/link";
import { FlaskConical } from "lucide-react";

export function DemoBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm text-violet-800">
      <FlaskConical className="h-4 w-4" />
      <span>
        <b>DEMO</b> 표시가 있는 항목은 화면 확인용 <b>가상 데이터</b>입니다 (실제 기사·기업 아님). 실제 데이터는 <b>수주기회 탐색</b> 실행 또는 매일 자동 수집으로 채워집니다.
      </span>
      <Link href="/settings#demo" className="ml-auto text-xs font-medium underline">데모 데이터 숨기기/삭제</Link>
    </div>
  );
}
