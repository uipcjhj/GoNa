import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ProjectCard } from '../components/ProjectCard';
import { projects } from '../data/projects';
import { CATEGORIES, type Category } from '../data/types';
import { usePage } from '../lib/usePage';

type Filter = 'All' | Category;
const FILTERS: Filter[] = ['All', ...CATEGORIES];
const count = (f: Filter) => (f === 'All' ? projects.length : projects.filter((p) => p.filter === f).length);

export default function WorkIndex() {
  usePage();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>('All');

  // 주소의 ?category= 값과 맞춘다 (미리 만든 HTML 과 어긋나지 않도록 마운트 뒤에 읽는다)
  const fromUrl = params.get('category');
  useEffect(() => {
    setFilter(FILTERS.find((f) => f === fromUrl) ?? 'All');
  }, [fromUrl]);

  const choose = (f: Filter) => {
    setFilter(f);
    setParams(f === 'All' ? {} : { category: f }, { replace: true, preventScrollReset: true });
  };

  const list = filter === 'All' ? projects : projects.filter((p) => p.filter === filter);

  return (
    <div className="shell pt-14 pb-24 md:pt-24 md:pb-32">
      <h1 className="text-display leading-none font-bold tracking-[-0.05em]">Work</h1>
      <p className="mt-5 max-w-[34rem] text-muted">
        회사에서 수행한 프로젝트 6개와 AI Lab 개인 프로젝트 2개입니다.
      </p>

      <div role="group" aria-label="카테고리 필터" className="mt-10 flex flex-wrap gap-2 border-t border-fg pt-5 md:mt-14">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => choose(f)}
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
        {filter === 'All' ? '전체' : filter} 프로젝트 {list.length}개
      </p>

      <ul className="mt-10 grid gap-x-8 gap-y-12 sm:grid-cols-2 md:mt-14 lg:grid-cols-3 lg:gap-x-10 lg:gap-y-16">
        <AnimatePresence mode="popLayout" initial={false}>
          {list.map((project) => (
            <motion.li
              key={project.slug}
              layout
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <ProjectCard project={project} ratio="16 / 10" />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
