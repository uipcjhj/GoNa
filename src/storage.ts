/** localStorage 를 안전하게 감싼 헬퍼 (사파리 시크릿 모드 등에서 예외 방지) */
export const storage = {
  /** 개발용 테스트 모드(?test=…): 저장하지 않음 — 최고 점수·체크포인트·설정이 바뀌지 않게 */
  readOnly: false,
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    if (storage.readOnly) return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* 저장 불가 환경은 무시 */
    }
  },
};
