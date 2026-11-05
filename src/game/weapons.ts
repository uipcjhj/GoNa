/**
 * 특수 무기 (향후 구현용 설계 — 이번 버전에서는 게임에 연결되지 않음).
 *
 * 머리카락 부메랑: 고나 머리 위의 물방울 모양 갈색 머리카락이
 * 앞으로 날아갔다가 다시 돌아오는 기술. 성장 단계에 따라 해금·강화.
 */
import type { GrowthStageId } from './growth';

export interface WeaponDef {
  id: 'hairBoomerang';
  name: string;
  /** 이 단계부터 사용 가능 */
  unlockStage: GrowthStageId;
  /** 날아가는 최대 거리(px)와 속도 */
  range: number;
  speed: number;
  damage: number;
  /** 다시 던질 수 있을 때까지(초) */
  cooldown: number;
  /** 단계별 강화 (해당 단계 이상이면 덮어씀) */
  upgrades: Partial<Record<GrowthStageId, Partial<Pick<WeaponDef, 'range' | 'speed' | 'damage' | 'cooldown'>>>>;
}

export const HAIR_BOOMERANG: WeaponDef = {
  id: 'hairBoomerang',
  name: '머리카락 부메랑',
  unlockStage: 'walker',
  range: 110,
  speed: 260,
  damage: 1,
  cooldown: 0.9,
  upgrades: { bigbaby: { range: 150, damage: 2 } },
};

/**
 * 향후 조작 계획: 지금의 '화면 터치 = 점프'는 그대로 두고,
 * 화면 오른쪽 아래 공격 버튼(또는 두 손가락 터치)으로 부메랑을 던지는 방식을 예정.
 */
