/**
 * 빌드 채널 — 정식 배포(production)와 개발 테스트(dev)를 빌드 단계에서 나눔.
 *   VITE_CHANNEL=dev  (npm run build:dev · 개발 사이트 /GoNa/dev/): 테스트 메뉴 · ?test 경로 · 디버그 패널 · 소리 테스트 ·
 *                     보스전 바로가기 · 성능 표시 · 테스트 빌드 표시를 모두 포함. 저장 데이터는 'gona-dev:' 를 붙여 정식과 따로 씀.
 *   그 밖 (npm run build · 정식 사이트 /GoNa/): 위 개발 기능 코드가 번들에서 빠짐 (주소에 ?test 를 붙여도 실행되지 않음).
 *   npm run dev (로컬 개발 서버): 개발 기능 포함.
 */
export const CHANNEL: 'dev' | 'production' = import.meta.env.VITE_CHANNEL === 'dev' ? 'dev' : 'production';
/** (참고용) 개발 기능 포함 여부 — 코드에서 막을 때는 반드시 __DEV_TOOLS__ 를 직접 씀 (그래야 정식 빌드에서 코드가 빠짐) */
export const DEV_TOOLS: boolean = __DEV_TOOLS__;
/** 저장소 키 앞에 붙임 — 같은 주소(uipcjhj.github.io)를 쓰는 정식·개발 사이트의 저장 데이터를 분리 */
export const STORAGE_PREFIX = import.meta.env.VITE_CHANNEL === 'dev' ? 'gona-dev:' : '';
