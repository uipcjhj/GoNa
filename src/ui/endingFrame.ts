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
/** 장면 3 가족 그림을 보여 주는 시간 · 성장 회상이 끝나는 때 (장면 시작 기준 초) */
export const S3_FAMILY_SHOW = 4.2;
export const GROW_END = { egg: 8.8, grow: 11.8 };
const VIDEOS = ['ending_01_running_hug', 'ending_02_grandma_kiss', 'ending_03_uncle_sniff', 'ending_04_family_portrait'] as const;
const VLEN = 5.04;
/** 액자 안쪽 화면비 (그림 2.5 · 영상 1.34~1.79 — contain 이라 잘리지 않음) */
const ASPECT = 1.6;
const BORDER = 6;

let preloaded = false;
/** 화면의 엔딩 액자 (한 개) — 최종 보스전 때 '터치로 영상 잠금 풀기'를 켜기 위해 */
let frameInstance: EndingFrame | null = null;
/** 엔딩 그림을 미리 받아 둠 (최종 보스전 때) */
export function preloadEndingFrames(): void {
  // 아이폰(특히 저전력 모드)은 터치로 한 번 재생된 적 없는 영상의 자동 재생을 막음 → 보스전 중 터치에서 영상 4개를 미리 깨워 둠
  frameInstance?.armUnlock();
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
  private doneTimer = 0;
  readonly growth = new EndingGrowth();
  /** 터치(사용자 동작)가 오면 영상들을 깨움 (최종 보스전 ~ 엔딩) */
  private unlockArmed = false;
  /** 재생이 막혀(자동 재생 제한) 다음 터치를 기다리는 영상 */
  private pendingPlay: (() => void) | null = null;
  /** (검증·문제 확인용) 영상 재생 기록 · 오류 */
  readonly videoLog: string[] = [];

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
    frameInstance = this;
    // 사용자 동작으로 인정되는 이벤트(터치 끝·클릭·키)에서 영상 잠금 풀기 — 아이폰 Safari 는 touchstart/pointerdown 은 인정하지 않음
    const onGesture = (): void => this.onGesture();
    for (const ev of ['touchend', 'click', 'keydown'] as const) document.addEventListener(ev, onGesture, { capture: true, passive: true });
    bus.on(EV.endingStart, () => {
      this.armUnlock();
      this.reset();
    });
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
      delete v.dataset.unlocked;
      v.load();
    }
    this.root.classList.add('hidden');
    this.index = -1;
    this.unlockArmed = false;
    this.pendingPlay = null;
  }

  private fadeOut(): void {
    this.clearFx();
    this.growth.stop();
    this.root.classList.add('out');
  }

  private clearFx(): void {
    clearTimeout(this.sceneTimer);
    this.sceneTimer = 0;
    clearTimeout(this.doneTimer);
    this.doneTimer = 0;
    for (const t of this.fxTimers) clearInterval(t);
    this.fxTimers = [];
    this.fx.replaceChildren();
  }

  private stopVideos(): void {
    clearTimeout(this.vidTimer);
    this.pendingPlay = null;
    for (const v of this.vids) {
      v.pause();
      v.onended = null;
      delete v.dataset.want;
      v.classList.remove('on');
    }
    this.vidOn = -1;
  }

  /** 영상 파일 연결 (아직이면) */
  private ensureSrc(k: number): HTMLVideoElement {
    const v = this.vids[k];
    if (!v.getAttribute('src')) {
      v.preload = 'auto';
      v.src = `${VDIR}${VIDEOS[k]}.mp4`;
    }
    return v;
  }

  private log(msg: string): void {
    this.videoLog.push(`${(performance.now() / 1000).toFixed(1)} ${msg}`);
    if (this.videoLog.length > 40) this.videoLog.shift();
  }

  /** 최종 보스전·엔딩 동안 터치가 오면 영상 잠금을 풂 */
  armUnlock(): void {
    this.unlockArmed = true;
  }

  /**
   * 사용자 동작(터치 끝·클릭) 안에서: ① 재생이 막혀 기다리던 영상을 바로 재생 ② 아직 깨우지 않은 영상들을 한 번 재생→멈춤.
   * 아이폰 Safari 는 이렇게 '터치로 재생된 적 있는' 영상만 나중에 코드로 재생할 수 있게 해 줌 (저전력 모드 포함).
   */
  private onGesture(): void {
    if (this.pendingPlay) {
      const go = this.pendingPlay;
      this.pendingPlay = null;
      go();
    }
    if (!this.unlockArmed) return;
    for (let k = 0; k < this.vids.length; k++) {
      const v = this.vids[k];
      if (v.dataset.unlocked || v.dataset.unlocking) continue;
      if (v.dataset.want) {
        v.dataset.unlocked = '1';
        continue;
      }
      this.ensureSrc(k);
      v.dataset.unlocking = '1';
      const p = v.play();
      const settle = (): void => {
        delete v.dataset.unlocking;
        v.dataset.unlocked = '1';
        v.dataset.primed = '1';
        if (v.dataset.want) return;
        v.pause();
        try {
          v.currentTime = 0;
        } catch {
          /* 메타데이터 전 */
        }
      };
      if (p) p.then(settle, (e: Error) => {
        delete v.dataset.unlocking;
        this.log(`unlock ${VIDEOS[k]} ${e?.name ?? e}`);
      });
      else settle();
    }
    if (this.vids.every((v) => v.dataset.unlocked)) this.unlockArmed = false;
  }

  /**
   * 영상 준비: 보이지 않는 채로 한 번 재생했다가 바로 멈춤 → 아이폰 Safari 도 첫 프레임을 미리 받아 디코딩해 둠
   * (preload 만으로는 아이폰이 받지 않음). 그 사이 진짜 재생이 시작되면(want) 멈추지 않음.
   */
  private prime(k: number): void {
    const v = this.vids[k];
    if (!v || v.dataset.primed) return;
    v.dataset.primed = '1';
    this.ensureSrc(k);
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
    if (p) p.then(settle, (e: Error) => {
      delete v.dataset.primed;
      this.log(`prime ${VIDEOS[k]} ${e?.name ?? e}`);
    });
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
   * 영상 k 를 at 초부터 재생 (at 이 끝 근처면 마지막 프레임에 멈춤). 영상이 실제로 재생되기 시작할 때 이전 그림을 감춤 → 검은 화면 없음.
   *   - play() 를 바로 부름: 아이폰 Safari 는 play() 전에는 영상을 받지 않아 'loadedmetadata' 를 기다리면 영원히 오지 않을 수 있음
   *   - 재생이 막히면(NotAllowedError — 저전력 모드 등) 다음 터치 때 바로 다시 재생 · 그동안 엔딩이 멈추지 않게
   *     같은 장면의 정지 그림을 잠깐 보여 주고 영상 길이만큼 기다렸다 다음으로 (영상이 나중에 재생되면 그대로 영상으로 바뀜)
   *   - 파일 오류(error)·8초 동안 재생 시작 못 함 → 같은 처리 + 기록(videoLog)
   *   then: 영상이 끝나면 한 번만 (끝남 · 대신 진행 중 어느 쪽이 먼저든)
   */
  private playVideo(k: number, at: number, then?: () => void): void {
    clearTimeout(this.vidTimer);
    this.pendingPlay = null;
    const v = this.ensureSrc(k);
    v.dataset.want = '1';
    const hold = at >= VLEN - 0.15;
    let finished = false;
    const once = (): void => {
      if (finished || this.vids[k] !== v || !v.dataset.want) return;
      finished = true;
      then?.();
    };
    let shown = false;
    const reveal = (): void => {
      if (!v.dataset.want || shown) return;
      shown = true;
      clearTimeout(this.vidTimer);
      for (const o of this.vids) if (o !== v) {
        o.classList.remove('on');
        o.pause();
      }
      v.classList.add('on');
      for (const im of this.imgs) im.classList.remove('on');
      this.vidOn = k;
    };
    let fellBack = false;
    const fallback = (why: string): void => {
      if (shown || fellBack || !v.dataset.want) return;
      fellBack = true;
      this.log(`fallback ${VIDEOS[k]} ${why} (readyState ${v.readyState}, network ${v.networkState}, error ${v.error?.code ?? '-'})`);
      this.showImage(`${VDIR}video/${VIDEOS[k]}-${hold || at > 2.5 ? 'last' : 'first'}.${k === 3 && (hold || at > 2.5) ? 'png' : 'jpg'}`);
      if (then) this.vidTimer = window.setTimeout(once, Math.max(0, (VLEN - at) * 1000));
    };
    const tryPlay = (): void => {
      const p = v.play();
      if (!p) {
        reveal();
        return;
      }
      p.then(
        () => {
          this.log(`play ${VIDEOS[k]}`);
          reveal();
        },
        (e: Error) => {
          if (!v.dataset.want) return;
          const name = e?.name ?? String(e);
          if (name === 'AbortError') return; // 다른 재생 요청에 밀림 — 다음 요청이 처리
          // 자동 재생 막힘: 다음 터치 때 바로 재생
          if (name === 'NotAllowedError') this.pendingPlay = () => v.dataset.want && tryPlay();
          fallback(name);
        },
      );
    };
    if (hold) {
      // 마지막 프레임: 길이를 알면 끝으로 옮기고 멈춤 (모르면 재생으로 받기 시작 → 길이를 알게 되면 끝으로)
      const toEnd = (): void => {
        try {
          v.currentTime = Math.max(0, (v.duration || VLEN) - 0.05);
        } catch {
          /* 메타데이터 전 */
        }
        v.pause();
        if (v.readyState >= 2) reveal();
        else v.addEventListener('seeked', reveal, { once: true });
        once();
      };
      if (v.readyState >= 1) toEnd();
      else {
        v.addEventListener('loadedmetadata', toEnd, { once: true });
        v.play().catch(() => {});
        this.vidTimer = window.setTimeout(() => {
          fallback('hold-timeout');
          once();
        }, 8000);
      }
      return;
    }
    v.onended = () => {
      v.onended = null;
      once(); // 다음 영상 (뽀뽀 → 킁카) · 없으면 마지막 프레임 그대로
    };
    try {
      if (at > 0.05) {
        if (v.readyState >= 1) v.currentTime = at;
        else v.addEventListener('loadedmetadata', () => (v.currentTime = at), { once: true });
      } else if (v.currentTime > 0.05) v.currentTime = 0;
    } catch {
      /* 메타데이터 전 */
    }
    v.addEventListener('error', () => fallback(`error ${v.error?.code ?? ''}`), { once: true });
    tryPlay();
    // 8초 안에 재생이 시작되지 않으면 (아주 느린 네트워크 등) 정지 그림으로 진행 — 영상은 계속 받다가 시작되면 영상으로 바뀜
    this.vidTimer = window.setTimeout(() => fallback('timeout'), 8000);
  }

  /** 장면 i 의 그림 애니메이션·영상이 끝남 → 엔딩 씬이 '다음 ▶'·자동 전환을 정함 (장면이 이미 바뀌었으면 무시) */
  private done(i: number, afterSec = 0): void {
    const fire = (): void => {
      if (this.index === i) bus.emit(EV.endingMediaDone, i);
    };
    if (afterSec <= 0) fire();
    else this.doneTimer = window.setTimeout(fire, afterSec * 1000);
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
      this.done(i, Math.max(0, (i === 0 ? GROW_END.egg : GROW_END.grow) - late));
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
      this.done(2, Math.max(0, S3_FAMILY_AT + S3_FAMILY_SHOW - late));
      return;
    }
    if (i === 3) {
      // 장면 4: 달려가는 고나(그림 전체만 아주 느리게 확대) → 달려가 안기는 영상
      this.stopVideos();
      if (late < S4_VIDEO_AT) {
        this.showImage(`${DIR}s3.png`, true);
        this.sceneTimer = window.setTimeout(() => this.index === 3 && this.playVideo(0, 0, () => this.done(3)), (S4_VIDEO_AT - late) * 1000);
      } else this.playVideo(0, late - S4_VIDEO_AT, () => this.done(3));
      this.prime(1);
      return;
    }
    if (i === 4) {
      // 가족의 품: 달려와 안긴 영상이 이어서 끝까지 → 마지막 프레임 그대로 (이어서 왔으면 손대지 않음)
      if (!(prev === 3 && this.vidOn === 0)) this.playVideo(0, VLEN);
      this.prime(1);
      this.prime(2);
      this.done(4);
    } else if (i === 5) {
      // 뽀뽀 → 이어서 킁카 (하나의 내레이션)
      const end = (): void => this.done(5);
      if (late >= VLEN) this.playVideo(2, late - VLEN, end);
      else this.playVideo(1, late, () => this.index === 5 && this.playVideo(2, 0, end));
      this.prime(2);
    } else if (i === 6) {
      if (!(prev === 5 && this.vidOn === 2)) this.playVideo(2, VLEN);
      this.prime(3);
      this.done(6);
    } else if (i === 7) this.playVideo(3, late, () => this.done(7));
  }

  /** (테스트) 지금 보이는 영상 이름 · 위치 */
  get videoState(): { name: string; t: number; paused: boolean; ended: boolean } | null {
    const v = this.vids[this.vidOn];
    return v ? { name: VIDEOS[this.vidOn], t: v.currentTime, paused: v.paused, ended: v.ended } : null;
  }
}
