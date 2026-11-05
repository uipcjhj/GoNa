/**
 * 화면 위에 겹쳐지는 HTML UI (타이틀 / 일시정지 / 게임 오버 / 버튼).
 * 한글 글자가 선명하게 보이도록 캔버스 대신 DOM 으로 그립니다.
 */
import { GAME_TITLE, SNACKS, STORAGE_KEYS, type SnackKind } from '../config';
import { bus, EV, type GameOverInfo } from '../events';
import { heartCanvas, snackCanvas } from '../art/textures';
import { mapToCanvas } from '../art/PixelCanvas';
import { sound } from '../audio';
import { storage } from '../storage';

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

function pixelImg(canvas: HTMLCanvasElement, scale: number, cls = ''): HTMLImageElement {
  const img = new Image();
  img.src = canvas.toDataURL();
  img.width = canvas.width * scale;
  img.height = canvas.height * scale;
  img.className = `pixel ${cls}`.trim();
  img.alt = '';
  img.draggable = false;
  return img;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export class Overlay {
  private title: HTMLElement;
  private pause: HTMLElement;
  private over: HTMLElement;
  private buttons: HTMLElement;
  private soundBtn: HTMLButtonElement;
  private pauseBtn: HTMLButtonElement;
  private titleBest: HTMLElement;
  private heroSlot: HTMLElement;
  private overScore!: HTMLElement;
  private overBest!: HTMLElement;
  private overNew!: HTMLElement;
  private overSnacks!: HTMLElement;
  private retryBtn!: HTMLButtonElement;
  private canRetryAt = 0;

  constructor(root: HTMLElement) {

    // ── 타이틀
    this.title = el('section', 'screen title-screen');
    const panel = el('div', 'panel');
    const [l1, l2] = splitTitle(GAME_TITLE);
    const h1 = el('h1', 'logo');
    h1.append(el('span', 'logo-small', l1), el('span', 'logo-big', l2));
    this.heroSlot = el('div', 'hero');
    const snacks = el('ul', 'snack-list');
    (Object.keys(SNACKS) as SnackKind[]).forEach((k) => {
      const li = el('li');
      li.append(pixelImg(snackCanvas(k), 3), el('span', '', `${SNACKS[k].points}`));
      snacks.append(li);
    });
    const how = el('p', 'how');
    how.innerHTML = '터치 <b>점프</b> · 공중에서 한 번 더 <b>더블 점프</b><br>바위에 부딪히면 하트가 줄어요!';
    const start = el('p', 'blink start', '화면을 터치해서 시작!');
    this.titleBest = el('p', 'best');
    panel.append(h1, this.heroSlot, snacks, how, start, this.titleBest);
    this.title.append(panel);

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

    root.append(this.title, this.pause, this.over, this.buttons);
    this.refreshBest();
    this.bind();
  }

  private buildGameOver(): HTMLElement {
    const p = el('div', 'panel');
    const hearts = el('div', 'hearts');
    for (let i = 0; i < 3; i++) hearts.append(pixelImg(heartCanvas(false), 3));
    this.overNew = el('p', 'new-best hidden', '★ 최고 기록! ★');
    this.overScore = el('p', 'score-big', '0');
    this.overSnacks = el('p', 'sub');
    this.overBest = el('p', 'best');
    this.retryBtn = el('button', 'pixel-btn', '다시하기');
    p.append(el('h2', '', '게임 오버'), hearts, this.overNew, this.overScore, this.overSnacks, this.overBest, this.retryBtn);
    return p;
  }

  private bind(): void {
    bus.on(EV.ready, (preview: HTMLCanvasElement) => {
      this.heroSlot.replaceChildren(pixelImg(preview, heroScale(preview), 'hero-img'));
    });
    bus.on(EV.start, () => {
      this.title.classList.add('hidden');
      this.over.classList.add('hidden');
      this.pause.classList.add('hidden');
      this.pauseBtn.classList.remove('hidden');
    });
    bus.on(EV.pause, () => this.pause.classList.remove('hidden'));
    bus.on(EV.resume, () => this.pause.classList.add('hidden'));
    bus.on(EV.gameOver, (info: GameOverInfo) => this.showGameOver(info));

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
    this.overScore.textContent = `${info.score}점`;
    this.overSnacks.textContent = `먹은 간식 ${info.snacks}개`;
    this.overBest.textContent = `최고 점수 ${info.best}점`;
    this.overNew.classList.toggle('hidden', !info.isNewBest);
    this.over.classList.remove('hidden');
    // 연타로 바로 재시작되는 것 방지
    this.canRetryAt = performance.now() + 500;
    this.refreshBest();
  }

  private refreshBest(): void {
    const best = Number(storage.get(STORAGE_KEYS.best) ?? 0) || 0;
    this.titleBest.textContent = best > 0 ? `최고 점수 ${best}점` : '';
  }

  private refreshSoundIcon(): void {
    const rows = sound.muted ? ICON_SOUND_OFF : ICON_SOUND_ON;
    this.soundBtn.replaceChildren(pixelImg(mapToCanvas(rows, ICON_PALETTE), 3));
  }
}

function splitTitle(t: string): [string, string] {
  const i = t.lastIndexOf(' ');
  // "우리애기 공룡의 간식 대모험" → "우리애기 공룡의" / "간식 대모험"
  const parts = t.split(' ');
  if (parts.length >= 4) return [parts.slice(0, 2).join(' '), parts.slice(2).join(' ')];
  return i > 0 ? [t.slice(0, i), t.slice(i + 1)] : ['', t];
}

function heroScale(c: HTMLCanvasElement): number {
  return Math.max(1, Math.round(96 / c.height));
}
