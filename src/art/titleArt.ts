/**
 * 타이틀 화면 기본 배경: 버섯숲 + 귀여운 석기시대 (코드로 그린 도트).
 * public/assets/title/title-bg.png 가 없을 때 사용됩니다.
 *
 * 정적인 바탕(base) 한 장 + 흔들리는 요소(버섯, 잎, 덩굴, 모닥불)를 각각 별도 캔버스로 만들어
 * DOM 레이어에서 따로 애니메이션합니다.
 */
import { PixelCanvas, seededRandom } from './PixelCanvas';

export const TITLE_STAGE_W = 320;
export const TITLE_STAGE_H = 180;
const GROUND_Y = 146;

export type SwayKind = 'sway' | 'sway-slow' | 'hang' | 'flame';

export interface TitleSprite {
  canvas: HTMLCanvasElement;
  /** 무대 좌표 (왼쪽 위) */
  x: number;
  y: number;
  kind: SwayKind;
  /** 애니메이션 시작 지연(초) — 서로 엇갈리게 흔들리도록 */
  delay: number;
  /** 'front' 는 캐릭터보다 앞에 그려짐 */
  layer: 'back' | 'front';
  /** flame 처럼 프레임이 가로로 붙은 경우 프레임 수 */
  frames?: number;
}

export interface TitleArt {
  base: HTMLCanvasElement;
  sprites: TitleSprite[];
}

const OUTLINE = '#3d2b22';

// ───────────────────────── 버섯 ─────────────────────────

interface MushroomStyle {
  cap: string;
  capLight: string;
  capDark: string;
  dots: string | null;
  stem?: string;
  stemShade?: string;
}

const RED: MushroomStyle = { cap: '#e2574c', capLight: '#f2836f', capDark: '#b23a3a', dots: '#fff4e0' };
const TAN: MushroomStyle = { cap: '#d9a066', capLight: '#ecc28a', capDark: '#a9713f', dots: '#f6e3c0' };
const PINK: MushroomStyle = { cap: '#e98aa0', capLight: '#f6b5c2', capDark: '#bb5d78', dots: '#fff0f3' };
const PURPLE: MushroomStyle = { cap: '#9b7fd1', capLight: '#bba6e6', capDark: '#6e58a6', dots: '#efe6ff' };

function mushroom(capW: number, capH: number, stemW: number, stemH: number, style: MushroomStyle, seed: number): HTMLCanvasElement {
  const W = capW + 4;
  const H = capH + stemH + 3;
  const pc = new PixelCanvas(W, H);
  const cx = W / 2;
  const stem = style.stem ?? '#f3e6c8';
  const stemShade = style.stemShade ?? '#d8c39a';
  const capBottom = 1 + capH;

  // 기둥 (아래로 갈수록 살짝 넓어짐)
  for (let y = capBottom - 1; y < H - 1; y++) {
    const t = (y - capBottom) / Math.max(1, stemH);
    const half = Math.round(stemW / 2 + Math.max(0, t - 0.6) * 3);
    pc.rect(cx - half, y, half * 2, 1, stem);
    pc.rect(cx + half - Math.max(1, Math.round(half / 2.5)), y, Math.max(1, Math.round(half / 2.5)), 1, stemShade);
  }
  // 갓 아랫면(주름)
  pc.rect(cx - capW * 0.38, capBottom - 1, capW * 0.76, 2, '#ead2a8');

  // 갓 (반타원)
  for (let r = 0; r < capH; r++) {
    const dy = (capH - r) / capH;
    const half = (capW / 2) * Math.sqrt(Math.max(0, 1 - dy * dy * 0.92));
    const y = 1 + r;
    pc.rect(Math.round(cx - half), y, Math.round(half * 2), 1, style.cap);
    // 오른쪽 그늘
    pc.rect(Math.round(cx + half * 0.55), y, Math.round(half * 0.45), 1, style.capDark);
  }
  pc.rect(Math.round(cx - capW / 2), capBottom - 1, capW, 1, style.capDark);
  // 하이라이트
  const hl = Math.max(2, Math.round(capW / 7));
  pc.rect(Math.round(cx - capW * 0.28), 2 + Math.round(capH * 0.15), hl, 1, style.capLight);
  pc.rect(Math.round(cx - capW * 0.32), 3 + Math.round(capH * 0.15), 1, Math.max(1, Math.round(capH * 0.3)), style.capLight);

  // 물방울 점
  if (style.dots) {
    const rnd = seededRandom(seed);
    const n = Math.max(2, Math.round(capW / 7));
    for (let i = 0; i < n; i++) {
      const dx = (rnd() - 0.5) * capW * 0.7;
      const dyy = 2 + rnd() * capH * 0.6;
      const r = capW > 22 ? 1 + Math.round(rnd()) : 1;
      pc.disc(Math.round(cx + dx), Math.round(dyy + 1), r - 1 < 0 ? 0 : r - 1, style.dots);
      if (r === 1) pc.px(cx + dx + 1, dyy + 1, style.dots);
    }
  }
  // 작은 얼굴 (귀여움!)
  if (stemW >= 8 && stemH >= 8) {
    const fy = capBottom + 2 + Math.round(stemH * 0.2);
    pc.px(cx - 3, fy, '#3d2b22');
    pc.px(cx + 1, fy, '#3d2b22');
    pc.px(cx - 4, fy + 1, '#f2a3a0');
    pc.px(cx + 2, fy + 1, '#f2a3a0');
  }
  pc.outline(OUTLINE);
  return pc.canvas;
}

/** 버섯 여러 개 모인 무더기 */
function mushroomCluster(seed: number, style: MushroomStyle, style2: MushroomStyle): HTMLCanvasElement {
  const a = mushroom(14, 7, 4, 9, style, seed);
  const b = mushroom(9, 5, 3, 5, style2, seed + 1);
  const c = mushroom(7, 4, 2, 4, style, seed + 2);
  const pc = new PixelCanvas(28, 20);
  pc.ctx.drawImage(c, 0, 20 - c.height);
  pc.ctx.drawImage(a, 6, 20 - a.height);
  pc.ctx.drawImage(b, 18, 20 - b.height);
  return pc.canvas;
}

// ───────────────────────── 잎 / 덩굴 ─────────────────────────

function leafBlade(pc: PixelCanvas, bx: number, by: number, angle: number, len: number, width: number, color: string, vein: string): void {
  const steps = len * 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const bend = t * t * 0.35;
    const a = angle + bend * Math.sign(Math.cos(angle));
    const x = bx + Math.cos(a) * len * t;
    const y = by - Math.sin(a) * len * t;
    const w = Math.max(0, Math.round(width * Math.sin(Math.PI * Math.min(1, t * 1.15))));
    pc.disc(Math.round(x), Math.round(y), w, color);
  }
  for (let i = 2; i < steps * 0.8; i++) {
    const t = i / steps;
    const a = angle + t * t * 0.35 * Math.sign(Math.cos(angle));
    pc.px(Math.round(bx + Math.cos(a) * len * t), Math.round(by - Math.sin(a) * len * t), vein);
  }
}

function fernCluster(seed: number, w: number, h: number, flip = false): HTMLCanvasElement {
  const pc = new PixelCanvas(w, h);
  const rnd = seededRandom(seed);
  const greens = ['#4f8f3c', '#6fb04a', '#8fcf5a'];
  const blades = 6;
  for (let i = 0; i < blades; i++) {
    const base = flip ? Math.PI - (0.35 + (i / blades) * 1.9) : 0.35 + (i / blades) * 1.9;
    const len = h * (0.55 + rnd() * 0.35);
    const c = greens[i % greens.length];
    leafBlade(pc, w / 2 + (rnd() - 0.5) * 6, h - 2, base, len, 2 + Math.round(rnd() * 1.5), c, '#3f7a30');
  }
  pc.outline(OUTLINE);
  return pc.canvas;
}

function hangingVine(seed: number, len: number): HTMLCanvasElement {
  const pc = new PixelCanvas(14, len);
  const rnd = seededRandom(seed);
  for (let y = 0; y < len - 2; y++) {
    const x = 7 + Math.round(Math.sin(y * 0.25) * 1.5);
    pc.px(x, y, '#5f9e3c');
    if (y > 2 && y % 5 === 0) {
      const side = (y / 5) % 2 === 0 ? -1 : 1;
      const c = rnd() < 0.5 ? '#8fcf5a' : '#6fb04a';
      pc.rect(x + (side > 0 ? 1 : -3), y, 3, 2, c);
      pc.px(x + (side > 0 ? 4 : -4), y + 1, c);
    }
  }
  pc.disc(7, len - 3, 1, '#f2836f'); // 끝에 작은 열매
  pc.outline(OUTLINE);
  return pc.canvas;
}

// ───────────────────────── 모닥불 (2프레임) ─────────────────────────

const FLAME_A = [
  '....y.....',
  '...yy.....',
  '...yoy..y.',
  '..yooy.yy.',
  '..yoroyoy.',
  '.yorrooy..',
  '.yorwrroy.',
  'yorrwwroy.',
  'yorwwwrroy',
  '.yorwwroy.',
];
const FLAME_B = [
  '.....y....',
  '.....yy...',
  '.y..yoy...',
  '.yy.yooy..',
  '.yoyoroy..',
  '..yoorroy.',
  '.yorrwroy.',
  '.yorwwrroy',
  'yorrwwwroy',
  '.yorwwroy.',
];
const FLAME_PAL = { y: '#ffd96b', o: '#ff9f43', r: '#ef5a3c', w: '#fff3c4' };

function flameSheet(): HTMLCanvasElement {
  const pc = new PixelCanvas(20, 10);
  pc.map(FLAME_A, FLAME_PAL, 0, 0);
  pc.map(FLAME_B, FLAME_PAL, 10, 0);
  return pc.canvas;
}

// ───────────────────────── 정적 바탕 ─────────────────────────

function drawSky(pc: PixelCanvas): void {
  const bands = ['#8fd0cf', '#a3d9cc', '#bce2c6', '#d6e8bf', '#ecebb9', '#f9e4b0', '#fcd9a4'];
  const bandH = Math.ceil(GROUND_Y / bands.length);
  bands.forEach((c, i) => pc.rect(0, i * bandH, TITLE_STAGE_W, bandH + 1, c));
  for (let i = 1; i < bands.length; i++) {
    const y = i * bandH;
    for (let x = 0; x < TITLE_STAGE_W; x += 2) {
      pc.px(x + (i % 2), y, bands[i - 1]);
      pc.px(x + ((i + 1) % 2), y - 1, bands[i]);
    }
  }
  // 햇살
  pc.disc(262, 34, 16, '#fbe9b7');
  pc.disc(262, 34, 11, '#ffe794');
  pc.disc(262, 34, 8, '#fff5c8');
}

function drawClouds(pc: PixelCanvas): void {
  const cloud = (x: number, y: number, s: number): void => {
    pc.disc(x, y + 1, 4 * s, '#e6eef0');
    pc.disc(x + 6 * s, y - 2, 5 * s, '#e6eef0');
    pc.disc(x + 13 * s, y + 1, 4 * s, '#e6eef0');
    pc.disc(x, y, 4 * s, '#fffaf0');
    pc.disc(x + 6 * s, y - 3, 5 * s, '#fffaf0');
    pc.disc(x + 13 * s, y, 4 * s, '#fffaf0');
  };
  cloud(40, 26, 1);
  cloud(150, 18, 1);
  cloud(212, 44, 1);
}

function drawHills(pc: PixelCanvas): void {
  const TAU = Math.PI * 2;
  for (let x = 0; x < TITLE_STAGE_W; x++) {
    const t = x / TITLE_STAGE_W;
    const h1 = 50 + Math.sin(t * TAU + 0.6) * 10 + Math.sin(t * TAU * 3) * 4;
    const y1 = Math.round(GROUND_Y - h1);
    pc.rect(x, y1, 1, GROUND_Y - y1, '#a9cfa6');
    pc.px(x, y1, '#c4e2b6');
    const h2 = 30 + Math.sin(t * TAU * 2 + 2) * 8 + Math.sin(t * TAU * 5) * 2;
    const y2 = Math.round(GROUND_Y - h2);
    pc.rect(x, y2, 1, GROUND_Y - y2, '#8fbf86');
    pc.px(x, y2, '#acd69a');
  }
}

/** 멀리 보이는 거대한 버섯 실루엣 (흐린 색으로 원근감) */
function drawFarMushrooms(pc: PixelCanvas): void {
  const far = [
    { x: 20, h: 58, w: 30, cap: '#d8a7a2' },
    { x: 78, h: 42, w: 22, cap: '#cfb0d6' },
    { x: 128, h: 66, w: 34, cap: '#d8a7a2' },
    { x: 196, h: 48, w: 26, cap: '#e2bc98' },
    { x: 300, h: 60, w: 30, cap: '#cfb0d6' },
  ];
  for (const m of far) {
    const top = GROUND_Y - m.h;
    const capH = Math.round(m.w * 0.42);
    pc.rect(m.x - 3, top + capH - 1, 6, m.h - capH, '#e4dcc4');
    pc.rect(m.x + 1, top + capH - 1, 2, m.h - capH, '#d2c8ac');
    for (let r = 0; r < capH; r++) {
      const dy = (capH - r) / capH;
      const half = (m.w / 2) * Math.sqrt(Math.max(0, 1 - dy * dy * 0.92));
      pc.rect(Math.round(m.x - half), top + r, Math.round(half * 2), 1, m.cap);
    }
    pc.px(m.x - 4, top + 3, '#f3e3dc');
    pc.px(m.x + 5, top + 5, '#f3e3dc');
  }
}

/** 고인돌 (석기시대 돌 아치) */
function drawDolmen(pc: PixelCanvas, x: number): void {
  const stone = '#a39d93';
  const light = '#cbc4b6';
  const dark = '#7a736a';
  const moss = '#7fb552';
  const sub = new PixelCanvas(48, 34);
  // 기둥
  sub.rect(4, 8, 9, 26, stone);
  sub.rect(4, 8, 2, 26, light);
  sub.rect(11, 8, 2, 26, dark);
  sub.rect(34, 8, 9, 26, stone);
  sub.rect(34, 8, 2, 26, light);
  sub.rect(41, 8, 2, 26, dark);
  // 덮개돌
  sub.rect(1, 2, 46, 7, stone);
  sub.rect(1, 2, 46, 2, light);
  sub.rect(1, 8, 46, 1, dark);
  sub.rect(6, 1, 30, 1, stone);
  // 이끼
  for (let i = 0; i < 14; i++) sub.px(3 + i * 3, 1 + (i % 2), moss);
  sub.rect(4, 30, 9, 4, moss);
  sub.rect(34, 31, 9, 3, moss);
  // 벽화 (작은 공룡 그림)
  sub.px(7, 18, '#5a3a22');
  sub.rect(7, 19, 3, 1, '#5a3a22');
  sub.px(6, 20, '#5a3a22');
  sub.px(9, 20, '#5a3a22');
  sub.outline(OUTLINE);
  pc.ctx.drawImage(sub.canvas, x, GROUND_Y - 32);
}

/** 돌집 + 풀 지붕 */
function drawHut(pc: PixelCanvas, x: number): void {
  const sub = new PixelCanvas(46, 36);
  const stones = ['#b2aa9c', '#a39d93', '#c6bdad', '#958e83'];
  const rnd = seededRandom(9);
  // 돌 돔
  for (let y = 12; y < 36; y++) {
    for (let xx = 2; xx < 44; xx++) {
      const dx = (xx - 23) / 21;
      const dy = (36 - y) / 24;
      if (dx * dx + dy * dy <= 1) sub.px(xx, y, stones[(Math.floor(xx / 4) + Math.floor(y / 3)) % stones.length]);
    }
  }
  for (let i = 0; i < 40; i++) sub.px(4 + rnd() * 38, 14 + rnd() * 21, '#857e74');
  // 지붕 (짚)
  for (let y = 0; y < 16; y++) {
    const half = Math.min(23, 4 + y * 1.6);
    sub.rect(23 - half, y, half * 2, 1, y % 3 === 0 ? '#c99a4f' : '#e2b866');
  }
  for (let xx = 2; xx < 44; xx += 3) sub.rect(xx, 15, 1, 2 + (xx % 2), '#c99a4f');
  // 문
  for (let y = 22; y < 36; y++) {
    for (let xx = 17; xx < 29; xx++) {
      const dx = (xx - 22.5) / 6;
      const dy = (y - 28) / 8;
      if (y >= 28 || dx * dx + dy * dy <= 1) sub.px(xx, y, '#4a3426');
    }
  }
  sub.px(31, 21, '#ffd96b'); // 창문 불빛
  sub.px(32, 21, '#ffd96b');
  sub.outline(OUTLINE);
  pc.ctx.drawImage(sub.canvas, x, GROUND_Y - 34);
}

function drawGround(pc: PixelCanvas): void {
  const rnd = seededRandom(3);
  pc.rect(0, GROUND_Y, TITLE_STAGE_W, TITLE_STAGE_H - GROUND_Y, '#c48a55');
  for (let y = GROUND_Y + 10; y < TITLE_STAGE_H; y += 6) {
    for (let x = 0; x < TITLE_STAGE_W; x++) if (rnd() < 0.45) pc.px(x, y + (x % 3 === 0 ? 1 : 0), '#a06c3e');
  }
  // 풀
  pc.rect(0, GROUND_Y, TITLE_STAGE_W, 6, '#8fcf5a');
  pc.rect(0, GROUND_Y, TITLE_STAGE_W, 1, '#c2ea88');
  for (let x = 0; x < TITLE_STAGE_W; x++) {
    const d = (x * 7) % 5 === 0 ? 3 : (x * 3) % 4 === 0 ? 2 : 1;
    pc.rect(x, GROUND_Y + 6, 1, d, '#5f9e3c');
    if (rnd() < 0.3) pc.px(x, GROUND_Y - 1, '#8fcf5a');
  }
  // 흙길 (가운데 → 아래로 넓어짐)
  for (let y = GROUND_Y + 4; y < TITLE_STAGE_H; y++) {
    const t = (y - GROUND_Y) / (TITLE_STAGE_H - GROUND_Y);
    const half = 18 + t * 40;
    const cx = 160 + Math.sin(t * 3) * 6;
    pc.rect(cx - half, y, half * 2, 1, '#dcb27a');
    if (rnd() < 0.5) pc.px(cx - half + rnd() * half * 2, y, '#c99c63');
  }
  // 조약돌
  for (let i = 0; i < 18; i++) {
    const x = Math.round(rnd() * TITLE_STAGE_W);
    const y = GROUND_Y + 8 + Math.round(rnd() * 24);
    pc.rect(x, y, 2, 1, '#e8d2a6');
    pc.px(x, y + 1, '#9e7448');
  }
  // 작은 꽃
  const flowers = ['#ffffff', '#ffd6e8', '#ffe27a'];
  for (let i = 0; i < 12; i++) {
    const x = 6 + Math.round(rnd() * 308);
    const c = flowers[i % 3];
    pc.px(x, GROUND_Y + 1, c);
    pc.px(x - 1, GROUND_Y + 2, c);
    pc.px(x + 1, GROUND_Y + 2, c);
    pc.px(x, GROUND_Y + 2, '#f2a33a');
  }
}

function drawCampfireBase(pc: PixelCanvas, cx: number): void {
  const y = GROUND_Y + 6;
  // 장작
  pc.rect(cx - 7, y - 2, 14, 2, '#7a4a2a');
  pc.rect(cx - 5, y - 4, 10, 2, '#8f5a33');
  // 돌 고리
  for (let i = 0; i < 6; i++) {
    const x = cx - 10 + i * 4;
    pc.rect(x, y - 1, 3, 2, i % 2 ? '#a39d93' : '#8d867c');
    pc.px(x, y - 2, '#cbc4b6');
  }
  // 뼈다귀 장식
  const bx = cx + 16;
  pc.rect(bx, y + 3, 7, 1, '#fff4e0');
  pc.px(bx - 1, y + 2, '#fff4e0');
  pc.px(bx - 1, y + 4, '#fff4e0');
  pc.px(bx + 7, y + 2, '#fff4e0');
  pc.px(bx + 7, y + 4, '#fff4e0');
  pc.rect(bx, y + 4, 7, 1, '#d9c7a0');
}

// ───────────────────────── 조립 ─────────────────────────

export function buildTitleArt(): TitleArt {
  const pc = new PixelCanvas(TITLE_STAGE_W, TITLE_STAGE_H);
  drawSky(pc);
  drawClouds(pc);
  drawHills(pc);
  drawFarMushrooms(pc);
  drawDolmen(pc, 92);
  drawHut(pc, 236);
  drawGround(pc);
  drawCampfireBase(pc, 214);

  const sprites: TitleSprite[] = [];
  const onGround = (c: HTMLCanvasElement, x: number, kind: SwayKind, delay: number, layer: 'back' | 'front', dy = 0): void => {
    sprites.push({ canvas: c, x, y: GROUND_Y + 3 + dy - c.height, kind, delay, layer });
  };

  // 뒤쪽 큰 버섯들
  onGround(mushroom(44, 20, 10, 46, RED, 1), 6, 'sway-slow', 0, 'back');
  onGround(mushroom(30, 14, 7, 30, TAN, 2), 50, 'sway-slow', 0.8, 'back');
  onGround(mushroom(38, 17, 9, 40, PURPLE, 3), 274, 'sway-slow', 0.4, 'back');
  onGround(mushroom(20, 10, 5, 16, PINK, 4), 148 - 40, 'sway', 1.1, 'back');
  // 앞쪽 버섯 무더기
  onGround(mushroomCluster(10, RED, TAN), 58, 'sway', 0.3, 'front', 6);
  onGround(mushroomCluster(20, PINK, PURPLE), 246, 'sway', 0.9, 'front', 8);
  onGround(mushroom(12, 6, 3, 6, TAN, 30), 196, 'sway', 0.5, 'front', 12);
  // 앞쪽 잎사귀
  onGround(fernCluster(5, 46, 34), -10, 'sway', 0.2, 'front', 34);
  onGround(fernCluster(6, 46, 34, true), 286, 'sway', 0.7, 'front', 34);
  onGround(fernCluster(7, 30, 22), 120, 'sway', 1.3, 'front', 30);
  // 위에서 늘어진 덩굴
  sprites.push({ canvas: hangingVine(11, 34), x: 8, y: -2, kind: 'hang', delay: 0, layer: 'front' });
  sprites.push({ canvas: hangingVine(12, 24), x: 22, y: -2, kind: 'hang', delay: 0.6, layer: 'front' });
  sprites.push({ canvas: hangingVine(13, 28), x: 298, y: -2, kind: 'hang', delay: 0.3, layer: 'front' });
  // 모닥불 불꽃
  sprites.push({ canvas: flameSheet(), x: 209, y: GROUND_Y - 7, kind: 'flame', delay: 0, layer: 'back', frames: 2 });

  return { base: pc.canvas, sprites };
}

/** 기본 배경에서 캐릭터가 서 있을 위치 (무대 대비 비율) */
export const DEFAULT_TITLE_GROUND = GROUND_Y / TITLE_STAGE_H;
