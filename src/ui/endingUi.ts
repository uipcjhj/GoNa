/**
 * 가족 엔딩 마지막 화면 (DOM — 한글·영문 글자를 선명하게)
 *   GONA's Food Adventure / THE END / 2026.04.10 · 고나의 첫 번째 모험
 *   버튼: 처음부터 다시하기 · 타이틀로 돌아가기 · 엔딩 다시보기
 */
import { bus, EV, type GameOverInfo } from '../events';
import { sound } from '../audio';
import { el } from './dom';

export class EndingUi {
  readonly root: HTMLElement;
  private scoreEl: HTMLElement;
  /** 버튼 연결 (main 에서) */
  onRestart: () => void = () => {};
  onTitle: () => void = () => {};
  onReplay: () => void = () => {};
  private info: GameOverInfo | null = null;
  private readyAt = 0;

  constructor(parent: HTMLElement) {
    this.root = el('section', 'ending-ui hidden');
    const card = el('div', 'end-card');
    const restart = el('button', 'pixel-btn end-btn end-restart', '처음부터 다시하기');
    const title = el('button', 'pixel-btn end-btn end-title', '타이틀로 돌아가기');
    const replay = el('button', 'pixel-btn end-btn end-replay', '엔딩 다시보기');
    for (const b of [restart, title, replay]) b.type = 'button';
    this.scoreEl = el('p', 'end-score');
    card.append(
      el('p', 'end-game', 'GONA’s Food Adventure'),
      el('h2', 'end-the', 'THE END'),
      el('p', 'end-date', '2026.04.10'),
      el('p', 'end-sub', '고나의 첫 번째 모험'),
      this.scoreEl,
      el('div', 'end-btns'),
    );
    card.lastElementChild!.append(restart, title, replay);
    this.root.append(card);
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
    bus.on(EV.endingTheEnd, () => this.show());
  }

  get isVisible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  show(): void {
    const i = this.info;
    this.scoreEl.textContent = i ? `점수 ${i.score}점 · 먹은 간식 ${i.snacks}개${i.isNewBest ? ' · ★ 최고 기록!' : ''}` : '';
    this.root.classList.remove('hidden');
    this.readyAt = performance.now() + 600;
  }

  hide(): void {
    this.root.classList.add('hidden');
  }
}
