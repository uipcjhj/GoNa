/**
 * 머리카락 부메랑 — 고나의 솟은 물방울 머리카락이 앞으로 날아갔다가 돌아오는 기술.
 *   - 2단계 뽀뽀괴물 보스전 도중 '각성'해서 처음 쓸 수 있고, 3단계부터는 평소 달릴 때도 사용 (바위 깨기·간식 줍기)
 *   - 돌아와서 머리에 다시 붙기 전에는 재발사 불가
 */
import type { GrowthStageId } from './growth';

export interface WeaponDef {
  id: 'hairBoomerang';
  name: string;
  /** 날아가는 최대 거리(px, 논리 해상도)와 속도(px/s) */
  range: number;
  speed: number;
  /** 돌아올 때 속도(px/s) */
  returnSpeed: number;
  damage: number;
  /** 단계별 강화 */
  upgrades: Partial<Record<GrowthStageId, Partial<Pick<WeaponDef, 'range' | 'speed' | 'returnSpeed' | 'damage'>>>>;
}

export const HAIR_BOOMERANG: WeaponDef = {
  id: 'hairBoomerang',
  name: '머리카락 부메랑',
  range: 130,
  speed: 230,
  returnSpeed: 260,
  damage: 1,
  upgrades: { bigbaby: { range: 150, damage: 2, speed: 250 } },
};

export function boomerangStats(stage: GrowthStageId): Omit<WeaponDef, 'upgrades' | 'id' | 'name'> {
  const { range, speed, returnSpeed, damage } = HAIR_BOOMERANG;
  return { range, speed, returnSpeed, damage, ...(HAIR_BOOMERANG.upgrades[stage] ?? {}) };
}
