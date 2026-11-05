/**
 * 둥지 · 알 · 알껍데기 도트 그림 (코드로 그림).
 * 오프닝 컷신(알에서 태어나는 고나)과 1단계(둥지에 누운 갓난아기)에서 함께 씁니다.
 */
import { PixelCanvas, seededRandom } from './PixelCanvas';

const OUTLINE = '#3d2716';

export const NEST_W = 30;
export const NEST_H = 11;
/** 둥지 안으로 아기가 묻히는 깊이 (도트) */
export const NEST_SINK = 5;
/** 둥지 앞쪽(아기 앞에 그려지는 부분)의 높이 */
const NEST_FRONT_ROWS = 6;

function nestFull(): PixelCanvas {
  const pc = new PixelCanvas(NEST_W, NEST_H);
  const rnd = seededRandom(31);
  const cx = NEST_W / 2;
  const straw = ['#c9944f', '#b07a3c', '#dcb06a', '#a46b33'];
  // 그릇 모양 (위가 넓고 아래가 둥근)
  for (let y = 1; y < NEST_H - 1; y++) {
    const t = (y - 1) / (NEST_H - 3);
    const half = Math.round(cx - 1 - t * t * 5);
    for (let x = Math.round(cx - half); x < Math.round(cx + half); x++) {
      // 엮은 무늬: 비스듬한 줄
      const k = (x + y * 2) % 4 === 0 ? 1 : (x - y * 2 + 40) % 5 === 0 ? 3 : y < 3 ? 2 : 0;
      pc.px(x, y, straw[k]);
    }
  }
  // 위쪽 안쪽 그늘 (둥지 속)
  for (let x = 4; x < NEST_W - 4; x++) pc.px(x, 2, '#7a4a24');
  // 삐죽 나온 지푸라기
  for (let i = 0; i < 7; i++) {
    const x = Math.round(2 + rnd() * (NEST_W - 4));
    pc.px(x, 0, '#dcb06a');
  }
  pc.px(0, 3, '#c9944f');
  pc.px(NEST_W - 1, 4, '#c9944f');
  // 잎사귀 몇 장 (공룡 옷과 다른 진한 초록)
  for (const [x, y] of [[3, 4], [24, 3], [12, 8]] as const) {
    pc.px(x, y, '#5f9e3c');
    pc.px(x + 1, y, '#7fbf4a');
    pc.px(x + 1, y - 1, '#7fbf4a');
  }
  pc.outline(OUTLINE);
  return pc;
}

/** 둥지 전체 (아기 뒤) + 앞쪽 테두리 (아기 앞) — 아기가 둥지 안에 쏙 들어간 것처럼 보이게 */
export function buildNest(): { back: HTMLCanvasElement; front: HTMLCanvasElement } {
  const full = nestFull();
  const front = new PixelCanvas(full.width, full.height);
  front.ctx.drawImage(full.canvas, 0, full.height - NEST_FRONT_ROWS, full.width, NEST_FRONT_ROWS, 0, full.height - NEST_FRONT_ROWS, full.width, NEST_FRONT_ROWS);
  return { back: full.canvas, front: front.canvas };
}

export const EGG_W = 18;
export const EGG_H = 22;

/** 공룡 알: 크림색에 연두 점박이. crack 0~2 단계 금 */
export function buildEgg(crack: 0 | 1 | 2): HTMLCanvasElement {
  const pc = new PixelCanvas(EGG_W, EGG_H);
  const cx = (EGG_W - 1) / 2;
  for (let y = 0; y < EGG_H; y++) {
    for (let x = 0; x < EGG_W; x++) {
      // 위가 좁고 아래가 넓은 달걀형
      const ny = (y - EGG_H * 0.56) / (y < EGG_H * 0.56 ? EGG_H * 0.56 : EGG_H * 0.44);
      const nx = (x - cx) / (EGG_W / 2 - 0.5);
      if (nx * nx + ny * ny <= 1) {
        const light = x < cx - 2 && y < EGG_H * 0.5;
        const shade = x > cx + 3 || y > EGG_H - 5;
        pc.px(x, y, light ? '#fffaf0' : shade ? '#eadfc6' : '#f7efdc');
      }
    }
  }
  // 연두 점박이 (고나 옷 색)
  for (const [x, y, r] of [[6, 7, 1], [11, 12, 2], [5, 15, 1], [12, 5, 1], [8, 18, 1]] as const) {
    pc.disc(x, y, r - 1 < 0 ? 0 : r - 1, '#a3db6e');
    pc.px(x + 1, y, '#a3db6e');
    if (r > 1) pc.px(x, y + 1, '#8cc95a');
  }
  pc.px(5, 4, '#ffffff');
  pc.px(4, 5, '#ffffff');
  // 금
  const crackColor = '#6b4a2e';
  if (crack >= 1) {
    for (const [x, y] of [[6, 9], [7, 8], [8, 9], [9, 8], [10, 9], [11, 8]] as const) pc.px(x, y, crackColor);
  }
  if (crack >= 2) {
    for (const [x, y] of [[4, 10], [5, 9], [12, 9], [13, 10], [14, 9], [8, 10], [8, 11], [11, 10]] as const) pc.px(x, y, crackColor);
    // 꼭대기에 머리카락이 나올 작은 구멍
    for (const [x, y] of [[8, 0], [9, 0], [8, 1], [9, 1], [7, 1], [10, 1], [9, 2]] as const) pc.px(x, y, '#5a3a22');
  }
  pc.outline(OUTLINE);
  return pc.canvas;
}

/** 깨진 알껍데기 조각 3개 (위 뚜껑, 왼쪽, 오른쪽) */
export function buildShellPieces(): HTMLCanvasElement[] {
  const egg = buildEgg(0);
  const pieces: [number, number, number, number][] = [
    [2, 0, 14, 10], // 위 뚜껑
    [0, 9, 9, 13], // 왼쪽 아래
    [9, 9, 9, 13], // 오른쪽 아래
  ];
  return pieces.map(([x, y, w, h]) => {
    const pc = new PixelCanvas(w + 2, h + 2);
    pc.ctx.drawImage(egg, x, y, w, h, 1, 1, w, h);
    // 깨진 쪽 지그재그 테두리
    for (let i = 0; i < w; i += 2) pc.px(1 + i, y === 0 ? h : 1, '#6b4a2e');
    return pc.canvas;
  });
}

/** 캐릭터 그림 맨 위의 머리카락 부분만 잘라 냄 (알 위로 삐죽 나오는 연출) */
export function cropHairTuft(src: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = src.getContext('2d');
  const out = new PixelCanvas(src.width, 1);
  if (!ctx) return out.canvas;
  const d = ctx.getImageData(0, 0, src.width, src.height).data;
  const isHair = (r: number, g: number, b: number): boolean => r - b > 30 && g < 140 && r < 190; // 갈색·진한 외곽선
  let rows = 0;
  for (let y = 0; y < src.height; y++) {
    let any = false;
    let other = false;
    for (let x = 0; x < src.width; x++) {
      const i = (y * src.width + x) * 4;
      if (d[i + 3] === 0) continue;
      any = true;
      if (!isHair(d[i], d[i + 1], d[i + 2])) other = true;
    }
    if (any && other) break; // 머리카락이 아닌 색(옷·얼굴)이 나오면 멈춤
    rows = y + 1;
  }
  // 가로·세로로 머리카락 부분만 남김
  let x0 = src.width;
  let x1 = -1;
  let y0 = rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < src.width; x++) {
      if (d[(y * src.width + x) * 4 + 3] > 0) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
      }
    }
  }
  if (x1 < 0) return out.canvas;
  const w = x1 - x0 + 1;
  const h = Math.max(1, rows - y0);
  const pc = new PixelCanvas(w, h);
  pc.ctx.drawImage(src, x0, y0, w, h, 0, 0, w, h);
  return pc.canvas;
}
