import { useEffect, useRef, useState } from 'react';
import type { Work } from '../data/works';
import { asset } from '../lib/asset';
import { Body, Prose } from './Body';
import { Media } from './Media';
import { TextLink } from './TextLink';

/**
 * 작업물 상세 창. 영상은 눌러서 재생하고, 이미지는 눌러서 크게 본다.
 * 여러 장이면 버튼·좌우 화살표 키·좌우로 밀기로 넘긴다.
 */
export function WorkModal({ work, onClose }: { work: Work | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [broken, setBroken] = useState(false);
  const swipe = useRef<number | null>(null);

  useEffect(() => {
    setIndex(0);
    setZoomed(false);
    setBroken(false);
    if (work && !dialog.current?.open) dialog.current?.showModal();
  }, [work]);

  if (!work) return null;
  const media = work.media ?? [];
  const current = media[index];
  const many = media.length > 1;
  const go = (step: number) => {
    setIndex((i) => (i + step + media.length) % media.length);
    setZoomed(false);
    setBroken(false);
  };
  const facts = [
    ['Type', work.category],
    ['Year', work.year],
    ['Organization', work.organization],
    ['Role', work.role],
    ['Award', work.award],
    ['Tags', work.tags?.join(' · ')],
  ].filter((f): f is [string, string] => Boolean(f[1]));

  return (
    <dialog
      ref={dialog}
      aria-labelledby="work-modal-title"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
      onKeyDown={(e) => {
        if (!many) return;
        if (e.key === 'ArrowRight') go(1);
        if (e.key === 'ArrowLeft') go(-1);
      }}
      className="m-auto max-h-[94dvh] w-[min(72rem,94vw)] max-w-none overflow-y-auto bg-bg p-0 text-fg backdrop:bg-ink/85"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-rule bg-bg px-4 py-2.5 sm:px-6">
        <p className="meta text-muted">
          {work.category}
          {many && (
            <span className="ml-3 text-fg" aria-live="polite">
              {index + 1} / {media.length}
            </span>
          )}
        </p>
        <button type="button" onClick={() => dialog.current?.close()} className="meta cursor-pointer bg-fg px-3 py-2 font-medium text-bg hover:bg-accent hover:text-ink">
          닫기
        </button>
      </div>

      <div className={`grid gap-x-8 gap-y-6 p-4 sm:p-6 ${current ? 'lg:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]' : ''}`}>
        {current && (
          <div
            onPointerDown={(e) => (swipe.current = e.clientX)}
            onPointerUp={(e) => {
              const dx = swipe.current === null ? 0 : e.clientX - swipe.current;
              swipe.current = null;
              if (many && Math.abs(dx) > 48) go(dx < 0 ? 1 : -1);
            }}
            className="min-w-0 touch-pan-y"
          >
            {current.kind === 'image' ? (
              broken ? (
                <p className="flex aspect-video items-center justify-center bg-wash px-6 text-center text-muted">이미지를 불러오지 못했습니다.</p>
              ) : (
                <button
                  type="button"
                  onClick={() => setZoomed((z) => !z)}
                  aria-label={zoomed ? '화면에 맞춰 보기' : '크게 보기'}
                  className={`block w-full bg-wash ${zoomed ? 'max-h-[80dvh] cursor-zoom-out overflow-auto' : 'cursor-zoom-in'}`}
                >
                  <img
                    key={current.src}
                    src={asset(current.src!)}
                    alt={current.alt}
                    onError={() => setBroken(true)}
                    draggable={false}
                    className={zoomed ? 'w-full max-w-none' : 'mx-auto max-h-[70dvh] w-auto max-w-full object-contain'}
                  />
                </button>
              )
            ) : (
              <Media key={current.src} media={current} />
            )}
            {many && (
              <div className="mt-3 flex items-center justify-between gap-3">
                <button type="button" onClick={() => go(-1)} className="meta cursor-pointer border border-fg px-4 py-2.5 font-medium hover:bg-accent hover:text-ink">
                  이전
                </button>
                <button type="button" onClick={() => go(1)} className="meta cursor-pointer border border-fg px-4 py-2.5 font-medium hover:bg-accent hover:text-ink">
                  다음
                </button>
              </div>
            )}
          </div>
        )}

        <div className="min-w-0">
          <h2 id="work-modal-title" className="text-[1.5rem] leading-[1.15] font-bold tracking-[-0.03em] text-balance sm:text-[1.875rem]">
            {work.title}
          </h2>
          {work.description && <p className="mt-3 text-[1.0625rem]">{work.description}</p>}
          <dl className="mt-6 border-t border-fg">
            {facts.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[6.5rem_1fr] gap-x-4 border-b border-rule py-2.5">
                <dt className="meta pt-0.5 text-muted">{label}</dt>
                <dd className="text-[0.9375rem] font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          {work.externalUrl && (
            <p className="mt-6">
              <TextLink
                link={work.externalUrl}
                className="inline-block bg-accent px-4 py-2.5 text-[0.9375rem] font-semibold text-ink transition-colors duration-300 hover:bg-fg hover:text-bg"
              />
            </p>
          )}
        </div>

        {(work.intent || work.process || work.result || work.body) && (
          <div className={`space-y-6 border-t border-fg pt-5 ${current ? 'lg:col-span-2' : ''}`}>
            {(
              [
                ['기획 의도', work.intent],
                ['제작 과정', work.process],
                ['결과', work.result],
              ] as const
            ).map(
              ([label, text]) =>
                text && (
                  <section key={label} className="max-w-[44rem]">
                    <h3 className="meta mb-2 text-muted">{label}</h3>
                    <Prose text={text} />
                  </section>
                ),
            )}
            <Body blocks={work.body} label={work.title} />
          </div>
        )}

        {work.documents && (
          <ol className={`border-t border-fg ${current ? 'lg:col-span-2' : ''} sm:columns-2 sm:gap-x-8`}>
            {work.documents.map((doc) => (
              <li key={doc.label + doc.title} className="break-inside-avoid border-b border-rule py-2.5">
                <span className="meta block text-muted">{doc.label}</span>
                <span className="block leading-snug font-medium">{doc.title}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </dialog>
  );
}
