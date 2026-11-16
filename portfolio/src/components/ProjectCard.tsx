import { Link } from 'react-router';
import type { Project } from '../data/types';
import { Cover } from './Cover';

interface Props {
  project: Project;
  priority?: boolean;
  /** 목록에서 비율을 통일하고 싶을 때 */
  ratio?: string;
}

export function ProjectCard({ project, priority = false, ratio }: Props) {
  return (
    <Link to={`/work/${project.slug}/`} className="group block focus-visible:outline-offset-8">
      <div className="relative">
        <Cover cover={project.cover} ratio={ratio} zoom priority={priority} />
        <span
          aria-hidden="true"
          className="meta absolute right-0 bottom-0 translate-y-2 bg-fg px-3 py-2 font-medium text-bg opacity-0 transition duration-300 ease-out-soft group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
        >
          View project
        </span>
      </div>
      <h3 className="mt-4 text-[1.375rem] leading-tight font-semibold tracking-[-0.02em] sm:text-2xl">
        <span className="bg-[linear-gradient(#c8ff5f,#c8ff5f)] bg-[length:0%_100%] bg-no-repeat transition-[background-size,color] duration-500 ease-out-soft group-hover:bg-[length:100%_100%] group-hover:text-ink">
          {project.title}
        </span>
      </h3>
      <p className="mt-2 text-[0.9375rem] text-muted">{project.summary}</p>
      <p className="meta mt-3 text-muted">
        {project.category}
        <span className="mx-2">|</span>
        {project.period}
      </p>
    </Link>
  );
}
