/**
 * 마지막 모험의 작은 효과·임시 소품 (코드로 그림)
 *   성 원경·근경·입구·성 안 배경은 승인된 그림(public/assets/castle, config CASTLE_ART)으로 교체됨 — 여기서 그리지 않음
 *   castleBolt: 작은 번개 (효과)
 *   clueSpoon · clueBush · cluePrint: 수상한 흔적 — 임시 코드 그림 (승인 에셋을 받으면 교체 · CLAUDE.md)
 */
import { PixelCanvas } from './PixelCanvas';

export const CASTLE_BG = { w: 772, h: 460, groundRow: 400 };

function ellipse(pc: PixelCanvas, cx: number, cy: number, rx: number, ry: number, color: string): void {
  pc.ctx.fillStyle = color;
  for (let y = -ry; y <= ry; y++) {
    const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.5))));
    pc.ctx.fillRect(Math.round(cx - half), Math.round(cy + y), half * 2 + 1, 1);
  }
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
