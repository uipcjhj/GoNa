import { useInView } from 'motion/react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { DraftTag } from '../components/DraftTag';
import { Media } from '../components/Media';
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
    <section id="ai-lab" ref={ref} aria-labelledby="lab-title" className="shell py-24 md:py-40">
      <div className="grid gap-6 border-t border-fg pt-5 md:grid-cols-12 md:gap-10">
        <h2 id="lab-title" className="text-display leading-none font-bold tracking-[-0.05em] md:col-span-7">
          AI Lab
        </h2>
        <p className="text-lead leading-[1.45] font-semibold tracking-[-0.02em] md:col-span-5 md:self-end">
          AI를 활용해 직접 만든 자동화 도구, 웹서비스, 게임을 모았습니다.
        </p>
      </div>

      <ul className="mt-12 md:mt-20">
        {labProjects.map((project, i) => (
          <li key={project.slug} className="border-b border-rule first:border-t">
            <Reveal delay={i * 0.05}>
              <Link
                to={`/work/${project.slug}/`}
                className="group grid grid-cols-[1fr_5.5rem] items-center gap-x-4 gap-y-1 py-5 md:grid-cols-[10rem_1fr_11rem] md:gap-x-10 md:py-7"
              >
                <p className="meta col-span-2 text-muted md:col-span-1">{project.kind}</p>
                <div>
                  <h3 className="text-title leading-[1.15] font-semibold tracking-[-0.03em]">
                    <span className="bg-[linear-gradient(#c8ff5f,#c8ff5f)] bg-[length:0%_100%] bg-no-repeat transition-[background-size,color] duration-500 ease-out-soft group-hover:bg-[length:100%_100%] group-hover:text-ink">
                      {project.title}
                    </span>
                    {project.placeholder && <DraftTag className="ml-3 text-muted" />}
                  </h3>
                  <p className="mt-2 max-w-[38rem] text-[0.9375rem] text-muted">{project.summary}</p>
                </div>
                <Media media={{ ...project.cover, ratio: '4 / 3' }} zoom />
              </Link>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
