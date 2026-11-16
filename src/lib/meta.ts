import { site } from '../data/site';
import { findProject, projects } from '../data/projects';

export interface PageMeta {
  title: string;
  description: string;
}

/** 경로(베이스 제외, 예: '/work/project-a/')에 해당하는 제목·설명 */
export function getMeta(pathname: string): PageMeta {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return { title: `${site.name} — ${site.role}`, description: site.description };
  if (path === '/work') {
    return { title: `Work — ${site.name}`, description: '현대무벡스와 극동MES에서 수행한 디지털마케팅·콘텐츠·브랜드 디자인 프로젝트와 AI Lab 개인 프로젝트 전체 목록.' };
  }
  if (path === '/archive') {
    return { title: `Creative Archive — ${site.name}`, description: '영상, 디자인, 웹, 공모전 출품작, 기사·보도자료까지 직접 만든 작업물 갤러리.' };
  }
  const project = findProject(path.match(/^\/work\/([^/]+)$/)?.[1]);
  if (project) return { title: `${project.title} — ${site.name}`, description: project.summary };
  return { title: `페이지를 찾을 수 없습니다 — ${site.name}`, description: site.description };
}

/** 정적 HTML 로 미리 만들어 둘 경로 목록 */
export const staticPaths = ['/', '/work/', '/archive/', ...projects.map((p) => `/work/${p.slug}/`)];

/** 미리 만드는 HTML 의 초기 테마 (다크 상세 페이지가 밝게 깜빡이지 않도록) */
export function getTheme(pathname: string): 'dark' | undefined {
  return findProject(pathname.replace(/\/+$/, '').match(/^\/work\/([^/]+)$/)?.[1])?.theme;
}
