import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { getMeta } from './meta';

let firstLoad = true;

/** 페이지 진입 시 제목을 맞추고, 해시가 있으면 그 영역으로, 없으면 맨 위로 이동한다. */
export function usePage() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    document.title = getMeta(pathname).title;
  }, [pathname]);

  useEffect(() => {
    const initial = firstLoad;
    firstLoad = false;
    if (hash) {
      const el = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (el) {
        // 첫 진입은 글꼴·이미지 로딩으로 위치가 밀릴 수 있어 한 박자 늦춘다
        const id = window.setTimeout(() => el.scrollIntoView(), initial ? 120 : 0);
        return () => window.clearTimeout(id);
      }
    } else if (!initial) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, [pathname, hash]);
}
