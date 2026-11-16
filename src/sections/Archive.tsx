import { Link, useNavigate } from 'react-router';
import { Reveal } from '../components/Reveal';
import { WorkCard } from '../components/WorkCard';
import { WORK_CATEGORIES, countByCategory, featuredWorks, works } from '../data/works';

/** 홈의 Creative Archive 미리보기: 대표 작업물 몇 개와 전체 갤러리로 가는 길 */
export function Archive() {
  const navigate = useNavigate();
  return (
    <section id="archive" aria-labelledby="archive-title" className="shell py-14 md:py-32">
      <div className="grid gap-4 border-t border-fg pt-5 md:grid-cols-12 md:gap-10">
        <h2 id="archive-title" className="text-display leading-none font-bold tracking-[-0.05em] md:col-span-7">
          Creative Archive
        </h2>
        <p className="text-muted md:col-span-5 md:self-end">영상, 디자인, 웹, 글까지 직접 만들어 온 작업물을 모았습니다.</p>
      </div>

      <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 md:mt-14 lg:grid-cols-4 lg:gap-x-8 lg:gap-y-12">
        {featuredWorks.slice(0, 8).map((work, i) => (
          <li key={work.id}>
            <Reveal delay={(i % 4) * 0.05}>
              <WorkCard work={work} uniform onOpen={() => navigate(`/archive/?work=${work.id}`)} />
            </Reveal>
          </li>
        ))}
      </ul>

      <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4 border-t border-rule pt-5 md:mt-14">
        <Link to="/archive/" className="bg-fg px-5 py-3 font-semibold text-bg transition-colors duration-300 hover:bg-accent hover:text-ink">
          전체 작업물 보기 <span className="meta ml-1 opacity-80">{works.length}</span>
        </Link>
        <ul className="meta flex flex-wrap gap-x-5 gap-y-1 text-muted">
          {WORK_CATEGORIES.map((c) => (
            <li key={c}>
              <Link to={`/archive/?category=${c}`} className="link">
                {c} {String(countByCategory(c)).padStart(2, '0')}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
