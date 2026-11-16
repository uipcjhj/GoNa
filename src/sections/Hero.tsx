import { animate, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { site } from '../data/site';

/**
 * 히어로: 같은 문장을 외곽선(아이디어)과 채워진 글자(현실) 두 겹으로 겹쳐 놓고,
 * 경계선이 왼쪽에서 오른쪽으로 지나가며 채워진다. 마우스를 올리면 경계선이 포인터를 따라온다.
 */
export function Hero() {
  const reduce = useReducedMotion();
  const box = useRef<HTMLHeadingElement>(null);
  const target = useMotionValue(0); // 채워진 비율 0~100
  const filled = useSpring(target, { stiffness: 170, damping: 30, mass: 0.6 });
  const clip = useTransform(filled, (v) => `inset(-0.2em ${Math.max(0, 100 - v)}% -0.2em -0.1em)`);
  const edgeLeft = useTransform(filled, (v) => `${Math.min(100, Math.max(0, v))}%`);
  const edgeOpacity = useTransform(filled, [0, 1, 98.5, 100], [0, 1, 1, 0]);

  useEffect(() => {
    if (reduce) {
      target.jump(100);
      filled.jump(100);
      return;
    }
    const controls = animate(target, 100, { duration: 1.5, delay: 0.25, ease: [0.65, 0, 0.2, 1] });
    return () => controls.stop();
  }, [reduce, target, filled]);

  const scrub = (e: React.PointerEvent) => {
    if (reduce || e.pointerType !== 'mouse' || !box.current) return;
    const r = box.current.getBoundingClientRect();
    target.set(((e.clientX - r.left) / r.width) * 100);
  };

  const [line1, line2] = site.concept.en;
  const lines = (
    <>
      <span className="block">{line1}</span>
      <span className="block">{line2}</span>
    </>
  );

  return (
    <section className="shell flex flex-col overflow-x-clip pt-14 pb-12 md:min-h-[calc(100svh-11rem)] md:justify-end md:pt-16 md:pb-12">
      <p className="meta mb-6 flex flex-wrap gap-x-6 text-muted md:mb-8">
        <span>{site.name}</span>
        <span>{site.role}</span>
      </p>

      <h1
        ref={box}
        onPointerMove={scrub}
        onPointerLeave={() => !reduce && target.set(100)}
        className="relative w-fit max-w-full text-hero leading-[0.92] font-bold tracking-[-0.055em] whitespace-nowrap select-none"
      >
        <span aria-hidden="true" className="outline-text block">
          {lines}
        </span>
        <motion.span className="absolute inset-0 block" style={{ clipPath: clip, WebkitClipPath: clip }}>
          <span aria-hidden="true" className="absolute right-0 bottom-[0.06em] left-0 -z-10 h-[0.78em] bg-accent" />
          {lines}
        </motion.span>
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute -top-3 -bottom-3 w-px bg-fg"
          style={{ left: edgeLeft, opacity: edgeOpacity }}
        >
          <span className="meta absolute top-0 right-2 whitespace-nowrap text-muted">idea</span>
          <span className="meta absolute top-0 left-2 whitespace-nowrap">reality</span>
        </motion.span>
      </h1>

      <div className="mt-8 grid gap-6 md:mt-14 md:grid-cols-12 md:gap-10">
        <p className="text-[clamp(1.625rem,1rem+2.6vw,3.25rem)] leading-[1.25] font-bold tracking-[-0.035em] md:col-span-7">{site.concept.ko}</p>
        <div className="md:col-span-5 lg:col-span-4 lg:col-start-9">
          <p className="text-muted">{site.intro}</p>
          <div className="mt-6 flex flex-wrap gap-3 text-[0.9375rem] font-semibold">
            <Link
              to={{ pathname: '/', hash: '#work' }}
              className="bg-fg px-5 py-3 text-bg transition-colors duration-300 hover:bg-accent hover:text-ink"
            >
              프로젝트 보기
            </Link>
            <Link
              to={{ pathname: '/', hash: '#contact' }}
              className="border border-fg px-5 py-3 transition-colors duration-300 hover:bg-accent hover:text-ink"
            >
              연락하기
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
