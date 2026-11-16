import { useEffect, useRef, useState } from 'react';
import type { Media as MediaData } from '../data/types';
import { asset } from '../lib/asset';
import { Media } from './Media';
import { Reveal } from './Reveal';

/**
 * 자료 묶음. 이미지·영상·PDF·YouTube 를 섞어 넣을 수 있고, 이미지는 누르면 크게 열린다.
 * src 가 있는 자료가 하나도 없으면 아무것도 그리지 않는다.
 */
/** 이미지 한 장을 크게 보여 주는 창 */
export function Lightbox({ media, onClose }: { media: MediaData | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (media) dialog.current?.showModal();
  }, [media]);
  if (!media?.src) return null;
  return (
    <dialog
      ref={dialog}
      aria-label={media.alt}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
      className="m-auto max-h-[92dvh] max-w-[94vw] bg-transparent p-0 backdrop:bg-ink/90"
    >
      <img src={asset(media.src)} alt={media.alt} className="max-h-[84dvh] max-w-full object-contain" />
      <div className="flex items-center justify-between gap-4 bg-ink px-3 py-2 text-paper">
        <p className="meta">{media.caption ?? media.alt}</p>
        <button type="button" onClick={() => dialog.current?.close()} className="meta cursor-pointer bg-accent px-3 py-1.5 font-medium text-ink">
          닫기
        </button>
      </div>
    </dialog>
  );
}

export function Gallery({ items, label }: { items?: MediaData[]; label: string }) {
  const list = (items ?? []).filter((m) => m.src);
  const [open, setOpen] = useState<MediaData | null>(null);

  if (list.length === 0) return null;

  // 세로가 긴 자료(모바일 캡처 등)는 한 줄에 더 많이 놓는다
  const portrait = list.every((m) => {
    const [w, h] = (m.ratio ?? '16 / 10').split('/').map(Number);
    return h > w;
  });
  const cols =
    list.length === 1 ? '' : portrait ? 'grid-cols-2 sm:grid-cols-3' : list.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3';

  return (
    <>
      <ul aria-label={label} className={`grid gap-x-4 gap-y-8 sm:gap-x-6 ${cols}`}>
        {list.map((media, i) => (
          <li key={media.src}>
            <Reveal delay={i * 0.05}>
              <figure>
                <Media media={media} onOpen={media.kind === 'image' ? () => setOpen(media) : undefined} />
                {media.caption && <figcaption className="meta mt-2.5 text-muted">{media.caption}</figcaption>}
              </figure>
            </Reveal>
          </li>
        ))}
      </ul>

      <Lightbox media={open} onClose={() => setOpen(null)} />
    </>
  );
}
