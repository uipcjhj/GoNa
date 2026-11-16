/** About · Capabilities · How I Work 영역 데이터 */

export const about = {
  paragraphs: [
    '현대무벡스 전략기획팀에서 글로벌 디지털마케팅, 제품·솔루션 영상 기획, 글로벌 전시 홍보, 홈페이지·SEO, 시장정보 분석 업무를 수행했습니다.',
    'AI를 활용해 반복 업무를 개선하는 도구를 직접 기획·구현하고, 개인적으로 웹게임과 인터랙티브 콘텐츠를 제작하고 있습니다.',
  ],
  experience: { organization: 'HYUNDAI MOVEX', team: '전략기획팀', role: '디지털마케팅' },
  /** 이 포트폴리오가 함께 보여 주려는 네 가지 */
  pillars: [
    { en: 'Marketing Strategy', ko: '마케팅 전략' },
    { en: 'Content Production', ko: '콘텐츠 제작' },
    { en: 'Data Analysis', ko: '데이터 분석' },
    { en: 'AI-driven Execution', ko: 'AI 기반 실행력' },
  ],
};

/** 핵심 업무 영역. 홈 첫 화면 바로 아래에 나오고, 각 항목은 근거가 되는 프로젝트로 이어진다. */
export const capabilities = [
  { en: 'Digital Marketing', ko: '글로벌 SNS 채널 운영 및 성장 전략', to: '/work/b2b-digital-marketing/' },
  { en: 'Video Production', ko: '제품·레퍼런스 영상 기획 및 제작 관리', to: '/work/product-storytelling/' },
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
    text: '영상, 전시 콘텐츠, 홈페이지를 제작 부서·제작사와 함께 만들고, 필요한 도구는 AI로 직접 만듭니다.',
    project: { label: 'Global Opportunity Radar', to: '/work/global-opportunity-radar/' },
  },
  {
    en: 'Measure',
    ko: '숫자로 확인합니다',
    text: 'KPI를 정해 두고 결과를 기준일과 함께 기록하고 보고합니다.',
    project: { label: 'B2B Digital Marketing & Growth', to: '/work/b2b-digital-marketing/' },
  },
];
