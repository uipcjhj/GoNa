/**
 * 가족 엔딩 마지막 화면 (DOM — 한글·영문 글자를 선명하게)
 *   1) 타이틀: GONA’s Food Adventure / 고나의 첫 번째 모험 / 2026.04.10 (커다란 THE END 대신 차분하게 나타남)
 *   2) 크레딧: 천천히 위로 (확인된 내용만)
 *   3) 마지막 문구: 현이의 모든 모험을 응원하며… (화면 가운데, 충분히 머묾)
 *   4) 검은 화면 → 잠시 뒤 작은 버튼(처음부터 다시하기 · 타이틀로 돌아가기 · 엔딩 다시보기)
 * 단계는 EndingScene 이 EV.endingPhase 로 알려 줌.
 */
import { bus, EV, type GameOverInfo } from '../events';
import { sound } from '../audio';
import { el } from './dom';

export type EndingPhase = 'title' | 'credits' | 'final' | 'black';

/** 크레딧 (실제로 확인할 수 있는 내용만) */
export const ENDING_CREDITS: [string, string[]][] = [
  ['고나의 가족', ['이모 · 삼촌 · 엄마', '아빠 · 할머니 · 할아버지']],
  ['함께한 괴물들', ['뽀뽀괴물 · 킁카괴물', '화학과안경잽이 · 방구할배']],
  ['음악 · 효과음', ['게임 안에서 작곡·합성한 오리지널 곡']],
  ['픽셀 글꼴', ['Galmuri (Lee Minseo · OFL 1.1)']],
  ['게임 엔진', ['Phaser']],
  ['만드는 데 도움', ['Claude (Anthropic)']],
];
export const ENDING_LAST_MESSAGE = '현이의 모든 모험을 응원하며…';

export class EndingUi {
  readonly root: HTMLElement;
  private scoreEl: HTMLElement;
  private titleEl: HTMLElement;
  private creditsEl: HTMLElement;
  private rollEl: HTMLElement;
  private finalEl: HTMLElement;
  private blackEl: HTMLElement;
  private btnsEl: HTMLElement;
  /** 버튼 연결 (main 에서) */
  onRestart: () => void = () => {};
  onTitle: () => void = () => {};
  onReplay: () => void = () => {};
  private info: GameOverInfo | null = null;
  private readyAt = 0;
  phase: EndingPhase | null = null;

  constructor(parent: HTMLElement) {
    this.root = el('section', 'ending-ui hidden');
    // 1) 타이틀
    this.titleEl = el('div', 'end-title-card');
    this.scoreEl = el('p', 'end-score');
    this.titleEl.append(el('p', 'end-game', 'GONA’s Food Adventure'), el('p', 'end-sub', '고나의 첫 번째 모험'), el('p', 'end-date', '2026.04.10'));
    // 2) 크레딧
    this.creditsEl = el('div', 'end-credits');
    this.rollEl = el('div', 'end-roll');
    this.rollEl.append(el('p', 'end-roll-title', 'GONA’s Food Adventure'));
    for (const [head, lines] of ENDING_CREDITS) {
      const block = el('div', 'end-roll-block');
      block.append(el('p', 'end-roll-head', head));
      for (const l of lines) block.append(el('p', 'end-roll-line', l));
      this.rollEl.append(block);
    }
    this.rollEl.append(el('p', 'end-roll-thanks', '함께 모험해 줘서 고마워요!'));
    this.creditsEl.append(this.rollEl);
    // 3) 마지막 문구
    this.finalEl = el('p', 'end-final', ENDING_LAST_MESSAGE);
    // 4) 검은 화면 + 작은 버튼
    this.blackEl = el('div', 'end-black');
    this.btnsEl = el('div', 'end-btns');
    const restart = el('button', 'pixel-btn end-btn end-restart', '처음부터 다시하기');
    const title = el('button', 'pixel-btn end-btn end-title', '타이틀로 돌아가기');
    const replay = el('button', 'pixel-btn end-btn end-replay', '엔딩 다시보기');
    for (const b of [restart, title, replay]) b.type = 'button';
    this.btnsEl.append(this.scoreEl, restart, title, replay);
    this.root.append(this.titleEl, this.creditsEl, this.finalEl, this.blackEl, this.btnsEl);
    parent.append(this.root);
    const guard = (fn: () => void) => () => {
      if (performance.now() < this.readyAt) return; // 나타나자마자 실수로 눌리지 않게
      sound.unlock();
      this.hide();
      fn();
    };
    restart.addEventListener('click', guard(() => this.onRestart()));
    title.addEventListener('click', guard(() => this.onTitle()));
    replay.addEventListener('click', guard(() => this.onReplay()));
    bus.on(EV.endingStart, (info: GameOverInfo | null) => {
      if (info) this.info = info;
      this.hide();
    });
    bus.on(EV.endingPhase, (p: EndingPhase) => this.setPhase(p));
    bus.on(EV.endingTheEnd, () => this.showButtons());
  }

  get isVisible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  setPhase(p: EndingPhase): void {
    this.phase = p;
    this.root.classList.remove('hidden');
    this.root.dataset.phase = p;
  }

  /** 검은 화면 위 작은 버튼 */
  showButtons(): void {
    const i = this.info;
    this.scoreEl.textContent = i ? `점수 ${i.score}점 · 먹은 간식 ${i.snacks}개${i.isNewBest ? ' · ★ 최고 기록!' : ''}` : '';
    if (this.phase !== 'black') this.setPhase('black');
    this.root.classList.add('with-btns');
    this.readyAt = performance.now() + 600;
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.root.classList.remove('with-btns');
    delete this.root.dataset.phase;
    this.phase = null;
  }
}
