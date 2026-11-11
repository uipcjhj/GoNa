/**
 * 엔딩 액자 (DOM): 같은 자리·같은 크기의 픽셀 액자 안에 장면을 원래 비율 그대로(contain) 보여 줌.
 *   장면 1: 둥지 속 알 → 알에서 태어난 아기 고나 (성장 회상 캔버스 — ui/endingGrowth.ts)
 *   장면 2: 기어 다니는 고나 → 혼자 일어서기 → 두 발로 달리기 → 자이언트 곤룡 고나 (같은 캔버스)
 *   장면 3: 노을 마을(s1) → 기다리던 가족 발견(s2)
 *   장면 4: 달려가는 고나(s3, 그림 전체만 아주 느리게 100→104% 확대) → ending_01_running_hug.mp4
 *   장면 5: 그 마지막 프레임 그대로 · 6: ending_02_grandma_kiss → ending_03_uncle_sniff · 7: 킁카 마지막 프레임
 *   장면 8: ending_04_family_portrait (끝나면 마지막 프레임) → 황금 액자 피날레(ui/endingUi.ts)
 *   영상: 음소거 · playsinline · 장면보다 먼저 한 번 재생·멈춤으로 준비(첫 프레임 디코딩) · 끝나면 마지막 프레임 유지
 *         · 실패하면 같은 장면의 정지 그림(첫/마지막 프레임)으로 대신 — 엔딩 진행은 멈추지 않음
 * 그림 속 인물만 따로 움직이는 효과는 쓰지 않음 (워프·찌그러짐 없음).
 * 자리: 세로 = 위 버튼 아래 ~ 아래 대사창 위 사이 가운데 / 가로 = 위 대사창 아래 ~ 화면 아래 사이 가운데
 *       (대사 길이와 상관없이 정해진 여백으로 계산 → 장면·대사가 바뀌어도 액자는 그대로)
 */
import { bus, EV } from '../events';
import { el } from './dom';
import { EndingGrowth, preloadGrowth } from './endingGrowth';

const DIR = 'assets/ending/frames/';
const VDIR = 'assets/ending/';
/** 그림 장면 — 장면 3: 노을 마을 → 가족 발견 · 장면 4 앞부분: 달려가는 고나 */
const IMAGES = ['s1', 's2', 's3'];
/** 장면 3 에서 마을 → 가족으로 바뀌는 때 · 장면 4 에서 달리기 그림 → 영상으로 바뀌는 때 (장면 시작 기준 초) */
export const S3_FAMILY_AT = 3.6;
export const S4_VIDEO_AT = 3.6;
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
  preloadGrowth();
  for (const f of IMAGES) {
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
  private vids: HTMLVideoElement[] = [];
  /** 지금 보이는 영상 번호 (-1 = 그림) */
  private vidOn = -1;
  private vidTimer = 0;
  private fxTimers: number[] = [];
  /** 장면 안에서 다음 그림·영상으로 넘어가는 예약 (장면이 바뀌면 취소) */
  private sceneTimer = 0;
  readonly growth = new EndingGrowth();

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
    inner.append(this.growth.canvas);
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
    this.growth.stop();
    // 엔딩을 나가면 영상 메모리를 놓아 줌 (다음 엔딩 때 다시 받음)
    for (const v of this.vids) {
      v.removeAttribute('src');
      v.preload = 'none';
      delete v.dataset.primed;
      v.load();
    }
    this.root.classList.add('hidden');
    this.index = -1;
  }

  private fadeOut(): void {
    this.clearFx();
    this.growth.stop();
    this.root.classList.add('out');
  }

  private clearFx(): void {
    clearTimeout(this.sceneTimer);
    this.sceneTimer = 0;
    for (const t of this.fxTimers) clearInterval(t);
    this.fxTimers = [];
    this.fx.replaceChildren();
  }

  private stopVideos(): void {
    clearTimeout(this.vidTimer);
    for (const v of this.vids) {
      v.pause();
      v.onended = null;
      delete v.dataset.want;
      v.classList.remove('on');
    }
    this.vidOn = -1;
  }

  /**
   * 영상 준비: 보이지 않는 채로 한 번 재생했다가 바로 멈춤 → 아이폰 Safari 도 첫 프레임을 미리 디코딩해 둠
   * (preload 만으로는 아이폰이 받지 않음). 그 사이 진짜 재생이 시작되면(want) 멈추지 않음.
   */
  private prime(k: number): void {
    const v = this.vids[k];
    if (!v || v.dataset.primed) return;
    v.dataset.primed = '1';
    if (v.preload !== 'auto' || !v.getAttribute('src')) {
      v.preload = 'auto';
      v.src = `${VDIR}${VIDEOS[k]}.mp4`;
      v.load();
    }
    const p = v.play();
    const settle = (): void => {
      if (v.dataset.want) return;
      v.pause();
      try {
        v.currentTime = 0;
      } catch {
        /* 메타데이터 전 */
      }
    };
    if (p) p.then(settle, () => delete v.dataset.primed);
    else settle();
  }

  /** 정지 그림 보이기 (그림 장면 · 영상 실패 때 대신) */
  private showImage(src: string, zoom = false): void {
    const next = this.imgs[1 - this.front];
    const cur = this.imgs[this.front];
    next.classList.remove('zoom');
    next.src = src;
    if (zoom) {
      void next.offsetWidth; // 확대 애니메이션을 처음부터
      next.classList.add('zoom');
    }
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
    v.dataset.want = '1';
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
    if (i <= 1) {
      // 장면 1·2: 성장 회상 (알 → 탄생 / 기기 → 서기 → 달리기 → 최종 성장)
      this.stopVideos();
      for (const im of this.imgs) im.classList.remove('on');
      this.growth.start(i as 0 | 1, late);
      if (i === 1) this.prime(0); // 장면 4 영상 준비 (한참 전에)
      return;
    }
    this.growth.stop();
    if (i === 2) {
      // 장면 3: 노을 마을 → 기다리던 가족
      this.stopVideos();
      if (late < S3_FAMILY_AT) {
        this.showImage(`${DIR}s1.png`);
        this.sceneTimer = window.setTimeout(() => this.index === 2 && this.showImage(`${DIR}s2.png`), (S3_FAMILY_AT - late) * 1000);
      } else this.showImage(`${DIR}s2.png`);
      this.prime(0);
      return;
    }
    if (i === 3) {
      // 장면 4: 달려가는 고나(그림 전체만 아주 느리게 확대) → 달려가 안기는 영상
      this.stopVideos();
      if (late < S4_VIDEO_AT) {
        this.showImage(`${DIR}s3.png`, true);
        this.sceneTimer = window.setTimeout(() => this.index === 3 && this.playVideo(0, 0), (S4_VIDEO_AT - late) * 1000);
      } else this.playVideo(0, late - S4_VIDEO_AT);
      this.prime(1);
      return;
    }
    if (i === 4) {
      // 가족의 품: 달려와 안긴 영상이 이어서 끝까지 → 마지막 프레임 그대로 (이어서 왔으면 손대지 않음)
      if (!(prev === 3 && this.vidOn === 0)) this.playVideo(0, VLEN);
      this.prime(1);
      this.prime(2);
    } else if (i === 5) {
      // 뽀뽀 → 이어서 킁카 (하나의 내레이션)
      if (late >= VLEN) this.playVideo(2, late - VLEN);
      else this.playVideo(1, late, () => this.index === 5 && this.playVideo(2, 0));
      this.prime(2);
    } else if (i === 6) {
      if (!(prev === 5 && this.vidOn === 2)) this.playVideo(2, VLEN);
      this.prime(3);
    } else if (i === 7) this.playVideo(3, late);
  }

  /** (테스트) 지금 보이는 영상 이름 · 위치 */
  get videoState(): { name: string; t: number; paused: boolean; ended: boolean } | null {
    const v = this.vids[this.vidOn];
    return v ? { name: VIDEOS[this.vidOn], t: v.currentTime, paused: v.paused, ended: v.ended } : null;
  }
}
