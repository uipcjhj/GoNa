import { useEffect, useRef, useState } from 'react';
import { thumbnailOf, type Work } from '../data/works';
import { asset } from '../lib/asset';

/** 이미지가 없는 작업물용 타이포그래피 카드의 색. 유형마다 다르게 해 갤러리에 리듬을 준다. */
const TONE: Record<Work['category'], string> = {
  Video: 'bg-ink text-paper',
  Design: 'bg-wash text-fg',
  Web: 'bg-wash text-fg',
  Competition: 'bg-accent text-ink',
  Editorial: 'border border-fg text-fg',
};

export const metaOf = (work: Work) => [work.category, work.year, work.organization].filter(Boolean) as string[];

interface Props {
  work: Work;
  onOpen: () => void;
  /** 미리보기처럼 카드 높이를 맞추고 싶을 때 */
  uniform?: boolean;
}

/** 갤러리 카드. 썸네일이 있으면 이미지로, 없거나 불러오지 못하면 타이포그래피 카드로 그린다. */
export function WorkCard({ work, onOpen, uniform = false }: Props) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (img.current?.complete && img.current.naturalWidth === 0) setFailed(true);
  }, []);
  const thumb = failed ? undefined : thumbnailOf(work);
  const first = work.media?.[0];
  const isVideo = first?.kind === 'youtube' || first?.kind === 'video';
  const count = work.media?.length ?? 0;
  const docs = work.documents?.length ?? 0;

  return (
    <button type="button" onClick={onOpen} aria-haspopup="dialog" className="group block w-full cursor-pointer text-left focus-visible:outline-offset-4">
      {thumb ? (
        <span className={`relative block overflow-hidden bg-wash ${uniform || isVideo ? 'aspect-video' : ''}`}>
          <img
            ref={img}
            src={asset(thumb)}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className={`w-full transition-transform duration-700 ease-out-soft group-hover:scale-[1.04] ${uniform || isVideo ? 'h-full object-cover' : 'h-auto'}`}
          />
          <span className="meta absolute right-0 bottom-0 bg-accent px-2.5 py-1.5 font-medium text-ink">
            {isVideo ? 'Play' : count > 1 ? `${count} images` : 'View'}
          </span>
        </span>
      ) : (
        <span className={`flex flex-col justify-between gap-8 p-4 sm:p-5 ${TONE[work.category]} ${uniform ? 'aspect-video' : 'min-h-36 sm:min-h-44'}`}>
          <span className="meta flex justify-between gap-3 opacity-80">
            <span>{work.category}</span>
            {docs > 0 && <span>{docs}건</span>}
          </span>
          <span className={`font-bold tracking-[-0.04em] text-balance ${uniform ? 'line-clamp-3 text-lg leading-[1.15] sm:text-xl' : 'text-[1.375rem] leading-[1.12] sm:text-[1.625rem]'}`}>
            {work.title}
          </span>
        </span>
      )}
      <span className="mt-3 block">
        {thumb && (
          <span className="line-clamp-2 block leading-snug font-semibold tracking-[-0.01em]">
            <span className="bg-[linear-gradient(#c8ff5f,#c8ff5f)] bg-[length:0%_100%] bg-no-repeat transition-[background-size,color] duration-500 ease-out-soft group-hover:bg-[length:100%_100%] group-hover:text-ink">
              {work.title}
            </span>
          </span>
        )}
        <span className={`meta flex flex-wrap gap-x-2 text-muted ${thumb ? 'mt-1.5' : ''}`}>
          {(thumb ? metaOf(work) : metaOf(work).slice(1)).map((m, i) => (
            <span key={m}>
              {i > 0 && <span className="mr-2">|</span>}
              {m}
            </span>
          ))}
        </span>
      </span>
    </button>
  );
}
