import type { Cover as CoverData, TypeCover } from '../data/types';
import { Media } from './Media';

interface Props {
  cover: CoverData;
  /** 목록에서 비율을 통일하고 싶을 때 */
  ratio?: string;
  priority?: boolean;
  zoom?: boolean;
  className?: string;
}

const TONE: Record<TypeCover['tone'], string> = {
  ink: 'bg-ink text-paper',
  wash: 'bg-wash text-fg',
  signal: 'bg-accent text-ink',
};

/** 장식용 도형. 색은 currentColor 와 포인트 컬러만 쓴다. */
function Motif({ kind, tone }: { kind: NonNullable<TypeCover['motif']>; tone: TypeCover['tone'] }) {
  const signal = tone === 'signal' ? 'currentColor' : '#C8FF5F';
  const common = { 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 } as const;
  const box = 'absolute top-[8%] right-[6%] w-[46%]';

  switch (kind) {
    case 'frames':
      return (
        <svg viewBox="0 0 200 60" className={box} {...common}>
          <rect x="1" y="12" width="56" height="36" />
          <rect x="72" y="12" width="56" height="36" fill={signal} stroke="none" />
          <path d="M94 22v16l14-8z" fill="#17191B" stroke="none" />
          <rect x="143" y="12" width="56" height="36" />
        </svg>
      );
    case 'search':
      return (
        <svg viewBox="0 0 200 60" className={box} {...common}>
          <rect x="1" y="14" width="198" height="32" rx="16" />
          <circle cx="24" cy="29" r="6" />
          <path d="M28.5 33.5l5 5" />
          <rect x="44" y="24" width="64" height="12" fill={signal} stroke="none" />
        </svg>
      );
    case 'grid': // 5개 시장 × 6개 산업
      return (
        <svg viewBox="0 0 200 110" className={box} {...common}>
          {Array.from({ length: 30 }, (_, i) => {
            const on = [3, 8, 13, 16, 22, 27].includes(i);
            return (
              <circle
                key={i}
                cx={12 + (i % 6) * 35}
                cy={12 + Math.floor(i / 6) * 21.5}
                r={on ? 7 : 4}
                fill={on ? signal : 'none'}
                stroke={on ? 'none' : 'currentColor'}
              />
            );
          })}
        </svg>
      );
    case 'play': // 영상 진행 막대
      return (
        <svg viewBox="0 0 200 60" className={box} {...common}>
          <path d="M4 16v28l22-14z" fill={signal} stroke="none" />
          <path d="M42 30h156" />
          <path d="M42 30h70" stroke={signal} strokeWidth="6" />
          <circle cx="112" cy="30" r="7" fill={signal} stroke="none" />
        </svg>
      );
    case 'radar':
      return (
        <svg viewBox="0 0 120 120" className="absolute top-[6%] right-[4%] w-[22%]" {...common}>
          <circle cx="60" cy="60" r="58" />
          <circle cx="60" cy="60" r="38" />
          <circle cx="60" cy="60" r="18" />
          <path d="M60 60L101 19" />
          <circle cx="84" cy="50" r="5" fill="currentColor" stroke="none" />
          <circle cx="42" cy="82" r="3.5" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}

/**
 * 프로젝트 메인 비주얼. 이미지·영상이 있으면 그것을, 없으면 타이포그래피 커버를 그린다.
 * 실제 자료가 준비되면 데이터의 cover 만 바꾸면 카드와 상세 페이지에 함께 반영된다.
 */
export function Cover({ cover, ratio, priority, zoom, className = '' }: Props) {
  if (cover.kind !== 'type') {
    return <Media media={ratio ? { ...cover, ratio } : cover} priority={priority} zoom={zoom} ambient={zoom} className={className} />;
  }
  const long = Math.max(...cover.headline.map((l) => l.length));
  // 가장 긴 줄이 너비 안에, 모든 줄이 높이 안에 들어가도록 글자 크기를 정한다 (cqw = 상자 너비의 1%)
  const [w, h] = (ratio ?? '16 / 10').split('/').map(Number);
  const roomY = (100 * h) / w - 22; // 상자 높이에서 여백과 캡션 자리를 뺀 값
  const size = Math.min(26, 150 / long, roomY / (cover.headline.length * 0.92));

  return (
    <div
      role="img"
      aria-label={`${cover.headline.join(' ')}. ${cover.caption}`}
      className={`relative overflow-hidden [container-type:inline-size] ${className}`}
      style={{ aspectRatio: ratio ?? '16 / 10' }}
    >
      <div
        className={`absolute inset-0 flex flex-col justify-between p-[5cqw] ${TONE[cover.tone]} ${
          zoom ? 'transition-transform duration-700 ease-out-soft group-hover:scale-[1.05] group-focus-visible:scale-[1.05]' : ''
        }`}
      >
        {cover.motif && <Motif kind={cover.motif} tone={cover.tone} />}
        <p className="meta max-w-[46%] opacity-80">{cover.caption}</p>
        <p className="leading-[0.92] font-bold tracking-[-0.05em] whitespace-nowrap" style={{ fontSize: `${size}cqw` }}>
          {cover.headline.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}
