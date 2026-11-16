import { DraftTag } from '../components/DraftTag';
import { Reveal } from '../components/Reveal';
import { site } from '../data/site';
import { asset } from '../lib/asset';

function Row({ label, href, text, placeholder }: { label: string; href: string; text: string; placeholder?: boolean }) {
  return (
    <li className="flex items-baseline justify-between gap-4 border-t border-rule py-3.5">
      <span className="meta text-muted">{label}</span>
      <span className="flex min-w-0 items-baseline gap-2 text-right font-medium">
        {href ? (
          <a className="link break-all" href={href} target="_blank" rel="noreferrer">
            {text}
          </a>
        ) : (
          <span className="text-muted">주소 준비 중</span>
        )}
        {placeholder && <DraftTag className="text-muted" />}
      </span>
    </li>
  );
}

export function Contact() {
  const { email, linkedin, github, resume } = site.contact;
  return (
    <section id="contact" aria-labelledby="contact-title" className="shell py-20 md:py-32">
      <h2 id="contact-title" className="border-t border-fg pt-5 text-display leading-[0.95] font-bold tracking-[-0.05em]">
        Let’s make
        <br />
        it real.
      </h2>

      <div className="mt-12 grid gap-12 md:mt-20 md:grid-cols-12 md:gap-10">
        <Reveal className="md:col-span-7">
          <p className="text-muted">채용 제안과 협업 문의는 이메일로 보내 주세요.</p>
          <p className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <a
              href={`mailto:${email.value}`}
              className="link text-[clamp(1.25rem,5.4vw,2.75rem)] leading-tight font-semibold tracking-[-0.03em] break-all"
            >
              {email.value}
            </a>
            {email.placeholder && <DraftTag className="text-muted" />}
          </p>

          <div className="mt-10">
            {resume.href ? (
              <a
                href={asset(resume.href)}
                download
                className="inline-flex items-center gap-3 bg-accent px-6 py-4 font-semibold text-ink transition-colors duration-300 hover:bg-fg hover:text-bg"
              >
                이력서 다운로드 <span className="meta">PDF</span>
              </a>
            ) : (
              <p className="inline-flex flex-wrap items-center gap-3 border border-dashed border-muted px-6 py-4 font-semibold text-muted">
                이력서 다운로드 <span className="meta">PDF 준비 중</span> <DraftTag />
              </p>
            )}
          </div>
        </Reveal>

        <Reveal className="md:col-span-5 lg:col-span-4 lg:col-start-9" delay={0.08}>
          <ul className="border-b border-rule">
            <Row label="LinkedIn" href={linkedin.href} text={linkedin.href.replace(/^https?:\/\/(www\.)?/, '')} placeholder={linkedin.placeholder} />
            <Row label="GitHub" href={github.href} text={github.href.replace(/^https?:\/\//, '')} placeholder={github.placeholder} />
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
