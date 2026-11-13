/**
 * 마지막 모험 · 암흑의 이유식 성 도트 그림 (코드로 그림 — 버섯숲과 같은 픽셀 세계관, 무섭지 않고 귀여운 판타지)
 *   castleInterior: 성 안 배경 (숲 배경 그림과 같은 772x460 · 땅 줄 400 → GameScene 이 숲 배경과 바꿔 끼움, 가로로 이어짐)
 *     어두운 보라 돌벽 · 보랏빛 달빛 창문 · 벽에 걸린 숟가락·국자·거품기 · 초록 이유식이 끓는 커다란 솥 · 보라 횃불 · 이유식 얼룩
 *   castleGround: 성 바닥 타일 (보라 돌판 + 초록 얼룩)
 *   castleSilhouette · castleMoon · castleBolt: 다가가며 보이는 성 그림자 · 보라 달 · 작은 번개
 *   clueSpoon · clueBush · cluePrint: 수상한 흔적 (커다란 숟가락 · 덤불 · 이유식 묻은 작은 발자국)
 */
import { PixelCanvas, seededRandom } from './PixelCanvas';
import { GROUND_TILE_H } from './textures';

export const CASTLE_BG = { w: 772, h: 460, groundRow: 400 };

function ellipse(pc: PixelCanvas, cx: number, cy: number, rx: number, ry: number, color: string): void {
  pc.ctx.fillStyle = color;
  for (let y = -ry; y <= ry; y++) {
    const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.5))));
    pc.ctx.fillRect(Math.round(cx - half), Math.round(cy + y), half * 2 + 1, 1);
  }
}

/** 가로로 감싸는 사각형 (타일 이음매 없이) */
function wrapRect(pc: PixelCanvas, x: number, y: number, w: number, h: number, color: string): void {
  const W = pc.width;
  const x0 = ((Math.floor(x) % W) + W) % W;
  pc.rect(x0, y, Math.min(w, W - x0), h, color);
  if (x0 + w > W) pc.rect(0, y, x0 + w - W, h, color);
}

export function castleInterior(): HTMLCanvasElement {
  const { w: W, h: H, groundRow: G } = CASTLE_BG;
  const pc = new PixelCanvas(W, H);
  const rnd = seededRandom(91);
  // 벽 (위는 더 어둡게)
  const bands = ['#1d1230', '#22163a', '#271a42', '#2c1e4a', '#312252', '#36265a'];
  for (let i = 0; i < bands.length; i++) pc.rect(0, Math.floor((i * G) / bands.length), W, Math.ceil(G / bands.length) + 1, bands[i]);
  // 벽돌 (줄마다 반 칸씩 어긋남, 가로로 이어지게 감싸 그림)
  for (let row = 0, y = 100; y < G; row++, y += 14) {
    const off = row % 2 ? 14 : 0;
    for (let x = off; x < W + 28; x += 28) {
      const shade = rnd();
      const c = shade < 0.18 ? '#3d2c60' : shade < 0.3 ? '#2a1c44' : null;
      if (c) wrapRect(pc, x + 1, y + 1, 26, 12, c);
      wrapRect(pc, x, y, 1, 14, '#170e26');
    }
    pc.rect(0, y, W, 1, '#170e26');
  }
  // 천장 들보
  pc.rect(0, 0, W, 100, '#140b22');
  for (let x = 0; x < W; x += 96) {
    wrapRect(pc, x, 70, 10, 30, '#2b1c40');
    wrapRect(pc, x - 30, 92, 70, 8, '#2b1c40');
  }
  pc.rect(0, 96, W, 4, '#3a2758');
  // 달빛 창문 (둥근 아치) ×2 + 바닥으로 내려오는 달빛
  for (const [wx, moon] of [[110, true], [520, false]] as const) {
    const ww = 74;
    const top = 128;
    const bottom = 262;
    // 바깥 돌 테두리
    ellipse(pc, wx + ww / 2, top + 20, ww / 2 + 6, 26, '#5a4380');
    pc.rect(wx - 6, top + 20, ww + 12, bottom - top - 14, '#5a4380');
    // 밤하늘
    ellipse(pc, wx + ww / 2, top + 20, ww / 2, 22, '#1a1030');
    pc.rect(wx, top + 20, ww, bottom - top - 20, '#1a1030');
    pc.rect(wx, top + 60, ww, bottom - top - 60, '#22163f');
    for (let i = 0; i < 9; i++) pc.px(wx + 6 + Math.floor(rnd() * (ww - 12)), top + 8 + Math.floor(rnd() * 90), i % 3 ? '#b9a3e8' : '#ffffff');
    if (moon) {
      pc.disc(wx + 48, top + 32, 13, '#c58cf0');
      pc.disc(wx + 51, top + 29, 11, '#e2b8ff');
      pc.disc(wx + 44, top + 35, 3, '#b07ae0');
      pc.disc(wx + 53, top + 26, 2, '#cf9ff5');
    } else {
      // 멀리 성탑 실루엣
      pc.rect(wx + 14, top + 70, 10, 60, '#120a20');
      pc.rect(wx + 44, top + 80, 14, 50, '#120a20');
      for (const [tx, tw] of [[14, 10], [44, 14]] as const) {
        for (let k = 0; k < tw / 2 + 2; k++) pc.rect(wx + tx + k, top + 70 - (tw / 2 + 2 - k) * 2 + (tx === 44 ? 10 : 0), tw - k * 2, 2, '#120a20');
      }
    }
    // 창살
    pc.rect(wx + ww / 2 - 1, top - 4, 3, bottom - top + 4, '#5a4380');
    pc.rect(wx, top + 80, ww, 3, '#5a4380');
    // 창턱
    pc.rect(wx - 10, bottom, ww + 20, 6, '#6d5596');
    // 달빛 (바닥까지 비스듬한 빛줄기 — 아주 옅게)
    pc.ctx.fillStyle = 'rgba(200, 150, 255, 0.07)';
    pc.ctx.beginPath();
    pc.ctx.moveTo(wx, bottom + 6);
    pc.ctx.lineTo(wx + ww, bottom + 6);
    pc.ctx.lineTo(wx + ww + 60, G);
    pc.ctx.lineTo(wx + 20, G);
    pc.ctx.closePath();
    pc.ctx.fill();
  }
  // 벽에 걸린 조리도구 (숟가락·국자·거품기) — 초록 이유식이 조금씩 묻음
  pc.rect(232, 200, 230, 4, '#5e4a7c');
  for (let i = 0; i < 8; i++) {
    const x = 246 + i * 28;
    pc.rect(x, 204, 2, 6, '#8f8aa8');
    const kind = i % 3;
    if (kind === 0) {
      pc.rect(x, 210, 2, 34, '#c9cbd8');
      ellipse(pc, x + 1, 248, 6, 5, '#c9cbd8');
      ellipse(pc, x + 1, 247, 4, 3, '#8fd040');
    } else if (kind === 1) {
      pc.rect(x, 210, 2, 30, '#b9bccb');
      ellipse(pc, x + 1, 246, 7, 6, '#b9bccb');
      ellipse(pc, x + 1, 248, 5, 3, '#6a6d82');
    } else {
      pc.rect(x, 210, 2, 18, '#b9bccb');
      for (let k = -3; k <= 3; k += 2) pc.rect(x + k, 228, 1, 16, '#d6d8e3');
      pc.rect(x - 4, 244, 10, 2, '#d6d8e3');
    }
    if (i % 2 === 0) {
      pc.rect(x + 1, 254, 1, 4, '#8fd040');
      pc.px(x + 1, 259, '#b8f070');
    }
  }
  // 선반 + 이유식 병
  pc.rect(612, 300, 140, 6, '#6d5596');
  pc.rect(620, 306, 4, 10, '#4a3866');
  pc.rect(740, 306, 4, 10, '#4a3866');
  for (let i = 0; i < 5; i++) {
    const x = 622 + i * 26;
    pc.rect(x, 280, 16, 20, '#b9a3e8');
    pc.rect(x + 2, 286, 12, 13, i % 2 ? '#8fd040' : '#a8e85a');
    pc.rect(x + 3, 276, 10, 4, '#e8d6a8');
    pc.px(x + 4, 288, '#e2ff9a');
  }
  // 보라 횃불 (벽)
  for (const tx of [44, 452]) {
    pc.rect(tx, 300, 8, 18, '#4a3866');
    pc.rect(tx - 3, 296, 14, 5, '#6d5596');
    pc.disc(tx + 4, 288, 7, '#9a4fe0');
    pc.disc(tx + 4, 290, 5, '#d08cff');
    pc.disc(tx + 4, 292, 2, '#ffffff');
    pc.ctx.fillStyle = 'rgba(208, 140, 255, 0.1)';
    pc.ctx.beginPath();
    pc.ctx.arc(tx + 4, 290, 34, 0, Math.PI * 2);
    pc.ctx.fill();
  }
  // 초록 이유식이 끓는 커다란 솥 (바닥 위)
  const cx = 360;
  ellipse(pc, cx, G - 30, 58, 32, '#2b2440');
  ellipse(pc, cx, G - 34, 55, 30, '#3d3556');
  pc.rect(cx - 62, G - 62, 124, 10, '#544a74');
  ellipse(pc, cx, G - 60, 54, 7, '#5fa82a');
  ellipse(pc, cx, G - 61, 50, 5, '#8fd040');
  for (const [bx, by, r] of [[cx - 30, G - 63, 3], [cx + 8, G - 64, 4], [cx + 34, G - 62, 2], [cx - 8, G - 61, 2]] as const) {
    pc.disc(bx, by, r, '#b8f070');
    pc.px(bx - 1, by - 1, '#e8ffb0');
  }
  // 넘쳐 흐르는 이유식
  for (const dx of [-44, -20, 26, 48]) {
    pc.rect(cx + dx, G - 54, 4, 12 + ((dx + 50) % 9), '#8fd040');
    pc.disc(cx + dx + 2, G - 40 + ((dx + 50) % 9), 3, '#8fd040');
  }
  // 솥 아래 보라 불꽃
  for (let i = 0; i < 6; i++) {
    const fx = cx - 40 + i * 16;
    pc.disc(fx, G - 6, 5, '#7a3bc0');
    pc.disc(fx, G - 8, 3, '#c88cff');
  }
  // 벽 아래 이유식 얼룩 몇 개
  for (const ox of [20, 200, 470, 690]) {
    ellipse(pc, ox, G - 8, 14, 4, '#5fa82a');
    pc.rect(ox - 6, G - 22, 3, 14, '#5fa82a');
  }
  // 바닥 줄 아래 (땅 타일이 덮지만 이음새용)
  pc.rect(0, G, W, H - G, '#3a2a54');
  return pc.canvas;
}

/** 성 바닥 타일 (64 x GROUND_TILE_H, 가로로 이어짐) */
export function castleGround(): HTMLCanvasElement {
  const W = 64;
  const H = GROUND_TILE_H;
  const pc = new PixelCanvas(W, H);
  pc.rect(0, 0, W, H, '#4a3566');
  // 돌판
  for (let row = 0, y = 3; y < H; row++, y += 10) {
    const off = row % 2 ? 16 : 0;
    for (let x = off - 32; x < W; x += 32) {
      pc.rect(x + 1, y + 1, 30, 8, row % 2 ? '#56407a' : '#5d4682');
      pc.rect(x + 2, y + 1, 28, 1, '#6d5596');
    }
    pc.rect(0, y, W, 1, '#2e1f40');
  }
  for (let x = 0; x < W; x += 32) pc.rect(x, 3, 1, H, '#2e1f40');
  // 위 테두리 (밝게)
  pc.rect(0, 0, W, 3, '#7a62a0');
  pc.rect(0, 2, W, 1, '#2e1f40');
  // 초록 이유식 얼룩
  pc.rect(10, 6, 7, 2, '#8fd040');
  pc.px(12, 5, '#b8f070');
  pc.rect(44, 19, 5, 2, '#6fae2a');
  return pc.canvas;
}

/** 다가가며 보이는 암흑의 이유식 성 (어두운 보라 · 불 켜진 창 · 초록 이유식이 흘러내림) 96x84 */
export function castleSilhouette(): HTMLCanvasElement {
  const pc = new PixelCanvas(96, 84);
  const body = '#24163a';
  const edge = '#3a2758';
  // 가운데 성채 + 양옆 탑
  pc.rect(28, 30, 40, 54, body);
  pc.rect(10, 40, 18, 44, body);
  pc.rect(68, 36, 18, 48, body);
  // 뾰족 지붕
  for (const [x0, w, top] of [[8, 22, 18], [66, 22, 12], [32, 32, 6]] as const) {
    for (let k = 0; k <= w / 2; k++) pc.rect(x0 + k, top + k * 2, w - k * 2, 2, '#2e1d4a');
  }
  pc.rect(47, 0, 2, 8, '#2e1d4a');
  pc.px(48, 0, '#c8ff6a');
  // 성가퀴
  for (let x = 28; x < 68; x += 6) pc.rect(x, 26, 4, 4, body);
  // 테두리 밝은 선
  pc.rect(28, 30, 1, 54, edge);
  pc.rect(10, 40, 1, 44, edge);
  pc.rect(68, 36, 1, 48, edge);
  // 불 켜진 창
  for (const [x, y] of [[16, 52], [74, 46], [38, 44], [54, 44], [46, 60]] as const) {
    pc.rect(x, y, 4, 6, '#ffcf6a');
    pc.px(x + 1, y + 1, '#fff2c0');
  }
  // 문
  pc.rect(42, 70, 12, 14, '#120a20');
  // 초록 이유식이 흘러내림
  for (const [x, len] of [[30, 12], [60, 9], [12, 8], [84, 10]] as const) {
    pc.rect(x, 30 + (x % 7), 2, len, '#8fd040');
    pc.px(x, 30 + (x % 7) + len, '#b8f070');
  }
  return pc.canvas;
}

export function castleMoon(): HTMLCanvasElement {
  const pc = new PixelCanvas(26, 26);
  pc.disc(13, 13, 12, '#9a5ad8');
  pc.disc(14, 12, 10, '#c58cf0');
  pc.disc(15, 11, 8, '#e2b8ff');
  pc.disc(10, 15, 2, '#b07ae0');
  pc.disc(16, 8, 1, '#cf9ff5');
  return pc.canvas;
}

/** 작은 번개 (지그재그) 12x34 */
export function castleBolt(): HTMLCanvasElement {
  const pc = new PixelCanvas(12, 34);
  const pts: [number, number][] = [[7, 0], [3, 10], [7, 12], [2, 22], [6, 24], [1, 33]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let k = 0; k <= n; k++) {
      const x = Math.round(x0 + ((x1 - x0) * k) / n);
      const y = Math.round(y0 + ((y1 - y0) * k) / n);
      pc.rect(x, y, 2, 1, '#f0d8ff');
      pc.px(x + 2, y, '#b07ae0');
    }
  }
  return pc.canvas;
}

/** 수상한 흔적: 땅에 꽂힌 커다란 숟가락 (초록 이유식이 묻음) 16x36 */
export function clueSpoon(): HTMLCanvasElement {
  const pc = new PixelCanvas(16, 36);
  ellipse(pc, 8, 7, 6, 7, '#c9cbd8');
  ellipse(pc, 7, 6, 4, 5, '#e6e8f0');
  ellipse(pc, 8, 6, 3, 3, '#8fd040');
  pc.px(7, 5, '#e2ff9a');
  pc.rect(7, 13, 3, 23, '#b9bccb');
  pc.rect(7, 13, 1, 23, '#e6e8f0');
  pc.rect(9, 14, 1, 6, '#8fd040');
  pc.px(9, 21, '#6fae2a');
  pc.outline('#3a2440');
  return pc.canvas;
}

/** 덤불 (숟가락을 반쯤 가림) 26x14 */
export function clueBush(): HTMLCanvasElement {
  const pc = new PixelCanvas(26, 14);
  for (const [x, y, r] of [[5, 9, 5], [12, 7, 6], [20, 9, 5]] as const) pc.disc(x, y, r, '#4f8f3a');
  for (const [x, y, r] of [[6, 8, 3], [13, 5, 4], [19, 8, 3]] as const) pc.disc(x, y, r, '#6fb04a');
  pc.px(12, 3, '#a8e070');
  pc.outline('#24401a');
  return pc.canvas;
}

/** 이유식 묻은 작은 발자국 (세 발가락) 9x5 */
export function cluePrint(): HTMLCanvasElement {
  const pc = new PixelCanvas(9, 5);
  pc.rect(2, 2, 5, 3, '#6fae2a');
  pc.px(1, 0, '#8fd040');
  pc.px(4, 0, '#8fd040');
  pc.px(7, 0, '#8fd040');
  pc.px(1, 1, '#6fae2a');
  pc.px(4, 1, '#6fae2a');
  pc.px(7, 1, '#6fae2a');
  return pc.canvas;
}
