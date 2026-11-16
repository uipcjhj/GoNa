import { archiveFiles } from './archive-media.gen';
import type { LinkItem, Media } from './types';
import { badaroVideos } from './videos';

/**
 * Creative Archive: 직접 만든 작업물 한 건이 데이터 한 개.
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
}

const KDMES = '극동MES';
const PERSONAL = '개인 프로젝트';
const NOTION = '기존 노션 포트폴리오';

const videoWorks: Work[] = badaroVideos.map((v) => ({
  id: `badaro-${v.src}`,
  title: v.alt,
  category: 'Video',
  year: '2024–2025',
  organization: KDMES,
  role: '재직 당시 운영한 채널의 콘텐츠 (영상별 담당 범위는 표기하지 않음)',
  media: [v],
  externalUrl: { label: 'YouTube에서 보기', href: `https://www.youtube.com/watch?v=${v.src}` },
  source: '바다로요트 공식 YouTube 채널 (youtube.com/@BadaroYacht), 2026-11-16 확인',
  verificationStatus: 'verified',
  publicationStatus: 'public',
  featured: true,
}));

const list: Work[] = [
  ...videoWorks,
  {
    id: 'badaro-shorts',
    title: '바다로요트 Shorts',
    category: 'Video',
    organization: KDMES,
    role: '숏폼 콘텐츠 제작',
    externalUrl: { label: 'Shorts 열기', href: 'https://www.youtube.com/@BadaroYacht/shorts' },
    source: `${NOTION} Project “숏츠 영상 제작” / 채널 Shorts 탭`,
    verificationStatus: 'listed',
    publicationStatus: 'title-only',
  },
  { id: 'live-shopping-intro', title: '네이버 라이브쇼핑 인트로', category: 'Video', organization: PERSONAL, source: `${NOTION} 개인작업물`, verificationStatus: 'listed', publicationStatus: 'title-only' },
  { id: 'outboard-before-after', title: '중고선외기 Before / After', category: 'Video', organization: PERSONAL, description: '전시용 영상', source: `${NOTION} 개인작업물`, verificationStatus: 'listed', publicationStatus: 'title-only' },
  { id: 'ae-puppet-pin', title: 'After Effects 퍼펫핀 애니메이션', category: 'Video', organization: PERSONAL, description: '입체·움직이기 효과', source: `${NOTION} 개인작업물`, verificationStatus: 'listed', publicationStatus: 'title-only' },
  { id: 'ae-slot-machine', title: 'After Effects 슬롯머신', category: 'Video', organization: PERSONAL, source: `${NOTION} 개인작업물`, verificationStatus: 'listed', publicationStatus: 'title-only' },
  { id: 'gif-works', title: 'GIF 작업', category: 'Video', organization: PERSONAL, source: `${NOTION} 개인작업물`, verificationStatus: 'listed', publicationStatus: 'title-only' },

  // ── Design ──
  {
    // 원본: 트랜스러시아-001.png (노션 PDF Export ZIP). public/media/archive/card-news/ 에 넣으면 연결된다.
    id: 'card-news',
    title: '카드뉴스 제작',
    category: 'Design',
    organization: KDMES,
    role: '디자인·제작',
    description: 'Trans Russia 전시 카드뉴스 등',
    source: `${NOTION} Project “카드뉴스 제작”`,
    verificationStatus: 'listed',
    publicationStatus: 'title-only',
    featured: true,
  },
  { id: 'magazine-ad', title: '잡지 광고 디자인', category: 'Design', organization: KDMES, role: '디자인', source: `${NOTION} Project “잡지 광고 디자인”`, verificationStatus: 'listed', publicationStatus: 'title-only' },
  { id: 'print-design', title: '출력 디자인', category: 'Design', organization: KDMES, role: '디자인', description: '현수막·가격표 등 인쇄물', source: `${NOTION} Project “출력 디자인”`, verificationStatus: 'listed', publicationStatus: 'title-only' },
  { id: 'udong-poster', title: '우리동네 커뮤니티 서비스 ‘우동’ 포스터', category: 'Design', organization: PERSONAL, source: `${NOTION} 개인작업물`, verificationStatus: 'listed', publicationStatus: 'title-only' },
  { id: 'tamnado', title: '탐나도 먹킷리스트', category: 'Design', organization: PERSONAL, source: `${NOTION} 개인작업물`, verificationStatus: 'listed', publicationStatus: 'title-only' },

  // ── Web ──
  {
    // 원본: 이빅스-상세페이지-001.png (노션 PDF Export ZIP). public/media/archive/ibix-detail-page/ 에 넣으면 연결된다.
    id: 'ibix-detail-page',
    title: 'IBIX 제품 상세페이지',
    category: 'Web',
    organization: KDMES,
    role: '디자인·제작',
    source: `${NOTION} Project “상세페이지”`,
    verificationStatus: 'listed',
    publicationStatus: 'title-only',
    featured: true,
  },
  { id: 'web-design', title: '웹 디자인', category: 'Web', organization: KDMES, role: '디자인', description: 'UI/UX · 아이콘 디자인', source: `${NOTION} Project “웹 디자인”`, verificationStatus: 'listed', publicationStatus: 'title-only' },

  // ── Competition: 기존 노션 "수상작" 목록의 네 작품. 수상 등급·주최·연도는 증빙을 확인한 뒤 description 에 적는다. ──
  { id: 'museum-autumn', title: '올가을, 미술관 박물관에 빠지다', category: 'Competition', organization: PERSONAL, source: `${NOTION} 수상작 목록`, verificationStatus: 'listed', publicationStatus: 'title-only' },
  { id: 'seunggicheon-60s', title: '물의 도시 인천의 진짜 물, 승기천을 아시나요?', category: 'Competition', organization: PERSONAL, description: '60초영화제 출품 영상', source: `${NOTION} 수상작 목록`, verificationStatus: 'listed', publicationStatus: 'title-only' },
  { id: 'kdmes-workday', title: '성과공유기업 직장인의 하루', category: 'Competition', organization: KDMES, source: `${NOTION} 수상작 목록`, verificationStatus: 'listed', publicationStatus: 'title-only' },
  { id: 'green-story', title: 'Green Story — 인천시민과 승기천의 여정', category: 'Competition', organization: PERSONAL, description: '공익콘텐츠 일반 부문 출품작', source: `${NOTION} 수상작 목록`, verificationStatus: 'listed', publicationStatus: 'title-only' },

  // ── Editorial: 원문은 올리지 않고 제목만 공개한다 ──
  {
    id: 'campus-newspaper',
    title: '대학 신문 기사·기획안',
    category: 'Editorial',
    year: '2015–2016',
    organization: '대학 신문사',
    role: '취재·기사 작성',
    documents: [
      { label: '571호 기획안', title: '베지테리언' },
      { label: '572호 보도', title: '학우들의 마음을 울린 1년 후의 세월호' },
      { label: '573호 보도', title: '전자정보이용, 아는 것이 힘이다!' },
      { label: '577호 사회면 · 기획안', title: '대한민국아 입대 좀 주겠니? 입영, 하늘의 ‘군’따기' },
      { label: '581호 보도', title: '0교시는 굿바이, 다시 돌아온 9시 등교!' },
      { label: '582호 기획면 · 기획안', title: '출판독립 만세!' },
      { label: '583호 대학면 · 기획안', title: '대학가에 만연한 불법제본의 유혹' },
      { label: '586호 기자수첩', title: '환영받지 못하는 사람들' },
      { label: '586호 보도', title: '푸른 자연가득 머금은 우리들의 봄 소풍!' },
      { label: '586호 종합', title: '우리대학 성범죄 직원, 우여곡절 끝에 중징계 결정' },
      { label: '587호 기획안', title: '예약부도 (노쇼족)' },
      { label: '587호 보도', title: '제2대 총장 최종후보자 선출' },
      { label: '588호 사회면 · 기획안', title: '진흙탕 속 드러난 양날의 검, 사드배치' },
      { label: '590호 건강', title: '쓰면 삼키고 달면 뱉어라, 반 설탕운동' },
      { label: '591호 기획', title: '지금 여기, 우리. 대한민국의 성매매는' },
      { label: '591호 보도', title: '기업형 인재양성에 한걸음 가까이' },
    ],
    source: '노션 Export ZIP 의 HWP 20개 (기사와 기획안이 짝인 것은 한 줄로 묶음)',
    verificationStatus: 'verified',
    publicationStatus: 'title-only',
  },
  {
    id: 'assembly-press',
    title: '국회의원실 보도자료',
    category: 'Editorial',
    year: '2017',
    organization: '박찬대 국회의원실',
    role: '작성',
    documents: [
      { label: '보도자료', title: '전체 총 대출액, 1년 6개월 사이에 1조 원 가량 늘어' },
      { label: '보도자료', title: '스마트폰 관련 피해구제 신청, “삼성전자” 압도적' },
      { label: '보도자료', title: '이동통신사 소비자피해구제신청, “SK텔레콤”에서 최다 발생' },
    ],
    source: '노션 Export ZIP 의 HWP 4개 중 담당자가 본인으로 적힌 3개',
    verificationStatus: 'verified',
    publicationStatus: 'title-only',
  },
  {
    id: 'kdmes-press',
    title: '극동MES 보도자료',
    category: 'Editorial',
    year: '2023–2024',
    organization: KDMES,
    role: '작성',
    documents: [
      { label: '2023', title: '극동MES, 두바이에서 2023년 상반기 경영회의 개최' },
      { label: '2024', title: '극동MES, 태국-푸켓서 상반기 경영전략회의 겸 글로벌 워크샵 개최' },
      { label: '2024', title: '극동MES, 중국 상해에서 경영전략회의 개최' },
    ],
    source: '노션 Export ZIP 의 DOCX 4개 (초안·최종본은 한 줄로 묶음)',
    verificationStatus: 'verified',
    publicationStatus: 'title-only',
  },
  { id: 'press-coverage', title: '언론 노출', category: 'Editorial', description: '인천일보 칼럼', source: `${NOTION} Project “언론노출”`, verificationStatus: 'listed', publicationStatus: 'title-only' },
];

const IMAGE = /\.(webp|png|jpe?g|gif|avif)$/i;
const fromFile = (work: Work, src: string, i: number): Media => ({
  kind: IMAGE.test(src) ? 'image' : src.endsWith('.pdf') ? 'pdf' : 'video',
  src,
  alt: `${work.title} ${i + 1}`,
  // 세로로 긴 디자인도 잘리지 않도록 비율은 화면에서 이미지 크기에 맡긴다
});

/** 화면에 쓰는 목록: 숨김 항목을 빼고, 폴더에 넣은 파일을 media 에 더한다. */
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
