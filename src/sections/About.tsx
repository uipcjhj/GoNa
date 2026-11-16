import type { ReactNode } from 'react';
import { DraftTag } from '../components/DraftTag';
import { Reveal } from '../components/Reveal';
import { capabilities, careers, toolGroups } from '../data/about';

function Block({ label, ko, children }: { label: string; ko: string; children: ReactNode }) {
  return (
    <div className="grid gap-5 border-t border-rule py-10 md:grid-cols-12 md:gap-10 md:py-14">
      <h3 className="md:col-span-4">
        <span className="block text-2xl leading-tight font-semibold tracking-[-0.03em]">{label}</span>
        <span className="mt-1 block text-[0.9375rem] text-muted">{ko}</span>
      </h3>
      <div className="md:col-span-8">{children}</div>
    </div>
  );
}

export function About() {
  return (
    <section id="about" aria-labelledby="about-title" className="shell py-20 md:py-32">
      <h2 id="about-title" className="border-t border-fg pt-5 text-display leading-none font-bold tracking-[-0.05em]">
        About
      </h2>

      <div className="mt-12 md:mt-20">
        <Block label="Capabilities" ko="핵심 역량">
          <ul>
            {capabilities.map((c, i) => (
              <li key={c.en} className="border-b border-rule py-4 first:pt-0 last:border-b-0 last:pb-0">
                <Reveal delay={i * 0.04} className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                  <p className="text-xl leading-snug font-semibold tracking-[-0.02em] sm:text-2xl">{c.ko}</p>
                  <p className="text-[0.9375rem] text-muted">
                    <span className="meta block text-fg">{c.en}</span>
                    {c.note} {c.placeholder && <DraftTag />}
                  </p>
                </Reveal>
              </li>
            ))}
          </ul>
        </Block>

        <Block label="Experience" ko="경력">
          <ol>
            {careers.map((c, i) => (
              <li key={i} className="border-b border-rule py-4 first:pt-0 last:border-b-0 last:pb-0">
                <Reveal className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                  <div>
                    <p className="meta text-muted">{c.period}</p>
                    <p className="text-xl leading-snug font-semibold tracking-[-0.02em] sm:text-2xl">
                      {c.company} {c.placeholder && <DraftTag className="text-muted" />}
                    </p>
                  </div>
                  <p className="text-[0.9375rem] text-muted">
                    <span className="block text-fg">{c.role}</span>
                    {c.note}
                  </p>
                </Reveal>
              </li>
            ))}
          </ol>
        </Block>

        <Block label="Tools" ko="사용 도구">
          <dl className="grid gap-8 sm:grid-cols-3">
            {toolGroups.map((g) => (
              <Reveal key={g.label}>
                <dt className="meta mb-3 flex items-center gap-2 text-muted">
                  {g.label} {g.placeholder && <DraftTag />}
                </dt>
                {g.items.map((item, i) => (
                  <dd key={i} className={`border-t border-rule py-2 font-medium ${g.placeholder ? 'text-muted' : ''}`}>
                    {item}
                  </dd>
                ))}
              </Reveal>
            ))}
          </dl>
        </Block>
      </div>
    </section>
  );
}
