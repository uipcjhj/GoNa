/**
 * 스테이지 관리 구조 (향후 확장용).
 *
 * 지금은 배경이 '버섯숲' 하나뿐이라 보스전도 같은 숲에서 벌어집니다.
 * 보스전 시점은 성장 단계로 정합니다 (src/game/boss.ts 의 atStage):
 *   2단계 게이지 가득 → 뽀뽀괴물 → 3단계 / 4단계 게이지 가득 → 킁카괴물 → 엔딩
 * 보스별 배경 그림이 생기면 아래 backgroundUrl 을 채워 스테이지 전환에 쓸 예정입니다.
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
  { id: 'kissValley', name: '뽀뽀 골짜기', backgroundUrl: null, boss: 'kiss', bossWhenStage: 'walker', playable: false },
  { id: 'smellSwamp', name: '킁카 늪', backgroundUrl: null, boss: 'sniff', bossWhenStage: 'bigbaby', playable: false },
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
