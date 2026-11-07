/**
 * 모바일 진동(타격감) — 브라우저 Vibration API(navigator.vibrate)가 있을 때만.
 *   iPhone Safari 는 웹 진동을 지원하지 않음 → 아무 일도 하지 않음(오류 없음). 안드로이드 크롬 등에서만 실제로 울림.
 *   설정: 일시정지 화면의 '진동' 버튼 (localStorage 에 저장, 기본 켜짐)
 *   같은 종류는 쿨다운 동안 다시 울리지 않고, 더 약한 진동이 강한 진동을 끊지 않음.
 */
import { storage } from './storage';

export type HapticKind = 'monsterHit' | 'hurt' | 'bossHit' | 'specialHit' | 'specialFinal' | 'bossSpecial' | 'bossDown';

const PATTERNS: Record<HapticKind, number | number[]> = {
  monsterHit: 12, // 일반 몬스터 타격: 짧고 약하게
  hurt: 40, // 고나 피격: 중간
  bossHit: 26, // 보스 타격: 짧고 강하게
  specialHit: 30,
  specialFinal: [50, 40, 90], // 필살기 마지막 강타: 강조 패턴
  bossSpecial: [30, 30, 30],
  bossDown: [80, 60, 140],
};
const COOLDOWN: Record<HapticKind, number> = { monsterHit: 120, hurt: 300, bossHit: 120, specialHit: 150, specialFinal: 400, bossSpecial: 400, bossDown: 800 };
const STRENGTH: Record<HapticKind, number> = { monsterHit: 1, bossHit: 2, specialHit: 2, hurt: 3, bossSpecial: 3, specialFinal: 4, bossDown: 5 };
const KEY = 'gona.vibrate';

class Haptics {
  /** 이 브라우저에 진동 기능이 있는지 (iPhone Safari = false) */
  readonly supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  enabled = storage.get(KEY) !== '0';
  private last: Partial<Record<HapticKind, number>> = {};
  private busyUntil = 0;
  private busyStrength = 0;
  /** (검증용) 요청 기록 */
  readonly log: { kind: HapticKind; t: number; played: boolean }[] = [];

  setEnabled(on: boolean): void {
    this.enabled = on;
    storage.set(KEY, on ? '1' : '0');
  }

  play(kind: HapticKind): void {
    const now = performance.now();
    const ok = this.enabled && this.supported && now - (this.last[kind] ?? -1e9) >= COOLDOWN[kind] && (now >= this.busyUntil || STRENGTH[kind] >= this.busyStrength);
    if (this.log.length > 60) this.log.shift();
    this.log.push({ kind, t: Math.round(now), played: ok });
    if (!ok) return;
    this.last[kind] = now;
    const p = PATTERNS[kind];
    const dur = Array.isArray(p) ? p.reduce((a, b) => a + b, 0) : p;
    this.busyUntil = now + dur;
    this.busyStrength = STRENGTH[kind];
    try {
      navigator.vibrate(p);
    } catch {
      /* 일부 브라우저는 사용자 동작 전 호출을 막음 — 무시 */
    }
  }
}

export const haptics = new Haptics();
