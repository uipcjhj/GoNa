/**
 * 일반 몬스터 임시 도트 (정식 PNG 가 들어오면 MONSTER_ASSETS 로 자동 교체 — src/game/monsters.ts)
 *   안경잽이몹: 커다란 동그란 안경, 잘난 척하는 표정, 짧은 다리 — 프레임 0 걷기 · 1 걷기(발 바꿈) · 2 안경 반짝(발사 직전)
 *   방구할배몹: 굽은 허리, 하얀 수염, 지팡이 — 프레임 0 걷기 · 1 걷기 · 2 엉덩이 들썩(방귀 직전)
 * 모두 왼쪽(고나 쪽)을 바라봄.
 */
import { PixelCanvas } from './PixelCanvas';

export const GLASSES_FRAME = { w: 20, h: 20 };
export const FARTER_FRAME = { w: 22, h: 22 };

function glassesFrame(f: 0 | 1 | 2): HTMLCanvasElement {
  const { w, h } = GLASSES_FRAME;
  const pc = new PixelCanvas(w, h);
  // 다리
  const step = f === 1 ? 1 : 0;
  pc.rect(6 - step, 16, 3, 3, '#7a4fb0');
  pc.rect(12 + step, 16, 3, 3, '#7a4fb0');
  // 몸 (보라 동글이)
  pc.disc(10, 10, 7, '#9a6ad6');
  pc.disc(9, 9, 6, '#b48af0');
  pc.disc(7, 6, 2, '#d8c4ff');
  // 잘난 척 눈썹 + 입
  pc.rect(3, 4, 4, 1, '#3a2060');
  pc.rect(10, 3, 4, 1, '#3a2060');
  pc.rect(5, 14, 4, 1, '#3a2060');
  pc.px(9, 13, '#3a2060');
  // 커다란 안경 (왼쪽을 봄)
  for (const cx of [5, 12]) {
    pc.disc(cx, 8, 3, '#2a1a40');
    pc.disc(cx, 8, 2, f === 2 ? '#fff6a0' : '#dff4ff');
    pc.px(cx - 1, 7, '#ffffff');
  }
  pc.rect(8, 8, 1, 1, '#2a1a40');
  if (f === 2) {
    pc.px(2, 5, '#fff6a0');
    pc.px(15, 4, '#fff6a0');
  }
  pc.outline('#3a2060');
  return pc.canvas;
}

function farterFrame(f: 0 | 1 | 2): HTMLCanvasElement {
  const { w, h } = FARTER_FRAME;
  const pc = new PixelCanvas(w, h);
  const step = f === 1 ? 1 : 0;
  const lift = f === 2 ? 1 : 0;
  // 지팡이 (앞쪽 = 왼쪽)
  pc.rect(2, 9, 1, 12, '#8a5a30');
  pc.rect(2, 9, 3, 1, '#8a5a30');
  // 다리
  pc.rect(8 - step, 18, 3, 3, '#6b4a2e');
  pc.rect(13 + step, 18 - lift, 3, 3, '#6b4a2e');
  // 굽은 몸 (조끼)
  pc.disc(13, 13 - lift, 6, '#c98a4a');
  pc.disc(12, 12 - lift, 5, '#e0a35e');
  pc.rect(9, 15 - lift, 9, 2, '#8a5a30');
  // 머리 (앞으로 숙임)
  pc.disc(7, 7, 4, '#f2c79a');
  pc.disc(6, 6, 2, '#f8dcb8');
  // 대머리 + 흰 머리
  pc.rect(9, 3, 3, 2, '#e8e8e8');
  // 눈 (실눈) + 볼
  pc.rect(4, 6, 2, 1, '#3a2418');
  pc.px(8, 8, '#f0a080');
  // 하얀 수염
  pc.rect(3, 9, 5, 2, '#ffffff');
  pc.rect(4, 11, 3, 1, '#e6e6e6');
  pc.px(5, 12, '#e6e6e6');
  if (f === 2) {
    // 엉덩이 쪽 방귀 기운
    pc.px(20, 10, '#b8c46a');
    pc.px(21, 12, '#9aa64e');
  }
  pc.outline('#4a2a14');
  return pc.canvas;
}

/** 시트 (프레임 3장 가로) */
export function monsterSheet(kind: 'glasses' | 'farter'): { canvas: HTMLCanvasElement; fw: number; fh: number } {
  const f = kind === 'glasses' ? GLASSES_FRAME : FARTER_FRAME;
  const pc = new PixelCanvas(f.w * 3, f.h);
  ([0, 1, 2] as const).forEach((i) => pc.ctx.drawImage(kind === 'glasses' ? glassesFrame(i) : farterFrame(i), i * f.w, 0));
  return { canvas: pc.canvas, fw: f.w, fh: f.h };
}

/** 안경 반짝이 투사체 7x7 */
export function sparkShot(): HTMLCanvasElement {
  const pc = new PixelCanvas(7, 7);
  pc.rect(3, 0, 1, 7, '#fff6a0');
  pc.rect(0, 3, 7, 1, '#fff6a0');
  pc.rect(2, 2, 3, 3, '#ffe060');
  pc.px(3, 3, '#ffffff');
  pc.outline('#b07a10');
  return pc.canvas;
}

/** 방귀 구름 (땅에 잠시 남음) 18x12 */
export function fartCloud(): HTMLCanvasElement {
  const pc = new PixelCanvas(18, 12);
  pc.disc(5, 7, 4, '#a9b45c');
  pc.disc(12, 7, 4, '#a9b45c');
  pc.disc(9, 4, 4, '#c3cd78');
  pc.disc(7, 3, 1, '#e8eec0');
  pc.px(10, 8, '#7f8a38');
  pc.px(14, 6, '#7f8a38');
  pc.outline('#56602a');
  return pc.canvas;
}

/** 어지러움 별 5x5 (보스 기절·지침) */
export function dizzyStar(): HTMLCanvasElement {
  const pc = new PixelCanvas(5, 5);
  pc.px(2, 0, '#ffe060');
  pc.rect(0, 2, 5, 1, '#ffe060');
  pc.rect(1, 1, 3, 3, '#ffe060');
  pc.px(2, 2, '#ffffff');
  pc.px(1, 4, '#ffe060');
  pc.px(3, 4, '#ffe060');
  return pc.canvas;
}

/** 경로 예고 화살표 (보스 필살기 경로) 9x7 */
export function pathArrow(color = '#ff6f9f', line = '#7a1238'): HTMLCanvasElement {
  const pc = new PixelCanvas(11, 9);
  pc.rect(4, 3, 6, 3, color);
  for (let i = 0; i < 4; i++) pc.rect(1 + i, 4 - i, 1, i * 2 + 1, color);
  pc.outline(line);
  return pc.canvas;
}

/** 새 간식: 별 젤리 (드물게 · 점수 50 · 성장 +4) */
export function jellyCanvas(): HTMLCanvasElement {
  const pc = new PixelCanvas(13, 13);
  const pts: [number, number][] = [
    [6, 0], [5, 2], [7, 2], [4, 3], [8, 3],
  ];
  pc.disc(6, 7, 5, '#5ec8f0');
  for (const [x, y] of pts) pc.rect(x, y, 1, 3, '#5ec8f0');
  pc.rect(1, 5, 11, 2, '#5ec8f0');
  pc.disc(6, 7, 3, '#8fe0ff');
  pc.disc(5, 6, 1, '#e8fbff');
  pc.px(8, 9, '#3a9cc8');
  pc.outline('#1e5a7a');
  return pc.canvas;
}
