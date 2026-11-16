/** About 영역 데이터. placeholder: true 항목은 화면에 "임시" 표시가 붙는다. */

export interface Capability {
  en: string;
  ko: string;
  /** 보충 설명 (선택) */
  note?: string;
  placeholder?: boolean;
}

// 현재 직무의 주요 업무 영역
export const capabilities: Capability[] = [
  { en: 'Global Social Media', ko: '글로벌 SNS 채널 운영 및 성장 전략' },
  { en: 'Video Production', ko: '제품·레퍼런스 영상 기획 및 제작 관리' },
  { en: 'B2B Brand Content', ko: 'B2B 브랜드 콘텐츠 및 전시 홍보' },
  { en: 'Web, SEO & Newsletter', ko: '홈페이지·SEO·뉴스레터·디지털 콘텐츠' },
  { en: 'Market Intelligence', ko: '시장·경쟁사 동향 분석' },
  { en: 'AI Marketing Automation', ko: 'AI 기반 마케팅 업무 자동화 도구 기획 및 구현' },
];

export interface Career {
  /** 근무 기간. 모르면 비워 둔다 */
  period?: string;
  company: string;
  role: string;
  note?: string;
  placeholder?: boolean;
}

export const careers: Career[] = [
  // 입사 연도를 알려 주시면 period 를 '2000 — 현재' 형태로 바꾼다
  { period: '현재', company: '현대무벡스', role: '전략기획팀 · 디지털마케팅' },
];

export const toolGroups = [
  { label: 'Marketing', items: ['도구 이름', '도구 이름', '도구 이름'], placeholder: true },
  { label: 'Content & Video', items: ['도구 이름', '도구 이름', '도구 이름'], placeholder: true },
  // 이 사이트와 GONA 게임 저장소에서 실제로 사용한 것만 적었다
  { label: 'Development', items: ['Vite', 'React', 'TypeScript', 'Tailwind CSS', 'Phaser'], placeholder: false },
];
