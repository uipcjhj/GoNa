import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Body } from '../components/Body';
import { Approach, FeaturedItems, Flow, Groups, Milestone, Shift, Tags } from '../components/Blocks';
import { Cover } from '../components/Cover';
import { Gallery, Lightbox } from '../components/Gallery';
import { Reveal } from '../components/Reveal';
import { ChangeBars, KpiPanel } from '../components/Stats';
import { TextLink } from '../components/TextLink';
import { findProject, projects } from '../data/projects';
import type { Media, Project } from '../data/types';
import { useSectionSpy } from '../lib/sections';
import { usePage } from '../lib/usePage';
import NotFound from './NotFound';

const num = (i: number) => String(i + 1).padStart(2, '0');
const has = (list?: Media[]) => Boolean(list?.some((m) => m.src));

/** 프로젝트에 내용이 있는 영역만 순서대로 고른다 */
function sectionsOf(p: Project) {
  const f = p.featured;
  const featured = Boolean(f && (f.milestone || f.items?.length || has(f.media)));
  return [
    { id: 'key-information', en: 'Key Information', ko: '핵심 정보', show: true },
    { id: 'featured-results', en: 'Featured Results', ko: '대표 결과물', show: featured },
    { id: 'process', en: 'Process', ko: '과정', show: Boolean(p.process) },
    { id: 'outcome', en: 'Outcome', ko: '결과', show: Boolean(p.outcome) },
    { id: 'notes', en: 'Notes', ko: '본문', show: Boolean(p.body?.length) },
  ].filter((s) => s.show);
}

function SectionTitle({ id, index, total, en, ko }: { id: string; index: number; total: number; en: string; ko: string }) {
  return (
    <h2 id={`${id}-title`} className="mb-7 flex flex-wrap items-baseline gap-x-4 md:mb-10">
      <span className="meta text-muted">
        {num(index)} / {num(total - 1)}
      </span>
      <span className="text-title leading-tight font-semibold tracking-[-0.03em]">{en}</span>
      <span className="text-[0.9375rem] text-muted">{ko}</span>
    </h2>
  );
}

export default function ProjectDetail() {
  usePage();
  const { slug } = useParams();
  const project = findProject(slug);
  const [active, setActive] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState<Media | null>(null);

  const sections = useMemo(() => (project ? sectionsOf(project) : []), [project]);
  const ids = useMemo(() => sections.map((s) => s.id), [sections]);
  useSectionSpy(ids, useCallback((id: string | null) => setActive((prev) => id ?? prev), []));

  // AI Lab 프로젝트는 상세 페이지 전체가 다크 테마
  const dark = project?.theme === 'dark';
  useEffect(() => {
    if (!dark) return;
    const root = document.documentElement;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    root.dataset.theme = 'dark';
    themeColor?.setAttribute('content', '#17191B');
    return () => {
      delete root.dataset.theme;
      themeColor?.setAttribute('content', '#F7F7F2');
    };
  }, [dark]);

  if (!project) return <NotFound />;

  const index = projects.indexOf(project);
  const next = projects[(index + 1) % projects.length];
  const split = project.header === 'split';
  const facts = [
    ['Category', project.category],
    ['Period', project.period],
    [project.organization ? 'Organization' : 'Type', project.organization ?? project.type],
    ['Status', project.status],
  ].filter((f): f is [string, string] => Boolean(f[1]));
  const { featured, process, outcome } = project;
  const order = (id: string) => ({ id, index: ids.indexOf(id), total: ids.length });
  const SECTION = 'border-t border-rule py-10 first:border-fg md:py-16';

  return (
    <article className="shell pt-8 pb-20 md:pt-12 md:pb-32">
      <p className="meta flex items-baseline justify-between gap-4">
        <Link to="/work/" className="link">
          All projects
        </Link>
        <span className="text-muted">
          {num(index)} / {num(projects.length - 1)}
        </span>
      </p>

      {/* ── Hero ── */}
      <header className={`mt-7 md:mt-12 ${split ? 'lg:grid lg:grid-cols-12 lg:items-end lg:gap-10' : ''}`}>
        <div className={split ? 'lg:col-span-7' : ''}>
          <h1
            className={`leading-[1.02] font-bold tracking-[-0.045em] ${
              split ? 'text-[clamp(2.25rem,1rem+4.6vw,5rem)]' : 'max-w-[20ch] text-[clamp(2.25rem,1rem+6vw,6.5rem)]'
            }`}
          >
            {project.title}
          </h1>
          <p className="mt-5 max-w-[44rem] text-lead leading-[1.45] font-semibold tracking-[-0.02em] md:mt-6">{project.summary}</p>
        </div>
        <Cover
          cover={project.cover}
          ratio={split ? '4 / 5' : '16 / 9'}
          priority
          className={split ? 'mt-8 max-lg:[aspect-ratio:16/10]! lg:col-span-5 lg:mt-0' : 'mt-8 md:mt-12'}
        />
      </header>

      <div className="mt-12 lg:mt-20 lg:grid lg:grid-cols-12 lg:gap-10">
        {/* 영역 바로가기 — 넓은 화면에서만 옆에 고정 */}
        <nav aria-label="프로젝트 구성" className="hidden lg:col-span-3 lg:block">
          <ol className="sticky top-24">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={active === s.id ? 'step' : undefined}
                  className={`flex items-baseline gap-3 py-1.5 transition-colors duration-300 ${
                    active === s.id ? 'text-fg' : 'text-muted hover:text-fg'
                  }`}
                >
                  <span className="meta">{num(i)}</span>
                  <span className={`font-medium ${active === s.id ? 'bg-accent px-1 text-ink' : 'px-1'}`}>{s.en}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="lg:col-span-9">
          {/* ── Key Information ── */}
          <section id="key-information" aria-labelledby="key-information-title" className={SECTION}>
            <SectionTitle {...order('key-information')} en="Key Information" ko="핵심 정보" />
            <div className="grid gap-x-10 gap-y-8 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <dl className="grid grid-cols-2 gap-x-6 self-start border-t border-fg md:grid-cols-1">
                {facts.map(([label, value]) => (
                  <div key={label} className="border-b border-rule py-3">
                    <dt className="meta text-muted">{label}</dt>
                    <dd className="mt-0.5 font-medium">{value}</dd>
                  </div>
                ))}
              </dl>

              <Reveal>
                <h3 className="meta border-b border-fg pb-3 text-muted">My role</h3>
                <dl>
                  {project.scope.map((group) => (
                    <div key={group.label} className="grid gap-x-6 gap-y-1 border-b border-rule py-3 sm:grid-cols-[7.5rem_1fr]">
                      <dt className="font-semibold">{group.label}</dt>
                      <dd>
                        <ul className="space-y-1 text-[0.9375rem] sm:text-base">
                          {group.items.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                  ))}
                </dl>
                {project.related && (
                  <p className="mt-5 text-[0.9375rem] text-muted">
                    {project.related.text} <TextLink link={project.related.link} className="link font-medium text-fg" />
                  </p>
                )}
              </Reveal>
            </div>
          </section>

          {/* ── Featured Results: 등록된 자료가 맨 위 ── */}
          {featured && ids.includes('featured-results') && (
            <section id="featured-results" aria-labelledby="featured-results-title" className={SECTION}>
              <SectionTitle {...order('featured-results')} en="Featured Results" ko="대표 결과물" />
              <div className="space-y-10">
                <Gallery items={featured.media} label={`${project.title} 대표 결과물`} />
                {featured.note && <p className="max-w-[40rem] border-l-4 border-accent pl-4 text-[0.9375rem] text-muted">{featured.note}</p>}
                {featured.milestone && (
                  <Reveal>
                    <Milestone milestone={featured.milestone} />
                  </Reveal>
                )}
                {featured.items && (
                  <Reveal>
                    <FeaturedItems items={featured.items} onOpen={(item) => setZoomed(item.media ?? null)} />
                  </Reveal>
                )}
              </div>
            </section>
          )}

          {/* ── Process ── */}
          {process && (
            <section id="process" aria-labelledby="process-title" className={SECTION}>
              <SectionTitle {...order('process')} en="Process" ko="과정" />
              <Reveal className="space-y-8 md:space-y-10">
                {process.challenge && (
                  <p className="max-w-[42rem] text-[1.125rem] leading-[1.6] font-medium md:text-[1.3125rem]">{process.challenge}</p>
                )}
                {process.shift && <Shift shift={process.shift} />}
                {process.approach && <Approach items={process.approach} />}
                {process.flow && <Flow steps={process.flow} />}
                {process.groups && <Groups groups={process.groups} style={process.groupStyle} />}
                {process.tags && <Tags tags={process.tags} />}
                {process.note && <p className="max-w-[38rem] border-l-4 border-accent pl-4 text-[0.9375rem] text-muted">{process.note}</p>}
                <Gallery items={process.media} label={`${project.title} 작업 과정`} />
              </Reveal>
            </section>
          )}

          {/* ── Outcome: 끝난 일과 진행 중인 일을 나눠 적는다 ── */}
          {outcome && (
            <section id="outcome" aria-labelledby="outcome-title" className={SECTION}>
              <SectionTitle {...order('outcome')} en="Outcome" ko="결과" />
              <Reveal className="space-y-8">
                {(outcome.done || outcome.ongoing) && (
                  <dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
                    {(
                      [
                        ['완료', outcome.done, 'bg-accent'],
                        ['진행 중', outcome.ongoing, ''],
                      ] as const
                    ).map(
                      ([label, items, fill]) =>
                        items && (
                          <div key={label}>
                            <dt className="meta flex items-center gap-2 border-b border-fg pb-3">
                              <span aria-hidden="true" className={`block h-3 w-3 border border-fg ${fill}`} />
                              {label}
                            </dt>
                            <dd>
                              <ul>
                                {items.map((item) => (
                                  <li key={item} className="border-b border-rule py-3 text-lg leading-snug font-semibold tracking-[-0.02em]">
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            </dd>
                          </div>
                        ),
                    )}
                  </dl>
                )}
                {outcome.metrics && <KpiPanel metrics={outcome.metrics} />}
                {outcome.changes && <ChangeBars changes={outcome.changes} />}
                {outcome.next && (
                  <div className="max-w-[40rem] space-y-4 text-[1.0625rem]">
                    {outcome.next.text.map((t) => (
                      <p key={t}>{t}</p>
                    ))}
                    <p>
                      <TextLink link={outcome.next.link} />
                    </p>
                  </div>
                )}
                {outcome.note && <p className="max-w-[38rem] border-l-4 border-accent pl-4 text-[0.9375rem] text-muted">{outcome.note}</p>}
              </Reveal>
            </section>
          )}

          {/* ── 자유 본문 (관리자 화면에서 추가한 블록) ── */}
          {project.body && project.body.length > 0 && (
            <section id="notes" aria-labelledby="notes-title" className={SECTION}>
              <SectionTitle {...order('notes')} en="Notes" ko="본문" />
              <Body blocks={project.body} label={project.title} />
            </section>
          )}
        </div>
      </div>

      <Lightbox media={zoomed} onClose={() => setZoomed(null)} />

      <Link to={`/work/${next.slug}/`} className="group mt-8 block border-t border-fg pt-5 md:mt-16">
        <span className="meta text-muted">Next project</span>
        <span className="mt-2 block text-[clamp(2rem,1rem+5vw,5.5rem)] leading-[1.04] font-bold tracking-[-0.045em]">
          <span className="bg-[linear-gradient(#c8ff5f,#c8ff5f)] bg-[length:0%_100%] bg-no-repeat transition-[background-size,color] duration-500 ease-out-soft group-hover:bg-[length:100%_100%] group-hover:text-ink">
            {next.title}
          </span>
        </span>
      </Link>
    </article>
  );
}
