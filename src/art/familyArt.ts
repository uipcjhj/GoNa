/**
 * 가족 엔딩: 가족 이름·순서와 작은 효과 그림 (꽃잎·하트 등 — 앱 시작 때 한 번 만들어 재사용).
 * 가족 캐릭터 그림은 public/assets/ending/family-*.png (tools/build_family_cine.py).
 */
import { PixelCanvas } from './PixelCanvas';

export type FamilyId = 'mom' | 'dad' | 'aunt' | 'uncle' | 'grandma' | 'grandpa';

/** 왼쪽(고나가 달려오는 쪽)부터 서는 순서 */
export const FAMILY_ORDER: FamilyId[] = ['mom', 'dad', 'aunt', 'uncle', 'grandma', 'grandpa'];
export const FAMILY_NAME: Record<FamilyId, string> = {
  mom: '엄마',
  dad: '아빠',
  aunt: '이모',
  uncle: '삼촌',
  grandma: '할머니',
  grandpa: '할아버지',
};
/** 꽃잎 3x3 (분홍·노랑 두 장) */
export function petalSheet(): HTMLCanvasElement {
  const pc = new PixelCanvas(6, 3);
  pc.rect(0, 1, 3, 1, '#ffb3cf');
  pc.px(1, 0, '#ffd6e6');
  pc.px(1, 2, '#ff8fb8');
  pc.rect(3, 1, 3, 1, '#ffe38a');
  pc.px(4, 0, '#fff3c0');
  pc.px(4, 2, '#f2c24a');
  return pc.canvas;
}

/** 햇살 줄기 (비스듬한 반투명 띠) 64x96 — 화면에 크게 늘려 씀 */
export function sunRays(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 96;
  const g = c.getContext('2d')!;
  for (const [x0, wd, a] of [[4, 6, 0.4], [18, 10, 0.3], [36, 5, 0.42], [48, 8, 0.28]] as const) {
    g.fillStyle = `rgba(255, 244, 200, ${a})`;
    g.beginPath();
    g.moveTo(x0, 0);
    g.lineTo(x0 + wd, 0);
    g.lineTo(x0 + wd + 30, 96);
    g.lineTo(x0 + 30 - wd, 96);
    g.closePath();
    g.fill();
  }
  return c;
}

/** 노을 하늘 (위 보라 → 주황 → 분홍) 띠 텍스처 1x64 — 세로로 늘려 화면에 덮음 */
export function sunsetSky(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 64;
  const g = c.getContext('2d')!;
  const cols = ['#4a3a78', '#7a4a8a', '#b8587a', '#e8785a', '#f6a050', '#ffc870', '#ffe0a0', '#ffe8b8'];
  cols.forEach((col, i) => {
    g.fillStyle = col;
    g.fillRect(0, i * 8, 1, 8);
  });
  return c;
}

/** 추억 말풍선 (둥근 흰 판) 은 Graphics 로 그림 — 여기선 작은 하트 5x5 (포옹 때 퐁퐁) */
export function tinyHeart(): HTMLCanvasElement {
  const pc = new PixelCanvas(7, 6);
  pc.rect(1, 1, 2, 2, '#ff6f9a');
  pc.rect(4, 1, 2, 2, '#ff6f9a');
  pc.rect(1, 2, 5, 2, '#ff6f9a');
  pc.rect(2, 4, 3, 1, '#ff6f9a');
  pc.px(3, 5, '#ff6f9a');
  pc.px(2, 1, '#ffd0de');
  pc.outline('#8a2a4a');
  return pc.canvas;
}
