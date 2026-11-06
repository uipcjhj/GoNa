/**
 * 가족 엔딩용 임시 그림 (앱 시작 때 한 번 만들어 재사용).
 *   가족 6명은 '실루엣 플레이스홀더' — 생김새를 정하지 않으려고 단색 실루엣 + 머리 모양·키만 다르게.
 *   나중에 진짜 그림(투명 PNG)으로 바꾸려면 config.ts 의 FAMILY_ASSETS 에 경로를 넣으면 됨 (README 참고).
 *   시트 규격: 가로 3프레임 [0 서 있기 · 1 손 흔들기 · 2 두 팔 벌리기], 프레임 24x32(권장), 발이 맨 아래 줄, 왼쪽(고나 쪽)을 봄.
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
export const FAMILY_FRAME = { w: 24, h: 32 };

interface Shape {
  /** 발에서 머리 꼭대기까지 */
  tall: number;
  /** 어깨 폭(반) */
  sh: number;
  hair: 'short' | 'long' | 'pony' | 'spiky' | 'bun' | 'cap';
  skirt?: boolean;
  cane?: boolean;
  hunch?: number;
  color: string;
}

const SHAPES: Record<FamilyId, Shape> = {
  mom: { tall: 28, sh: 4, hair: 'long', skirt: true, color: '#6e5a86' },
  dad: { tall: 31, sh: 5, hair: 'short', color: '#5a5078' },
  aunt: { tall: 27, sh: 4, hair: 'pony', skirt: true, color: '#7a5f8a' },
  uncle: { tall: 30, sh: 5, hair: 'spiky', color: '#5e5a80' },
  grandma: { tall: 24, sh: 4, hair: 'bun', skirt: true, hunch: 1, color: '#7a6888' },
  grandpa: { tall: 25, sh: 4, hair: 'cap', cane: true, hunch: 1, color: '#665c7e' },
};

export function familySheet(id: FamilyId): HTMLCanvasElement {
  const { w, h } = FAMILY_FRAME;
  const s = SHAPES[id];
  const pc = new PixelCanvas(w * 3, h);
  const C = s.color;
  const RIM = '#f6d7a0'; // 노을빛 테두리 한 줄 (실루엣이 배경에 묻히지 않게)
  for (let f = 0; f < 3; f++) {
    const cx = f * w + 12 - (s.hunch ?? 0);
    const foot = h - 1;
    const top = foot - s.tall + 1;
    const headR = 3;
    const headY = top + headR;
    const neck = headY + headR;
    const hip = neck + Math.round((foot - neck) * 0.48);
    // 다리
    pc.rect(cx - 3, hip, 2, foot - hip + 1, C);
    pc.rect(cx + 1, hip, 2, foot - hip + 1, C);
    // 몸통 (치마면 아래로 넓게)
    pc.rect(cx - s.sh + 1, neck + 1, (s.sh - 1) * 2, hip - neck, C);
    if (s.skirt) for (let y = hip - 2; y < hip + 4; y++) pc.rect(cx - s.sh + 1 - Math.floor((y - hip + 2) / 2), y, (s.sh - 1) * 2 + Math.floor((y - hip + 2) / 2) * 2, 1, C);
    // 머리
    pc.disc(cx, headY, headR, C);
    // 머리 모양
    if (s.hair === 'long') pc.rect(cx + 1, headY - 1, 3, 7, C);
    if (s.hair === 'pony') {
      pc.rect(cx + 3, headY - 2, 2, 2, C);
      pc.rect(cx + 4, headY, 2, 4, C);
    }
    if (s.hair === 'spiky') for (const dx of [-2, 0, 2]) pc.px(cx + dx, top - 1, C);
    if (s.hair === 'bun') pc.disc(cx + 1, top - 1, 1.5, C);
    if (s.hair === 'cap') pc.rect(cx - 4, top + 1, 6, 1, C);
    // 팔: 0 내림 · 1 한 손 흔들기 · 2 두 팔 벌리기
    const shY = neck + 1;
    const L = cx - s.sh;
    const R = cx + s.sh - 1;
    if (f === 0) {
      pc.rect(L, shY, 1, 8, C);
      pc.rect(R, shY, 1, 8, C);
    } else if (f === 1) {
      pc.rect(R, shY, 1, 8, C);
      for (let i = 0; i < 6; i++) pc.px(L - Math.min(2, Math.floor(i / 2)), shY - i, C);
      pc.rect(L - 3, shY - 7, 2, 2, C); // 흔드는 손
    } else {
      for (let i = 0; i < 6; i++) {
        pc.px(L - i, shY + 1 - Math.floor(i / 2), C);
        pc.px(R + i, shY + 1 - Math.floor(i / 2), C);
      }
    }
    if (s.cane) pc.rect(R + 2, hip - 1, 1, foot - hip + 2, '#8a6a4a');
  }
  pc.outline(RIM);
  return pc.canvas;
}

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
