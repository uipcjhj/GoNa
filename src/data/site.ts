/**
 * 사이트 전역 정보. 이 파일만 고치면 이름·소개·연락처가 모든 화면에 반영된다.
 * 연락처는 값이 비어 있으면 화면에 나오지 않는다. 실제 주소를 넣으면 자동으로 표시된다.
 */
export const site = {
  name: 'HJ. PORTFOLIO',
  wordmark: 'HJ.',
  role: 'B2B Digital Marketer & Creative Builder',
  /** 배포 주소(예: 'https://example.github.io/portfolio'). 채우면 canonical·sitemap 이 생성된다. */
  url: '',
  concept: {
    en: ['Beyond Ideas.', 'Into Reality.'],
    ko: '생각을 전략으로. 전략을 현실로.',
  },
  intro: '시장을 읽고, 브랜드의 메시지를 설계하고, 콘텐츠와 기술로 아이디어를 구현합니다.',
  description:
    'B2B 디지털마케터 HJ의 포트폴리오. 글로벌 디지털마케팅, 제품·솔루션 영상, 전시 홍보, 홈페이지·SEO, 시장정보 분석, AI 기반 자동화 프로젝트.',
  contact: {
    email: '',
    linkedin: '',
    github: 'https://github.com/uipcjhj',
    /** public/ 에 PDF 를 넣고 경로를 적는다 (예: 'resume.pdf') */
    resume: '',
  },
};
