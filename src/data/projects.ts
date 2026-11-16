import { entries } from '../lib/content';
import { channelKpi, exhibitionChanges, kdmesGrowth } from './figures';
import type { Project } from './types';

/**
 * 프로젝트 데이터. 내용은 content/projects/<slug>.json 에 있고, 관리자 화면(/admin/)에서 고친다.
 *
 * - 파일 하나가 프로젝트 하나. 파일 이름이 주소(/work/<slug>/)가 된다.
 * - order 순으로 정렬되고, published 가 false 인 프로젝트는 사이트에 나오지 않는다.
 * - 상세 페이지 순서: Hero → Key Information(scope) → Featured Results(featured) → Process(process) → Outcome(outcome) → 본문(body).
 *   비어 있는 영역은 화면에 나오지 않는다.
 * - 회사 수치(KPI, 전시 전후 변화율, 채널 성장률)는 content 에 적지 않는다. data/figures.ts 설명 참고.
 */
const files = import.meta.glob('../../content/projects/*.json', { eager: true });

/** 로컬 수치 파일에서 공개로 표시한 항목이 있을 때만 결과 영역에 넣는다 */
const FIGURES: Record<string, Partial<NonNullable<Project['outcome']>>> = {
  ...(channelKpi && { 'b2b-digital-marketing': { metrics: channelKpi } }),
  ...(exhibitionChanges && { 'global-exhibition-marketing': { changes: exhibitionChanges } }),
  ...(kdmesGrowth && { 'youtube-social-growth': { changes: kdmesGrowth } }),
};

export const projects: Project[] = entries<Omit<Project, 'slug'>>(files)
  .map(({ name, data }) => {
    const project: Project = { ...data, slug: name, scope: data.scope ?? [] };
    const figures = FIGURES[name];
    // 수치가 공개되면 "확인 후 게시" 안내문은 뺀다
    if (figures) project.outcome = { ...project.outcome, ...figures, note: undefined };
    return project;
  })
  .filter((p) => p.published !== false)
  .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

export const selectedWork = projects.filter((p) => p.placement === 'selected');
export const moreWork = projects.filter((p) => p.placement === 'more');
export const labProjects = projects.filter((p) => p.placement === 'lab');
export const findProject = (slug?: string) => projects.find((p) => p.slug === slug);
