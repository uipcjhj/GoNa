import { Link } from 'react-router';
import type { LinkItem } from '../data/types';

/** 데이터의 링크 한 개를 그린다. 사이트 안(to)과 밖(href)을 구분한다. */
export function TextLink({ link, className = 'link font-medium' }: { link: LinkItem; className?: string }) {
  if (link.to) {
    return (
      <Link to={link.to} className={className}>
        {link.label}
      </Link>
    );
  }
  if (!link.href) return null;
  return (
    <a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
      {link.label}
      <span className="sr-only"> (새 창)</span>
    </a>
  );
}
