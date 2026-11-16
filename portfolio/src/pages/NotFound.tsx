import { Link } from 'react-router';
import { usePage } from '../lib/usePage';

export default function NotFound() {
  usePage();
  return (
    <div className="shell flex min-h-[70svh] flex-col justify-center py-24">
      <p className="meta text-muted">404</p>
      <h1 className="mt-3 text-display leading-none font-bold tracking-[-0.05em]">Not found.</h1>
      <p className="mt-6 text-muted">주소가 바뀌었거나 없는 페이지입니다.</p>
      <p className="mt-8 flex flex-wrap gap-3 font-semibold">
        <Link to="/" className="bg-fg px-5 py-3 text-bg transition-colors duration-300 hover:bg-accent hover:text-ink">
          홈으로 가기
        </Link>
        <Link to="/work/" className="border border-fg px-5 py-3 transition-colors duration-300 hover:bg-accent hover:text-ink">
          프로젝트 보기
        </Link>
      </p>
    </div>
  );
}
