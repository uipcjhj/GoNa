/**
 * 사이트 전역 정보. 이 파일만 고치면 이름·소개·연락처가 모든 화면에 반영된다.
 * 연락처는 값이 비어 있으면 화면에 나오지 않는다. 실제 주소를 넣으면 자동으로 표시된다.
 */
export const site = {
  name: 'HJ. PORTFOLIO',
  wordmark: 'HJ.',
  role: 'Digital Marketer & Creative Builder',
  /** 배포 주소(예: 'https://example.github.io/portfolio'). 채우면 canonical·sitemap 이 생성된다. */
  url: '',
  concept: {
    en: ['Beyond Ideas.', 'Into Reality.'],
    ko: '콘텐츠를 만들고, 브랜드를 성장시키고, 새로운 도구를 구현합니다.',
  },
  intro: '콘텐츠 기획·촬영·편집부터 글로벌 B2B 디지털마케팅, 데이터 기반 성과 관리, AI 기반 서비스 기획과 구현까지.',
  description:
    '디지털마케터 HJ의 포트폴리오. 콘텐츠 기획·촬영·편집, 브랜드 디자인, 글로벌 B2B 디지털마케팅, 전시 홍보, 홈페이지·SEO, 시장정보 분석, AI 기반 프로젝트.',
  contact: {
    email: '',
    linkedin: '',
    github: 'https://github.com/uipcjhj',
    /** public/ 에 PDF 를 넣고 경로를 적는다 (예: 'resume.pdf') */
    resume: '',
  },
};
