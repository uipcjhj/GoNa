import { Reveal } from '../components/Reveal';
import { about } from '../data/about';

export function AboutPreview() {
  const { organization, team, role } = about.experience;
  return (
    <section id="about" aria-labelledby="about-title" className="shell py-14 md:py-32">
      <div className="grid gap-10 border-t border-fg pt-5 md:grid-cols-12">
        <h2 id="about-title" className="text-title leading-none font-bold tracking-[-0.04em] md:col-span-4">
          About
        </h2>
        <div className="md:col-span-8">
          <Reveal className="max-w-[44rem] space-y-5 text-lead leading-[1.5] font-medium tracking-[-0.02em]">
            {about.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </Reveal>

          <Reveal delay={0.05}>
            <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-rule pt-4 sm:grid-cols-3 md:mt-16">
              {[
                ['Organization', organization],
                ['Team', team],
                ['Role', role],
              ].map(([label, value]) => (
                <div key={label} className="first:max-sm:col-span-2">
                  <dt className="meta text-muted">{label}</dt>
                  <dd className="mt-1 font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </Reveal>

          <ul className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 md:mt-16 md:grid-cols-4">
            {about.pillars.map((pillar, i) => (
              <li key={pillar.en}>
                <Reveal delay={i * 0.05} className="border-t-4 border-accent pt-3">
                  <p className="text-xl leading-snug font-semibold tracking-[-0.02em]">{pillar.ko}</p>
                  <p className="meta mt-1 text-muted">{pillar.en}</p>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
