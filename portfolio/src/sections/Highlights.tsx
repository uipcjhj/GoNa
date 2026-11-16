import { Link } from 'react-router';
import { Reveal } from '../components/Reveal';
import { highlights } from '../data/about';

/** 첫 화면 바로 아래: 커리어를 요약하는 세 가지 역량. 누르면 근거가 되는 프로젝트로 간다. */
export function Highlights() {
  return (
    <section aria-labelledby="highlights-title" className="shell pb-14 md:pb-24">
      <h2 id="highlights-title" className="sr-only">
        Career Highlights
      </h2>
      <ul className="grid border-t border-fg md:grid-cols-3">
        {highlights.map((h, i) => (
          <li key={h.en} className="border-b border-rule md:border-r md:last:border-r-0">
            <Reveal delay={i * 0.05} className="h-full">
              <Link
                to={h.to}
                className="group flex h-full flex-col gap-3 py-5 transition-colors duration-300 hover:bg-accent hover:text-ink md:gap-10 md:px-5 md:py-6"
              >
                <span className="text-2xl leading-[1.05] font-bold tracking-[-0.04em] md:text-[clamp(1.5rem,0.6rem+1.9vw,2.25rem)]">{h.en}</span>
                <span className="max-w-[26rem] text-[0.9375rem] leading-snug text-muted transition-colors duration-300 group-hover:text-ink md:text-base">
                  {h.ko}
                </span>
              </Link>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
