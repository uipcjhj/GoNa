/**
 * 보스전 인터페이스 (향후 구현용 설계 — 이번 버전에서는 게임에 연결되지 않음).
 *
 * 보스 하나 = 체력 + 공격 패턴 목록 + 등장/패배 연출.
 * GameScene 은 이 인터페이스만 알면 되도록 설계해, 보스별 코드는 각 파일에서 구현합니다.
 */
export type BossId = 'kissMonster' | 'smellMonster';

/** 보스 공격 종류 */
export type BossAttackKind =
  | 'flyingLips' // 뽀뽀괴물: 날아오는 입술
  | 'heartShot' // 뽀뽀괴물: 하트 탄
  | 'smellCloud'; // 냄새괴물: 냄새 구름

export interface BossAttackPattern {
  kind: BossAttackKind;
  /** 패턴 반복 간격(초) */
  cooldown: number;
  /** 맞으면 잃는 하트 수 */
  damage: number;
  /** 이 패턴을 쓰기 시작하는 보스 체력 비율 (1 = 처음부터) */
  fromHpRatio: number;
}

export interface BossDef {
  id: BossId;
  name: string;
  maxHp: number;
  /** 플레이어가 어느 성장 단계 이상일 때 등장 (예: 머리카락 부메랑 해금 이후) */
  minGrowthLevel: number;
  attacks: BossAttackPattern[];
  /** 보스 그림 (추후 PNG) */
  spriteUrl: string;
}

/** 실제 보스 객체가 GameScene 에 제공할 기능 */
export interface BossController {
  readonly def: BossDef;
  hp: number;
  /** 등장 연출 시작 */
  enter(): void;
  /** 매 프레임 */
  update(dt: number, playerX: number, playerAlt: number): void;
  /** 고나의 공격(머리카락 부메랑 등)에 맞음 */
  onHit(damage: number): void;
  /** 체력 0 → 패배 연출이 끝나면 true */
  isDefeated(): boolean;
  destroy(): void;
}

/** 향후 추가할 보스 목록 (데이터만) */
export const BOSSES: Record<BossId, BossDef> = {
  kissMonster: {
    id: 'kissMonster',
    name: '뽀뽀괴물',
    maxHp: 12,
    minGrowthLevel: 3,
    attacks: [
      { kind: 'flyingLips', cooldown: 2.2, damage: 1, fromHpRatio: 1 },
      { kind: 'heartShot', cooldown: 3.0, damage: 1, fromHpRatio: 0.5 },
    ],
    spriteUrl: 'assets/boss/kiss-monster.png',
  },
  smellMonster: {
    id: 'smellMonster',
    name: '냄새괴물',
    maxHp: 16,
    minGrowthLevel: 4,
    attacks: [{ kind: 'smellCloud', cooldown: 2.6, damage: 1, fromHpRatio: 1 }],
    spriteUrl: 'assets/boss/smell-monster.png',
  },
};
