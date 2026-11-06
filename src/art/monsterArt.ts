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
function uncleFrame(f: 0 | 1 | 2): HTMLCanvasElement {
  const { w, h } = FARTER_FRAME;
  const pc = new PixelCanvas(w, h);
  const bounce = f === 1 ? 1 : 0; // 걸을 때 배가 출렁
  const lean = f === 2 ? 1 : 0; // 엉덩이 내밀 때 몸을 앞으로 살짝
  const SKIN = '#f2c79a';
  const SKIN_D = '#dca476';
  const SHIRT = '#f6f2e6';
  const SHIRT_D = '#d6cdb8';
  const PANTS = '#5d6f9e';
  const PANTS_D = '#46557c';
  const HAIR = '#4a3426';
  const DARK = '#3a2418';
  // 다리 (짧고 통통) + 신발
  const step = f === 1 ? 1 : f === 2 ? 0 : -1;
  pc.rect(8 + step, 19, 4, 3, PANTS);
  pc.rect(13 - step, 19, 4, 3, PANTS_D);
  pc.rect(7 + step, 22, 5, 1, '#6b4a2e');
  pc.rect(13 - step, 22, 5, 1, '#6b4a2e');
  // 엉덩이 (2번 프레임: 뒤로 쑥)
  if (f === 2) {
    pc.disc(18, 16, 4, PANTS);
    pc.disc(19, 15, 2, '#7487b8');
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
  // 처진 눈 (눈꺼풀이 바깥쪽으로 처짐) — 2번 프레임은 눈을 질끈(능청)
  if (f === 2) {
    pc.rect(hx - 3, hy, 3, 1, DARK);
  } else {
    pc.rect(hx - 3, hy - 1, 3, 1, SKIN_D);
    pc.px(hx - 2, hy, DARK);
    pc.px(hx - 1, hy, DARK);
  }
  // 코 · 볼 · 작은 콧수염 · 능청스러운 입
  pc.rect(hx - 5, hy + 1, 2, 2, SKIN_D);
  pc.px(hx, hy + 2, '#f0a080');
  pc.rect(hx - 4, hy + 3, 3, 1, HAIR);
  pc.rect(hx - 3, hy + 4, 2, 1, '#b0504a');
  if (f === 2) {
    // 엉덩이 쪽 '뿌' 기운 (연두 점)
    pc.px(22, 13, '#b8d850');
    pc.px(23, 16, '#9fbe3a');
  }
  pc.outline(DARK);
  return pc.canvas;
}

/** 시트 (프레임 3장 가로) */
export function monsterSheet(kind: 'glasses' | 'farter'): { canvas: HTMLCanvasElement; fw: number; fh: number } {
  const f = kind === 'glasses' ? GLASSES_FRAME : FARTER_FRAME;
  const pc = new PixelCanvas(f.w * 3, f.h);
  ([0, 1, 2] as const).forEach((i) => pc.ctx.drawImage(kind === 'glasses' ? glassesFrame(i) : uncleFrame(i), i * f.w, 0));
  return { canvas: pc.canvas, fw: f.w, fh: f.h };
}

/** 안경잽이몹 지폐 14x9 — 4프레임(앞 · 기울어짐 · 옆면 · 반대로 기울어짐)을 돌려 '빙글빙글' (회전 연산 없이 또렷) */
export const BILL_FRAME = { w: 14, h: 9 };
export function billSheet(): HTMLCanvasElement {
  const { w, h } = BILL_FRAME;
  const pc = new PixelCanvas(w * 4, h);
  const draw = (ox: number, bw: number, flip: boolean): void => {
    const x0 = ox + Math.floor((w - bw) / 2);
    if (bw <= 2) {
      pc.rect(x0, 0, bw, h, '#2f8a3a');
      pc.rect(x0, 1, 1, h - 2, '#b8f09a');
      return;
    }
    pc.rect(x0, 0, bw, h, '#1f5a2a'); // 테두리
    pc.rect(x0 + 1, 1, bw - 2, h - 2, '#7ed36a'); // 연한 초록
    pc.rect(x0 + 1, 1, bw - 2, 1, '#b8f09a'); // 위 반짝
    const cx = x0 + Math.floor(bw / 2);
    // 가운데 동그라미 + 돈 표시
    if (bw >= 8) {
      pc.rect(cx - 2, 2, 4, 5, '#3f9a44');
      pc.rect(cx - 1, 3, 2, 3, '#d8ffb0');
      pc.px(cx - 1 + (flip ? 1 : 0), 4, '#1f5a2a');
      // 모서리 장식
      pc.px(x0 + 2, 2, '#3f9a44');
      pc.px(x0 + bw - 3, h - 3, '#3f9a44');
    } else {
      pc.rect(cx - 1, 3, 2, 3, '#3f9a44');
    }
  };
  draw(0, 14, false);
  draw(w, 9, false);
  draw(w * 2, 2, false);
  draw(w * 3, 9, true);
  return pc.canvas;
}

/** 방귀 구름 '더러운 공기 팡!' 22x16 — 3프레임(팡! 작게 → 뭉게 → 크게 퍼짐), 연두·황록 */
export const CLOUD_FRAME = { w: 22, h: 16 };
export function fartCloudSheet(): HTMLCanvasElement {
  const { w, h } = CLOUD_FRAME;
  const pc = new PixelCanvas(w * 3, h);
  const L = '#c8e070'; // 연두
  const Y = '#b9c24a'; // 황록
  const D = '#8a9a32';
  const HI = '#eef7c0';
  const puffs: [number, number, number][][] = [
    [[11, 11, 3], [8, 12, 2], [14, 12, 2]],
    [[7, 11, 3], [11, 9, 4], [15, 11, 3], [11, 12, 3]],
    [[6, 11, 4], [11, 8, 5], [16, 11, 4], [9, 12, 4], [14, 12, 4]],
  ];
  puffs.forEach((list, f) => {
    const ox = f * w;
    for (const [x, y, r] of list) pc.disc(ox + x, y + 1, r, D);
    for (const [x, y, r] of list) pc.disc(ox + x, y, r, f === 1 ? Y : L);
    for (const [x, y, r] of list) if (r >= 3) pc.disc(ox + x - 1, y - 1, Math.max(1, r - 2), f === 0 ? Y : L);
    for (const [x, y, r] of list) if (r >= 3) pc.px(ox + x - 1, y - r + 1, HI);
    if (f === 0) {
      // '팡!' 튀는 조각
      pc.px(ox + 3, 7, Y);
      pc.px(ox + 18, 6, Y);
      pc.px(ox + 11, 4, L);
      pc.px(ox + 5, 4, HI);
      pc.px(ox + 17, 3, HI);
    }
  });
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
