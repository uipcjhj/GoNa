/**
 * 가족 엔딩 컷신 — 8장면 (약 2분) → 타이틀 → 크레딧 → 마지막 문구 → 검은 화면
 *
 * 그림 원칙
 *   - 가족 여섯 명: 사용자가 준 확정 디자인 시트에서 그대로 잘라 낸 원본 그림(art-src/ending/fam-<id>.png,
 *     tools/extract_family_sheet.py)을 그림 자체의 도트 격자 절반(3px) 칸으로 다시 샘플링한 도트 그림
 *     (public/assets/ending/fam-<id>-px.png, tools/pixelize_family.py — 새로 그리거나 고쳐 그리지 않음).
 *     원본 도트 한 칸 = 고나 도트 한 칸 크기(반 칸 = 0.5) 로 표시 → 배경·고나와 같은 또렷한 도트 (부드러운 축소 없음).
 *     (도트 한 칸 그대로 줄이면 입·눈·안경이 뭉개져 반 칸을 씀 — 비교: art-src/ending/family-pixel-compare.png)
 *     움직임은 위치 이동(다가가기·몸을 기울여 다가붙기)과 작은 들썩임만 — 회전·찌그러뜨리기·모핑 없음.
 *   - 고나: 게임에 있는 성장 1~4단계 원본 스프라이트(눈 깜빡·꼬물·기기·달리기·걷기, 웃는 얼굴) 그대로.
 *   - 배경: 해 질 녘 보랏빛 버섯마을(엔딩 배경) + 은은한 가로등 불빛·꽃잎·반딧불·별빛.
 * 내레이션: 자막(한 글자씩)으로만 — 문장은 사용자가 준 그대로. 자막이 나오는 동안 엔딩 곡을 살짝 낮춤.
 * 음악: 엔딩 전용 오리지널 곡 bgm-ending.mp3 (tools/compose_ending_bgm.cjs) 한 곡이 장면 전환과 상관없이 이어짐.
 */
import Phaser from 'phaser';
import { bus, EV } from '../events';
import { sound } from '../audio';
import { perf } from '../perf';
import { GAME_BG } from '../config';

export const ENDING_FAMILY = ['imo', 'samchon', 'mom', 'dad', 'halmeoni', 'halabeoji'] as const;
export type FamId = (typeof ENDING_FAMILY)[number];
export const FAMILY_LABEL: Record<FamId, string> = { imo: '이모', samchon: '삼촌', mom: '엄마', dad: '아빠', halmeoni: '할머니', halabeoji: '할아버지' };

/** 내레이션 (사용자가 준 문장 그대로) · 시작 시각(초) */
export const ENDING_LINES: { at: number; text: string }[] = [
  { at: 0.8, text: '처음 세상에 왔을 땐, 모든 것이 낯설고 커다랬던 고나.' },
  { at: 9.9, text: '어느새 혼자 걷고, 달리고, 무서운 괴물도 물리칠 만큼 자랐어요.' },
  { at: 22.5, text: '길고 길었던 고나의 모험이 끝나고, 고나가 가장 보고 싶었던 얼굴들이 보였어요.' },
  { at: 31.9, text: '고나는 작은 발로 있는 힘껏 달려갔어요.' },
  { at: 38.2, text: '아무리 커다란 모험을 하고 돌아와도, 가족의 품에서는 언제나 작고 소중한 아기였으니까요.' },
  { at: 47.7, text: '무섭기만 했던 뽀뽀와 킁카도, 가족의 품에서는 세상에서 가장 따뜻한 사랑이 되었어요.' },
  { at: 60.4, text: '그렇게 고나는 알게 되었답니다.' },
  { at: 66.6, text: '세상에서 가장 맛있는 건, 언제나 나를 믿어주고 기다려주는 사랑이라는 걸요.' },
];
/** 장면 시작 시각 (엔딩 곡의 마디에 맞춤: 1마디 = 3.158초) */
export const ENDING_SCENES = [0, 9.47, 22.1, 31.58, 37.9, 47.37, 60.0, 66.3] as const;
export const ENDING_TITLE_AT = 78.9;
export const ENDING_CREDITS_AT = 88.4;
export const ENDING_FINAL_AT = 107.4;
export const ENDING_BLACK_AT = 116.5;
/** (예전 이름 호환) 마지막 화면 버튼이 나오는 때 */
export const ENDING_THE_END_AT = ENDING_BLACK_AT + 3.5;

/** 반 도트 그림(원본 도트 1칸 = 2px) → 원본 도트 1칸이 고나 도트 1칸과 같은 크기로 */
const FAM_SCALE = 0.5;

interface Layout {
  bg: string;
  W: number;
  H: number;
  c: number;
  lamps: [number, number][];
  /** 가족이 서는 곳 (가운데 기준 x, 줄 0 앞·2 뒤) — 단체 사진.
   *  앞줄 셋 · 뒷줄 셋을 반 칸씩 엇갈리게, 뒷줄은 얼굴이 앞사람 머리 위로 다 보이게 올려 세움 (얼굴끼리 겹치지 않음) */
  photo: Record<FamId, [number, 0 | 1 | 2]>;
}

const LAYOUTS: Record<'land' | 'port', Layout> = {
  land: {
    bg: 'end-bgB-land',
    W: 320,
    H: 180,
    c: 160,
    lamps: [[94, 41], [237, 41]],
    photo: { imo: [-34, 0], mom: [12, 0], halmeoni: [58, 0], dad: [-58, 2], samchon: [-11, 2], halabeoji: [35, 2] },
  },
  port: {
    bg: 'end-bgB-port',
    W: 180,
    H: 320,
    c: 92,
    lamps: [[15, 116], [163, 116]],
    photo: { imo: [-28, 0], mom: [10, 0], halmeoni: [48, 0], dad: [-48, 2], samchon: [-9, 2], halabeoji: [29, 2] },
  },
};
const ROW_DY = [0, -11, -21];
const ROW_DEPTH = [160, 130, 100];

interface Member {
  id: FamId;
  s: Phaser.GameObjects.Image;
  x: number;
  y: number;
  row: 0 | 1 | 2;
  /** 들썩임 세기 (0 = 가만히) */
  bob: number;
  phase: number;
  lean: { x: number; y: number };
}

type Cue = { at: number; fn: () => void; done?: boolean };
type GonaStage = 'newborn' | 'crawler' | 'walker' | 'bigbaby';

export class EndingScene extends Phaser.Scene {
  /** 지난 시간(초) — (검증용) 바꿔서 빨리 감기 가능 */
  t = 0;
  sceneNo = 1;
  /** (검증용) 이 시간에서 멈춤 */
  holdAt = Infinity;
  readonly family: Member[] = [];
  private cues: Cue[] = [];
  /** 지금 실행 중인 cue 가 예정보다 몇 초 늦었는지 (빨리 감기 판별) */
  private cueLate = 0;
  private L!: Layout;
  private portrait = false;
  private Z0 = 6;
  /** 가족이 서는 땅 높이 · 처음 고나가 서는 앞쪽 땅 높이 */
  private gF = 230;
  private gNear = 260;
  private gona!: Phaser.GameObjects.Sprite;
  gx = 0;
  gy = 0;
  private gStage: GonaStage = 'newborn';
  private gMode: 'idle' | 'look' | 'walk' | 'run' | 'happy' | 'wow' | 'held' | 'hide' = 'idle';
  private gsq = 1;
  private wiggle = 0;
  private dim!: Phaser.GameObjects.Rectangle;
  private glow!: Phaser.GameObjects.Rectangle;
  private memory: Phaser.GameObjects.GameObject[] = [];
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super('EndingCine');
  }

  preload(): void {
    // 보통은 최종 보스전 때 미리 받아 둠 (GameScene.preloadEndingArt) — 바로 엔딩으로 온 경우만 여기서
    for (const id of ENDING_FAMILY) if (!this.textures.exists(`fam-${id}`)) this.load.image(`fam-${id}`, `assets/ending/fam-${id}-px.png`);
  }

  create(): void {
    const tCreate = performance.now();
    this.t = 0;
    this.sceneNo = 1;
    this.holdAt = Infinity;
    this.family.length = 0;
    this.cues = [];
    this.memory = [];
    this.gMode = 'idle';
    this.wiggle = 0;
    const cam = this.cameras.main;
    this.portrait = this.scale.height > this.scale.width;
    this.L = LAYOUTS[this.portrait ? 'port' : 'land'];
    const L = this.L;
    this.Z0 = Math.max(1, Math.ceil(Math.max(this.scale.width / L.W, this.scale.height / L.H)));
    cam.setZoom(this.Z0).setBounds(0, 0, L.W, L.H).setRoundPixels(true).setBackgroundColor('#2a1a3a');
    // 땅 높이: 세로는 아래 자막에 발이 가리지 않게, 가로는 돌길 위
    this.gF = this.portrait ? 226 : 150;
    this.gNear = this.portrait ? 258 : 172;
    this.add.image(0, 0, L.bg).setOrigin(0, 0).setDepth(0);
    for (const [i, [x, y]] of L.lamps.entries()) {
      const g = this.add.image(x, y, 'end-glow').setDepth(1).setScale(0.55).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: g, alpha: 0.72, scale: 0.6, duration: 1400 + i * 300, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }
    this.ambience();
    // 따뜻한 살구빛 (깨달음 장면) · 장면 전환용 어둡게
    this.glow = this.add.rectangle(0, 0, L.W, L.H, 0xffb886, 1).setOrigin(0, 0).setDepth(300).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.dim = this.add.rectangle(0, 0, L.W, L.H, 0x140a20, 1).setOrigin(0, 0).setDepth(310).setAlpha(0);
    // 가족 (처음엔 숨김 — SCENE 03 에서 길 끝에 나타남)
    for (const id of ENDING_FAMILY) {
      const [dx, row] = L.photo[id];
      const x = L.c + dx;
      const y = this.gF + ROW_DY[row];
      const s = this.add.image(x, y, `fam-${id}`).setOrigin(0.5, 1).setScale(FAM_SCALE).setDepth(ROW_DEPTH[row]).setVisible(false);
      this.family.push({ id, s, x, y, row, bob: 0, phase: Math.random() * 6, lean: { x: 0, y: 0 } });
    }
    // 고나 (1단계부터)
    this.gx = L.c;
    this.gy = this.gNear;
    this.gona = this.add.sprite(this.gx, this.gy, 'dino-stage-newborn', 0).setOrigin(0.5, 1).setDepth(180);
    this.setStage('newborn');
    // 달릴 때 발밑 먼지
    if (!this.textures.exists('end-dust')) {
      const c = document.createElement('canvas');
      c.width = 4;
      c.height = 4;
      const g = c.getContext('2d')!;
      g.fillStyle = '#f2dcc0';
      g.fillRect(1, 0, 2, 4);
      g.fillRect(0, 1, 4, 2);
      this.textures.addCanvas('end-dust', c);
    }
    this.dust = this.add.particles(0, 0, 'end-dust', { lifespan: 520, speedX: { min: -26, max: -8 }, speedY: { min: -14, max: -4 }, scale: { start: 1, end: 0.3 }, alpha: { start: 0.85, end: 0 }, emitting: false }).setDepth(175);
    this.frame(L.c, this.gNear, this.Z0, 0);
    cam.fadeIn(1400, 30, 16, 40);
    this.buildCues();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cues = [];
      this.family.length = 0;
      this.memory = [];
    });
    perf.mark('ending:create', performance.now() - tCreate);
  }

  // ───────────────────────── 분위기 (꽃잎·반딧불·별빛 — 개수 제한) ─────────────────────────

  private ambience(): void {
    const L = this.L;
    this.add
      .particles(0, 0, 'end-petal', { frame: [0, 1], x: { min: 0, max: L.W + 20 }, y: -4, lifespan: 11000, speedX: { min: -8, max: -2 }, speedY: { min: 5, max: 10 }, rotate: { min: 0, max: 360 }, frequency: perf.low ? 1200 : 700, maxAliveParticles: 14 })
      .setDepth(400);
    if (!this.textures.exists('end-firefly')) {
      const c = document.createElement('canvas');
      c.width = 5;
      c.height = 5;
      const g = c.getContext('2d')!;
      g.fillStyle = 'rgba(255, 236, 150, 0.35)';
      g.fillRect(0, 1, 5, 3);
      g.fillRect(1, 0, 3, 5);
      g.fillStyle = '#fff6c2';
      g.fillRect(2, 1, 1, 3);
      g.fillRect(1, 2, 3, 1);
      this.textures.addCanvas('end-firefly', c);
    }
    // 반딧불: 땅 위를 천천히 떠다니며 깜빡
    this.add
      .particles(0, 0, 'end-firefly', {
        x: { min: 0, max: L.W },
        y: { min: L.H * 0.45, max: L.H * 0.9 },
        lifespan: 5200,
        speedX: { min: -5, max: 5 },
        speedY: { min: -6, max: 2 },
        alpha: { values: [0, 0.9, 0.3, 0.9, 0], interpolation: 'linear' },
        frequency: perf.low ? 900 : 520,
        maxAliveParticles: perf.low ? 6 : 11,
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(395);
    // 별빛: 하늘 위쪽 몇 개만 반짝
    for (let i = 0; i < 6; i++) {
      const x = 10 + ((i * 53) % (L.W - 20));
      const y = 6 + ((i * 29) % Math.round(L.H * 0.2));
      const st = this.add.image(x, y, 'end-firefly').setDepth(2).setAlpha(0.15).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: st, alpha: 0.85, duration: 1100 + i * 260, yoyo: true, repeat: -1, delay: i * 400, ease: 'Sine.InOut' });
    }
  }

  // ───────────────────────── 카메라 ─────────────────────────

  /** (x, 그 장면의 땅 높이) 를 배율 z 로 — 세로는 땅이 화면 아래 자막 위에, 가로는 화면 아래쪽에 오게 */
  private frame(x: number, ground: number, z: number, dur: number): void {
    const vh = this.scale.height / z;
    // 화면 높이 중 땅이 놓일 위치 — 가로 화면은 자막이 위에 있어, 가까이 볼 때는 발을 화면 맨 아래로 (얼굴이 자막에 가리지 않게)
    const at = this.portrait ? 0.7 : z > this.Z0 ? 0.99 : 0.9;
    const cy = ground - vh * at + vh / 2;
    this.shot(x, cy, z, dur);
  }

  private shot(x: number, y: number, z: number, dur: number): void {
    const cam = this.cameras.main;
    const L = this.L;
    const vw = this.scale.width / z;
    const vh = this.scale.height / z;
    const cx = Phaser.Math.Clamp(x, vw / 2, L.W - vw / 2);
    const cy = Phaser.Math.Clamp(y, vh / 2, L.H - vh / 2);
    // 앞 장면의 카메라 이동이 아직 진행 중이어도 새 구도가 항상 이김 (force)
    if (dur <= 0) {
      cam.zoomEffect.reset();
      cam.panEffect.reset();
      cam.setZoom(z);
      cam.centerOn(cx, cy);
      return;
    }
    if (cam.zoom !== z || cam.zoomEffect.isRunning) cam.zoomTo(z, dur * 1000, 'Sine.easeInOut', true);
    cam.pan(cx, cy, dur * 1000, 'Sine.easeInOut', true);
  }

  /** 부드러운 장면 전환: 잠깐 어두워졌다가 밝아지며 바뀜 */
  private softCut(fn: () => void, ms = 520): void {
    // 빨리 감기(시간 건너뛰기)로 늦게 불린 장면 전환은 어둡게 하지 않고 바로 바꿈 → 뒤 장면의 배치를 덮어쓰지 않음
    if (this.cueLate > 0.3) {
      fn();
      return;
    }
    this.tweens.add({
      targets: this.dim,
      alpha: 1,
      duration: ms / 2,
      ease: 'Sine.In',
      onComplete: () => {
        fn();
        this.tweens.add({ targets: this.dim, alpha: 0, duration: ms / 2 + 120, ease: 'Sine.Out' });
      },
    });
  }

  // ───────────────────────── 진행 ─────────────────────────

  private at(at: number, fn: () => void): void {
    this.cues.push({ at, fn });
  }

  private m(id: FamId): Member {
    return this.family.find((f) => f.id === id)!;
  }

  /** 몸을 기울여 다가붙기 (위치만 살짝 — 그림은 그대로) */
  private lean(id: FamId, dx: number, dy: number, ms = 600): void {
    this.tweens.add({ targets: this.m(id).lean, x: dx, y: dy, duration: ms, ease: 'Sine.InOut' });
  }

  private line(i: number): void {
    const l = ENDING_LINES[i];
    const next = ENDING_LINES[i + 1]?.at ?? ENDING_TITLE_AT - 1;
    const sec = Math.min(8, next - l.at);
    bus.emit(EV.prologueLine, { index: i, total: ENDING_LINES.length, text: l.text, seconds: sec });
    // 내레이션이 나오는 동안 음악을 살짝 낮추고, 다 읽을 시간이 지나면 다시 (다음 문장이 이어지면 계속 낮춤)
    sound.duckEnding(true);
    const readEnd = l.at + Math.min(sec - 0.4, 1.2 + Array.from(l.text).length * 0.11);
    if (next - readEnd > 1.2) this.at(readEnd, () => sound.duckEnding(false));
  }

  private setStage(st: GonaStage): void {
    this.gStage = st;
    const key = st === 'walker' ? 'dino' : `dino-stage-${st}`;
    if (this.textures.exists(key)) this.gona.setTexture(key, 0);
  }

  private buildCues(): void {
    const L = this.L;
    const Z0 = this.Z0;
    // 클로즈업 배율 (모두 정수): 뽀뽀·킁카 둘만 가까이 = 약 1.6배 · 가족 모두가 다 보이는 가까운 단체 = 한 단계 위 · 고나 얼굴 = 약 2.2배
    const ZC = Math.max(Z0 + 1, Math.round(Z0 * 1.6));
    const ZG = Z0 + 1;
    const ZF = Math.max(ZC + 1, Math.round(Z0 * 2.2));
    // 안긴 고나: 엄마 얼굴이 고나 머리 위로 다 보이는 높이
    const HELD_Y = 12;
    // 엄마 자리 (단체 사진 기준) — 안기기·뽀뽀·킁카 위치의 기준
    const MX = L.c + L.photo.mom[0];
    // SCENE 03·04: 가족이 길 끝에 모여 있을 때의 배치 (조금 좁게, 고나가 보는 쪽으로)
    const near = { k: this.portrait ? 0.9 : 0.92, off: this.portrait ? 12 : 40 };
    const momNear = L.c + L.photo.mom[0] * near.k + near.off;
    const [s1, s2, s3, s4, s5, s6, s7, s8] = ENDING_SCENES;
    // 엔딩 곡: 보통은 최종 보스전 때 미리 해독해 둠. 아니면 지금 해독(최대 2.5초 기다림) → 안 되면 파일로 재생
    this.at(0, () => {
      if (sound.endingReady) {
        sound.playEndingTrack();
        return;
      }
      let started = false;
      const go = (): void => {
        if (started || !this.scene.isActive()) return;
        started = true;
        sound.playEndingTrack(this.t);
      };
      void sound.prepareEnding().then(go);
      this.time.delayedCall(2500, go);
    });
    ENDING_LINES.forEach((l, i) => this.at(l.at, () => this.line(i)));

    // ── SCENE 01 처음 만난 세상: 아기 고나가 주변을 올려다봄 · 카메라가 천천히 다가감
    this.at(s1 + 0.4, () => this.frame(L.c, this.gNear, Z0 * 2, 7.6));
    this.at(s1 + 2.6, () => (this.gMode = 'look'));

    // ── SCENE 02 어느새 자란 고나: 성장 1→2→3→4단계 (게임 속 배경·스프라이트로 모험 회상)
    this.at(s2, () => {
      this.sceneNo = 2;
      this.softCut(() => {
        this.gMode = 'hide';
        this.frame(L.c, this.gNear, Z0, 0);
        this.dim.setAlpha(0.55);
        this.startMemories(s3 - s2 - 0.6);
      }, 700);
    });

    // ── SCENE 03 기다리고 있던 얼굴들: 고나(4단계) 뒤에서 → 길 끝의 가족
    this.at(s3, () => {
      this.sceneNo = 3;
      this.softCut(() => {
        this.clearMemories();
        this.dim.setAlpha(0);
        this.setStage('bigbaby');
        this.gx = this.portrait ? L.c - 58 : L.c - 110;
        this.gy = this.gNear;
        this.gMode = 'idle';
        // 가족은 길 끝(조금 멀리)에 줄지어 서지 않고 모여서 기다림
        for (const f of this.family) {
          const [dx, row] = L.photo[f.id];
          f.x = L.c + dx * near.k + near.off;
          f.y = this.gF + ROW_DY[row];
          // 카메라가 고나 뒤에서 물러나며 보여 줄 때 나타남 (처음엔 화면 위쪽에 머리가 잘려 보이지 않게)
          f.s.setVisible(true).setAlpha(0);
          f.bob = 0.6;
        }
        this.frame(this.gx + 14, this.gNear, Z0 * 2, 0);
      }, 700);
    });
    this.at(s3 + 1.6, () => {
      this.frame(L.c + (this.portrait ? 0 : 10), this.gNear, Z0, 4.5);
      this.tweens.add({ targets: this.family.map((f) => f.s), alpha: 1, duration: 1600, delay: 900, ease: 'Sine.Out' });
    });
    this.at(s3 + 4.2, () => {
      this.gMode = 'wow';
      this.hop(2);
    });
    this.at(s3 + 6.0, () => (this.gMode = 'happy'));

    // ── SCENE 04 달려가는 고나: 4단계 고나가 신나게 달려감 · 발밑 먼지 · 가족은 웃으며 맞이
    this.at(s4, () => {
      this.sceneNo = 4;
      this.gMode = 'run';
      for (const f of this.family) f.bob = 1;
      const tx = momNear - (this.portrait ? 6 : 10);
      this.tweens.add({ targets: this, gx: tx, gy: this.gF + 1, duration: (s5 - s4 - 0.3) * 1000, ease: 'Sine.InOut', onComplete: () => (this.gMode = 'happy') });
      this.frame(L.c, this.gF, Z0, 2);
    });

    // ── SCENE 05 가족의 품: 엄마가 안아 줌 · 모두 둘러섬
    this.at(s5, () => {
      this.sceneNo = 5;
      for (const f of this.family) {
        const [dx, row] = L.photo[f.id];
        this.tweens.add({ targets: f, x: L.c + dx, y: this.gF + ROW_DY[row], duration: 1400, ease: 'Sine.InOut' });
        f.bob = 0.4;
      }
      // 고나가 엄마 품으로 (엄마 바로 앞에 폭 안김 — 엄마 얼굴은 고나 머리 위로 보임)
      this.gMode = 'held';
      this.tweens.killTweensOf(this); // 달려가던 이동이 남아 있으면 멈추고 엄마 품으로
      this.tweens.add({ targets: this, gx: MX + 1, gy: this.gF + HELD_Y, duration: 1200, ease: 'Sine.Out' });
      this.lean('mom', 0, 2, 1200);
      // 가족 모두가 안아 주는 장면 → 여섯 명이 다 들어오는 가까운 단체 구도
      this.frame(L.c + 2, this.gF + HELD_Y + 2, ZG, 2.4);
    });
    this.at(s5 + 2.6, () => this.heart(MX - 8, this.gF - 52));
    this.at(s5 + 5.2, () => this.heart(MX + 10, this.gF - 56));

    // ── SCENE 06 뽀뽀와 킁카: ① 할머니가 볼에 쪽 → ② 안경 삼촌이 머리에 킁카
    this.at(s6, () => {
      this.sceneNo = 6;
      this.softCut(() => {
        const h = this.m('halmeoni');
        this.tweens.killTweensOf(h); // 앞 장면의 '모여 서기' 이동이 남아 있어도 이 자리에 고정
        h.x = MX + 31;
        h.y = this.gF;
        h.row = 0;
        h.s.setDepth(190);
        h.bob = 0;
        // 볼뽀뽀: 엄마가 고나를 살짝 들어 올려 할머니 얼굴 높이로
        this.gy = this.gF - 6;
        this.frame(MX + 14, this.gF, ZC, 0);
      });
    });
    this.at(s6 + 1.2, () => this.lean('halmeoni', -6, 3, 900));
    this.at(s6 + 2.2, () => {
      sound.smooch();
      this.float('쪽', this.gx + 12, this.gy - 40, '#ffb3cf');
      this.heart(this.gx + 18, this.gy - 46, 0.8);
      this.wiggle = 0.8;
    });
    this.at(s6 + 4.0, () => this.lean('halmeoni', 0, 0, 900));
    this.at(s6 + 6.3, () => {
      this.softCut(() => {
        const h = this.m('halmeoni');
        const [hx, hrow] = L.photo.halmeoni;
        h.x = L.c + hx;
        h.y = this.gF + ROW_DY[hrow];
        h.row = hrow;
        h.s.setDepth(ROW_DEPTH[hrow]);
        h.bob = 0.4;
        const s = this.m('samchon');
        this.tweens.killTweensOf(s);
        s.x = MX - 26;
        s.y = this.gF + 2;
        s.row = 0;
        s.s.setDepth(165); // 엄마(160) 앞, 안긴 고나(170) 뒤 — 고나 머리 뒤에서 킁킁
        s.bob = 0;
        this.frame(MX - 10, this.gF, ZC, 0);
      });
    });
    this.at(s6 + 7.6, () => this.lean('samchon', 6, 4, 900));
    this.at(s6 + 8.6, () => {
      sound.inhale();
      this.float('킁킁', this.gx - 14, this.gy - 52, '#e8f4c0');
      this.wiggle = 1.4;
      this.gMode = 'held';
    });
    this.at(s6 + 10.4, () => this.lean('samchon', 0, 0, 900));

    // ── SCENE 07 고나의 깨달음: 안긴 고나 얼굴을 천천히 가까이 · 눈 감고 편안한 웃음 · 노을빛
    this.at(s7, () => {
      this.sceneNo = 7;
      this.softCut(() => {
        const s = this.m('samchon');
        const [sx, srow] = L.photo.samchon;
        s.x = L.c + sx;
        s.y = this.gF + ROW_DY[srow];
        s.row = srow;
        s.s.setDepth(ROW_DEPTH[srow]);
        s.bob = 0.4;
        this.frame(this.gx, this.gF - 8, ZC, 0);
      }, 800);
    });
    this.at(s7 + 0.6, () => {
      this.shot(this.gx, this.gy - 26, ZF, 5.2);
      this.tweens.add({ targets: this.glow, alpha: 0.16, duration: 2400, ease: 'Sine.InOut' });
    });

    // ── SCENE 08 마지막 가족사진: 고나를 가운데로 모두 함께 · 아주 천천히 멀어짐 → 어두워지며 타이틀로
    this.at(s8, () => {
      this.sceneNo = 8;
      this.tweens.add({ targets: this.glow, alpha: 0.06, duration: 3000 });
      for (const f of this.family) f.bob = 0.5;
      // 단체 사진: 고나는 엄마 앞 가운데 (모두의 얼굴이 보이게)
      this.tweens.add({ targets: this, gy: this.gF + HELD_Y, duration: 1400, ease: 'Sine.InOut' });
      this.frame(L.c + 2, this.gF + HELD_Y + 2, ZG, 1.6);
    });
    this.at(s8 + 2.0, () => this.frame(L.c + 2, this.gF + HELD_Y + 2, Z0, ENDING_TITLE_AT - s8 - 2.4));
    this.at(s8 + 4.0, () => this.heart(L.c - 30, this.gF - 70, 0.8));
    this.at(s8 + 6.5, () => this.heart(L.c + 28, this.gF - 74, 0.8));
    this.at(ENDING_TITLE_AT - 2.2, () => this.tweens.add({ targets: this.dim, alpha: 0.42, duration: 2600, ease: 'Sine.InOut' }));

    // ── 타이틀 · 크레딧 · 마지막 문구 (글자는 화면 위 DOM — ui/endingUi.ts) → 검은 화면
    this.at(ENDING_TITLE_AT, () => {
      this.sceneNo = 9;
      sound.duckEnding(false);
      bus.emit(EV.endingPhase, 'title');
    });
    this.at(ENDING_CREDITS_AT, () => {
      bus.emit(EV.endingPhase, 'credits');
      this.tweens.add({ targets: this.dim, alpha: 0.6, duration: 2000 });
    });
    this.at(ENDING_FINAL_AT, () => bus.emit(EV.endingPhase, 'final'));
    this.at(ENDING_BLACK_AT - 4, () => sound.fadeOutEnding(7));
    this.at(ENDING_BLACK_AT, () => {
      bus.emit(EV.endingPhase, 'black');
      this.tweens.add({ targets: this.dim, alpha: 1, duration: 3000, ease: 'Sine.InOut' });
    });
    this.at(ENDING_THE_END_AT, () => bus.emit(EV.endingTheEnd));
  }

  // ───────────────────────── SCENE 02 회상 (게임 배경 + 성장 단계 스프라이트) ─────────────────────────

  private startMemories(total: number): void {
    const stages: GonaStage[] = ['newborn', 'crawler', 'walker', 'bigbaby'];
    const each = total / stages.length;
    stages.forEach((st, i) => this.at(this.t + 0.1 + i * each, () => this.showMemory(st, each)));
  }

  private showMemory(st: GonaStage, dur: number): void {
    const cam = this.cameras.main;
    const view = cam.worldView;
    const z = cam.zoom;
    const W = this.scale.width;
    const H = this.scale.height;
    // 카드 크기 (화면 픽셀): 세로 = 폭 86% · 높이 30% / 가로 = 폭 62% · 높이 58%
    const cw = (this.portrait ? W * 0.86 : W * 0.62) / z;
    const ch = (this.portrait ? H * 0.3 : H * 0.58) / z;
    const cx = view.x + view.width / 2;
    const cy = view.y + (this.portrait ? view.height * 0.4 : view.height * 0.55);
    const prev = this.memory;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const frameR = this.add.rectangle(cx, cy, cw + 4 / z * 3, ch + 4 / z * 3, 0xf6e4c0, 1).setDepth(320).setAlpha(0);
    objs.push(frameR);
    // 게임 속 배경(숲길): 부드럽게 줄이지 않고 배경 도트 1칸 = 반 칸(0.5)으로 그대로 — 가족 도트와 같은 밀도.
    // 카드 땅 높이에 게임 땅 줄(GAME_BG.groundRow)이 오도록 맞추고 옆으로 흘려 보냄
    const groundY = cy + ch * 0.36;
    if (this.textures.exists('bg-image')) {
      const bg = this.add
        .tileSprite(cx, cy, Math.ceil(cw * 2), Math.ceil(ch * 2), 'bg-image')
        .setScale(0.5)
        .setDepth(321)
        .setAlpha(0);
      bg.tilePositionY = GAME_BG.groundRow - (groundY - (cy - ch / 2)) * 2;
      objs.push(bg);
      // 회상 느낌: 살짝 따뜻하게 (색 덮개 — 흐리게 하지 않음)
      const warm = this.add.rectangle(cx, cy, cw, ch, 0xffd6aa, 0.16).setDepth(321.5).setAlpha(0);
      objs.push(warm);
      this.tweens.add({ targets: bg, tilePositionX: 520, duration: dur * 1000 + 800, ease: 'Linear' });
    }
    // 성장 단계 고나 (게임 원본 스프라이트) — 카드 아래쪽 땅 위에서 그 단계의 움직임
    const key = st === 'walker' ? 'dino' : `dino-stage-${st}`;
    const frames = st === 'newborn' ? [0, 1] : st === 'crawler' ? [0, 1] : st === 'walker' ? [1, 2, 3, 4] : [1, 0, 2, 0];
    const sp = this.add.sprite(cx - cw * 0.12, groundY, key, frames[0]).setOrigin(0.5, 1).setDepth(323).setAlpha(0);
    objs.push(sp);
    let k = 0;
    const tick = this.time.addEvent({
      delay: st === 'walker' ? 110 : st === 'bigbaby' ? 210 : 260,
      loop: true,
      callback: () => {
        k = (k + 1) % frames.length;
        if (sp.active) sp.setFrame(frames[k]);
      },
    });
    objs.push({ destroy: () => tick.remove(false) } as unknown as Phaser.GameObjects.GameObject);
    if (st === 'walker' || st === 'bigbaby') this.tweens.add({ targets: sp, y: groundY - 2, duration: 140, yoyo: true, repeat: -1 });
    // 간식이 지나감 (게임 속 간식 그림)
    const snackKey = ['snack-strawberry', 'snack-cookie', 'snack-banana', 'snack-strawberry'][['newborn', 'crawler', 'walker', 'bigbaby'].indexOf(st)];
    if (this.textures.exists(snackKey)) {
      const sn = this.add.image(cx + cw * 0.45, groundY - 14, snackKey).setDepth(322).setAlpha(0);
      objs.push(sn);
      this.tweens.add({ targets: sn, x: cx - cw * 0.3, duration: dur * 1000 + 600, ease: 'Linear' });
    }
    // 단계 글자 (작게)
    const label = ['1단계', '2단계', '3단계', '4단계'][['newborn', 'crawler', 'walker', 'bigbaby'].indexOf(st)];
    const lt = this.add
      .text(cx - cw / 2 + 4 / z * 3, cy - ch / 2 + 3 / z * 3, label, { fontFamily: 'Galmuri11, monospace', fontSize: '24px', color: '#fff6e0', stroke: '#5a3418', strokeThickness: 6 })
      .setScale(1 / z)
      .setDepth(324)
      .setAlpha(0);
    objs.push(lt);
    this.memory = objs;
    const vis = objs.filter((o) => 'alpha' in o) as unknown as Phaser.GameObjects.Components.Alpha[];
    this.tweens.add({ targets: vis, alpha: 1, duration: 420, ease: 'Sine.Out' });
    if (prev.length) this.fadeAndDestroy(prev);
  }

  private fadeAndDestroy(list: Phaser.GameObjects.GameObject[]): void {
    const vis = list.filter((o) => 'alpha' in o) as unknown as Phaser.GameObjects.Components.Alpha[];
    this.tweens.add({ targets: vis, alpha: 0, duration: 420, onComplete: () => list.forEach((o) => o.destroy()) });
  }

  private clearMemories(): void {
    this.memory.forEach((o) => o.destroy());
    this.memory = [];
  }

  // ───────────────────────── 작은 효과 ─────────────────────────

  private hop(px: number): void {
    this.tweens.add({ targets: this, gy: this.gy - px, duration: 140, yoyo: true, ease: 'Sine.Out' });
  }

  private heart(x: number, y: number, scale = 1): void {
    const h = this.add.image(x, y, 'end-heart').setDepth(500).setScale(scale).setAlpha(0.9);
    this.tweens.add({ targets: h, y: y - 10, alpha: 0, duration: 1600, ease: 'Sine.Out', onComplete: () => h.destroy() });
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
    const t = this.add.image(x, y, key).setDepth(510).setScale(0.5);
    this.tweens.add({ targets: t, y: y - 6, alpha: 0, duration: 1300, delay: 500, onComplete: () => t.destroy() });
  }

  // ───────────────────────── 매 프레임 ─────────────────────────

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 250) / 1000;
    this.t = Math.min(this.t + dt, this.holdAt);
    for (const c of this.cues) {
      if (!c.done && this.t >= c.at) {
        c.done = true;
        this.cueLate = this.t - c.at;
        c.fn();
      }
    }
    this.wiggle = Math.max(0, this.wiggle - dt);
    this.gsq += (1 - this.gsq) * Math.min(1, dt * 6);
    this.updateGona(dt);
    // 가족이 나타난 뒤에는 늘 또렷하게 (빨리 감기로 장면을 건너뛰어도 반투명으로 남지 않게)
    const revealed = this.t > ENDING_SCENES[2] + 3.6;
    for (const f of this.family) {
      if (revealed && f.s.visible && f.s.alpha < 1) f.s.setAlpha(Math.min(1, f.s.alpha + dt * 1.5));
      const b = f.bob ? Math.round(Math.sin((this.t + f.phase) * 3.2) * f.bob) : 0;
      f.s.setPosition(Math.round(f.x + f.lean.x), Math.round(f.y + f.lean.y - Math.max(0, b)));
    }
  }

  private updateGona(dt: number): void {
    const g = this.gona;
    if (this.gMode === 'hide') {
      if (g.visible) g.setVisible(false);
      return;
    }
    if (!g.visible) g.setVisible(true);
    const st = this.gStage;
    let key = st === 'walker' ? 'dino' : `dino-stage-${st}`;
    let frame = 0;
    let bounce = 0;
    const t = this.t;
    switch (this.gMode) {
      case 'idle':
      case 'look':
        // 아기: 꼬물(1)·깜빡(2) / 큰 고나: 서기, 가끔 깜빡이는 대신 웃는 얼굴
        if (st === 'newborn') frame = this.gMode === 'look' ? (t % 2.6 < 0.16 ? 2 : Math.floor(t / 0.9) % 2) : t % 3 < 0.16 ? 2 : 0;
        else frame = 0;
        break;
      case 'wow':
        if (this.textures.exists(`wow-${st}`)) key = `wow-${st}`;
        break;
      case 'happy':
      case 'held':
        if (this.textures.exists(`happy-${st}`)) key = `happy-${st}`;
        frame = 0;
        break;
      case 'run':
        frame = st === 'bigbaby' ? [1, 0, 2, 0][Math.floor(t / 0.13) % 4] : 1 + (Math.floor(t * 9) % 4);
        bounce = Math.abs(Math.sin(t * 15)) * 1.5;
        if (Math.random() < dt * 10) this.dust.emitParticleAt(this.gx - 8, this.gy - 1);
        break;
      default:
        break;
    }
    if (g.texture.key !== key || g.frame.name !== String(frame)) g.setTexture(key, frame);
    const sy = this.gsq;
    g.setScale(2 - sy, sy);
    const wig = this.wiggle > 0 ? Math.round(Math.sin(t * 30) * 1) : 0;
    g.setPosition(Math.round(this.gx + wig), Math.round(this.gy - bounce));
    // 엄마 품에 안겼을 때: 엄마 앞(모은 손 위)
    g.setDepth(this.gMode === 'held' ? 170 : 180);
  }
}
