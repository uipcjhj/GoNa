/** localStorage 를 안전하게 감싼 헬퍼 (사파리 시크릿 모드 등에서 예외 방지) · 개발 사이트는 키 앞에 'gona-dev:' (정식과 분리) */
import { STORAGE_PREFIX } from './env';

export const storage = {
  /** 개발용 테스트 모드(?test=…): 저장하지 않음 — 최고 점수·체크포인트·설정이 바뀌지 않게 */
  readOnly: false,
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(STORAGE_PREFIX + key);
    } catch {
      return null;
    }
  },
  /** force: 테스트 모드(readOnly)에서도 저장 — 햅틱 설정·햅틱 테스트 확인 결과처럼 테스트 자체가 기록하는 값만 */
  set(key: string, value: string, force = false): void {
    if (storage.readOnly && !force) return;
    try {
      window.localStorage.setItem(STORAGE_PREFIX + key, value);
    } catch {
      /* 저장 불가 환경은 무시 */
    }
  },
  remove(key: string): void {
    if (storage.readOnly) return;
    try {
      window.localStorage.removeItem(STORAGE_PREFIX + key);
    } catch {
      /* 저장 불가 환경은 무시 */
    }
  },
};
