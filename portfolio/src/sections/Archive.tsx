import { useState } from 'react';
import { Gallery } from '../components/Gallery';
import { Reveal } from '../components/Reveal';
import { TextLink } from '../components/TextLink';
import { archive } from '../data/archive';
import type { Media } from '../data/types';

const total = archive.reduce((n, c) => n + c.items.length, 0);

/** 이전 작업물 목록. 분야별로 골라 볼 수 있고, 이미지가 등록된 항목은 갤러리로 보여 준다. */
export function Archive() {
  const [selected, setSelected] = useState<string | null>(null);
  const list = selected ? archive.filter((c) => c.id === selected) : archive;
  const chip = (active: boolean) =>
    `flex cursor-pointer items-baseline gap-2 border px-3 py-1.5 text-[0.9375rem] font-medium transition-colors duration-300 ${
      active ? 'border-fg bg-fg text-bg' : 'border-rule hover:border-fg'
    }`;

  return (
    <section id="archive" aria-labelledby="archive-title" className="shell py-14 md:py-32">
      <div className="grid gap-4 border-t border-fg pt-5 md:grid-cols-12 md:gap-10">
        <h2 id="archive-title" className="text-display leading-none font-bold tracking-[-0.05em] md:col-span-7">
          Creative Archive
        </h2>
        <p className="text-muted md:col-span-5 md:self-end">영상, 디자인, 웹, 글까지 직접 만들어 온 작업물을 분야별로 모았습니다.</p>
      </div>

      <div role="group" aria-label="아카이브 분야" className="mt-8 flex flex-wrap gap-2 md:mt-12">
        <button type="button" aria-pressed={selected === null} onClick={() => setSelected(null)} className={chip(selected === null)}>
          All <span className="meta opacity-70">{String(total).padStart(2, '0')}</span>
        </button>
        {archive.map((c) => (
          <button key={c.id} type="button" aria-pressed={selected === c.id} onClick={() => setSelected(c.id)} className={chip(selected === c.id)}>
            {c.title} <span className="meta opacity-70">{String(c.items.length).padStart(2, '0')}</span>
          </button>
        ))}
      </div>
      <p className="sr-only" role="status">
        {selected ? list[0].title : '전체'} 분야 표시
      </p>

      <div className="mt-6 md:mt-10">
        {list.map((category) => {
          const media = category.items.map((i) => i.media).filter((m): m is Media => Boolean(m?.src));
          return (
            <Reveal key={category.id} className="grid gap-x-10 gap-y-3 border-t border-rule py-5 first:border-fg md:grid-cols-12 md:py-8">
              <h3 className="md:col-span-4">
                <span className="block text-2xl leading-tight font-semibold tracking-[-0.03em] md:text-[1.75rem]">{category.title}</span>
                <span className="mt-1 block text-[0.9375rem] text-muted">{category.ko}</span>
              </h3>
              <div className="md:col-span-8">
                {media.length > 0 && (
                  <div className="mb-6">
                    <Gallery items={media} label={`${category.title} 작업물`} />
                  </div>
                )}
                <ul className="grid gap-x-8 sm:grid-cols-2">
                  {category.items.map((item) => (
                    <li key={item.title} className="flex items-baseline justify-between gap-4 border-b border-rule py-2.5">
                      <span className="leading-snug font-medium">
                        {item.link ? <TextLink link={{ ...item.link, label: item.title }} /> : item.title}
                      </span>
                      {item.context && <span className="meta shrink-0 text-muted">{item.context}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
