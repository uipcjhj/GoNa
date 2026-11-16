import type { LinkItem, Media } from './types';

/**
 * Creative Archive: 대표 프로젝트로 다루지 않는 이전 작업물 목록.
 *
 * - media 를 넣은 항목은 갤러리에 이미지로, 없는 항목은 글 목록으로 나온다.
 *   파일은 public/media/archive/ 아래에 둔다. 저작권·상표·개인정보를 확인한 자료만 올린다.
 * - context 에는 확인된 소속·성격만 적는다. 수상작의 등급·주최·연도는 증빙을 확인한 뒤에 적는다.
 * - link 는 직접 열어 확인한 주소만 적는다.
 */
export interface ArchiveItem {
  title: string;
  context?: string;
  media?: Media;
  link?: LinkItem;
}
export interface ArchiveCategory {
  id: string;
  title: string;
  ko: string;
  items: ArchiveItem[];
}

const KDMES = '극동MES';

export const archive: ArchiveCategory[] = [
  {
    id: 'video-motion',
    title: 'Video & Motion',
    ko: '영상·모션',
    items: [
      { title: 'Badaro Yacht 유튜브 영상', context: KDMES },
      { title: 'Shorts 영상', context: KDMES },
      { title: '중고선외기 Before / After 전시 영상' },
      { title: '네이버 라이브쇼핑 인트로' },
      { title: 'After Effects 퍼펫핀 · 슬롯머신' },
      { title: 'GIF 제작' },
    ],
  },
  {
    id: 'graphic-brand',
    title: 'Graphic & Brand Design',
    ko: '그래픽·브랜드 디자인',
    items: [
      { title: '카드뉴스', context: KDMES },
      { title: '잡지 광고 디자인', context: KDMES },
      { title: '현수막·가격표 등 인쇄물 디자인', context: KDMES },
    ],
  },
  {
    id: 'web-commerce',
    title: 'Web & Commerce',
    ko: '웹·커머스',
    items: [
      { title: '상품 상세페이지 디자인', context: KDMES },
      { title: '웹디자인 · UI/UX · 아이콘 디자인', context: KDMES },
    ],
  },
  {
    id: 'editorial-pr',
    title: 'Editorial & PR',
    ko: '에디토리얼·홍보',
    items: [
      { title: '경영회의·세미애뉴얼 보도자료', context: KDMES },
      { title: '언론 노출', context: KDMES },
      { title: '보도자료', context: '박찬대 국회의원실' },
      { title: '보도·사회·기획·건강면 기사 및 기획안', context: '대학 신문사' },
    ],
  },
  {
    id: 'awards-personal',
    title: 'Awards & Personal Projects',
    ko: '수상작 목록·개인 작업',
    items: [
      { title: '올가을, 미술관 박물관에 빠지다', context: '수상작 목록' },
      { title: '물의 도시 인천의 진짜 물, 승기천을 아시나요', context: '수상작 목록 · 60초영화제' },
      { title: 'Green Story — 인천시민과 승기천의 여정', context: '수상작 목록 · 공익콘텐츠' },
      { title: '성과공유기업 직장인의 하루', context: `수상작 목록 · ${KDMES}` },
      { title: '탐나도 먹킷리스트', context: '개인 작업' },
      { title: '우리동네 커뮤니티 서비스 ‘우동’ 포스터', context: '개인 작업' },
    ],
  },
];
