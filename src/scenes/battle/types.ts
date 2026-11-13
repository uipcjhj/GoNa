/**
 * 보스전 ↔ GameScene 연결 (보스전 코드는 GameScene 의 내부를 몰라도 되게).
 * 좌표는 모두 GameScene 의 논리 화면 좌표 (y 는 아래로 +, 땅 윗면 = groundY).
 */
import type Phaser from 'phaser';
import type { SnackKind } from '../../config';

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface BattleHost {
  readonly scene: Phaser.Scene;
  readonly W: number;
  readonly H: number;
  readonly groundY: number;
  /** 고나의 기본 x (흡입으로 끌려가기 전) */
  readonly basePlayerX: number;
  /** 지금 땅이 흘러가는 속도(px/s) — 바닥 장판이 땅과 같이 움직이게 */
  readonly scrollSpeed: number;
  playerRect(): Rect;
  playerHead(): { x: number; y: number };
  playerGrounded(): boolean;
  /** 고나가 맞음 (HP 피해). 무적·방패 중이면 false */
  hurtPlayer(damage: number, source?: string): boolean;
  /** 방패가 켜져 있으면 그 영역 (고나 앞) */
  shieldRect(): Rect | null;
  /** 방패가 막음 (반짝·소리) */
  onShieldBlock(x: number, y: number): void;
  /** 흡입: 기본 x 에서 오른쪽으로 끌려간 거리 */
  pull: number;
  /** 흡입에 버티는 중 (발 구르기·흔들림) */
  setResisting(on: boolean): void;
  spawnSnack(kind: SnackKind, alt: number): void;
  addScore(points: number, x: number, y: number): void;
  sparkle(n: number, x: number, y: number): void;
  /** 떠오르는 글자 (재사용 풀 — 매번 새 텍스처를 만들지 않음) */
  floatText(text: string, x: number, y: number, color: string): void;
  /** 머리카락 부메랑 사용 가능하게 (뽀뽀괴물전 각성) */
  unlockBoomerang(): void;
  /** 머리카락 텍스처 (부메랑·필살기 그림) */
  hairTexture(): string;
  /** 필살기 진지한 얼굴 시트 (0: 머리카락 있음 · 1: 빠짐) — 컷인에도 사용 */
  seriousTexture(): string;
  /** 필살기 연출 중 고나 그림 ('serious' · 'bald' · null=원래대로) */
  setSpecialLook(look: 'serious' | 'bald' | null): void;
  /** 이 보스의 전투 음악 시작 (등장 연출이 끝나고 싸움이 시작될 때 — 최종 보스) */
  startBattleMusic?(): void;
  /** 고나 그림 숨기기 (의자·후드리챱챱처럼 전용 그림이 고나 자리에 대신 나올 때) */
  setPlayerHidden?(on: boolean): void;
  /** 고나 발밑 가운데 (화면 좌표) */
  playerFoot?(): { x: number; y: number };
  /** 보스전 끝 (승리 연출까지 끝난 뒤) */
  onBattleEnd(win: boolean): void;
}

export function overlap(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

export function circleRect(cx: number, cy: number, r: number, b: Rect): boolean {
  const nx = Math.max(b.x0, Math.min(cx, b.x1));
  const ny = Math.max(b.y0, Math.min(cy, b.y1));
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}
