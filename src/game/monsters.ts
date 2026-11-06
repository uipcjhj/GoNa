/**
 * 일반 몬스터 (3단계부터 — 뽀뽀괴물을 이기고 머리카락 부메랑을 얻은 뒤)
 * 둘 다 화면 오른쪽에서 들어와 고나 쪽으로 '계속' 천천히 다가옴 (공격 예고 때만 잠깐 멈춤).
 * 처치하지 못하면 고나와 부딪혀 HP 피해 (점프로 넘을 수 있음).
 *   안경잽이몹: 안경 번쩍 + 보라 물약 플라스크를 꺼냄(예고) → 2~3개 연속 포물선 투척(0.75초 간격, 던지면서도 조금씩 다가옴)
 *              땅에 닿으면 '팡' 깨지며 보라 물약이 잠깐 퍼짐 → 점프 / 부메랑으로 공중에서 깸 / 몸은 부메랑 2번
 *   배불뚝이 아저씨몹: 뒤뚱뒤뚱(배 출렁) → 멈춤 → 엉덩이 뒤로 쭉 → 씰룩 → 엉덩이에서 '뿡' 팡! → 황록 구름이 고나 쪽으로
 *                     → 능청스러운 표정 → 다시 다가옴. 가까울수록 자주 → 점프 / 부메랑 3번
 * 정식 그림: public/assets/monsters/{glasses,farter}-sheet.png (프레임 3장 가로, 왼쪽을 봄) — 없으면 코드 도트
 */
export type MonsterKind = 'glasses' | 'farter';

export interface MonsterDef {
  kind: MonsterKind;
  name: string;
  hp: number;
  /** 화면에 들어오기 전: 땅보다 더 빨리 다가오는 속도(px/s) */
  walk: number;
  /** 화면 안: 고나 쪽으로 다가오는 화면 속도(px/s) — 화면 오른쪽 끝에서 고나까지 약 travelSec 초 (가로 화면도 같은 시간) */
  approach: number;
  travelSec: number;
  /** 이 거리(고나와의 x, px)보다 가까우면 공격하지 않음 (몸으로 부딪힘) */
  minDist: number;
  /** 공격 예고(초 — 이때만 잠깐 멈춤) · 다시 공격까지(초, 멀 때 → 가까울 때) */
  telegraph: number;
  cooldownFar: number;
  cooldownNear: number;
  /** 한 번 공격에 던지는 최대 수 (안경잽이: 플라스크 2~3개) */
  burstCount: number;
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
}

export const MONSTERS: Record<MonsterKind, MonsterDef> = {
  glasses: {
    kind: 'glasses',
    name: '안경잽이몹',
    hp: 2,
    walk: 20,
    approach: 14,
    travelSec: 9,
    minDist: 40,
    telegraph: 0.6,
    cooldownFar: 3.4,
    cooldownNear: 2.8,
    burstCount: 3,
    bodyDamage: 25,
    shotDamage: 20,
    score: 40,
    dropChance: 0.5,
    special: 0.15,
    sheetUrl: 'assets/monsters/glasses-sheet.png',
    box: { w: 14, h: 15 },
  },
  farter: {
    kind: 'farter',
    name: '배불뚝이 아저씨몹',
    hp: 3,
    walk: 8,
    approach: 9,
    travelSec: 13,
    minDist: 50,
    // 멈춤 → 엉덩이 뒤로 쭉(0.35초) → 씰룩씰룩 → 팡! (그 뒤 0.7초 능청 표정)
    telegraph: 0.95,
    cooldownFar: 3.6,
    cooldownNear: 2.2,
    burstCount: 1,
    bodyDamage: 25,
    shotDamage: 20,
    score: 60,
    dropChance: 1,
    special: 0.2,
    sheetUrl: 'assets/monsters/farter-sheet.png',
    box: { w: 16, h: 18 },
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
