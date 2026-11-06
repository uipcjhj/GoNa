/**
 * 가족 엔딩 (약 45초 · 타이핑 자막 + 엔딩 음악, 음성 없음)
 *   SCENE 1 숲이 밝아지고 꽃잎 · 고나가 두리번   SCENE 2 가운데로 → 성장 회상(알 → 자이언트 곤룡 고나)
 *   SCENE 3 햇살 길을 달리고 가족 6명이 손 흔들며 기다림   SCENE 4 고나가 달려가고 가족이 두 팔을 벌림
 *   SCENE 5 포옹 · 황금 반짝임 · 고나가 아기 모습으로   SCENE 6 노을 → THE END (버튼은 DOM: ui/endingUi.ts)
 * 게임 화면(GameScene)의 배경·땅·고나 스프라이트를 그대로 쓰고, 이 클래스는 연출만 맡음.
 * 모든 그림은 미리 만든 텍스처 + 가벼운 트윈 (실행 중 이미지 처리·필터 없음). destroy() 가 만든 것을 모두 지움.
 */
import Phaser from 'phaser';
import { bus, EV } from '../../events';
import { perf } from '../../perf';
import { sound } from '../../audio';
import { FAMILY_FRAME, FAMILY_NAME, FAMILY_ORDER, type FamilyId } from '../../art/familyArt';
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
  /** 작은 글자 텍스처 (이름표) */
  label(text: string, color: string): string;
}

/** 자막 (요청 문구 그대로) — at: 시작 초 */
export const ENDING_LINES: { at: number; text: string }[] = [
  { at: 1.0, text: '길고 길었던 고나의 모험이 드디어 끝났어요.' },
  { at: 7.4, text: '작은 알에서 태어난 고나는 어느새 이렇게 커다란 공룡이 되었답니다.' },
  { at: 14.2, text: '그런데 고나가 가장 만나고 싶었던 누군가가 있었어요.' },
  { at: 21.0, text: '고나는 세상에서 가장 소중한 사람들에게 달려갔어요.' },
  { at: 27.4, text: '아무리 커다란 공룡이 되어도,' },
  { at: 31.2, text: '가족에게 고나는 언제나 사랑스러운 아기였답니다.' },
];
/** THE END 화면이 뜨는 시각 (초) · 엔딩 전체 길이 */
export const ENDING_THE_END_AT = 37.5;

/** 가족 그림 배율 (렌더 배율 5 와 곱해 정수 → 도트가 고르게) */
const FAMILY_SCALE = 1.6;

type Cue = { at: number; fn: () => void; done?: boolean };

export class FamilyEnding {
  /** 지난 시간(초) */
  t = 0;
  /** (검증용) 지금 장면 1~6 */
  sceneNo = 1;
  private cues: Cue[] = [];
  private objs: Phaser.GameObjects.GameObject[] = [];
  private family: { id: FamilyId; s: Phaser.GameObjects.Sprite; tag: Phaser.GameObjects.Image; x: number }[] = [];
  private familyFrame = 0;
  private familyMove = false;
  private scroll = 0;
  private gx: number;
  private galt = 0;
  private gFrameMode: 'idle' | 'run' | 'baby' = 'idle';
  private gVis: StageVisual;
  private petals: Phaser.GameObjects.Particles.ParticleEmitter;
  private sun: Phaser.GameObjects.Rectangle;
  private rays: Phaser.GameObjects.Image;
  private sunset: Phaser.GameObjects.Image;
  private bubble: Phaser.GameObjects.Container | null = null;
  private famLeft: number;

  constructor(private host: EndingHost) {
    const { scene, W, H, groundY } = host;
    this.gVis = host.visuals.bigbaby;
    this.gx = Math.round(host.player.x);
    // 햇살 (화면 전체를 따뜻하게) · 햇살 줄기 · 노을 — 배경 위, 인물 아래 (깊이 3.2~3.6)
    this.sun = this.add(scene.add.rectangle(-50, -100, W + 100, H + 200, 0xfff0c0, 0).setOrigin(0, 0).setDepth(3.2).setScrollFactor(0));
    this.rays = this.add(scene.add.image(W * 0.5, -10, 'end-rays').setOrigin(0.5, 0).setDisplaySize(W * 1.3, groundY + 20).setDepth(3.4).setAlpha(0).setScrollFactor(0));
    this.sunset = this.add(scene.add.image(-10, -60, 'end-sunset').setOrigin(0, 0).setDisplaySize(W + 20, groundY + 70).setDepth(3.3).setAlpha(0).setScrollFactor(0));
    // 꽃잎
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
      }).setDepth(11),
    );
    // 가족 6명 (화면 오른쪽 밖에서 대기)
    const gap = Math.max(17, Math.min(26, Math.floor((W * 0.66) / FAMILY_ORDER.length)));
    const rowW = gap * (FAMILY_ORDER.length - 1);
    this.famLeft = Math.round(W - rowW - Math.max(14, W * 0.06));
    FAMILY_ORDER.forEach((id, i) => {
      const key = scene.textures.exists(`family-${id}`) ? `family-${id}` : `family-ph-${id}`;
      const s = this.add(scene.add.sprite(0, groundY, key, 0).setOrigin(0.5, 1).setDepth(9 - i * 0.01));
      // 키가 큰 PNG 로 바꿔도 화면에서 비슷한 크기가 되게 (기본 32줄 기준)
      // 임시 그림은 1.6배(도트 1칸 = 8px), PNG 는 화면에서 같은 키(약 51줄)가 되게
      const fh = scene.textures.getFrame(key, 0).cutHeight;
      s.setScale(key.startsWith('family-ph-') ? FAMILY_SCALE : Math.round(((FAMILY_FRAME.h * FAMILY_SCALE) / fh) * 5) / 5);
      const tag = this.add(scene.add.image(0, 0, host.label(FAMILY_NAME[id], '#fff8e6')).setOrigin(0.5, 1).setScale(0.5).setDepth(12).setAlpha(0));
      this.family.push({ id, s, tag, x: W + 30 + i * gap });
    });
    this.layoutFamily();
    host.shadow.setVisible(false);
    host.player.anims.stop();
    host.player.setFlipX(false).setAngle(0).setAlpha(1);
    this.setGona('idle');
    this.buildCues(gap, rowW);
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
    bus.emit(EV.prologueLine, { index: i, total: ENDING_LINES.length, text: l.text, seconds: next - l.at });
  }

  private buildCues(gap: number, rowW: number): void {
    const { scene, W, groundY } = this.host;
    const tw = scene.tweens;
    ENDING_LINES.forEach((l, i) => this.at(l.at, () => this.line(i)));
    // ── SCENE 1: 숲이 밝아지고 꽃잎이 흩날림 · 고나가 두리번
    this.at(0, () => {
      sound.startMusic('ending');
      this.petals.start();
      tw.add({ targets: this.sun, fillAlpha: 0.16, duration: 2200 });
      tw.add({ targets: this.rays, alpha: 0.75, duration: 2600 });
    });
    for (const [t, flip] of [[1.8, true], [3.0, false], [4.2, true], [5.4, false]] as const) {
      this.at(t, () => {
        this.host.player.setFlipX(flip);
        this.hop(3);
      });
    }
    // ── SCENE 2: 가운데로 걸어가 성장 회상
    this.at(6.4, () => {
      this.sceneNo = 2;
      this.setGona('run');
      tw.add({ targets: this, gx: Math.round(W / 2), duration: 1300, ease: 'Sine.InOut', onComplete: () => this.setGona('idle') });
    });
    this.at(8.0, () => this.showMemories());
    this.at(13.0, () => {
      if (this.bubble) tw.add({ targets: this.bubble, alpha: 0, duration: 400 });
    });
    // ── SCENE 3: 햇살 길을 달림 → 가족이 손 흔들며 기다림
    this.at(13.6, () => {
      this.sceneNo = 3;
      this.setGona('run');
      tw.add({ targets: this, gx: Math.round(W * 0.28), duration: 900, ease: 'Sine.Out' });
      tw.add({ targets: this, scroll: 64, duration: 700 });
      tw.add({ targets: this.rays, alpha: 1, duration: 1200 });
      tw.add({ targets: this.sun, fillAlpha: 0.22, duration: 1200 });
      this.familyMove = true;
    });
    // ── SCENE 4: 달려감 · 두 팔 벌림
    this.at(20.6, () => {
      this.sceneNo = 4;
      this.familyFrame = 2;
      tw.add({ targets: this, gx: this.famLeft - 12, duration: 3400, ease: 'Sine.In' });
    });
    // ── SCENE 5: 포옹 · 황금 반짝임 · 아기 모습으로
    this.at(24.2, () => {
      this.sceneNo = 5;
      this.setGona('idle');
      tw.add({ targets: this, gx: this.famLeft + Math.round(gap / 2), duration: 500, ease: 'Quad.Out' });
      sound.catch();
    });
    for (let i = 0; i < 8; i++) {
      this.at(24.8 + i * 0.55, () => {
        const x = this.famLeft + gap / 2 + (Math.random() - 0.5) * 30;
        this.host.sparkle(6, x, groundY - 14 - Math.random() * 16);
        this.floatHeart(x, groundY - 26);
      });
    }
    this.at(28.6, () => {
      scene.cameras.main.flash(500, 255, 236, 170);
      sound.evolveDone();
      this.setGona('baby');
      this.galt = Math.round(FAMILY_FRAME.h * FAMILY_SCALE * 0.34); // 가족 품에 안김 (가슴 높이)
      this.host.sparkle(16, this.gx, groundY - 14);
    });
    // ── SCENE 6: 노을 → THE END
    this.at(34.0, () => {
      this.sceneNo = 6;
      tw.add({ targets: this.sunset, alpha: 0.62, duration: 3200 });
      tw.add({ targets: this.rays, alpha: 0, duration: 2600 });
      tw.add({ targets: this.sun, fillAlpha: 0.08, duration: 2600 });
      this.petals.frequency = perf.low ? 520 : 300;
    });
    this.at(ENDING_THE_END_AT, () => bus.emit(EV.endingTheEnd));
    void rowW;
  }

  /** 성장 회상: 고나 위 동그란 추억 판 안에 알 → 아기 → … → 자이언트 곤룡 고나가 하나씩 */
  private showMemories(): void {
    const { scene, groundY } = this.host;
    const ids: GrowthStageId[] = ['newborn', 'crawler', 'walker', 'bigbaby'];
    const slot = Math.min(32, Math.floor((this.host.W - 12) / ids.length));
    const bw = slot * ids.length + 8;
    const bh = 40;
    const cx = Math.round(Math.min(this.host.W - bw / 2 - 2, Math.max(bw / 2 + 2, this.gx)));
    const top = Math.round(Math.max(8, groundY - this.gVis.frameHeight * this.gVis.scale - bh - 10));
    const c = this.add(scene.add.container(cx, top).setDepth(13).setAlpha(0));
    const g = scene.add.graphics();
    g.fillStyle(0xfff8e6, 0.88).fillRoundedRect(-bw / 2, 0, bw, bh, 6);
    g.lineStyle(1, 0xd8a24a, 1).strokeRoundedRect(-bw / 2, 0, bw, bh, 6);
    // 말꼬리
    g.fillStyle(0xfff8e6, 0.88).fillTriangle(-3, bh, 3, bh, 0, bh + 5);
    c.add(g);
    this.bubble = c;
    scene.tweens.add({ targets: c, alpha: 1, duration: 300 });
    ids.forEach((id, i) => {
      const v = this.host.visuals[id];
      const fr = scene.textures.getFrame(v.texture, v.idleFrame);
      // 판 안에 들어가게 (도트가 고르게: 렌더 배율 5 기준 0.2 단위)
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
    this.host.scene.tweens.add({ targets: this, galt: px, duration: 140, yoyo: true, ease: 'Sine.Out' });
  }

  private setGona(mode: 'idle' | 'run' | 'baby'): void {
    this.gFrameMode = mode;
    const p = this.host.player;
    if (mode === 'baby') {
      this.gVis = this.host.visuals.newborn;
      p.anims.stop();
      p.setTexture(this.gVis.texture, this.gVis.idleFrame).setScale(this.gVis.scale).setFlipX(false);
      return;
    }
    this.gVis = this.host.visuals.bigbaby;
    p.setScale(this.gVis.scale);
    if (mode === 'run') {
      p.setFlipX(false);
      p.play(this.gVis.runAnim, true);
    } else {
      p.anims.stop();
      p.setTexture(this.gVis.texture, this.gVis.idleFrame);
    }
  }

  private layoutFamily(): void {
    const { groundY } = this.host;
    for (const [i, f] of this.family.entries()) {
      const x = Math.round(f.x);
      f.s.setPosition(x, groundY).setFrame(this.familyFrame === 1 ? (i % 2 ? 1 : 0) : this.familyFrame);
      f.tag.setPosition(x, Math.round(groundY - f.s.displayHeight - 2 - (i % 2) * 6));
    }
  }

  update(dt: number): void {
    this.t += dt;
    for (const c of this.cues) {
      if (!c.done && this.t >= c.at) {
        c.done = true;
        c.fn();
      }
    }
    const { groundY } = this.host;
    // 땅 흐름 (가족도 땅과 함께 다가옴 → 자리에 오면 멈춤)
    if (this.familyMove) {
      const target = this.famLeft;
      const lead = this.family[0].x;
      const move = this.scroll * dt;
      if (lead - move <= target) {
        const d = lead - target;
        for (const f of this.family) f.x -= d;
        this.familyMove = false;
        this.scroll = 0;
        this.host.scene.tweens.killTweensOf(this);
        this.setGona('idle');
        for (const f of this.family) this.host.scene.tweens.add({ targets: f.tag, alpha: 1, duration: 400 });
      } else for (const f of this.family) f.x -= move;
      if (this.familyFrame === 0 && this.family[0].x < this.host.W - 4) this.familyFrame = 1;
    }
    this.host.setScroll(this.scroll);
    // 손 흔들기 (0 ↔ 1)
    if (this.familyFrame === 1 || this.familyFrame === 0) {
      if (!this.familyMove && this.sceneNo < 4 && this.sceneNo >= 3) this.familyFrame = Math.floor(this.t / 0.35) % 2 ? 1 : 0;
    }
    this.layoutFamily();
    if (this.familyFrame === 1) for (const [i, f] of this.family.entries()) f.s.setFrame((Math.floor(this.t / 0.35) + i) % 2 ? 1 : 0);
    // 고나 위치 (발 = 땅 - 높이)
    const p = this.host.player;
    const bob = this.gFrameMode === 'baby' ? Math.abs(Math.sin(this.t * 3)) * 1.2 : 0;
    const k = 5;
    const fh = this.gVis.frameHeight * this.gVis.scale;
    p.setPosition(Math.round(this.gx * k) / k, Math.round((groundY - this.galt - bob - fh / 2) * k) / k);
  }

  destroy(): void {
    const tw = this.host.scene.tweens;
    tw.killTweensOf(this);
    for (const o of this.objs) {
      tw.killTweensOf(o);
      if (o.active) o.destroy();
    }
    this.objs = [];
    this.family = [];
    this.host.shadow.setVisible(true);
  }
}
