/**
 * 스토리 프롤로그 (동화책 연출, 10문장) — 알 부화를 포함.
 *
 *  0 날짜 · 하늘에서 벚꽃 숲을 가로지르는 팬
 *  1 벚꽃 숲 → 둥지 쪽으로 내려오는 카메라
 *  2 알 줌인 → 흔들 → 금 → 갈색 물방울 머리카락이 먼저 삐죽 → 팍! 탄생
 *  3 눈 깜빡 · 두리번
 *  4 '!' 호기심 · 깡충
 *  5 딸기가 보이고 둥지째 출발 (카메라가 따라감)
 *  6 "그런데 말이죠…" 숲이 어두워짐
 *  7 뽀뽀괴물 · 킁카괴물 실루엣이 솟아오름 (빛나는 눈)
 *  8 괴물이 사라지고 빛이 돌아옴 · 다짐의 깡충
 *  9 카메라가 물러나며 → 대표 타이틀
 *
 * 첫 화면은 '이야기 시작' 대기(소리는 사용자가 터치해야 켤 수 있음) → EV.prologueBegin 으로 시작.
 * 문장마다 EV.prologueLine 으로 자막(ui/subtitles.ts, 한 글자씩 타이핑) 표시. 음성 내레이션은 없음(배경음악·효과음만).
 * 화면 터치 = 다음 문장(EV.prologueNext), 건너뛰기 = 바로 타이틀(EV.skipOpening).
 */
import Phaser from 'phaser';
import { addCanvas, TEX } from '../art/textures';
import { buildEgg, buildShellPieces, cropHairTuft, EGG_H, NEST_H, NEST_SINK } from '../art/nest';
import { PixelCanvas } from '../art/PixelCanvas';
import { cherryTree, exclaim, kissMonster, monsterEyes, sniffMonster } from '../art/prologueArt';
import { bus, EV } from '../events';
import { sound } from '../audio';
import { perf } from '../perf';
import { LINE_GAP, PROLOGUE } from '../game/prologue';
import type { StageVisual } from './BootScene';

/** 배경(버섯숲) 크기와 둥지 위치 (배경 그림 좌표) */
const BG_W = 772;
const BG_H = 460;
const NEST_X = 292;
/** 둥지가 놓인 땅 높이 — 아래 자막 상자에 가리지 않게 풀밭 위쪽에 */
const NEST_Y = 380;
/** 둥지가 간식을 향해 도착하는 곳 */
const NEST_END_X = 548;
/** 도트 1칸 = 배경 3px */
const K = 3;

interface Shot {
  /** d = 이 문장 길이(초) */
  play(d: number): void;
  /** 다음 문장으로 넘어갈 때: 이 장면의 마지막 상태로 맞춤 */
  end(): void;
}

type Tracked = Phaser.Time.TimerEvent | Phaser.Tweens.Tween;

export class OpeningScene extends Phaser.Scene {
  private view = { v: 300, cx: NEST_X, cy: 300 };
  private v0 = 300;
  private nb!: StageVisual;
  private blinkFrame = -1;

  private nest!: Phaser.GameObjects.Container;
  private nestBack!: Phaser.GameObjects.Image;
  private nestFront!: Phaser.GameObjects.Image;
  private egg!: Phaser.GameObjects.Image;
  private hair!: Phaser.GameObjects.Image;
  private baby!: Phaser.GameObjects.Sprite;
  private bang!: Phaser.GameObjects.Image;
  private berry!: Phaser.GameObjects.Image;
  private dark!: Phaser.GameObjects.Rectangle;
  private kiss!: Phaser.GameObjects.Container;
  private sniff!: Phaser.GameObjects.Container;
  private babyY = 0;
  private hairUpY = 0;
  private hairDownY = 0;
  private hatched = false;
  private darkness = { a: 0 };

  private shots: Shot[] = [];
  private tracked: Tracked[] = [];
  private line = -1;
  /** 다음 문장 타이머 — 실제 시간(setTimeout)으로: 화면이 느려져도 자막과 맞게 */
  private nextTimer = 0;
  private begun = false;
  private done = false;

  constructor() {
    super('Opening');
  }

  create(): void {
    const tCreate = performance.now();
    perf.section('오프닝 대기 (이야기 시작 전)');
    this.done = false;
    this.begun = false;
    this.line = -1;
    this.hatched = false;
    this.tracked = [];
    this.nextTimer = 0;
    this.darkness = { a: 0 };
    this.nb = (this.registry.get('stageVisuals') as Record<string, StageVisual>).newborn;
    this.blinkFrame = this.nb.source === 'asset' ? 2 : this.nb.source === 'sheet' ? 11 : -1;
    this.makeTextures();
    this.buildWorld();
    this.shots = this.buildShots();

    this.layoutCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layoutCamera, this);
    const onSkip = (): void => this.skip();
    const onBegin = (): void => this.begin();
    const onNext = (): void => this.next();
    bus.on(EV.skipOpening, onSkip);
    bus.on(EV.prologueBegin, onBegin);
    bus.on(EV.prologueNext, onNext);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layoutCamera, this);
      bus.off(EV.skipOpening, onSkip);
      bus.off(EV.prologueBegin, onBegin);
      bus.off(EV.prologueNext, onNext);
      clearTimeout(this.nextTimer);
    });

    // 대기 화면: 하늘 쪽 벚꽃 숲이 천천히 흘러감
    Object.assign(this.view, { v: this.v0 * 0.6, cx: 150, cy: BG_H * 0.36 });
    this.applyView();
    this.track(this.tweens.add({ targets: this.view, cx: 210, duration: 6000, yoyo: true, repeat: -1, ease: 'Sine.InOut', onUpdate: () => this.applyView() }));
    this.cameras.main.fadeIn(600, 255, 248, 230);
    perf.mark('opening:create', performance.now() - tCreate);
    bus.emit(EV.openingStart);
  }

  // ───────────────────────── 그림 준비 ─────────────────────────

  private makeTextures(): void {
    if (!this.textures.exists('op-egg-0')) {
      ([0, 1, 2] as const).forEach((k) => addCanvas(this, `op-egg-${k}`, buildEgg(k)));
      buildShellPieces().forEach((c, i) => addCanvas(this, `op-shell-${i}`, c));
      const chip = new PixelCanvas(2, 2);
      chip.rect(0, 0, 2, 2, '#f7efdc');
      chip.px(1, 1, '#d9cba8');
      addCanvas(this, 'op-chip', chip.canvas);
      const petal = new PixelCanvas(3, 2);
      petal.rect(0, 0, 3, 2, '#ffc8d8');
      petal.px(0, 1, '#f39ab4');
      addCanvas(this, 'op-petal', petal.canvas);
      const petal2 = new PixelCanvas(2, 2);
      petal2.rect(0, 0, 2, 2, '#ffe3ec');
      petal2.px(1, 0, '#f6b3c7');
      addCanvas(this, 'op-petal2', petal2.canvas);
      addCanvas(this, 'op-tree-0', cherryTree(7));
      addCanvas(this, 'op-tree-1', cherryTree(19));
      addCanvas(this, 'op-kiss', kissMonster());
      addCanvas(this, 'op-sniff', sniffMonster());
      addCanvas(this, 'op-kiss-eyes', monsterEyes('#ff6fb5'));
      addCanvas(this, 'op-sniff-eyes', monsterEyes('#c8ff5a'));
      addCanvas(this, 'op-bang', exclaim());
    }
    if (this.textures.exists('op-hair')) this.textures.remove('op-hair');
    addCanvas(this, 'op-hair', cropHairTuft(this.frameCanvas(this.nb.texture, this.nb.idleFrame)));
  }

  private frameCanvas(key: string, frame: number): HTMLCanvasElement {
    const f = this.textures.getFrame(key, frame);
    const c = document.createElement('canvas');
    c.width = f.cutWidth;
    c.height = f.cutHeight;
    c.getContext('2d')?.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
    return c;
  }

  private buildWorld(): void {
    const cam = this.cameras.main;
    cam.setBackgroundColor('#cfe3c6');
    if (this.textures.exists(TEX.bgImage)) {
      // 봄빛(살짝 분홍)을 배경 그림에 한 번만 섞어 둠 — 예전엔 화면 전체 크기 반투명 사각형을 매 프레임 한 겹 더 그렸음
      if (!this.textures.exists('op-bg-spring')) {
        const src = this.textures.get(TEX.bgImage).getSourceImage() as HTMLImageElement;
        const c = document.createElement('canvas');
        c.width = src.width;
        c.height = src.height;
        const g = c.getContext('2d')!;
        g.drawImage(src, 0, 0);
        g.fillStyle = 'rgba(255, 198, 220, 0.1)';
        g.fillRect(0, 0, c.width, c.height);
        addCanvas(this, 'op-bg-spring', c);
      }
      this.add.image(0, 0, 'op-bg-spring').setOrigin(0, 0).setDisplaySize(BG_W, BG_H);
    } else {
      const g = this.add.graphics();
      g.fillStyle(0xbfe3ee, 1).fillRect(0, 0, BG_W, NEST_Y);
      g.fillStyle(0x9fd06a, 1).fillRect(0, NEST_Y - 4, BG_W, BG_H - NEST_Y + 4);
      this.add.rectangle(0, 0, BG_W, BG_H, 0xffc6dc, 0.1).setOrigin(0, 0).setDepth(0.1);
    }
    // 벚꽃나무 (선사시대의 둥글둥글한 나무)
    const trees: [number, number, number][] = [
      [70, 0, 1],
      [430, 1, 0.9],
      [712, 0, 1],
    ];
    for (const [x, t, s] of trees) {
      this.add.image(x, NEST_Y + 16, `op-tree-${t}`).setOrigin(0.5, 1).setScale(K * s).setDepth(0.5);
    }
    // 숲 전체에 흩날리는 벚꽃잎 (두 겹)
    for (const [tex, freq, sp] of [
      // 성능: 예전 90/140ms 마다 → 살아 있는 꽃잎 약 200개 → 150/230ms 약 120개 → 지금 저사양 모바일 기준 약 80개
      ['op-petal', perf.low ? 300 : 220, 1],
      ['op-petal2', perf.low ? 460 : 340, 0.7],
    ] as const) {
      this.add
        .particles(0, 0, tex, {
          x: { min: -40, max: BG_W + 40 },
          y: { min: -20, max: 0 },
          speedX: { min: 10 * sp, max: 45 * sp },
          speedY: { min: 22 * sp, max: 48 * sp },
          rotate: { min: 0, max: 360 },
          scale: K,
          lifespan: 11000,
          frequency: freq,
          alpha: { start: 1, end: 0.4 },
          advance: 9000,
        })
        .setDepth(tex === 'op-petal' ? 7 : 0.6);
    }

    // 어둠 (괴물 장면)
    this.dark = this.add.rectangle(0, 0, BG_W, BG_H, 0x140a24, 1).setOrigin(0, 0).setDepth(0.7).setAlpha(0);

    // 괴물 실루엣 (둥지 뒤에서 솟아오름)
    const monster = (tex: string, eyes: string, cx: number, eyeY: number, w: number, h: number): Phaser.GameObjects.Container => {
      const body = this.add.image(0, 0, tex).setOrigin(0.5, 1);
      const eye = this.add.image((cx - 8 - w / 2) , eyeY - h, eyes).setOrigin(0, 0);
      eye.setName('eyes');
      return this.add.container(0, 0, [body, eye]).setDepth(0.8).setVisible(false);
    };
    this.kiss = monster('op-kiss', 'op-kiss-eyes', 23, 26, 46, 54);
    this.sniff = monster('op-sniff', 'op-sniff-eyes', 25, 27, 50, 54);

    // 둥지 (컨테이너: 둥지째 이동)
    const nestTop = -NEST_H * K;
    const eggBottom = nestTop + (NEST_SINK + 1) * K;
    const eggTop = eggBottom - EGG_H * K;
    this.babyY = eggBottom;
    this.nestBack = this.add.image(0, 0, TEX.nestBack).setOrigin(0.5, 1).setScale(K);
    this.hair = this.add.image(0, 0, 'op-hair').setOrigin(0.5, 1).setScale(K);
    this.hairUpY = eggTop + 2 * K;
    this.hairDownY = this.hairUpY + this.hair.displayHeight;
    this.hair.y = this.hairDownY; // 처음엔 알 속
    this.egg = this.add.image(0, eggBottom, 'op-egg-0').setOrigin(0.5, 1).setScale(K);
    this.baby = this.add.sprite(0, eggBottom, this.nb.texture, this.nb.idleFrame).setOrigin(0.5, 1).setScale(K).setVisible(false);
    this.nestFront = this.add.image(0, 0, TEX.nestFront).setOrigin(0.5, 1).setScale(K);
    this.bang = this.add
      .image(K * 9, eggBottom - this.baby.displayHeight - 4, 'op-bang')
      .setOrigin(0.5, 1)
      .setScale(K)
      .setVisible(false);
    this.nest = this.add.container(NEST_X, NEST_Y, [this.nestBack, this.hair, this.egg, this.baby, this.nestFront, this.bang]).setDepth(1);

    // 간식 (딸기)
    this.berry = this.add
      .image(NEST_END_X + 96, NEST_Y - 34, TEX.strawberry)
      .setScale(K)
      .setDepth(1.1)
      .setVisible(false);
  }

  // ───────────────────────── 카메라 ─────────────────────────

  /** 실제로 보이는 영역 (배경 밖으로 나가지 않게 맞춘 값) */
  private viewRect(): { x: number; y: number; w: number; h: number } {
    const W = this.scale.width;
    const H = this.scale.height;
    const maxV = Math.min(BG_W, (BG_H * W) / H);
    const w = Math.min(this.view.v, maxV);
    const h = (w * H) / W;
    const cx = Phaser.Math.Clamp(this.view.cx, w / 2, BG_W - w / 2);
    const cy = Phaser.Math.Clamp(this.view.cy, h / 2, BG_H - h / 2);
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }

  private applyView(): void {
    const r = this.viewRect();
    const cam = this.cameras.main;
    cam.setZoom(this.scale.width / r.w);
    cam.centerOn(r.x + r.w / 2, r.y + r.h / 2);
  }

  private layoutCamera(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    this.v0 = Math.min(BG_W, (BG_H * W) / H) * 0.99;
    this.applyView();
  }

  /** 카메라를 (보이는 폭 v, 중심 cx, cy)로 부드럽게 */
  private moveCam(v: number, cx: number, cy: number, ms: number, ease = 'Sine.InOut'): void {
    this.track(this.tweens.add({ targets: this.view, v, cx, cy, duration: ms, ease, onUpdate: () => this.applyView() }));
  }

  private setCam(v: number, cx: number, cy: number): void {
    Object.assign(this.view, { v, cx, cy });
    this.applyView();
  }

  /** 괴물 장면처럼 넓게 보는 폭 (가로 화면은 덜 넓게: 둥지가 자막에 가리지 않게) */
  private get vWide(): number {
    return this.scale.width > this.scale.height ? this.v0 * 0.6 : this.v0 * 0.9;
  }

  /** 클로즈업 폭 */
  private get v1(): number {
    return Phaser.Math.Clamp(this.v0 * 0.42, 140, 340);
  }

  // ───────────────────────── 진행 ─────────────────────────

  private track<T extends Tracked>(t: T): T {
    this.tracked.push(t);
    return t;
  }

  private at(ms: number, fn: () => void): void {
    this.track(this.time.delayedCall(ms, fn));
  }

  private tw(cfg: Phaser.Types.Tweens.TweenBuilderConfig): Phaser.Tweens.Tween {
    return this.track(this.tweens.add(cfg));
  }

  private clearTracked(): void {
    for (const t of this.tracked) {
      if (t instanceof Phaser.Time.TimerEvent) t.remove(false);
      else t.stop();
    }
    this.tracked = [];
  }

  /** 첫 터치 → 이야기 시작 */
  begin(): void {
    if (this.begun || this.done) return;
    this.begun = true;
    this.clearTracked();
    this.playLine(0);
  }

  /** 터치 → 다음 문장 */
  next(): void {
    if (!this.begun) {
      this.begin();
      return;
    }
    if (this.done) return;
    this.finishLine();
    if (this.line + 1 >= PROLOGUE.length) this.toTitle();
    else this.playLine(this.line + 1);
  }

  private finishLine(): void {
    this.clearTracked();
    clearTimeout(this.nextTimer);
    this.nextTimer = 0;
    if (this.line >= 0) this.shots[this.line].end();
  }

  private playLine(i: number): void {
    this.line = i;
    perf.section(`오프닝 ${i + 1}/${PROLOGUE.length}`);
    const l = PROLOGUE[i];
    // 내레이션(음성) 없음: 문장 길이로 시간 계산 (자막 타이핑 그대로)
    const sec = Math.max(l.minSec, 0.8 + l.text.length * 0.12 + LINE_GAP);
    bus.emit(EV.prologueLine, { index: i, total: PROLOGUE.length, text: l.text, seconds: sec });
    this.shots[i].play(sec);
    // 자동으로 다음 문장
    const tick = (): void => {
      if (this.done || this.line !== i || !this.scene.isActive()) return;
      this.next();
    };
    this.nextTimer = window.setTimeout(tick, sec * 1000);
  }

  /** 대표 타이틀로 (카메라가 물러나는 움직임이 이어짐) */
  private toTitle(): void {
    if (this.done) return;
    this.done = true;
    this.finishLine();
    bus.emit(EV.prologueEnd);
    bus.emit(EV.openingDone, { instant: false });
    this.time.delayedCall(1100, () => this.scene.stop());
  }

  /** 건너뛰기: 바로 대표 타이틀 */
  skip(): void {
    if (this.done) return;
    this.done = true;
    this.clearTracked();
    clearTimeout(this.nextTimer);
    bus.emit(EV.prologueEnd);
    bus.emit(EV.openingDone, { instant: true });
    this.scene.stop();
  }

  // ───────────────────────── 장면들 ─────────────────────────

  private buildShots(): Shot[] {
    const v1 = (): number => this.v1;
    const nestCy = NEST_Y - 30;
    return [
      // 0 · 2026년 4월 10일 — 하늘의 벚꽃 숲을 가로지름
      {
        play: (d) => {
          this.setCam(this.v0 * 0.6, 150, BG_H * 0.36);
          this.moveCam(this.v0 * 0.62, 470, BG_H * 0.4, d * 1000, 'Sine.InOut');
        },
        end: () => this.setCam(this.v0 * 0.62, 470, BG_H * 0.4),
      },
      // 1 · 벚꽃이 흐드러지게 — 꽃바람과 함께 둥지 쪽으로 내려옴
      {
        play: (d) => {
          this.moveCam(this.v0 * 0.7, NEST_X, NEST_Y - 90, d * 950);
          this.at(400, () => this.petalGust(NEST_X + 60, NEST_Y - 200));
        },
        end: () => this.setCam(this.v0 * 0.7, NEST_X, NEST_Y - 90),
      },
      // 2 · 알을 깨고 세상에 나왔어요
      {
        play: (d) => {
          const hatchAt = Phaser.Math.Clamp(d * 1000 * 0.6, 2950, 4300);
          const f = hatchAt / 2950;
          this.moveCam(v1(), NEST_X, nestCy, 1300 * f);
          const wobble = (deg: number, times: number, ms: number): void => {
            this.tw({ targets: this.egg, angle: { from: -deg, to: deg }, duration: ms, yoyo: true, repeat: times, ease: 'Sine.InOut', onComplete: () => this.egg.setAngle(0) });
          };
          this.at(300 * f, () => {
            wobble(6, 2, 160);
            sound.eggWobble();
          });
          this.at(1000 * f, () => {
            wobble(9, 3, 110);
            sound.eggWobble();
          });
          this.at(1200 * f, () => {
            this.egg.setTexture('op-egg-1');
            sound.crack();
            this.cameras.main.shake(120, 0.004);
          });
          this.at(1700 * f, () => {
            this.egg.setTexture('op-egg-2');
            sound.crack();
            wobble(5, 1, 90);
          });
          // 갈색 물방울 머리카락이 먼저 삐죽 → 까딱까딱
          this.at(2000 * f, () => {
            this.tw({ targets: this.hair, y: this.hairUpY, duration: 380, ease: 'Back.Out' });
            sound.boing();
          });
          this.at(2000 * f + 450, () => this.tw({ targets: this.hair, angle: { from: 0, to: -18 }, duration: 140, yoyo: true, repeat: 1, ease: 'Sine.InOut' }));
          this.at(hatchAt, () => this.hatch());
          this.at(hatchAt + 700, () => this.blink());
        },
        end: () => {
          if (!this.hatched) this.hatch(true);
          this.egg.setAngle(0);
          this.baby.setScale(K).setY(this.babyY);
          this.setCam(v1(), NEST_X, nestCy);
        },
      },
      // 3 · 아무것도 모르는 고나 — 깜빡깜빡 두리번
      {
        play: (d) => {
          // 클로즈업에서 고나가 가만히 있을 때는 카메라도 고정 (느린 줌 = 매 프레임 다시 샘플링 → 픽셀이 꿈틀거림)
          this.setCam(v1(), NEST_X, nestCy);
          this.at(250, () => this.blink());
          this.at(650, () => this.look(true));
          this.at(1250, () => this.look(false));
          this.at(Math.min(d * 1000 - 700, 2300), () => this.blink());
          this.at(Math.min(d * 1000 - 400, 2700), () => this.wiggle());
        },
        end: () => {
          this.baby.setFlipX(false).setAngle(0).setFrame(this.nb.idleFrame);
          this.setCam(v1(), NEST_X, nestCy);
        },
      },
      // 4 · 호기심만큼은 — '!' 와 깡충깡충
      {
        play: () => {
          this.at(150, () => {
            this.bang.setVisible(true).setScale(0);
            this.tw({ targets: this.bang, scale: K, duration: 260, ease: 'Back.Out' });
            sound.boing();
          });
          this.moveCam(v1() * 0.95, NEST_X + 6, nestCy - 14, 420, 'Back.Out');
          for (const [ms, h] of [
            [700, 12],
            [1250, 16],
          ] as const) {
            this.at(ms, () => {
              sound.jump();
              this.baby.setFrame(this.nb.jumpFrame);
              this.tw({ targets: this.baby, y: this.babyY - h, duration: 200, yoyo: true, ease: 'Quad.Out', onComplete: () => this.baby.setFrame(this.nb.idleFrame) });
              this.sparkles(this.nest.x, NEST_Y - 50, 6);
            });
          }
          this.at(2300, () => this.tw({ targets: this.bang, alpha: 0, duration: 300 }));
        },
        end: () => {
          this.bang.setVisible(false).setAlpha(1);
          this.baby.setY(this.babyY).setFrame(this.nb.idleFrame);
          this.setCam(v1() * 0.95, NEST_X + 6, nestCy - 14);
        },
      },
      // 5 · 간식을 찾아 모험을 떠났어요 — 딸기 발견, 둥지째 출발
      {
        play: (d) => {
          const ms = d * 1000;
          this.moveCam(v1() * 1.25, NEST_X + 40, nestCy - 10, 700);
          this.at(200, () => {
            this.berry.setVisible(true).setAlpha(1).setScale(0);
            this.tw({ targets: this.berry, scale: K, duration: 320, ease: 'Back.Out' });
            this.sparkles(this.berry.x, this.berry.y, 8);
            sound.pickup(30);
          });
          const go = 900;
          const travel = Math.max(1600, ms - go - 500);
          this.at(go, () => {
            sound.nestJump();
            if (this.anims.exists(this.nb.runAnim)) this.baby.play(this.nb.runAnim);
            // 카메라는 둥지를 따라감 (둥지가 화면 가운데보다 살짝 왼쪽)
            this.tw({ targets: this.nest, x: NEST_END_X, duration: travel, ease: 'Sine.InOut', onUpdate: () => {
              this.view.cx = this.nest.x + 40;
              this.applyView();
            } });
            this.tw({ targets: this.nest, y: NEST_Y - 9, duration: 190, yoyo: true, repeat: Math.floor(travel / 380) - 1, ease: 'Quad.Out' });
          });
          this.at(go + travel, () => this.settleNest());
        },
        end: () => {
          this.settleNest();
          this.berry.setVisible(true).setScale(K);
          this.setCam(v1() * 1.25, NEST_END_X + 40, nestCy - 10);
        },
      },
      // 6 · 그런데 말이죠… — 숲이 어두워지고, 딸기가 사라짐
      {
        play: (d) => {
          this.moveCam(this.vWide, NEST_END_X, NEST_Y - 70, d * 1000);
          this.fadeDark(0.38, d * 800);
          this.tw({ targets: this.berry, alpha: 0, duration: 900, delay: 300 });
          this.at(700, () => this.look(true));
        },
        end: () => {
          this.setDark(0.38);
          this.berry.setVisible(false);
          this.baby.setFlipX(false).setAngle(0);
          this.setCam(this.vWide, NEST_END_X, NEST_Y - 70);
        },
      },
      // 7 · 뽀뽀괴물과 킁카괴물 — 실루엣이 솟아오름
      {
        play: () => {
          this.fadeDark(0.55, 600);
          this.placeMonsters();
          const rise = (m: Phaser.GameObjects.Container, ms: number): void => {
            const toY = m.getData('upY') as number;
            m.setVisible(false).setY(toY + m.getData('h'));
            this.at(ms, () => {
              m.setVisible(true);
              this.tw({ targets: m, y: toY, duration: 650, ease: 'Back.Out' });
              this.at(380, () => {
                sound.hit();
                this.cameras.main.shake(260, 0.006);
              });
            });
            const eyes = m.getByName('eyes') as Phaser.GameObjects.Image;
            eyes.setAlpha(0);
            this.at(ms + 650, () => this.tw({ targets: eyes, alpha: { from: 0.35, to: 1 }, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.InOut' }));
          };
          rise(this.kiss, 250);
          rise(this.sniff, 900);
          this.at(700, () => {
            this.baby.setFrame(this.nb.surprisedFrame);
            this.tw({ targets: this.baby, y: this.babyY - 8, duration: 140, yoyo: true });
          });
        },
        end: () => {
          this.setDark(0.55);
          for (const m of [this.kiss, this.sniff]) {
            m.setVisible(true).setY(m.getData('upY'));
            (m.getByName('eyes') as Phaser.GameObjects.Image).setAlpha(1);
          }
          this.baby.setY(this.babyY);
        },
      },
      // 8 · 과연 고나는…? — 괴물이 가라앉고 빛이 돌아옴, 다짐의 깡충
      {
        play: () => {
          for (const m of [this.kiss, this.sniff]) {
            this.tw({ targets: m, y: (m.getData('upY') as number) + (m.getData('h') as number), duration: 700, ease: 'Back.In', delay: 200, onComplete: () => m.setVisible(false) });
          }
          this.at(500, () => this.fadeDark(0, 1300));
          this.at(900, () => this.baby.setFrame(this.nb.idleFrame));
          this.moveCam(v1() * 1.05, NEST_END_X + 10, nestCy - 6, 1600);
          for (const ms of [1900, 2500]) {
            this.at(ms, () => {
              sound.jump();
              this.baby.setFrame(this.nb.jumpFrame);
              this.tw({ targets: this.baby, y: this.babyY - 14, duration: 200, yoyo: true, ease: 'Quad.Out', onComplete: () => this.baby.setFrame(this.nb.happyFrame) });
              this.sparkles(this.nest.x, NEST_Y - 50, 8);
            });
          }
        },
        end: () => {
          this.kiss.setVisible(false);
          this.sniff.setVisible(false);
          this.setDark(0);
          this.baby.setY(this.babyY).setFrame(this.nb.idleFrame);
          this.setCam(v1() * 1.05, NEST_END_X + 10, nestCy - 6);
        },
      },
      // 9 · 이야기가 시작됩니다 — 카메라가 물러나며 타이틀로
      {
        play: (d) => {
          this.moveCam(this.v0, NEST_END_X, BG_H - 40, d * 1000 * 0.95);
          this.at(300, () => this.blink());
        },
        end: () => this.setCam(this.v0, NEST_END_X, BG_H - 40),
      },
    ];
  }

  // ───────────────────────── 연출 조각 ─────────────────────────

  private hatch(instant = false): void {
    this.hatched = true;
    this.egg.setVisible(false);
    this.hair.setVisible(false);
    this.baby.setVisible(true);
    this.addHatchSparkle();
    if (instant) return;
    sound.hatch();
    const cam = this.cameras.main;
    cam.flash(220, 255, 250, 225);
    cam.shake(200, 0.008);
    const ex = this.nest.x;
    const top = NEST_Y + this.babyY - EGG_H * K;
    const pieces: [number, number, number][] = [
      [0, -70, -140],
      [-1, -40, -260],
      [1, -40, 260],
    ];
    pieces.forEach(([side, dy, rot], i) => {
      const p = this.add.image(ex + side * 12, top + 20 + (i ? 30 : 0), `op-shell-${i}`).setScale(K).setDepth(5);
      this.tweens.add({ targets: p, x: p.x + side * 70 + (i === 0 ? 8 : 0), duration: 700, ease: 'Quad.Out' });
      this.tweens.add({ targets: p, y: p.y + dy, duration: 320, ease: 'Quad.Out', onComplete: () => this.tweens.add({ targets: p, y: NEST_Y + 10, alpha: 0, duration: 520, ease: 'Quad.In', onComplete: () => p.destroy() }) });
      this.tweens.add({ targets: p, angle: rot, duration: 840 });
    });
    this.add
      .particles(ex, top + 30, 'op-chip', { speed: { min: 60, max: 160 }, angle: { min: 200, max: 340 }, gravityY: 400, scale: K, lifespan: 900, quantity: 14, emitting: false })
      .setDepth(6)
      .explode(14);
    this.sparkles(ex, top + 30, 10);
    // 아기 등장 (퐁)
    this.baby.setScale(K * 0.6);
    this.tw({ targets: this.baby, scaleX: K, scaleY: K, y: { from: this.babyY + 10, to: this.babyY }, duration: 420, ease: 'Back.Out' });
  }

  /** 부화 뒤 아기 주변에 계속 반짝이 (둥지를 따라다님) */
  private addHatchSparkle(): void {
    const p = this.add
      .particles(0, 0, TEX.sparkle, {
        x: { min: -55, max: 55 },
        y: { min: -90, max: -20 },
        scale: { start: K * 0.55, end: 0 },
        lifespan: 900,
        frequency: 220,
      })
      .setDepth(7);
    p.startFollow(this.nest);
  }

  private sparkles(x: number, y: number, n: number): void {
    this.add
      .particles(x, y, TEX.sparkle, { speed: { min: 30, max: 120 }, scale: { start: K * 0.8, end: 0 }, lifespan: 700, emitting: false })
      .setDepth(6)
      .explode(n);
  }

  /** 꽃바람: 꽃잎이 한꺼번에 흩날림 */
  private petalGust(x: number, y: number): void {
    this.add
      .particles(x, y, 'op-petal', {
        speedX: { min: -60, max: 140 },
        speedY: { min: 20, max: 110 },
        rotate: { min: 0, max: 360 },
        scale: K,
        lifespan: 2600,
        alpha: { start: 1, end: 0 },
        emitting: false,
      })
      .setDepth(7)
      .explode(40);
  }

  private blink(): void {
    if (this.blinkFrame < 0 || !this.baby.visible) return;
    this.baby.setFrame(this.blinkFrame);
    this.at(150, () => this.baby.setFrame(this.nb.idleFrame));
  }

  /** 고개 돌리기 (좌우 뒤집기만 — 도트 그림을 회전시키면 픽셀이 일그러져 떨려 보임) */
  private look(left: boolean): void {
    this.baby.setFlipX(left);
  }

  private wiggle(): void {
    this.baby.setFrame(this.nb.runFrames[1] ?? this.nb.idleFrame);
    this.at(220, () => this.baby.setFrame(this.nb.idleFrame));
  }

  private settleNest(): void {
    this.baby.anims.stop();
    this.baby.setFrame(this.nb.idleFrame);
    this.nest.setPosition(NEST_END_X, NEST_Y);
  }

  private setDark(a: number): void {
    this.darkness.a = a;
    this.dark.setAlpha(a);
    // 둥지·고나도 같이 어둡게 (괴물 눈은 밝게 남음)
    const k = Phaser.Math.Clamp(a / 0.6, 0, 1);
    const ch = (to: number): number => Math.round(255 + (to - 255) * k);
    const tint = (ch(0x6a) << 16) | (ch(0x5c) << 8) | ch(0x8c);
    for (const o of [this.nestBack, this.nestFront, this.egg, this.baby, this.berry]) o.setTint(tint);
  }

  private fadeDark(a: number, ms: number): void {
    this.tw({ targets: this.darkness, a, duration: ms, ease: 'Sine.InOut', onUpdate: () => this.setDark(this.darkness.a) });
  }

  /** 괴물 두 마리를 지금 화면의 양옆, 둥지 뒤에 배치 */
  private placeMonsters(): void {
    const r = this.viewRect();
    const s = Phaser.Math.Clamp(Math.round(Math.min(Math.max((r.w * 0.5) / 48, (r.h * 0.55) / 54), (r.h * 0.75) / 56)), 2, 6);
    const groundY = Math.min(r.y + r.h, NEST_Y + 12);
    const place = (m: Phaser.GameObjects.Container, fx: number): void => {
      m.setScale(s);
      m.setX(r.x + r.w * fx);
      m.setData('upY', groundY);
      m.setData('h', 56 * s);
    };
    place(this.kiss, 0.22);
    place(this.sniff, 0.78);
  }
}
