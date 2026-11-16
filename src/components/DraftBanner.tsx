import { site } from '../data/site';
import { DraftTag } from './DraftTag';

export function DraftBanner() {
  if (!site.draft) return null;
  return (
    <p className="shell bg-ink py-2 text-[0.8125rem] leading-snug text-paper">
      초안입니다. <DraftTag className="mx-0.5 text-accent" /> 표시가 붙은 내용은 실제 콘텐츠로 교체할 자리입니다.
    </p>
  );
}
