import { site } from '../data/site';

export function Footer() {
  return (
    <footer className="shell border-t border-rule pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="meta flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-muted">
        <p>© {new Date().getFullYear()} {site.name}</p>
        <a href="#top" className="link">
          Back to top
        </a>
      </div>
    </footer>
  );
}
