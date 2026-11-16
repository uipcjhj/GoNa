import { createContext, useEffect } from 'react';

/** 메인 페이지에서 지금 보고 있는 영역을 헤더에 알려 주는 통로 */
export const ActiveSectionContext = createContext<(id: string | null) => void>(() => {});

/** 화면 가운데 선에 걸친 영역의 id 를 알려 준다. */
export function useSectionSpy(ids: readonly string[], onChange: (id: string | null) => void) {
  useEffect(() => {
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        onChange(ids.find((id) => visible.has(id)) ?? null);
      },
      { rootMargin: '-50% 0px -50% 0px' },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => {
      observer.disconnect();
      onChange(null);
    };
  }, [ids, onChange]);
}
