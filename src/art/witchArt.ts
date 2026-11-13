/**
 * 최종 보스 '이유식 드래곤 셰프 마녀' 도트 그림 (코드로 그림 — 다른 보스와 같은 픽셀 밀도·두꺼운 외곽선·적은 색)
 *   확정 디자인 레퍼런스: 넓고 동그란 이마 · 높게 묶은 검은 포니테일(빨간 머리끈) · 작은 눈·간사한 웃음 · 분홍 볼
 *   · 커다란 하얀 요리사 모자 · 보라 박쥐 날개 · 짧고 통통한 보라 드래곤 몸(크림색 배) · 작은 발톱 · 노란 가시 꼬리
 *   · 보라 스카프 리본 · 썩은 초록 이유식이 묻은 숟가락.  왼쪽(고나 쪽)을 바라봄.
 *
 * 시트 (WITCH_FRAME 크기 프레임 9장 가로):
 *   0 공중 대기 · 1 날갯짓(날개 위) · 2 숟가락 들기(공격 준비) · 3 분노(보라 눈빛·날개 크게) · 4 피격/어지러움(눈 질끈)
 *   5 간사한 웃음 · 6 팔 뻗기(숟가락 없는 팔 — 늘어나는 팔은 따로) · 7 회오리(날개 접고 숟가락 휘두름) · 8 패배(날개 축·모자 삐뚤·주저앉음)
 * 따로: 늘어나는 팔(가로로 반복) · 숟가락 머리 · 이유식 폭탄 · 장판 · 거대 냄비 · 보라 연기 · 낙하 예고 고리
 */
import { PixelCanvas } from './PixelCanvas';

export const WITCH_FRAME = { w: 68, h: 62 };
/** 정식 스프라이트 시트(public/assets/boss/witch-sheet.png — 확정 레퍼런스에서 추출)의 프레임 수 */
export const WITCH_SHEET_FRAMES = 10;

const C = {
  line: '#2a1236',
  skin: '#f6dfa4',
  skinSh: '#e8c47e',
  hair: '#3a2433',
  hairHi: '#5e3d50',
  tie: '#e2404a',
  hat: '#fffaf0',
  hatSh: '#e3d6c3',
  body: '#8a45c4',
  bodySh: '#6a2fa0',
  bodyHi: '#a96ae0',
  belly: '#f3e2c0',
  bellySh: '#d9c49a',
  wing: '#b45ad8',
  wingDk: '#7a2fa6',
  bone: '#55207c',
  bow: '#b552e8',
  bowDk: '#7e2fb0',
  spike: '#ffd23a',
  claw: '#ffffff',
  cheek: '#ff9fb4',
  mouth: '#7a1a2a',
  tongue: '#ff7f96',
  eye: '#1c0f18',
  glow: '#e07bff',
  glowHi: '#ffffff',
  spoon: '#d6dae3',
  spoonSh: '#9aa0ad',
  goo: '#a3e04a',
  gooDk: '#6fae2a',
  gooHi: '#e2ff9a',
};

type Wing = 'mid' | 'up' | 'spread' | 'droop' | 'fold';
type Eyes = 'sly' | 'laugh' | 'angry' | 'closed';
type Spoon = 'down' | 'up' | 'none' | 'swing';
interface Opt {
  wing: Wing;
  eyes: Eyes;
  spoon: Spoon;
  mouth: 'smirk' | 'open' | 'pout';
  /** 몸 전체를 위아래로 (날갯짓 통통) */
  dy?: number;
  /** 패배: 주저앉음 + 모자 삐뚤 */
  defeat?: boolean;
}

function ellipse(pc: PixelCanvas, cx: number, cy: number, rx: number, ry: number, color: string): void {
  for (let y = -ry; y <= ry; y++) {
    for (let x = -rx; x <= rx; x++) {
      if ((x * x) / (rx * rx + 0.6) + (y * y) / (ry * ry + 0.6) <= 1) pc.px(cx + x, cy + y, color);
    }
  }
}

/** 다각형 채우기 (짝수-홀수 규칙) */
function poly(pc: PixelCanvas, pts: [number, number][], color: string): void {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
    for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if (yi > y + 0.5 !== yj > y + 0.5 && x + 0.5 < ((xj - xi) * (y + 0.5 - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) pc.px(x, y, color);
    }
  }
}

function line(pc: PixelCanvas, x0: number, y0: number, x1: number, y1: number, color: string): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) pc.px(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), color);
}

/** 박쥐 날개 하나 (side -1 = 왼쪽, 1 = 오른쪽) — 뼈 3개 + 아래 물결 가장자리 */
function wing(pc: PixelCanvas, side: -1 | 1, kind: Wing, dy: number): void {
  const root: [number, number] = [side < 0 ? 24 : 40, 30 + dy];
  // 날개 끝 위치 (모양별)
  const lift = kind === 'up' ? -9 : kind === 'spread' ? -6 : kind === 'droop' ? 9 : kind === 'fold' ? 2 : 0;
  const span = kind === 'spread' ? 30 : kind === 'fold' ? 12 : kind === 'droop' ? 20 : 25;
  const tip: [number, number] = [root[0] + side * span, 14 + dy + lift];
  const mid1: [number, number] = [root[0] + side * span * 0.62, 12 + dy + lift * 0.8];
  const lowY = 40 + dy + (kind === 'droop' ? 8 : kind === 'up' ? -4 : 0);
  // 아래 물결 가장자리 점들
  const scal: [number, number][] = [];
  for (let k = 0; k <= 3; k++) {
    const t = k / 3;
    const x = tip[0] + (root[0] - tip[0]) * t;
    const y = tip[1] + 6 + (lowY - tip[1] - 6) * t;
    scal.push([x, y + (k % 2 ? 3 : 0)]);
  }
  poly(pc, [root, mid1, tip, ...scal], C.wing);
  // 안쪽 그늘
  poly(pc, [root, [root[0] + side * span * 0.35, 20 + dy + lift * 0.5], [root[0] + side * span * 0.3, lowY - 2]], C.wingDk);
  // 뼈
  line(pc, root[0], root[1], mid1[0], mid1[1], C.bone);
  line(pc, mid1[0], mid1[1], tip[0], tip[1], C.bone);
  line(pc, mid1[0], mid1[1], scal[1][0], scal[1][1] - 2, C.bone);
  line(pc, root[0] + side * span * 0.3, 18 + dy + lift * 0.4, scal[2][0], scal[2][1] - 2, C.bone);
  // 날개 끝 갈고리
  pc.px(tip[0] + side, tip[1] - 1, C.bone);
}

function spoonHead(pc: PixelCanvas, cx: number, cy: number): void {
  ellipse(pc, cx, cy, 4, 3, C.spoon);
  ellipse(pc, cx + 1, cy + 1, 2, 1, C.spoonSh);
  // 초록 이유식 (넘쳐서 뚝뚝)
  ellipse(pc, cx, cy - 1, 3, 2, C.goo);
  pc.px(cx - 1, cy - 2, C.gooHi);
  pc.px(cx - 2, cy + 3, C.goo);
  pc.px(cx - 2, cy + 4, C.gooDk);
  pc.px(cx + 2, cy + 3, C.goo);
}

function frame(o: Opt): HTMLCanvasElement {
  const { w, h } = WITCH_FRAME;
  const pc = new PixelCanvas(w, h);
  const dy = (o.dy ?? 0) + (o.defeat ? 7 : 0);
  // ── 날개 (뒤)
  if (o.wing !== 'fold') {
    wing(pc, -1, o.wing, dy);
    wing(pc, 1, o.wing, dy);
  } else {
    wing(pc, 1, 'fold', dy);
  }
  // ── 꼬리 (오른쪽으로 말려 올라감) + 노란 가시
  for (const [x, y, r] of [[40, 50, 3], [45, 51, 3], [50, 50, 2], [54, 48, 2], [57, 45, 1]] as const) pc.disc(x, y + dy, r, C.body);
  for (const [x, y] of [[44, 47], [49, 47], [54, 45]] as const) {
    pc.px(x, y + dy, C.spike);
    pc.px(x, y + dy - 1, C.spike);
  }
  pc.px(58, 43 + dy, C.spike);
  // ── 포니테일 (머리 뒤 · 높게 묶어 오른쪽으로 휘어 내려옴)
  for (const [x, y, r] of [[43, 13, 3], [47, 12, 3], [50, 14, 3], [52, 18, 3], [53, 22, 2], [52, 26, 2], [50, 29, 2], [48, 31, 1]] as const) pc.disc(x, y + dy, r, C.hair);
  for (const [x, y] of [[46, 11], [49, 13], [51, 17], [52, 21]] as const) pc.px(x, y + dy, C.hairHi);
  // ── 몸 (짧고 통통) + 배
  ellipse(pc, 32, 43 + dy, 10, 8, C.body);
  ellipse(pc, 34, 45 + dy, 9, 6, C.bodySh);
  ellipse(pc, 31, 42 + dy, 9, 7, C.body);
  pc.px(25, 38 + dy, C.bodyHi);
  pc.px(26, 37 + dy, C.bodyHi);
  ellipse(pc, 30, 45 + dy, 5, 5, C.belly);
  for (const yy of [42, 45, 48]) pc.rect(26, yy + dy, 8, 1, C.bellySh);
  // 발 (작은 발톱)
  const fy = o.defeat ? 51 : 50;
  for (const fx of [24, 36]) {
    pc.rect(fx, fy + dy, 5, 3, C.body);
    pc.px(fx, fy + dy + 3, C.claw);
    pc.px(fx + 2, fy + dy + 3, C.claw);
    pc.px(fx + 4, fy + dy + 3, C.claw);
  }
  // ── 오른팔 (몸 옆, 작게)
  pc.disc(41, 40 + dy, 2, C.body);
  pc.disc(43, 41 + dy, 1, C.skin);
  // ── 왼팔 + 숟가락
  if (o.spoon === 'down') {
    pc.disc(21, 40 + dy, 2, C.body);
    pc.disc(18, 41 + dy, 2, C.skin);
    line(pc, 17, 42 + dy, 12, 47 + dy, C.spoonSh);
    line(pc, 18, 42 + dy, 13, 47 + dy, C.spoon);
    spoonHead(pc, 9, 50 + dy);
  } else if (o.spoon === 'up') {
    pc.disc(21, 37 + dy, 2, C.body);
    pc.disc(18, 34 + dy, 2, C.skin);
    line(pc, 17, 32 + dy, 13, 22 + dy, C.spoonSh);
    line(pc, 18, 32 + dy, 14, 22 + dy, C.spoon);
    spoonHead(pc, 12, 18 + dy);
  } else if (o.spoon === 'swing') {
    pc.disc(21, 39 + dy, 2, C.body);
    pc.disc(18, 39 + dy, 2, C.skin);
    line(pc, 16, 39 + dy, 7, 37 + dy, C.spoonSh);
    line(pc, 16, 38 + dy, 7, 36 + dy, C.spoon);
    spoonHead(pc, 5, 35 + dy);
  } else {
    // 숟가락 없음: 팔을 앞으로 (늘어나는 팔이 여기서 이어짐)
    pc.rect(13, 39 + dy, 10, 4, C.body);
    pc.disc(12, 41 + dy, 2, C.skin);
  }
  // ── 스카프 리본 (목)
  poly(pc, [[24, 32 + dy], [31, 35 + dy], [24, 38 + dy]], C.bow);
  poly(pc, [[38, 32 + dy], [31, 35 + dy], [38, 38 + dy]], C.bow);
  pc.disc(31, 35 + dy, 2, C.bowDk);
  pc.px(25, 34 + dy, C.bodyHi);
  // ── 머리: 머리카락 테두리 + 넓고 동그란 이마(살색) + 양옆 머리
  ellipse(pc, 31, 24 + dy, 14, 11, C.hair);
  // 양옆 머리 (얼굴을 감쌈 · 귀 앞으로 내려옴)
  pc.disc(19, 28 + dy, 3, C.hair);
  pc.rect(17, 22 + dy, 5, 9, C.hair);
  pc.disc(43, 27 + dy, 3, C.hair);
  pc.rect(41, 22 + dy, 5, 8, C.hair);
  pc.px(19, 24 + dy, C.hairHi);
  pc.px(43, 24 + dy, C.hairHi);
  ellipse(pc, 30, 26 + dy, 12, 9, C.skin);
  ellipse(pc, 33, 29 + dy, 9, 5, C.skinSh);
  ellipse(pc, 30, 26 + dy, 11, 7, C.skin);
  // 이마 반짝 (동그란 이마 강조)
  pc.px(24, 20 + dy, '#fff3cf');
  pc.px(25, 20 + dy, '#fff3cf');
  pc.px(24, 21 + dy, '#fff3cf');
  // 머리끈 (포니테일 뿌리)
  pc.rect(41, 13 + dy, 3, 3, C.tie);
  pc.px(41, 13 + dy, '#ff8a90');
  // ── 얼굴 (왼쪽을 봄 — 눈·입이 가운데보다 조금 왼쪽)
  const ey = 26 + dy;
  const L = 23;
  const R = 32;
  if (o.eyes === 'sly') {
    // 작은 눈 + 간사하게 찡그린 눈썹 (안쪽으로 내려감)
    pc.rect(L, ey, 3, 2, C.eye);
    pc.rect(R, ey, 3, 2, C.eye);
    pc.px(L + 1, ey, '#ffffff');
    pc.px(R + 1, ey, '#ffffff');
    line(pc, L - 1, ey - 3, L + 3, ey - 2, C.eye);
    line(pc, R + 4, ey - 3, R, ey - 2, C.eye);
  } else if (o.eyes === 'laugh') {
    // ^ ^ 눈웃음
    for (const x0 of [L, R]) {
      pc.px(x0, ey + 1, C.eye);
      pc.px(x0 + 1, ey, C.eye);
      pc.px(x0 + 2, ey + 1, C.eye);
    }
  } else if (o.eyes === 'angry') {
    // 보라색으로 빛나는 눈 + 화난 눈썹
    for (const x0 of [L, R]) {
      pc.rect(x0 - 1, ey - 1, 5, 4, C.glow);
      pc.rect(x0, ey, 3, 2, C.glowHi);
    }
    line(pc, L - 2, ey - 4, L + 3, ey - 2, C.eye);
    line(pc, R + 5, ey - 4, R, ey - 2, C.eye);
  } else {
    // 질끈 감은 눈 > <
    for (const [x0, s] of [[L, 1], [R, -1]] as const) {
      pc.px(x0 + (s > 0 ? 0 : 2), ey - 1, C.eye);
      pc.px(x0 + 1, ey, C.eye);
      pc.px(x0 + (s > 0 ? 0 : 2), ey + 1, C.eye);
      pc.px(x0 + (s > 0 ? 2 : 0), ey, C.eye);
    }
  }
  // 분홍 볼
  pc.rect(20, ey + 3, 3, 2, C.cheek);
  pc.rect(35, ey + 3, 3, 2, C.cheek);
  // 입
  const my = ey + 5;
  if (o.mouth === 'smirk') {
    line(pc, 26, my, 30, my + 1, C.mouth);
    pc.px(31, my, C.mouth);
  } else if (o.mouth === 'open') {
    pc.rect(26, my, 5, 3, C.mouth);
    pc.rect(27, my + 1, 3, 2, C.tongue);
  } else {
    line(pc, 26, my + 1, 30, my + 1, C.mouth);
    pc.px(27, my, C.mouth);
  }
  // ── 요리사 모자 (커다랗고 하얗게 · 패배 땐 삐뚤)
  const hx = o.defeat ? 5 : 0;
  const hy = o.defeat ? 2 : 0;
  pc.rect(21 + hx, 12 + dy + hy, 21, 4, C.hat);
  pc.rect(21 + hx, 15 + dy + hy, 21, 1, C.hatSh);
  for (const [x, y, r] of [[24, 8, 5], [31, 5, 6], [38, 8, 5], [28, 3, 3], [35, 3, 3]] as const) pc.disc(x + hx, y + dy + hy - (o.defeat ? (x - 24) * 0.2 : 0), r, C.hat);
  // 모자 그늘 (오른쪽 아래 몇 칸만)
  for (const [x, y] of [[41, 9], [42, 10], [40, 11], [36, 2], [37, 3]] as const) pc.px(x + hx, y + dy + hy, C.hatSh);
  pc.px(27 + hx, 4 + dy + hy, '#ffffff');
  line(pc, 27 + hx, 12 + dy + hy, 27 + hx, 9 + dy + hy, C.hatSh);
  line(pc, 34 + hx, 12 + dy + hy, 34 + hx, 9 + dy + hy, C.hatSh);
  pc.outline(C.line);
  return pc.canvas;
}

/** 보스 시트 (9장 가로) */
export function witchSheet(): { canvas: HTMLCanvasElement; fw: number; fh: number } {
  const { w, h } = WITCH_FRAME;
  const frames: Opt[] = [
    { wing: 'mid', eyes: 'sly', spoon: 'down', mouth: 'smirk' },
    { wing: 'up', eyes: 'sly', spoon: 'down', mouth: 'smirk', dy: -1 },
    { wing: 'spread', eyes: 'sly', spoon: 'up', mouth: 'open' },
    { wing: 'spread', eyes: 'angry', spoon: 'down', mouth: 'open' },
    { wing: 'mid', eyes: 'closed', spoon: 'down', mouth: 'pout' },
    { wing: 'up', eyes: 'laugh', spoon: 'down', mouth: 'open' },
    { wing: 'spread', eyes: 'sly', spoon: 'none', mouth: 'open' },
    { wing: 'fold', eyes: 'laugh', spoon: 'swing', mouth: 'open' },
    { wing: 'droop', eyes: 'closed', spoon: 'none', mouth: 'pout', defeat: true },
  ];
  const pc = new PixelCanvas(w * frames.length, h);
  frames.forEach((o, i) => pc.ctx.drawImage(frame(o), i * w, 0));
  return { canvas: pc.canvas, fw: w, fh: h };
}

/** 늘어나는 숟가락 손잡이 조각 (가로로 반복 — 레퍼런스 숟가락의 밝은 크림색 손잡이 · 외곽선 1px) 4x4 */
export function witchArm(): HTMLCanvasElement {
  const pc = new PixelCanvas(4, 4);
  pc.rect(0, 0, 4, 4, '#2a1236');
  pc.rect(0, 1, 4, 1, '#fbf3e6');
  pc.rect(0, 2, 4, 1, '#d9c9b8');
  return pc.canvas;
}

/** 숟가락 머리 (팔 끝 · 왼쪽을 향함) 18x12 */
export function witchSpoon(): HTMLCanvasElement {
  const pc = new PixelCanvas(18, 12);
  pc.disc(14, 6, 2, C.skin); // 손
  line(pc, 13, 6, 9, 6, C.spoon);
  line(pc, 13, 7, 9, 7, C.spoonSh);
  ellipse(pc, 5, 6, 4, 3, C.spoon);
  ellipse(pc, 6, 7, 2, 1, C.spoonSh);
  ellipse(pc, 5, 5, 3, 2, C.goo);
  pc.px(4, 4, C.gooHi);
  pc.px(3, 9, C.goo);
  pc.px(3, 10, C.gooDk);
  pc.outline(C.line);
  return pc.canvas;
}

/** 이유식 폭탄 (초록 덩어리) 11x11 */
export function witchGoo(): HTMLCanvasElement {
  const pc = new PixelCanvas(11, 11);
  pc.disc(5, 6, 4, C.goo);
  pc.disc(4, 3, 2, C.goo);
  pc.disc(6, 7, 3, C.gooDk);
  pc.disc(5, 6, 3, C.goo);
  pc.px(3, 4, C.gooHi);
  pc.px(4, 4, C.gooHi);
  pc.px(7, 7, C.gooDk);
  pc.outline('#2f5214');
  return pc.canvas;
}

/** 이유식 장판 (땅에 퍼진 초록) 20x6 */
export function witchPuddle(): HTMLCanvasElement {
  const pc = new PixelCanvas(20, 6);
  ellipse(pc, 10, 3, 8, 2, C.gooDk);
  ellipse(pc, 10, 3, 7, 1, C.goo);
  pc.px(5, 2, C.gooHi);
  pc.px(13, 1, C.goo);
  pc.px(13, 0, C.gooHi);
  pc.outline('#2f5214');
  return pc.canvas;
}

/** 작은 이유식 방울 5x5 */
export function witchDrop(): HTMLCanvasElement {
  const pc = new PixelCanvas(5, 6);
  pc.px(2, 0, C.goo);
  pc.rect(1, 1, 3, 2, C.goo);
  pc.rect(1, 3, 3, 2, C.gooDk);
  pc.px(1, 1, C.gooHi);
  pc.outline('#2f5214');
  return pc.canvas;
}

/** 거대한 이유식 냄비 (3페이즈) 40x30 */
export function witchPot(): HTMLCanvasElement {
  const pc = new PixelCanvas(40, 30);
  ellipse(pc, 20, 18, 17, 10, '#3d3550');
  ellipse(pc, 20, 16, 16, 9, '#58507a');
  pc.rect(4, 8, 32, 4, '#6d6596');
  ellipse(pc, 20, 9, 15, 3, C.gooDk);
  ellipse(pc, 20, 8, 13, 2, C.goo);
  for (const [x, y] of [[10, 7], [24, 6], [30, 8]] as const) {
    pc.disc(x, y, 1, C.gooHi);
  }
  pc.rect(0, 12, 4, 3, '#58507a');
  pc.rect(36, 12, 4, 3, '#58507a');
  pc.rect(10, 27, 4, 3, '#3d3550');
  pc.rect(26, 27, 4, 3, '#3d3550');
  pc.outline(C.line);
  return pc.canvas;
}

/** 보라 연기 뭉게 9x8 */
export function witchSmoke(): HTMLCanvasElement {
  const pc = new PixelCanvas(9, 8);
  pc.disc(3, 4, 3, '#b28ad6');
  pc.disc(6, 3, 2, '#c9a6ea');
  pc.disc(5, 5, 2, '#9a6cc4');
  return pc.canvas;
}

/** 땅 위 낙하 예고 고리 (초록 점선 타원) 21x7 */
export function witchTarget(): HTMLCanvasElement {
  // 공격 예고 고리 (효과): 어두운 성 바닥에서도 잘 보이게 — 반투명 빨강 바탕 + 2줄 밝은 테두리 + 가운데 표시
  const pc = new PixelCanvas(23, 9);
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 23; x++) {
      const d = ((x - 11) / 11) ** 2 + ((y - 4) / 4) ** 2;
      if (d <= 1.02 && d > 0.62) pc.px(x, y, d > 0.82 ? '#fff27a' : '#ff5a6a');
      else if (d <= 0.62) pc.px(x, y, 'rgba(255, 90, 106, 0.35)');
    }
  }
  pc.rect(10, 4, 3, 1, '#ffffff');
  pc.rect(11, 3, 1, 3, '#ffffff');
  return pc.canvas;
}
