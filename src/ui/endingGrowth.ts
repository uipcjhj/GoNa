/**
 * 엔딩 장면 1·2 — 고나의 성장 회상 (예전 엔딩 8fd0397 의 '성장 1→4단계 회상 카드'를 액자 안으로 복구)
 *   장면 1 (처음 세상에 왔을 땐…): 둥지 속 알 → 흔들흔들 · 금 → 톡! 알에서 태어난 아기 고나 → 두리번
 *   장면 2 (어느새 혼자 걷고, 달리고…): 기어 다니는 고나 → 혼자 일어서기 → 두 발로 달리기 → 자이언트 곤룡 고나
 * 그림은 모두 게임에 있던 원본 그대로:
 *   알·둥지·알껍데기 = 오프닝 컷신 도트(art/nest.ts) · 고나 = 게임 성장 스프라이트(newborn·crawler·dino·bigbaby)
 *   · 배경 = 게임 숲길(game-bg-loop.png, 예전 회상 카드처럼 반 배율 + 따뜻한 색 덮개)
 * 그리기: 작은 캔버스 하나에 정수 배율·nearest 로만 (번짐·찌그러짐·워프 없음). 고나 모양은 프레임 그림 그대로, 위치만 정수 칸으로.
 */
import { buildEgg, buildNest, buildShellPieces, NEST_H, NEST_SINK } from '../art/nest';
import { GAME_BG } from '../config';
import { sound } from '../audio';

type Sheet = { src: string; w: number; h: number; img?: HTMLImageElement };
const SHEETS: Record<'newborn' | 'crawler' | 'dino' | 'bigbaby', Sheet> = {
  newborn: { src: 'assets/character/stages/newborn.png', w: 25, h: 20 },
  crawler: { src: 'assets/character/stages/crawler.png', w: 30, h: 27 },
  dino: { src: 'assets/character/dino.png', w: 33, h: 34 },
  bigbaby: { src: 'assets/character/stages/bigbaby.png', w: 48, h: 45 },
};
type SheetId = keyof typeof SHEETS;
let bgImg: HTMLImageElement | null = null;

/** 성장 회상 그림 미리 받기 (게임에서 이미 받은 파일이라 보통 캐시에서 바로) */
export function preloadGrowth(): void {
  if (!bgImg) {
    bgImg = new Image();
    bgImg.src = GAME_BG.url;
  }
  for (const s of Object.values(SHEETS)) {
    if (!s.img) {
      s.img = new Image();
      s.img.src = s.src;
    }
  }
}

/** 장면 2 의 단계 (장면 시작 기준 초) */
export const GROW_STEPS = { crawl: 0, stand: 3.2, run: 6.0, big: 9.0 } as const;
/** 장면 1 의 알 (장면 시작 기준 초) */
export const EGG_STEPS = { wobble1: 1.0, wobble2: 2.2, crack1: 2.6, crack2: 3.4, hatch: 4.2 } as const;

const ok = (im?: HTMLImageElement | null): im is HTMLImageElement => !!im && im.complete && im.naturalWidth > 0;

export class EndingGrowth {
  /** 엔딩 진행 시계(초) — EndingScene 이 연결 (자막·장면과 같은 시계로 그려야 알이 깨지는 때가 어긋나지 않음) */
  static clock: (() => number) | null = null;
  private now(): number {
    return EndingGrowth.clock ? EndingGrowth.clock() : performance.now() / 1000;
  }
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private scene = -1;
  private t0 = 0;
  private lastT = 0;
  private raf = 0;
  private nest = buildNest();
  private eggs = [buildEgg(0), buildEgg(1), buildEgg(2)];
  private shells = buildShellPieces();

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'ef-grow';
    this.ctx = this.canvas.getContext('2d')!;
  }

  /** 장면 0(알·탄생) 또는 1(성장) 시작 — late = 이미 지난 초 */
  start(scene: 0 | 1, late: number): void {
    preloadGrowth();
    this.scene = scene;
    this.t0 = this.now() - late;
    this.lastT = late;
    this.canvas.classList.add('on');
    if (!this.raf) this.raf = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.scene = -1;
    this.canvas.classList.remove('on');
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** (테스트) 지금 그리는 단계 */
  get state(): string {
    const t = this.lastT;
    if (this.scene === 0) return t < EGG_STEPS.hatch ? 'egg' : 'newborn';
    if (this.scene === 1) return t < GROW_STEPS.stand ? 'crawler' : t < GROW_STEPS.run ? 'stand' : t < GROW_STEPS.big ? 'walker' : 'bigbaby';
    return 'none';
  }

  private loop = (): void => {
    this.raf = 0;
    if (this.scene < 0) return;
    const t = this.now() - this.t0;
    this.sfx(this.lastT, t);
    this.lastT = t;
    this.draw(t);
    this.raf = requestAnimationFrame(this.loop);
  };

  /** 지나간 순간의 효과음 (빨리 감기로 건너뛴 것은 안 냄) */
  private sfx(a: number, b: number): void {
    const hit = (at: number): boolean => a < at && b >= at && b - at < 0.3;
    if (this.scene === 0) {
      if (hit(EGG_STEPS.wobble1) || hit(EGG_STEPS.wobble2)) sound.eggWobble();
      if (hit(EGG_STEPS.crack1) || hit(EGG_STEPS.crack2)) sound.crack();
      if (hit(EGG_STEPS.hatch)) sound.hatch();
    }
  }

  private sprite(id: SheetId, frame: number, x: number, bottom: number, flip = false): void {
    const s = SHEETS[id];
    if (!ok(s.img)) return;
    const cols = Math.max(1, Math.floor(s.img.naturalWidth / s.w));
    const f = Math.min(frame, cols - 1);
    const dx = Math.round(x - s.w / 2);
    const dy = Math.round(bottom - s.h);
    const g = this.ctx;
    if (flip) {
      g.save();
      g.translate(dx + s.w, dy);
      g.scale(-1, 1);
      g.drawImage(s.img, f * s.w, 0, s.w, s.h, 0, 0, s.w, s.h);
      g.restore();
    } else g.drawImage(s.img, f * s.w, 0, s.w, s.h, dx, dy, s.w, s.h);
  }

  /** 반짝 (작은 픽셀 별 네 개 — 성장 단계가 바뀔 때) */
  private sparkle(x: number, y: number, age: number): void {
    if (age < 0 || age > 0.7) return;
    const g = this.ctx;
    g.globalAlpha = 1 - age / 0.7;
    g.fillStyle = '#fff6c2';
    const r = 10 + Math.round(age * 14);
    for (const [ox, oy] of [[-r, -4], [r, -8], [-r + 4, -r - 6], [r - 3, -r]] as const) {
      const px = Math.round(x + ox);
      const py = Math.round(y + oy);
      g.fillRect(px, py - 1, 1, 3);
      g.fillRect(px - 1, py, 3, 1);
    }
    g.globalAlpha = 1;
  }

  /** 게임 숲길 배경 (반 배율 · 가로로 이어 붙임) — scroll = 움직인 거리(논리 px) */
  private background(LW: number, groundY: number, scroll: number): void {
    const g = this.ctx;
    g.fillStyle = '#6a8a5a';
    g.fillRect(0, 0, LW, groundY + 200);
    if (!ok(bgImg)) return;
    const sw = bgImg.naturalWidth;
    const sh = bgImg.naturalHeight;
    const half = 0.5;
    const dw = sw * half;
    const dh = sh * half;
    const dy = Math.round(groundY - GAME_BG.groundRow * half);
    let x = -Math.round(((scroll % dw) + dw) % dw);
    for (; x < LW; x += dw) g.drawImage(bgImg, 0, 0, sw, sh, x, dy, dw, dh);
    // 회상 느낌: 따뜻한 색 덮개 (흐리게 하지 않음)
    g.fillStyle = 'rgba(255, 214, 170, 0.16)';
    g.fillRect(0, 0, LW, groundY + 200);
  }

  private draw(t: number): void {
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const W = Math.max(1, Math.round(c.clientWidth * dpr));
    const H = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const g = this.ctx;
    g.imageSmoothingEnabled = false;
    // 정수 배율: 장면 2 는 화면 높이에 약 104칸, 장면 1(알)은 2배 가까이
    const base = Math.max(1, Math.round(H / 104));
    const k = this.scene === 0 ? base * 2 : base;
    g.setTransform(k, 0, 0, k, 0, 0);
    const LW = W / k;
    const LH = H / k;
    const cx = Math.round(LW / 2);
    if (this.scene === 0) this.drawEgg(t, LW, LH, cx);
    else this.drawGrow(t, LW, LH, cx);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ── 장면 1: 둥지 속 알 → 탄생 → 두리번
  private drawEgg(t: number, LW: number, LH: number, cx: number): void {
    const g = this.ctx;
    const gy = Math.round(LH * 0.8);
    this.background(LW, gy, 0);
    const nestTop = gy - NEST_H;
    const eggBottom = nestTop + NEST_SINK + 1;
    const nx = Math.round(cx - this.nest.back.width / 2);
    g.drawImage(this.nest.back, nx, nestTop);
    const E = EGG_STEPS;
    if (t < E.hatch) {
      const wob = (t0: number, dur: number, deg: number, per: number): number => (t >= t0 && t < t0 + dur ? deg * Math.sin(((t - t0) / per) * Math.PI * 2) : 0);
      const ang = wob(E.wobble1, 0.64, 6, 0.32) + wob(E.wobble2, 0.66, 9, 0.22) + wob(E.crack2, 0.18, 5, 0.18);
      const egg = this.eggs[t < E.crack1 ? 0 : t < E.crack2 ? 1 : 2];
      g.save();
      g.translate(cx, eggBottom);
      g.rotate((ang * Math.PI) / 180);
      g.drawImage(egg, -Math.round(egg.width / 2), -egg.height);
      g.restore();
    } else {
      // 아기 고나 (꼬물꼬물 · 가끔 눈 깜빡 · 잠깐 왼쪽을 두리번)
      const a = t - E.hatch;
      const blink = [1.2, 3.1, 4.6].some((b) => a >= b && a < b + 0.16);
      const frame = blink ? 2 : Math.floor(a / 0.42) % 2;
      const look = a >= 2.0 && a < 2.8;
      this.sprite('newborn', frame, cx, eggBottom, look);
    }
    g.drawImage(this.nest.front, nx, nestTop);
    if (t >= E.hatch) {
      // 알껍데기 조각이 톡 튀어 떨어짐
      const a = t - E.hatch;
      if (a < 1.1) {
        g.globalAlpha = Math.max(0, 1 - Math.max(0, a - 0.6) / 0.5);
        const v: [number, number][] = [[-6, -34], [-22, -18], [22, -20]];
        this.shells.forEach((p, i) => {
          const x = cx + v[i][0] * a - p.width / 2 + (i === 1 ? -4 : i === 2 ? 4 : 0);
          const y = eggBottom - 14 + v[i][1] * a + 60 * a * a;
          g.drawImage(p, Math.round(x), Math.round(y));
        });
        g.globalAlpha = 1;
      }
      this.sparkle(cx, eggBottom - 10, a);
    }
  }

  // ── 장면 2: 기기 → 혼자 일어서기 → 두 발로 달리기 → 자이언트 곤룡 고나
  private drawGrow(t: number, LW: number, LH: number, cx: number): void {
    const S = GROW_STEPS;
    const gy = Math.round(LH * 0.82);
    // 배경이 흘러간 거리 = 구간별 속도의 합 (기기 14 · 서기 0 · 달리기 46 · 큰 걸음 26 칸/초)
    const seg = (a: number, b: number, v: number): number => Math.max(0, Math.min(t, b) - a) * v;
    const scroll = seg(S.crawl, S.stand, 14) + seg(S.run, S.big, 46) + seg(S.big, 99, 26);
    this.background(LW, gy, scroll);
    const x = cx - 6;
    if (t < S.stand) {
      this.sprite('crawler', Math.floor(t / 0.26) % 2, x, gy);
    } else if (t < S.run) {
      // 앉기 → 웅크려 짚기 → 일어서기 → 기쁨
      const a = t - S.stand;
      const f = a < 0.6 ? 10 : a < 1.1 ? 9 : a < 1.8 ? 0 : 7;
      this.sprite('dino', f, x, gy);
      this.sparkle(x, gy - 18, a - 1.1);
    } else if (t < S.big) {
      const a = t - S.run;
      const f = 1 + (Math.floor(a / 0.11) % 4);
      const bob = Math.floor(a / 0.14) % 2 ? -2 : 0;
      this.sprite('dino', f, x, gy + bob);
      this.sparkle(x, gy - 18, a);
    } else {
      const a = t - S.big;
      const f = [1, 0, 2, 0][Math.floor(a / 0.21) % 4];
      const bob = Math.floor(a / 0.21) % 2 ? -1 : 0;
      this.sprite('bigbaby', f, x, gy + bob);
      this.sparkle(x, gy - 26, a);
    }
  }
}
