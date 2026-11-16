import { motion } from 'motion/react';
import type { Changes, Metrics } from '../data/types';

const grow = {
  initial: { scaleX: 0 },
  whileInView: { scaleX: 1 },
  viewport: { once: true, margin: '0px 0px -10% 0px' },
  transition: { duration: 0.9, ease: [0.2, 0.7, 0.2, 1] },
} as const;

/** 확인된 KPI 수치 표. 기준일을 항상 함께 보여 준다. */
export function KpiPanel({ metrics }: { metrics: Metrics }) {
  return (
    <figure>
      <figcaption className="meta flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-fg pb-3">
        <span>Verified KPI</span>
        <span>기준일 {metrics.asOf}</span>
      </figcaption>

      <div className="grid sm:grid-cols-3 sm:gap-x-8">
        {metrics.channels.map((channel) => (
          <div key={channel.name} className="border-b border-rule py-5 sm:border-b-0">
            <h3 className="text-lg font-semibold tracking-[-0.02em]">{channel.name}</h3>
            <dl className="mt-3 space-y-4">
              {channel.items.map((item) => (
                <div key={item.label}>
                  <dt className="text-[0.9375rem] text-muted">{item.label}</dt>
                  <dd className="font-mono text-[clamp(1.75rem,1.2rem+2vw,2.5rem)] leading-tight font-medium tracking-[-0.03em]">
                    {item.value}
                  </dd>
                  {item.versusTarget && (
                    <dd className="mt-2">
                      {/* 목표(100%) 위치에 세로선, 실제 달성은 막대 전체 */}
                      <span className="relative block h-3 bg-wash">
                        <motion.span {...grow} className="absolute inset-0 origin-left bg-accent ring-1 ring-fg ring-inset" />
                        <span
                          className="absolute -top-1 -bottom-1 w-px bg-fg"
                          style={{ left: `${(100 / item.versusTarget) * 100}%` }}
                        />
                      </span>
                      <span className="meta mt-1.5 block">목표 대비 {item.versusTarget}%</span>
                      <span className="meta block text-muted">세로선이 목표 지점</span>
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      {metrics.summary && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-fg pt-4 font-semibold">
          <span aria-hidden="true" className="flex gap-1">
            {Array.from({ length: metrics.summary.total }, (_, i) => (
              <span
                key={i}
                className={`block h-3.5 w-3.5 border border-fg ${i < metrics.summary!.met ? 'bg-accent' : ''}`}
              />
            ))}
          </span>
          {metrics.summary.label}
        </p>
      )}
    </figure>
  );
}

/** 전후 변화율 막대. 가장 큰 값을 100% 길이로 맞춘다. */
export function ChangeBars({ changes }: { changes: Changes }) {
  const max = Math.max(...changes.sets.flatMap((s) => s.items.map((i) => i.percent)));
  return (
    <figure>
      <div className="grid gap-10 sm:grid-cols-2 sm:gap-8">
        {changes.sets.map((set) => (
          <div key={set.title}>
            <h3 className="meta border-b border-fg pb-3">{set.title} 채널 규모 변화</h3>
            <dl>
              {set.items.map((item) => (
                <div key={item.label} className="grid grid-cols-[5.5rem_1fr_3.5rem] items-center gap-3 border-b border-rule py-3">
                  <dt className="text-[0.9375rem] font-medium">{item.label}</dt>
                  <dd aria-hidden="true" className="h-3">
                    <motion.span
                      {...grow}
                      className="block h-full origin-left bg-accent ring-1 ring-fg ring-inset"
                      style={{ width: `${Math.max(1.5, (item.percent / max) * 100)}%` }}
                    />
                  </dd>
                  <dd className="text-right font-mono font-medium">+{item.percent}%</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <figcaption className="mt-5 max-w-[38rem] text-[0.9375rem] text-muted">{changes.note}</figcaption>
    </figure>
  );
}
