/**
 * 대표 타이틀 화면 (게임 실행 시 가장 먼저 보이는 움직이는 오프닝).
 *
 *  흐름: [대표 타이틀] → 게임 시작 버튼 → [알 부화 컷신] → 1단계 둥지 이동 시작
 *
 * 원본 그림 1장(art-src/title)을 tools/build_cover_layers.py 로 나눈 레이어로 구성합니다.
 *   바탕(로고·머리카락을 지우고 뒤를 채운 그림) · 로고 · 고나 몸 · 눈 감은 패치 · 머리카락 · 폭포 4프레임
 *   + 큰 버섯·덩굴은 '가장자리가 부드럽게 사라지는 영역'째 몇 px 살랑 (외곽선이 끊겨 있어 깔끔히 오려낼 수 없음)
 *
 * ▸ 세로 화면: 모바일 전용 구도
 *     위 20~25%: 로고 / 가운데: 고나와 버섯숲(원본에서 고나 주변을 크게) / 아래: 풀밭 위 게임 시작 버튼
 *     화면 비율에 따라 남는 위·아래는 원본 색으로 새로 그린 도트 하늘·풀밭으로 이어 붙임 (흐림·늘이기 없음)
 * ▸ 가로 화면: 기존 16:9 구도 그대로 (원본 전체), 남는 양옆은 그림 가장자리를 거울처럼 이어 붙임
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
/** 세로 구도: 원본에서 쓰는 장면 영역 (로고 아래 하늘부터 바닥까지) */
const SCENE_TOP = P.cropTop;
const SCENE_H = IH - SCENE_TOP;

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
  private stage: HTMLElement;
  private scene: HTMLElement;
  private clip: HTMLElement;
  private sky: HTMLElement;
  private ground: HTMLElement;
  private logoTop: HTMLImageElement;
  private sceneLogo: HTMLImageElement;
  private corners: HTMLElement[] = [];
  private sides: HTMLElement[] = [];
  private blink!: HTMLImageElement;
  private ui: HTMLElement;
  private btn: HTMLButtonElement;
  private started = false;
  private shown = false;
  private blinkTimer = 0;
  private fallTimer = 0;
  /** 소리 테스트 화면 열기 (main 에서 연결) */
  onAudioTest: (() => void) | null = null;

  constructor(
    parent: HTMLElement,
    private onStart: (fromCover: boolean) => void,
  ) {
    this.root = el('section', 'cover hidden');
    this.root.setAttribute('aria-label', GAME_TITLE);
    this.stage = el('div', 'cv-stage');
    this.clip = el('div', 'cv-clip');
    this.scene = el('div', 'cv-scene');
    this.sky = el('div', 'cv-sky');
    this.ground = el('div', 'cv-ground');
    this.logoTop = img('logo.webp', 'cv-logo-top');
    this.sceneLogo = img('logo.webp', 'cv-logo', L.logo);

    this.buildScene();

    // 세로 구도용 위쪽 모서리 장식: 원본의 큰 버섯·덩굴 모서리 (안쪽으로 부드럽게 사라짐)
    for (const side of ['l', 'r'] as const) {
      const c = el('div', `cv-corner cv-corner-${side}`);
      c.style.backgroundImage = `url(${DIR}base.webp)`;
      this.corners.push(c);
    }
    // 가로 구도용 양옆 이어 붙이기 (원본 가장자리를 거울처럼)
    for (const side of ['l', 'r'] as const) {
      const s = el('div', `cv-side cv-side-${side}`);
      // 바깥으로 갈수록 어둡게 (거울 이음이 눈에 띄지 않는 액자 느낌)
      // (좌우 뒤집혀 표시되므로 왼쪽은 'to right', 오른쪽은 'to left' 가 바깥 방향)
      s.style.backgroundImage = `linear-gradient(${side === 'l' ? 'to right' : 'to left'}, rgba(40,28,40,0) 0%, rgba(40,28,40,0.72) 100%), url(${DIR}base.webp)`;
      this.sides.push(s);
    }

    this.clip.append(this.scene);
    this.stage.append(this.sky, this.ground, this.clip, ...this.corners, this.logoTop);
    this.buildFireflies();

    this.btn = el('button', 'start-btn cover-btn');
    this.btn.type = 'button';
    this.btn.append(el('span', 'cover-play', '▶'), el('span', '', '게임 시작'));
    const hint = el('p', 'cover-hint', '버튼을 누르면 모험이 시작돼요');
    this.ui = el('div', 'cover-ui');
    this.ui.append(this.btn, hint);

    // 소리 테스트 (실제 기기 확인용)
    const test = el('button', 'ap-open cover-test', '🔊 소리 테스트');
    test.type = 'button';
    test.addEventListener('click', () => this.onAudioTest?.());

    this.root.append(...this.sides, this.stage, this.ui, test);
    parent.append(this.root);

    this.btn.addEventListener('click', () => this.start());
    // 버튼이 아닌 곳을 터치하면: 소리만 깨우고 잔잔한 타이틀 음악 (화면은 그대로 대기)
    this.root.addEventListener('click', (e) => {
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

  // ───────────────────────── 장면 구성 ─────────────────────────

  private buildScene(): void {
    const s = this.scene;
    Object.assign(s.style, { width: `${IW}px`, height: `${IH}px` });
    s.append(img('base.webp', 'cv-base', { x: 0, y: 0, w: IW, h: IH }));

    // 큰 버섯 · 덩굴: 그 영역의 그림을 부드러운 가장자리 안에서 살랑
    Object.entries(L.sway as unknown as Record<string, [number, number, number, number, string]>).forEach(([name, [x, y, w, h, pivot]], i) => {
      const d = el('div', `cv-sway ${pivot === 'top' ? 'from-top' : 'from-bottom'} ${name.startsWith('vine') ? 'vine' : 'mush'}`);
      place(d, { x, y, w, h });
      Object.assign(d.style, {
        backgroundImage: `url(${DIR}base.webp)`,
        backgroundSize: `${IW}px ${IH}px`,
        backgroundPosition: `${-x}px ${-y}px`,
        animationDelay: `${-i * 0.9}s`,
      });
      s.append(d);
    });

    // 폭포 4프레임
    const fall = el('div', 'cv-fall');
    place(fall, L.fall);
    for (let k = 0; k < 4; k++) {
      const f = img(`fall-${k}.webp`, `cv-fall-f${k ? ' off' : ''}`, { x: 0, y: 0, w: L.fall.w, h: L.fall.h });
      fall.append(f);
    }
    s.append(fall);

    // 고나: 몸 + 눈 감은 패치 + 머리카락 (한 묶음으로 숨쉬기)
    const g = el('div', 'cv-gona');
    const gr = L.gona;
    place(g, gr);
    g.style.transformOrigin = `50% 100%`;
    g.append(img('gona.webp', 'cv-gona-body', { x: 0, y: 0, w: gr.w, h: gr.h }));
    this.blink = img('gona-blink.webp', 'cv-blink off', { x: L.blink.x - gr.x, y: L.blink.y - gr.y, w: L.blink.w, h: L.blink.h });
    g.append(this.blink);
    const hr = L.hair;
    const hair = img('hair.webp', 'cv-hair', { x: hr.x - gr.x, y: hr.y - gr.y, w: hr.w, h: hr.h });
    hair.style.transformOrigin = `${hr.pivot[0] - hr.x}px ${hr.pivot[1] - hr.y}px`;
    g.append(hair);
    s.append(g);
    s.append(this.sceneLogo);
  }

  private buildFireflies(): void {
    const box = el('div', 'cv-flies');
    for (let i = 0; i < 18; i++) {
      const f = el('span', 'cv-fly');
      f.style.left = `${Math.random() * 100}%`;
      f.style.top = `${25 + Math.random() * 65}%`;
      f.style.animationDuration = `${6 + Math.random() * 6}s, ${1.6 + Math.random() * 1.8}s`;
      f.style.animationDelay = `${-Math.random() * 10}s, ${-Math.random() * 3}s`;
      if (i % 3 === 0) f.classList.add('big');
      box.append(f);
    }
    this.stage.append(box);
  }

  private async load(): Promise<void> {
    const base = await tryLoadImage(DIR + 'base.webp');
    if (!base) {
      // 대표 그림 레이어가 없으면 예전처럼 바로 알 부화 컷신
      this.started = true;
      this.onStart(false);
      return;
    }
    this.sky.style.backgroundImage = `url(${DIR}sky-ext.webp)`;
    this.ground.style.backgroundImage = `url(${DIR}ground-ext.webp)`;
    this.root.classList.remove('hidden');
    this.shown = true;
    this.layout();
    this.scheduleBlink();
    // 폭포: 4프레임 순환
    let k = 0;
    const frames = this.scene.querySelectorAll<HTMLElement>('.cv-fall-f');
    this.fallTimer = window.setInterval(() => {
      frames[k].classList.add('off');
      k = (k + 1) % frames.length;
      frames[k].classList.remove('off');
    }, 140);
  }

  private scheduleBlink(): void {
    this.blinkTimer = window.setTimeout(() => {
      this.blink.classList.remove('off');
      window.setTimeout(() => {
        this.blink.classList.add('off');
        // 가끔 두 번
        if (Math.random() < 0.25) {
          window.setTimeout(() => {
            this.blink.classList.remove('off');
            window.setTimeout(() => this.blink.classList.add('off'), 150);
          }, 220);
        }
        this.scheduleBlink();
      }, 170);
    }, 2600 + Math.random() * 2600);
  }

  // ───────────────────────── 배치 ─────────────────────────

  layout(): void {
    if (!this.shown) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const portrait = vw / vh < 1;
    this.root.classList.toggle('portrait', portrait);
    if (portrait) this.layoutPortrait(vw, vh);
    else this.layoutLandscape(vw, vh);
  }

  private layoutPortrait(vw: number, vh: number): void {
    // 원본 장면을 몇 px 너비만큼 보여 줄지: 화면 높이에 로고+장면+풀밭이 꽉 차도록 (560~700 사이)
    const unitsW = Math.min(P.w - 4, Math.max(560, (vw * 1350) / vh));
    const s = vw / unitsW;
    const Hs = vh / s;
    // 원본 기준 왼쪽 끝 (새로 그린 하늘·풀밭 폭 안에 들어가도록)
    const x0 = Math.min(P.cropX0 + P.w - unitsW, Math.max(P.cropX0, PORTRAIT_CENTER_X - unitsW / 2));
    // 상태 표시줄(노치) 아래부터: 화면 높이의 4% 또는 safe-area 중 큰 값
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;top:0;height:env(safe-area-inset-top);visibility:hidden';
    document.body.append(probe);
    const inset = probe.offsetHeight;
    probe.remove();
    const safeTop = Math.max(vh * 0.04, inset + 8) / s;

    Object.assign(this.stage.style, { width: `${unitsW}px`, height: `${Hs}px`, transform: `scale(${s})`, left: '0px', top: '0px' });
    // 로고: 위쪽 20~25%
    const logoW = unitsW * 0.94;
    const logoH = (logoW / L.logo.w) * L.logo.h;
    place(this.logoTop, { x: (unitsW - logoW) / 2, y: safeTop, w: logoW, h: logoH });
    this.logoTop.style.display = '';
    this.sceneLogo.style.display = 'none';
    // 장면: 로고 바로 아래 (장면 위쪽 하늘은 로고와 살짝 겹쳐도 됨, 고나 머리카락(원본 y≈548)은 로고 아래)
    const hairTop = 548 - SCENE_TOP;
    const sceneTop = Math.max(safeTop + logoH - hairTop + 18, Hs * 0.2);
    const sceneBottom = Math.min(sceneTop + SCENE_H, Hs - 150);
    const groundTop = sceneTop + SCENE_H;
    Object.assign(this.clip.style, { left: '0px', top: `${sceneTop}px`, width: `${unitsW}px`, height: `${Math.max(0, sceneBottom - sceneTop + (groundTop - sceneBottom))}px` });
    this.scene.style.transform = `translate(${-x0}px, ${-SCENE_TOP}px)`;
    // 하늘: 장면 위쪽에 이어서 (새로 그린 도트 하늘, 아래 끝 색 = 장면 윗줄 색)
    const extX = P.cropX0 - x0;
    Object.assign(this.sky.style, {
      display: '',
      left: `${extX}px`,
      top: `${sceneTop + 2 - P.skyH}px`,
      width: `${P.w}px`,
      height: `${P.skyH}px`,
    });
    this.stage.style.background = 'rgb(150,190,238)';
    // 풀밭: 장면 아래로 (윗줄 색 = 장면 아랫줄 색)
    Object.assign(this.ground.style, { display: '', left: `${extX}px`, top: `${groundTop - 1}px`, width: `${P.w}px`, height: `${Math.max(P.groundH, Hs - groundTop + 2)}px` });
    // 위쪽 모서리 장식
    const [cl, cr] = this.corners;
    for (const c of this.corners) c.style.display = '';
    Object.assign(cl.style, { left: `${-70}px`, top: '0px', width: '330px', height: '330px', backgroundPosition: '0px 0px', backgroundSize: `${IW}px ${IH}px` });
    Object.assign(cr.style, { left: `${unitsW - 260}px`, top: '0px', width: '320px', height: '420px', backgroundPosition: `${-(IW - 320)}px 0px`, backgroundSize: `${IW}px ${IH}px` });
    for (const sd of this.sides) sd.style.display = 'none';
    // 버튼: 풀밭 위 (그림 아래쪽 여백 가운데)
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
    for (const c of this.corners) c.style.display = 'none';
    this.logoTop.style.display = 'none';
    this.sceneLogo.style.display = '';
    // 양옆: 원본 가장자리를 거울처럼 이어 붙임
    const [sl, sr] = this.sides;
    for (const sd of this.sides) sd.style.display = left > 1 ? '' : 'none';
    const m = Math.ceil(left) + 1;
    // 왼쪽: 원본 왼쪽 m px 을 좌우 뒤집어 붙임 → 원본 0열이 그림 왼쪽 끝과 맞닿음
    Object.assign(sl.style, { left: '0px', top: `${top}px`, width: `${m}px`, height: `${h}px`, backgroundSize: `100% 100%, ${w}px ${h}px`, backgroundPosition: `0px 0px, 0px 0px` });
    // 오른쪽: 원본 오른쪽 m px 을 좌우 뒤집어 붙임
    Object.assign(sr.style, { left: `${Math.floor(left + w) - 1}px`, top: `${top}px`, width: `${m + 1}px`, height: `${h}px`, backgroundSize: `100% 100%, ${w}px ${h}px`, backgroundPosition: `0px 0px, ${-(w - m - 1)}px 0px` });
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
    window.setTimeout(() => {
      this.root.classList.add('hidden');
      clearTimeout(this.blinkTimer);
      clearInterval(this.fallTimer);
    }, 900);
  }
}
