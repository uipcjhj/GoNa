/**
 * 일반 몬스터 임시 도트 (정식 PNG 가 들어오면 MONSTER_ASSETS 로 자동 교체 — src/game/monsters.ts)
 *   안경잽이몹: 커다란 동그란 안경, 잘난 척하는 표정, 짧은 다리 — 프레임 0 걷기 · 1 걷기(발 바꿈) · 2 안경 반짝(발사 직전)
 *   배불뚝이 아저씨몹(예전 방구할배몹): 볼록 나온 배 · 짧은 머리 · 처진 눈 · 작은 콧수염 — 프레임 0·1 뒤뚱 걷기(배 출렁) · 2 엉덩이 뒤로 쑥(방귀 직전)
 * 모두 왼쪽(고나 쪽)을 바라봄.
 */
import { PixelCanvas } from './PixelCanvas';

export const GLASSES_FRAME = { w: 20, h: 20 };
export const FARTER_FRAME = { w: 24, h: 24 };

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

/**
 * 배불뚝이 아저씨몹 (40~50대 · 볼록 나온 배 · 짧은 머리 + 정수리 살짝 벗겨짐 · 처진 눈 · 작은 콧수염 · 런닝셔츠)
 *   프레임 0·1 = 뒤뚱 걷기 (배가 통통 · 발 바꿈) · 2 = 멈춰서 엉덩이를 뒤로 쑥 (방귀 직전)
 *   왼쪽(고나 쪽)을 바라봄. 지팡이·흰 수염·굽은 허리 없음.
 */
/** 프레임: 0·1 걷기 · 2 엉덩이 뒤로 쭉 · 3 엉덩이 씰룩(위로 한 칸) · 4 능청스러운 만족 표정 */
function uncleFrame(f: 0 | 1 | 2 | 3 | 4): HTMLCanvasElement {
  const { w, h } = FARTER_FRAME;
  const pc = new PixelCanvas(w, h);
  const butt = f === 2 || f === 3;
  const bounce = f === 1 ? 1 : 0; // 걸을 때 배가 출렁
  const lean = butt ? 1 : 0; // 엉덩이 내밀 때 몸을 앞으로 살짝
  const SKIN = '#f2c79a';
  const SKIN_D = '#dca476';
  const SHIRT = '#f6f2e6';
  const SHIRT_D = '#d6cdb8';
  const PANTS = '#5d6f9e';
  const PANTS_D = '#46557c';
  const HAIR = '#4a3426';
  const DARK = '#3a2418';
  // 다리 (짧고 통통) + 신발
  const step = f === 1 ? 1 : butt || f === 4 ? 0 : -1;
  pc.rect(8 + step, 19, 4, 3, PANTS);
  pc.rect(13 - step, 19, 4, 3, PANTS_D);
  pc.rect(7 + step, 22, 5, 1, '#6b4a2e');
  pc.rect(13 - step, 22, 5, 1, '#6b4a2e');
  // 엉덩이 (2: 뒤로 쭉 · 3: 씰룩 — 한 칸 위·뒤로)
  if (butt) {
    const wig = f === 3 ? 1 : 0;
    pc.disc(18 + wig, 16 - wig, 4, PANTS);
    pc.disc(19 + wig, 15 - wig, 2, '#7487b8');
  }
  // 바지 허리 (배 아래 띠)
  pc.rect(6, 17 + bounce, 12, 3, PANTS);
  pc.rect(6, 17 + bounce, 12, 1, '#3c4a6c');
  // 뒤쪽 팔 (몸 오른쪽, 살색)
  pc.rect(16 - lean, 10 + bounce, 2, 5, SKIN_D);
  // 배 (앞=왼쪽으로 볼록) — 런닝셔츠
  pc.disc(12 - lean, 13 + bounce, 5, SHIRT);
  pc.disc(9 - lean, 14 + bounce, 5, SHIRT);
  pc.disc(8 - lean, 13 + bounce, 2, '#ffffff'); // 배 하이라이트
  pc.rect(5 - lean, 17 + bounce, 4, 1, SHIRT_D); // 배 아래 그늘
  pc.px(7 - lean, 15 + bounce, SHIRT_D); // 배꼽
  // 런닝셔츠 어깨끈
  pc.rect(10 - lean, 8 + bounce, 1, 2, SHIRT);
  pc.rect(13 - lean, 8 + bounce, 1, 2, SHIRT);
  // 앞 팔 (배 옆에 툭)
  pc.rect(13 - lean, 11 + bounce, 2, 4, SKIN);
  pc.px(13 - lean, 15 + bounce, SKIN_D);
  // 머리 (조금 크게, 앞으로 살짝)
  const hx = 10 - lean * 2;
  const hy = 5 + lean;
  pc.disc(hx, hy, 5, SKIN);
  pc.rect(hx - 4, hy + 3, 7, 2, SKIN); // 턱살 (후덕)
  // 짧은 머리 (뒤·옆) + 정수리는 살짝 벗겨짐
  pc.rect(hx + 2, hy - 4, 3, 3, HAIR);
  pc.rect(hx + 4, hy - 1, 1, 3, HAIR);
  pc.px(hx - 3, hy - 4, HAIR);
  pc.px(hx - 2, hy - 5, HAIR);
  pc.px(hx + 1, hy - 5, HAIR);
  pc.rect(hx - 1, hy - 5, 2, 1, '#fbe3c4'); // 반짝 정수리
  // 귀
  pc.px(hx + 3, hy + 1, SKIN_D);
  // 처진 눈 (눈꺼풀이 바깥쪽으로 처짐) — 엉덩이 내밀 땐 질끈, 뀐 뒤엔 만족스러운 ^ 눈
  if (butt) {
    pc.rect(hx - 3, hy, 3, 1, DARK);
  } else if (f === 4) {
    pc.px(hx - 3, hy, DARK);
    pc.px(hx - 2, hy - 1, DARK);
    pc.px(hx - 1, hy, DARK);
  } else {
    pc.rect(hx - 3, hy - 1, 3, 1, SKIN_D);
    pc.px(hx - 2, hy, DARK);
    pc.px(hx - 1, hy, DARK);
  }
  // 코 · 볼 · 작은 콧수염 · 능청스러운 입
  pc.rect(hx - 5, hy + 1, 2, 2, SKIN_D);
  pc.px(hx, hy + 2, '#f0a080');
  pc.rect(hx - 4, hy + 3, 3, 1, HAIR);
  if (f === 4) {
    // 능청스럽게 씨익
    pc.rect(hx - 4, hy + 4, 4, 1, '#b0504a');
    pc.px(hx, hy + 3, '#b0504a');
    pc.px(hx - 1, hy + 2, '#f08a70');
  } else {
    pc.rect(hx - 3, hy + 4, 2, 1, '#b0504a');
  }
  pc.outline(DARK);
  return pc.canvas;
}

/** 시트 (프레임 3장 가로) */
export function monsterSheet(kind: 'glasses' | 'farter'): { canvas: HTMLCanvasElement; fw: number; fh: number } {
  const f = kind === 'glasses' ? GLASSES_FRAME : FARTER_FRAME;
  const n = kind === 'glasses' ? 3 : 5;
  const pc = new PixelCanvas(f.w * n, f.h);
  for (let i = 0; i < n; i++) pc.ctx.drawImage(kind === 'glasses' ? glassesFrame(i as 0 | 1 | 2) : uncleFrame(i as 0 | 1 | 2 | 3 | 4), i * f.w, 0);
  return { canvas: pc.canvas, fw: f.w, fh: f.h };
}

/**
 * 안경잽이몹 보라색 물약 플라스크 12x15 — 삼각 플라스크(넓은 밑면·좁은 목) + 유리 테두리 + 코르크 + 보라 물약 + 작은 독 표시
 * 3프레임: 물약 거품이 보글보글 (위치가 바뀜). 코믹한 판타지 물약.
 */
export const FLASK_FRAME = { w: 12, h: 16 };
export function flaskSheet(): HTMLCanvasElement {
  const { w, h } = FLASK_FRAME;
  const pc = new PixelCanvas(w * 3, h);
  const GL = '#e8f4ff'; // 유리
  const LQ = '#9b4dff'; // 보라 물약
  const LQ2 = '#c38bff';
  const LQ3 = '#6a2ad0';
  const bubbles = [
    [[5, 9], [7, 6], [6, 3]],
    [[6, 8], [4, 10], [5, 4]],
    [[7, 9], [5, 7], [6, 2]],
  ];
  for (let f = 0; f < 3; f++) {
    const ox = f * w;
    // 코르크
    pc.rect(ox + 4, 0, 4, 2, '#b07a3a');
    pc.px(ox + 5, 0, '#d8a060');
    // 목 (좁음)
    pc.rect(ox + 4, 2, 4, 4, GL);
    // 몸통 (아래로 넓어지는 삼각)
    for (let y = 6; y < 15; y++) {
      const half = Math.min(5, 2 + Math.floor(((y - 6) / 7) * 4));
      pc.rect(ox + 6 - half, y, half * 2, 1, y >= 8 ? LQ : GL);
    }
    // 물약 명암 · 바닥
    for (let y = 9; y < 14; y++) pc.px(ox + 6 - Math.min(5, 2 + Math.floor(((y - 6) / 7) * 4)) + 1, y, LQ2);
    pc.rect(ox + 1, 14, 10, 1, LQ3);
    // 유리 반짝
    pc.px(ox + 5, 3, '#ffffff');
    pc.px(ox + 4, 7, '#ffffff');
    // 작은 독 표시 (해골)
    pc.rect(ox + 5, 10, 3, 2, '#f4ecff');
    pc.px(ox + 5, 10, LQ3);
    pc.px(ox + 7, 10, LQ3);
    pc.px(ox + 5, 12, '#f4ecff');
    pc.px(ox + 7, 12, '#f4ecff');
    // 거품 (보글보글)
    for (const [bx, by] of bubbles[f]) pc.px(ox + bx, by, by < 8 ? LQ2 : '#e0c8ff');
  }
  pc.outline('#2a1a48');
  return pc.canvas;
}

/** 유리병이 '팡!' 깨짐 16x12 (2프레임: 깨지는 순간 → 조각·물약이 튐) */
export const SHATTER_FRAME = { w: 16, h: 12 };
export function shatterSheet(): HTMLCanvasElement {
  const pc = new PixelCanvas(32, 12);
  const shards: [number, number, number, number][][] = [
    [[7, 6, 2, 1], [9, 4, 1, 2], [5, 4, 1, 1], [10, 7, 1, 1], [6, 8, 2, 1]],
    [[2, 3, 2, 1], [13, 2, 1, 2], [4, 7, 1, 1], [12, 8, 2, 1], [8, 1, 1, 1]],
  ];
  shards.forEach((list, f) => {
    for (const [x, y, ww, hh] of list) pc.rect(f * 16 + x, y, ww, hh, '#e8f4ff');
    // 보라 물방울
    for (let k = 0; k < 5; k++) pc.px(f * 16 + 3 + ((k * 5 + f * 3) % 11), 5 + ((k * 3 + f) % 6), k % 2 ? '#9b4dff' : '#c38bff');
  });
  pc.outline('#2a1a48');
  return pc.canvas;
}

/** 깨진 자리에 잠깐 퍼지는 보라 물약 18x6 (2프레임: 거품 보글) */
export const PUDDLE_FRAME = { w: 18, h: 6 };
export function puddleSheet(): HTMLCanvasElement {
  const pc = new PixelCanvas(36, 6);
  for (let f = 0; f < 2; f++) {
    const ox = f * 18;
    pc.rect(ox + 2, 3, 14, 3, '#7a34e0');
    pc.rect(ox + 1, 4, 16, 2, '#7a34e0');
    pc.rect(ox + 4, 3, 8, 1, '#a868ff');
    pc.px(ox + (f ? 6 : 11), 2, '#c38bff');
    pc.px(ox + (f ? 12 : 5), 1, '#e0c8ff');
  }
  pc.outline('#2a1a48');
  return pc.canvas;
}

/** 방귀 '팡!' 충격선 14x14 (2프레임: 작게 → 크게 퍼짐) */
export const POP_FRAME = { w: 14, h: 14 };
export function popSheet(): HTMLCanvasElement {
  const pc = new PixelCanvas(28, 14);
  // 굵은 충격선 8방향 (밝은 노랑) — 1프레임 가깝게, 2프레임 멀리
  const rays: [number, number][] = [[1, 0], [0.7, 0.7], [0, 1], [-0.7, 0.7], [-1, 0], [-0.7, -0.7], [0, -1], [0.7, -0.7]];
  [2, 4].forEach((r0, f) => {
    for (const [dx, dy] of rays) {
      for (let k = 0; k < 3; k++) pc.px(Math.round(7 + dx * (r0 + k)) + f * 14, Math.round(7 + dy * (r0 + k)), k === 2 ? '#fff8c0' : '#ffe680');
    }
  });
  pc.outline('#7a6a1a');
  return pc.canvas;
}

/**
 * 방귀 구름 '더러운 공기 팡!' 26x20 — 4프레임: 0 팡(작게) · 1 부풀어 오름 · 2·3 크게 뭉게뭉게(번갈아 끓듯이)
 * 둥근 황록 구름 + 가운데 짙은 초록 음영 + 위로 피어오르는 냄새 줄(~) → 바람(흰 화살표)과 확실히 구별
 */
export const CLOUD_FRAME = { w: 26, h: 20 };
export function fartCloudSheet(): HTMLCanvasElement {
  const { w, h } = CLOUD_FRAME;
  const pc = new PixelCanvas(w * 4, h);
  const L = '#c6dc5c';
  const M = '#a8bf3c';
  const D = '#5f7a1e';
  const HI = '#eaf3b0';
  const puffs: [number, number, number][][] = [
    [[13, 14, 3], [10, 15, 2], [16, 15, 2]],
    [[9, 14, 4], [13, 12, 5], [17, 14, 4], [13, 15, 4]],
    [[7, 14, 5], [13, 11, 6], [19, 14, 5], [10, 16, 4], [16, 16, 4]],
    [[8, 13, 5], [13, 12, 6], [18, 13, 5], [11, 16, 4], [15, 16, 4]],
  ];
  puffs.forEach((list, f) => {
    const ox = f * w;
    for (const [x, y, r] of list) pc.disc(ox + x, y + 1, r, D);
    for (const [x, y, r] of list) pc.disc(ox + x, y, r, f === 0 ? M : L);
    if (f >= 1) pc.disc(ox + 13, 14, f >= 2 ? 3 : 2, M);
    if (f >= 2) pc.disc(ox + 13, 15, 2, D);
    for (const [x, y, r] of list) if (r >= 4) pc.px(ox + x - 2, y - r + 2, HI);
  });
  pc.outline('#46561a');
  // 냄새 줄 (위로 피어오르는 꼬불꼬불 ~) — 외곽선 없이 짙은 초록, 2·3 프레임은 위치를 바꿔 일렁임
  for (const f of [2, 3]) {
    const ox = f * w;
    const lift = f === 2 ? 0 : 1;
    for (const sx of [7, 13, 19]) {
      const zig = (sx + f) % 2;
      for (let k = 0; k < 4; k++) pc.px(ox + sx + ((k + zig) % 2), 4 - k - lift, D);
    }
  }
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
