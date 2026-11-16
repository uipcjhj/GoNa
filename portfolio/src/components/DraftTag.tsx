/** 실제 콘텐츠로 교체해야 하는 자리에 붙는 "임시" 표시 */
export function DraftTag({ className = '' }: { className?: string }) {
  return (
    <span
      className={`meta inline-block shrink-0 border border-dashed border-current px-1.5 py-px align-middle font-medium whitespace-nowrap ${className}`}
    >
      임시
    </span>
  );
}
