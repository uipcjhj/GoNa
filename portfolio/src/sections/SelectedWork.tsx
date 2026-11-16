import { Link } from 'react-router';
import { ProjectCard } from '../components/ProjectCard';
import { Reveal } from '../components/Reveal';
import { projects, selectedWork } from '../data/projects';

// 데스크톱에서 넓은 카드와 좁은 카드를 엇갈리게 놓는다
const SPAN = ['md:col-span-7', 'md:col-span-5 md:mt-28', 'md:col-span-5', 'md:col-span-7 md:mt-28'];

export function SelectedWork() {
  return (
    <section id="work" aria-labelledby="work-title" className="shell py-20 md:py-32">
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
          <Reveal key={project.slug} className={SPAN[i % SPAN.length]}>
            <ProjectCard project={project} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
