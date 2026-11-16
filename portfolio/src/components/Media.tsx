import { useState } from 'react';
import type { Media as MediaData } from '../data/types';
import { asset } from '../lib/asset';

interface Props {
  media: MediaData;
  className?: string;
  /** 첫 화면에 보이는 자료면 true (지연 로딩을 끈다) */
  priority?: boolean;
  /** 부모(.group) 호버 시 확대 — 카드에서 사용 */
  zoom?: boolean;
  /** 카드 안에서 쓸 때 true: 영상은 소리 없이 반복 재생하고, 조작 버튼을 숨긴다 */
  ambient?: boolean;
  /** 이미지를 눌렀을 때 (갤러리에서 크게 보기) */
  onOpen?: () => void;
}

const FILL = 'absolute inset-0 h-full w-full object-cover';

/**
 * 이미지·영상·PDF·YouTube 표시.
 * src 가 비어 있으면 아무것도 그리지 않는다 — 자료가 없는 자리는 화면에서 사라진다.
 */
export function Media({ media, className = '', priority = false, zoom = false, ambient = false, onOpen }: Props) {
  const [playing, setPlaying] = useState(false);
  if (!media.src) return null;

  const ratio = media.ratio ?? (media.kind === 'pdf' ? '4 / 3' : '16 / 10');
  const zoomClass = zoom
    ? 'transition-transform duration-700 ease-out-soft group-hover:scale-[1.05] group-focus-visible:scale-[1.05]'
    : '';
  const poster = media.poster ? asset(media.poster) : undefined;
  let content;

  if (media.kind === 'image') {
    const img = (
      <img
        className={`${FILL} ${zoomClass}`}
        src={asset(media.src)}
        alt={media.alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
      />
    );
    content = onOpen ? (
      <button type="button" onClick={onOpen} aria-label={`${media.alt} 크게 보기`} className="group absolute inset-0 cursor-zoom-in">
        {img}
      </button>
    ) : (
      img
    );
  } else if (media.kind === 'video') {
    content = ambient ? (
      <video className={`${FILL} ${zoomClass}`} src={asset(media.src)} poster={poster} aria-label={media.alt} muted loop autoPlay playsInline preload="metadata" />
    ) : (
      <video className={FILL} src={asset(media.src)} poster={poster} aria-label={media.alt} controls playsInline preload="metadata" />
    );
  } else if (media.kind === 'youtube') {
    // 누르기 전에는 외부 요청을 보내지 않는다
    content = playing ? (
      <iframe
        className="absolute inset-0 h-full w-full"
        src={`https://www.youtube-nocookie.com/embed/${media.src}?autoplay=1&rel=0`}
        title={media.alt}
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    ) : (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        disabled={ambient}
        aria-label={`${media.alt} 재생`}
        className="group absolute inset-0 flex cursor-pointer items-end justify-between gap-4 bg-ink p-4 text-left text-paper sm:p-6"
      >
        {poster && <img className={`${FILL} ${zoomClass}`} src={poster} alt="" loading="lazy" decoding="async" />}
        <span className="relative max-w-[70%] text-lg leading-snug font-semibold">{media.alt}</span>
        <span className="meta relative shrink-0 bg-accent px-3 py-2 font-medium text-ink">Play</span>
      </button>
    );
  } else {
    // PDF: 모바일 Safari 는 문서를 페이지 안에 띄우지 못하므로 새 창으로 연다
    const inner = (
      <>
        {poster && <img className={`${FILL} ${zoomClass}`} src={poster} alt="" loading="lazy" decoding="async" />}
        <span className={`relative max-w-[70%] text-lg leading-snug font-semibold ${poster ? 'bg-bg px-2 py-1' : ''}`}>{media.alt}</span>
        <span className="meta relative shrink-0 bg-accent px-3 py-2 font-medium text-ink">PDF</span>
      </>
    );
    const box = 'absolute inset-0 flex items-end justify-between gap-4 border border-rule bg-wash p-4 sm:p-6';
    content = ambient ? (
      <div className={box}>{inner}</div>
    ) : (
      <a href={asset(media.src)} target="_blank" rel="noreferrer" className={`group ${box}`}>
        {inner}
        <span className="sr-only"> 열기 (새 창)</span>
      </a>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-wash ${className}`} style={{ aspectRatio: ratio }}>
      {content}
    </div>
  );
}
