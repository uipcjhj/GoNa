/** 구분선(|)으로 이어 쓰는 작은 정보 줄. 비어 있는 값은 건너뛴다. 첫 항목은 진하게. */
export function MetaLine({ items, className = '' }: { items: (string | undefined)[]; className?: string }) {
  const list = items.filter(Boolean) as string[];
  if (list.length === 0) return null;
  return (
    <p className={`meta text-muted ${className}`}>
      {list.map((item, i) => (
        <span key={item + i}>
          {i > 0 && <span className="mx-2">|</span>}
          <span className={i === 0 ? 'text-fg' : undefined}>{item}</span>
        </span>
      ))}
    </p>
  );
}
