/**
 * 게임에 쓰이는 도트 그림들 (문자열 도트맵).
 * 한 글자 = 한 픽셀, '.' = 투명.
 */
import type { Palette } from './PixelCanvas';

// ───────────────────────── 기본 캐릭터 (아기 공룡 옷 입은 아이) ─────────────────────────
// 머리 위 물방울 모양 갈색 머리카락, 동그란 얼굴, 아주 작은 이목구비, 연두색 공룡 옷

export const DINO_PALETTE: Palette = {
  k: '#3d2b22', // 외곽선
  h: '#8b5a35', // 머리카락
  H: '#c08850', // 머리카락 하이라이트
  g: '#a3db6e', // 연두색 공룡 옷
  G: '#6aab45', // 공룡 옷 그림자
  l: '#d8f5a2', // 공룡 옷 하이라이트
  o: '#f2c14e', // 등 뿔
  s: '#ffe3c8', // 피부
  p: '#f7a6a0', // 볼터치
  e: '#2a1c15', // 눈
  m: '#c9705f', // 입
  y: '#fbf0b8', // 배
};

const DINO_TOP: readonly string[] = [
  '........kk..........',
  '.......khk..........',
  '......khHhk.........',
  '......khHhk.........',
  '......khhhk.........',
  '.....kkkkkkkkk......',
  '...okgglggggggk.....',
  '...kgllgggggggGk....',
  '.okgggkkkkkkkkgGk...',
  '.kGggksssssssskgGk..',
  'okGgksssssssssskGk..',
  '.kGgkssssessseskGk..',
  'okGgkssspssssspkGk..',
  '.kGgkssssssmssskGk..',
  '.kGggksssssssskgGk..',
  '.kGgggkkkkkkkkgGk...',
  '..kGgggggyyyyggk....',
  '...kGgggyyyyyygk....',
  'kk.kGgggyyyyyygk....',
  'kGgkGgggyyyyyggk....',
  '.kkGGggggggggggk....',
  '...kGGGGGGGGGGk.....',
];

export const DINO_FRAMES: readonly (readonly string[])[] = [
  // 0: 달리기 1 (다리 벌림)
  [...DINO_TOP, '....kGGk..kGGk......', '....kkkk..kkkk......'],
  // 1: 달리기 2 (다리 모음)
  [...DINO_TOP, '......kGGkGGk.......', '......kkkkkkk.......'],
  // 2: 점프
  [...DINO_TOP, '...kGGk....kGGk.....', '...kkk.....kkk......'],
];

// ───────────────────────── 간식 ─────────────────────────

export const STRAWBERRY = {
  palette: {
    k: '#4a2228',
    G: '#5fa83e',
    g: '#8fd35a',
    r: '#ec4a52',
    R: '#b42d3c',
    w: '#ffe8a0',
    W: '#ffd6d6',
  } as Palette,
  rows: [
    '....kk....',
    '..kkGGkk..',
    '.kGGgGGGk.',
    '.krkGGkrk.',
    'krrrkkrrrk',
    'kWwrrrwrrk',
    'krrrrwrrRk',
    '.krwrrrRk.',
    '.krrrrwRk.',
    '..krrRRk..',
    '...kRRk...',
    '....kk....',
  ],
};

export const BANANA = {
  palette: {
    k: '#5a3a1c',
    b: '#7a5230',
    Y: '#ffd84a',
    y: '#e0a92e',
    L: '#fff4b0',
  } as Palette,
  rows: [
    '..........kk',
    '.........kbk',
    '........kYYk',
    '.......kYLYk',
    '......kYLYYk',
    'k...kkYLYYk.',
    'kYkkYYYYYyk.',
    '.kYYYYYYyk..',
    '..kyyyyykk..',
    '...kkkkk....',
  ],
};

export const COOKIE = {
  palette: {
    k: '#4a2c18',
    c: '#e3a35a',
    C: '#b8743a',
    d: '#5a3320',
    L: '#f6cf8a',
  } as Palette,
  rows: [
    '....kkkk....',
    '..kkccccck..',
    '.kcLLcccccC.',
    'kcLdccccdcCk',
    'kccccccccCCk',
    'kccccdcccCCk',
    'kcdccccccdCk',
    'kcccccccCCCk',
    '.kCccdcCCCk.',
    '..kkCCCCkk..',
    '....kkkk....',
  ],
};

// ───────────────────────── 장애물: 바위 ─────────────────────────

export const ROCK = {
  palette: {
    k: '#3b3530',
    q: '#9d968a',
    Q: '#cdc6b6',
    r: '#6e675e',
    g: '#7fb552',
  } as Palette,
  rows: [
    '......kkkk......',
    '....kkQQqqkk....',
    '...kQQQqqqqqk...',
    '..kQQqqqqqqqqk..',
    '..kQqqqqqqqqrk..',
    '.kqqqqqqqqqqrrk.',
    '.kqqqqqqqqqqqrk.',
    'kgqqqqqqqqqqqrrk',
    'kggqqqqqqqqqrrrk',
    'kgggqqqqqqqrrrrk',
    'krrrrrrrrrrrrrrk',
    '.kkkkkkkkkkkkkk.',
  ],
};

// ───────────────────────── UI: 하트 ─────────────────────────

export const HEART_ROWS = [
  '.kk...kk.',
  'kWRk.kRRk',
  'kRRRkRRRk',
  'kRRRRRRDk',
  '.kRRRRDk.',
  '..kRRDk..',
  '...kDk...',
  '....k....',
];

export const HEART_FULL: Palette = { k: '#4a1f24', R: '#ec4a5a', W: '#ffd0d4', D: '#b02c3e' };
export const HEART_EMPTY: Palette = { k: '#4a3a34', R: '#8f8076', W: '#b4a89c', D: '#6d5f56' };

// ───────────────────────── 이펙트 ─────────────────────────

export const SPARKLE_ROWS = ['..w..', '..y..', 'wyWyw', '..y..', '..w..'];
export const SPARKLE_PALETTE: Palette = { w: '#fff7d6', y: '#ffd96b', W: '#ffffff' };

export const DUST_ROWS = ['.dd.', 'dDDd', 'dDDd', '.dd.'];
export const DUST_PALETTE: Palette = { d: '#e8d3a8', D: '#f7ecd2' };
