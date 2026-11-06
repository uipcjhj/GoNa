/**
 * 움직이는 대표 타이틀 (오프닝 4종 에셋: art-src/title4 → tools/build_title4.py → public/assets/title4)
 *
 * 레이어 (아래 → 위, 모두 따로 움직임)
 *   1 배경        bg.png (정적, 가로 화면이면 양옆은 배경 가장자리 색)
 *   2 고나        6개 포즈를 발끝 기준으로 정렬한 스프라이트 (걷기 2장 · 놀람 · 잠자리채 · 먹기 · 총총)
 *   3 곤충·과일   나비(날갯짓 2장) · 열매 덤불
 *   4 버섯·덩굴·잎 앞쪽 버섯 · 위쪽 덩굴(1도트 살랑) · 떨어지는 꽃잎 · (가로) 양옆 돌·버섯
 *   5 로고        logo.png (별도 요소)
 *   (6 버튼 · 7 자막은 cover.ts / subtitles.ts 의 기존 HTML)
 *
 * 선명함·떨림 방지
 *   - 그림은 모두 같은 '도트' 격자. 화면에는 정수 배율 k(기기 픽셀) + nearest 로만 그림
 *   - 캔버스 크기 = 기기 픽셀 그대로 (CSS 크기 = 기기 픽셀 / DPR) → 브라우저가 다시 늘리지 않음
 *   - 위치는 항상 정수 도트 → 기기 픽셀 k 배수 → 반 픽셀 번짐·흔들림 없음
 *   - 회전·확대 애니메이션·실시간 필터 없음. 이동은 transform(translate3d) 만 (GPU 합성, 다시 그리기 없음)
 *   - 스프라이트 그림은 '포즈가 바뀔 때만' 자기 캔버스에 다시 그림 (초당 몇 번)
 * 행동 루프(약 20초): 걷기 → 나비 발견(멈춤) → 잠자리채로 쫓기 → 놓치고 뒤돌아봄 → 열매 발견 → 꺼내 먹기 → 총총 → 반복
 */
import L from './title4-layout.json';

const DIR = 'assets/title4/';
type SpriteName = keyof typeof L.sprites;
type Face = 'left' | 'right';
const BG_W = L.bg.w;
const BG_H = L.bg.h;
/** 고나 발끝 높이 (배경 도트 기준: 흙길 가운데) */
const GROUND_Y = 300;

// ───────────────────────── 이미지 미리 읽기 (한 번만, 모듈 안에 보관) ─────────────────────────

const images = new Map<string, HTMLImageElement>();
let loading: Promise<boolean> | null = null;

function loadAll(): Promise<boolean> {
  if (loading) return loading;
  const names = ['bg', 'bg-side', ...Object.keys(L.sprites)];
  loading = Promise.all(
    names.map(
      (n) =>
        new Promise<boolean>((res) => {
          const im = new Image();
          im.decoding = 'async';
          im.onload = () => {
            images.set(n, im);
            res(true);
          };
          im.onerror = () => res(false);
          im.src = `${DIR}${n}.png`;
        }),
    ),
  ).then((r) => r.every(Boolean));
  return loading;
}

// ───────────────────────── 정수 배율 스프라이트 ─────────────────────────

interface FrameRef {
  name: SpriteName;
  face?: Face;
}

/** 하나의 움직이는 그림: 자기 캔버스 1장(가장 큰 프레임 크기) + transform 이동 */
class PixelSprite {
  readonly el: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private k = 1;
  private dpr = 1;
  private cur = '';
  private px = NaN;
  private py = NaN;
  private shown = true;
  /** 캔버스 안에서 기준점(발끝 등)의 위치 (도트) */
  private ox = 0;
  private oy = 0;
  private cw = 0;
  private ch = 0;

  constructor(
    readonly frames: SpriteName[],
    cls: string,
    /** 기준점: 'feet' = layout 의 ax/ay(발끝), 'center' = 그림 가운데, 'top' = 위 가운데 */
    private anchor: 'feet' | 'center' | 'top' = 'center',
  ) {
    this.el = document.createElement('canvas');
    this.el.className = `t4-spr ${cls}`;
    this.ctx = this.el.getContext('2d')!;
  }

  private anchorOf(n: SpriteName, face: Face): [number, number] {
    const s = L.sprites[n] as { w: number; h: number; ax?: number; ay?: number; face?: string };
    if (this.anchor === 'feet' && s.ax !== undefined && s.ay !== undefined) {
      const flipped = (s.face ?? 'right') !== face;
      return [flipped ? s.w - s.ax : s.ax, s.ay];
    }
    if (this.anchor === 'feet') return [Math.floor(s.w / 2), s.h];
    if (this.anchor === 'top') return [Math.floor(s.w / 2), 0];
    return [Math.floor(s.w / 2), Math.floor(s.h / 2)];
  }

  /** 배율이 바뀔 때 (화면 크기·방향) */
  setScale(k: number, dpr: number): void {
    this.k = k;
    this.dpr = dpr;
    // 모든 프레임·방향을 담을 수 있는 캔버스 (기준점 공통)
    let left = 0;
    let right = 0;
    let up = 0;
    let down = 0;
    for (const n of this.frames) {
      const s = L.sprites[n];
      for (const f of ['left', 'right'] as Face[]) {
        const [ax, ay] = this.anchorOf(n, f);
        left = Math.max(left, ax);
        right = Math.max(right, s.w - ax);
        up = Math.max(up, ay);
        down = Math.max(down, s.h - ay);
      }
    }
    this.ox = left;
    this.oy = up;
    this.cw = left + right;
    this.ch = up + down;
    this.el.width = this.cw * k;
    this.el.height = this.ch * k;
    this.el.style.width = `${(this.cw * k) / dpr}px`;
    this.el.style.height = `${(this.ch * k) / dpr}px`;
    this.cur = '';
    this.px = NaN;
  }

  /** 프레임 바꾸기 (바뀔 때만 다시 그림) */
  show(f: FrameRef): void {
    const face = f.face ?? ((L.sprites[f.name] as { face?: string }).face as Face) ?? 'right';
    const key = `${f.name}:${face}`;
    if (key === this.cur) return;
    this.cur = key;
    const im = images.get(f.name);
    const s = L.sprites[f.name] as { w: number; h: number; face?: string };
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.el.width, this.el.height);
    if (!im) return;
    c.imageSmoothingEnabled = false;
    const [ax, ay] = this.anchorOf(f.name, face);
    const dx = (this.ox - ax) * this.k;
    const dy = (this.oy - ay) * this.k;
    const flip = (s.face ?? 'right') !== face && this.anchor === 'feet';
    if (flip || (f.face && !s.face && f.face === 'left')) {
      c.setTransform(-1, 0, 0, 1, dx + s.w * this.k, dy);
      c.drawImage(im, 0, 0, s.w, s.h, 0, 0, s.w * this.k, s.h * this.k);
    } else {
      c.drawImage(im, 0, 0, s.w, s.h, dx, dy, s.w * this.k, s.h * this.k);
    }
  }

  /** 기준점을 (x, y) 도트에 (원점 = 무대 왼쪽 위). 정수 도트로만 이동 */
  moveTo(x: number, y: number): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix === this.px && iy === this.py) return;
    this.px = ix;
    this.py = iy;
    const tx = ((ix - this.ox) * this.k) / this.dpr;
    const ty = ((iy - this.oy) * this.k) / this.dpr;
    this.el.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
  }

  setVisible(v: boolean): void {
    if (v === this.shown) return;
    this.shown = v;
    this.el.style.visibility = v ? '' : 'hidden';
  }
}

// ───────────────────────── 행동 루프 (시간 → 상태, 순수 함수) ─────────────────────────

interface Pose {
  phase: string;
  pose: SpriteName;
  face: Face;
  x: number;
  y: number;
}
interface Bfly {
  on: boolean;
  x: number;
  y: number;
  frame: 0 | 1;
}
interface Bounds {
  /** 고나(중심)가 다닐 수 있는 범위 (도트) */
  L: number;
  R: number;
}

type Seg = { phase: string; d: number };
function plan(b: Bounds): { segs: Seg[]; total: number; P: Record<string, number> } {
  const mid = Math.round((b.L + b.R) / 2);
  const P = {
    L: b.L,
    R: b.R,
    mid,
    stop1: mid + 6,
    chaseEnd: b.L + 30,
    fruit: Math.min(b.R + 6, mid + 44),
  };
  const eatX = P.fruit - 44;
  Object.assign(P, { eatX });
  const walk = 24;
  const segs: Seg[] = [
    { phase: 'walk', d: Math.max(1.2, (P.R - P.stop1) / walk) }, // 숲길을 걸어 다님 (왼쪽으로)
    { phase: 'notice', d: 1.3 }, // 나비 발견 → 멈춤
    { phase: 'chase', d: Math.max(1.2, (P.stop1 - P.chaseEnd) / 34) }, // 잠자리채로 쫓기
    { phase: 'miss', d: 0.5 }, // 놓침
    { phase: 'lookback', d: 1.6 }, // 뒤돌아봄
    { phase: 'walkback', d: Math.max(1.2, (eatX - P.chaseEnd) / walk) }, // 다시 걸음 (오른쪽으로)
    { phase: 'find', d: 0.9 }, // 열매 발견
    { phase: 'eat', d: 2.8 }, // 꺼내 먹기
    { phase: 'trot', d: Math.max(1.2, (P.R - eatX) / 30) }, // 총총
    { phase: 'rest', d: 0.6 },
  ];
  return { segs, total: segs.reduce((a, s) => a + s.d, 0), P: P as Record<string, number> };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

/** 시간 t(초) → 고나·나비 상태 */
export function titleState(t: number, b: Bounds): { gona: Pose; bfly: Bfly; total: number; fruitX: number } {
  const { segs, total, P } = plan(b);
  let tt = ((t % total) + total) % total;
  let i = 0;
  while (i < segs.length - 1 && tt >= segs[i].d) {
    tt -= segs[i].d;
    i++;
  }
  const seg = segs[i];
  const u = tt / seg.d;
  const G = GROUND_Y;
  const walkFrame = (): SpriteName => (Math.floor(t / 0.18) % 2 ? 'gona-walk2' : 'gona-walk1');
  let gona: Pose;
  switch (seg.phase) {
    case 'walk':
      gona = { phase: seg.phase, pose: walkFrame(), face: 'left', x: lerp(P.R, P.stop1, u), y: G };
      break;
    case 'notice':
      gona = { phase: seg.phase, pose: 'gona-surprise', face: 'left', x: P.stop1, y: G };
      break;
    case 'chase': {
      const hop = [0, 2, 3, 2][Math.floor(tt / 0.1) % 4];
      gona = { phase: seg.phase, pose: 'gona-net', face: 'left', x: lerp(P.stop1, P.chaseEnd, u), y: G - hop };
      break;
    }
    case 'miss':
      gona = { phase: seg.phase, pose: 'gona-net', face: 'left', x: P.chaseEnd, y: G };
      break;
    case 'lookback':
      gona = { phase: seg.phase, pose: 'gona-surprise', face: 'right', x: P.chaseEnd, y: G };
      break;
    case 'walkback':
      gona = { phase: seg.phase, pose: walkFrame(), face: 'right', x: lerp(P.chaseEnd, P.eatX, u), y: G };
      break;
    case 'find':
      gona = { phase: seg.phase, pose: 'gona-surprise', face: 'right', x: P.eatX, y: G };
      break;
    case 'eat':
      gona = { phase: seg.phase, pose: 'gona-eat', face: 'right', x: P.eatX, y: G - (Math.floor(tt / 0.35) % 2) };
      break;
    case 'trot': {
      const hop = [0, 2, 3, 2][Math.floor(tt / 0.08) % 4];
      gona = { phase: seg.phase, pose: 'gona-trot', face: 'right', x: lerp(P.eatX, P.R, u), y: G - hop };
      break;
    }
    default:
      gona = { phase: seg.phase, pose: 'gona-walk1', face: 'right', x: P.R, y: G };
  }

  // 나비: 걷기 끝 무렵 왼쪽 위에서 날아옴 → 쫓기는 동안 고나 앞(왼쪽)에서 팔랑 → 놓치면 오른쪽 위로 날아감
  const start = segs[0].d - 1.2;
  const t0 = ((t % total) + total) % total;
  const segStart = (k: number): number => segs.slice(0, k).reduce((a, s) => a + s.d, 0);
  const chaseS = segStart(2);
  const missS = segStart(3);
  const goneS = segStart(5) + 0.5;
  const flap: 0 | 1 = Math.floor(t / (t0 > missS ? 0.07 : 0.11)) % 2 ? 1 : 0;
  const wob = (k: number): number => Math.round(Math.sin(t * k) * 4);
  let bfly: Bfly = { on: false, x: -50, y: -50, frame: flap };
  const aheadOf = (gx: number): [number, number] => [gx - 44 + Math.round(Math.sin(t * 3.1) * 5), G - 76 + wob(6.3)];
  if (t0 >= start && t0 < chaseS) {
    const v = (t0 - start) / (chaseS - start);
    const [ex, ey] = aheadOf(P.stop1);
    bfly = { on: true, x: lerp(P.L - 40, ex, v), y: lerp(G - 150, ey, Math.sqrt(v)) + wob(5), frame: flap };
  } else if (t0 >= chaseS && t0 < missS) {
    const [x, y] = aheadOf(gona.x);
    bfly = { on: true, x, y, frame: flap };
  } else if (t0 >= missS && t0 < goneS) {
    const v = (t0 - missS) / (goneS - missS);
    const [sx, sy] = aheadOf(P.chaseEnd);
    bfly = { on: true, x: lerp(sx, P.R + 60, v * v), y: lerp(sy, G - 210, v) + wob(7), frame: flap };
  }
  return { gona, bfly, total, fruitX: P.fruit };
}

// ───────────────────────── 무대 ─────────────────────────

interface Petal {
  spr: PixelSprite;
  x0: number;
  speed: number;
  amp: number;
  per: number;
  phase: number;
}

export class TitleScene {
  readonly root: HTMLElement;
  private bg: HTMLCanvasElement;
  private world: HTMLElement;
  private logo: PixelSprite;
  private gona = new PixelSprite(['gona-walk1', 'gona-walk2', 'gona-surprise', 'gona-net', 'gona-eat', 'gona-trot'], 't4-gona', 'feet');
  private bfly = new PixelSprite(['butterfly-0', 'butterfly-1'], 't4-bfly');
  private fruit = new PixelSprite(['fruit'], 't4-fruit', 'feet');
  private mush = new PixelSprite(['mushrooms'], 't4-mush', 'feet');
  private vineL = new PixelSprite(['vines'], 't4-vine', 'top');
  private vineR = new PixelSprite(['vines'], 't4-vine', 'top');
  private sideL = new PixelSprite(['stone'], 't4-side', 'feet');
  private sideR = new PixelSprite(['mushrooms'], 't4-side', 'feet');
  private petals: Petal[] = [];
  private layers: Record<'bg' | 'gona' | 'critters' | 'fg' | 'logo', HTMLElement>;
  private k = 1;
  /** 무대(배경 그림) 원점의 화면 위치 (기기 픽셀) */
  private ox = 0;
  private oy = 0;
  private bounds: Bounds = { L: 30, R: 200 };
  private vis = { l: 0, r: BG_W, t: 0, b: BG_H };
  private landscape = false;
  private raf = 0;
  private t0 = 0;
  private ready = false;
  private running = false;
  private lastPhase = '';
  /** 로고 위치·크기 (CSS 픽셀) — 버튼 배치에 씀 */
  logoRect = { x: 0, y: 0, w: 0, h: 0 };
  /** 고나 발끝 높이 (CSS 픽셀) — 버튼 배치에 씀 */
  feetCss = 0;
  /** 배경 그림 폭 (CSS 픽셀) */
  stageWidthCss = 0;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 't4';
    const layer = (name: string): HTMLElement => {
      const d = document.createElement('div');
      d.className = `t4-layer t4-${name}`;
      return d;
    };
    this.layers = { bg: layer('bg'), gona: layer('gona-l'), critters: layer('critters'), fg: layer('fg'), logo: layer('logo') };
    this.bg = document.createElement('canvas');
    this.bg.className = 't4-bgc';
    this.layers.bg.append(this.bg);
    this.world = document.createElement('div');
    this.world.className = 't4-world';
    this.layers.gona.append(this.gona.el);
    this.layers.critters.append(this.fruit.el, this.bfly.el);
    for (let i = 0; i < 6; i++) {
      const spr = new PixelSprite([`petal-${i % L.petals}` as SpriteName], 't4-petal');
      this.petals.push({ spr, x0: (i * 47 + 13) % BG_W, speed: 9 + ((i * 7) % 6), amp: 4 + (i % 3) * 2, per: 2.6 + (i % 4) * 0.5, phase: i * 1.7 });
      this.layers.fg.append(spr.el);
    }
    this.layers.fg.append(this.mush.el, this.vineL.el, this.vineR.el, this.sideL.el, this.sideR.el);
    this.logo = new PixelSprite(['logo'], 't4-logo-spr', 'top');
    this.layers.logo.append(this.logo.el);
    // 배경을 뺀 레이어는 무대 원점(world)에 함께 붙음 (로고는 화면 기준)
    this.world.append(this.layers.gona, this.layers.critters, this.layers.fg);
    this.root.append(this.layers.bg, this.world, this.layers.logo);
  }

  /** 미리 읽기 (앱 시작 때 호출해 두면 타이틀이 바로 뜸) */
  static preload(): Promise<boolean> {
    return loadAll();
  }

  async init(): Promise<boolean> {
    this.ready = await loadAll();
    this.root.classList.toggle('t4-failed', !this.ready);
    return this.ready;
  }

  /** 화면 크기에 맞춰 배율·위치 계산 (vw, vh = CSS 픽셀) */
  layout(vw: number, vh: number, safe: { top: number; left: number; right: number }, avoid?: { left: number; bottom: number }): void {
    if (!this.ready || vw <= 0 || vh <= 0) return;
    const dpr = Math.max(1, Math.min(3, Math.round((window.devicePixelRatio || 1) * 4) / 4));
    const Dw = Math.round(vw * dpr);
    const Dh = Math.round(vh * dpr);
    this.landscape = vw > vh;
    let k: number;
    if (!this.landscape) {
      // 세로: 배경이 화면을 덮는 가장 작은 정수 배율
      k = Math.max(1, Math.ceil(Dw / BG_W), Math.ceil(Dh / BG_H));
    } else {
      // 가로: 배경 높이의 약 60% 가 화면에 들어오는 정수 배율 (고나가 너무 작지 않게)
      k = Math.max(1, Math.round(Dh / 250));
    }
    this.k = k;
    const W = BG_W * k;
    const H = BG_H * k;
    this.ox = Math.round((Dw - W) / 2);
    if (!this.landscape) {
      this.oy = Math.round((Dh - H) / 2);
    } else {
      // 발끝 줄이 화면 높이 80% 쯤 오게, 단 배경이 화면 위·아래를 덮도록
      this.oy = Math.min(0, Math.max(Dh - H, Math.round(Dh * 0.8 - GROUND_Y * k)));
    }
    // 보이는 범위 (도트)
    this.vis = {
      l: Math.max(0, Math.ceil(-this.ox / k)),
      r: Math.min(BG_W, Math.floor((Dw - this.ox) / k)),
      t: Math.max(0, Math.ceil(-this.oy / k)),
      b: Math.min(BG_H, Math.floor((Dh - this.oy) / k)),
    };
    const margin = 30;
    this.bounds = { L: this.vis.l + margin, R: this.vis.r - margin };

    // 1 배경 캔버스 (화면 전체, 기기 픽셀 그대로)
    const c = this.bg;
    c.width = Dw;
    c.height = Dh;
    c.style.width = `${Dw / dpr}px`;
    c.style.height = `${Dh / dpr}px`;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    if (this.landscape) {
      // 양옆: 미리 흐리게 만든 배경(bg-side.png)을 화면 전체에 깔고 (이 한 장만 부드럽게 늘림), 바깥쪽은 살짝 어둡게
      const side = images.get('bg-side');
      if (side) {
        g.imageSmoothingEnabled = true;
        g.drawImage(side, 0, 0, side.width, side.height, 0, Math.min(0, this.oy), Dw, Math.max(Dh, H));
        g.imageSmoothingEnabled = false;
      }
      for (const sd of ['left', 'right'] as const) {
        const x0 = sd === 'left' ? 0 : this.ox + W;
        const w = sd === 'left' ? this.ox : Dw - this.ox - W;
        if (w <= 0) continue;
        const shade = g.createLinearGradient(sd === 'left' ? this.ox : this.ox + W, 0, sd === 'left' ? 0 : Dw, 0);
        shade.addColorStop(0, 'rgba(20,36,12,0.05)');
        shade.addColorStop(1, 'rgba(20,36,12,0.35)');
        g.fillStyle = shade;
        g.fillRect(x0, 0, w, Dh);
      }
    }
    const bgImg = images.get('bg');
    if (bgImg) g.drawImage(bgImg, 0, 0, BG_W, BG_H, this.ox, this.oy, W, H);

    // 무대 원점
    this.world.style.transform = `translate3d(${this.ox / dpr}px, ${this.oy / dpr}px, 0)`;
    for (const s of [this.gona, this.bfly, this.fruit, this.mush, this.vineL, this.vineR, this.sideL, this.sideR, ...this.petals.map((p) => p.spr)]) s.setScale(k, dpr);

    // 고정 소품
    const st = titleState(0, this.bounds);
    this.fruit.show({ name: 'fruit' });
    this.fruit.moveTo(st.fruitX, GROUND_Y + 2);
    this.mush.show({ name: 'mushrooms' });
    this.mush.moveTo(this.vis.l + 14, GROUND_Y + 30);
    this.vineL.show({ name: 'vines' });
    this.vineR.show({ name: 'vines', face: 'left' });
    for (const p of this.petals) p.spr.show({ name: p.spr.frames[0] });
    // 가로: 양옆 띠에 돌·버섯 (무대 밖, 같은 배율)
    const sideW = this.ox / k;
    this.sideL.setVisible(this.landscape && sideW > 40);
    this.sideR.setVisible(this.landscape && sideW > 40);
    if (this.landscape) {
      this.sideL.show({ name: 'stone' });
      this.sideL.moveTo(-sideW / 2, GROUND_Y + 12);
      this.sideR.show({ name: 'mushrooms', face: 'left' });
      this.sideR.moveTo(BG_W + sideW / 2, GROUND_Y + 14);
    }

    // 5 로고: 화면 기준, 양옆 여백(안전 영역 포함) 확보한 정수 배율
    const side = Math.max(20, safe.left + 14, safe.right + 14);
    const maxW = (vw - side * 2) * dpr;
    const lw = L.sprites.logo.w;
    const lh = L.sprites.logo.h;
    const maxH = (this.landscape ? vh * 0.3 : vh * 0.22) * dpr;
    const kl = Math.max(1, Math.floor(Math.min(maxW / lw, maxH / lh)));
    this.logo.setScale(kl, dpr);
    this.logo.show({ name: 'logo' });
    let topCss = Math.max(safe.top + 8, vh * 0.03);
    // 오른쪽 위 버튼(소리·개발 메뉴)과 겹치면 그 아래로
    const logoRightCss = (vw + (lw * kl) / dpr) / 2;
    if (avoid && logoRightCss > avoid.left - 4) topCss = Math.max(topCss, avoid.bottom + 6);
    // 로고 sprite 원점 = 화면 왼쪽 위, 기준점 = 위 가운데 → 도트 단위(kl)로 정수 위치
    const lx = Math.round(Dw / 2 / kl);
    const ly = Math.round((topCss * dpr) / kl);
    this.logo.moveTo(lx, ly);
    this.logoRect = { x: (lx * kl - (lw * kl) / 2) / dpr, y: (ly * kl) / dpr, w: (lw * kl) / dpr, h: (lh * kl) / dpr };
    this.feetCss = (this.oy + GROUND_Y * k) / dpr;
    this.stageWidthCss = W / dpr;
    this.lastPhase = '';
    this.frame(performance.now());
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.t0 = performance.now() - 400; // 바로 걷는 모습부터
    const loop = (now: number): void => {
      if (!this.running) return;
      this.frame(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** 타이틀이 안 보이면 반드시 멈춤 (게임 중 CPU 사용 0) */
  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  get isRunning(): boolean {
    return this.running;
  }

  private frame(now: number): void {
    if (!this.ready) return;
    const t = (now - this.t0) / 1000;
    const s = titleState(t, this.bounds);
    this.gona.show({ name: s.gona.pose, face: s.gona.face });
    this.gona.moveTo(s.gona.x, s.gona.y);
    if (s.gona.phase !== this.lastPhase) {
      this.lastPhase = s.gona.phase;
      this.root.dataset.phase = s.gona.phase;
    }
    this.bfly.setVisible(s.bfly.on);
    if (s.bfly.on) {
      this.bfly.show({ name: s.bfly.frame ? 'butterfly-1' : 'butterfly-0' });
      this.bfly.moveTo(s.bfly.x, s.bfly.y);
    }
    // 덩굴: 1도트씩 살랑 (2.4초 주기)
    const sway = Math.round(Math.sin(t * 2.6));
    this.vineL.moveTo(this.vis.l + 34 + sway, this.vis.t - 4);
    this.vineR.moveTo(this.vis.r - 34 - sway, this.vis.t - 4);
    // 꽃잎: 위에서 아래로 천천히 (보이는 범위 안에서 반복)
    const span = this.vis.b - this.vis.t + 20;
    for (const p of this.petals) {
      const y = this.vis.t - 10 + ((t * p.speed + p.phase * 37) % span);
      const x = this.vis.l + ((p.x0 + t * 3) % Math.max(1, this.vis.r - this.vis.l)) + Math.sin(t * (6.28 / p.per) + p.phase) * p.amp;
      p.spr.moveTo(x, y);
    }
  }

  /** (테스트용) 지금 고나 상태 */
  debug(): { phase: string; pose: string; face: string; x: number; y: number; k: number; bfly: boolean; logo: { x: number; y: number; w: number; h: number }; running: boolean; stageW: number } {
    const s = titleState((performance.now() - this.t0) / 1000, this.bounds);
    return { phase: s.gona.phase, pose: s.gona.pose, face: s.gona.face, x: Math.round(s.gona.x), y: s.gona.y, k: this.k, bfly: s.bfly.on, logo: this.logoRect, running: this.running, stageW: Math.min(this.stageWidthCss, this.root.clientWidth) };
  }
}
