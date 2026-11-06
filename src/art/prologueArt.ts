/**
 * 프롤로그용 도트 그림 (코드로 그림): 벚꽃나무, 뽀뽀괴물·킁카괴물 실루엣, 느낌표.
 */
import { PixelCanvas, seededRandom } from './PixelCanvas';

/** 둥글둥글한 선사시대 벚꽃나무 (도트 1칸 단위, 화면에서 3배) */
export function cherryTree(seed: number): HTMLCanvasElement {
  const W = 52;
  const H = 62;
  const pc = new PixelCanvas(W, H);
  const rnd = seededRandom(seed);
  const trunk = '#7a4a2e';
  const trunkL = '#9c6440';
  // 줄기 + 가지
  for (let y = 30; y < H; y++) {
    const w = 5 + Math.max(0, Math.round((y - 50) * 0.4));
    pc.rect(W / 2 - w / 2, y, w, 1, trunk);
    pc.px(W / 2 - w / 2 + 1, y, trunkL);
  }
  for (let i = 0; i < 9; i++) {
    pc.px(W / 2 - 3 - i, 34 - i, trunk);
    pc.px(W / 2 + 3 + i, 33 - i, trunk);
  }
  // 꽃 구름 (분홍 원 여러 개)
  const blobs = [
    [26, 18, 14],
    [13, 25, 10],
    [39, 25, 10],
    [18, 12, 9],
    [34, 11, 9],
    [26, 30, 9],
  ];
  for (const [x, y, r] of blobs) pc.disc(x, y + 1, r, '#e889a6');
  for (const [x, y, r] of blobs) pc.disc(x - 1, y, r - 1, '#f6b3c7');
  for (const [x, y, r] of blobs.slice(0, 4)) pc.disc(x - Math.round(r / 3), y - Math.round(r / 3), Math.max(2, Math.round(r / 3)), '#fde3ec');
  for (let i = 0; i < 40; i++) {
    const [x, y, r] = blobs[Math.floor(rnd() * blobs.length)];
    pc.px(x + (rnd() - 0.5) * r * 1.6, y + (rnd() - 0.5) * r * 1.6, rnd() < 0.5 ? '#ffffff' : '#d9738f');
  }
  pc.outline('#8a4a5e');
  return pc.canvas;
}

/** 뽀뽀괴물 실루엣: 커다란 몸에 두툼한 입술, 머리에 하트 뿔 */
export function kissMonster(): HTMLCanvasElement {
  const W = 46;
  const H = 54;
  const pc = new PixelCanvas(W, H);
  const body = '#2a1838';
  const rim = '#5b3a74';
  pc.disc(23, 34, 19, body);
  pc.rect(6, 34, 34, 20, body);
  // 하트 뿔
  for (const cx of [14, 32]) {
    pc.disc(cx - 2, 12, 3, body);
    pc.disc(cx + 2, 12, 3, body);
    for (let i = 0; i < 5; i++) pc.rect(cx - 4 + i, 14 + i, 9 - i * 2, 1, body);
  }
  // 테두리 빛
  for (let y = 15; y < H; y++) {
    for (let x = 1; x < W - 1; x++) {
      const c = pc.ctx.getImageData(x, y, 1, 1).data;
      const l = pc.ctx.getImageData(x - 1, y, 1, 1).data;
      if (c[3] && !l[3]) pc.px(x, y, rim);
    }
  }
  // 입술 (어두운 자홍) — 실루엣 속에서 살짝 보이게
  const lip = '#7a2a5a';
  for (let x = 13; x <= 33; x++) {
    const t = (x - 23) / 10;
    const top = Math.round(36 - (1 - t * t) * 3 + (Math.abs(t) < 0.15 ? 1 : 0));
    const bot = Math.round(40 + (1 - t * t) * 4);
    pc.rect(x, top, 1, bot - top, lip);
  }
  pc.rect(14, 39, 19, 1, '#3d1430');
  return pc.canvas;
}

/** 킁카괴물 실루엣: 커다란 코와 콧김(냄새 구름) */
export function sniffMonster(): HTMLCanvasElement {
  const W = 50;
  const H = 54;
  const pc = new PixelCanvas(W, H);
  const body = '#1f2a1e';
  const rim = '#4b6640';
  pc.disc(25, 34, 18, body);
  pc.rect(8, 34, 34, 20, body);
  // 뾰족 털
  for (let i = 0; i < 5; i++) {
    const x = 13 + i * 6;
    for (let k = 0; k < 5; k++) pc.rect(x - (4 - k) / 2, 12 + k, 5 - k, 1, body);
  }
  // 커다란 코
  pc.disc(25, 37, 7, '#3a4a30');
  pc.disc(25, 39, 6, '#2b3824');
  pc.disc(22, 41, 1, '#0f150d');
  pc.disc(28, 41, 1, '#0f150d');
  // 냄새 구름 (오른쪽 위)
  for (const [x, y, r] of [
    [42, 12, 4],
    [46, 7, 3],
    [38, 6, 3],
  ]) pc.disc(x, y, r, '#5d6b3a');
  for (let y = 15; y < H; y++) {
    for (let x = 1; x < W - 1; x++) {
      const c = pc.ctx.getImageData(x, y, 1, 1).data;
      const r2 = pc.ctx.getImageData(x + 1, y, 1, 1).data;
      if (c[3] && !r2[3]) pc.px(x, y, rim);
    }
  }
  return pc.canvas;
}

/** 빛나는 눈 한 쌍 (괴물 실루엣 위에 따로 — 어두워져도 밝게) */
export function monsterEyes(color: string): HTMLCanvasElement {
  const pc = new PixelCanvas(16, 4);
  pc.rect(0, 0, 4, 3, color);
  pc.rect(12, 0, 4, 3, color);
  pc.px(1, 0, '#ffffff');
  pc.px(13, 0, '#ffffff');
  return pc.canvas;
}

/** 느낌표 (호기심) */
export function exclaim(): HTMLCanvasElement {
  const pc = new PixelCanvas(5, 10);
  pc.rect(1, 0, 3, 6, '#ffd84a');
  pc.rect(1, 8, 3, 2, '#ffd84a');
  pc.outline('#7a4a1e');
  return pc.canvas;
}
