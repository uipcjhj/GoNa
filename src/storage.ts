/** localStorage 를 안전하게 감싼 헬퍼 (사파리 시크릿 모드 등에서 예외 방지) */
export const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* 저장 불가 환경은 무시 */
    }
  },
};
