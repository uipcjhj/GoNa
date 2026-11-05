/**
 * 스테이지 관리 구조 (향후 확장용).
 *
 * 지금은 '버섯숲' 스테이지 하나만 있고, 보스 없이 끝없이 달리는 기존 방식 그대로입니다.
 * 앞으로는 스테이지마다 배경·간식/장애물 비율·보스를 정하고,
 * 목표(거리 또는 성장 단계)를 채우면 보스전 → 다음 스테이지 → 엔딩 순서로 진행할 예정입니다.
 */
import type { BossId } from './boss';
import type { GrowthStageId } from './growth';

export type StageId = 'mushroomForest' | 'kissValley' | 'smellSwamp' | 'homecoming';

export interface StageDef {
  id: StageId;
  name: string;
  /** 배경 이미지 (없으면 코드 배경) */
  backgroundUrl: string | null;
  /** 이 스테이지의 보스 (없으면 null = 끝없이 달리기) */
  boss: BossId | null;
  /** 보스가 나오는 조건: 이 성장 단계에 도달 */
  bossWhenStage: GrowthStageId | null;
  /** 이번 버전에서 실제로 플레이 가능한지 */
  playable: boolean;
}

export const STAGES: StageDef[] = [
  { id: 'mushroomForest', name: '버섯숲', backgroundUrl: 'assets/game/game-bg-loop.png', boss: null, bossWhenStage: null, playable: true },
  { id: 'kissValley', name: '뽀뽀 골짜기', backgroundUrl: null, boss: 'kissMonster', bossWhenStage: 'walker', playable: false },
  { id: 'smellSwamp', name: '냄새 늪', backgroundUrl: null, boss: 'smellMonster', bossWhenStage: 'bigbaby', playable: false },
  // 엔딩: 엄마·아빠·이모·할머니·할아버지에게 달려가 안기기
  { id: 'homecoming', name: '가족 품으로', backgroundUrl: null, boss: null, bossWhenStage: null, playable: false },
];

/** 현재 스테이지 진행 상태 (지금은 첫 스테이지에 고정) */
export class StageManager {
  private index = 0;

  get current(): StageDef {
    return STAGES[this.index];
  }

  /** 다음 플레이 가능한 스테이지로 (향후 보스 격파 후 호출). 없으면 false */
  advance(): boolean {
    const next = STAGES.findIndex((s, i) => i > this.index && s.playable);
    if (next < 0) return false;
    this.index = next;
    return true;
  }

  reset(): void {
    this.index = 0;
  }
}
