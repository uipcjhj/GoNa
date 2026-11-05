import Phaser from 'phaser';

/** 게임(Phaser) ↔ 화면 UI(DOM) 사이의 이벤트 통로 */
export const bus = new Phaser.Events.EventEmitter();

export const EV = {
  /** 텍스처 준비 완료: (previewCanvas: HTMLCanvasElement) */
  ready: 'ready',
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
  /** 화면 터치 */
  tap: 'tap',
} as const;

export interface GameOverInfo {
  score: number;
  best: number;
  isNewBest: boolean;
  snacks: number;
}
