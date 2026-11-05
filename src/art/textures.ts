/**
 * 코드로 도트 텍스처를 만들어 Phaser 텍스처 매니저에 등록합니다.
 * (외부 이미지 없이도 게임이 바로 실행되도록)
 */
import Phaser from 'phaser';
import { PixelCanvas, mapToCanvas, seededRandom } from './PixelCanvas';
import {
  BANANA,
  COOKIE,
  DINO_FRAMES,
  DINO_PALETTE,
  DUST_PALETTE,
  DUST_ROWS,
  HEART_EMPTY,
  HEART_FULL,
  HEART_ROWS,
  ROCK,
  SPARKLE_PALETTE,
  SPARKLE_ROWS,
  STRAWBERRY,
} from './sprites';

export const TEX = {
  dino: 'dino',
  strawberry: 'snack-strawberry',
  banana: 'snack-banana',
  cookie: 'snack-cookie',
  rock: 'rock',
  heartFull: 'heart-full',
  heartEmpty: 'heart-empty',
  sparkle: 'fx-sparkle',
  dust: 'fx-dust',
  ground: 'ground',
  hills: 'bg-hills',
  trees: 'bg-trees',
  cloud: 'bg-cloud',
  sun: 'bg-sun',
} as const;

export const GROUND_TILE_H = 40;

/** 기본 캐릭터 시트: 프레임을 가로로 나란히 */
export function buildDefaultDinoSheet(): HTMLCanvasElement {
  const fw = DINO_FRAMES[0][0].length;
  const fh = DINO_FRAMES[0].length;
  const pc = new PixelCanvas(fw * DINO_FRAMES.length, fh);
  DINO_FRAMES.forEach((rows, i) => pc.map(rows, DINO_PALETTE, i * fw, 0));
  return pc.canvas;
}

/** 캔버스/이미지를 가로 프레임으로 잘라 텍스처로 등록 */
export function addSheet(
  scene: Phaser.Scene,
  key: string,
  source: HTMLCanvasElement | HTMLImageElement,
  frameWidth: number,
  frameHeight: number,
): number {
  const tm = scene.textures;
  if (tm.exists(key)) tm.remove(key);
  const tex =
    source instanceof HTMLCanvasElement ? tm.addCanvas(key, source) : tm.addImage(key, source);
  if (!tex) return 0;
  const cols = Math.max(1, Math.floor(source.width / frameWidth));
  const rows = Math.max(1, Math.floor(source.height / frameHeight));
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tex.add(n, 0, c * frameWidth, r * frameHeight, frameWidth, frameHeight);
      n++;
    }
  }
  return n;
}

function addCanvas(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, canvas);
}

export function heartCanvas(full: boolean): HTMLCanvasElement {
  return mapToCanvas(HEART_ROWS, full ? HEART_FULL : HEART_EMPTY);
}

export function snackCanvas(kind: 'strawberry' | 'banana' | 'cookie'): HTMLCanvasElement {
  const art = kind === 'strawberry' ? STRAWBERRY : kind === 'banana' ? BANANA : COOKIE;
  return mapToCanvas(art.rows, art.palette);
}

/** 땅: 위쪽 풀 + 아래쪽 흙 (가로로 이어지는 타일) */
function buildGround(): HTMLCanvasElement {
  const W = 64;
  const H = GROUND_TILE_H;
  const pc = new PixelCanvas(W, H);
  const rnd = seededRandom(7);
  const dirt = '#c48a55';
  const dirtDark = '#a06c3e';
  const dirtLight = '#dcaa72';
  const grass = '#8fcf5a';
  const grassDark = '#5f9e3c';
  const grassLight = '#c2ea88';

  pc.rect(0, 0, W, H, dirt);
  // 흙 무늬 (가로 줄무늬 + 자갈)
  for (let y = 8; y < H; y += 6) {
    for (let x = 0; x < W; x++) {
      if (rnd() < 0.5) pc.px(x, y + (x % 3 === 0 ? 1 : 0), dirtDark);
    }
  }
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rnd() * W);
    const y = 9 + Math.floor(rnd() * (H - 10));
    pc.pxWrap(x, y, dirtLight);
    pc.pxWrap(x + 1, y, dirtLight);
    pc.pxWrap(x, y + 1, dirtDark);
    pc.pxWrap(x + 1, y + 1, dirtDark);
  }
  // 풀
  pc.rect(0, 0, W, 5, grass);
  pc.rect(0, 0, W, 1, grassLight);
  for (let x = 0; x < W; x++) {
    const depth = 5 + ((x * 7) % 5 === 0 ? 2 : (x * 3) % 4 === 0 ? 1 : 0);
    pc.rect(x, 5, 1, depth - 5, grassDark);
    if (rnd() < 0.3) pc.px(x, 2 + Math.floor(rnd() * 2), grassDark);
    if (rnd() < 0.25) pc.px(x, 1, grassLight);
  }
  // 작은 꽃
  const flowerColors = ['#ffffff', '#ffd6e8', '#ffe27a'];
  for (let i = 0; i < 4; i++) {
    const x = 6 + i * 16 + Math.floor(rnd() * 6);
    const c = flowerColors[i % flowerColors.length];
    pc.px(x, 1, c);
    pc.px(x - 1, 2, c);
    pc.px(x + 1, 2, c);
    pc.px(x, 2, '#f2a33a');
    pc.px(x, 3, c);
  }
  return pc.canvas;
}

/** 먼 언덕 (가로 반복) */
function buildHills(): HTMLCanvasElement {
  const W = 192;
  const H = 56;
  const pc = new PixelCanvas(W, H);
  const far = '#b5d98f';
  const farTop = '#cfe9a8';
  const near = '#94c56c';
  const nearTop = '#b2da86';
  const TAU = Math.PI * 2;
  for (let x = 0; x < W; x++) {
    const t = x / W;
    const h1 = 30 + Math.sin(t * TAU) * 9 + Math.sin(t * TAU * 3 + 1) * 4;
    const y1 = Math.round(H - h1);
    pc.rect(x, y1, 1, H - y1, far);
    pc.px(x, y1, farTop);
    const h2 = 16 + Math.sin(t * TAU * 2 + 2) * 6 + Math.sin(t * TAU * 5) * 2;
    const y2 = Math.round(H - h2);
    pc.rect(x, y2, 1, H - y2, near);
    pc.px(x, y2, nearTop);
    pc.px(x, y2 + 1, nearTop);
  }
  return pc.canvas;
}

/** 중간 거리 나무/덤불 (가로 반복) */
function buildTrees(): HTMLCanvasElement {
  const W = 224;
  const H = 52;
  const pc = new PixelCanvas(W, H);
  const rnd = seededRandom(42);
  const trunk = '#8a5a3a';
  const trunkDark = '#6b442b';
  const leafDark = '#4f8f3c';
  const leaf = '#6fb04a';
  const leafLight = '#9bd36a';
  const fruit = '#f26b5b';

  const trees = [
    { x: 20, r: 12 },
    { x: 78, r: 15 },
    { x: 150, r: 11 },
    { x: 196, r: 13 },
  ];
  // 덤불 띠
  for (let x = 0; x < W; x++) {
    const h = 7 + Math.round(Math.sin((x / W) * Math.PI * 2 * 7) * 2 + Math.sin((x / W) * Math.PI * 2 * 3) * 2);
    pc.rect(x, H - h, 1, h, leafDark);
    pc.px(x, H - h, leaf);
  }
  for (const t of trees) {
    const baseY = H - 4;
    const top = baseY - t.r * 2 - 10;
    // 줄기
    for (let y = top + t.r; y < baseY; y++) {
      pc.pxWrap(t.x - 1, y, trunk);
      pc.pxWrap(t.x, y, trunk);
      pc.pxWrap(t.x + 1, y, trunkDark);
    }
    const cy = top + t.r;
    pc.disc(t.x, cy, t.r, leafDark, true);
    pc.disc(t.x - 1, cy - 1, t.r - 2, leaf, true);
    pc.disc(t.x - Math.floor(t.r / 3), cy - Math.floor(t.r / 3), Math.floor(t.r / 3), leafLight, true);
    for (let i = 0; i < 4; i++) {
      const fx = t.x + Math.floor((rnd() - 0.5) * t.r * 1.2);
      const fy = cy + Math.floor((rnd() - 0.3) * t.r * 0.9);
      pc.pxWrap(fx, fy, fruit);
      pc.pxWrap(fx + 1, fy, fruit);
      pc.pxWrap(fx, fy + 1, '#c94a3e');
      pc.pxWrap(fx + 1, fy + 1, '#c94a3e');
    }
  }
  return pc.canvas;
}

function buildCloud(): HTMLCanvasElement {
  const pc = new PixelCanvas(34, 14);
  const white = '#fffaf0';
  const shade = '#e3ecf2';
  const blobs = [
    { x: 8, y: 9, r: 4 },
    { x: 15, y: 6, r: 5 },
    { x: 23, y: 7, r: 5 },
    { x: 28, y: 9, r: 4 },
  ];
  for (const b of blobs) pc.disc(b.x, b.y + 1, b.r, shade);
  for (const b of blobs) pc.disc(b.x, b.y, b.r, white);
  pc.rect(5, 11, 26, 2, shade);
  return pc.canvas;
}

function buildSun(): HTMLCanvasElement {
  const pc = new PixelCanvas(27, 27);
  pc.disc(13, 13, 13, 'rgba(255, 236, 170, 0.45)');
  pc.disc(13, 13, 10, '#ffe38a');
  pc.disc(13, 13, 8, '#fff3c0');
  pc.rect(9, 9, 2, 2, '#ffffff');
  return pc.canvas;
}

/** 모든 기본 텍스처 생성 */
export function buildAllTextures(scene: Phaser.Scene): void {
  addCanvas(scene, TEX.strawberry, snackCanvas('strawberry'));
  addCanvas(scene, TEX.banana, snackCanvas('banana'));
  addCanvas(scene, TEX.cookie, snackCanvas('cookie'));
  addCanvas(scene, TEX.rock, mapToCanvas(ROCK.rows, ROCK.palette));
  addCanvas(scene, TEX.heartFull, heartCanvas(true));
  addCanvas(scene, TEX.heartEmpty, heartCanvas(false));
  addCanvas(scene, TEX.sparkle, mapToCanvas(SPARKLE_ROWS, SPARKLE_PALETTE));
  addCanvas(scene, TEX.dust, mapToCanvas(DUST_ROWS, DUST_PALETTE));
  addCanvas(scene, TEX.ground, buildGround());
  addCanvas(scene, TEX.hills, buildHills());
  addCanvas(scene, TEX.trees, buildTrees());
  addCanvas(scene, TEX.cloud, buildCloud());
  addCanvas(scene, TEX.sun, buildSun());
}
