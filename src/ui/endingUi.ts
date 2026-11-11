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

export type EndingPhase = 'title' | 'credits' | 'final' | 'black' | 'finale';

/** 황금 왕궁 액자 피날레: 마지막 가족사진(영상 ending_04 의 마지막 프레임 그대로) + 액자(tools/build_golden_frame.py) */
const FINALE_PHOTO = 'assets/ending/video/ending_04_family_portrait-last.png';
const FINALE_FRAME = 'assets/ending/golden-frame.png';
/** 액자 그림 186x170 안의 사진 칸 (golden-frame.json) */
const FINALE_INNER = { x: 18, y: 40, w: 150, h: 112, W: 186, H: 170 };
/** 피날레 크레딧 (아래에서 위로 천천히) — 실제 참여자 이름은 게임에 없어 지어내지 않음 */
export const FINALE_CREDITS: { text: string; cls?: string }[][] = [
  [{ text: 'GONA’s Food Adventure', cls: 'gold big' }],
  [{ text: 'A Little Adventure,' }, { text: 'A Whole Lot of Love.' }],
  [{ text: 'Made with Love', cls: 'gold' }],
];
/** 마지막 헌정 문구 (크레딧이 다 올라간 뒤 가운데에 은은하게) */
export const FINALE_DEDICATION = '현이의 모든 도전을 응원하며..';

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
  private finaleEl: HTMLElement;
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
    // 5) 황금 왕궁 액자 피날레 — 동화책의 마지막 페이지
    this.finaleEl = el('div', 'end-finale');
    const page = el('div', 'fin-page');
    const art = el('div', 'fin-art');
    const photo = el('img', 'fin-photo') as HTMLImageElement;
    photo.alt = '';
    const I = FINALE_INNER;
    photo.style.left = `${(I.x / I.W) * 100}%`;
    photo.style.top = `${(I.y / I.H) * 100}%`;
    photo.style.width = `${(I.w / I.W) * 100}%`;
    photo.style.height = `${(I.h / I.H) * 100}%`;
    const frame = el('img', 'fin-frame') as HTMLImageElement;
    frame.alt = '';
    art.append(photo, frame);
    // 액자 아래: 크레딧 창(액자와 겹치지 않는 별도 영역 — 그 안에서만 위로 흐름) → 헌정 문구 → The End
    const words = el('div', 'fin-words');
    const stage = el('div', 'fin-stage');
    const roll = el('div', 'fin-roll');
    for (const block of FINALE_CREDITS) {
      const b = el('div', 'fin-roll-block');
      for (const l of block) b.append(el('p', `fin-roll-line ${l.cls ?? ''}`.trim(), l.text));
      roll.append(b);
    }
    stage.append(roll, el('p', 'fin-dedi', FINALE_DEDICATION), el('p', 'fin-end', 'The End'));
    words.append(el('span', 'fin-rule'), stage);
    const fbtns = el('div', 'fin-btns');
    const fRestart = el('button', 'pixel-btn fin-btn fin-restart', '처음부터 다시 하기');
    const fTitle = el('button', 'pixel-btn fin-btn fin-title', '타이틀로 돌아가기');
    for (const b of [fRestart, fTitle]) b.type = 'button';
    fbtns.append(fRestart, fTitle);
    const motes = el('div', 'fin-motes');
    for (let i = 0; i < 16; i++) {
      const m = el('span', i % 3 === 0 ? 'fin-star' : 'fin-dust');
      m.style.left = `${(i * 37 + 11) % 96 + 2}%`;
      m.style.top = `${(i * 53 + 7) % 90 + 4}%`;
      m.style.animationDelay = `${(i % 8) * 0.7}s`;
      m.style.animationDuration = `${5 + (i % 5)}s`;
      motes.append(m);
    }
    page.append(art, words, fbtns);
    this.finaleEl.append(motes, page);
    this.finalePhoto = photo;
    this.finaleFrame = frame;
    this.root.append(this.titleEl, this.creditsEl, this.finalEl, this.blackEl, this.btnsEl, this.finaleEl);
    parent.append(this.root);
    const guard = (fn: () => void) => () => {
      if (performance.now() < this.readyAt) return; // 나타나자마자 실수로 눌리지 않게
      sound.unlock();
      this.hide();
      fn();
    };
    restart.addEventListener('click', guard(() => this.onRestart()));
    title.addEventListener('click', guard(() => this.onTitle()));
    fRestart.addEventListener('click', guard(() => this.onRestart()));
    fTitle.addEventListener('click', guard(() => this.onTitle()));
    replay.addEventListener('click', guard(() => this.onReplay()));
    bus.on(EV.endingStart, (info: GameOverInfo | null) => {
      if (info) this.info = info;
      this.hide();
      this.preloadFinale();
    });
    bus.on(EV.endingPhase, (p: EndingPhase) => this.setPhase(p));
    bus.on(EV.endingTheEnd, () => this.showButtons());
  }

  get isVisible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  private finalePhoto!: HTMLImageElement;
  private finaleFrame!: HTMLImageElement;

  /** 피날레 그림 미리 받기 (엔딩이 시작될 때) */
  preloadFinale(): void {
    if (!this.finalePhoto.src) this.finalePhoto.src = FINALE_PHOTO;
    if (!this.finaleFrame.src) this.finaleFrame.src = FINALE_FRAME;
  }

  setPhase(p: EndingPhase): void {
    this.phase = p;
    if (p === 'finale') this.preloadFinale();
    this.root.classList.remove('hidden');
    this.root.dataset.phase = p;
  }

  /** 검은 화면 위 작은 버튼 */
  showButtons(): void {
    const i = this.info;
    this.scoreEl.textContent = i ? `점수 ${i.score}점 · 먹은 간식 ${i.snacks}개${i.isNewBest ? ' · ★ 최고 기록!' : ''}` : '';
    if (this.phase !== 'black' && this.phase !== 'finale') this.setPhase('black');
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
