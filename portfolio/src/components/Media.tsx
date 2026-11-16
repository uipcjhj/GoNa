import type { Media as MediaData } from '../data/types';
import { asset } from '../lib/asset';

interface Props {
  media: MediaData;
  className?: string;
  /** 첫 화면에 보이는 이미지면 true (지연 로딩을 끈다) */
  priority?: boolean;
  /** 부모(.group) 호버 시 확대 */
  zoom?: boolean;
}

/**
 * 이미지·영상 표시. src 가 비어 있으면 같은 비율의 "임시 이미지" 자리표시를 그린다.
 * 실제 파일로 바꿀 때는 데이터의 src 만 채우면 된다.
 */
export function Media({ media, className = '', priority = false, zoom = false }: Props) {
  const ratio = media.ratio ?? '16 / 10';
  const zoomClass = zoom
    ? 'transition-transform duration-700 ease-out-soft group-hover:scale-[1.05] group-focus-visible:scale-[1.05]'
    : '';

  return (
    <div className={`relative overflow-hidden bg-wash ${className}`} style={{ aspectRatio: ratio }}>
      {!media.src ? (
        <div
          role="img"
          aria-label={media.alt}
          className={`placeholder-media absolute inset-0 flex items-end justify-between gap-3 p-3 text-muted sm:p-4 ${zoomClass}`}
        >
          <span className="meta">임시 {media.kind === 'video' ? '영상' : '이미지'}</span>
          <span className="meta">{ratio.replace(/\s/g, '')}</span>
        </div>
      ) : media.kind === 'video' ? (
        <video
          className={`absolute inset-0 h-full w-full object-cover ${zoomClass}`}
          src={asset(media.src)}
          poster={media.poster ? asset(media.poster) : undefined}
          aria-label={media.alt}
          muted
          loop
          autoPlay
          playsInline
          preload="metadata"
        />
      ) : (
        <img
          className={`absolute inset-0 h-full w-full object-cover ${zoomClass}`}
          src={asset(media.src)}
          alt={media.alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
        />
      )}
    </div>
  );
}
