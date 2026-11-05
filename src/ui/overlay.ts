/**
 * 화면 위에 겹쳐지는 HTML UI (일시정지 / 게임 오버 / 상단 버튼).
 * 타이틀(오프닝) 화면은 ui/title.ts 에 있습니다.
 * 한글 글자가 선명하게 보이도록 캔버스 대신 DOM 으로 그립니다.
 */
import { bus, EV, type EvolveInfo, type GameOverInfo } from '../events';
import { heartCanvas } from '../art/textures';
import { mapToCanvas } from '../art/PixelCanvas';
import { sound } from '../audio';
import { el, pixelImg } from './dom';

const ICON_PALETTE = { k: '#5a3a22', w: '#fff8e6' };
const ICON_SOUND_ON = [
  '....k.......',
  '...kk...k...',
  'kkkwk.k..k..',
  'kwwwk..k.k..',
  'kwwwk..k.k..',
  'kkkwk.k..k..',
  '...kk...k...',
  '....k.......',
];
const ICON_SOUND_OFF = [
  '....k.......',
  '...kk.......',
  'kkkwk.k...k.',
  'kwwwk..k.k..',
  'kwwwk...k...',
  'kkkwk..k.k..',
  '...kk.k...k.',
  '....k.......',
];
const ICON_PAUSE = ['kk..kk', 'kk..kk', 'kk..kk', 'kk..kk', 'kk..kk', 'kk..kk', 'kk..kk', 'kk..kk'];

export class Overlay {
  private pause: HTMLElement;
  private hint: HTMLElement;
  private evolveBanner: HTMLElement;
  private overGrowth!: HTMLElement;
  private over: HTMLElement;
  private buttons: HTMLElement;
  private soundBtn: HTMLButtonElement;
  private pauseBtn: HTMLButtonElement;
  private overScore!: HTMLElement;
  private overBest!: HTMLElement;
  private overNew!: HTMLElement;
  private overSnacks!: HTMLElement;
  private retryBtn!: HTMLButtonElement;
  private canRetryAt = 0;

  constructor(root: HTMLElement) {

    // ── 일시정지
    this.pause = el('section', 'screen pause-screen hidden');
    const pp = el('div', 'panel small');
    pp.append(el('h2', '', '잠깐 쉬어요'), el('p', 'blink', '터치하면 계속!'));
    this.pause.append(pp);

    // ── 게임 오버
    this.over = el('section', 'screen over-screen hidden');
    this.over.append(this.buildGameOver());

    // ── 상단 버튼
    this.buttons = el('div', 'top-buttons');
    this.soundBtn = el('button', 'icon-btn');
    this.soundBtn.setAttribute('aria-label', '소리 켜기/끄기');
    this.pauseBtn = el('button', 'icon-btn hidden');
    this.pauseBtn.setAttribute('aria-label', '일시정지');
    this.pauseBtn.append(pixelImg(mapToCanvas(ICON_PAUSE, ICON_PALETTE), 3));
    this.buttons.append(this.pauseBtn, this.soundBtn);
    this.refreshSoundIcon();

    // 세로 화면 하단의 작은 조작 안내 (게임 중에만)
    this.hint = el('p', 'touch-hint hidden');
    this.hint.innerHTML = '탭 <b>점프</b> · 공중에서 탭 <b>더블 점프</b>';

    // 진화 연출: 새 성장 단계 이름 표시
    this.evolveBanner = el('div', 'evolve-banner hidden');

    root.append(this.hint, this.evolveBanner, this.pause, this.over, this.buttons);
    this.bind();
  }

  private buildGameOver(): HTMLElement {
    const p = el('div', 'panel');
    const hearts = el('div', 'hearts');
    for (let i = 0; i < 3; i++) hearts.append(pixelImg(heartCanvas(false), 3));
    this.overNew = el('p', 'new-best hidden', '★ 최고 기록! ★');
    this.overScore = el('p', 'score-big', '0');
    this.overSnacks = el('p', 'sub');
    this.overGrowth = el('p', 'sub growth-line');
    this.overBest = el('p', 'best');
    this.retryBtn = el('button', 'pixel-btn', '다시하기');
    p.append(el('h2', '', '게임 오버'), hearts, this.overNew, this.overScore, this.overSnacks, this.overGrowth, this.overBest, this.retryBtn);
    return p;
  }

  private bind(): void {
    bus.on(EV.start, () => {
      this.over.classList.add('hidden');
      this.pause.classList.add('hidden');
      this.pauseBtn.classList.remove('hidden');
      this.hint.classList.remove('hidden');
    });
    bus.on(EV.pause, () => this.pause.classList.remove('hidden'));
    bus.on(EV.resume, () => this.pause.classList.add('hidden'));
    bus.on(EV.gameOver, (info: GameOverInfo) => this.showGameOver(info));
    bus.on(EV.evolve, (info: EvolveInfo) => this.showEvolve(info));
    bus.on(EV.evolveEnd, () => this.evolveBanner.classList.add('hidden'));

    this.retryBtn.addEventListener('click', () => this.tryRetry());
    this.soundBtn.addEventListener('click', () => {
      sound.unlock();
      sound.setMuted(!sound.muted);
      this.refreshSoundIcon();
    });
    this.pauseBtn.addEventListener('click', () => {
      bus.emit(this.isPaused ? EV.requestResume : EV.requestPause);
    });
  }

  private showEvolve(info: EvolveInfo): void {
    const b = this.evolveBanner;
    b.replaceChildren(
      el('p', 'evo-top', '✨ 성장! ✨'),
      el('p', 'evo-name', `${info.level}단계 ${info.name}`),
      el('p', 'evo-desc', info.description),
    );
    b.classList.remove('hidden');
    // 애니메이션 다시 시작
    b.style.animation = 'none';
    void b.offsetWidth;
    b.style.animation = '';
  }

  /** 다시하기 (게임 오버 직후 연타 방지) */
  tryRetry(): void {
    if (!this.isGameOverVisible || performance.now() < this.canRetryAt) return;
    sound.unlock();
    this.over.classList.add('hidden');
    bus.emit(EV.restart);
  }

  get isGameOverVisible(): boolean {
    return !this.over.classList.contains('hidden');
  }

  /** 일시정지 화면이 떠 있는지 */
  get isPaused(): boolean {
    return !this.pause.classList.contains('hidden');
  }

  private showGameOver(info: GameOverInfo): void {
    this.pauseBtn.classList.add('hidden');
    this.hint.classList.add('hidden');
    this.overScore.textContent = `${info.score}점`;
    this.overSnacks.textContent = `먹은 간식 ${info.snacks}개`;
    this.overGrowth.textContent = `성장 ${info.growthLevel}/${info.growthLevels}단계 · ${info.growthName}`;
    this.overGrowth.title = `최고 성장 ${info.bestGrowthLevel}단계`;
    this.overBest.textContent = `최고 점수 ${info.best}점 · 최고 성장 ${info.bestGrowthLevel}단계`;
    this.evolveBanner.classList.add('hidden');
    this.overNew.classList.toggle('hidden', !info.isNewBest);
    this.over.classList.remove('hidden');
    // 연타로 바로 재시작되는 것 방지
    this.canRetryAt = performance.now() + 500;
  }

  private refreshSoundIcon(): void {
    const rows = sound.muted ? ICON_SOUND_OFF : ICON_SOUND_ON;
    this.soundBtn.replaceChildren(pixelImg(mapToCanvas(rows, ICON_PALETTE), 3));
  }
}
