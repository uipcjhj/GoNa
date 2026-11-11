/**
 * 엔딩 액자 (DOM): 같은 자리·같은 크기의 픽셀 액자 안에 장면 일러스트·영상을 원래 비율 그대로(contain) 보여 줌.
 *   장면 1~3: 기존 일러스트 (1 노을 마을 · 2 달리는 고나 + 발걸음 · 3 가족 발견)
 *   장면 4: ending_01_running_hug.mp4 → 5: 그 마지막 프레임 그대로 · 6: ending_02_grandma_kiss → ending_03_uncle_sniff
 *   7: 킁카 영상 마지막 프레임 그대로 · 8: ending_04_family_portrait (끝나면 마지막 프레임) → 황금 액자 피날레(ui/endingUi.ts)
 *   영상: 음소거 · playsinline · 미리 받기 · 끝나면 마지막 프레임 유지 · 실패하면 같은 장면의 정지 그림(첫/마지막 프레임)으로 대신
 * 그림은 다시 그리지 않고 작은 효과만 액자 안에: 달리기 발걸음(두 그림 번갈아) · 발밑 먼지 · 하트 · 킁카 냄새 · 별빛.
 * 자리: 세로 = 위 버튼 아래 ~ 아래 대사창 위 사이 가운데 / 가로 = 위 대사창 아래 ~ 화면 아래 사이 가운데
 *       (대사 길이와 상관없이 정해진 여백으로 계산 → 장면·대사가 바뀌어도 액자는 그대로)
 */
import { bus, EV } from '../events';
import { el } from './dom';

const DIR = 'assets/ending/frames/';
const VDIR = 'assets/ending/';
/** 장면 1~3 그림 (2 = 달리는 고나: '걷고, 달리고' · 3 = 가족 발견: '얼굴들이 보였어요') */
const IMAGES = ['s1', 's3', 's2'];
const VIDEOS = ['ending_01_running_hug', 'ending_02_grandma_kiss', 'ending_03_uncle_sniff', 'ending_04_family_portrait'] as const;
const VLEN = 5.04;
/** 액자 안쪽 화면비 (그림 2.5 · 영상 1.34~1.79 — contain 이라 잘리지 않음) */
const ASPECT = 1.6;
const BORDER = 6;

let preloaded = false;
/** 엔딩 그림을 미리 받아 둠 (최종 보스전 때) */
export function preloadEndingFrames(): void {
  if (preloaded) return;
  preloaded = true;
  for (const f of [...IMAGES, 's3b']) {
    const im = new Image();
    im.src = `${DIR}${f}.png`;
  }
  // 영상은 첫 프레임 그림만 미리 (영상 자체는 엔딩이 시작될 때 받기 시작)
  for (const v of VIDEOS) {
    const im = new Image();
    im.src = `${VDIR}video/${v}-first.jpg`;
  }
}

export class EndingFrame {
  readonly root: HTMLDivElement;
  private imgs: HTMLImageElement[];
  private front = 0;
  private fx: HTMLDivElement;
  index = -1;
  private stepTimer = 0;
  private vids: HTMLVideoElement[] = [];
  /** 지금 보이는 영상 번호 (-1 = 그림) */
  private vidOn = -1;
  private vidTimer = 0;
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
    // 영상 4개 (하나만 보임) — 같은 액자 안, 그림 위
    this.vids = VIDEOS.map((name) => {
      const v = document.createElement('video');
      v.className = 'ef-vid';
      v.muted = true;
      v.defaultMuted = true;
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.setAttribute('webkit-playsinline', '');
      v.setAttribute('muted', '');
      v.preload = 'none';
      v.disablePictureInPicture = true;
      v.poster = `${VDIR}video/${name}-first.jpg`;
      v.dataset.name = name;
      inner.append(v);
      return v;
    });
    this.fx = el('div', 'ef-fx');
    inner.append(this.fx);
    this.root.append(inner);
    parent.append(this.root);
    bus.on(EV.endingStart, () => this.reset());
    bus.on(EV.endingFrame, (i: number, late = 0) => this.show(i, late));
    bus.on(EV.endingPhase, (p: string) => {
      if (p === 'title' || p === 'finale') this.fadeOut();
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
    this.stopVideos();
    // 영상 미리 받기 (엔딩이 시작될 때 모두)
    for (const v of this.vids) {
      if (v.preload !== 'auto') {
        v.preload = 'auto';
        v.src = `${VDIR}${v.dataset.name}.mp4`;
        v.load();
      }
    }
    for (const im of this.imgs) {
      im.removeAttribute('src');
      im.classList.remove('on');
    }
    this.root.classList.remove('hidden', 'out');
    this.layout();
  }

  hide(): void {
    this.clearFx();
    this.stopVideos();
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

  private stopVideos(): void {
    clearTimeout(this.vidTimer);
    for (const v of this.vids) {
      v.pause();
      v.onended = null;
      v.classList.remove('on');
    }
    this.vidOn = -1;
  }

  /** 정지 그림 보이기 (그림 장면 · 영상 실패 때 대신) */
  private showImage(src: string): void {
    const next = this.imgs[1 - this.front];
    const cur = this.imgs[this.front];
    next.src = src;
    next.classList.add('on');
    cur.classList.remove('on');
    this.front = 1 - this.front;
  }

  /**
   * 영상 k 를 at 초부터 재생 (at 이 끝 근처면 마지막 프레임에 멈춤). 새 영상이 실제로 그려지기 시작할 때 이전 것을 감춤 → 검은 화면 없음.
   * 2.5초 안에 못 그리면(로딩 실패·자동 재생 막힘) 같은 장면의 정지 그림으로 대신 — 엔딩 진행은 시간대로 계속
   */
  private playVideo(k: number, at: number, then?: () => void): void {
    clearTimeout(this.vidTimer);
    const v = this.vids[k];
    const hold = at >= VLEN - 0.15;
    const reveal = (): void => {
      if (this.vids[k] !== v) return;
      for (const o of this.vids) if (o !== v) {
        o.classList.remove('on');
        o.pause();
      }
      v.classList.add('on');
      for (const im of this.imgs) im.classList.remove('on');
      this.vidOn = k;
    };
    const start = (): void => {
      try {
        if (hold) v.currentTime = Math.max(0, (v.duration || VLEN) - 0.05);
        else if (at > 0.05) v.currentTime = at;
        else if (v.currentTime > 0.05 && !v.paused) v.currentTime = 0;
      } catch {
        /* 메타데이터 전 */
      }
      if (hold) {
        v.pause();
        reveal();
        return;
      }
      v.onended = () => {
        v.onended = null;
        then?.(); // 다음 영상 (뽀뽀 → 킁카) · 없으면 마지막 프레임 그대로
      };
      const p = v.play();
      if (p) p.then(reveal, () => fallback());
      else reveal();
    };
    const fallback = (): void => {
      if (this.vids[k] !== v || v.classList.contains('on')) return;
      this.showImage(`${VDIR}video/${VIDEOS[k]}-${hold || at > 2.5 ? 'last' : 'first'}.${k === 3 && (hold || at > 2.5) ? 'png' : 'jpg'}`);
      if (then) this.vidTimer = window.setTimeout(then, Math.max(0, (VLEN - at) * 1000));
    };
    if (v.readyState >= 1) start();
    else {
      v.addEventListener('loadedmetadata', start, { once: true });
      if (v.preload !== 'auto') {
        v.preload = 'auto';
        v.src = `${VDIR}${VIDEOS[k]}.mp4`;
      }
      v.load();
    }
    v.addEventListener('error', fallback, { once: true });
    this.vidTimer = window.setTimeout(() => {
      if (!v.classList.contains('on')) fallback();
    }, 2500);
  }

  /** 장면 i (부드럽게 겹쳐 바뀜 — 액자는 그대로). late = 예정보다 늦게 불린 초 (빨리 감기·다음 버튼) */
  show(i: number, late = 0): void {
    if (i === this.index) return;
    const prev = this.index;
    this.index = i;
    this.clearFx();
    this.root.classList.remove('hidden', 'out');
    this.root.dataset.scene = String(i + 1);
    this.layout();
    if (i <= 2) {
      this.stopVideos();
      this.showImage(`${DIR}${IMAGES[i]}.png`);
      this.ambient(i);
      return;
    }
    // 영상 장면
    if (i === 3) this.playVideo(0, late);
    else if (i === 4) {
      // 가족의 품: 달려와 안긴 영상의 마지막 프레임 그대로 (이어서 왔으면 이미 멈춰 있음)
      if (!(prev === 3 && this.vidOn === 0)) this.playVideo(0, VLEN);
    } else if (i === 5) {
      // 뽀뽀 → 이어서 킁카 (하나의 내레이션)
      if (late >= VLEN) this.playVideo(2, late - VLEN);
      else this.playVideo(1, late, () => this.index === 5 && this.playVideo(2, 0));
    } else if (i === 6) {
      if (!(prev === 5 && this.vidOn === 2)) this.playVideo(2, VLEN);
    } else if (i === 7) this.playVideo(3, late);
  }

  /** (테스트) 지금 보이는 영상 이름 · 위치 */
  get videoState(): { name: string; t: number; paused: boolean; ended: boolean } | null {
    const v = this.vids[this.vidOn];
    return v ? { name: VIDEOS[this.vidOn], t: v.currentTime, paused: v.paused, ended: v.ended } : null;
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
    if (i === 1) {
      // 달리는 고나 (s3 그림): 같은 그림의 고나 부분만 2px 올라간 그림과 번갈아 → 통통 발걸음 · 발밑 먼지
      let up = false;
      this.stepTimer = window.setInterval(() => {
        up = !up;
        img.src = `${DIR}${up ? 's3b' : 's3'}.png`;
      }, 190);
      this.every(520, () => this.add('ef-dust', 36 + Math.random() * 4, 70 + Math.random() * 3));
    }
  }


}
