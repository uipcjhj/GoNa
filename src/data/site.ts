/**
 * 사이트 전역 정보. 이 파일만 고치면 이름·소개·연락처가 모든 화면에 반영된다.
 * placeholder: true 인 항목은 화면에 "임시" 표시가 붙는다. 실제 내용으로 바꾼 뒤 false 로 바꾸거나 지운다.
 */
export const site = {
  name: 'HJ. PORTFOLIO',
  wordmark: 'HJ.',
  role: 'Digital Marketing × Creative × AI',
  /** 배포 주소(예: 'https://example.github.io/portfolio'). 채우면 canonical·sitemap 이 생성된다. */
  url: '',
  /** true 인 동안 화면 맨 위에 초안 안내 띠가 보인다 */
  draft: true,
  concept: {
    en: ['Beyond Ideas.', 'Into Reality.'],
    ko: '아이디어를 기획에서 끝내지 않고 실제 결과물로 구현하는 디지털마케터.',
  },
  intro: {
    text: '현대무벡스 전략기획팀에서 디지털마케팅을 담당합니다. 글로벌 SNS 채널, 제품·레퍼런스 영상, B2B 브랜드 콘텐츠를 맡고 있고, 마케팅 업무를 자동화하는 AI 도구를 직접 기획하고 구현합니다.',
    placeholder: false,
  },
  description:
    '아이디어를 기획에서 끝내지 않고 실제 결과물로 구현하는 디지털마케터 HJ의 포트폴리오. 글로벌 SNS, B2B 브랜드 콘텐츠, 영상 제작, AI 기반 마케팅 자동화.',
  contact: {
    email: { value: 'your.email@example.com', placeholder: true },
    /** href 가 비어 있으면 "준비 중"으로 표시되고 눌리지 않는다 */
    linkedin: { href: '', placeholder: true },
    github: { href: 'https://github.com/uipcjhj', placeholder: false },
    /** public/ 에 PDF 를 넣고 경로를 적는다 (예: 'resume.pdf') */
    resume: { href: '', placeholder: true },
  },
};
