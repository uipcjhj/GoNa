/**
 * 모바일 햅틱(진동) — 기기별로 쓸 수 있는 방법을 골라 씀. 못 쓰는 기기에서는 아무 일도 하지 않음(오류 없음).
 *
 *   ① 안드로이드 크롬 등: Vibration API (navigator.vibrate) — 길이·패턴까지 그대로
 *   ② iPhone Safari·홈 화면 앱 (실험): iOS 18 부터 Safari 의 '스위치'(<input type="checkbox" switch>)를 켜고 끌 때
 *      시스템이 짧은 '톡' 햅틱을 냄 → 보이지 않는 스위치 라벨을 눌러(label.click) 그 햅틱을 빌려 씀.
 *      세기·길이는 바꿀 수 없음 → 한 번의 '톡'만 (설정에서 '여러 번 톡' 실험을 켜면 패턴 마디 수만큼 톡톡)
 *      Apple 이 공식으로 지원하는 기능이 아니라서 iOS 버전·설정(시스템 햅틱 끔·저전력 모드)에 따라 안 될 수 있음.
 *      → API 가 있다는 것만으로 '진동 성공'이라고 하지 않음: 햅틱 테스트 화면에서 직접 느꼈는지 확인 (확인 결과 저장)
 *   ③ 그 밖: 지원 불가 (게임은 그대로)
 *
 *   설정: '진동' 켜기/끄기 (저장, 기본 켜짐) · 같은 종류는 쿨다운 동안 다시 울리지 않고, 약한 진동이 강한 진동을 끊지 않음
 *   전체 최소 간격도 둠 (연속 진동 방지 · iOS 는 스위치를 너무 자주 누르지 않게)
 */
import { storage } from './storage';

export type HapticKind =
  | 'jump'
  | 'snack'
  | 'monsterHit'
  | 'hurt'
  | 'bossHit'
  | 'special'
  | 'specialHit'
  | 'specialFinal'
  | 'bossSpecial'
  | 'evolve'
  | 'bossDown';

/** 진동 패턴 (ms: 울림, 쉼, 울림 …) */
export const PATTERNS: Record<HapticKind, number | number[]> = {
  jump: 8, // 점프: 아주 짧게
  snack: 16, // 간식: 가볍게 한 번
  monsterHit: [14, 50, 14], // 머리카락 부메랑 명중: 짧게 두 번
  bossHit: [16, 50, 16],
  hurt: 70, // 피격: 강하게 한 번
  special: [40, 30, 40, 30, 90], // 필살기 발동: 강한 패턴
  specialHit: 30,
  specialFinal: [60, 40, 120],
  bossSpecial: [30, 30, 30],
  evolve: [30, 110, 30, 380, 30, 110, 30], // 성장·진화: 두근두근 (두 번 쿵쿵)
  bossDown: [100, 80, 100, 80, 160], // 보스 처치: 강하게 세 번
};
const COOLDOWN: Record<HapticKind, number> = { jump: 80, snack: 90, monsterHit: 120, hurt: 300, bossHit: 120, special: 600, specialHit: 150, specialFinal: 400, bossSpecial: 400, evolve: 1500, bossDown: 800 };
const STRENGTH: Record<HapticKind, number> = { jump: 0, snack: 0, monsterHit: 1, bossHit: 2, specialHit: 2, hurt: 3, bossSpecial: 3, special: 4, specialFinal: 4, evolve: 4, bossDown: 5 };
/** 어떤 진동이든 이 간격(ms)보다 자주 울리지 않음 */
const MIN_GAP = 40;
const KEY = 'gona.vibrate';
const KEY_MULTI = 'gona.hapticMulti';
const KEY_RESULT = 'gona.hapticResult';

export type HapticMethod = 'vibrate' | 'ios-switch' | 'none';

const isIOS = (): boolean =>
  typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

class Haptics {
  /** 이 기기에서 쓸 방법 */
  readonly method: HapticMethod;
  /** (예전 이름 호환) 안드로이드식 진동이 있는지 */
  readonly supported: boolean;
  enabled = storage.get(KEY) !== '0';
  /** iOS: 패턴 마디 수만큼 여러 번 톡 (실험) — 기본은 한 번만 */
  multi = storage.get(KEY_MULTI) === '1';
  private last: Partial<Record<HapticKind, number>> = {};
  private lastAny = -1e9;
  private busyUntil = 0;
  private busyStrength = 0;
  private iosTimers: number[] = [];
  /** (검증용) 요청 기록 */
  readonly log: { kind: HapticKind; t: number; played: boolean }[] = [];

  constructor() {
    const vib = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
    const sw = typeof HTMLInputElement !== 'undefined' && 'switch' in HTMLInputElement.prototype;
    this.method = vib ? 'vibrate' : isIOS() && sw ? 'ios-switch' : 'none';
    this.supported = vib;
  }

  /** 홈 화면 앱으로 실행 중인지 */
  get standalone(): boolean {
    return (navigator as unknown as { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    storage.set(KEY, on ? '1' : '0', true);
  }

  setMulti(on: boolean): void {
    this.multi = on;
    storage.set(KEY_MULTI, on ? '1' : '0', true);
  }

  /** 햅틱 테스트에서 사용자가 직접 확인한 결과 (환경별) */
  get results(): Record<string, 'felt' | 'not'> {
    try {
      return JSON.parse(storage.get(KEY_RESULT) ?? '{}');
    } catch {
      return {};
    }
  }

  saveResult(env: string, felt: boolean): void {
    const r = this.results;
    r[env] = felt ? 'felt' : 'not';
    storage.set(KEY_RESULT, JSON.stringify(r), true);
  }

  play(kind: HapticKind, force = false): void {
    const now = performance.now();
    const ok =
      this.enabled &&
      this.method !== 'none' &&
      (force || (now - (this.last[kind] ?? -1e9) >= COOLDOWN[kind] && now - this.lastAny >= MIN_GAP && (now >= this.busyUntil || STRENGTH[kind] >= this.busyStrength)));
    if (this.log.length > 60) this.log.shift();
    this.log.push({ kind, t: Math.round(now), played: ok });
    if (!ok) return;
    this.last[kind] = now;
    this.lastAny = now;
    const p = PATTERNS[kind];
    const dur = Array.isArray(p) ? p.reduce((a, b) => a + b, 0) : p;
    this.busyUntil = now + dur;
    this.busyStrength = STRENGTH[kind];
    if (this.method === 'vibrate') {
      try {
        navigator.vibrate(p);
      } catch {
        /* 일부 브라우저는 사용자 동작 전 호출을 막음 — 무시 */
      }
      return;
    }
    // iOS: 한 번 톡 (실험 설정이면 패턴의 '울림' 마디마다 톡)
    this.iosTick();
    if (this.multi && Array.isArray(p)) {
      for (const t of this.iosTimers) clearTimeout(t);
      this.iosTimers = [];
      let at = 0;
      for (let i = 0; i < p.length; i++) {
        if (i > 0 && i % 2 === 0) this.iosTimers.push(window.setTimeout(() => this.iosTick(), Math.max(at, i * 60)));
        at += p[i];
      }
    }
  }

  /** iOS 스위치 햅틱 한 번: 보이지 않는 스위치를 라벨로 눌러 켜고 바로 치움 */
  private iosTick(): void {
    try {
      const label = document.createElement('label');
      label.setAttribute('aria-hidden', 'true');
      label.style.display = 'none';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.tabIndex = -1;
      label.append(input);
      document.head.append(label);
      label.click();
      label.remove();
    } catch {
      /* 지원 안 함 — 무시 */
    }
  }

  /** 지금 환경 이름 (테스트 결과 저장용): 'iOS Safari 탭' · 'iOS 홈 화면 앱' · 'Android' … */
  get envName(): string {
    const ios = isIOS();
    const where = this.standalone ? '홈 화면 앱' : '브라우저 탭';
    return `${ios ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : '기타'} · ${where}`;
  }
}

export const haptics = new Haptics();
