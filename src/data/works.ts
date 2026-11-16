import { archiveFiles } from './archive-media.gen';
import { entries } from '../lib/content';
import type { Block, LinkItem, Media } from './types';

/**
 * Creative Archive: 직접 만든 작업물 한 건이 데이터 한 개.
 * 내용은 content/works/<id>.json 에 있고, 관리자 화면(/admin/)에서 고친다.
 *
 * 이미지 넣는 법
 *   public/media/archive/<id>/ 폴더에 파일을 넣으면 그 작업물의 갤러리가 자동으로 구성된다
 *   (파일 이름순. 첫 장이 썸네일). 데이터를 고칠 필요가 없다. 파일의 출처는 그 작업물의 source 에 적는다.
 *   저작권·상표·초상권을 확인한 자료만 넣는다. 타인의 얼굴이 나온 사진은 동의 없이 넣지 않는다.
 *
 * verificationStatus
 *   verified : 실물을 직접 확인했다 (공식 채널의 영상, 원본 문서 등)
 *   listed   : 기존 포트폴리오 목록에 제목이 있으나 실물은 아직 확인하지 못했다
 * publicationStatus
 *   public     : 자료까지 공개
 *   title-only : 제목과 확인된 정보만 공개 (원문·원본은 올리지 않는다)
 *   hidden     : 화면에 나오지 않는다
 *
 * 수상 등급·주최·연도, 영상별 담당 범위처럼 확인되지 않은 내용은 적지 않는다.
 */
export const WORK_CATEGORIES = ['Video', 'Design', 'Web', 'Competition', 'Editorial'] as const;
export type WorkCategory = (typeof WORK_CATEGORIES)[number];

export interface Work {
  id: string;
  title: string;
  category: WorkCategory;
  /** 확인된 경우에만 */
  year?: string;
  organization?: string;
  role?: string;
  description?: string;
  /** 기획 의도 */
  intent?: string;
  /** 제작 과정 */
  process?: string;
  /** 결과 및 성과 (확인된 것만) */
  result?: string;
  /** 수상 정보 (증빙이 확인된 것만) */
  award?: string;
  tags?: string[];
  /** 직접 지정한 자료. public/media/archive/<id>/ 의 파일은 여기에 자동으로 더해진다. */
  media?: Media[];
  externalUrl?: LinkItem;
  /** 여러 문서로 이뤄진 작업물의 개별 목록 (기사 제목 등) */
  documents?: { label: string; title: string }[];
  /** 이 항목의 근거 */
  source: string;
  verificationStatus: 'verified' | 'listed';
  publicationStatus: 'public' | 'title-only' | 'hidden';
  /** 홈 미리보기에 노출 */
  featured?: boolean;
  /** 노출 순서 (작을수록 앞) */
  order?: number;
  /** 자유 본문 */
  body?: Block[];
}

const IMAGE = /\.(webp|png|jpe?g|gif|avif)$/i;
const fromFile = (work: Work, src: string, i: number): Media => ({
  kind: IMAGE.test(src) ? 'image' : src.endsWith('.pdf') ? 'pdf' : 'video',
  src,
  alt: `${work.title} ${i + 1}`,
  // 세로로 긴 디자인도 잘리지 않도록 비율은 화면에서 이미지 크기에 맡긴다
});

/** 화면에 쓰는 목록: 숨김 항목을 빼고, 폴더에 넣은 파일을 media 에 더한다. */
const files = import.meta.glob('../../content/works/*.json', { eager: true });
const list: Work[] = entries<Omit<Work, 'id'>>(files)
  .map(({ name, data }) => ({ ...data, id: name }))
  .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

export const works: Work[] = list
  .filter((w) => w.publicationStatus !== 'hidden')
  .map((w) => ({ ...w, media: [...(w.media ?? []), ...(archiveFiles[w.id] ?? []).map((src, i) => fromFile(w, src, i))] }));

/** 썸네일: 첫 이미지, 없으면 YouTube 썸네일 */
export function thumbnailOf(work: Work): string | undefined {
  const first = work.media?.[0];
  if (!first) return undefined;
  return first.kind === 'image' ? first.src : first.poster;
}

export const featuredWorks = works.filter((w) => w.featured);
export const countByCategory = (c: WorkCategory) => works.filter((w) => w.category === c).length;
