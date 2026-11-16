import { useInView } from 'motion/react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { Cover } from '../components/Cover';
import { Reveal } from '../components/Reveal';
import { labProjects } from '../data/projects';

/** 이 영역이 화면 가운데에 오면 사이트 전체가 다크 테마로 바뀐다. */
export function Lab() {
  const ref = useRef<HTMLElement>(null);
  const centered = useInView(ref, { margin: '-45% 0px -45% 0px' });

  useEffect(() => {
    const root = document.documentElement;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (centered) root.dataset.theme = 'dark';
    else delete root.dataset.theme;
    themeColor?.setAttribute('content', centered ? '#17191B' : '#F7F7F2');
    return () => {
      delete root.dataset.theme;
      themeColor?.setAttribute('content', '#F7F7F2');
    };
  }, [centered]);

  return (
    <section id="ai-lab" ref={ref} aria-labelledby="lab-title" className="shell py-16 md:py-40">
      <div className="grid gap-6 border-t border-fg pt-5 md:grid-cols-12 md:gap-10">
        <h2 id="lab-title" className="text-display leading-none font-bold tracking-[-0.05em] md:col-span-7">
          AI Lab
        </h2>
        <p className="text-lead leading-[1.45] font-semibold tracking-[-0.02em] md:col-span-5 md:self-end">
          AI를 활용해 반복 업무를 개선하는 도구와 웹게임을 직접 기획하고 구현합니다.
        </p>
      </div>

      <ul className="mt-12 grid gap-x-10 gap-y-16 md:mt-20 md:grid-cols-2">
        {labProjects.map((project, i) => (
          <li key={project.slug}>
            <Reveal delay={i * 0.06}>
              <Link to={`/work/${project.slug}/`} className="group block focus-visible:outline-offset-8">
                <Cover cover={project.cover} ratio="16 / 10" zoom />
                <p className="meta mt-5 flex flex-wrap gap-x-2 text-muted">
                  <span>{project.type}</span>
                  <span>|</span>
                  <span>{project.category}</span>
                </p>
                <h3 className="mt-2 text-title leading-[1.12] font-semibold tracking-[-0.03em]">
                  <span className="bg-[linear-gradient(#c8ff5f,#c8ff5f)] bg-[length:0%_100%] bg-no-repeat transition-[background-size,color] duration-500 ease-out-soft group-hover:bg-[length:100%_100%] group-hover:text-ink">
                    {project.title}
                  </span>
                </h3>
                <p className="mt-3 max-w-[36rem] text-[0.9375rem] text-muted">{project.summary}</p>
                {project.status && <p className="meta mt-4 inline-block border border-rule px-2 py-1">{project.status}</p>}
              </Link>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
