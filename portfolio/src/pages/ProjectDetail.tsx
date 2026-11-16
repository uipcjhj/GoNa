import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router';
import { DraftTag } from '../components/DraftTag';
import { Media } from '../components/Media';
import { Reveal } from '../components/Reveal';
import { findProject, projects } from '../data/projects';
import { STEPS } from '../data/types';
import { useSectionSpy } from '../lib/sections';
import { usePage } from '../lib/usePage';
import NotFound from './NotFound';

const STEP_IDS = STEPS.map((s) => s.key);
const num = (i: number) => String(i + 1).padStart(2, '0');

export default function ProjectDetail() {
  usePage();
  const { slug } = useParams();
  const project = findProject(slug);
  const [active, setActive] = useState<string | null>(null);
  useSectionSpy(STEP_IDS, useCallback((id: string | null) => setActive((prev) => id ?? prev), []));

  if (!project) return <NotFound />;

  const index = projects.indexOf(project);
  const next = projects[(index + 1) % projects.length];
  const facts = [
    ['Category', project.kind ? `${project.category} / ${project.kind}` : project.category],
    ['Role', project.role],
    ['Period', project.period],
    ['Tools', project.tools?.join(', ')],
  ] as const;

  return (
    <article className="shell pt-10 pb-24 md:pt-16 md:pb-32">
      <Link to="/work/" className="link meta">
        All projects
      </Link>

      <header className="mt-8 md:mt-12">
        <h1 className="max-w-[18ch] text-[clamp(2.25rem,1rem+6vw,6.5rem)] leading-[1.02] font-bold tracking-[-0.045em]">
          {project.title}
        </h1>
        <p className="mt-5 max-w-[40rem] text-lead leading-[1.45] font-semibold tracking-[-0.02em]">
          {project.summary} {project.placeholder && <DraftTag className="text-muted" />}
        </p>

        <dl className="mt-10 grid grid-cols-2 gap-x-6 border-t border-fg md:mt-14 md:grid-cols-4 md:gap-x-10">
          {facts.map(([label, value]) => (
            <div key={label} className="border-b border-rule py-3.5">
              <dt className="meta text-muted">{label}</dt>
              <dd className={`mt-1 font-medium ${value ? '' : 'text-muted'}`}>{value ?? '입력 전'}</dd>
            </div>
          ))}
        </dl>

        {project.link && (
          <a
            href={project.link.href}
            target="_blank"
            rel="noreferrer"
            className="mt-8 inline-block bg-accent px-6 py-3.5 font-semibold text-ink transition-colors duration-300 hover:bg-fg hover:text-bg"
          >
            {project.link.label}
          </a>
        )}

        <Media media={project.cover} priority className="mt-10 md:mt-14" />
      </header>

      <div className="mt-16 lg:mt-24 lg:grid lg:grid-cols-12 lg:gap-10">
        {/* 진행 단계 표시 — 넓은 화면에서만 옆에 고정 */}
        <nav aria-label="프로젝트 구성" className="hidden lg:col-span-3 lg:block">
          <ol className="sticky top-24">
            {STEPS.map((step, i) => (
              <li key={step.key}>
                <a
                  href={`#${step.key}`}
                  aria-current={active === step.key ? 'step' : undefined}
                  className={`flex items-baseline gap-3 py-1.5 transition-colors duration-300 ${
                    active === step.key ? 'text-fg' : 'text-muted hover:text-fg'
                  }`}
                >
                  <span className="meta">{num(i)}</span>
                  <span className={`font-medium ${active === step.key ? 'bg-accent px-1 text-ink' : 'px-1'}`}>{step.en}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="lg:col-span-9">
          {STEPS.map((step, i) => {
            const content = project.steps[step.key];
            return (
              <section
                key={step.key}
                id={step.key}
                aria-labelledby={`${step.key}-title`}
                className="grid gap-4 border-t border-rule py-10 first:border-fg md:grid-cols-9 md:gap-10 md:py-16"
              >
                <h2 id={`${step.key}-title`} className="md:col-span-3">
                  <span className="meta block text-muted">
                    {num(i)} / {num(STEPS.length - 1)}
                  </span>
                  <span className="mt-1 block text-title leading-tight font-semibold tracking-[-0.03em]">{step.en}</span>
                  <span className="block text-[0.9375rem] text-muted">{step.ko}</span>
                </h2>
                <Reveal className="md:col-span-6">
                  {content.placeholder && <DraftTag className="mb-3 text-muted" />}
                  <div className={`max-w-[38rem] space-y-4 text-[1.0625rem] ${content.placeholder ? 'text-muted' : ''}`}>
                    {content.body.map((paragraph, k) => (
                      <p key={k}>{paragraph}</p>
                    ))}
                  </div>
                  {content.media && <Media media={content.media} className="mt-8" />}
                </Reveal>
              </section>
            );
          })}
        </div>
      </div>

      <Link to={`/work/${next.slug}/`} className="group mt-10 block border-t border-fg pt-5 md:mt-16">
        <span className="meta text-muted">Next project</span>
        <span className="mt-2 block text-display leading-[1.02] font-bold tracking-[-0.05em]">
          <span className="bg-[linear-gradient(#c8ff5f,#c8ff5f)] bg-[length:0%_100%] bg-no-repeat transition-[background-size,color] duration-500 ease-out-soft group-hover:bg-[length:100%_100%] group-hover:text-ink">
            {next.title}
          </span>
        </span>
      </Link>
    </article>
  );
}
