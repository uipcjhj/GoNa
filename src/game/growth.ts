/**
 * 성장 시스템 — 고나가 간식을 먹으며 4단계로 자랍니다.
 *
 *   1. 갓난아기 고나   (엎드려 꼬물거림)
 *   2. 기어 다니는 고나 (네 발로 기어감)
 *   3. 직립보행 고나   (두 발로 달림 — 지금까지의 고나)
 *   4. 자이언트 곤룡 고나   (Giant Gonryong GONA · 몸집이 커진 최종 진화)
 *
 * ▸ 점수(score)와 성장 게이지(gauge)는 완전히 따로 관리합니다.
 *   간식을 먹으면 둘 다 오르지만, 서로의 값을 참조하지 않습니다.
 * ▸ 단계별 "모습"(스프라이트·애니메이션·크기)과 "판정"(충돌 박스)과 "조작"(점프 배율)을
 *   각각 따로 정의해서, 캐릭터가 커져도 충돌 판정이 저절로 바뀌지 않습니다.
 * ▸ 지금은 단계별 전용 그림이 없어 기존 도트 시트의 포즈를 조합한 '임시 애니메이션'을 씁니다.
 *   STAGE_ASSETS 의 PNG 를 넣으면 자동으로 그 그림으로 바뀝니다.
 */
import type { SnackKind } from '../config';

export type GrowthStageId = 'newborn' | 'crawler' | 'walker' | 'bigbaby';

/** 단계별 애니메이션 (프레임 번호는 스프라이트 시트 기준) */
export interface StageAnimation {
  /** 땅 위에서 반복할 프레임들 */
  run: number[];
  runFps: number;
  /** 공중에 있을 때 */
  jump: number;
  /** 일시정지 등 대기 */
  idle: number;
  /** 표정 프레임 (-1 = 이 단계에서는 표정 대신 통통 튀는 반응만) */
  happy: number;
  surprised: number;
  /** 화면 표시 배율 (VIEW.renderScale 과 곱해 정수가 되도록: 0.2 단위) */
  scale: number;
  /** 꼬물거림: 좌우로 살짝 흔들리는 각도(도)와 속도 — 0 이면 없음 */
  wiggleDeg: number;
  wiggleSpeed: number;
  /** 달릴 때 위아래 통통 (px) */
  bob: number;
}

export interface GrowthStageDef {
  id: GrowthStageId;
  /** 1부터 시작하는 단계 번호 */
  level: number;
  name: string;
  /** 영문 이름 (필요할 때만) */
  nameEn?: string;
  /** 진화 연출에 표시할 한 줄 설명 */
  description: string;
  /**
   * 다음 단계까지 필요한 성장 게이지 (null = 더 채울 게이지 없음).
   * 마지막 단계에도 값이 있으면, 가득 찼을 때 그 단계의 보스전(src/game/boss.ts atStage)이 열림.
   */
  gaugeToNext: number | null;
  /** 임시 애니메이션 (기본 dino.png 시트의 포즈 조합) */
  anim: StageAnimation;
  /**
   * 충돌 박스 (논리 px) — 그림 크기와 별개로 관리.
   * 기존 난이도를 그대로 유지하기 위해 지금은 모든 단계가 기존 값(11x19)과 같습니다.
   */
  hitbox: { width: number; height: number };
  /** 조작 차이 (추후 조정용). 1 = 기존과 동일 */
  controls: { jumpMul: number; doubleJumpMul: number; maxJumps: number };
  /** 해금 기술 (추후 구현) */
  abilities: { hairBoomerang: boolean };
  /**
   * 탈것: 'nest' 이면 고나는 둥지에 누워 있고 실제로 움직이는(점프하는) 것은 둥지.
   * 고나는 둥지 안에서 꼬물거리거나 통통 튀며 반응만 함.
   */
  vehicle?: 'nest';
}

const SAME_HITBOX = { width: 11, height: 19 };
const SAME_CONTROLS = { jumpMul: 1, doubleJumpMul: 1, maxJumps: 2 };

/**
 * 기본 dino.png 시트 프레임 (tools/build_dino_sheet.py):
 *   0 대기 · 1~4 달리기 · 5 점프 · 6 눈 감기 · 7 기쁨 · 8 놀람
 *   9 웅크리기 · 10 앉기 · 11 엎드려 눈 감기 · 12 엎드린 갓난아기
 */
export const GROWTH_STAGES: GrowthStageDef[] = [
  {
    id: 'newborn',
    level: 1,
    name: '갓난아기 고나',
    description: '둥지에서 꼬물꼬물!',
    // 성장을 충분히 즐기도록 (기존 12 → 1.5배)
    gaugeToNext: 18,
    anim: { run: [12, 12, 12, 11], runFps: 4, jump: 12, idle: 12, happy: -1, surprised: -1, scale: 1, wiggleDeg: 3, wiggleSpeed: 0.012, bob: 0 },
    // 둥지째 움직이므로 판정도 둥지+아기 모양에 맞춤 (그림 폭 약 36px · 키 약 23px)
    hitbox: { width: 18, height: 17 },
    vehicle: 'nest',
    controls: SAME_CONTROLS,
    abilities: { hairBoomerang: false },
  },
  {
    id: 'crawler',
    level: 2,
    name: '기어 다니는 고나',
    description: '네 발로 슝슝 기어가요!',
    // 2단계 → 첫 보스 (기존 20 → 2배)
    gaugeToNext: 40,
    anim: { run: [9, 10], runFps: 10, jump: 9, idle: 10, happy: -1, surprised: -1, scale: 1, wiggleDeg: 0, wiggleSpeed: 0, bob: 2 },
    hitbox: SAME_HITBOX,
    controls: SAME_CONTROLS,
    abilities: { hairBoomerang: false },
  },
  {
    id: 'walker',
    level: 3,
    name: '직립보행 고나',
    description: '두 발로 씩씩하게! 머리카락 부메랑으로 바위도 깨요',
    // 3단계 → 4단계 (기존 30 → 2배)
    gaugeToNext: 60,
    anim: { run: [1, 2, 3, 4], runFps: 10, jump: 5, idle: 0, happy: 7, surprised: 8, scale: 1.2, wiggleDeg: 0, wiggleSpeed: 0, bob: 0 },
    hitbox: SAME_HITBOX,
    controls: SAME_CONTROLS,
    abilities: { hairBoomerang: true }, // 향후: 직립보행부터 머리카락 부메랑 해금 예정
  },
  {
    id: 'bigbaby',
    level: 4,
    name: '자이언트 곤룡 고나',
    nameEn: 'Giant Gonryong GONA',
    description: '쿵쿵! 최종 진화 완료!',
    // 마지막 단계: 게이지가 가득 차면 최종 보스 킁카괴물 → 엔딩
    gaugeToNext: 60, // 4단계 → 최종 보스 (기존 30 → 2배)
    // (bigbaby.png 가 없을 때의 임시: 직립보행 포즈를 1.6배) / 있으면 전용 체형 그림, 묵직하게 통통
    anim: { run: [1, 2, 3, 4], runFps: 7, jump: 5, idle: 0, happy: 7, surprised: 8, scale: 1.6, wiggleDeg: 0, wiggleSpeed: 0, bob: 2 },
    hitbox: SAME_HITBOX,
    controls: SAME_CONTROLS,
    abilities: { hairBoomerang: true },
  },
];

/** 간식별 성장 게이지 증가량 (점수와 별개) */
export const SNACK_GROWTH: Record<SnackKind, number> = {
  strawberry: 1,
  banana: 2,
  cookie: 3,
  jelly: 4,
};

/**
 * 게임 오버 후 성장 처리 규칙.
 *  - 'restart' : 한 판 = 한 번의 성장 여정. 다시하기는 항상 갓난아기부터 (점수와 같은 규칙)
 *                대신 '최고 성장 단계'는 기기에 기록해 게임 오버 화면에 보여 줌.
 */
export const GROWTH_ON_GAME_OVER = 'restart' as const;

/**
 * 단계별 전용 그림 (선택). 파일이 있으면 그 단계는 이 시트를 사용합니다.
 * 형식: 프레임을 가로로 이어 붙인 PNG. frames 의 번호는 그 PNG 안의 프레임 번호.
 */
export const STAGE_ASSETS: Partial<
  Record<GrowthStageId, { url: string; frameCount: number; anim: Partial<StageAnimation>; scale?: number }>
> = {
  // tools/build_growth_sprites.py 가 컨셉 시트(art-src/growth)에서 만든 1:1 도트 시트 — 모두 1.2배(도트 6px)로 표시
  // 0 엎드림 · 1 꿈틀(몸 1칸 늘림) · 2 눈 깜빡
  newborn: { url: 'assets/character/stages/newborn.png', frameCount: 3, scale: 1.2, anim: { run: [0, 1, 0, 1, 0, 2], jump: 0, idle: 0 } },
  // 0 기기 · 1 다리 벌림
  crawler: { url: 'assets/character/stages/crawler.png', frameCount: 2, scale: 1.2, anim: { run: [0, 1], jump: 1, idle: 0 } },
  // 직립보행은 기존 dino.png 달리기 프레임 유지 (walker.png 를 넣으면 교체)
  walker: { url: 'assets/character/stages/walker.png', frameCount: 6, anim: { run: [0, 1, 2, 3], jump: 4, idle: 5 } },
  // 0 서기 · 1 왼발 들기 · 2 오른발 들기 → 묵직한 걸음
  bigbaby: { url: 'assets/character/stages/bigbaby.png', frameCount: 3, scale: 1.2, anim: { run: [1, 0, 2, 0], jump: 1, idle: 0 } },
};

/** 한 판 동안의 성장 상태 (점수와 독립) */
export class GrowthState {
  stageIndex = 0;
  gauge = 0;
  /** 이번 판에서 도달한 최고 단계 */
  maxStageIndex = 0;

  get stage(): GrowthStageDef {
    return GROWTH_STAGES[this.stageIndex];
  }

  /** 마지막 성장 단계 (더 진화하지 않음) */
  get isFinal(): boolean {
    return this.stageIndex >= GROWTH_STAGES.length - 1;
  }

  /** 게이지가 가득 참 (보스전·진화 대기) */
  get isFull(): boolean {
    const need = this.stage.gaugeToNext;
    return need !== null && this.gauge >= need;
  }

  /** 0~1 게이지 비율 (최종 단계는 1) */
  get ratio(): number {
    const need = this.stage.gaugeToNext;
    return need === null ? 1 : Math.min(1, this.gauge / need);
  }

  /** 게이지를 올리고, 가득 찼으면 true (진화는 evolve() 를 따로 호출 — 연출이 끝난 뒤 적용) */
  add(amount: number): boolean {
    const need = this.stage.gaugeToNext;
    if (need === null || this.gauge >= need) return false;
    this.gauge = Math.min(need, this.gauge + amount);
    return this.gauge >= need;
  }

  /** 다음 단계로. 남는 게이지는 버림 (단계마다 새로 채우는 규칙) */
  evolve(): GrowthStageDef {
    if (!this.isFinal) {
      this.stageIndex++;
      this.gauge = 0;
      this.maxStageIndex = Math.max(this.maxStageIndex, this.stageIndex);
    }
    return this.stage;
  }

  reset(): void {
    this.stageIndex = 0;
    this.gauge = 0;
    this.maxStageIndex = 0;
  }
}
