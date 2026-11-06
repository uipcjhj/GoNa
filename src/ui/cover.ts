import { DEV } from '../config';
import { perf, setPerfOverlay } from '../perf';
import type { RestartOptions } from '../events';
import { CHECKPOINT_LABEL, loadCheckpoint } from '../game/checkpoint';
/**
 * 대표 타이틀 화면 — 알 부화 시네마틱이 끝나면 카메라가 물러나며 나타남.
 *
 * 원칙: 대표 그림(art-src/title/gona-cover-original.png)은 **원본 그대로 정적으로** 씁니다.
 *   그림 속 고나·버섯을 오려내거나 뒤를 메우지 않습니다 (움직일 때 메운 자국이 드러나므로).
 *   움직임은 그림 위에 따로 얹는 것만: 폭포(같은 자리 물줄기 프레임), 반딧불, 꽃잎·잎, 구름, 버튼 반짝임.
 *
 * ▸ 세로: 위 로고(하늘 위에 따로) · 가운데 원본 장면(고나·버섯숲, 로고 아래 부분) · 아래 풀밭 위 시작 버튼
 *         남는 위·아래는 원본 색·도트 크기로 새로 그린 하늘·풀밭으로 이어 붙임
 * ▸ 가로: 원본 전체, 남는 양옆은 숲 그늘색 그라데이션 액자 (미러링·흐림 없음)
 * (레이어는 tools/build_cover_layers.py 로 생성)
 */
import { GAME_TITLE } from '../config';
import { sound } from '../audio';
import { el, tryLoadImage } from './dom';
import L from './cover-layers.json';

const DIR = 'assets/title/cover/';
const [IW, IH] = L.size as [number, number];
const P = L.portrait;
/** 세로 구도에서 화면 가운데에 둘 원본 x (고나와 폭포 사이) */
const PORTRAIT_CENTER_X = 790;
const SCENE_TOP = P.cropTop;
const SCENE_H = IH - SCENE_TOP;
/** 그림 속 고나 위치 (카메라가 물러날 때의 중심) */
const GONA = { x: 561, y: 548, w: 380, h: 468 };

type Rect = { x: number; y: number; w: number; h: number };

function img(src: string, cls: string, r?: Rect): HTMLImageElement {
  const i = new Image();
  i.src = DIR + src;
  i.className = `cv-px ${cls}`;
  i.alt = '';
  i.draggable = false;
  if (r) place(i, r);
  return i;
}

function place(e: HTMLElement, r: Rect): void {
  Object.assign(e.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
}

export class CoverScreen {
  private root: HTMLElement;
  private cam: HTMLElement;
  private stage: HTMLElement;
  private scene: HTMLElement;
  private clip: HTMLElement;
  private sky: HTMLElement;
  private ground: HTMLElement;
  private clouds: HTMLElement;
  private logoTop: HTMLImageElement;
  private gonaMark: HTMLElement;
  private sides: HTMLElement[] = [];
  private ui: HTMLElement;
  private btn: HTMLButtonElement;
  private btnLabel!: HTMLSpanElement;
  private contBtn!: HTMLButtonElement;
  private hint!: HTMLElement;
  private started = false;
  private shown = false;
  private fallTimer = 0;
  /** 소리 테스트 화면 열기 (main 에서 연결) */
  onAudioTest: (() => void) | null = null;
  /** 오프닝 다시 보기 (main 에서 연결) */
  onReplay: (() => void) | null = null;

  constructor(
    parent: HTMLElement,
    private onStart: (opt?: RestartOptions) => void,
  ) {
    this.root = el('section', 'cover hidden');
    this.root.setAttribute('aria-label', GAME_TITLE);
    this.stage = el('div', 'cv-stage');
    this.clip = el('div', 'cv-clip');
    this.scene = el('div', 'cv-scene');
    this.sky = el('div', 'cv-sky');
    this.ground = el('div', 'cv-ground');
    this.logoTop = img('logo.webp', 'cv-logo-top');

    // 원본 장면 (정적) + 폭포 물줄기 프레임 + 고나 위치 표시(보이지 않음)
    Object.assign(this.scene.style, { width: `${IW}px`, height: `${IH}px` });
    this.scene.append(img('scene.webp', 'cv-base', { x: 0, y: 0, w: IW, h: IH }));
    const fall = el('div', 'cv-fall');
    place(fall, L.fall);
    for (let k = 0; k < 4; k++) fall.append(img(`fall-${k}.webp`, `cv-fall-f${k ? ' off' : ''}`, { x: 0, y: 0, w: L.fall.w, h: L.fall.h }));
    this.scene.append(fall);
    this.gonaMark = el('div', 'cv-gona-mark');
    place(this.gonaMark, GONA);
    this.scene.append(this.gonaMark);
    this.clip.append(this.scene);

    // 천천히 흘러가는 구름 (하늘에만)
    this.clouds = el('div', 'cv-clouds');
    for (let i = 0; i < 4; i++) {
      const c = new Image();
      c.src = cloudCanvas(i).toDataURL();
      c.className = 'cv-cloud';
      c.style.animationDuration = `${70 + i * 18}s`;
      c.style.animationDelay = `${-i * 23}s`;
      c.style.top = `${[8, 44, 22, 62][i]}%`;
      this.clouds.append(c);
    }
    this.stage.append(this.sky, this.ground, this.clip, this.clouds, this.logoTop);
    this.buildFireflies();
    this.buildLeaves();

    // 가로 화면 양옆 (원본 가장자리 색 띠)
    for (const side of ['left', 'right'] as const) {
      const s = el('div', `cv-side cv-side-${side}`);
      // 그림 쪽은 원본 숲 색, 바깥으로 갈수록 깊은 숲 그늘 (미러링·흐림·줄무늬 없음)
      s.style.backgroundImage = `linear-gradient(${side === 'left' ? 'to left' : 'to right'}, #cfe9b4 0%, #a9d58a 35%, #86bd6c 100%)`;
      this.sides.push(s);
    }

    this.btn = el('button', 'start-btn cover-btn');
    this.btn.type = 'button';
    this.btnLabel = el('span', '', '게임 시작');
    this.btn.append(el('span', 'cover-play', '▶'), this.btnLabel);
    // 이어하기 (체크포인트가 있을 때만)
    this.contBtn = el('button', 'start-btn cover-continue hidden');
    this.contBtn.type = 'button';
    this.contBtn.addEventListener('click', () => this.start({ checkpoint: true }));
    this.hint = el('p', 'cover-hint', '버튼을 누르면 모험이 시작돼요');
    this.ui = el('div', 'cover-ui');
    this.ui.append(this.contBtn, this.btn, this.hint);

    const test = el('button', 'ap-open cover-test', '🔊 소리 테스트');
    test.type = 'button';
    test.addEventListener('click', () => this.onAudioTest?.());
    const replay = el('button', 'ap-open cover-replay', '↺ 오프닝');
    replay.type = 'button';
    replay.addEventListener('click', () => this.onReplay?.());
    // 개발용: 보스전 바로가기 · 성능 표시 (config.ts DEV.bossTestMenu = false 면 숨김)
    const dev = el('div', 'cover-dev');
    if (DEV.bossTestMenu) {
      // 작은 🧪 버튼을 누르면 펼쳐짐 (로고를 가리지 않게)
      const toggle = el('button', 'ap-open cover-dev-toggle', '🧪');
      toggle.type = 'button';
      toggle.setAttribute('aria-label', '개발용 테스트 메뉴');
      const list = el('div', 'cover-dev-list hidden');
      toggle.addEventListener('click', () => list.classList.toggle('hidden'));
      dev.append(toggle, list);
      const mk = (label: string, fn: () => void): void => {
        const b = el('button', 'ap-open cover-dev-btn', label);
        b.type = 'button';
        b.addEventListener('click', fn);
        list.append(b);
      };
      mk('🧪 뽀뽀괴물 테스트', () => this.start({ boss: 'kiss' }));
      mk('🧪 킁카괴물 테스트', () => this.start({ boss: 'sniff' }));
      mk('🧪 몬스터 테스트 (3단계)', () => this.start({ devMonsters: true }));
      const label = (): string => (perf.enabled ? '📈 성능 표시 끄기' : '📈 성능 표시 켜기');
      mk(label(), () => {
        setPerfOverlay(!perf.enabled);
        const last = list.lastElementChild;
        if (last) last.textContent = label();
      });
    }

    // 사이드·무대를 한 번에 확대/축소하는 '카메라' 묶음 (알 부화 장면에서 물러나며 등장)
    this.cam = el('div', 'cv-cam');
    this.cam.append(...this.sides, this.stage);
    this.root.append(this.cam, this.ui, test, replay, dev);
    parent.append(this.root);

    this.btn.addEventListener('click', () => this.start());
    this.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      sound.unlock();
      sound.startMusic('title');
    });
    window.addEventListener('resize', () => this.layout());
    // 앱 안 미리보기 창처럼 window 크기와 실제 보이는 크기가 다를 수 있어, 실제 요소 크기가 바뀔 때마다 다시 배치
    if ('ResizeObserver' in window) new ResizeObserver(() => this.layout()).observe(this.root);
    void this.load();
  }

  get isVisible(): boolean {
    return this.shown && !this.started;
  }

  private buildFireflies(): void {
    const box = el('div', 'cv-flies');
    for (let i = 0; i < 16; i++) {
      const f = el('span', 'cv-fly');
      f.style.left = `${Math.random() * 100}%`;
      f.style.top = `${25 + Math.random() * 65}%`;
      f.style.animationDuration = `${11 + Math.random() * 8}s, ${1.6 + Math.random() * 1.8}s`;
      f.style.animationDelay = `${-Math.random() * 14}s, ${-Math.random() * 3}s`;
      if (i % 3 === 0) f.classList.add('big');
      box.append(f);
    }
    this.stage.append(box);
  }

  private buildLeaves(): void {
    const box = el('div', 'cv-leaves');
    const cols = ['#ffc8d8', '#9fd36a', '#ffe08a', '#f7a6b8', '#7fbf4a'];
    for (let i = 0; i < 8; i++) {
      const l = el('span', 'cv-leaf');
      l.style.left = `${Math.random() * 100}%`;
      l.style.background = cols[i % cols.length];
      l.style.animationDuration = `${10 + Math.random() * 7}s`;
      l.style.animationDelay = `${-Math.random() * 14}s`;
      box.append(l);
    }
    this.stage.append(box);
  }

  private async load(): Promise<void> {
    const base = await tryLoadImage(DIR + 'scene.webp');
    if (base) {
      this.sky.style.backgroundImage = `url(${DIR}sky-ext.webp)`;
      this.ground.style.backgroundImage = `url(${DIR}ground-ext.webp)`;
    } else {
      this.root.classList.add('no-art');
    }
  }

  /**
   * 알 부화 장면이 끝나면 호출: 대표 타이틀이 (배율 변화 없이) 페이드인 → 로고 → 버튼.
   * instant: 건너뛰기 — 바로 표시
   */
  reveal(instant: boolean): void {
    this.started = false;
    // 저장된 진행이 있으면 '이어하기' + '새 게임'
    const cp = loadCheckpoint();
    this.contBtn.classList.toggle('hidden', !cp);
    this.contBtn.replaceChildren(el('span', 'cover-play', '💾'), el('span', '', `이어하기 · ${cp ? CHECKPOINT_LABEL[cp.id] : ''}`));
    this.btnLabel.textContent = cp ? '새 게임' : '게임 시작';
    this.hint.textContent = cp ? `저장: ${CHECKPOINT_LABEL[cp.id]} · 점수 ${cp.score}` : '버튼을 누르면 모험이 시작돼요';
    this.root.classList.remove('hidden', 'leaving', 'revealed', 'instant');
    this.btn.classList.remove('pressed');
    this.shown = true;
    this.layout();
    if (instant) {
      this.root.classList.add('revealed', 'instant');
    } else {
      // 확대→축소 줌은 도트 그림을 매 프레임 다른 배율로 다시 샘플링해 고나가 '떨리는' 것처럼 보였음 → 최종 배율 그대로 페이드인만
      void this.root.offsetWidth;
      requestAnimationFrame(() => this.root.classList.add('revealed'));
    }
    if (!this.fallTimer) {
      let k = 0;
      const frames = this.scene.querySelectorAll<HTMLElement>('.cv-fall-f');
      this.fallTimer = window.setInterval(() => {
        frames[k].classList.add('off');
        k = (k + 1) % frames.length;
        frames[k].classList.remove('off');
      }, 140);
    }
  }

  /** 오프닝 다시 보기: 잠시 숨김 */
  hide(): void {
    this.root.classList.add('hidden');
    this.shown = false;
  }

  // ───────────────────────── 배치 ─────────────────────────

  layout(): void {
    if (!this.shown) return;
    // 실제로 보이는 크기 (window.innerWidth 대신 화면 요소 자체의 크기)
    const vw = this.root.clientWidth || window.innerWidth;
    const vh = this.root.clientHeight || window.innerHeight;
    const portrait = vw / vh < 1;
    this.root.classList.toggle('portrait', portrait);
    if (portrait) this.layoutPortrait(vw, vh);
    else this.layoutLandscape(vw, vh);
  }

  private layoutPortrait(vw: number, vh: number): void {
    // 원본 장면을 보여 줄 폭: 로고+장면+풀밭이 화면 높이에 맞도록 (560~728)
    const unitsW = Math.min(P.w - 4, Math.max(560, (vw * 1350) / vh));
    const s = vw / unitsW;
    const Hs = vh / s;
    const x0 = Math.min(P.cropX0 + P.w - unitsW, Math.max(P.cropX0, PORTRAIT_CENTER_X - unitsW / 2));
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:absolute;top:0;left:0;height:env(safe-area-inset-top);width:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);visibility:hidden';
    document.body.append(probe);
    const inset = probe.offsetHeight;
    const insetX = Math.max(probe.offsetWidth, 0);
    probe.remove();
    const safeTop = Math.max(vh * 0.04, inset + 8) / s;

    Object.assign(this.stage.style, { width: `${unitsW}px`, height: `${Hs}px`, transform: `scale(${s})`, left: '0px', top: '0px', background: 'rgb(150,190,238)' });
    // 로고: 위쪽 하늘 위
    // 세로 화면 전용 로고 크기: 보이는 폭의 80% 이하 + 양옆 최소 20px(안전 영역 포함) — 양옆 장식 잎·열매까지 절대 안 잘리게
    // (높이는 폭에 맞춰 원본 비율 그대로)
    const sideCss = Math.max(20, insetX + 14);
    const logoW = Math.min(unitsW * 0.8, (vw - sideCss * 2) / s);
    const logoH = (logoW / L.logo.w) * L.logo.h;
    place(this.logoTop, { x: (unitsW - logoW) / 2, y: safeTop, w: logoW, h: logoH });
    this.logoTop.style.display = '';
    // 장면 (원본 458줄 아래): 고나 머리(원본 y≈548)가 로고 아래 오도록
    const hairTop = GONA.y - SCENE_TOP;
    const sceneTop = Math.max(safeTop + logoH - hairTop + 30, Hs * 0.2);
    const groundTop = sceneTop + SCENE_H;
    Object.assign(this.clip.style, { left: '0px', top: `${sceneTop}px`, width: `${unitsW}px`, height: `${SCENE_H}px` });
    this.scene.style.transform = `translate(${-x0}px, ${-SCENE_TOP}px)`;
    const extX = P.cropX0 - x0;
    Object.assign(this.sky.style, { display: '', left: `${extX}px`, top: `${sceneTop + 1 - P.skyH}px`, width: `${P.w}px`, height: `${P.skyH}px` });
    Object.assign(this.ground.style, { display: '', left: `${extX}px`, top: `${groundTop - 1}px`, width: `${P.w}px`, height: `${Math.max(P.groundH, Hs - groundTop + 2)}px` });
    // 구름: 로고 아래 ~ 장면 위 하늘에서만
    const cTop = safeTop + logoH * 0.8;
    Object.assign(this.clouds.style, { display: '', left: '0px', top: `${cTop}px`, width: `${unitsW}px`, height: `${Math.max(60, sceneTop + 40 - cTop)}px` });
    for (const sd of this.sides) sd.style.display = 'none';
    // 버튼: 풀밭 위
    const groundCss = (Hs - groundTop) * s;
    const unit = Math.max(3.6, Math.min(vw / 85, 7));
    this.ui.style.setProperty('--b', `${unit}px`);
    const uiH = this.ui.offsetHeight || unit * 16;
    const bottom = groundCss > uiH + 24 ? (groundCss - uiH) / 2 : Math.max(16, vh * 0.04);
    Object.assign(this.ui.style, { left: '0px', right: '0px', width: 'auto', bottom: `${bottom}px` });
    this.root.classList.remove('side');
  }

  private layoutLandscape(vw: number, vh: number): void {
    const s = Math.min(vw / IW, vh / IH);
    const w = IW * s;
    const h = IH * s;
    const left = (vw - w) / 2;
    const top = (vh - h) / 2;
    Object.assign(this.stage.style, { width: `${IW}px`, height: `${IH}px`, transform: `scale(${s})`, left: `${left}px`, top: `${top}px`, background: '' });
    Object.assign(this.clip.style, { left: '0px', top: '0px', width: `${IW}px`, height: `${IH}px` });
    this.scene.style.transform = '';
    this.sky.style.display = 'none';
    this.ground.style.display = 'none';
    this.logoTop.style.display = 'none'; // 가로는 원본 속 로고 그대로
    Object.assign(this.clouds.style, { display: '', left: '440px', top: '450px', width: '760px', height: '70px' });
    // 양옆: 원본 가장자리 색 띠 (그림 쪽에서 바깥으로 어두워짐)
    const [sl, sr] = this.sides;
    const sw = left + 2;
    for (const sd of this.sides) sd.style.display = left > 1 ? '' : 'none';
    Object.assign(sl.style, { left: `${left - sw + 1}px`, top: `${top}px`, width: `${sw}px`, height: `${h}px` });
    Object.assign(sr.style, { left: `${left + w - 1}px`, top: `${top}px`, width: `${sw}px`, height: `${h}px` });
    // 버튼: 고나(가운데)를 가리지 않도록 그림 오른쪽 아래
    const unit = Math.max(3.2, Math.min(vw / 110, vh / 88, 6));
    this.ui.style.setProperty('--b', `${unit}px`);
    this.root.classList.add('side');
    Object.assign(this.ui.style, { left: '0px', right: 'auto', width: 'max-content' });
    const uiW = this.ui.offsetWidth || unit * 40;
    const x = Math.min(vw - uiW - 8, Math.max(left + w * 0.62, left + w * 0.8 - uiW / 2));
    Object.assign(this.ui.style, { left: `${x}px`, bottom: `${Math.max(10, vh * 0.05)}px` });
  }

  // ───────────────────────── 시작 ─────────────────────────

  /** 게임 시작 버튼 (Space 키도). boss = 개발용 보스전 바로가기 */
  start(opt?: RestartOptions): void {
    if (this.started || !this.shown) return;
    this.started = true;
    sound.unlock();
    sound.start();
    sound.startMusic('title');
    this.btn.classList.add('pressed');
    this.root.classList.add('leaving');
    window.setTimeout(() => this.onStart(opt), 350);
    window.setTimeout(() => {
      this.root.classList.add('hidden');
      this.shown = false;
    }, 900);
  }
}

// ───────────────────────── 구름 도트 ─────────────────────────

function cloudCanvas(seed: number): HTMLCanvasElement {
  const w = 30 + (seed % 2) * 8;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = 12;
  const g = c.getContext('2d');
  if (!g) return c;
  const blob = (cx: number, cy: number, r: number, col: string): void => {
    g.fillStyle = col;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r) g.fillRect(cx + x, cy + y, 1, 1);
  };
  const parts = [
    [6, 7, 4],
    [13, 5, 5],
    [21, 6, 4],
    [w - 7, 7, 3],
  ];
  for (const [x, y, r] of parts) blob(x, y + 1, r, '#d9d3ee');
  for (const [x, y, r] of parts) blob(x, y, r, '#f6f3ff');
  return c;
}
