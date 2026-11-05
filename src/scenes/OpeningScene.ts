/**
 * 오프닝 시네마틱 (약 5초): 버섯숲 둥지 위 알 → 줌인 → 흔들 → 금 → 머리카락 삐죽·까딱 → 팍! →
 * 둥지 속 갓난아기 고나가 눈 깜빡이고 두리번 → 반짝이·꽃잎 → 카메라가 물러나며 대표 타이틀로.
 *
 * Phaser 의 스프라이트 프레임(알 금 3단계, 아기 고나 프레임), 카메라 트윈(줌·이동·흔들림), 파티클로 연출.
 * 배경은 게임과 같은 버섯숲(game-bg-loop), 둥지·알·아기는 기존 도트(1도트 = 3배)로 배치.
 * 끝나면 EV.openingDone → 대표 타이틀(ui/cover.ts)이 카메라가 물러나는 흐름으로 이어서 나타남.
 */
import Phaser from 'phaser';
import { addCanvas, TEX } from '../art/textures';
import { buildEgg, buildShellPieces, cropHairTuft, EGG_H, NEST_H, NEST_SINK } from '../art/nest';
import { PixelCanvas } from '../art/PixelCanvas';
import { bus, EV } from '../events';
import { sound } from '../audio';
import type { StageVisual } from './BootScene';

/** 배경(버섯숲) 크기와 둥지 위치 (배경 그림 좌표) */
const BG_W = 772;
const BG_H = 460;
const NEST_X = 292;
const NEST_Y = 402;
/** 도트 1칸 = 배경 3px (배경 그림의 도트 크기와 비슷하게) */
const K = 3;

export class OpeningScene extends Phaser.Scene {
  private view = { v: 300, cx: NEST_X, cy: 300 };
  private v0 = 300;
  private egg!: Phaser.GameObjects.Image;
  private hair!: Phaser.GameObjects.Image;
  private baby!: Phaser.GameObjects.Sprite;
  private nb!: StageVisual;
  private blinkFrame = -1;
  private done = false;
  private skipping = false;

  constructor() {
    super('Opening');
  }

  create(): void {
    this.done = false;
    this.skipping = false;
    this.nb = (this.registry.get('stageVisuals') as Record<string, StageVisual>).newborn;
    this.blinkFrame = this.nb.source === 'asset' ? 2 : this.nb.source === 'sheet' ? 11 : -1;
    this.makeTextures();

    // 배경
    const cam = this.cameras.main;
    cam.setBackgroundColor('#cfe3c6');
    if (this.textures.exists(TEX.bgImage)) {
      this.add.image(0, 0, TEX.bgImage).setOrigin(0, 0);
    } else {
      // 배경 그림이 없을 때: 하늘·풀밭만
      const g = this.add.graphics();
      g.fillStyle(0xbfe3ee, 1).fillRect(0, 0, BG_W, NEST_Y);
      g.fillStyle(0x9fd06a, 1).fillRect(0, NEST_Y - 4, BG_W, BG_H - NEST_Y + 4);
    }

    // 둥지 · 알 · 머리카락 · 아기
    const nestTop = NEST_Y - NEST_H * K;
    this.add.image(NEST_X, NEST_Y, TEX.nestBack).setOrigin(0.5, 1).setScale(K).setDepth(1);
    const eggBottom = nestTop + (NEST_SINK + 1) * K;
    const eggTop = eggBottom - EGG_H * K;
    this.hair = this.add.image(NEST_X, eggTop + 2 * K, 'op-hair').setOrigin(0.5, 1).setScale(K).setDepth(2);
    this.hair.setData('upY', eggTop + 2 * K);
    this.hair.y = eggTop + 2 * K + this.hair.displayHeight; // 처음엔 알 속에 숨어 있음
    this.egg = this.add.image(NEST_X, eggBottom, 'op-egg-0').setOrigin(0.5, 1).setScale(K).setDepth(3);
    this.baby = this.add
      .sprite(NEST_X, eggBottom, this.nb.texture, this.nb.idleFrame)
      .setOrigin(0.5, 1)
      .setScale(K)
      .setDepth(3)
      .setVisible(false);
    this.add.image(NEST_X, NEST_Y, TEX.nestFront).setOrigin(0.5, 1).setScale(K).setDepth(4);

    this.layoutCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layoutCamera, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, this.layoutCamera, this));
    const onSkip = (): void => this.skip();
    bus.on(EV.skipOpening, onSkip);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => bus.off(EV.skipOpening, onSkip));

    cam.fadeIn(500, 255, 248, 230);
    bus.emit(EV.openingStart);
    this.runTimeline();
  }

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

  // ───────────────────────── 카메라 ─────────────────────────

  /** 보이는 폭(배경 px) → 줌. 화면이 배경 그림 밖으로 나가지 않게 */
  private applyView(): void {
    const cam = this.cameras.main;
    const W = this.scale.width;
    const H = this.scale.height;
    const maxV = Math.min(BG_W, (BG_H * W) / H);
    const v = Math.min(this.view.v, maxV);
    const vh = (v * H) / W;
    cam.setZoom(W / v);
    const cx = Phaser.Math.Clamp(this.view.cx, v / 2, BG_W - v / 2);
    const cy = Phaser.Math.Clamp(this.view.cy, vh / 2, BG_H - vh / 2);
    cam.centerOn(cx, cy);
  }

  private layoutCamera(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    this.v0 = Math.min(BG_W, (BG_H * W) / H) * 0.99;
    this.applyView();
  }

  /** 카메라를 (보이는 폭 v, 중심 cx, cy)로 부드럽게 */
  private moveCam(v: number, cx: number, cy: number, ms: number, ease = 'Sine.InOut'): void {
    this.tweens.add({ targets: this.view, v, cx, cy, duration: ms, ease, onUpdate: () => this.applyView() });
  }

  // ───────────────────────── 시간표 ─────────────────────────

  private runTimeline(): void {
    const v1 = Phaser.Math.Clamp(this.v0 * 0.42, 140, 300);
    const eggCy = NEST_Y - 30;
    // 시작: 숲 전체 → 천천히 알로 줌인
    Object.assign(this.view, { v: this.v0, cx: NEST_X, cy: BG_H });
    this.applyView();
    this.moveCam(v1, NEST_X, eggCy, 2200);

    const at = (ms: number, fn: () => void): void => {
      this.time.delayedCall(ms, () => {
        if (!this.skipping) fn();
      });
    };
    const wobble = (deg: number, times: number, ms: number): void => {
      this.tweens.add({ targets: this.egg, angle: { from: -deg, to: deg }, duration: ms, yoyo: true, repeat: times, ease: 'Sine.InOut', onComplete: () => this.egg.setAngle(0) });
    };
    // 흔들흔들
    at(700, () => {
      wobble(6, 2, 160);
      sound.eggWobble();
    });
    at(1500, () => {
      wobble(9, 3, 110);
      sound.eggWobble();
    });
    // 금
    at(1700, () => {
      this.egg.setTexture('op-egg-1');
      sound.crack();
      this.cameras.main.shake(120, 0.004);
    });
    at(2250, () => {
      this.egg.setTexture('op-egg-2');
      sound.crack();
      wobble(5, 1, 90);
    });
    // 머리카락이 먼저 삐죽 → 두 번 까딱
    at(2500, () => {
      this.tweens.add({ targets: this.hair, y: this.hair.getData('upY'), duration: 380, ease: 'Back.Out' });
      sound.boing();
    });
    at(2950, () => this.tweens.add({ targets: this.hair, angle: { from: 0, to: -18 }, duration: 140, yoyo: true, repeat: 1, ease: 'Sine.InOut' }));
    // 팍! 껍데기가 흩어지며 탄생
    at(3500, () => this.hatch());
    // 눈 깜빡 · 두리번
    at(4150, () => this.blink());
    at(4500, () => this.lookAround());
    at(5400, () => this.blink());
    // 카메라가 물러나며 숲 전체 → 대표 타이틀로
    at(5700, () => this.toTitle());
  }

  private hatch(): void {
    sound.hatch();
    this.egg.setVisible(false);
    this.hair.setVisible(false);
    const cam = this.cameras.main;
    cam.flash(220, 255, 250, 225);
    cam.shake(200, 0.008);
    // 큰 조각 3개
    const top = this.egg.y - this.egg.displayHeight;
    const pieces: [number, number, number, number][] = [
      [0, -70, -140, 0],
      [-1, -40, -260, -30],
      [1, -40, 260, -30],
    ];
    pieces.forEach(([side, dy, rot], i) => {
      const p = this.add.image(this.egg.x + side * 12, top + 20 + (i ? 30 : 0), `op-shell-${i}`).setScale(K).setDepth(5);
      this.tweens.add({ targets: p, x: p.x + side * 70 + (i === 0 ? 8 : 0), duration: 700, ease: 'Quad.Out' });
      this.tweens.add({ targets: p, y: p.y + dy, duration: 320, ease: 'Quad.Out', yoyo: false, onComplete: () => this.tweens.add({ targets: p, y: NEST_Y + 10, alpha: 0, duration: 520, ease: 'Quad.In' }) });
      this.tweens.add({ targets: p, angle: rot, duration: 840 });
    });
    // 작은 껍데기 부스러기 + 반짝이
    this.add
      .particles(this.egg.x, top + 30, 'op-chip', { speed: { min: 60, max: 160 }, angle: { min: 200, max: 340 }, gravityY: 400, scale: K, lifespan: 900, quantity: 14, emitting: false })
      .setDepth(6)
      .explode(14);
    this.add
      .particles(this.egg.x, top + 30, TEX.sparkle, { speed: { min: 30, max: 120 }, scale: { start: K * 0.8, end: 0 }, lifespan: 700, emitting: false })
      .setDepth(6)
      .explode(10);
    // 아기 등장 (퐁)
    this.baby.setVisible(true).setScale(K * 0.6);
    this.tweens.add({
      targets: this.baby,
      scaleX: { from: K * 0.6, to: K },
      scaleY: { from: K * 0.6, to: K },
      y: { from: this.baby.y + 10, to: this.baby.y },
      duration: 420,
      ease: 'Back.Out',
    });
    // 계속 날리는 반짝이·꽃잎
    this.add
      .particles(0, 0, 'op-petal', {
        x: { min: NEST_X - 110, max: NEST_X + 110 },
        y: { min: NEST_Y - 160, max: NEST_Y - 110 },
        speedX: { min: -20, max: 25 },
        speedY: { min: 14, max: 30 },
        rotate: { min: 0, max: 360 },
        scale: K,
        lifespan: 3000,
        frequency: 160,
        alpha: { start: 1, end: 0 },
      })
      .setDepth(7);
    this.add
      .particles(0, 0, TEX.sparkle, {
        x: { min: NEST_X - 60, max: NEST_X + 60 },
        y: { min: NEST_Y - 90, max: NEST_Y - 20 },
        scale: { start: K * 0.6, end: 0 },
        lifespan: 900,
        frequency: 140,
      })
      .setDepth(7);
  }

  private blink(): void {
    if (this.blinkFrame < 0) return;
    this.baby.setFrame(this.blinkFrame);
    this.time.delayedCall(150, () => this.baby.setFrame(this.nb.idleFrame));
  }

  /** 두리번: 왼쪽 보고(좌우 뒤집기) 고개 까딱 → 다시 오른쪽 */
  private lookAround(): void {
    const b = this.baby;
    const nod = (): void => {
      this.tweens.add({ targets: b, angle: { from: 0, to: -6 }, duration: 120, yoyo: true });
    };
    b.setFlipX(true);
    nod();
    this.time.delayedCall(420, () => {
      b.setFlipX(false);
      nod();
    });
    this.time.delayedCall(780, () => {
      b.setFrame(this.nb.runFrames[1] ?? this.nb.idleFrame); // 꿈틀
      this.time.delayedCall(220, () => b.setFrame(this.nb.idleFrame));
    });
  }

  /** 카메라가 천천히 물러나고, 대표 타이틀이 같은 움직임으로 이어서 나타남 */
  private toTitle(): void {
    if (this.done) return;
    this.done = true;
    this.moveCam(this.v0, NEST_X, BG_H - 40, 1800, 'Sine.InOut');
    // 숲이 펼쳐지기 시작한 뒤, 같은 '물러나는' 움직임으로 대표 타이틀이 겹쳐 나타남
    this.time.delayedCall(900, () => bus.emit(EV.openingDone, { instant: false }));
    this.time.delayedCall(2000, () => this.scene.stop());
  }

  /** 건너뛰기: 바로 대표 타이틀 */
  skip(): void {
    if (this.done) return;
    this.skipping = true;
    this.done = true;
    bus.emit(EV.openingDone, { instant: true });
    this.scene.stop();
  }
}

