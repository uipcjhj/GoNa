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
    maxHp: 12,
    phase2At: 0.5,
    specialDamage: 4,
    scoreBonus: 300,
    atStage: 'crawler',
    afterWin: 'evolve',
    sheetUrl: 'assets/boss/kiss-sheet.png',
  },
  sniff: {
    id: 'sniff',
    name: '킁카괴물',
    intro: '킁킁! 냄새로 숲을 뒤덮는 마지막 괴물',
    maxHp: 30,
    phase2At: 0.5,
    specialDamage: 8,
    scoreBonus: 600,
    atStage: 'bigbaby',
    afterWin: 'ending',
    sheetUrl: 'assets/boss/sniff-sheet.png',
  },
};

/** 필살 게이지 충전량 (0~1 기준) */
export const SPECIAL_GAIN = {
  boomerangHit: 0.12,
  projectileBreak: 0.06,
  snack: 0.15,
  dodge: 0.05,
};
