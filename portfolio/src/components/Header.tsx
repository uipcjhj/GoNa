import { Link, useLocation } from 'react-router';
import { site } from '../data/site';

export const NAV = [
  { id: 'work', label: 'Work' },
  { id: 'ai-lab', label: 'AI Lab' },
  { id: 'about', label: 'About' },
  { id: 'contact', label: 'Contact' },
];

export function Header({ active }: { active: string | null }) {
  const { pathname } = useLocation();
  const onWork = pathname.startsWith('/work');

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-bg/85 backdrop-blur-md transition-colors duration-700 [-webkit-backdrop-filter:blur(12px)]">
      <div className="shell flex h-14 items-center justify-between gap-3 pt-[env(safe-area-inset-top)] md:h-16">
        <Link to="/" aria-label={`${site.name} 홈`} className="text-lg font-bold tracking-[-0.04em] md:text-xl">
          {site.wordmark}
        </Link>
        <nav aria-label="주요 메뉴">
          <ul className="flex items-center gap-1 text-[0.9375rem] font-medium sm:gap-3">
            {NAV.map((item) => {
              const current = pathname === '/' ? active === item.id : onWork && item.id === 'work';
              return (
                <li key={item.id}>
                  <Link
                    to={{ pathname: '/', hash: `#${item.id}` }}
                    aria-current={current ? 'true' : undefined}
                    className={`block px-2 py-1.5 whitespace-nowrap transition-colors duration-300 sm:px-2.5 ${
                      current ? 'bg-accent text-ink' : 'hover:bg-wash'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
