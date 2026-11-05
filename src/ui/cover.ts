/**
 * 대표 타이틀 화면 (게임 실행 시 가장 먼저 보이는 한 장 그림 + "게임 시작" 버튼).
 *
 *  흐름: [대표 타이틀] → 게임 시작 버튼 → [알 부화 컷신] → 1단계 둥지 이동 시작
 *
 * 그림은 화면 비율과 상관없이 잘리지 않게 전체를 보여 주고(contain),
 * 남는 여백은 같은 그림을 흐리게 깔아 자연스럽게 채웁니다.
 * 버튼을 누르기 전까지는 계속 대기합니다. 이미지가 없으면 이 화면은 건너뜁니다.
 */
import { GAME_TITLE, TITLE_ASSETS } from '../config';
import { sound } from '../audio';
import { el, tryLoadImage } from './dom';

export class CoverScreen {
  private root: HTMLElement;
  private btn: HTMLButtonElement;
  private started = false;
  private shown = false;

  constructor(
    parent: HTMLElement,
    private onStart: (fromCover: boolean) => void,
  ) {
    this.root = el('section', 'cover hidden');
    this.root.setAttribute('aria-label', GAME_TITLE);
    this.btn = el('button', 'start-btn cover-btn');
    this.btn.type = 'button';
    this.btn.append(el('span', 'cover-play', '▶'), el('span', '', '게임 시작'));
    const hint = el('p', 'cover-hint', '버튼을 누르면 모험이 시작돼요');
    const ui = el('div', 'cover-ui');
    ui.append(this.btn, hint);
    this.root.append(ui);
    parent.append(this.root);

    this.btn.addEventListener('click', () => this.start());
    // 버튼이 아닌 곳을 터치하면: 소리만 깨우고 잔잔한 타이틀 음악 시작 (화면은 그대로 대기)
    this.root.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      sound.unlock();
      sound.startMusic('title');
    });
    window.addEventListener('resize', () => this.layout());
    void this.load();
  }

  get isVisible(): boolean {
    return this.shown && !this.started;
  }

  private async load(): Promise<void> {
    const img = await tryLoadImage(TITLE_ASSETS.cover);
    if (!img) {
      // 대표 그림이 없으면 예전처럼 바로 알 부화 컷신
      this.started = true;
      this.onStart(false);
      return;
    }
    const bg = img.cloneNode() as HTMLImageElement;
    bg.className = 'cover-blur';
    bg.alt = '';
    img.className = 'cover-img';
    img.alt = GAME_TITLE;
    img.draggable = false;
    this.root.prepend(bg, img);
    this.root.classList.remove('hidden');
    this.shown = true;
    this.layout();
  }

  /** 그림이 실제로 놓인 영역에 맞춰 버튼 위치 결정 */
  layout(): void {
    const img = this.root.querySelector<HTMLImageElement>('.cover-img');
    if (!img || !img.naturalWidth) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const s = Math.min(vw / img.naturalWidth, vh / img.naturalHeight);
    const ih = img.naturalHeight * s;
    const below = (vh - ih) / 2; // 그림 아래 여백
    const unit = Math.max(3.2, Math.min(vw / 100, vh / 70, 7));
    this.root.style.setProperty('--b', `${unit}px`);
    const ui = this.root.querySelector<HTMLElement>('.cover-ui');
    if (!ui) return;
    const iw = img.naturalWidth * s;
    const left = (vw - iw) / 2;
    const uiH = ui.offsetHeight || unit * 16;
    if (below >= uiH + 20) {
      // 세로 화면: 그림 아래 여백 가운데
      this.root.classList.remove('side');
      Object.assign(ui.style, { left: '0px', right: '0px', width: 'auto', bottom: `${(below - uiH) / 2}px` });
    } else {
      // 가로 화면: 고나(그림 가운데)를 가리지 않도록 그림 오른쪽 아래 (과일·돌 자리)
      this.root.classList.add('side');
      Object.assign(ui.style, { left: '0px', right: 'auto', width: 'max-content' });
      const uiW = ui.offsetWidth || unit * 40;
      const cx = left + iw * 0.8;
      const x = Math.min(vw - uiW - 8, Math.max(left + iw * 0.62, cx - uiW / 2));
      Object.assign(ui.style, { left: `${x}px`, right: 'auto', bottom: `${Math.max(10, vh * 0.05)}px` });
    }
  }

  /** 게임 시작 버튼 (Space 키도) */
  start(): void {
    if (this.started || !this.shown) return;
    this.started = true;
    sound.unlock();
    sound.start();
    sound.startMusic('title');
    this.btn.classList.add('pressed');
    this.root.classList.add('leaving');
    window.setTimeout(() => this.onStart(true), 350);
    window.setTimeout(() => this.root.classList.add('hidden'), 900);
  }
}
