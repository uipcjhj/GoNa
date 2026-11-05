/**
 * 게임 전반 설정값.
 * 숫자만 바꿔도 난이도/느낌을 쉽게 조절할 수 있습니다.
 */

export const GAME_TITLE = '우리애기 공룡의 간식 대모험';

/** 화면(논리 해상도). 픽셀이 큼직하게 보이도록 낮은 해상도로 그린 뒤 확대합니다. */
export const VIEW = {
  /** 가로 모드 기준 높이 */
  baseHeight: 160,
  /** 세로 모드 기준 너비 */
  baseWidth: 200,
  minWidth: 200,
  maxWidth: 360,
  minHeight: 160,
  maxHeight: 380,
  /** 화면 아래에서 땅 윗면까지의 높이 */
  groundHeight: 30,
  /** 공룡의 화면상 x 위치 */
  playerX: 52,
};

export const PHYSICS = {
  gravity: 980,
  jumpVelocity: 330,
  doubleJumpVelocity: 290,
  /** 착지 직전에 누른 터치를 기억해 두는 시간(ms) */
  jumpBuffer: 130,
};

export const SPEED = {
  start: 110,
  max: 215,
  /** 초당 증가량 */
  accel: 2.2,
};

export const PLAYER = {
  maxHearts: 3,
  /** 피격 후 무적 시간(ms) */
  invincibleMs: 1300,
};

export type SnackKind = 'strawberry' | 'banana' | 'cookie';

export const SNACKS: Record<SnackKind, { points: number; label: string }> = {
  strawberry: { points: 10, label: '딸기' },
  banana: { points: 20, label: '바나나' },
  cookie: { points: 30, label: '쿠키' },
};

export const STORAGE_KEYS = {
  best: 'dino-snack-adventure.best',
  muted: 'dino-snack-adventure.muted',
};

/**
 * ───────────── 캐릭터 이미지 교체 설정 ─────────────
 *
 * public/assets/character/dino.png 파일을 넣으면 자동으로 그 이미지를 사용합니다.
 * 파일이 없으면 코드로 그린 기본 도트 캐릭터가 나옵니다.
 *
 * 이미지 형식: 프레임을 가로로 나란히 이어 붙인 PNG (크기 자유, 배경 투명)
 *   [달리기1][달리기2][점프]   ← frameCount: 3
 *   한 장짜리 이미지도 OK      ← frameCount: 1 (달릴 때 통통 튀는 효과로 대체)
 */
export const CHARACTER_ASSET = {
  /** public 폴더 기준 경로. 빈 문자열이면 기본 캐릭터만 사용 */
  url: 'assets/character/dino.png',
  /** 시트에 가로로 들어 있는 프레임 수 */
  frameCount: 3,
  /** 달리기 애니메이션에 쓸 프레임 번호 (없는 번호는 자동으로 무시) */
  runFrames: [0, 1],
  /** 점프 프레임 번호 (없으면 0번 사용) */
  jumpFrame: 2,
  runFps: 9,
  /** 화면에 표시할 캐릭터 높이(px, 논리 해상도 기준). 큰 이미지도 이 크기로 맞춰집니다. */
  displayHeight: 24,
};
