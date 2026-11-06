/**
 * 보스 데이터 (숫자만 바꿔 난이도 조절).
 *
 * 흐름 (src/scenes/GameScene.ts):
 *   1단계 갓난아기 → 2단계 기어 다니는 고나 ─(게이지 가득)→ ⚔ 뽀뽀괴물 → (승리) 3단계 직립보행
 *   → 4단계 빅베이비 곤룡 ─(게이지 가득)→ ⚔ 킁카괴물 → (승리) 엔딩
 * 보스 행동(공격 패턴)은 src/scenes/battle/KissBattle.ts · SniffBattle.ts
 */
import type { BossId } from '../events';
import type { GrowthStageId } from './growth';

export type { BossId };

export interface BossDef {
  id: BossId;
  name: string;
  /** 등장 안내 한 줄 */
  intro: string;
  maxHp: number;
  /** 이 체력 비율 이하에서 강화 패턴(2페이즈) */
  phase2At: number;
  /** 필살기 피해 */
  specialDamage: number;
  /** 승리 보너스 점수 */
  scoreBonus: number;
  /** 공격이 끝난 뒤 다음 공격까지 최소 쉬는 시간(초) — 부메랑을 맞힐 빈틈 */
  minRecover: number;
  /** 몸통(돌진·흡입 충돌)에 닿았을 때 HP 피해 */
  bodyDamage: number;
  /** 필살 게이지 충전 배율 (최종 보스는 천천히) */
  specialGainMul: number;
  /** 이 보스가 나오는 성장 단계 (그 단계 게이지가 가득 차면 진화 대신 보스전) */
  atStage: GrowthStageId;
  /** 이기면: 다음 단계로 진화 / 엔딩 */
  afterWin: 'evolve' | 'ending';
  /** 정식 그림 (선택). 프레임 3장 가로 시트 — 없으면 코드 도트 (src/art/bossArt.ts) */
  sheetUrl: string;
}

export const BOSSES: Record<BossId, BossDef> = {
  kiss: {
    id: 'kiss',
    name: '뽀뽀괴물',
    intro: '쪽쪽! 뽀뽀로 괴롭히는 장난꾸러기',
    // 튜토리얼 보스: 처음 하는 사람도 몇 번 안에 이기게 (12 → 8)
    maxHp: 8,
    phase2At: 0.5,
    specialDamage: 3,
    scoreBonus: 300,
    minRecover: 2.0,
    bodyDamage: 30, // 돌진
    specialGainMul: 1,
    atStage: 'crawler',
    afterWin: 'evolve',
    sheetUrl: 'assets/boss/kiss-sheet.png',
  },
  sniff: {
    id: 'sniff',
    name: '킁카괴물',
    intro: '킁킁! 냄새로 숲을 뒤덮는 마지막 괴물',
    maxHp: 40,
    phase2At: 0.5,
    specialDamage: 8,
    scoreBonus: 600,
    minRecover: 1.3,
    bodyDamage: 30, // 흡입 후 충돌
    specialGainMul: 0.5,
    atStage: 'bigbaby',
    afterWin: 'ending',
    sheetUrl: 'assets/boss/sniff-sheet.png',
  },
};

/** 필살 게이지 충전량 (0~1 기준) */
export const SPECIAL_GAIN = {
  boomerangHit: 0.2,
  projectileBreak: 0.08,
  snack: 0.2,
  dodge: 0.08,
};

/** 보스전 고나 체력: 하트 1개 = HP 100. 0 이 되면 하트 -1, 남은 하트가 있으면 다시 100 */
export const BATTLE_HP = {
  perHeart: 100,
  /** 맞은 직후 무적(ms) — 연속 피해 방지 */
  hitInvulnMs: 700,
  /** 하트를 잃은 직후 무적(ms) */
  heartLossInvulnMs: 1500,
};

/** 방패: 지속(ms) · 재사용 대기(ms, 발동 시점부터) */
export const SHIELD = { activeMs: 1000, cooldownMs: 4000 };

/** 공격별 HP 피해 */
export const DAMAGE = {
  kissHeart: 20,
  kissWave: 25,
  sniffCloud: 25,
  sniffBlast: 35,
  sniffPuddle: 20,
};
