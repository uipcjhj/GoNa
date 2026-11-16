import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { WorkCard } from '../components/WorkCard';
import { WorkModal } from '../components/WorkModal';
import { WORK_CATEGORIES, countByCategory, thumbnailOf, works, type WorkCategory } from '../data/works';
import { usePage } from '../lib/usePage';

type Filter = 'All' | WorkCategory;
const FILTERS: Filter[] = ['All', ...WORK_CATEGORIES];
const count = (f: Filter) => (f === 'All' ? works.length : countByCategory(f));
const withImage = works.filter(thumbnailOf).length;

/** Creative Archive 전체 갤러리. 주소의 ?category= 와 ?work= 로 필터와 열린 작업물을 기억한다. */
export default function ArchivePage() {
  usePage();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>('All');
  const [openId, setOpenId] = useState<string | null>(null);

  // 미리 만든 HTML 과 어긋나지 않도록 마운트 뒤에 주소를 읽는다
  const fromCategory = params.get('category');
  const fromWork = params.get('work');
  useEffect(() => {
    setFilter(FILTERS.find((f) => f === fromCategory) ?? 'All');
    setOpenId(fromWork);
  }, [fromCategory, fromWork]);

  const update = (next: { category?: Filter; work?: string | null }) => {
    const category = next.category ?? filter;
    const work = next.work === undefined ? openId : next.work;
    setFilter(category);
    setOpenId(work);
    const q: Record<string, string> = {};
    if (category !== 'All') q.category = category;
    if (work) q.work = work;
    setParams(q, { replace: true, preventScrollReset: true });
  };

  const list = filter === 'All' ? works : works.filter((w) => w.category === filter);
  const open = works.find((w) => w.id === openId) ?? null;

  return (
    <div className="shell pt-14 pb-24 md:pt-24 md:pb-32">
      <h1 className="text-display leading-none font-bold tracking-[-0.05em]">Creative Archive</h1>
      <p className="mt-5 max-w-[38rem] text-muted">
        영상, 디자인, 웹, 글까지 직접 만들어 온 작업물 {works.length}건입니다. 이미지나 영상이 확인된 {withImage}건은 썸네일로, 나머지는 제목으로 정리했습니다.
      </p>

      <div role="group" aria-label="작업물 유형 필터" className="mt-10 flex flex-wrap gap-2 border-t border-fg pt-5 md:mt-14">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => update({ category: f })}
            className={`flex cursor-pointer items-baseline gap-2 border px-3.5 py-2 text-[0.9375rem] font-medium transition-colors duration-300 ${
              filter === f ? 'border-fg bg-fg text-bg' : 'border-rule hover:border-fg'
            }`}
          >
            {f}
            <span className="meta opacity-70">{String(count(f)).padStart(2, '0')}</span>
          </button>
        ))}
      </div>
      <p className="sr-only" role="status">
        {filter === 'All' ? '전체' : filter} 작업물 {list.length}건
      </p>

      {/* 높이가 다른 카드가 자연스럽게 쌓이도록 단(column)으로 배치한다 */}
      <ul className="mt-8 columns-2 gap-x-4 sm:gap-x-6 md:mt-12 lg:columns-3 lg:gap-x-8 max-[359px]:columns-1">
        <AnimatePresence mode="popLayout" initial={false}>
          {list.map((work) => (
            <motion.li
              key={work.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
              className="mb-8 break-inside-avoid sm:mb-10"
            >
              <WorkCard work={work} onOpen={() => update({ work: work.id })} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <WorkModal work={open} onClose={() => update({ work: null })} />
    </div>
  );
}
