/**
 * 보스전 도트 그림 (코드로 그림 — 정식 PNG 가 들어오면 BOSS_ASSETS 로 교체).
 *
 * 보스 시트: 같은 크기 프레임 5장을 가로로 이어 붙임 (왼쪽을 바라봄)
 *   뽀뽀괴물 0 대기 · 1 통통(찌그러짐) · 2 뽀뽀(입술 쭉, 눈 감음) · 3 화남(분노) · 4 어지러움(지침)
 *   킁카괴물 0 대기 · 1 흡입(코 벌렁) · 2 부풀기(냄새 폭발 직전) · 3 화남(분노) · 4 어지러움(기절)
 */
import { PixelCanvas } from './PixelCanvas';

export const KISS_FRAME = { w: 44, h: 44 };
export const SNIFF_FRAME = { w: 48, h: 46 };

/** 하트 모양 (중심 cx, 위 y, 크기 s=2~4) */
function heart(pc: PixelCanvas, cx: number, top: number, s: number, color: string, hi?: string): void {
  pc.disc(cx - s, top + s, s, color);
  pc.disc(cx + s, top + s, s, color);
  for (let i = 0; i <= s * 2; i++) pc.rect(cx - s * 2 + i, top + s + i, (s * 2 - i) * 2 + 1, 1, color);
  if (hi) pc.px(cx - s - 1, top + s - 1, hi);
}

function kissFrame(frame: 0 | 1 | 2): HTMLCanvasElement {
  const { w, h } = KISS_FRAME;
  const pc = new PixelCanvas(w, h);
  const squash = frame === 1 ? 1 : 0;
  const cy = 26 + squash;
  // 발
  pc.rect(13, 39, 6, 4, '#a84d86');
  pc.rect(27, 39, 6, 4, '#a84d86');
  // 하트 뿔
  heart(pc, 14, 4 + squash, 3, '#ff4f86', '#ffc2d6');
  heart(pc, 31, 3 + squash, 3, '#ff4f86', '#ffc2d6');
  pc.rect(13, 11 + squash, 2, 4, '#d9407a');
  pc.rect(30, 10 + squash, 2, 5, '#d9407a');
  // 몸 (둥글둥글 보라분홍)
  pc.disc(23, cy, 16 - squash, '#c96aa8');
  pc.disc(22, cy - 1, 15 - squash, '#e58bc0');
  pc.disc(18, cy - 6, 7, '#f2a9d3');
  pc.disc(16, cy - 8, 3, '#fbd3ea');
  // 배 무늬
  pc.disc(27, cy + 6, 6, '#f2b8d8');
  // 볼터치
  pc.rect(9, cy - 3, 4, 2, '#ff8fb8');
  pc.rect(25, cy - 4, 4, 2, '#ff8fb8');
  // 눈 (왼쪽을 봄)
  if (frame === 2) {
    // 눈 감고 뽀뽀: ^ ^
    for (const ex of [12, 21]) {
      pc.px(ex, cy - 9, '#3a1630');
      pc.px(ex + 1, cy - 10, '#3a1630');
      pc.px(ex + 2, cy - 10, '#3a1630');
      pc.px(ex + 3, cy - 9, '#3a1630');
    }
  } else {
    for (const ex of [11, 20]) {
      pc.rect(ex, cy - 12, 4, 5, '#ffffff');
      pc.rect(ex, cy - 11, 2, 3, '#2a1028');
      pc.px(ex, cy - 11, '#ffffff');
      pc.px(ex - 1, cy - 13, '#3a1630'); // 속눈썹
      pc.px(ex + 4, cy - 13, '#3a1630');
    }
  }
  // 커다란 입술
  const lx = frame === 2 ? 5 : 7;
  const lw = frame === 2 ? 11 : 16;
  const ly = cy + 1;
  if (frame === 2) {
    // 쭉 내민 동그란 뽀뽀 입술
    pc.disc(lx + 4, ly + 2, 5, '#a0103e');
    pc.disc(lx + 4, ly + 2, 4, '#e0245e');
    pc.rect(lx + 2, ly, 3, 2, '#ff7aa2');
    pc.rect(lx + 3, ly + 2, 3, 2, '#7a0a2c');
  } else {
    for (let x = 0; x < lw; x++) {
      const t = (x - lw / 2) / (lw / 2);
      const up = Math.round(3 - Math.abs(t) * 2 + (Math.abs(t) < 0.2 ? -1 : 0));
      const down = Math.round(4 - t * t * 3);
      pc.rect(lx + x, ly - up, 1, up + down + 1, '#e0245e');
    }
    pc.rect(lx + 1, ly, lw - 2, 1, '#8a1238');
    pc.rect(lx + 3, ly - 2, 3, 1, '#ff8fb0');
    pc.rect(lx + 4, ly + 2, 5, 1, '#ff7aa2');
  }
  pc.outline('#5a2140');
  return pc.canvas;
}

function sniffFrame(frame: 0 | 1 | 2): HTMLCanvasElement {
  const { w, h } = SNIFF_FRAME;
  const pc = new PixelCanvas(w, h);
  const puff = frame === 2 ? 2 : 0;
  const cy = 28;
  // 발
  pc.rect(17, 41, 6, 4, '#4e7336');
  pc.rect(31, 41, 6, 4, '#4e7336');
  // 뾰족 털
  for (let i = 0; i < 5; i++) {
    const x = 16 + i * 6;
    for (let k = 0; k < 6; k++) pc.rect(x - (5 - k) / 2, 6 + k - puff, 6 - k, 1, i % 2 ? '#6f9e4b' : '#7fae5a');
  }
  // 몸
  pc.disc(27, cy, 17 + puff, '#5f8c43');
  pc.disc(26, cy - 1, 16 + puff, '#7fae5a');
  pc.disc(22, cy - 7, 7, '#9cc874');
  pc.disc(20, cy - 9, 3, '#c3e39d');
  pc.disc(31, cy + 7, 6, '#a3c983');
  // 눈 (작고 심술궂게)
  if (frame === 2) {
    for (const ex of [17, 25]) pc.rect(ex, cy - 11, 4, 1, '#1f2a14');
  } else {
    for (const ex of [17, 25]) {
      pc.rect(ex, cy - 12, 3, 3, '#1f2a14');
      pc.px(ex, cy - 12, '#ffffff');
      pc.rect(ex - 1, cy - 14, 5, 1, '#3c5226'); // 눈썹
    }
  }
  // 커다란 코 (왼쪽으로 불룩)
  const nr = frame === 1 ? 10 : 8;
  const nx = frame === 1 ? 10 : 11;
  const ny = cy + 1;
  pc.disc(nx, ny, nr, '#a8674d');
  pc.disc(nx - 1, ny - 1, nr - 1, '#d08e6c');
  pc.disc(nx - 3, ny - 4, 3, '#efb999');
  pc.px(nx - 4, ny - 5, '#fff0e0');
  // 콧구멍
  const ns = frame === 1 ? 3 : 2;
  pc.disc(nx - 4, ny + 3, ns - 1, '#4a2418');
  pc.disc(nx + 2, ny + 4, ns - 1, '#4a2418');
  if (frame === 1) {
    pc.rect(nx - 5, ny + 3, ns, 1, '#2a120a');
    pc.rect(nx + 1, ny + 4, ns, 1, '#2a120a');
  }
  // 입
  pc.rect(18, cy + 9, 6, 1, '#2f4420');
  pc.px(18, cy + 8, '#2f4420');
  pc.outline('#2a3a1c');
  return pc.canvas;
}

/** 화남 / 어지러움 표정: 대기 프레임 위에 눈썹·눈만 덧그림 */
function moodFace(base: HTMLCanvasElement, eyes: { x: number; y: number }[], body: string, ink: string, mood: 'angry' | 'dizzy'): HTMLCanvasElement {
  const pc = new PixelCanvas(base.width, base.height);
  pc.ctx.drawImage(base, 0, 0);
  for (const [i, e] of eyes.entries()) {
    if (mood === 'angry') {
      // 안쪽으로 내려간 눈썹 (두 눈 사이가 낮게) + 눈동자 작게
      const dir = i === 0 ? 1 : -1;
      for (let k = 0; k < 5; k++) pc.px(e.x - 1 + k, e.y - 4 + (dir > 0 ? Math.floor(k / 2) : 2 - Math.floor(k / 2)), ink);
      for (let k = 0; k < 5; k++) pc.px(e.x - 1 + k, e.y - 3 + (dir > 0 ? Math.floor(k / 2) : 2 - Math.floor(k / 2)), ink);
    } else {
      // 눈을 지우고 X 눈
      pc.rect(e.x - 1, e.y - 1, 6, 6, body);
      for (let k = 0; k < 4; k++) {
        pc.px(e.x + k, e.y + k, ink);
        pc.px(e.x + 3 - k, e.y + k, ink);
      }
    }
  }
  return pc.canvas;
}

function kissMood(mood: 'angry' | 'dizzy'): HTMLCanvasElement {
  return moodFace(kissFrame(0), [{ x: 11, y: 14 }, { x: 20, y: 14 }], '#e58bc0', '#3a1630', mood);
}

function sniffMood(mood: 'angry' | 'dizzy'): HTMLCanvasElement {
  return moodFace(sniffFrame(0), [{ x: 17, y: 16 }, { x: 25, y: 16 }], '#7fae5a', '#1f2a14', mood);
}

/** 보스 시트 (프레임 5장 가로) */
export function bossSheet(id: 'kiss' | 'sniff'): { canvas: HTMLCanvasElement; fw: number; fh: number } {
  const f = id === 'kiss' ? KISS_FRAME : SNIFF_FRAME;
  const pc = new PixelCanvas(f.w * 5, f.h);
  const frames = id === 'kiss' ? [kissFrame(0), kissFrame(1), kissFrame(2), kissMood('angry'), kissMood('dizzy')] : [sniffFrame(0), sniffFrame(1), sniffFrame(2), sniffMood('angry'), sniffMood('dizzy')];
  frames.forEach((c, i) => pc.ctx.drawImage(c, i * f.w, 0));
  return { canvas: pc.canvas, fw: f.w, fh: f.h };
}

/** 하트 뽀뽀탄 9x8 */
export function heartShot(): HTMLCanvasElement {
  const pc = new PixelCanvas(9, 8);
  heart(pc, 4, 0, 2, '#ff4f86');
  pc.px(2, 1, '#ffd0e0');
  pc.px(3, 1, '#ffd0e0');
  pc.outline('#7a1238');
  return pc.canvas;
}

/** 뽀뽀 파동 조각 (땅을 따라 퍼지는 작은 하트) 7x6 */
export function waveHeart(): HTMLCanvasElement {
  const pc = new PixelCanvas(7, 6);
  heart(pc, 3, 0, 1, '#ff7aa8');
  pc.px(2, 1, '#ffffff');
  pc.outline('#a8245a');
  return pc.canvas;
}

/** 냄새 구름탄 12x10 */
export function smellCloud(): HTMLCanvasElement {
  const pc = new PixelCanvas(12, 10);
  pc.disc(4, 6, 3, '#9aa64e');
  pc.disc(8, 5, 3, '#9aa64e');
  pc.disc(6, 3, 3, '#b8c46a');
  pc.disc(5, 2, 1, '#e0e8a0');
  pc.px(7, 6, '#6f7a30');
  pc.px(8, 7, '#6f7a30');
  pc.outline('#4c5520');
  return pc.canvas;
}

/** 큰 냄새 구름 (폭발) 16x12 */
export function bigCloud(): HTMLCanvasElement {
  const pc = new PixelCanvas(16, 12);
  pc.disc(5, 7, 4, '#8f9a45');
  pc.disc(11, 7, 4, '#8f9a45');
  pc.disc(8, 4, 4, '#b0bc60');
  pc.disc(6, 3, 1, '#e0e8a0');
  pc.outline('#4c5520');
  return pc.canvas;
}

/** 바닥 냄새 장판 28x6 */
export function stinkPuddle(): HTMLCanvasElement {
  const pc = new PixelCanvas(28, 6);
  for (let x = 0; x < 28; x++) {
    const t = (x - 13.5) / 14;
    const hh = Math.max(1, Math.round(3 * Math.sqrt(Math.max(0, 1 - t * t))));
    pc.rect(x, 5 - hh, 1, hh, '#7d8a35');
  }
  pc.rect(3, 4, 22, 1, '#5f6a24');
  pc.disc(8, 2, 1, '#b8c46a');
  pc.disc(19, 3, 1, '#b8c46a');
  pc.px(13, 2, '#e0e8a0');
  return pc.canvas;
}

/** 방패: 고나 앞의 반투명 픽셀 방패 (18x38, 발 기준) — 둥근 물방울 방패 */
export function battleShield(): HTMLCanvasElement {
  const w = 18;
  const h = 38;
  const pc = new PixelCanvas(w, h);
  for (let y = 0; y < h; y++) {
    const t = (y - h / 2) / (h / 2);
    const half = Math.max(1, Math.round(7 * Math.sqrt(Math.max(0, 1 - t * t))));
    const front = 9 + half - 1;
    pc.rect(9 - Math.round(half / 2), y, half + Math.round(half / 2), 1, 'rgba(140, 225, 255, 0.55)');
    pc.px(front, y, 'rgba(240, 252, 255, 1)');
    pc.px(front - 1, y, 'rgba(90, 200, 255, 0.95)');
    pc.px(9 - Math.round(half / 2), y, 'rgba(90, 200, 255, 0.8)');
  }
  // 반짝 하이라이트
  for (const [x, y] of [[11, 8], [12, 9], [12, 10], [13, 12], [13, 13], [11, 26], [12, 27]]) pc.px(x, y, 'rgba(255,255,255,1)');
  return pc.canvas;
}

/** 작은 하트 파티클 3x3 · 냄새 파티클 2x2 · 경고 '!' */
export function tinyHeart(): HTMLCanvasElement {
  const pc = new PixelCanvas(3, 3);
  pc.px(0, 0, '#ff6f9f');
  pc.px(2, 0, '#ff6f9f');
  pc.rect(0, 1, 3, 1, '#ff6f9f');
  pc.px(1, 2, '#ff6f9f');
  return pc.canvas;
}
export function stinkDot(): HTMLCanvasElement {
  const pc = new PixelCanvas(2, 2);
  pc.rect(0, 0, 2, 2, '#a7b259');
  pc.px(1, 1, '#6f7a30');
  return pc.canvas;
}
export function warnMark(): HTMLCanvasElement {
  const pc = new PixelCanvas(5, 11);
  pc.rect(1, 0, 3, 7, '#ff4a3a');
  pc.rect(1, 8, 3, 3, '#ff4a3a');
  pc.outline('#fff4d0');
  return pc.canvas;
}

/**
 * 머리카락(맨 위로 솟은 물방울 머리카락) 영역 찾기.
 * 맨 위 픽셀에서 시작해 한 줄씩 내려가며 이어진 부분만 따라가다가,
 * 다른 부분(모자·머리)과 합쳐지거나 갑자기 넓어지는 줄에서 멈춤.
 */
function tuftMask(frame: HTMLCanvasElement): Uint8Array {
  const w = frame.width;
  const h = frame.height;
  const mask = new Uint8Array(w * h);
  const ctx = frame.getContext('2d');
  if (!ctx) return mask;
  const d = ctx.getImageData(0, 0, w, h).data;
  const solid = (x: number, y: number): boolean => x >= 0 && x < w && y >= 0 && y < h && d[(y * w + x) * 4 + 3] > 0;
  const runs = (y: number): [number, number][] => {
    const out: [number, number][] = [];
    let x = 0;
    while (x < w) {
      if (!solid(x, y)) {
        x++;
        continue;
      }
      const a = x;
      while (x < w && solid(x, y)) x++;
      out.push([a, x - 1]);
    }
    return out;
  };
  let y0 = 0;
  while (y0 < h && runs(y0).length === 0) y0++;
  if (y0 >= h) return mask;
  const first = runs(y0)[0];
  for (let x = first[0]; x <= first[1]; x++) mask[y0 * w + x] = 1;
  let maxW = first[1] - first[0] + 1;
  for (let y = y0 + 1; y < h; y++) {
    const add: [number, number][] = [];
    for (const [a, b] of runs(y)) {
      let touchTuft = false;
      let touchOther = false;
      for (let x = a - 1; x <= b + 1; x++) {
        if (!solid(x, y - 1)) continue;
        if (mask[(y - 1) * w + x]) touchTuft = true;
        else if (x >= a && x <= b) touchOther = true;
      }
      if (!touchTuft) continue;
      const rw = b - a + 1;
      if (touchOther || (rw > maxW * 2 + 2 && rw > 6)) return mask; // 머리·모자와 합쳐짐 → 여기까지
      add.push([a, b]);
      maxW = Math.max(maxW, rw);
    }
    if (!add.length) break;
    for (const [a, b] of add) for (let x = a; x <= b; x++) mask[y * w + x] = 1;
  }
  return mask;
}

/** 머리카락만 잘라 낸 그림 (부메랑). 못 찾으면 null */
export function hairTuft(frame: HTMLCanvasElement): HTMLCanvasElement | null {
  const m = tuftMask(frame);
  const w = frame.width;
  let x0 = w;
  let x1 = -1;
  let y0 = frame.height;
  let y1 = -1;
  for (let i = 0; i < m.length; i++) {
    if (!m[i]) continue;
    const x = i % w;
    const y = Math.floor(i / w);
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  if (x1 < 0 || y1 - y0 < 2) return null;
  const pc = new PixelCanvas(x1 - x0 + 1, y1 - y0 + 1);
  const src = frame.getContext('2d')!.getImageData(0, 0, w, frame.height);
  const out = pc.ctx.createImageData(pc.width, pc.height);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (!m[y * w + x]) continue;
      const si = (y * w + x) * 4;
      const di = ((y - y0) * pc.width + (x - x0)) * 4;
      for (let k = 0; k < 4; k++) out.data[di + k] = src.data[si + k];
    }
  pc.ctx.putImageData(out, 0, 0);
  return pc.canvas;
}

/** 머리카락이 빠진 모습 (머리카락 영역만 지움) */
export function removeHair(frame: HTMLCanvasElement): HTMLCanvasElement {
  const pc = new PixelCanvas(frame.width, frame.height);
  pc.ctx.drawImage(frame, 0, 0);
  const m = tuftMask(frame);
  const img = pc.ctx.getImageData(0, 0, frame.width, frame.height);
  for (let i = 0; i < m.length; i++) if (m[i]) img.data[i * 4 + 3] = 0;
  pc.ctx.putImageData(img, 0, 0);
  return pc.canvas;
}
