import { Link } from 'react-router';
import { Reveal } from '../components/Reveal';
import { capabilities, process } from '../data/about';

/** 업무 영역 여덟 가지. 누르면 해당 프로젝트로 간다. */
export function Capabilities() {
  return (
    <section aria-labelledby="capabilities-title" className="shell py-14 md:py-32">
      <h2 id="capabilities-title" className="border-t border-fg pt-5 text-title leading-none font-bold tracking-[-0.04em]">
        Capabilities
        <span className="mt-2 block text-[0.9375rem] font-normal tracking-normal text-muted">업무 영역</span>
      </h2>
      <ul className="mt-8 grid border-t border-rule sm:grid-cols-2 md:mt-12 lg:grid-cols-4">
        {capabilities.map((c, i) => (
          <li key={c.en} className="border-b border-rule sm:max-lg:[&:nth-child(odd)]:border-r lg:border-r lg:[&:nth-child(4n)]:border-r-0">
            <Reveal delay={i * 0.04} className="h-full">
              <Link
                to={c.to}
                className="group flex h-full flex-col gap-3 px-0 py-5 transition-colors duration-300 hover:bg-accent hover:text-ink sm:px-5 sm:py-6 lg:gap-8"
              >
                <span className="text-2xl leading-[1.05] font-bold tracking-[-0.04em]">{c.en}</span>
                <span className="text-[0.9375rem] leading-snug text-muted transition-colors duration-300 group-hover:text-ink">{c.ko}</span>
              </Link>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HowIWork() {
  return (
    <section aria-labelledby="how-title" className="shell py-14 md:py-32">
      <h2 id="how-title" className="border-t border-fg pt-5 text-title leading-none font-bold tracking-[-0.04em]">
        How I Work
        <span className="mt-2 block text-[0.9375rem] font-normal tracking-normal text-muted">일하는 순서</span>
      </h2>
      <ol className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 md:mt-16 lg:grid-cols-4">
        {process.map((step, i) => (
          <li key={step.en}>
            <Reveal delay={i * 0.07} className="flex h-full flex-col border-t border-rule pt-4">
              <p className="meta text-muted">
                {String(i + 1).padStart(2, '0')} {step.en}
              </p>
              <h3 className="mt-3 text-2xl leading-snug font-semibold tracking-[-0.02em]">{step.ko}</h3>
              <p className="mt-3 text-[0.9375rem] text-muted">{step.text}</p>
              <p className="mt-auto pt-5 text-[0.9375rem]">
                <Link to={step.project.to} className="link font-medium">
                  {step.project.label}
                </Link>
              </p>
            </Reveal>
          </li>
        ))}
      </ol>
    </section>
  );
}
