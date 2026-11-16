/** About 영역 데이터. placeholder: true 항목은 화면에 "임시" 표시가 붙는다. */

export const capabilities = [
  { en: 'Digital Marketing', ko: '디지털마케팅', note: '담당한 채널과 업무 범위를 적어 주세요.', placeholder: true },
  { en: 'Content Planning', ko: '콘텐츠 기획', note: '기획한 콘텐츠 유형과 방식을 적어 주세요.', placeholder: true },
  { en: 'Branding', ko: '브랜딩', note: '브랜드 관련 작업 경험을 적어 주세요.', placeholder: true },
  { en: 'Video Production', ko: '영상 제작', note: '기획·촬영·편집 중 직접 맡는 범위를 적어 주세요.', placeholder: true },
  { en: 'AI Development', ko: 'AI 자동화 · 웹서비스 개발', note: '만든 도구와 사용한 방식을 적어 주세요.', placeholder: true },
];

export interface Career {
  period: string;
  company: string;
  role: string;
  note: string;
  placeholder?: boolean;
}

export const careers: Career[] = [
  { period: '0000 — 현재', company: '회사명', role: '직무 · 직책', note: '주요 업무를 한두 문장으로 적어 주세요.', placeholder: true },
  { period: '0000 — 0000', company: '회사명', role: '직무 · 직책', note: '주요 업무를 한두 문장으로 적어 주세요.', placeholder: true },
];

export const toolGroups = [
  { label: 'Marketing', items: ['도구 이름', '도구 이름', '도구 이름'], placeholder: true },
  { label: 'Content & Video', items: ['도구 이름', '도구 이름', '도구 이름'], placeholder: true },
  // 이 사이트와 GONA 게임 저장소에서 실제로 사용한 것만 적었다
  { label: 'Development', items: ['Vite', 'React', 'TypeScript', 'Tailwind CSS', 'Phaser'], placeholder: false },
];
