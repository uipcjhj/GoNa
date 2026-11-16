import type { ReactNode } from 'react';
import type { Block, Media as MediaData } from '../data/types';
import { Gallery } from './Gallery';

/** 굵게(**글**)와 링크([글](주소))만 해석한다. HTML 은 그대로 글자로 보여 준다. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g).map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) return <strong key={i}>{bold[1]}</strong>;
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link && /^(https?:|mailto:|\/)/.test(link[2])) {
      const external = /^https?:/.test(link[2]);
      return (
        <a key={i} href={link[2]} className="link" {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
          {link[1]}
        </a>
      );
    }
    return part;
  });
}

/** 문단, 글머리표 목록(- ), 번호 목록(1. ), 소제목(## ), 인용(> ) 을 지원하는 간단한 글 표시 */
export function Prose({ text, className = '' }: { text: string; className?: string }) {
  const chunks = text.replace(/\r/g, '').split(/\n{2,}/).map((c) => c.trim()).filter(Boolean);
  return (
    <div className={`space-y-4 text-[1.0625rem] leading-[1.7] ${className}`}>
      {chunks.map((chunk, i) => {
        const lines = chunk.split('\n');
        if (lines.every((l) => /^[-*] /.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => <li key={j}>{inline(l.slice(2))}</li>)}
            </ul>
          );
        }
        if (lines.every((l) => /^\d+\. /.test(l))) {
          return (
            <ol key={i} className="list-decimal space-y-1 pl-5">
              {lines.map((l, j) => <li key={j}>{inline(l.replace(/^\d+\. /, ''))}</li>)}
            </ol>
          );
        }
        const heading = chunk.match(/^(#{2,3}) (.+)$/);
        if (heading) return <h3 key={i} className="pt-2 text-xl leading-snug font-semibold tracking-[-0.02em]">{inline(heading[2])}</h3>;
        if (lines.every((l) => l.startsWith('> '))) {
          return <blockquote key={i} className="border-l-4 border-accent pl-4 font-medium">{inline(lines.map((l) => l.slice(2)).join(' '))}</blockquote>;
        }
        return <p key={i}>{lines.flatMap((l, j) => (j ? [<br key={`b${j}`} />, ...inline(l)] : inline(l)))}</p>;
      })}
    </div>
  );
}

const asMedia = (kind: MediaData['kind'], b: { src: string; alt?: string; caption?: string; poster?: string }, fallback: string): MediaData => ({
  kind,
  src: b.src,
  alt: b.alt || b.caption || fallback,
  caption: b.caption ?? (kind === 'youtube' ? b.alt : undefined),
  poster: b.poster,
  ...(kind === 'youtube' ? { ratio: '16 / 9' } : {}),
});

/** 관리자 화면에서 쌓은 본문 블록을 사이트 스타일로 그린다. 내용이 빈 블록은 건너뛴다. */
export function Body({ blocks, label }: { blocks?: Block[]; label: string }) {
  if (!blocks?.length) return null;
  return (
    <div className="space-y-8">
      {blocks.map((block, i) => {
        switch (block.kind) {
          case 'heading':
            return block.text ? (
              <h3 key={i} className={`leading-tight font-semibold tracking-[-0.03em] ${block.level === 'h3' ? 'text-xl' : 'text-[1.625rem] sm:text-title'}`}>{block.text}</h3>
            ) : null;
          case 'text':
            return block.body ? <Prose key={i} text={block.body} className="max-w-[42rem]" /> : null;
          case 'image':
            return block.src ? <Gallery key={i} items={[asMedia('image', block, label)]} label={label} /> : null;
          case 'gallery':
            return block.images?.length ? <Gallery key={i} items={block.images.map((im) => asMedia('image', im, label))} label={label} /> : null;
          case 'youtube':
            return block.src ? <Gallery key={i} items={[asMedia('youtube', block, `${label} 영상`)]} label={label} /> : null;
          case 'pdf':
            return block.src ? <Gallery key={i} items={[asMedia('pdf', block, `${label} 문서`)]} label={label} /> : null;
          case 'quote':
            return block.text ? (
              <blockquote key={i} className="max-w-[42rem] border-l-4 border-accent pl-5">
                <p className="text-[1.3125rem] leading-[1.5] font-semibold tracking-[-0.02em]">{block.text}</p>
                {block.cite && <footer className="meta mt-3 text-muted">{block.cite}</footer>}
              </blockquote>
            ) : null;
          case 'divider':
            return <hr key={i} className="border-rule" />;
          default:
            return null;
        }
      })}
    </div>
  );
}
