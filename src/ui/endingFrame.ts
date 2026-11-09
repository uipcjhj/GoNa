/**
 * 엔딩 액자 (DOM): 같은 자리·같은 크기의 픽셀 액자 안에 장면 일러스트(s1~s8)를 원래 비율 그대로(contain) 보여 줌.
 * 그림은 다시 그리지 않고 작은 효과만 액자 안에: 달리기 발걸음(두 그림 번갈아) · 발밑 먼지 · 하트 · 킁카 냄새 · 별빛.
 * 자리: 세로 = 위 버튼 아래 ~ 아래 대사창 위 사이 가운데 / 가로 = 위 대사창 아래 ~ 화면 아래 사이 가운데
 *       (대사 길이와 상관없이 정해진 여백으로 계산 → 장면·대사가 바뀌어도 액자는 그대로)
 */
import { bus, EV } from '../events';
import { el } from './dom';

const DIR = 'assets/ending/frames/';
const FILES = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];
/** 액자 안쪽 화면비 (그림들은 2.44~2.59 — contain 이라 잘리지 않음) */
const ASPECT = 2.5;
const BORDER = 6;

let preloaded = false;
/** 엔딩 그림을 미리 받아 둠 (최종 보스전 때) */
export function preloadEndingFrames(): void {
  if (preloaded) return;
  preloaded = true;
  for (const f of [...FILES, 's3b', 'fx-heart', 'fx-sniff']) {
    const im = new Image();
    im.src = `${DIR}${f}.png`;
  }
}

export class EndingFrame {
  readonly root: HTMLDivElement;
  private imgs: HTMLImageElement[];
  private front = 0;
  private fx: HTMLDivElement;
  index = -1;
  private stepTimer = 0;
  private fxTimers: number[] = [];

  constructor(parent: HTMLElement) {
    this.root = el('div', 'end-frame hidden');
    const inner = el('div', 'ef-inner');
    this.imgs = [0, 1].map(() => {
      const im = el('img', 'ef-img') as HTMLImageElement;
      im.alt = '';
      im.draggable = false;
      inner.append(im);
      return im;
    });
    this.fx = el('div', 'ef-fx');
    inner.append(this.fx);
    this.root.append(inner);
    parent.append(this.root);
    bus.on(EV.endingStart, () => this.reset());
    bus.on(EV.endingFrame, (i: number) => this.show(i));
    bus.on(EV.endingFx, (k: 'kiss' | 'sniff') => this.burst(k));
    bus.on(EV.endingPhase, (p: string) => {
      if (p === 'title') this.fadeOut();
    });
    window.addEventListener('resize', () => this.layout());
    window.addEventListener('orientationchange', () => window.setTimeout(() => this.layout(), 200));
  }

  /** 액자 자리·크기 (화면 크기로만 정함) */
  layout(): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const probe = el('div', 'ef-safe');
    document.body.append(probe);
    const cs = getComputedStyle(probe);
    const safeT = parseFloat(cs.paddingTop) || 0;
    const safeB = parseFloat(cs.paddingBottom) || 0;
    probe.remove();
    const portrait = vh >= vw || vh > 500;
    let top: number;
    let bottom: number;
    if (portrait) {
      top = safeT + 56; // 위 버튼(메뉴·소리)
      bottom = vh - safeB - 176; // 아래 대사창 (세 줄 + 다음 버튼)
    } else {
      top = safeT + 116; // 위 대사창 (두 줄 + 다음 버튼)
      bottom = vh - safeB - 8;
    }
    const availH = Math.max(60, bottom - top);
    let w = Math.min(vw - 16, 760);
    let h = (w - BORDER * 2) / ASPECT + BORDER * 2;
    if (h > availH) {
      h = availH;
      w = (h - BORDER * 2) * ASPECT + BORDER * 2;
    }
    w = Math.round(w);
    h = Math.round(h);
    const s = this.root.style;
    s.width = `${w}px`;
    s.height = `${h}px`;
    s.left = `${Math.round((vw - w) / 2)}px`;
    s.top = `${Math.round(top + (availH - h) / 2)}px`;
  }

  private reset(): void {
    this.clearFx();
    this.index = -1;
    for (const im of this.imgs) {
      im.removeAttribute('src');
      im.classList.remove('on');
    }
    this.root.classList.remove('hidden', 'out');
    this.layout();
  }

  hide(): void {
    this.clearFx();
    this.root.classList.add('hidden');
    this.index = -1;
  }

  private fadeOut(): void {
    this.clearFx();
    this.root.classList.add('out');
  }

  private clearFx(): void {
    clearInterval(this.stepTimer);
    this.stepTimer = 0;
    for (const t of this.fxTimers) clearInterval(t);
    this.fxTimers = [];
    this.fx.replaceChildren();
  }

  /** 장면 i 그림으로 (부드럽게 겹쳐 바뀜 — 액자는 그대로) */
  show(i: number): void {
    if (i === this.index) return;
    this.index = i;
    this.clearFx();
    this.root.classList.remove('hidden', 'out');
    this.root.dataset.scene = String(i + 1);
    this.layout();
    const next = this.imgs[1 - this.front];
    const cur = this.imgs[this.front];
    next.src = `${DIR}${FILES[i]}.png`;
    next.classList.add('on');
    cur.classList.remove('on');
    this.front = 1 - this.front;
    this.ambient(i);
  }

  private add(cls: string, x: number, y: number, src?: string): HTMLElement {
    const e = src ? (el('img', `ef-p ${cls}`) as HTMLImageElement) : el('span', `ef-p ${cls}`);
    if (src) (e as HTMLImageElement).src = `${DIR}${src}.png`;
    e.style.left = `${x}%`;
    e.style.top = `${y}%`;
    this.fx.append(e);
    e.addEventListener('animationend', () => e.remove());
    return e;
  }

  private every(ms: number, fn: () => void): void {
    fn();
    this.fxTimers.push(window.setInterval(fn, ms));
  }

  /** 장면마다 작은 효과 */
  private ambient(i: number): void {
    const img = this.imgs[this.front];
    if (i === 2) {
      // 달려가기: 같은 그림의 고나 부분만 2px 올라간 그림과 번갈아 → 통통 발걸음 · 발밑 먼지
      let up = false;
      this.stepTimer = window.setInterval(() => {
        up = !up;
        img.src = `${DIR}${up ? 's3b' : 's3'}.png`;
      }, 190);
      this.every(520, () => this.add('ef-dust', 36 + Math.random() * 4, 84 + Math.random() * 4));
    } else if (i === 3 || i === 5) {
      // 가족 재회·단체: 작은 하트가 천천히 나타났다 사라짐
      this.every(1900, () => this.add('ef-heart', 30 + Math.random() * 40, 14 + Math.random() * 14, 'fx-heart'));
    } else if (i === 6) {
      this.every(2400, () => this.add('ef-heart', 42 + Math.random() * 16, 12 + Math.random() * 10, 'fx-heart'));
    } else if (i === 7) {
      // 마지막: 밤하늘 별빛이 은은하게
      for (let k = 0; k < 14; k++) {
        const s = this.add('ef-star', 4 + ((k * 37) % 92), 4 + ((k * 23) % 34));
        s.style.animationDelay = `${(k % 7) * 0.45}s`;
      }
    }
  }

  /** 장면 5: 뽀뽀(왼쪽 그림) 하트 1~2개 / 킁카(오른쪽 그림) 냄새 */
  private burst(k: 'kiss' | 'sniff'): void {
    if (this.index !== 4) return;
    if (k === 'kiss') {
      this.add('ef-heart big', 26, 22, 'fx-heart');
      window.setTimeout(() => this.index === 4 && this.add('ef-heart', 33, 16, 'fx-heart'), 450);
    } else {
      this.add('ef-sniff', 66, 12, 'fx-sniff');
      window.setTimeout(() => this.index === 4 && this.add('ef-sniff', 70, 8, 'fx-sniff'), 600);
    }
  }
}
