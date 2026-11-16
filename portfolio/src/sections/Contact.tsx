import { Reveal } from '../components/Reveal';
import { site } from '../data/site';
import { asset } from '../lib/asset';

const strip = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '');

/** 값이 채워진 연락처만 보여 준다. 실제 주소는 src/data/site.ts 에서 관리한다. */
export function Contact() {
  const { email, linkedin, github, resume } = site.contact;
  const links = [
    { label: 'LinkedIn', href: linkedin },
    { label: 'GitHub', href: github },
  ].filter((l) => l.href);

  return (
    <section id="contact" aria-labelledby="contact-title" className="shell py-14 md:py-32">
      <h2 id="contact-title" className="border-t border-fg pt-5 text-display leading-[0.95] font-bold tracking-[-0.05em]">
        Let’s make
        <br />
        it real.
      </h2>

      <div className="mt-12 grid gap-12 md:mt-20 md:grid-cols-12 md:gap-10">
        {(email || resume) && (
          <Reveal className="md:col-span-7">
            {email && (
              <>
                <p className="text-muted">채용 제안과 협업 문의는 이메일로 보내 주세요.</p>
                <a
                  href={`mailto:${email}`}
                  className="link mt-3 inline-block text-[clamp(1.25rem,5.4vw,2.75rem)] leading-tight font-semibold tracking-[-0.03em] break-all"
                >
                  {email}
                </a>
              </>
            )}
            {resume && (
              <p className="mt-10">
                <a
                  href={asset(resume)}
                  download
                  className="inline-flex items-center gap-3 bg-accent px-6 py-4 font-semibold text-ink transition-colors duration-300 hover:bg-fg hover:text-bg"
                >
                  이력서 다운로드 <span className="meta">PDF</span>
                </a>
              </p>
            )}
          </Reveal>
        )}

        <Reveal className={email || resume ? 'md:col-span-5 lg:col-span-4 lg:col-start-9' : 'md:col-span-7'} delay={0.08}>
          <ul className="border-b border-rule">
            {links.map((l) => (
              <li key={l.label} className="flex items-baseline justify-between gap-4 border-t border-rule py-3.5">
                <span className="meta text-muted">{l.label}</span>
                <a className="link font-medium break-all" href={l.href} target="_blank" rel="noreferrer">
                  {strip(l.href)}
                </a>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
