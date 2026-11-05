/**
 * 오프닝(타이틀) 화면.
 *
 * 독립된 레이어 (아래 → 위):
 *   ① 배경   .t-bg     title-bg.png 또는 코드로 그린 버섯숲 (+ 뒤쪽 흔들리는 버섯)
 *   ② 캐릭터 .t-char   공룡 (통통 뛰기 + 눈 깜빡임)
 *   ③ 앞장식 .t-fg     앞쪽 잎·버섯 (title-fg.png 또는 기본 그림)
 *   ④ 포자   .t-spores 떠다니는 반딧불/포자
 *   ⑤ 로고   .t-logo   GONA’s Food Adventure (logo.png 또는 글자 로고)
 *   ⑥ 버튼   .t-start  실제 클릭 가능한 <button>
 *
 * 배경 그림은 화면 비율과 상관없이 "전체가 보이게(contain)" 맞추고,
 * 남는 여백은 그림 가장자리를 늘려 자연스럽게 채웁니다. (그림이 잘리지 않음)
 */
import { GAME_TITLE, SNACKS, STORAGE_KEYS, TITLE_ASSETS, TITLE_LAYOUT, type SnackKind } from '../config';
import { bus, EV } from '../events';
import { buildTitleArt, TITLE_STAGE_H, TITLE_STAGE_W, type TitleSprite } from '../art/titleArt';
import { mapToCanvas } from '../art/PixelCanvas';
import { snackCanvas } from '../art/textures';
import { sound } from '../audio';
import { storage } from '../storage';
import { el, pixelImg, tryLoadImage } from './dom';
import { buildEgg, buildNest, buildShellPieces, EGG_H, EGG_W, NEST_H, NEST_SINK, NEST_W } from '../art/nest';
import type { CharacterPreview } from '../scenes/BootScene';

const PLAY_ICON = ['k....', 'kk...', 'kwk..', 'kwwk.', 'kwwwk', 'kwwk.', 'kwk..', 'kk...', 'k....'];
const LEAF_ICON = ['....gg', '..gGGg', '.gGGg.', 'gGgg..', 'k.....', 'k.....'];

type Source = HTMLCanvasElement | HTMLImageElement;

export class TitleScreen {
  readonly root: HTMLElement;
  private bg: HTMLElement;
  private char: HTMLElement;
  private fg: HTMLElement;
  private spores: HTMLElement;
  private logo: HTMLElement;
  private start: HTMLElement;
  private startBtn: HTMLButtonElement;
  private best: HTMLElement;
  private fade: HTMLElement;
  private edges: { left: HTMLElement; right: HTMLElement; top: HTMLElement; bottom: HTMLElement };

  private hero: HTMLElement;
  private heroIdle: HTMLImageElement | null = null;
  private heroBlink: HTMLImageElement | null = null;
  private heroSrcH = 24;
  private heroAspect = 20 / 24;

  private stageW = TITLE_STAGE_W;
  private stageH = TITLE_STAGE_H;
  private bgSource: Source | null = null;
  private starting = false;
  private blinkTimer = 0;
  /** 오프닝 컷신(알 → 탄생) 진행 중 */
  private introRunning = false;
  private introTimers: number[] = [];
  private introParts: Record<string, HTMLElement> = {};
  private squirmTimer = 0;

  constructor(parent: HTMLElement) {
    this.root = el('section', 'title-root intro');
    this.root.setAttribute('aria-label', GAME_TITLE);

    this.edges = {
      left: el('div', 't-edge'),
      right: el('div', 't-edge'),
      top: el('div', 't-edge'),
      bottom: el('div', 't-edge'),
    };
    this.bg = el('div', 't-stage t-bg');
    this.char = el('div', 't-stage t-char');
    this.fg = el('div', 't-stage t-fg');
    this.spores = el('div', 't-stage t-spores');
    this.logo = el('div', 't-logo');
    this.start = el('div', 't-start');
    this.fade = el('div', 't-fade hidden');

    // 캐릭터 (그림은 BootScene 이 준비되면 채움)
    this.hero = el('div', 't-hero');
    const shadow = el('div', 't-hero-shadow');
    const bob = el('div', 't-hero-bob');
    this.hero.append(shadow, bob);
    this.char.append(this.hero);

    // 시작 버튼
    this.startBtn = el('button', 'start-btn');
    this.startBtn.type = 'button';
    this.startBtn.append(pixelImg(mapToCanvas(PLAY_ICON, { k: '#5a2e12', w: '#fff8e6' }), 3, 'start-icon'), el('span', '', '게임 시작'));
    const how = el('p', 't-how');
    how.innerHTML = '터치 <b>점프</b> · 공중에서 한 번 더 <b>더블 점프</b>';
    const snacks = el('ul', 't-snacks');
    (Object.keys(SNACKS) as SnackKind[]).forEach((k) => {
      const li = el('li');
      const icon = pixelImg(snackCanvas(k), 2);
      icon.dataset.snack = k;
      li.append(icon, el('span', '', `${SNACKS[k].points}`));
      snacks.append(li);
    });
    this.best = el('span', 't-best');
    snacks.append(this.best);
    this.start.append(this.startBtn, how, snacks);

    this.buildSpores();
    this.buildTextLogo();

    this.root.append(
      this.edges.left,
      this.edges.right,
      this.edges.top,
      this.edges.bottom,
      this.bg,
      this.char,
      this.fg,
      this.spores,
      this.logo,
      this.start,
    );
    parent.append(this.root, this.fade);

    this.startBtn.addEventListener('click', () => this.begin());
    bus.on(EV.ready, (p: CharacterPreview) => this.setCharacter(p));
    bus.on(EV.start, () => this.hide());
    window.addEventListener('resize', () => this.layout());

    this.refreshBest();
    void this.loadAssets();
  }

  get isVisible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  // ───────────────────────── 레이어 구성 ─────────────────────────

  private async loadAssets(): Promise<void> {
    const [bgImg, fgImg, logoImg] = await Promise.all([
      tryLoadImage(TITLE_ASSETS.background),
      tryLoadImage(TITLE_ASSETS.foreground),
      tryLoadImage(TITLE_ASSETS.logo),
    ]);

    if (bgImg) {
      // 사용자 배경 이미지
      this.stageW = bgImg.naturalWidth;
      this.stageH = bgImg.naturalHeight;
      this.bgSource = bgImg;
      bgImg.className = 'pixel t-full';
      bgImg.alt = '';
      this.bg.replaceChildren(bgImg);
      this.root.classList.add('custom-bg');
      if (fgImg) {
        fgImg.className = 'pixel t-full sway-fg';
        fgImg.alt = '';
        this.fg.replaceChildren(fgImg);
      }
    } else {
      // 기본: 코드로 그린 버섯숲
      const art = buildTitleArt();
      this.bgSource = art.base;
      const base = pixelImg(art.base, 1, 't-full');
      this.bg.replaceChildren(base);
      this.fg.replaceChildren();
      for (const s of art.sprites) (s.layer === 'back' ? this.bg : this.fg).append(this.spriteEl(s));
    }

    if (logoImg) {
      logoImg.className = 'pixel t-logo-img';
      logoImg.alt = GAME_TITLE;
      this.logo.replaceChildren(logoImg);
    }

    this.buildEdges();
    this.root.classList.add('loaded');
    this.layout();
  }

  private spriteEl(s: TitleSprite): HTMLElement {
    const frames = s.frames ?? 1;
    const w = s.canvas.width / frames;
    const wrap = el('div', `t-sprite ${s.kind}`);
    wrap.style.left = `${s.x}px`;
    wrap.style.top = `${s.y}px`;
    wrap.style.width = `${w}px`;
    wrap.style.height = `${s.canvas.height}px`;
    wrap.style.animationDelay = `${-s.delay}s`;
    const img = pixelImg(s.canvas, 1);
    if (frames > 1) {
      img.classList.add('t-frames');
      img.style.setProperty('--frame-shift', `${-w * (frames - 1)}px`);
    }
    wrap.append(img);
    return wrap;
  }

  /** 화면 비율이 그림과 다를 때 생기는 여백을 그림 가장자리로 채움 */
  private buildEdges(): void {
    const src = this.bgSource;
    if (!src) return;
    const w = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
    const h = src instanceof HTMLImageElement ? src.naturalHeight : src.height;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(src, 0, 0);

    const column = (x: number): string => {
      const col = document.createElement('canvas');
      col.width = 1;
      col.height = h;
      col.getContext('2d')?.drawImage(c, x, 0, 1, h, 0, 0, 1, h);
      return col.toDataURL();
    };
    const rowAverage = (y: number): string => {
      const d = ctx.getImageData(0, y, w, 1).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) {
        r += d[i];
        g += d[i + 1];
        b += d[i + 2];
      }
      const n = d.length / 4;
      return `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})`;
    };

    this.edges.left.style.backgroundImage = `url(${column(0)})`;
    this.edges.right.style.backgroundImage = `url(${column(w - 1)})`;
    const top = rowAverage(0);
    const bottom = rowAverage(h - 1);
    this.edges.top.style.background = top;
    this.edges.bottom.style.background = `linear-gradient(${bottom}, color-mix(in srgb, ${bottom} 80%, #3d2716))`;
    this.root.style.background = `linear-gradient(${top} 50%, ${bottom} 50%)`;
  }

  private buildSpores(): void {
    const colors = ['#fff7c2', '#ffe08a', '#d8f5a2', '#ffd6e8'];
    for (let i = 0; i < 14; i++) {
      const s = el('span', 't-spore');
      s.style.left = `${Math.random() * 100}%`;
      s.style.top = `${30 + Math.random() * 60}%`;
      s.style.background = colors[i % colors.length];
      s.style.animationDuration = `${5 + Math.random() * 5}s`;
      s.style.animationDelay = `${-Math.random() * 8}s`;
      this.spores.append(s);
    }
  }

  private buildTextLogo(): void {
    const plate = el('div', 'logo-stone');
    const leaf = pixelImg(mapToCanvas(LEAF_ICON, { g: '#8fcf5a', G: '#5f9e3c', k: '#6b442b' }), 1, 'logo-leaf');
    const leaf2 = pixelImg(mapToCanvas(LEAF_ICON, { g: '#8fcf5a', G: '#5f9e3c', k: '#6b442b' }), 1, 'logo-leaf right');
    const [name, ...rest] = GAME_TITLE.split(' ');
    plate.append(leaf, leaf2, el('span', 'logo-gona', name), el('span', 'logo-sub', rest.join(' ')));
    this.logo.replaceChildren(plate);
  }

  private setCharacter(p: CharacterPreview): void {
    // 간식 아이콘도 실제 게임 이미지로 맞춤
    this.start.querySelectorAll<HTMLImageElement>('img[data-snack]').forEach((img) => {
      const src = p.snacks[img.dataset.snack as SnackKind];
      if (!src) return;
      img.src = src.toDataURL();
      img.width = src.width * 2;
      img.height = src.height * 2;
    });
    this.buildNestScene(p);
    this.layout();
    this.playIntro();
  }

  // ───────────────────────── 오프닝 컷신: 둥지 위 알 → 머리카락 삐죽 → 팍! 탄생 ─────────────────────────

  /** 무대 좌표(도트) 기준 둥지·알·아기 배치. 영웅 상자 = COMP_W x COMP_H 도트 */
  private static readonly COMP_W = 32;
  private static readonly COMP_H = 36;

  private placeArt(img: HTMLElement, x: number, y: number, w: number, h: number): void {
    const W = TitleScreen.COMP_W;
    const H = TitleScreen.COMP_H;
    Object.assign(img.style, { left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%`, width: `${(w / W) * 100}%`, height: `${(h / H) * 100}%` });
  }

  private buildNestScene(p: CharacterPreview): void {
    const bob = this.hero.querySelector('.t-hero-bob');
    if (!bob) return;
    this.hero.classList.add('nest-hero');
    const W = TitleScreen.COMP_W;
    const H = TitleScreen.COMP_H;
    const nest = buildNest();
    const nestX = Math.round((W - NEST_W) / 2);
    const nestY = H - NEST_H;
    const eggX = Math.round((W - EGG_W) / 2);
    const eggY = nestY + NEST_SINK + 1 - EGG_H;

    const mk = (c: HTMLCanvasElement, cls: string, x: number, y: number): HTMLImageElement => {
      const img = pixelImg(c, 1, `t-art ${cls}`);
      this.placeArt(img, x, y, c.width, c.height);
      return img;
    };
    const nestBack = mk(nest.back, 'nest-back', nestX, nestY);
    const nestFront = mk(nest.front, 'nest-front', nestX, nestY);
    // 머리카락: 알 꼭대기 뒤에 숨어 있다가 위로 삐죽
    const hair = p.newborn.hair;
    // 알 꼭대기 구멍(가운데) 위로, 머리카락 전체가 보이도록
    const hairImg = mk(hair, 'egg-hair', eggX + 9 - Math.round(hair.width / 2), eggY - hair.height + 1);
    const eggs = ([0, 1, 2] as const).map((k) => mk(buildEgg(k), `egg egg-${k}${k ? ' hidden' : ''}`, eggX, eggY));
    const egg = el('div', 't-egg');
    egg.style.transformOrigin = `50% ${((eggY + EGG_H) / H) * 100}%`; // 알 바닥을 축으로 흔들림
    egg.append(hairImg, ...eggs); // 머리카락은 알 뒤(같이 흔들림)
    // 아기 (둥지 안에 쏙)
    const f0 = p.newborn.frames[0];
    const babyX = Math.round((W - f0.width) / 2);
    const babyY = nestY + NEST_SINK - f0.height + 1;
    const baby = el('div', 't-baby hidden');
    this.placeArt(baby, babyX, babyY, f0.width, f0.height);
    this.heroIdle = pixelImg(f0, 1, 't-hero-img');
    const squirm = p.newborn.frames[1] ? pixelImg(p.newborn.frames[1], 1, 't-hero-img hidden') : null;
    this.heroBlink = p.newborn.blink ? pixelImg(p.newborn.blink, 1, 't-hero-img hidden') : null;
    baby.append(this.heroIdle, ...(squirm ? [squirm] : []), ...(this.heroBlink ? [this.heroBlink] : []));
    if (squirm) this.introParts.squirm = squirm;
    // 깨진 껍데기 조각 + 번쩍
    const shells = buildShellPieces();
    const shellEls = [
      mk(shells[0], 'shell shell-top hidden', eggX + 1, eggY - 1),
      mk(shells[1], 'shell shell-left hidden', eggX - 1, eggY + 8),
      mk(shells[2], 'shell shell-right hidden', eggX + 8, eggY + 8),
    ];
    const flash = el('div', 't-flash hidden');
    this.placeArt(flash, 2, eggY - 6, W - 4, EGG_H + 10);

    bob.replaceChildren(nestBack, egg, baby, ...shellEls, nestFront, flash);
    this.introParts = { ...this.introParts, egg, hair: hairImg, baby, flash, eggs0: eggs[0], eggs1: eggs[1], eggs2: eggs[2] };
    shellEls.forEach((e, i) => (this.introParts[`shell${i}`] = e));
    this.heroSrcH = H;
    this.heroAspect = W / H;
  }

  private playIntro(): void {
    if (this.introRunning || !this.root.classList.contains('intro')) return;
    this.introRunning = true;
    const P = this.introParts;
    const at = (ms: number, fn: () => void): void => {
      this.introTimers.push(window.setTimeout(fn, ms));
    };
    at(300, () => P.egg.classList.add('wobble'));
    at(1200, () => {
      P.eggs0.classList.add('hidden');
      P.eggs1.classList.remove('hidden');
      P.egg.classList.add('wobble-hard');
    });
    at(1900, () => {
      P.eggs1.classList.add('hidden');
      P.eggs2.classList.remove('hidden');
      P.hair.classList.add('peek'); // 머리카락이 먼저 삐죽!
    });
    at(3100, () => this.hatch(true)); // 머리카락이 1초 남짓 보인 뒤 팍!
    at(3800, () => this.finishIntro());
  }

  /** 알이 팍 깨지며 갓난아기 등장 */
  private hatch(animated: boolean): void {
    const P = this.introParts;
    P.egg.classList.add('hidden');
    P.hair.classList.add('hidden');
    P.baby.classList.remove('hidden');
    if (animated) {
      P.baby.classList.add('pop');
      P.flash.classList.remove('hidden');
      for (let i = 0; i < 3; i++) P[`shell${i}`]?.classList.remove('hidden');
      this.root.classList.add('hatched');
    }
  }

  /** 컷신 끝 (또는 터치로 건너뛰기) → 타이틀·시작 버튼 표시 */
  private finishIntro(): void {
    this.introTimers.forEach((t) => clearTimeout(t));
    this.introTimers = [];
    if (this.introParts.baby?.classList.contains('hidden')) this.hatch(false); // 건너뛰기: 바로 탄생 상태로
    this.introRunning = false;
    this.root.classList.remove('intro');
    this.root.classList.add('intro-done');
    this.introParts.baby?.classList.add('wiggle');
    this.layout();
    this.scheduleBlink();
    this.scheduleSquirm();
  }

  /** 둥지 안에서 꼬물꼬물 (꿈틀 프레임 교대) */
  private scheduleSquirm(): void {
    const sq = this.introParts.squirm;
    if (!sq || !this.heroIdle) return;
    clearInterval(this.squirmTimer);
    let on = false;
    this.squirmTimer = window.setInterval(() => {
      if (this.heroBlink && !this.heroBlink.classList.contains('hidden')) return;
      on = !on;
      sq.classList.toggle('hidden', !on);
      this.heroIdle?.classList.toggle('hidden', on);
    }, 380);
  }

  /** 화면 터치: 컷신 중이면 건너뛰기, 끝났으면 게임 시작 */
  handleTap(): void {
    if (!this.isVisible) return;
    if (this.root.classList.contains('intro')) {
      if (this.introParts.baby) this.finishIntro();
      return;
    }
    this.begin();
  }

  private scheduleBlink(): void {
    clearTimeout(this.blinkTimer);
    if (!this.heroBlink) return;
    this.blinkTimer = window.setTimeout(() => {
      const twice = Math.random() < 0.3;
      this.blinkOnce(() => (twice ? window.setTimeout(() => this.blinkOnce(() => this.scheduleBlink()), 160) : this.scheduleBlink()));
    }, 1800 + Math.random() * 2600);
  }

  private blinkOnce(done: () => void): void {
    if (!this.heroIdle || !this.heroBlink) return;
    this.heroIdle.classList.add('hidden');
    this.introParts.squirm?.classList.add('hidden');
    this.heroBlink.classList.remove('hidden');
    window.setTimeout(() => {
      this.heroIdle?.classList.remove('hidden');
      this.heroBlink?.classList.add('hidden');
      done();
    }, 130);
  }

  // ───────────────────────── 배치 ─────────────────────────

  layout(): void {
    if (!this.isVisible) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scale = Math.min(vw / this.stageW, vh / this.stageH);
    const sw = this.stageW * scale;
    const sh = this.stageH * scale;
    const left = (vw - sw) / 2;
    const top = (vh - sh) / 2;

    for (const layer of [this.bg, this.char, this.fg, this.spores]) {
      layer.style.width = `${this.stageW}px`;
      layer.style.height = `${this.stageH}px`;
      layer.style.transform = `translate(${left}px, ${top}px) scale(${scale})`;
    }

    // 가장자리 채움
    const e = this.edges;
    Object.assign(e.left.style, { left: '0px', top: `${top}px`, width: `${Math.ceil(left) + 1}px`, height: `${sh}px` });
    Object.assign(e.right.style, { left: `${Math.floor(left + sw) - 1}px`, top: `${top}px`, width: `${Math.ceil(left) + 2}px`, height: `${sh}px` });
    Object.assign(e.top.style, { left: '0px', top: '0px', width: `${vw}px`, height: `${Math.ceil(top) + 1}px` });
    Object.assign(e.bottom.style, { left: '0px', top: `${Math.floor(top + sh) - 1}px`, width: `${vw}px`, height: `${Math.ceil(top) + 2}px` });

    // 캐릭터: 기본 그림이면 정수배로 키워 도트를 선명하게
    const target = TITLE_LAYOUT.characterHeight * this.stageH;
    const k = this.heroSrcH <= target ? Math.max(1, Math.round(target / this.heroSrcH)) : target / this.heroSrcH;
    const hh = this.heroSrcH * k;
    const hw = hh * this.heroAspect;
    Object.assign(this.hero.style, {
      width: `${hw}px`,
      height: `${hh}px`,
      left: `${TITLE_LAYOUT.characterX * this.stageW - hw / 2}px`,
      top: `${TITLE_LAYOUT.characterGroundY * this.stageH - hh}px`,
    });

    // 로고: 위쪽 여백이 넉넉하면(세로 화면) 여백 가운데, 아니면 그림 위쪽에 겹쳐서
    const logoW = Math.min(vw * 0.88, sw * 0.62, 520);
    this.logo.style.setProperty('--u', `${logoW / 100}px`);
    this.logo.style.width = `${logoW}px`;
    const logoH = this.logo.offsetHeight || logoW * 0.32;
    const logoTop = top >= logoH + 24 ? (top - logoH) / 2 + 6 : top + sh * 0.05;
    this.logo.style.left = `${(vw - logoW) / 2}px`;
    this.logo.style.top = `${Math.max(logoTop, 8)}px`;

    // 시작 버튼: 아래 여백이 넉넉하면(세로 화면) 여백 가운데에 세로로,
    // 아니면(가로 화면) 캐릭터를 가리지 않도록 그림 맨 아래에 가로로 한 줄 배치
    const bottomSpare = vh - (top + sh);
    this.root.classList.add('tall');
    this.start.style.setProperty('--b', `${Math.max(3.2, Math.min(vw / 100, vh / 60, 7))}px`);
    let startH = this.start.offsetHeight;
    const tall = bottomSpare >= startH + 24;
    if (!tall) {
      this.root.classList.remove('tall');
      this.start.style.setProperty('--b', `${Math.max(3, Math.min(vw / 110, vh / 88, 6))}px`);
      startH = this.start.offsetHeight;
    }
    const startTop = tall ? top + sh + (bottomSpare - startH) / 2 : vh - startH - Math.max(6, vh * 0.025);
    this.start.style.top = `${startTop}px`;
  }

  private refreshBest(): void {
    const best = Number(storage.get(STORAGE_KEYS.best) ?? 0) || 0;
    this.best.textContent = best > 0 ? `최고 ${best}점` : '';
    this.best.classList.toggle('hidden', best <= 0);
  }

  // ───────────────────────── 시작 전환 ─────────────────────────

  /** 시작 버튼 (또는 Space 키) */
  begin(): void {
    if (this.starting || !this.isVisible) return;
    if (this.root.classList.contains('intro')) {
      this.finishIntro();
      return;
    }
    this.starting = true;
    sound.unlock();
    sound.start();
    this.startBtn.classList.add('pressed');
    this.hero.classList.add('leap');

    window.setTimeout(() => {
      this.fade.classList.remove('hidden', 'out');
      this.fade.classList.add('in');
    }, 380);
    window.setTimeout(() => {
      this.hide();
      bus.emit(EV.requestStart);
      this.fade.classList.remove('in');
      this.fade.classList.add('out');
    }, 380 + 320);
    window.setTimeout(() => this.fade.classList.add('hidden'), 380 + 320 + 400);
  }

  private hide(): void {
    this.root.classList.add('hidden');
    clearTimeout(this.blinkTimer);
    clearInterval(this.squirmTimer);
  }
}
