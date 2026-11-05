/**
 * 게임 전반 설정값.
 * 숫자만 바꿔도 난이도/느낌을 쉽게 조절할 수 있습니다.
 */

export const GAME_TITLE = 'GONA’s Food Adventure';

/** 화면(논리 해상도). 픽셀이 큼직하게 보이도록 낮은 해상도로 그린 뒤 확대합니다. */
export const VIEW = {
  /** 가로 모드 기준 높이 */
  baseHeight: 160,
  /** 세로 모드 기준 너비 (작을수록 화면이 더 확대됨) */
  baseWidth: 168,
  minWidth: 200,
  maxWidth: 360,
  minHeight: 160,
  maxHeight: 380,
  /** 화면 아래에서 땅 윗면까지의 높이 */
  groundHeight: 30,
  /** 공룡의 화면상 x 위치 (가로 화면) */
  playerX: 52,
  /** 세로 화면: 폭이 좁은 만큼 공룡을 왼쪽으로 붙여 앞이 더 보이게 */
  portraitPlayerX: 36,
  /** 세로 화면: 지면 높이 (화면 위에서부터의 비율, 0.72 = 72%) */
  portraitGroundRatio: 0.72,
  /** 세로 화면: 더블 점프 최고점 위로 남겨 둘 여백 (점수·하트 자리) */
  portraitTopMargin: 24,
  /**
   * 내부 렌더링 배율. 논리 해상도(위 값들)를 이 배수로 그려서
   * 캐릭터를 1.2배처럼 정수가 아닌 배율로 키우거나 회전·찌그러뜨려도 도트가 빠지지 않게 합니다.
   * (1.2 × 5 = 6 → 원본 도트 1칸 = 정확히 6픽셀)
   */
  renderScale: 5,
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

/**
 * 간식 이미지 (public 폴더 기준). 파일이 없으면 코드로 그린 기본 간식을 사용.
 * 현재 파일은 tools/build_snack_sprites.py 가 art-src/baby-dino 원본에서 만든 17×17 도트입니다.
 * 점수·등장 빈도·충돌 크기는 이미지와 상관없이 그대로입니다.
 */
export const SNACK_ASSETS: Record<SnackKind, string> = {
  strawberry: 'assets/snacks/strawberry.png',
  banana: 'assets/snacks/banana.png',
  cookie: 'assets/snacks/cookie.png',
};

/**
 * 게임 플레이 배경 이미지 (없으면 코드로 그린 버섯숲 배경 사용).
 * game-bg-loop.png 는 tools/build_game_bg.py 가 원본 16:9 배경(640x360)에
 *   - 오른쪽 끝과 왼쪽 끝을 잇는 '연결 구간'(원본 조각을 픽셀 단위로 이어 붙임)과
 *   - 위쪽 숲 지붕(extraTop 줄)을 더해 끊김 없이 반복되게 만든 772x460 이미지입니다.
 */
export const GAME_BG = {
  url: 'assets/game/game-bg-loop.png',
  /** 이미지에서 게임 지면과 맞닿을 줄(px, 위에서부터). 이 줄이 게임 땅 윗면에 오도록 맞춤 (원본 300줄 + 숲 지붕 100줄) */
  groundRow: 400,
  /** 위쪽에 덧붙인 숲 지붕 높이 (가로 화면에서는 화면 위로 숨음) */
  extraTop: 100,
  /** 세로 화면 배경 배율 (작을수록 숲이 넓게 보임). 화면 위가 비지 않도록 최소값은 자동 보정 */
  portraitScale: 0.52,
  /** 땅 대비 배경 이동 속도 (패럴랙스) */
  scroll: 0.3,
  /** 공룡·간식이 묻히지 않도록 배경 위에 얹는 옅은 안개 (0 = 없음) */
  haze: 0.3,
  hazeColor: 0xeef6ec,
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
 *   0 대기 · 1~4 달리기 · 5 점프 · 6 눈 감기(대기) · 7 기쁨(간식) · 8 놀람(충돌)
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
  /** 간식 먹을 때 기쁨 프레임 (-1 이면 사용 안 함) */
  happyFrame: 7,
  /** 바위에 부딪힐 때 놀람 프레임 (-1 이면 사용 안 함) */
  surprisedFrame: 8,
  /** 표정 유지 시간(ms) */
  happyMs: 400,
  surprisedMs: 500,
  /** 화면에 표시할 캐릭터 높이(px, 논리 해상도 기준). 큰 이미지도 이 크기로 맞춰집니다. (displayScale 이 없을 때) */
  displayHeight: 34,
  /**
   * 게임 중 캐릭터 확대 배율 (이미지 해상도는 그대로). 1.2 = 20% 크게.
   * VIEW.renderScale 과 곱해서 정수가 되는 값을 쓰면 도트가 고르게 보입니다. (1.2×5=6)
   */
  displayScale: 1.2 as number | null,
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
