/**
 * 게임 전반 설정값.
 * 숫자만 바꿔도 난이도/느낌을 쉽게 조절할 수 있습니다.
 */

export const GAME_TITLE = 'GONA’s Food Adventure';

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
  /** 충돌 박스 크기 (논리 px). 캐릭터 그림 크기와 상관없이 난이도가 같도록 고정 */
  hitboxWidth: 11,
  hitboxHeight: 19,
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
 *   한 장짜리 이미지도 OK      ← frameCount: 1 (달릴 때 통통 튀는 효과로 대체)
 *
 * 현재 dino.png 는 tools/build_dino_sheet.py 가 원본(art-src/baby-dino)에서 만든
 * 27×34px 프레임 9장짜리 시트입니다:
 *   0 대기 · 1~4 달리기 · 5 점프 · 6 눈 감기(대기) · 7 기쁨 · 8 놀람
 */
export const CHARACTER_ASSET = {
  /** public 폴더 기준 경로. 빈 문자열이면 기본 캐릭터만 사용 */
  url: 'assets/character/dino.png',
  /** 시트에 가로로 들어 있는 프레임 수 */
  frameCount: 9,
  /** 달리기 애니메이션에 쓸 프레임 번호 (없는 번호는 자동으로 무시) */
  runFrames: [1, 2, 3, 4],
  /** 점프 프레임 번호 (없으면 0번 사용) */
  jumpFrame: 5,
  /** 대기 프레임 번호 (타이틀·일시정지) */
  idleFrame: 0,
  runFps: 10,
  /** 타이틀 화면에서 보여줄 프레임 번호 */
  titleFrame: 0,
  /** 눈 깜빡임 프레임 번호 (-1 이면 사용 안 함, 통통 뛰는 효과만) */
  blinkFrame: 6,
  /** 화면에 표시할 캐릭터 높이(px, 논리 해상도 기준). 큰 이미지도 이 크기로 맞춰집니다. */
  displayHeight: 34,
};

/**
 * ───────────── 타이틀(오프닝) 화면 이미지 교체 설정 ─────────────
 *
 * 레이어 구성 (아래 → 위):
 *   1. 배경        public/assets/title/title-bg.png  (없으면 코드로 그린 버섯숲)
 *   2. 앞 장식     public/assets/title/title-fg.png  (선택, 투명 PNG · 살랑살랑 흔들림)
 *   3. 캐릭터      public/assets/character/dino.png (없으면 기본 공룡)
 *   4. 제목 로고   public/assets/title/logo.png     (선택, 없으면 글자 로고)
 *   5. 시작 버튼   HTML 버튼
 *
 * 배경 그림은 화면 비율과 상관없이 잘리지 않도록 전체가 보이게 맞추고,
 * 남는 여백은 그림 위/아래 가장자리 색으로 자연스럽게 채웁니다.
 * title-fg.png 는 title-bg.png 와 같은 크기로 만들어 주세요.
 */
export const TITLE_ASSETS = {
  background: 'assets/title/title-bg.png',
  foreground: 'assets/title/title-fg.png',
  logo: 'assets/title/logo.png',
};

/** 타이틀 배경 위 캐릭터 위치 (배경 그림 크기에 대한 비율, 0~1) */
export const TITLE_LAYOUT = {
  /** 캐릭터 가로 중심 */
  characterX: 0.5,
  /** 캐릭터 발이 닿는 높이 (배경 그림의 땅 위치에 맞춰 조절) */
  characterGroundY: 0.83,
  /** 캐릭터 키 (배경 높이 대비) */
  characterHeight: 0.3,
};
