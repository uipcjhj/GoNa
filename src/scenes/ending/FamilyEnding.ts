/**
 * 가족 엔딩 (약 45초 → THE END · 타이핑 자막 + 엔딩 음악, 음성 없음) — 끊기지 않는 한 편의 애니메이션처럼
 *   SCENE 1 숲이 황금빛으로 밝아짐 · 고나가 숨을 고르며 두리번 · 멀리 반짝임 → 천천히 그쪽으로 걸어감(성장 회상)
 *   SCENE 2 숲길 끝에서 가족 6명이 각자 움직이며 기다림 → 고나가 발견! 눈이 커지고 활짝 웃으며 통통
 *   SCENE 3 고나가 신나게 달려감 (땅이 흘러가며 카메라가 따라가는 느낌 · 발밑 먼지·꽃잎) · 가족이 손 흔들고 두 팔 벌림
 *   SCENE 4 품에 폭 안김 — 엄마·아빠는 한 걸음 다가와 안아 주고, 이모·할머니는 뒤로 돌아 반대편에서 감싸 안음 (팔이 실제로 고나에 닿음)
 *   SCENE 5 볼 뽀뽀(쪽!) · 킁카(킁킁) · 쓰다듬기 — 보스의 무서운 뽀뽀·킁카가 가족의 사랑으로 바뀜
 *   SCENE 6 황금빛 속에서 아기 고나로 돌아와 엄마 품에 · 노을 · 고나가 눈을 깜빡이며 인사 → THE END (버튼: ui/endingUi.ts)
 * 게임 화면(GameScene)의 배경·땅·고나 스프라이트를 그대로 쓰고, 이 클래스는 연출만 맡음.
 * 그림은 모두 미리 만든 텍스처(가족 시트 14프레임 · 고나 웃는/놀란 얼굴 시트) + 가벼운 트윈. destroy() 가 만든 것을 모두 지움.
 */
import Phaser from 'phaser';
import { bus, EV } from '../../events';
import { perf } from '../../perf';
import { sound } from '../../audio';
import { FAMILY_SHEET } from '../../config';
import { FAMILY_NAME, type FamilyId } from '../../art/familyArt';
import type { StageVisual } from '../BootScene';
import type { GrowthStageId } from '../../game/growth';

export interface EndingHost {
  readonly scene: Phaser.Scene;
  readonly W: number;
  readonly H: number;
  readonly groundY: number;
  readonly player: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Ellipse;
  readonly visuals: Record<GrowthStageId, StageVisual>;
  /** 땅이 흘러가는 속도 (0 = 멈춤) */
  setScroll(speed: number): void;
  sparkle(n: number, x: number, y: number): void;
  dust(n: number, x: number, y: number): void;
  /** 작은 글자 텍스처 (이름표) */
  label(text: string, color: string): string;
  floatText(text: string, x: number, y: number, color: string): void;
}

/** 자막 (요청 문구 그대로) — at: 시작 초 */
export const ENDING_LINES: { at: number; text: string }[] = [
  { at: 1.0, text: '길고 길었던 고나의 모험이 드디어 끝났어요.' },
  { at: 6.6, text: '작은 알에서 태어난 고나는 어느새 이렇게 커다란 공룡이 되었답니다.' },
  { at: 13.2, text: '그런데 고나가 가장 만나고 싶었던 누군가가 있었어요.' },
  { at: 19.0, text: '고나는 세상에서 가장 소중한 사람들에게 달려갔어요.' },
  { at: 30.6, text: '아무리 커다란 공룡이 되어도,' },
  { at: 36.4, text: '가족에게 고나는 언제나 사랑스러운 아기였답니다.' },
];
/** THE END 화면이 뜨는 시각 (초) */
export const ENDING_THE_END_AT = 45;

/** 가족 시트 프레임 */
const F = { idle: 0, blink: 1, waveA: 2, waveB: 3, open: 4, walkA: 5, walkB: 6, hug: 7, kiss: 8, sniffA: 9, sniffB: 10, patA: 11, patB: 12, hold: 13 };
type Mode = 'idle' | 'wave' | 'open' | 'walk' | 'hug' | 'kiss' | 'sniff' | 'pat' | 'hold';

/** 고나 쪽(왼쪽)부터 처음 서 있는 순서 */
const ROW: FamilyId[] = ['mom', 'dad', 'aunt', 'uncle', 'grandma', 'grandpa'];

interface Member {
  id: FamilyId;
  s: Phaser.GameObjects.Sprite;
  tag: Phaser.GameObjects.Image;
  x: number;
  mode: Mode;
  /** 걷기 목표 · 도착하면 바꿀 동작 · 도착 뒤 바라볼 방향 */
  tx: number;
  then: Mode;
  thenFlip: boolean;
  flip: boolean;
  /** 동작 타이밍을 사람마다 조금씩 다르게 */
  phase: number;
  /** 동작이 시작된 시각 */
  since: number;
  bob: number;
  lean: number;
}

type Cue = { at: number; fn: () => void; done?: boolean };

export class FamilyEnding {
  /** 지난 시간(초) */
  t = 0;
  /** (검증용) 지금 장면 1~6 */
  sceneNo = 1;
  private cues: Cue[] = [];
  private objs: Phaser.GameObjects.GameObject[] = [];
  readonly family: Member[] = [];
  private familyMove = false;
  private scroll = 0;
  /** 고나: x · 높이 · 크기 배율 · 그림 */
  gx: number;
  private galt = 0;
  private gsq = 1;
  private gMode: 'idle' | 'walk' | 'run' | 'wow' | 'happy' | 'baby' = 'idle';
  private gVis: StageVisual;
  private babyHold = false;
  private petals: Phaser.GameObjects.Particles.ParticleEmitter;
  private sun: Phaser.GameObjects.Rectangle;
  private rays: Phaser.GameObjects.Image;
  private sunset: Phaser.GameObjects.Image;
  private bubble: Phaser.GameObjects.Container | null = null;
  /** 포옹 자리: 고나 가운데 */
  private C: number;
  private famScale: number;

  constructor(private host: EndingHost) {
    const { scene, W, H, groundY } = host;
    this.gVis = host.visuals.bigbaby;
    this.gx = Math.round(host.player.x);
    this.C = Math.round(Math.max(54, Math.min(W * 0.37, W - 86)));
    // 햇살 (화면 전체를 따뜻하게) · 햇살 줄기 · 노을 — 배경 위, 인물 아래 (깊이 3.2~3.6)
    this.sun = this.add(scene.add.rectangle(-50, -100, W + 100, H + 200, 0xffe2a0, 0).setOrigin(0, 0).setDepth(3.2).setScrollFactor(0));
    this.rays = this.add(scene.add.image(W * 0.62, -10, 'end-rays').setOrigin(0.5, 0).setDisplaySize(W * 1.3, groundY + 20).setDepth(3.4).setAlpha(0).setScrollFactor(0));
    this.sunset = this.add(scene.add.image(-10, -60, 'end-sunset').setOrigin(0, 0).setDisplaySize(W + 20, groundY + 70).setDepth(3.3).setAlpha(0).setScrollFactor(0));
    this.petals = this.add(
      scene.add.particles(0, 0, 'end-petal', {
        frame: [0, 1],
        x: { min: -10, max: W + 30 },
        y: -6,
        lifespan: 6000,
        speedX: { min: -26, max: -6 },
        speedY: { min: 14, max: 26 },
        rotate: { min: 0, max: 360 },
        scale: 2,
        frequency: perf.low ? 260 : 130,
        emitting: false,
      }).setDepth(11.5),
    );
    // 가족 6명 (처음엔 화면 오른쪽 밖 — 땅과 함께 다가옴)
    this.famScale = FAMILY_SHEET.scale;
    ROW.forEach((id, i) => {
      const key = scene.textures.exists(`family-${id}`) ? `family-${id}` : `family-ph-${id}`;
      const s = this.add(scene.add.sprite(W + 40 + i * 16, groundY, key, 0).setOrigin(0.5, 1).setDepth(9 - i * 0.01).setScale(key.startsWith('family-ph-') ? 1.6 : this.famScale));
      const tag = this.add(scene.add.image(0, 0, host.label(FAMILY_NAME[id], '#fff8e6')).setOrigin(0.5, 1).setScale(0.5).setDepth(12).setAlpha(0));
      this.family.push({ id, s, tag, x: W + 40 + i * 16, mode: 'idle', tx: 0, then: 'idle', thenFlip: false, flip: false, phase: (i * 0.37) % 1, since: 0, bob: 0, lean: 0 });
    });
    host.shadow.setVisible(false);
    host.player.anims.stop();
    host.player.setFlipX(false).setAngle(0).setAlpha(1);
    this.buildCues();
  }

  private add<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objs.push(o);
    return o;
  }

  private at(at: number, fn: () => void): void {
    this.cues.push({ at, fn });
  }

  private line(i: number): void {
    const l = ENDING_LINES[i];
    const next = ENDING_LINES[i + 1]?.at ?? ENDING_THE_END_AT;
    bus.emit(EV.prologueLine, { index: i, total: ENDING_LINES.length, text: l.text, seconds: Math.min(6, next - l.at) });
  }

  private m(id: FamilyId): Member {
    return this.family.find((f) => f.id === id)!;
  }

  /** 가족 한 명: 동작 바꾸기 */
  private act(id: FamilyId, mode: Mode, flip?: boolean): void {
    const f = this.m(id);
    f.mode = mode;
    f.since = this.t;
    if (flip !== undefined) f.flip = flip;
  }

  /** 가족 한 명: x 까지 걸어가서 then 동작 (걸을 때는 가는 방향을 봄) */
  private walk(id: FamilyId, x: number, then: Mode, thenFlip = false): void {
    const f = this.m(id);
    f.tx = Math.round(x);
    f.then = then;
    f.thenFlip = thenFlip;
    f.mode = 'walk';
    f.since = this.t;
    f.flip = x > f.x;
  }

  private buildCues(): void {
    const { scene, W, groundY: gy } = this.host;
    const tw = scene.tweens;
    const C = this.C;
    ENDING_LINES.forEach((l, i) => this.at(l.at, () => this.line(i)));
    // ── SCENE 1: 숲이 황금빛으로 · 숨 고르기 · 두리번 · 멀리 반짝임
    this.at(0, () => {
      sound.startMusic('ending');
      this.petals.start();
      tw.add({ targets: this.sun, fillAlpha: 0.15, duration: 2400 });
      tw.add({ targets: this.rays, alpha: 0.7, duration: 2800 });
      this.setGona('idle');
    });
    for (const [t, flip] of [[1.8, true], [3.0, false], [4.2, true], [5.3, false]] as const) {
      this.at(t, () => {
        this.host.player.setFlipX(flip);
        this.hop(3);
      });
    }
    for (let k = 0; k < 8; k++) this.at(0.8 + k * 0.75, () => this.host.sparkle(3, W - 10 - (k % 3) * 6, gy - 24 - (k % 2) * 10));
    // 반짝임 쪽으로 천천히 (땅이 같이 흘러감) + 성장 회상
    this.at(6.4, () => {
      this.setGona('walk');
      tw.add({ targets: this, scroll: 26, duration: 800 });
    });
    this.at(7.6, () => this.showMemories());
    this.at(12.4, () => {
      if (this.bubble) tw.add({ targets: this.bubble, alpha: 0, duration: 400 });
    });
    // ── SCENE 2: 숲길 끝에 가족 (각자 다른 타이밍으로 움직임) → 고나가 발견
    this.at(11.6, () => {
      this.sceneNo = 2;
      this.familyMove = true;
      tw.add({ targets: this, scroll: 34, duration: 600 });
    });
    this.at(14.6, () => {
      this.setGona('wow');
      this.host.floatText('!', this.gx + 4, gy - this.gVis.frameHeight * this.gVis.scale - 6, '#fff3a0');
      sound.warn();
      this.hop(4);
    });
    this.at(15.6, () => {
      this.setGona('happy');
      this.hop(6);
    });
    this.at(16.2, () => this.hop(6));
    ROW.forEach((id, i) => this.at(15.0 + i * 0.18, () => this.act(id, 'wave')));
    // ── SCENE 3: 고나가 신나게 달려감 (발밑 먼지·꽃잎) · 가족이 두 팔 벌림
    this.at(18.6, () => {
      this.sceneNo = 3;
      this.setGona('run');
      for (const f of this.family) tw.add({ targets: f.tag, alpha: 0, duration: 500, delay: 800 });
      tw.add({ targets: this, gx: C - 2, duration: 4600, ease: 'Sine.InOut', onComplete: () => this.setGona('happy') });
    });
    ROW.forEach((id, i) => this.at(20.4 + [0, 0.3, 0.7, 0.5, 1.0, 0.85][i], () => this.act(id, 'open')));
    // ── SCENE 4: 포옹 — 엄마·아빠 한 걸음, 이모·할머니는 뒤로 돌아 반대편에서
    this.at(23.0, () => {
      this.sceneNo = 4;
      // 고나 몸 양옆에 서서 팔만 고나에 닿게 (몸이 고나를 가리지 않게)
      this.walk('mom', C + 29, 'hug');
      this.walk('dad', C + 45, 'hug');
      this.walk('uncle', C + 61, 'open');
      this.walk('grandpa', C + 77, 'open');
      this.walk('aunt', C - 29, 'hug', true);
      this.walk('grandma', C - 45, 'open', true);
    });
    this.at(23.6, () => {
      sound.catch();
      this.gsq = 0.88;
    });
    for (let k = 0; k < 9; k++) {
      this.at(23.8 + k * 0.6, () => {
        const x = C + (Math.random() - 0.5) * 40;
        this.host.sparkle(5, x, gy - 20 - Math.random() * 22);
        this.floatHeart(x, gy - 40 - Math.random() * 10);
      });
    }
    // ── SCENE 5: 볼 뽀뽀 · 킁카 · 쓰다듬기 (번갈아)
    this.at(27.6, () => this.sceneNo === 4 && (this.sceneNo = 5));
    this.at(28.0, () => this.kiss('mom'));
    this.at(29.4, () => this.sniff('aunt'));
    this.at(30.2, () => this.act('grandma', 'pat'));
    this.at(31.0, () => this.act('dad', 'pat'));
    this.at(31.4, () => this.act('uncle', 'wave'));
    this.at(32.2, () => this.kiss('aunt'));
    this.at(33.2, () => this.sniff('mom'));
    this.at(33.6, () => this.act('grandpa', 'wave'));
    this.at(34.4, () => {
      this.act('dad', 'hug');
      this.act('aunt', 'hug', true);
      this.act('grandma', 'open', true);
    });
    // ── SCENE 6: 황금빛 속에서 아기 고나로 → 엄마 품에 · 노을 · 인사
    this.at(35.0, () => {
      this.sceneNo = 6;
      this.babyRevert();
    });
    this.at(36.4, () => {
      this.act('mom', 'hold');
      this.act('dad', 'idle');
      this.act('aunt', 'idle', true);
      this.act('uncle', 'open');
      this.act('grandma', 'wave', true);
      this.act('grandpa', 'idle');
    });
    this.at(38.0, () => {
      tw.add({ targets: this.sunset, alpha: 0.6, duration: 3600 });
      tw.add({ targets: this.rays, alpha: 0, duration: 3000 });
      tw.add({ targets: this.sun, fillAlpha: 0.06, duration: 3000 });
      this.petals.frequency = perf.low ? 520 : 300;
    });
    // 아기 고나가 깜빡 · 통통 인사
    for (const t of [40.0, 41.6, 43.0]) {
      this.at(t, () => {
        this.blink();
        this.hop(3);
        this.host.sparkle(4, this.gx, gy - 30);
      });
    }
    this.at(40.4, () => this.host.floatText('안녕!', this.gx, gy - 46, '#fff8e6'));
    this.at(41.0, () => this.act('dad', 'wave'));
    this.at(42.2, () => this.act('aunt', 'wave', true));
    this.at(ENDING_THE_END_AT, () => bus.emit(EV.endingTheEnd));
  }

  /** 볼 뽀뽀: 얼굴을 고나 볼에 → 쪽! + 하트 · 고나는 눈을 감고 활짝 */
  private kiss(id: FamilyId): void {
    const f = this.m(id);
    this.act(id, 'kiss');
    f.lean = 3;
    sound.smooch();
    const hx = f.x + (f.flip ? 10 : -10) * this.famScale;
    const hy = this.host.groundY - 44;
    this.host.floatText('쪽!', hx, hy - 8, '#ff9fc4');
    this.floatHeart(hx, hy);
    this.setGona('happy');
    this.gsq = 0.9;
    this.at(this.t + 1.0, () => {
      f.lean = 0;
      this.act(id, 'hug');
    });
  }

  /** 킁카: 코를 머리·볼에 대고 킁킁 (머리를 살짝 움직임) · 고나는 간지러워 움츠림 */
  private sniff(id: FamilyId): void {
    const f = this.m(id);
    this.act(id, 'sniff');
    f.lean = 2;
    sound.inhale();
    const hx = f.x + (f.flip ? 12 : -12) * this.famScale;
    this.host.floatText('킁킁♡', hx, this.host.groundY - 54, '#ffd0e2');
    for (let k = 0; k < 3; k++) this.at(this.t + 0.25 + k * 0.35, () => this.floatHeart(hx + (Math.random() - 0.5) * 8, this.host.groundY - 46));
    this.wiggle = 1.4;
    this.at(this.t + 1.3, () => {
      f.lean = 0;
      this.act(id, 'hug', f.flip);
    });
  }

  private wiggle = 0;

  /** 황금빛 속에서 아기 고나로 (짧은 빛 → 점점 작아짐 → 번쩍하는 순간 아기 그림 → 통통) */
  private babyRevert(): void {
    const { scene, groundY: gy } = this.host;
    sound.evolve();
    const ring = this.add(scene.add.image(this.gx, gy - 26, 'sp-ring-gold').setDepth(11.4).setScale(0.4).setAlpha(0.95));
    scene.tweens.add({ targets: ring, scale: 2.4, alpha: 0, duration: 900, ease: 'Quad.Out', onComplete: () => ring.destroy() });
    for (let k = 0; k < 4; k++) this.at(this.t + k * 0.18, () => this.host.sparkle(6, this.gx + (Math.random() - 0.5) * 30, gy - 10 - Math.random() * 40));
    scene.tweens.add({ targets: this, gsq: 0.7, duration: 520, ease: 'Sine.In' });
    let flick = 0;
    const tick = scene.tweens.addCounter({
      from: 0,
      to: 8,
      duration: 520,
      onUpdate: (tw2) => {
        const v = Math.floor(tw2.getValue() ?? 0);
        if (v === flick) return;
        flick = v;
        if (v % 2) this.host.player.setTint(0xfff3c0).setTintMode(Phaser.TintModes.FILL);
        else this.host.player.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      },
    });
    this.objs.push(tick as unknown as Phaser.GameObjects.GameObject);
    this.at(this.t + 0.55, () => {
      scene.cameras.main.flash(420, 255, 236, 170);
      sound.evolveDone();
      this.host.player.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      this.setGona('baby');
      this.gsq = 1.25;
      this.babyHold = true;
      this.host.sparkle(14, this.gx, gy - 20);
    });
  }

  /** 성장 회상: 고나 위 추억 판 안에 갓난아기 → 기어 다니는 고나 → 직립보행 → 자이언트 곤룡 고나가 하나씩 */
  private showMemories(): void {
    const { scene, groundY } = this.host;
    const ids: GrowthStageId[] = ['newborn', 'crawler', 'walker', 'bigbaby'];
    const slot = Math.min(32, Math.floor((this.host.W - 12) / ids.length));
    const bw = slot * ids.length + 8;
    const bh = 40;
    const cx = Math.round(Math.min(this.host.W - bw / 2 - 2, Math.max(bw / 2 + 2, this.gx + 20)));
    const top = Math.round(Math.max(8, groundY - this.gVis.frameHeight * this.gVis.scale - bh - 12));
    const c = this.add(scene.add.container(cx, top).setDepth(13).setAlpha(0));
    const g = scene.add.graphics();
    g.fillStyle(0xfff8e6, 0.88).fillRoundedRect(-bw / 2, 0, bw, bh, 6);
    g.lineStyle(1, 0xd8a24a, 1).strokeRoundedRect(-bw / 2, 0, bw, bh, 6);
    c.add(g);
    this.bubble = c;
    scene.tweens.add({ targets: c, alpha: 1, duration: 300 });
    ids.forEach((id, i) => {
      const v = this.host.visuals[id];
      const fr = scene.textures.getFrame(v.texture, v.idleFrame);
      const k = Math.max(0.2, Math.round(Math.min(1, (bh - 6) / fr.cutHeight, (slot - 2) / fr.cutWidth) * 5) / 5);
      const s = scene.add.image(-bw / 2 + 4 + slot * i + slot / 2, bh - 3, v.texture, v.idleFrame).setOrigin(0.5, 1).setScale(0).setAlpha(0);
      c.add(s);
      this.at(this.t + 0.3 + i * 0.85, () => {
        scene.tweens.add({ targets: s, scale: k, alpha: 1, duration: 260, ease: 'Back.Out' });
        this.host.sparkle(4, cx + s.x, top + bh / 2);
        sound.pickup(10 + i * 10);
      });
    });
  }

  private floatHeart(x: number, y: number): void {
    const h = this.add(this.host.scene.add.image(x, y, 'end-heart').setDepth(12));
    this.host.scene.tweens.add({ targets: h, y: y - 22, alpha: 0, duration: 1100, ease: 'Sine.Out', onComplete: () => h.destroy() });
  }

  private hop(px: number): void {
    this.host.scene.tweens.add({ targets: this, galt: px, duration: 150, yoyo: true, ease: 'Sine.Out' });
  }

  private blinkT = 0;
  private blink(): void {
    this.blinkT = 0.18;
  }

  private setGona(mode: 'idle' | 'walk' | 'run' | 'wow' | 'happy' | 'baby'): void {
    this.gMode = mode;
    const p = this.host.player;
    p.anims.stop();
    p.setFlipX(false);
    this.gVis = mode === 'baby' ? this.host.visuals.newborn : this.host.visuals.bigbaby;
    this.drawGona();
  }

  /** 고나 그림 (미리 만든 웃는/놀란 얼굴 시트 — 고나 디자인은 그대로, 눈·입만) */
  private drawGona(): void {
    const p = this.host.player;
    const v = this.gVis;
    const t = this.t;
    let key = v.texture;
    let frame = v.idleFrame;
    if (this.gMode === 'baby') {
      key = this.tex('happy-newborn', v.texture);
      frame = this.blinkT > 0 ? 2 : Math.floor(t * 2) % 5 === 0 ? 1 : 0;
      if (this.blinkT > 0) key = v.texture; // 눈 깜빡 (원래 그림의 깜빡 프레임)
    } else if (this.gMode === 'wow') key = this.tex('wow-bigbaby', v.texture);
    else if (this.gMode === 'happy') key = this.tex('happy-bigbaby', v.texture);
    else if (this.gMode === 'walk' || this.gMode === 'run') {
      const run = v.runFrames;
      frame = run[Math.floor(t * (this.gMode === 'run' ? 9 : 5)) % run.length];
      if (this.gMode === 'run') key = this.tex('happy-bigbaby', v.texture);
    }
    if (p.texture.key !== key || p.frame.name !== String(frame)) p.setTexture(key, frame);
  }

  private tex(key: string, fallback: string): string {
    return this.host.scene.textures.exists(key) ? key : fallback;
  }

  update(dt: number): void {
    this.t += dt;
    for (const c of this.cues) {
      if (!c.done && this.t >= c.at) {
        c.done = true;
        c.fn();
      }
    }
    const { groundY: gy, W } = this.host;
    // 땅 흐름 (가족도 땅과 함께 다가옴 → 자리에 오면 멈춤)
    if (this.familyMove) {
      // 처음 서는 자리: 포옹 자리 오른쪽으로 한 줄 (고나 쪽부터 엄마·아빠·이모·삼촌·할머니·할아버지)
      const sp = Math.max(12, Math.min(18, Math.floor((W - this.C - 44) / (ROW.length - 1))));
      const lead = this.family[0].x;
      const target = Math.min(W - 8 - sp * (ROW.length - 1), this.C + 40);
      const move = this.scroll * dt;
      if (lead - move <= target) {
        this.family.forEach((f, i) => (f.x = target + i * sp));
        this.familyMove = false;
        this.host.scene.tweens.add({ targets: this, scroll: 0, duration: 500 });
        for (const f of this.family) this.host.scene.tweens.add({ targets: f.tag, alpha: 1, duration: 400 });
        this.setGona('idle');
      } else for (const f of this.family) f.x -= move;
    }
    this.host.setScroll(this.scroll);
    // 고나: 달릴 때 통통 튀는 발걸음 · 발밑 먼지와 꽃잎
    if (this.gMode === 'run' || this.gMode === 'walk') {
      if (Math.random() < dt * (this.gMode === 'run' ? 10 : 3)) this.host.dust(1, this.gx - 8, gy);
    }
    this.blinkT = Math.max(0, this.blinkT - dt);
    this.wiggle = Math.max(0, this.wiggle - dt);
    this.drawGona();
    const p = this.host.player;
    this.gsq += (1 - this.gsq) * Math.min(1, dt * 6);
    const k = 5;
    const bounce = this.gMode === 'run' ? Math.abs(Math.sin(this.t * 9)) * 2.5 : this.gMode === 'idle' ? Math.sin(this.t * 2.2) * 0.6 : 0;
    const v = this.gVis;
    const sy = Math.round(v.scale * this.gsq * k) / k;
    const sx = Math.round(v.scale * (2 - this.gsq) * k) / k;
    p.setScale(sx, sy);
    p.setAngle(this.wiggle > 0 ? Math.sin(this.t * 30) * 3 : 0);
    // 아기는 엄마 품(가슴 높이)에 안김
    let bx = this.gx;
    let alt = this.galt + bounce;
    if (this.babyHold) {
      const mom = this.m('mom');
      bx = mom.x - 5 * this.famScale;
      alt += 17 * this.famScale + Math.abs(Math.sin(this.t * 3)) * 1.2;
      p.setDepth(10.8);
    } else p.setDepth(10);
    const fh = v.frameHeight * sy;
    p.setPosition(Math.round(bx * k) / k, Math.round((gy - alt - fh / 2) * k) / k);
    // 가족
    for (const [i, f] of this.family.entries()) this.updateMember(f, i, dt);
  }

  private updateMember(f: Member, i: number, dt: number): void {
    const { groundY: gy } = this.host;
    const t = this.t + f.phase;
    let frame: number = F.idle;
    let depth = 9 - i * 0.01;
    if (f.mode === 'walk') {
      const dir = Math.sign(f.tx - f.x);
      const step = 36 * dt;
      if (Math.abs(f.tx - f.x) <= step) {
        f.x = f.tx;
        f.mode = f.then;
        f.flip = f.thenFlip;
        f.since = this.t;
      } else f.x += dir * step;
      frame = Math.floor(t / 0.16) % 2 ? F.walkB : F.walkA;
      // 뒤로 돌아갈 때는 고나 뒤로 지나감
      depth = 9.4 - i * 0.01;
    }
    switch (f.mode) {
      case 'idle':
        frame = (t % 3.2) < 0.15 ? F.blink : F.idle;
        f.bob = Math.sin(t * 2.4) > 0.6 ? 1 : 0;
        break;
      case 'wave':
        frame = Math.floor(t / 0.26) % 2 ? F.waveB : F.waveA;
        break;
      case 'open':
        frame = F.open;
        f.bob = Math.sin(t * 3) > 0.5 ? 1 : 0;
        break;
      case 'hug':
        frame = F.hug;
        depth = 10.6 - i * 0.01; // 팔이 고나 앞으로 (실제로 감싸 안음)
        break;
      case 'kiss':
        frame = F.kiss;
        depth = 10.6;
        break;
      case 'sniff':
        frame = Math.floor((this.t - f.since) / 0.18) % 2 ? F.sniffB : F.sniffA;
        depth = 10.6;
        break;
      case 'pat':
        frame = Math.floor((this.t - f.since) / 0.24) % 2 ? F.patB : F.patA;
        depth = 10.55 - i * 0.01;
        break;
      case 'hold':
        frame = F.hold;
        break;
      default:
        break;
    }
    if (f.mode !== 'idle' && f.mode !== 'open') f.bob = 0;
    const s = f.s;
    const total = s.texture.frameTotal - 1;
    const safe = frame < total ? frame : frame === F.waveA || frame === F.waveB ? Math.min(1, total - 1) : Math.min(2, total - 1);
    if (s.frame.name !== String(safe)) s.setFrame(safe);
    s.setFlipX(f.flip).setDepth(depth);
    const lean = f.lean * (f.flip ? 1 : -1);
    s.setPosition(Math.round((f.x + lean) * 5) / 5, gy - f.bob);
    f.tag.setPosition(Math.round(f.x), Math.round(gy - s.displayHeight - 2 - (i % 2) * 6));
  }

  destroy(): void {
    const tw = this.host.scene.tweens;
    tw.killTweensOf(this);
    for (const o of this.objs) {
      if (o instanceof Phaser.Tweens.Tween) {
        o.stop();
        continue;
      }
      tw.killTweensOf(o);
      if (o.active) o.destroy();
    }
    this.objs = [];
    this.family.length = 0;
    this.host.player.clearTint().setTintMode(Phaser.TintModes.MULTIPLY).setAngle(0).setDepth(10);
    this.host.shadow.setVisible(true);
  }
}
