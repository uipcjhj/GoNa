import { Gallery } from '../components/Gallery';
import { Reveal } from '../components/Reveal';
import { TextLink } from '../components/TextLink';
import { archive } from '../data/archive';
import type { Media } from '../data/types';

/** 이전 작업물 목록. 이미지가 등록된 항목은 갤러리로, 나머지는 글 목록으로 보여 준다. */
export function Archive() {
  return (
    <section id="archive" aria-labelledby="archive-title" className="shell py-14 md:py-32">
      <div className="grid gap-4 border-t border-fg pt-5 md:grid-cols-12 md:gap-10">
        <h2 id="archive-title" className="text-display leading-none font-bold tracking-[-0.05em] md:col-span-7">
          Creative Archive
        </h2>
        <p className="text-muted md:col-span-5 md:self-end">영상, 디자인, 웹, 글까지 직접 만들어 온 작업물을 분야별로 모았습니다.</p>
      </div>

      <div className="mt-10 md:mt-16">
        {archive.map((category) => {
          const media = category.items.map((i) => i.media).filter((m): m is Media => Boolean(m?.src));
          return (
            <Reveal key={category.id} className="grid gap-x-10 gap-y-4 border-t border-rule py-6 first:border-fg md:grid-cols-12 md:py-8">
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
                    <li key={item.title + (item.context ?? '')} className="border-b border-rule py-2.5">
                      <span className="block leading-snug font-medium">
                        {item.link ? <TextLink link={{ ...item.link, label: item.title }} /> : item.title}
                      </span>
                      {item.context && <span className="meta mt-0.5 block text-muted">{item.context}</span>}
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
