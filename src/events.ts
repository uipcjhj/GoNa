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
  /** 화면 터치 */
  tap: 'tap',
} as const;

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
}

export interface EvolveInfo {
  level: number;
  name: string;
  description: string;
}
