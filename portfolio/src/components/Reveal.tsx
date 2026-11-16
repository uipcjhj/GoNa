import { motion } from 'motion/react';
import type { ReactNode } from 'react';

/** 스크롤로 화면에 들어올 때 한 번 나타난다. reduced-motion 에서는 이동 없이 표시된다(MotionConfig). */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      data-reveal
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      transition={{ duration: 0.8, ease: [0.2, 0.7, 0.2, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
