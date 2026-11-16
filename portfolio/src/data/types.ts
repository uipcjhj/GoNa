/**
 * 이미지·영상·PDF·YouTube 자료 한 개.
 * src 가 비어 있으면 화면에 아무것도 그리지 않는다 (빈 자리나 임시 이미지를 만들지 않는다).
 * 파일은 public/media/<프로젝트 slug>/ 아래에 둔다 — 다른 프로젝트의 자료를 쓰면 빌드 검사에서 걸린다.
 */
export interface Media {
  /** image: 사진·캡처 / video: mp4 파일 / pdf: 문서 / youtube: 유튜브 영상(src 에 영상 ID) */
  kind: 'image' | 'video' | 'pdf' | 'youtube';
  /** public/ 기준 경로(예: 'media/product-storytelling/main.webp'). youtube 는 영상 ID. */
  src?: string;
  /** 영상·PDF·YouTube 의 대표 이미지 (선택) */
  poster?: string;
  /** 자료 설명. 이미지 대체 텍스트와 PDF·영상 제목으로 쓴다. */
  alt: string;
  /** 자료 아래에 보이는 설명 (선택) */
  caption?: string;
  /** CSS aspect-ratio 값 (예: '16 / 10') */
  ratio?: string;
}

/** 대표 이미지가 없는 프로젝트용 타이포그래피 커버 */
export interface TypeCover {
  kind: 'type';
  headline: string[];
  caption: string;
  tone: 'ink' | 'wash' | 'signal';
  motif?: 'frames' | 'search' | 'grid' | 'radar' | 'play';
}
export type Cover = Media | TypeCover;

/** Work 목록의 필터 */
export const CATEGORIES = ['Growth', 'Content', 'Web & Research', 'AI Lab'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface LinkItem {
  label: string;
  /** 외부 주소 */
  href?: string;
  /** 사이트 안의 경로 (예: '/work/global-opportunity-radar/') */
  to?: string;
}

/** 확인된 KPI 수치 */
export interface Metrics {
  /** 수치 기준일 */
  asOf: string;
  summary?: { met: number; total: number; label: string };
  channels: {
    name: string;
    items: { label: string; value: string; versusTarget?: number }[];
  }[];
}

/** 전후 변화율 묶음 */
export interface Changes {
  note: string;
  sets: { title: string; items: { label: string; percent: number }[] }[];
}

export interface Group {
  title: string;
  status?: string;
  items: string[];
}

/** 대표 결과물 한 개 (제목 + 선택적으로 상태·링크·자료) */
export interface FeaturedItem {
  title: string;
  status?: string;
  link?: LinkItem;
  media?: Media;
}

export interface Project {
  slug: string;
  title: string;
  /** 화면에 표시하는 카테고리 문구 */
  category: string;
  /** Work 목록 필터용 분류 */
  filter: Category;
  period: string;
  organization?: string;
  type?: string;
  status?: string;
  summary: string;
  /** 메인 비주얼. 카드와 상세 페이지 첫 화면에 쓴다. */
  cover: Cover;
  /** 홈에서의 위치 */
  placement: 'selected' | 'more' | 'lab';
  /** 상세 페이지 머리 배치. split: 글과 커버를 좌우로 / wide: 커버를 넓게(기본) */
  header?: 'split' | 'wide';
  /** 상세 페이지를 다크 테마로 */
  theme?: 'dark';

  // ── Key Information ──
  /** 맡은 역할을 성격별(기획·제작·검수·운영 등)로 나눈 것 */
  scope: { label: string; items: string[] }[];
  /** 관련 프로젝트 한 줄 안내 */
  related?: { text: string; link: LinkItem };

  // ── Featured Results: 실제 결과물. 아무것도 없으면 이 영역은 나오지 않는다 ──
  featured?: {
    /** 날짜가 있는 결과 */
    milestone?: { date: string; label: string };
    items?: FeaturedItem[];
    /** 완성 영상, 게시물 캡처, PDF 등. 등록되면 이 영역 맨 위에 나온다. */
    media?: Media[];
  };

  // ── Process: 어떻게 풀었는지 ──
  process?: {
    challenge?: string;
    /** 바뀌기 전과 후 */
    shift?: { from: string; to: string };
    /** 접근 방법 (큰 카드) */
    approach?: string[];
    /** 순서가 있는 흐름 */
    flow?: string[];
    groups?: Group[];
    tags?: { title: string; items: string[] }[];
    note?: string;
    /** 스토리보드, 시안, 검수 화면 등 작업 과정 자료 */
    media?: Media[];
  };

  // ── Outcome: 끝난 일과 진행 중인 일을 구분한다 ──
  outcome?: {
    /** 완료된 결과 */
    done?: string[];
    /** 진행 중이거나 기획 단계인 것 */
    ongoing?: string[];
    metrics?: Metrics;
    changes?: Changes;
    note?: string;
    next?: { text: string[]; link: LinkItem };
  };
}
