export interface Media {
  kind: 'image' | 'video';
  /** public/ 기준 경로(예: 'media/cover.webp') 또는 전체 URL. 비워 두면 "임시 이미지" 자리표시가 나온다. */
  src?: string;
  /** 영상일 때 대표 이미지 */
  poster?: string;
  alt: string;
  /** CSS aspect-ratio 값 (예: '16 / 10') */
  ratio?: string;
}

export const CATEGORIES = ['Digital Marketing', 'Brand Content', 'Video', 'AI Lab'] as const;
export type Category = (typeof CATEGORIES)[number];

export const STEPS = [
  { key: 'overview', en: 'Overview', ko: '개요' },
  { key: 'challenge', en: 'Challenge', ko: '과제' },
  { key: 'strategy', en: 'Strategy', ko: '전략' },
  { key: 'execution', en: 'Execution', ko: '실행' },
  { key: 'impact', en: 'Impact', ko: '성과' },
  { key: 'reflection', en: 'Reflection', ko: '회고' },
] as const;
export type StepKey = (typeof STEPS)[number]['key'];

export interface StepContent {
  body: string[];
  media?: Media;
  /** true 면 화면에 "임시" 표시가 붙는다 */
  placeholder?: boolean;
}

export interface Project {
  slug: string;
  title: string;
  category: Category;
  /** AI Lab 프로젝트의 세부 유형 (Game, Automation, Web Service …) */
  kind?: string;
  /** 진행 시기. 모르면 비워 둔다 */
  period?: string;
  role?: string;
  tools?: string[];
  summary: string;
  cover: Media;
  /** 메인 페이지 Selected Work 노출 여부 */
  featured?: boolean;
  /** 프로젝트 전체가 임시 콘텐츠인지 */
  placeholder?: boolean;
  link?: { label: string; href: string };
  steps: Record<StepKey, StepContent>;
}
