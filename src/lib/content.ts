import type { Media } from '../data/types';

/** YouTube 주소(여러 형태) 또는 영상 ID 에서 ID 만 꺼낸다. */
export function youtubeId(input: string): string {
  const s = input.trim();
  const m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/);
  return m ? m[1] : s;
}
export const youtubeThumb = (id: string) => `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;

const isEmpty = (v: unknown): boolean =>
  v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0);

/**
 * 관리자 화면(CMS)에서 저장한 JSON 을 화면용 데이터로 다듬는다.
 * - 비어 있는 값(빈 글, 빈 목록, 빈 묶음)은 지운다 → 화면에서 그 항목이 자동으로 숨겨진다.
 * - YouTube 자료는 주소를 붙여 넣어도 ID 로 바꾸고, 썸네일을 자동으로 채운다.
 */
export function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clean).filter((v) => !isEmpty(v)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const c = clean(v);
      if (!isEmpty(c)) out[k] = c;
    }
    if (out.kind === 'youtube' && typeof out.src === 'string') {
      const m = out as unknown as Media;
      m.src = youtubeId(out.src);
      m.poster ??= youtubeThumb(m.src);
      m.ratio ??= '16 / 9';
      if (m.alt) m.caption ??= m.alt;
    }
    return out as T;
  }
  return value;
}

/** content/<폴더>/*.json 을 읽어 파일 이름(확장자 제외)과 함께 돌려준다. */
export function entries<T>(files: Record<string, unknown>): { name: string; data: T }[] {
  return Object.entries(files)
    // 비공개 파일은 빌드할 때 내용이 비워진다 (vite.config.ts 의 hidePrivateContent)
    .filter(([, mod]) => (mod as { default: T | null }).default)
    .map(([path, mod]) => ({
      name: path.split('/').pop()!.replace(/\.json$/, ''),
      data: clean((mod as { default: T }).default),
    }));
}
