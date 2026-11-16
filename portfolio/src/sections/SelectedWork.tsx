import { Link } from 'react-router';
import { Cover } from '../components/Cover';
import { ProjectCard } from '../components/ProjectCard';
import { Reveal } from '../components/Reveal';
import { moreWork, projects, selectedWork } from '../data/projects';

// 데스크톱에서 넓은 카드와 좁은 카드를 엇갈리게 놓는다
const LAYOUT = [
  { span: 'md:col-span-7', ratio: '16 / 10' },
  { span: 'md:col-span-5 md:mt-28', ratio: '4 / 5' },
  { span: 'md:col-span-5', ratio: '4 / 5' },
  { span: 'md:col-span-7 md:mt-28', ratio: '16 / 10' },
];

export function SelectedWork() {
  return (
    <section id="work" aria-labelledby="work-title" className="shell py-14 md:py-32">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 border-t border-fg pt-5">
        <h2 id="work-title" className="text-display leading-none font-bold tracking-[-0.05em]">
          Selected Work
        </h2>
        <Link to="/work/" className="link meta mb-2">
          All projects ({String(projects.length).padStart(2, '0')})
        </Link>
      </div>
      <div className="mt-12 grid gap-x-8 gap-y-14 md:mt-20 md:grid-cols-12 md:gap-x-10 md:gap-y-24">
        {selectedWork.map((project, i) => (
          <Reveal key={project.slug} className={LAYOUT[i % LAYOUT.length].span}>
            <ProjectCard project={project} ratio={LAYOUT[i % LAYOUT.length].ratio} />
          </Reveal>
        ))}
      </div>

      <h2 className="mt-16 border-t border-fg pt-5 text-title leading-none font-bold tracking-[-0.04em] md:mt-40">
        More Work
      </h2>
      <ul className="mt-8 md:mt-12">
        {moreWork.map((project) => (
          <li key={project.slug} className="border-b border-rule first:border-t">
            <Reveal>
              <Link
                to={`/work/${project.slug}/`}
                className="group grid gap-x-10 gap-y-4 py-6 md:grid-cols-[1fr_16rem] md:items-center md:py-8"
              >
                <div>
                  <p className="meta text-muted">
                    {project.category}
                    <span className="mx-2">|</span>
                    {project.period}
                  </p>
                  <h3 className="mt-2 text-title leading-[1.12] font-semibold tracking-[-0.03em]">
                    <span className="bg-[linear-gradient(#c8ff5f,#c8ff5f)] bg-[length:0%_100%] bg-no-repeat transition-[background-size,color] duration-500 ease-out-soft group-hover:bg-[length:100%_100%] group-hover:text-ink">
                      {project.title}
                    </span>
                  </h3>
                  <p className="mt-3 max-w-[40rem] text-[0.9375rem] text-muted">{project.summary}</p>
                </div>
                {/* 좁은 화면에서는 글만 보여 줘 목록을 짧게 유지한다 */}
                <Cover cover={project.cover} ratio="16 / 10" zoom className="max-md:hidden" />
              </Link>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
