import { Link } from 'react-router';
import { Reveal } from '../components/Reveal';
import { TextLink } from '../components/TextLink';
import { about, career } from '../data/about';

/** About: 소개 글, 커리어가 넓어진 순서, 경력 타임라인 */
export function AboutPreview() {
  return (
    <section id="about" aria-labelledby="about-title" className="shell py-14 md:py-32">
      <div className="grid gap-8 border-t border-fg pt-5 md:grid-cols-12 md:gap-10">
        <h2 id="about-title" className="text-title leading-none font-bold tracking-[-0.04em] md:col-span-4">
          About
        </h2>
        <div className="md:col-span-8">
          <Reveal className="max-w-[44rem]">
            <p className="text-lead leading-[1.45] font-semibold tracking-[-0.02em]">{about.paragraphs[0]}</p>
            <div className="mt-6 space-y-3 text-[1.0625rem] leading-[1.7]">
              {about.paragraphs.slice(1).map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.05}>
            <ol aria-label="커리어 흐름" className="mt-10 flex flex-wrap gap-x-2 gap-y-2 md:mt-14">
              {about.path.map((step, i) => (
                <li key={step} className="flex items-center gap-2">
                  <span className={`px-3 py-1.5 text-[0.9375rem] font-semibold ${i === about.path.length - 1 ? 'bg-accent text-ink' : 'border border-fg'}`}>
                    {step}
                  </span>
                  {i < about.path.length - 1 && (
                    <span aria-hidden="true" className="font-mono text-muted">
                      →
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </div>

      <h3 className="mt-14 border-t border-fg pt-5 text-title leading-none font-bold tracking-[-0.04em] md:mt-24">Experience</h3>
      <ol className="mt-6 md:mt-10">
        {career.map((job) => (
          <li key={job.organization} className="border-b border-rule first:border-t">
            <Reveal className="grid gap-x-10 gap-y-3 py-6 md:grid-cols-12 md:py-8">
              <p className="font-mono text-[0.9375rem] md:col-span-3 md:text-base">{job.period}</p>
              <div className="md:col-span-4">
                <h4 className="text-2xl leading-tight font-semibold tracking-[-0.03em]">{job.organization}</h4>
                <p className="mt-1 text-muted">{job.role}</p>
              </div>
              <div className="md:col-span-5">
                <ul className="flex flex-wrap gap-x-1.5 gap-y-1.5 text-[0.9375rem]">
                  {job.tasks.map((task) => (
                    <li key={task} className="border border-rule px-2 py-1 leading-snug">
                      {task}
                    </li>
                  ))}
                </ul>
                {job.link && (
                  <p className="mt-4 text-[0.9375rem]">
                    <TextLink link={job.link} />
                  </p>
                )}
              </div>
            </Reveal>
          </li>
        ))}
      </ol>
      <p className="mt-5 text-[0.9375rem] text-muted">
        대학 신문사 기사와 기획안은{' '}
        <Link to={{ pathname: '/', hash: '#archive' }} className="link font-medium text-fg">
          Creative Archive
        </Link>
        의 Editorial &amp; PR에 정리했습니다.
      </p>
    </section>
  );
}
