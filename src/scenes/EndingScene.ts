/**
 * 가족 엔딩 컷신 — 원본 그림 기반 시네마틱 (약 50초 → THE END)
 *
 * 가족은 코드로 그리거나 새로 만든 캐릭터를 쓰지 않음. 사용자가 준 B스타일 엔딩 스토리보드의 장면 그림(②~⑥)을
 * 픽셀 그대로 잘라 낸 이미지(public/assets/ending/shot-*.png — 위쪽 장면 제목 띠만 잘라 냄, 나머지 픽셀은 원본과 같음)를
 * 원본 비율 그대로 화면 안에 맞춰 보여 주고, 부드러운 카메라 이동(천천히 다가가기·멀어지기)과 장면 전환(겹쳐 사라지기)만 더함.
 *   - 고나가 마을에 걸어 들어오는 첫 부분은 게임 속 고나 그림 + 엔딩 배경(해 질 녘 버섯마을)
 *   - 그다음부터는 원본 장면 그림: 가족 발견 → 달려가기 → 품에 안기기 → 뽀뽀 → 킁카 → 단체 엔딩(최종 그림)
 *   - 하트·'쪽!'·'킁킁♡' 같은 효과만 그림 위에 살짝 띄움 (인물은 그리지 않음)
 * 자막(타이핑)·엔딩 음악·THE END 화면은 그대로.
 * 최종 그림을 바꾸려면 public/assets/ending/shot-final.png 를 같은 이름으로 덮어쓰면 됨 (크기·비율 자유).
 * 그림은 엔딩이 시작될 때만 불러옴 (앱 시작·프롤로그 때는 받지 않음).
 */
import Phaser from 'phaser';
import { bus, EV } from '../events';
import { sound } from '../audio';
import { perf } from '../perf';

export const ENDING_LINES: { at: number; text: string }[] = [
  { at: 1.0, text: '길고 길었던 고나의 모험이 끝나고,\n숲에는 따뜻한 저녁이 찾아왔어요.' },
  { at: 7.0, text: '그때, 고나가 가장 보고 싶었던\n사람들이 보였어요.' },
  { at: 13.6, text: '고나는 있는 힘껏\n가족을 향해 달려갔답니다.' },
  { at: 20.4, text: '아무리 커다란 모험을 하고 돌아와도,\n가족 품은 언제나 따뜻했어요.' },
  { at: 29.6, text: '무섭기만 했던 뽀뽀와 킁카도,\n가족의 사랑 앞에서는 가장 따뜻한 선물이 되었어요.' },
];
export const ENDING_THE_END_AT = 48;

/** 원본 장면 그림 (순서대로) */
export const ENDING_SHOTS = ['discover', 'run', 'hug', 'kiss', 'sniff', 'final'] as const;
export type ShotId = (typeof ENDING_SHOTS)[number];

interface Layout {
  bg: string;
  W: number;
  H: number;
  c: number;
  ground: number;
  gonaStart: number;
  gonaStop: number;
  lamps: [number, number][];
}

const LAYOUTS: Record<'land' | 'port', Layout> = {
  land: { bg: 'end-bgB-land', W: 320, H: 180, c: 160, ground: 172, gonaStart: -24, gonaStop: 150, lamps: [[94, 41], [237, 41]] },
  port: { bg: 'end-bgB-port', W: 180, H: 320, c: 92, ground: 236, gonaStart: -24, gonaStop: 92, lamps: [[15, 116], [163, 116]] },
};

type Cue = { at: number; fn: () => void; done?: boolean };

export class EndingScene extends Phaser.Scene {
  /** 지난 시간(초) — (검증용) 바꿔서 빨리 감기 가능 */
  t = 0;
  sceneNo = 1;
  /** 지금 보이는 원본 장면 그림 (없으면 null = 마을·고나 장면) */
  shotNow: ShotId | null = null;
  /** (검증용) 이 시간에서 멈춤 — 최종 그림 바로 보기 */
  holdAt = Infinity;
  private cues: Cue[] = [];
  private L!: Layout;
  private portrait = false;
  private Z0 = 6;
  private gona!: Phaser.GameObjects.Sprite;
  gx = 0;
  private galt = 0;
  private gsq = 1;
  private gMode: 'walk' | 'stand' | 'wow' | 'happy' | 'hide' = 'walk';
  private dim!: Phaser.GameObjects.Rectangle;
  private card: { img: Phaser.GameObjects.Image; frame: Phaser.GameObjects.Rectangle; shadow: Phaser.GameObjects.Rectangle; id: ShotId } | null = null;

  constructor() {
    super('EndingCine');
  }

  preload(): void {
    // 엔딩 그림은 이때 처음 받음 (불러오며 디코딩·텍스처 준비까지 끝난 뒤 create → 재생 중 멈칫 없음)
    for (const id of ENDING_SHOTS) if (!this.textures.exists(`end-shot-${id}`)) this.load.image(`end-shot-${id}`, `assets/ending/shot-${id}.png`);
  }

  create(): void {
    const tCreate = performance.now();
    this.t = 0;
    this.sceneNo = 1;
    this.shotNow = null;
    this.holdAt = Infinity;
    this.cues = [];
    this.card = null;
    // 원본 그림은 부드럽게 확대·축소 (화면에 맞추는 배율이 정수가 아니어서 도트 굵기가 들쭉날쭉하지 않게)
    for (const id of ENDING_SHOTS) if (this.textures.exists(`end-shot-${id}`)) this.textures.get(`end-shot-${id}`).setFilter(Phaser.Textures.FilterMode.LINEAR);
    const cam = this.cameras.main;
    this.portrait = this.scale.height > this.scale.width;
    this.L = LAYOUTS[this.portrait ? 'port' : 'land'];
    const L = this.L;
    this.Z0 = Math.max(1, Math.ceil(Math.max(this.scale.width / L.W, this.scale.height / L.H)));
    cam.setZoom(this.Z0).setBounds(0, 0, L.W, L.H).setRoundPixels(true).setBackgroundColor('#2a1a3a');
    this.add.image(0, 0, L.bg).setOrigin(0, 0).setDepth(0);
    for (const [i, [x, y]] of L.lamps.entries()) {
      const g = this.add.image(x, y, 'end-glow').setDepth(1).setScale(0.55).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: g, alpha: 0.75, scale: 0.62, duration: 900 + i * 230, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }
    this.add
      .particles(0, 0, 'end-petal', { frame: [0, 1], x: { min: 0, max: L.W + 20 }, y: -4, lifespan: 9000, speedX: { min: -10, max: -3 }, speedY: { min: 7, max: 14 }, rotate: { min: 0, max: 360 }, frequency: perf.low ? 900 : 520 })
      .setDepth(400);
    // 원본 그림 뒤 배경을 살짝 어둡게 (그림이 액자처럼 또렷하게)
    this.dim = this.add.rectangle(0, 0, L.W, L.H, 0x1a0e24, 1).setOrigin(0, 0).setDepth(200).setAlpha(0);
    this.gx = L.gonaStart;
    this.gona = this.add.sprite(this.gx, L.ground + 1, 'dino', 0).setOrigin(0.5, 1).setDepth(180);
    this.shot(L.c, L.H * (this.portrait ? 0.3 : 0.35), this.Z0, 0);
    cam.fadeIn(1200, 40, 20, 50);
    this.buildCues();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cues = [];
      this.card = null;
    });
    perf.mark('ending:create', performance.now() - tCreate);
  }

  private at(at: number, fn: () => void): void {
    this.cues.push({ at, fn });
  }

  /** 배율 z 에서 발이 자막 위에 오도록 카메라 가운데 y */
  private frameY(z: number): number {
    const vh = this.scale.height / z;
    const top = this.portrait ? this.L.ground + 8 - vh * 0.7 : this.L.ground + 6 - vh;
    return top + vh / 2;
  }

  /** 카메라: (x, y) 가운데 · 정수 배율 z · dur 초 (0 = 컷) */
  private shot(x: number, y: number, z: number, dur: number): void {
    const cam = this.cameras.main;
    const L = this.L;
    const vw = this.scale.width / z;
    const vh = this.scale.height / z;
    const cx = Phaser.Math.Clamp(x, vw / 2, L.W - vw / 2);
    const cy = Phaser.Math.Clamp(y, vh / 2, L.H - vh / 2);
    if (dur <= 0) {
      cam.setZoom(z);
      cam.centerOn(cx, cy);
      return;
    }
    if (cam.zoom !== z) cam.zoomTo(z, dur * 1000, 'Sine.easeInOut');
    cam.pan(cx, cy, dur * 1000, 'Sine.easeInOut');
  }

  /**
   * 원본 장면 그림이 들어갈 화면 영역 (화면 픽셀): 자막·버튼에 가리지 않는 곳
   *   세로: 위쪽 ~ 자막 상자 위 / 가로: 위쪽 자막 아래 ~ 화면 아래
   */
  private cardBox(): { x: number; y: number; w: number; h: number } {
    const W = this.scale.width;
    const H = this.scale.height;
    // 자막 상자(화면 글자) 위치를 실제로 재서 그 바깥에 그림을 둠
    const sub = this.domBox('.prologue-ui:not(.hidden) .pr-box:not(.hidden)');
    if (this.portrait) {
      const top = H * 0.04;
      const bottom = sub ? sub.y - H * 0.03 : H * 0.66;
      return { x: W * 0.04, y: top, w: W * 0.92, h: Math.max(H * 0.3, bottom - top) };
    }
    const top = sub ? sub.y + sub.h + H * 0.04 : H * 0.27;
    return { x: W * 0.05, y: top, w: W * 0.9, h: Math.max(H * 0.4, H * 0.96 - top) };
  }

  /** 화면 글자(DOM) 요소의 영역을 게임 화면 좌표로 (없거나 숨겨져 있으면 null) */
  private domBox(sel: string, useOffset = false): { x: number; y: number; w: number; h: number } | null {
    const elx = document.querySelector(sel) as HTMLElement | null;
    const canvas = this.game.canvas;
    if (!elx || !canvas) return null;
    const c = canvas.getBoundingClientRect();
    let r: { left: number; top: number; width: number; height: number } = elx.getBoundingClientRect();
    if (useOffset) {
      // 나타나는 중(확대 애니메이션)인 요소는 변형 전 자리로
      const p = (elx.offsetParent as HTMLElement | null)?.getBoundingClientRect();
      if (p) r = { left: p.left + elx.offsetLeft, top: p.top + elx.offsetTop, width: elx.offsetWidth, height: elx.offsetHeight };
    }
    if (!r.width || !r.height || !c.width) return null;
    const kx = this.scale.width / c.width;
    const ky = this.scale.height / c.height;
    return { x: (r.left - c.left) * kx, y: (r.top - c.top) * ky, w: r.width * kx, h: r.height * ky };
  }

  /** THE END 글자·버튼이 나타나면 최종 그림을 그 옆(세로: 위, 가로: 왼쪽)으로 옮겨 가리지 않게 */
  private makeRoomForTheEnd(): void {
    const c = this.card;
    if (!c) return;
    const W = this.scale.width;
    const H = this.scale.height;
    const txt = this.domBox('.ending-ui .end-card', true);
    let box: { x: number; y: number; w: number; h: number };
    if (this.portrait) {
      const bottom = txt ? txt.y - H * 0.02 : H * 0.3;
      box = { x: W * 0.04, y: H * 0.03, w: W * 0.92, h: Math.max(H * 0.15, bottom - H * 0.03) };
    } else {
      const right = txt ? txt.x - W * 0.02 : W * 0.5;
      box = { x: W * 0.03, y: H * 0.06, w: Math.max(W * 0.3, right - W * 0.03), h: H * 0.88 };
    }
    const cam = this.cameras.main;
    const sScreen = Math.min(box.w / c.img.width, box.h / c.img.height);
    const s = sScreen / cam.zoom;
    const cx = cam.worldView.x + (box.x + box.w / 2) / cam.zoom;
    const cy = cam.worldView.y + (box.y + box.h / 2) / cam.zoom;
    const pad = 3 / cam.zoom;
    this.tweens.killTweensOf([c.img, c.frame, c.shadow]);
    this.tweens.add({ targets: c.img, x: cx, y: cy, scale: s, duration: 900, ease: 'Sine.InOut' });
    const w = c.img.width * s + pad * 2;
    const h = c.img.height * s + pad * 2;
    this.tweens.add({ targets: c.frame, x: cx, y: cy, displayWidth: w, displayHeight: h, alpha: 1, duration: 900, ease: 'Sine.InOut' });
    this.tweens.add({ targets: c.shadow, x: cx + pad, y: cy + pad * 1.5, displayWidth: w, displayHeight: h, duration: 900, ease: 'Sine.InOut' });
  }

  /** 원본 그림을 원본 비율 그대로 영역 안에 맞춘 크기(월드 단위)와 가운데 */
  private cardFit(id: ShotId): { cx: number; cy: number; s: number } {
    const cam = this.cameras.main;
    const tex = this.textures.get(`end-shot-${id}`).getSourceImage() as HTMLImageElement;
    const b = this.cardBox();
    const sScreen = Math.min(b.w / tex.width, b.h / tex.height);
    const view = cam.worldView;
    // 화면 픽셀 → 월드 (카메라가 멈춰 있는 동안만 카드를 띄움)
    const cx = view.x + (b.x + b.w / 2) / cam.zoom;
    const cy = view.y + (b.y + b.h / 2) / cam.zoom;
    return { cx, cy, s: sScreen / cam.zoom };
  }

  /** 원본 장면 그림 보여 주기 (앞 그림과 겹쳐 사라짐) · 천천히 다가가기(push) 또는 멀어지기(pull) */
  private showCard(id: ShotId, dur: number, move: 'push' | 'pull' | 'panR' | 'panL' = 'push'): void {
    if (!this.textures.exists(`end-shot-${id}`)) return;
    this.shotNow = id;
    const fit = this.cardFit(id);
    const prev = this.card;
    const shadow = this.add.rectangle(fit.cx, fit.cy, 1, 1, 0x120818, 0.55).setDepth(205);
    const frame = this.add.rectangle(fit.cx, fit.cy, 1, 1, 0xf6e4c0, 1).setDepth(206).setStrokeStyle(0);
    const img = this.add.image(fit.cx, fit.cy, `end-shot-${id}`).setDepth(207).setAlpha(0);
    const card = { img, frame, shadow, id };
    this.card = card;
    const k0 = move === 'pull' ? 1.1 : 1;
    const k1 = move === 'pull' ? 1 : move === 'push' ? 1.06 : 1.03;
    const dx = move === 'panR' ? 1 : move === 'panL' ? -1 : 0;
    const w = img.width * fit.s;
    const apply = (k: number, ox: number): void => {
      if (!img.active || !frame.active || !shadow.active) return; // 다음 그림으로 넘어가 지워진 뒤
      img.setScale(fit.s * k).setPosition(fit.cx + ox, fit.cy);
      // 액자: 그림보다 조금 큰 크림색 테두리 + 그림자 (화면 기준 3px)
      const pad = 3 / this.cameras.main.zoom;
      frame.setPosition(img.x, img.y).setSize(img.displayWidth + pad * 2, img.displayHeight + pad * 2).setOrigin(0.5);
      shadow.setPosition(img.x + pad, img.y + pad * 1.5).setSize(img.displayWidth + pad * 2, img.displayHeight + pad * 2).setOrigin(0.5);
    };
    const st = { k: k0, ox: -dx * w * 0.015 };
    apply(st.k, st.ox);
    frame.setAlpha(0);
    shadow.setAlpha(0);
    this.tweens.add({ targets: [img, frame], alpha: 1, duration: 650, ease: 'Sine.Out' });
    this.tweens.add({ targets: shadow, alpha: 0.55, duration: 650 });
    const move1 = this.tweens.add({ targets: st, k: k1, ox: dx * w * 0.015, duration: dur * 1000, ease: 'Sine.InOut', onUpdate: () => apply(st.k, st.ox) });
    img.once(Phaser.GameObjects.Events.DESTROY, () => move1.stop());
    if (prev) {
      this.tweens.add({
        targets: [prev.img, prev.frame, prev.shadow],
        alpha: 0,
        duration: 650,
        delay: 150,
        onComplete: () => {
          prev.img.destroy();
          prev.frame.destroy();
          prev.shadow.destroy();
        },
      });
    }
  }

  /** 그림 위 효과 (하트·말풍선 글자) — 그림 안 위치(0~1) 기준 */
  private cardFx(kind: 'heart' | 'text', u: number, v: number, text = '', color = '#ffffff'): void {
    const c = this.card;
    if (!c) return;
    const x = c.img.x + (u - 0.5) * c.img.displayWidth;
    const y = c.img.y + (v - 0.5) * c.img.displayHeight;
    if (kind === 'heart') this.heart(x, y);
    else this.float(text, x, y, color);
  }

  private line(i: number): void {
    const l = ENDING_LINES[i];
    const next = ENDING_LINES[i + 1]?.at ?? ENDING_THE_END_AT - 4;
    bus.emit(EV.prologueLine, { index: i, total: ENDING_LINES.length, text: l.text, seconds: Math.min(6, next - l.at) });
  }

  private buildCues(): void {
    const L = this.L;
    const Z0 = this.Z0;
    ENDING_LINES.forEach((l, i) => this.at(l.at, () => this.line(i)));
    // ── 01 노을의 버섯마을: 하늘·마을에서 돌길로 천천히 (엔딩 음악 시작 — 전투 음악은 보스 퇴장 때 멈춤)
    this.at(0, () => sound.startMusic('ending'));
    this.at(0.3, () => this.shot(L.c, this.frameY(Z0), Z0, 4.8));
    // ── 02 고나가 걸어 들어와 멈춤 → 깜짝! (무언가를 발견)
    this.at(4.6, () => {
      this.gMode = 'walk';
      this.tweens.add({ targets: this, gx: L.gonaStop, duration: 3200, ease: 'Sine.Out', onComplete: () => (this.gMode = 'stand') });
    });
    this.at(8.0, () => {
      this.gMode = 'wow';
      this.hop(2);
      sound.warn();
      this.float('!', this.gx + 4, L.ground - 42, '#fff3a0');
    });
    // 원본 그림: 가족 발견
    this.at(9.0, () => {
      this.sceneNo = 2;
      this.tweens.add({ targets: this.dim, alpha: 0.6, duration: 700 });
      this.showCard('discover', 4.4, 'push');
    });
    this.at(9.9, () => this.gMode = 'hide');
    // ── 03 달려가기
    this.at(13.4, () => {
      this.sceneNo = 3;
      sound.catch();
      this.showCard('run', 5.2, 'panR');
    });
    // ── 04 품에 안기기
    this.at(18.6, () => {
      this.sceneNo = 4;
      sound.catch();
      this.showCard('hug', 10, 'push');
    });
    this.at(20.4, () => this.cardFx('heart', 0.5, 0.25));
    this.at(22.6, () => this.cardFx('heart', 0.62, 0.2));
    this.at(25.0, () => this.cardFx('heart', 0.4, 0.22));
    // ── 05 뽀뽀(쪽!) → 킁카(킁킁♡)
    this.at(28.6, () => {
      this.sceneNo = 5;
      this.showCard('kiss', 5.4, 'push');
    });
    this.at(29.6, () => {
      sound.smooch();
      this.cardFx('text', 0.55, 0.2, '쪽!', '#ff9fc4');
    });
    this.at(30.2, () => this.cardFx('heart', 0.66, 0.16));
    this.at(31.6, () => this.cardFx('heart', 0.6, 0.24));
    this.at(34.0, () => this.showCard('sniff', 6, 'push'));
    this.at(34.8, () => {
      sound.inhale();
      this.cardFx('text', 0.45, 0.18, '킁킁♡', '#ffd0e2');
    });
    this.at(36.6, () => this.cardFx('heart', 0.35, 0.22));
    // ── 06 단체 엔딩 (최종 그림) → 카메라가 천천히 멀어짐 → THE END
    this.at(40.0, () => {
      this.sceneNo = 6;
      sound.catch();
      this.showCard('final', 7.6, 'pull');
    });
    this.at(41.4, () => this.cardFx('heart', 0.27, 0.12));
    this.at(43.2, () => this.cardFx('heart', 0.76, 0.12));
    this.at(ENDING_THE_END_AT, () => {
      bus.emit(EV.endingTheEnd);
      this.makeRoomForTheEnd();
    });
  }

  private hop(px: number): void {
    this.tweens.add({ targets: this, galt: px, duration: 140, yoyo: true, ease: 'Sine.Out' });
  }

  private heart(x: number, y: number): void {
    const h = this.add.image(x, y, 'end-heart').setDepth(500).setScale(1.5);
    this.tweens.add({ targets: h, y: y - 14, alpha: 0, duration: 1400, ease: 'Sine.Out', onComplete: () => h.destroy() });
  }

  private float(text: string, x: number, y: number, color: string): void {
    const key = `end-ft:${color}:${text}`;
    if (!this.textures.exists(key)) {
      const c = document.createElement('canvas');
      const g = c.getContext('2d')!;
      g.font = '12px Galmuri11, monospace';
      c.width = Math.ceil(g.measureText(text).width) + 8;
      c.height = 18;
      g.font = '12px Galmuri11, monospace';
      g.textBaseline = 'middle';
      g.lineWidth = 3;
      g.strokeStyle = '#3a1a3a';
      g.strokeText(text, 4, 9);
      g.fillStyle = color;
      g.fillText(text, 4, 9);
      this.textures.addCanvas(key, c);
    }
    const t = this.add.image(x, y, key).setDepth(510).setScale(0.6);
    this.tweens.add({ targets: t, y: y - 8, alpha: 0, duration: 1200, delay: 400, onComplete: () => t.destroy() });
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 250) / 1000;
    if (this.t + dt >= this.holdAt) {
      this.t = this.holdAt;
    } else this.t += dt;
    for (const c of this.cues) {
      if (!c.done && this.t >= c.at) {
        c.done = true;
        c.fn();
      }
    }
    this.gsq += (1 - this.gsq) * Math.min(1, dt * 6);
    // 고나 (게임의 3단계 고나 그림 'dino': 0 서기 · 1~4 걷기 · 6 깜빡 · 8 깜짝)
    if (this.gMode === 'hide') {
      if (this.gona.visible) this.gona.setVisible(false);
      return;
    }
    let frame = 0;
    if (this.gMode === 'walk') frame = 1 + (Math.floor(this.t * 7) % 4);
    else if (this.gMode === 'wow') frame = 8;
    else if (this.gMode === 'stand') frame = Math.floor(this.t / 2.4) % 6 === 0 ? 6 : 0;
    if (this.gona.frame.name !== String(frame)) this.gona.setFrame(frame);
    const sy = this.gsq;
    this.gona.setScale(2 - sy, sy);
    this.gona.setPosition(Math.round(this.gx), Math.round(this.L.ground + 1 - this.galt));
  }
}
