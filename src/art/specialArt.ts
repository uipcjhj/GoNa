/**
 * 보스 필살기 전용 도트 (앱 시작 때 한 번 만들어 재사용 — 실행 중 이미지 처리·필터 없음)
 *   초대형 왕뽀뽀 하트 · 분홍/초록 오라 고리 · 황록 회오리(3프레임, 나뭇잎·냄새 구름이 함께 돎) · 나뭇잎 · 안전 구간 표시
 */
import { PixelCanvas } from './PixelCanvas';

/** 초대형 왕뽀뽀 하트 19x16 (게임에선 2.2배 → 일반 하트탄 9x8 의 약 4배) — 두 봉우리 + 뾰족한 아래, 반짝 하이라이트 */
export function royalHeart(): HTMLCanvasElement {
  const pc = new PixelCanvas(19, 16);
  const heart = (cx: number, top: number, s: number, color: string): void => {
    pc.disc(cx - s, top + s, s, color);
    pc.disc(cx + s, top + s, s, color);
    for (let i = 0; i <= s * 2; i++) pc.rect(cx - s * 2 + i, top + s + i, (s * 2 - i) * 2 + 1, 1, color);
  };
  heart(9, 0, 4, '#d81b60');
  heart(9, 1, 3, '#ff4f86');
  heart(9, 3, 1, '#ff7aa8');
  // 반짝 하이라이트
  pc.rect(4, 2, 2, 1, '#ffe0ec');
  pc.rect(3, 3, 1, 2, '#ffe0ec');
  pc.px(4, 3, '#ffffff');
  pc.px(12, 2, '#ffb0cc');
  pc.outline('#7a1238');
  return pc.canvas;
}

/** 오라 고리 32x32 (점선 원 + 안쪽 반짝) — 필살기 예고 때 보스 주위에서 맥박처럼 */
export function auraRing(color: string, light: string): HTMLCanvasElement {
  const pc = new PixelCanvas(32, 32);
  for (let a = 0; a < 48; a++) {
    if (a % 3 === 2) continue;
    const t = (a / 48) * Math.PI * 2;
    const x = Math.round(16 + Math.cos(t) * 14);
    const y = Math.round(16 + Math.sin(t) * 14);
    pc.rect(x - 1, y - 1, 2, 2, color);
    if (a % 6 === 0) pc.px(Math.round(16 + Math.cos(t) * 11), Math.round(16 + Math.sin(t) * 11), light);
  }
  return pc.canvas;
}

/**
 * 황록 회오리 3프레임 (각 30x40) — 위로 갈수록 넓어지는 소용돌이 띠 + 함께 도는 나뭇잎·냄새 구름.
 * 프레임마다 띠의 위상이 바뀌어 빙글빙글 도는 것처럼 보임.
 */
export const TORNADO_FRAME = { w: 36, h: 42 };
export function tornadoSheet(): HTMLCanvasElement {
  const { w, h } = TORNADO_FRAME;
  const pc = new PixelCanvas(w * 3, h);
  const L = '#d8ec7a';
  const M = '#a8c444';
  const D = '#5f7a1e';
  for (let f = 0; f < 3; f++) {
    const ox = f * w;
    // 위로 갈수록 넓어지는 고리를 층층이 — 고리마다 점선 무늬가 프레임마다 돌아감 (빙글빙글)
    for (let k = 0; k < 9; k++) {
      const y = h - 3 - k * 4.4;
      const rx = 3 + k * 1.7;
      const ry = 1.2 + k * 0.25;
      const n = Math.round(10 + rx * 2);
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2 + f * 0.7 + k * 0.5;
        const front = Math.sin(t) > 0; // 앞쪽(아래 반원)은 진하게
        if ((i + f + k) % 5 === 4) continue; // 바람결 틈
        const x = Math.round(ox + w / 2 + Math.cos(t) * rx + Math.sin(k * 1.3) * 1.5);
        const yy = Math.round(y + Math.sin(t) * ry);
        pc.rect(x, yy, 2, front ? 2 : 1, front ? (k % 2 ? M : D) : L); // 굵은 바람 띠
      }
    }
    // 함께 도는 나뭇잎 · 냄새 구름 (프레임마다 위치가 돎)
    for (let k = 0; k < 3; k++) {
      const t = (k / 3 + f / 9) * Math.PI * 2;
      const yy = 8 + k * 10;
      const r = 6 + (1 - yy / h) * 9;
      const lx = Math.round(ox + w / 2 + Math.cos(t) * r);
      pc.rect(lx, yy, 3, 2, '#4f8a2a');
      pc.px(lx + 1, yy - 1, '#7fc04a');
      const cx = Math.round(ox + w / 2 - Math.cos(t) * (r - 2));
      pc.disc(cx, yy + 5, 1, '#c6dc5c');
    }
  }
  return pc.canvas;
}

/** 나뭇잎 5x4 (빨려 들어가는 연출용) */
export function leaf(): HTMLCanvasElement {
  const pc = new PixelCanvas(6, 5);
  pc.rect(1, 1, 4, 3, '#6cb33c');
  pc.px(0, 3, '#4f8a2a');
  pc.px(5, 1, '#9fd36a');
  pc.px(2, 1, '#b8e07a');
  pc.outline('#2f5a1a');
  return pc.canvas;
}

/** 안전 구간 표시 24x12 — 초록 위 화살표 + 땅 띠 ('여기서 점프!') */
export function safeMark(): HTMLCanvasElement {
  const pc = new PixelCanvas(24, 12);
  // 위 화살표
  pc.rect(11, 3, 2, 5, '#5fe07a');
  for (let i = 0; i < 4; i++) pc.rect(11 - i, i, 2 + i * 2, 1, '#5fe07a');
  // 땅 띠 (점선)
  for (let x = 0; x < 24; x += 3) pc.rect(x, 10, 2, 2, '#5fe07a');
  pc.outline('#1f5a2a');
  return pc.canvas;
}
