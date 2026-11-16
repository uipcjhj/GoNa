import type { FeaturedItem, Group, Project } from '../data/types';
import { Media } from './Media';
import { TextLink } from './TextLink';

type Process = NonNullable<Project['process']>;

const num = (i: number) => String(i + 1).padStart(2, '0');
const BUTTON =
  'inline-block bg-accent px-4 py-2.5 text-[0.9375rem] font-semibold text-ink transition-colors duration-300 hover:bg-fg hover:text-bg';

/** 바뀌기 전 → 후 */
export function Shift({ shift }: { shift: NonNullable<Process['shift']> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-stretch sm:gap-5">
      <p className="border border-dashed border-muted p-5 sm:p-6">
        <span className="meta block text-muted">From</span>
        <span className="outline-text mt-6 block text-title leading-[1.15] font-bold tracking-[-0.03em]">{shift.from}</span>
      </p>
      <span aria-hidden="true" className="self-center font-mono text-2xl">
        <span className="hidden sm:inline">→</span>
        <span className="sm:hidden">↓</span>
      </span>
      <p className="bg-accent p-5 text-ink sm:p-6">
        <span className="meta block">To</span>
        <span className="mt-6 block text-title leading-[1.15] font-bold tracking-[-0.03em]">{shift.to}</span>
      </p>
    </div>
  );
}

/** 순서가 있는 흐름 */
export function Flow({ steps }: { steps: string[] }) {
  return (
    <ol className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch sm:gap-x-2 sm:gap-y-4">
      {steps.map((step, i) => (
        <li key={step} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className={`flex flex-1 flex-col justify-between gap-4 border border-fg px-4 py-3 sm:min-h-24 sm:max-w-44 ${i === steps.length - 1 ? 'bg-accent text-ink' : ''}`}>
            <span className="meta opacity-70">{num(i)}</span>
            <span className="leading-snug font-semibold">{step}</span>
          </span>
          {i < steps.length - 1 && (
            <span aria-hidden="true" className="self-center font-mono text-lg text-muted">
              <span className="hidden sm:inline">→</span>
              <span className="sm:hidden">↓</span>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/** 접근 방법을 큰 카드로 */
export function Approach({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-x-6 gap-y-6 sm:grid-cols-2 sm:gap-y-8">
      {items.map((item) => (
        <li key={item} className="border-t-4 border-accent pt-3 text-lg leading-snug font-semibold tracking-[-0.02em] sm:pt-4 sm:text-[1.375rem]">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function Groups({ groups, style = 'columns' }: { groups: Group[]; style?: 'columns' | 'events' }) {
  if (style === 'events') {
    return (
      <div>
        {groups.map((group) => (
          <section key={group.title} className="grid gap-x-8 gap-y-4 border-t border-fg py-7 last:pb-0 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
            <div>
              <h3 className="text-[clamp(1.75rem,1.2rem+2.4vw,3rem)] leading-[1.05] font-bold tracking-[-0.04em]">{group.title}</h3>
              {group.status && <p className="meta mt-3 inline-block bg-accent px-2 py-1 font-medium text-ink">{group.status}</p>}
            </div>
            <ul className="self-start border-b border-rule">
              {group.items.map((item) => (
                <li key={item} className="border-t border-rule py-2.5 first:border-t-0 first:pt-0">
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    );
  }
  return (
    <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((group) => (
        <div key={group.title}>
          <h3 className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-fg pb-2.5 text-xl leading-snug font-semibold tracking-[-0.02em]">
            {group.title}
            {group.status && <span className="meta bg-accent px-2 py-0.5 font-medium text-ink">{group.status}</span>}
          </h3>
          <ul>
            {group.items.map((item) => (
              <li key={item} className="border-b border-rule py-2 text-[0.9375rem]">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** 대표 결과물 카드: 자료(있으면) + 제목 + 상태 + 링크 */
export function FeaturedItems({ items, onOpen }: { items: FeaturedItem[]; onOpen?: (item: FeaturedItem) => void }) {
  const withMedia = items.some((i) => i.media?.src);
  return (
    <ul className={`grid gap-x-4 gap-y-10 sm:gap-x-6 ${withMedia ? 'grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
      {items.map((item) => (
        <li key={item.title} className="flex flex-col">
          {item.media?.src && <Media media={item.media} onOpen={onOpen && item.media.kind === 'image' ? () => onOpen(item) : undefined} />}
          <h3 className="mt-3 text-lg leading-snug font-semibold tracking-[-0.02em] sm:text-xl">{item.title}</h3>
          {item.status && <p className="meta mt-2 self-start border border-rule px-1.5 py-0.5">{item.status}</p>}
          {item.link && (
            <p className="mt-auto pt-4">
              <TextLink link={item.link} className={BUTTON} />
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

export function Tags({ tags }: { tags: NonNullable<Process['tags']> }) {
  return (
    <dl className="space-y-6">
      {tags.map((group) => (
        <div key={group.title}>
          <dt className="meta mb-3 text-muted">
            {group.title} ({num(group.items.length - 1)})
          </dt>
          <dd>
            <ul className="flex flex-wrap gap-2">
              {group.items.map((item) => (
                <li key={item} className="border border-fg px-3.5 py-2 text-lg leading-tight font-semibold tracking-[-0.02em]">
                  {item}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function Milestone({ milestone }: { milestone: { date: string; label: string } }) {
  return (
    <p>
      <span className="block font-mono text-[clamp(2.5rem,1.4rem+5.2vw,5.5rem)] leading-none font-medium tracking-[-0.05em]">
        {milestone.date}
      </span>
      <span className="mt-4 inline-block bg-accent px-3 py-1.5 text-lg font-semibold text-ink">{milestone.label}</span>
    </p>
  );
}
