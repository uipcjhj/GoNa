/**
 * 게임 플레이 배경: 오프닝과 같은 "귀여운 선사시대 버섯숲" 세계관.
 *
 * 패럴랙스 레이어 (모두 가로로 끊김 없이 반복되는 타일):
 *   far   먼 바위산 + 폭포 (2프레임, 물이 흐름)   ← 가장 느리게
 *   mid   둥근 선사시대 나무 · 큰 빨간 점박이 버섯 · 고인돌
 *   near  풀숲 · 작은 버섯 · 꽃 · 공룡 발자국 돌 · 작은 돌조각  ← 빠르게 (땅보다는 느리게)
 *
 * 공룡·간식·장애물이 잘 보이도록
 *  - 배경은 하늘 쪽으로 색을 섞어 채도·명도 대비를 낮추고(먼 것일수록 더 흐리게)
 *  - 외곽선도 진한 갈색 대신 부드러운 색을 씀 (장애물 바위는 진한 외곽선의 회색 → 구분)
 *  - 가까운 장식은 키를 낮게(14px 이하) 두고 모두 캐릭터 뒤에 그림
 */
import { PixelCanvas, seededRandom } from './PixelCanvas';

export const FAR_W = 256;
export const FAR_H = 84;
export const MID_W = 320;
export const MID_H = 74;
export const NEAR_W = 288;
export const NEAR_H = 16;

const HAZE = [214, 236, 226]; // 하늘 아래쪽 색 — 먼 레이어를 이 색으로 섞어 뒤로 물러나 보이게

function hex(c: number[]): string {
  return `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
}
function parse(c: string): number[] {
  return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
}
/** 색을 안개색 쪽으로 섞기 (0 = 원래 색, 1 = 안개색) */
function fade(c: string, t: number): string {
  const a = parse(c);
  return hex(a.map((v, i) => v + (HAZE[i] - v) * t));
}

// ───────────────────────── 먼 바위산 + 폭포 ─────────────────────────

function buildFar(frame: 0 | 1): HTMLCanvasElement {
  const pc = new PixelCanvas(FAR_W, FAR_H);
  const TAU = Math.PI * 2;
  const F = 0.45; // 안개 섞는 정도
  const backRock = fade('#b9aec9', F);
  const backLight = fade('#d6cee0', F);
  const rock = fade('#a99fb9', F * 0.8);
  const rockLight = fade('#c9c0d6', F * 0.8);
  const rockDark = fade('#8f86a2', F * 0.8);
  const moss = fade('#a6cf8c', F * 0.8);
  const foot = fade('#a9d391', F * 0.6);
  const footLight = fade('#c3e3a8', F * 0.6);

  // 뒤쪽 바위 산맥 (둥글둥글한 봉우리)
  for (let x = 0; x < FAR_W; x++) {
    const t = x / FAR_W;
    const h = 46 + Math.sin(t * TAU * 2 + 0.4) * 12 + Math.sin(t * TAU * 5 + 1.3) * 5;
    const y = Math.round(FAR_H - h);
    pc.rect(x, y, 1, FAR_H - y, backRock);
    pc.px(x, y, moss);
    pc.px(x, y + 1, backLight);
  }

  // 뒤 산맥의 둥근 바위 무늬 (은은하게)
  const rnd = seededRandom(17);
  for (let i = 0; i < 14; i++) {
    const bx = Math.floor(rnd() * FAR_W);
    const by = FAR_H - 20 - Math.floor(rnd() * 18);
    pc.rect(bx, by, 4, 1, backLight);
    pc.rect(bx - 1, by + 1, 6, 1, backLight);
  }

  // 앞쪽 큰 바위 절벽 (폭포가 흐르는 곳)
  const cliffX = 150;
  const cliffW = 64;
  const cliffTop = 22;
  for (let x = cliffX; x < cliffX + cliffW; x++) {
    const t = (x - cliffX) / cliffW;
    const round = Math.round(Math.pow(Math.abs(t - 0.5) * 2, 3) * 14);
    const y = cliffTop + round;
    pc.rect(x, y, 1, FAR_H - y, rock);
    pc.px(x, y, rockLight);
    pc.px(x, y + 1, moss);
    pc.px(x, y + 2, moss);
    // 아래로 갈수록 살짝 어둡게 (둥근 절벽 느낌)
    pc.rect(x, FAR_H - 24, 1, 24, rockDark);
  }
  // 절벽 바위 틈 (짧고 불규칙한 금)
  const cracks = [
    [cliffX + 6, 33, 6], [cliffX + 16, 44, 4], [cliffX + 42, 36, 7], [cliffX + 52, 47, 5], [cliffX + 10, 54, 5], [cliffX + 45, 56, 4],
  ];
  for (const [cx, cy, len] of cracks) {
    pc.rect(cx, cy, len, 1, rockDark);
    pc.px(cx + len, cy + 1, rockDark);
    pc.rect(cx, cy - 1, len - 1, 1, rockLight);
  }
  for (const mx of [cliffX + 5, cliffX + 15, cliffX + 41, cliffX + 52]) {
    const len = 3 + ((mx * 7) % 4);
    pc.rect(mx, cliffTop + 3 + ((mx * 3) % 5), 1, len, moss);
  }

  // 폭포
  const wx = cliffX + 28;
  const ww = 7;
  const water = fade('#9fd8ec', 0.25);
  const waterLight = fade('#e6f7fc', 0.15);
  for (let y = cliffTop + 1; y < FAR_H - 10; y++) {
    pc.rect(wx, y, ww, 1, water);
    // 흐르는 물줄기: 프레임마다 3칸씩 아래로 밀림
    for (let i = 0; i < ww; i++) {
      if ((y + i * 2 + frame * 3) % 6 === 0) pc.px(wx + i, y, waterLight);
    }
  }
  // 물보라 + 웅덩이
  const mist = fade('#f4fbff', 0.1);
  for (let i = 0; i < 9; i++) pc.disc(wx + 3 + ((i * 5 + frame * 2) % 15) - 7, FAR_H - 11 + (i % 3), 2, mist);
  pc.rect(wx - 8, FAR_H - 9, ww + 16, 2, water);

  // 산기슭 초록 언덕 (맨 아래 띠)
  for (let x = 0; x < FAR_W; x++) {
    const t = x / FAR_W;
    const h = 10 + Math.sin(t * TAU * 3 + 2) * 3 + Math.sin(t * TAU * 7) * 1.5;
    const y = Math.round(FAR_H - h);
    pc.rect(x, y, 1, FAR_H - y, foot);
    pc.px(x, y, footLight);
  }
  return pc.canvas;
}

// ───────────────────────── 중간: 나무 · 큰 버섯 · 고인돌 ─────────────────────────

const MID_FADE = 0.28;
const MID_OUTLINE = fade('#6e5a4c', 0.2);

/** 둥글둥글한 선사시대 나무 (비늘 무늬 줄기 + 동글동글한 잎 뭉치) */
function prehistoricTree(pc: PixelCanvas, cx: number, baseY: number, h: number, r: number, seed: number): void {
  const sub = new PixelCanvas(r * 2 + 8, h + 4);
  const sx = Math.floor(sub.width / 2);
  const rnd = seededRandom(seed);
  const trunk = fade('#b07a4f', MID_FADE);
  const trunkDark = fade('#8a5a38', MID_FADE);
  const leafDark = fade('#5f9e4a', MID_FADE);
  const leaf = fade('#7fbf5a', MID_FADE);
  const leafLight = fade('#a9dc7e', MID_FADE);
  const top = sub.height - h;
  // 줄기 (살짝 휘어짐 + 비늘)
  for (let y = top + r; y < sub.height - 1; y++) {
    const bend = Math.round(Math.sin((y - top) / h * Math.PI) * 1.5);
    sub.rect(sx - 2 + bend, y, 4, 1, trunk);
    if (y % 3 === 0) sub.px(sx - 1 + bend + (y % 2), y, trunkDark);
  }
  // 잎 뭉치 (동그라미 여러 개)
  const cy = top + r;
  const blobs = [
    [0, 0, r],
    [-r * 0.6, r * 0.25, r * 0.7],
    [r * 0.6, r * 0.25, r * 0.7],
    [0, -r * 0.45, r * 0.65],
  ];
  for (const [dx, dy, rr] of blobs) sub.disc(Math.round(sx + dx), Math.round(cy + dy + 1), Math.round(rr), leafDark);
  for (const [dx, dy, rr] of blobs) sub.disc(Math.round(sx + dx - 1), Math.round(cy + dy), Math.round(rr) - 1, leaf);
  for (const [dx, dy, rr] of blobs.slice(0, 3)) sub.disc(Math.round(sx + dx - rr * 0.35), Math.round(cy + dy - rr * 0.35), Math.max(1, Math.round(rr * 0.3)), leafLight);
  for (let i = 0; i < 5; i++) sub.px(Math.round(sx + (rnd() - 0.5) * r * 1.4), Math.round(cy + (rnd() - 0.5) * r), leafLight);
  sub.outline(MID_OUTLINE);
  drawWrap(pc, sub.canvas, cx - Math.floor(sub.width / 2), baseY - sub.height + 1);
}

/** 큰 빨간 점박이 버섯 */
function bigMushroom(pc: PixelCanvas, cx: number, baseY: number, capW: number, capH: number, stemH: number, seed: number): void {
  const W = capW + 4;
  const H = capH + stemH + 3;
  const sub = new PixelCanvas(W, H);
  const mx = W / 2;
  const cap = fade('#e8615a', MID_FADE);
  const capDark = fade('#c94f49', MID_FADE);
  const capLight = fade('#f69283', MID_FADE);
  const dot = fade('#fff6e6', MID_FADE * 0.4);
  const stem = fade('#f4e8cc', MID_FADE * 0.6);
  const stemShade = fade('#dccaa2', MID_FADE * 0.6);
  const capBottom = 1 + capH;
  for (let y = capBottom - 1; y < H - 1; y++) {
    const t = (y - capBottom) / Math.max(1, stemH);
    const half = Math.round(capW * 0.13 + Math.max(0, t - 0.6) * 3);
    sub.rect(mx - half, y, half * 2, 1, stem);
    sub.rect(mx + half - Math.max(1, Math.round(half / 2.5)), y, Math.max(1, Math.round(half / 2.5)), 1, stemShade);
  }
  for (let r = 0; r < capH; r++) {
    const dy = (capH - r) / capH;
    const half = (capW / 2) * Math.sqrt(Math.max(0, 1 - dy * dy * 0.92));
    sub.rect(Math.round(mx - half), 1 + r, Math.round(half * 2), 1, cap);
    sub.rect(Math.round(mx + half * 0.55), 1 + r, Math.round(half * 0.45), 1, capDark);
  }
  sub.rect(Math.round(mx - capW / 2), capBottom - 1, capW, 1, capDark);
  sub.rect(Math.round(mx - capW * 0.3), 3, Math.max(2, Math.round(capW / 7)), 1, capLight);
  const rnd = seededRandom(seed);
  for (let i = 0; i < Math.round(capW / 6); i++) {
    const x = Math.round(mx + (rnd() - 0.5) * capW * 0.7);
    const y = Math.round(3 + rnd() * capH * 0.55);
    sub.rect(x, y, 2, 2, dot);
  }
  sub.outline(MID_OUTLINE);
  drawWrap(pc, sub.canvas, Math.round(cx - W / 2), baseY - H + 1);
}

/** 작은 고인돌 */
function dolmen(pc: PixelCanvas, x: number, baseY: number): void {
  const sub = new PixelCanvas(30, 22);
  // 장애물(회색 바위)과 헷갈리지 않게 따뜻한 베이지 사암색
  const stone = fade('#d9c19c', MID_FADE);
  const light = fade('#efdcbc', MID_FADE);
  const dark = fade('#bea27a', MID_FADE);
  const moss = fade('#93c46c', MID_FADE);
  sub.rect(3, 6, 6, 16, stone);
  sub.rect(3, 6, 1, 16, light);
  sub.rect(21, 6, 6, 16, stone);
  sub.rect(21, 6, 1, 16, light);
  sub.rect(1, 1, 28, 5, stone);
  sub.rect(1, 1, 28, 1, light);
  sub.rect(1, 5, 28, 1, dark);
  for (let i = 0; i < 9; i++) sub.px(2 + i * 3, 0 + (i % 2), moss);
  sub.outline(MID_OUTLINE);
  drawWrap(pc, sub.canvas, x, baseY - 21);
}

/** 타일 경계를 넘어가면 반대쪽에도 그려서 끊김 없이 반복되게 */
function drawWrap(pc: PixelCanvas, img: HTMLCanvasElement, x: number, y: number): void {
  pc.ctx.drawImage(img, x, y);
  if (x < 0) pc.ctx.drawImage(img, x + pc.width, y);
  if (x + img.width > pc.width) pc.ctx.drawImage(img, x - pc.width, y);
}

function buildMid(): HTMLCanvasElement {
  const pc = new PixelCanvas(MID_W, MID_H);
  const base = MID_H - 1;
  // 낮은 덤불 띠 (나무 밑동을 자연스럽게)
  const bush = fade('#79b55a', MID_FADE + 0.05);
  const bushLight = fade('#9dd178', MID_FADE + 0.05);
  for (let x = 0; x < MID_W; x++) {
    const h = 6 + Math.round(Math.sin((x / MID_W) * Math.PI * 2 * 8) * 1.5 + Math.sin((x / MID_W) * Math.PI * 2 * 3) * 1.5);
    pc.rect(x, MID_H - h, 1, h, bush);
    pc.px(x, MID_H - h, bushLight);
  }
  prehistoricTree(pc, 18, base, 58, 15, 1);
  bigMushroom(pc, 70, base, 34, 15, 30, 2);
  prehistoricTree(pc, 122, base, 46, 12, 3);
  dolmen(pc, 150, base);
  bigMushroom(pc, 205, base, 24, 11, 20, 4);
  prehistoricTree(pc, 248, base, 64, 16, 5);
  bigMushroom(pc, 296, base, 28, 12, 38, 6);
  return pc.canvas;
}

// ───────────────────────── 가까운 장식: 풀숲 · 작은 버섯 · 꽃 · 발자국 돌 ─────────────────────────

const NEAR_OUTLINE = '#9b7b5e'; // 장애물(진한 외곽선)과 구분되는 부드러운 외곽선

function tinyMushroom(pc: PixelCanvas, x: number, red: boolean): void {
  const cap = red ? '#ee7a6e' : '#e2b27a';
  const dot = '#fff4e2';
  const y = NEAR_H - 1;
  pc.rect(x + 1, y - 3, 2, 3, '#f6ead0');
  pc.rect(x, y - 5, 4, 2, cap);
  pc.rect(x + 1, y - 6, 2, 1, cap);
  if (red) pc.px(x + 1, y - 5, dot);
}

function flowerClump(pc: PixelCanvas, x: number, color: string): void {
  const y = NEAR_H - 1;
  pc.rect(x, y - 2, 7, 2, '#7cc25a');
  pc.px(x + 1, y - 3, '#7cc25a');
  pc.px(x + 5, y - 3, '#7cc25a');
  for (const [fx, fy] of [[1, -5], [4, -6], [6, -4]]) {
    pc.px(x + fx, y + fy, color);
    pc.px(x + fx - 1, y + fy + 1, color);
    pc.px(x + fx + 1, y + fy + 1, color);
    pc.px(x + fx, y + fy + 1, '#f6c453');
    pc.px(x + fx, y + fy + 2, '#5fa63b');
  }
}

/** 공룡 발자국이 새겨진 납작한 사암 (장애물 바위와 다른 따뜻한 베이지색·낮은 높이) */
function footprintStone(pc: PixelCanvas, x: number): void {
  const sub = new PixelCanvas(18, 8);
  const sand = '#e6cfa6';
  const sandLight = '#f4e4c3';
  const sandDark = '#cdb084';
  for (let yy = 0; yy < 7; yy++) {
    const inset = yy === 0 ? 3 : yy === 1 ? 1 : 0;
    sub.rect(inset, yy + 1, 18 - inset * 2, 1, sand);
  }
  sub.rect(3, 1, 12, 1, sandLight);
  // 세 발가락 공룡 발자국
  const f = '#b8956a';
  sub.rect(7, 4, 3, 2, f);
  sub.px(6, 3, f);
  sub.px(8, 2, f);
  sub.px(10, 3, f);
  sub.rect(0, 7, 18, 1, sandDark);
  sub.outline(NEAR_OUTLINE);
  pc.ctx.drawImage(sub.canvas, x, NEAR_H - 9);
}

function pebbles(pc: PixelCanvas, x: number): void {
  const y = NEAR_H - 1;
  pc.rect(x, y - 2, 3, 2, '#d9c6a4');
  pc.px(x + 1, y - 3, '#ecdcbc');
  pc.rect(x + 4, y - 1, 2, 1, '#cbb592');
  pc.px(x + 4, y - 2, '#e2d0ae');
}

function grassTuft(pc: PixelCanvas, x: number, tall: number): void {
  const y = NEAR_H - 1;
  const g = '#6fb84e';
  const gl = '#9bd673';
  pc.rect(x, y - 1, 6, 1, g);
  pc.rect(x + 1, y - tall, 1, tall, g);
  pc.rect(x + 3, y - tall - 1, 1, tall + 1, gl);
  pc.rect(x + 5, y - tall + 1, 1, tall - 1, g);
}

function buildNear(): HTMLCanvasElement {
  const pc = new PixelCanvas(NEAR_W, NEAR_H);
  const items: [number, (x: number) => void][] = [
    [6, (x) => grassTuft(pc, x, 4)],
    [22, (x) => tinyMushroom(pc, x, true)],
    [28, (x) => tinyMushroom(pc, x, false)],
    [48, (x) => flowerClump(pc, x, '#ffffff')],
    [78, (x) => footprintStone(pc, x)],
    [112, (x) => grassTuft(pc, x, 5)],
    [130, (x) => pebbles(pc, x)],
    [150, (x) => flowerClump(pc, x, '#ffd6e8')],
    [176, (x) => tinyMushroom(pc, x, true)],
    [204, (x) => grassTuft(pc, x, 3)],
    [222, (x) => flowerClump(pc, x, '#fff3a6')],
    [248, (x) => pebbles(pc, x)],
    [264, (x) => tinyMushroom(pc, x, false)],
    [270, (x) => tinyMushroom(pc, x, true)],
  ];
  for (const [x, draw] of items) draw(x);
  return pc.canvas;
}

export function buildGameBackground(): { far: [HTMLCanvasElement, HTMLCanvasElement]; mid: HTMLCanvasElement; near: HTMLCanvasElement } {
  return { far: [buildFar(0), buildFar(1)], mid: buildMid(), near: buildNear() };
}
