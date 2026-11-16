/** Career Highlights · About · Experience · Capabilities · How I Work 영역 데이터 */

/** 첫 화면 바로 아래에 나오는 세 가지 역량. 수치는 쓰지 않는다. */
export const highlights = [
  {
    en: 'Hands-on Content Production',
    ko: '기획·촬영·편집·디자인을 직접 수행하는 콘텐츠 제작 역량',
    to: '/work/youtube-social-growth/',
  },
  {
    en: 'B2B & Global Marketing',
    ko: '글로벌 채널 운영, 기술 콘텐츠, 전시 마케팅 및 브랜드 커뮤니케이션',
    to: '/work/b2b-digital-marketing/',
  },
  {
    en: 'AI-driven Problem Solving',
    ko: '실제 업무의 문제를 AI 기반 도구와 디지털 서비스로 구현하는 실행력',
    to: '/work/global-opportunity-radar/',
  },
];

export const about = {
  paragraphs: [
    '콘텐츠 제작에서 시작해 브랜드 전략과 글로벌 B2B 디지털마케팅으로 전문성을 확장해 왔습니다.',
    '극동MES에서 약 3년간 콘텐츠 기획, 영상 촬영·편집, SNS 운영, 브랜드 디자인 등 다양한 실무를 수행했습니다.',
    '이후 현대무벡스 전략기획팀에서 글로벌 디지털마케팅, 제품·솔루션 콘텐츠, 전시 마케팅, 시장정보 분석 등의 업무로 역량을 확장했습니다.',
    '최근에는 AI를 활용해 반복 업무를 개선하는 서비스를 직접 기획·구현하며, 아이디어를 실제 결과물로 연결하는 방법을 탐구하고 있습니다.',
  ],
  /** 커리어가 넓어진 순서 */
  path: ['커뮤니케이션', '콘텐츠 제작', '디지털마케팅 전략', '글로벌 B2B 마케팅', 'AI 기반 업무 개선 및 서비스 구현'],
};

/**
 * 경력. 최근 것이 위.
 * period 는 확인된 날짜만 적는다. 현대무벡스는 입사일만 확정이라 종료·재직 여부를 적지 않는다.
 */
export const career = [
  {
    period: '2025.11 입사',
    organization: '현대무벡스',
    role: '전략기획팀 · 디지털마케팅',
    tasks: [
      '글로벌 SNS 채널 운영',
      '제품·솔루션 영상 기획',
      '글로벌 전시회 홍보',
      'B2B 브랜드 콘텐츠',
      '홈페이지·SEO',
      '시장정보 및 경쟁사 분석',
      '뉴스레터 및 리드 확보 전략',
      'AI 기반 업무 자동화 도구 기획',
    ],
    link: { label: 'B2B Digital Marketing & Growth', to: '/work/b2b-digital-marketing/' },
  },
  {
    period: '2022.12 – 2025.11',
    organization: '극동MES',
    role: '콘텐츠 마케터',
    tasks: [
      '유튜브 콘텐츠 기획·촬영·편집·업로드',
      'Instagram 채널 운영',
      '카드뉴스·Shorts·Reels 제작',
      '브랜드 광고 및 인쇄물 디자인',
      '상품 상세페이지 및 웹디자인',
      '보도자료 작성 및 언론홍보',
      '프로모션·이벤트 콘텐츠',
      '월별 마케팅 성과 분석',
    ],
    link: { label: 'YouTube & Social Growth', to: '/work/youtube-social-growth/' },
  },
  {
    period: '2018.02 – 2018.06',
    organization: '인천시선거관리위원회',
    role: '위법성검토요원',
    tasks: ['온라인 게시물 관련 선거법 위법성 검토', '보도자료 작성', '행사 운영 지원'],
  },
  {
    period: '2017.09 – 2017.12',
    organization: '박찬대 국회의원실',
    role: '입법보조원 인턴',
    tasks: ['보도자료, 질의서, 축사 작성', '통계자료 분석', 'SNS 관리', '사진 촬영 및 편집', '뉴스 클리핑'],
  },
];

/** 업무 영역. 각 항목은 근거가 되는 프로젝트로 이어진다. */
export const capabilities = [
  { en: 'Digital Marketing', ko: '글로벌 SNS 채널 운영 및 성장 전략', to: '/work/b2b-digital-marketing/' },
  { en: 'Content Marketing', ko: 'YouTube·Instagram 콘텐츠 기획·발행·성과 분석', to: '/work/youtube-social-growth/' },
  { en: 'Video Production', ko: '영상 기획·촬영·편집, 제품 영상 기획 및 검수', to: '/work/product-storytelling/' },
  { en: 'Brand & Graphic Design', ko: '광고·인쇄물·상세페이지·웹디자인', to: '/work/brand-content-design/' },
  { en: 'Global Exhibition', ko: 'B2B 브랜드 콘텐츠 및 전시 홍보', to: '/work/global-exhibition-marketing/' },
  { en: 'Website & SEO', ko: '홈페이지·SEO·뉴스레터·디지털 콘텐츠', to: '/work/website-seo/' },
  { en: 'Market Intelligence', ko: '시장·경쟁사 동향 분석', to: '/work/market-intelligence/' },
  { en: 'AI Automation', ko: 'AI 기반 마케팅 업무 자동화 도구 기획 및 구현', to: '/work/global-opportunity-radar/' },
];

/** 일하는 순서. 각 단계의 근거가 되는 프로젝트를 함께 적는다. */
export const process = [
  {
    en: 'Read',
    ko: '시장을 읽습니다',
    text: '산업 뉴스, 경쟁사 동향, 채널 데이터를 살펴 지금 무엇이 달라지고 있는지부터 확인합니다.',
    project: { label: 'Market Intelligence', to: '/work/market-intelligence/' },
  },
  {
    en: 'Design',
    ko: '메시지를 설계합니다',
    text: '기능 설명을 고객이 얻는 가치 중심의 이야기로 바꾸고, 채널과 형식에 맞게 구조를 잡습니다.',
    project: { label: 'Product Storytelling', to: '/work/product-storytelling/' },
  },
  {
    en: 'Build',
    ko: '콘텐츠와 기술로 구현합니다',
    text: '영상과 디자인은 직접 만들거나 제작사와 함께 만들고, 필요한 도구는 AI로 직접 구현합니다.',
    project: { label: 'YouTube & Social Growth', to: '/work/youtube-social-growth/' },
  },
  {
    en: 'Measure',
    ko: '숫자로 확인합니다',
    text: 'KPI를 정해 두고 결과를 기준일과 함께 기록하고 보고합니다.',
    project: { label: 'B2B Digital Marketing & Growth', to: '/work/b2b-digital-marketing/' },
  },
];
