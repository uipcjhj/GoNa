/**
 * 일반 몬스터 (3단계부터 — 뽀뽀괴물을 이기고 머리카락 부메랑을 얻은 뒤)
 *   안경잽이몹: 고나를 보면 다가오고, 가끔 안경에서 반짝이를 낮게 쏨 → 점프 / 부메랑 2번
 *   방구할배몹: 느릿느릿, 가까워지면 방귀 구름을 땅에 남김(잠시 머묾) → 점프 / 부메랑 3번
 * 정식 그림: public/assets/monsters/{glasses,farter}-sheet.png (프레임 3장 가로, 왼쪽을 봄) — 없으면 코드 도트
 */
export type MonsterKind = 'glasses' | 'farter';

export interface MonsterDef {
  kind: MonsterKind;
  name: string;
  hp: number;
  /** 땅보다 더 빨리 다가오는 속도(px/s) */
  walk: number;
  /** 공격을 시작하는 거리 (고나와의 x 거리, px) */
  attackFrom: number;
  attackTo: number;
  /** 공격 예고(초 — 이동안 화면에서 제자리에 서서 반짝/들썩) · 다시 공격까지(초) */
  telegraph: number;
  cooldown: number;
  /** 몸에 닿으면 · 공격에 맞으면 HP 피해 */
  bodyDamage: number;
  shotDamage: number;
  score: number;
  /** 간식 떨어뜨릴 확률 */
  dropChance: number;
  /** 필살 게이지 보상 (0~1) */
  special: number;
  sheetUrl: string;
  /** 충돌 박스 (도트) */
  box: { w: number; h: number };
  /** 가까이 오면(holdAt px) 이 시간(초) 동안 화면에 머물며 공격 → 부메랑으로 잡을 시간 */
  holdAt: number;
  holdSec: number;
}

export const MONSTERS: Record<MonsterKind, MonsterDef> = {
  glasses: {
    kind: 'glasses',
    name: '안경잽이몹',
    hp: 2,
    walk: 20,
    attackFrom: 80,
    attackTo: 150,
    telegraph: 0.7,
    cooldown: 1.8,
    bodyDamage: 25,
    shotDamage: 20,
    score: 40,
    dropChance: 0.5,
    special: 0.15,
    sheetUrl: 'assets/monsters/glasses-sheet.png',
    box: { w: 14, h: 15 },
    holdAt: 120,
    holdSec: 3.5,
  },
  farter: {
    kind: 'farter',
    name: '방구할배몹',
    hp: 3,
    walk: 6,
    attackFrom: 75,
    attackTo: 150,
    telegraph: 0.8,
    cooldown: 2.4,
    bodyDamage: 25,
    shotDamage: 20,
    score: 60,
    dropChance: 1,
    special: 0.2,
    sheetUrl: 'assets/monsters/farter-sheet.png',
    box: { w: 15, h: 17 },
    holdAt: 115,
    holdSec: 4.5,
  },
};

/** 일반 바위 피해 (하트 하나 = HP 100) */
export const ROCK_DAMAGE = 50;

/** 몬스터 출현: 3단계(index 2) 1마리까지 · 4단계(index 3) 2마리까지, 성장 게이지가 찰수록 조금씩 자주 */
export function monsterWeight(stageIndex: number, gaugeRatio: number): number {
  if (stageIndex < 2) return 0;
  // 다른 패턴 가중치 합(약 14) 대비 — 3단계 약 15% → 4단계 끝 약 30%
  const base = stageIndex === 2 ? 2.4 : 4.0;
  return base * (1 + gaugeRatio * 0.5);
}

export function maxMonsters(stageIndex: number): number {
  return stageIndex >= 3 ? 2 : 1;
}
