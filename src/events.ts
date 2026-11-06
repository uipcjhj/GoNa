import Phaser from 'phaser';

/** 게임(Phaser) ↔ 화면 UI(DOM) 사이의 이벤트 통로 */
export const bus = new Phaser.Events.EventEmitter();

export const EV = {
  /** 텍스처 준비 완료: (preview: CharacterPreview) */
  ready: 'ready',
  /** 타이틀 → 게임 시작 요청 */
  requestStart: 'requestStart',
  /** 게임 시작 */
  start: 'start',
  /** 게임 오버: ({ score, best, isNewBest }) */
  gameOver: 'gameOver',
  /** 다시하기 요청 */
  restart: 'restart',
  /** 일시정지 / 재개 (게임이 실제로 멈췄을 때 알림) */
  pause: 'pause',
  resume: 'resume',
  /** UI → 게임: 일시정지 / 재개 요청 */
  requestPause: 'requestPause',
  requestResume: 'requestResume',
  /** 성장: 진화 연출 시작 / 새 단계 확정({ level, name, description }) / 연출 끝 */
  evolveStart: 'evolveStart',
  evolve: 'evolve',
  evolveEnd: 'evolveEnd',
  /** 오프닝 시네마틱: 시작 / 끝(→대표 타이틀, { instant }) / 건너뛰기 요청 / 다시 보기 요청 */
  openingStart: 'openingStart',
  openingDone: 'openingDone',
  skipOpening: 'skipOpening',
  replayOpening: 'replayOpening',
  /** 스토리 프롤로그: 시작(첫 터치) / 다음 문장 요청 / 문장 시작({ index, total, text, seconds }) / 끝 */
  prologueBegin: 'prologueBegin',
  prologueNext: 'prologueNext',
  prologueLine: 'prologueLine',
  prologueEnd: 'prologueEnd',
  /** 화면 터치 */
  tap: 'tap',
  /** UI → 게임: 머리카락 부메랑 / 필살기 */
  attack: 'attack',
  special: 'special',
  /** 게임 → UI: 공격 버튼·필살 게이지·보스 체력 표시 (CombatHud) */
  combatHud: 'combatHud',
  /** 게임 → UI: 화면 가운데 큰 안내 ({ top, name, desc, ms, tone }) */
  banner: 'banner',
  /** 보스전 시작 / 끝({ id, win }) */
  bossStart: 'bossStart',
  bossEnd: 'bossEnd',
  /** 엔딩 (마지막 보스 격파) — GameOverInfo 와 같은 모양 + cleared */
  ending: 'ending',
} as const;

export type BossId = 'kiss' | 'sniff';

/** 공격 버튼 상태: 숨김 / 던질 수 있음 / 날아가는 중(돌아오기 전) */
export type AttackState = 'hidden' | 'ready' | 'out';

export interface CombatHud {
  attack: AttackState;
  /** 필살 게이지 0~1 (null = 숨김: 보스전에서만 보임) */
  special: number | null;
  specialReady: boolean;
  boss: { name: string; hp: number; maxHp: number; phase: number } | null;
}

export interface BannerInfo {
  top: string;
  name: string;
  desc?: string;
  ms: number;
  tone?: 'boss' | 'good' | 'power';
}

export interface GameOverInfo {
  score: number;
  best: number;
  isNewBest: boolean;
  snacks: number;
  /** 이번 판에서 도달한 성장 단계 (1~4) */
  growthLevel: number;
  growthName: string;
  /** 지금까지 최고 성장 단계 */
  bestGrowthLevel: number;
  growthLevels: number;
  /** 보스전에서 졌으면 그 보스 (게임 오버 화면에 '보스전 다시 도전' 버튼) */
  bossRetry?: BossId;
  /** 엔딩 (모든 보스 격파) */
  cleared?: boolean;
}

/** 다시하기 요청 옵션 */
export interface RestartOptions {
  /** 이 보스전부터 바로 다시 (점수·간식 수는 이어서) */
  boss?: BossId;
  score?: number;
  snacks?: number;
}

export interface EvolveInfo {
  level: number;
  name: string;
  description: string;
}
