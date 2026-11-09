/**
 * 가족 엔딩 컷신 — 8장면 (약 2분) → 타이틀 → 크레딧 → 마지막 문구 → 검은 화면
 *
 * 그림 원칙
 *   - 고나·가족 여섯 명: 최종 확정 엔딩 캐릭터 스프라이트 시트(art-src/ending/sprite-sheet/ending-characters-sheet.webp)에서
 *     tools/extract_ending_sprites.py 로 동작별 프레임을 투명 PNG 로 떼어 낸 것 그대로 (새로 그리거나 고쳐 그리지 않음).
 *     인물마다 독립 스프라이트 — 기본·걷기·달리기·기쁨·말하기·손 흔들기·포옹·뽀뽀·킁카 프레임 애니메이션을 장면마다 따로 움직임.
 *     시트 1px = 배경 1도트 (모두 같은 배율 1 · nearest · 가로세로 같은 배율). 좌우 반전(고나를 바라보게)만 함.
 *   - 장면 01·02(아기·성장 회상)의 고나: 게임 성장 1~4단계 원본 스프라이트 그대로. 장면 03부터: 시트의 고나.
 *   - 배경: 해 질 녘 보랏빛 버섯마을(엔딩 배경) + 은은한 가로등 불빛·꽃잎·반딧불·별빛.
 * 내레이션: 자막(한 글자씩)으로만 — 문장은 사용자가 준 그대로. 자막이 나오는 동안 엔딩 곡을 살짝 낮춤.
 * 음악: 엔딩 전용 오리지널 곡 bgm-ending.mp3 (tools/compose_ending_bgm.cjs) 한 곡이 장면 전환과 상관없이 이어짐.
 */
import Phaser from 'phaser';
import { bus, EV } from '../events';
import { sound } from '../audio';
import { perf } from '../perf';
import { GAME_BG } from '../config';
import { ENDING_V3 } from './endingSpritesV3';

/** 캐릭터 띠 표 — 최종 엔딩 캐릭터 시트(3차, 원래 도트 크기로 복원 · tools/extract_ending_npc.py) */
type EndingCharId = 'gona' | 'imo' | 'samchon' | 'mom' | 'dad' | 'halmeoni' | 'halabeoji';
type CharSheet = { file: string; w: number; h: number; anims: Record<string, readonly number[]> };
const CHARS = ENDING_V3 as unknown as Record<EndingCharId, CharSheet>;
/** 두 사람이 함께 그려진 접촉 동작 (시트에서 작게 그려진 그림 — 클로즈업 장면에서만, 다른 인물과 섞지 않음)
 *  재생 순서는 시트의 프레임 중 두 사람이 함께 있는 것만 (상대만 혼자 있는 프레임은 고나가 사라져 보여 뺌) */
type SpecialId = 'mom_hug' | 'grandma_kiss' | 'uncle_sniff';
const SPECIALS: SpecialId[] = ['mom_hug', 'grandma_kiss', 'uncle_sniff'];
const SP_KEY = (id: SpecialId): string => `esp-${id}`;
const SP_ORDER: Record<SpecialId, number[]> = { mom_hug: [1, 3, 4], grandma_kiss: [1, 2, 3], uncle_sniff: [0, 1, 2, 3] };

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

const CH_KEY = (id: EndingCharId): string => `ech-${id}`;

interface Layout {
  bg: string;
  W: number;
  H: number;
  c: number;
  lamps: [number, number][];
  /** 가족이 서는 곳 (가운데 기준 x, 줄 0 앞·1 뒤) — 단체 사진. 얼굴끼리 겹치지 않게:
   *  세로 = 앞줄(이모·엄마·할머니) + 고나, 뒷줄(아빠·삼촌·할아버지)은 얼굴이 앞사람 머리 위로 다 보이게 올려 세움
   *  가로 = 한 줄 (아무도 겹치지 않음). 엄마는 고나 바로 오른쪽 (포옹) */
  photo: Record<FamId, [number, 0 | 1]>;
  /** 단체 사진에서 고나 자리 */
  gonaX: number;
}

const LAYOUTS: Record<'land' | 'port', Layout> = {
  land: {
    bg: 'end-bgB-land',
    W: 320,
    H: 180,
    c: 160,
    lamps: [[94, 41], [237, 41]],
    photo: { halmeoni: [-84, 0], samchon: [-58, 0], mom: [-32, 0], imo: [22, 0], dad: [48, 0], halabeoji: [74, 0] },
    gonaX: -5,
  },
  port: {
    bg: 'end-bgB-port',
    W: 180,
    H: 320,
    c: 92,
    lamps: [[15, 116], [163, 116]],
    photo: { halmeoni: [-63, 0], samchon: [-42, 0], mom: [-21, 0], imo: [25, 0], dad: [46, 0], halabeoji: [67, 0] },
    gonaX: 2,
  },
};
const ROW_DY = [0, -24];
const ROW_DEPTH = [160, 120];
/** 동작별 초당 프레임 · 반복 (-1 = 계속, 0 = 한 번 하고 마지막 프레임에 멈춤) */
const ACT_RATE: Record<string, [number, number]> = {
  idle: [2.2, -1], walk: [7, -1], run: [10, -1], happy: [5, -1], talk: [5, -1], wave: [5, -1], clap: [6, -1],
  open_arms: [4, 0], receive_kiss: [4, -1], tickle: [6, -1], smile: [2, -1],
  hug: [5, 0], kiss: [3.5, 0], sniff: [6, -1], wow: [7, 0], held: [4, 0], sit: [2, -1],
};

interface Member {
  id: FamId;
  s: Phaser.GameObjects.Sprite;
  act: string;
  x: number;
  y: number;
  row: 0 | 1 | 2;
  /** 들썩임 세기 (0 = 가만히) */
  bob: number;
  phase: number;
  lean: { x: number; y: number };
}

/** 엔딩 캐릭터 띠·이펙트 불러오기 (이미 있으면 건너뜀) — 최종 보스전 때 GameScene 이 미리, 아니면 엔딩 preload 에서 */
export function queueEndingArt(scene: Phaser.Scene): number {
  let n = 0;
  for (const id of Object.keys(CHARS) as EndingCharId[]) {
    const key = CH_KEY(id);
    if (scene.textures.exists(key)) continue;
    const t = CHARS[id];
    scene.load.spritesheet(key, `assets/ending/chars/${t.file}.png`, { frameWidth: t.w, frameHeight: t.h });
    n++;
  }
  for (const id of SPECIALS) {
    if (scene.textures.exists(SP_KEY(id))) continue;
    const t = (ENDING_V3 as unknown as Record<SpecialId, CharSheet>)[id];
    scene.load.spritesheet(SP_KEY(id), `assets/ending/chars/${t.file}.png`, { frameWidth: t.w, frameHeight: t.h });
    n++;
  }
  return n;
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
  /** 장면 03부터의 고나 (엔딩 시트) */
  private gk!: Phaser.GameObjects.Sprite;
  private useSheet = false;
  /** 두 사람 접촉 동작 (재생 중엔 고나·상대 단독 그림을 숨김) */
  private sp!: Phaser.GameObjects.Sprite;
  /** 클로즈업 삽입 장면 (작게 그려진 동작 그림만 보임 — 큰 인물 그림은 숨김) */
  private insert = false;
  private ins!: Phaser.GameObjects.Sprite;
  private gAct = '';
  gx = 0;
  gy = 0;
  private gStage: GonaStage = 'newborn';
  private gMode: 'idle' | 'look' | 'walk' | 'run' | 'happy' | 'wow' | 'held' | 'hide' | 'open_arms' | 'receive_kiss' | 'tickle' = 'idle';
  private lastGx = 0;
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
    queueEndingArt(this);
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
    this.makeAnims();
    // 가족 (처음엔 숨김 — SCENE 03 에서 길 끝에 나타남) — 인물마다 독립 스프라이트
    for (const id of ENDING_FAMILY) {
      const [dx, row] = L.photo[id];
      const x = L.c + dx;
      const y = this.gF + ROW_DY[row];
      const s = this.add.sprite(x, y, CH_KEY(id), 0).setOrigin(0.5, 1).setDepth(ROW_DEPTH[row]).setVisible(false);
      const f: Member = { id, s, act: '', x, y, row, bob: 0, phase: Math.random() * 6, lean: { x: 0, y: 0 } };
      this.family.push(f);
      this.act(f, 'idle');
    }
    this.gk = this.add.sprite(0, 0, CH_KEY('gona'), 0).setOrigin(0.5, 1).setDepth(180).setVisible(false).setFlipX(true);
    this.sp = this.add.sprite(0, 0, SP_KEY('mom_hug'), 0).setOrigin(0.5, 1).setDepth(182).setVisible(false);
    this.ins = this.add.sprite(0, 0, CH_KEY('mom'), 0).setOrigin(0.5, 1).setDepth(181).setVisible(false);
    this.insert = false;
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

  /** 시트 프레임 → 동작 애니메이션 (게임 전체에서 한 번만) */
  private makeAnims(): void {
    for (const id of SPECIALS) {
      const key = SP_KEY(id);
      if (this.anims.exists(key) || !this.textures.exists(key)) continue;
      this.anims.create({ key, frames: this.anims.generateFrameNumbers(key, { frames: SP_ORDER[id] }), frameRate: 1.6, repeat: 0 });
    }
    for (const id of Object.keys(CHARS) as EndingCharId[]) {
      const anims = CHARS[id].anims;
      for (const [act, frames] of Object.entries(anims)) {
        const key = `${CH_KEY(id)}-${act}`;
        if (this.anims.exists(key) || !this.textures.exists(CH_KEY(id))) continue;
        const [rate, repeat] = ACT_RATE[act] ?? [5, -1];
        this.anims.create({ key, frames: this.anims.generateFrameNumbers(CH_KEY(id), { frames: [...frames] }), frameRate: rate, repeat });
      }
    }
  }

  /** 가족 한 사람의 동작 바꾸기 (같은 동작이면 그대로 이어 감) */
  private act(f: Member, act: string): void {
    // 그 사람에게 없는 동작이면 비슷한 동작으로 (2차 시트 엄마엔 손 모으기가 없음 등)
    const has = (a: string): boolean => this.anims.exists(`${CH_KEY(f.id)}-${a}`);
    const a = has(act) ? act : act === 'clap' || act === 'wave' ? (has('happy') ? 'happy' : 'idle') : 'idle';
    if (f.act === a) return;
    f.act = a;
    f.s.play({ key: `${CH_KEY(f.id)}-${a}`, startFrame: 0 });
  }

  /** 클로즈업 삽입 장면 켜기/끄기 */
  private setInsert(on: boolean): void {
    this.insert = on;
    this.sp.setVisible(false).stop();
    this.ins.setVisible(false).stop();
  }

  /** 두 사람 접촉 동작 (시트 프레임 그대로, 순서대로 한 번) */
  private special(id: SpecialId, x: number, y: number): void {
    this.ins.setVisible(false).stop();
    this.sp.setPosition(Math.round(x), Math.round(y)).setVisible(true).play({ key: SP_KEY(id), startFrame: 0 });
  }

  /** 시트 이펙트 (하트·킁카 물결·반짝이) 를 잠깐 띄움 */
  private fx(name: string, x: number, y: number, rise = 10, ms = 1300, delay = 0, scale = 1): void {
    // 하트만 (게임 안에서 만든 도트 하트 'end-heart') — 예전 시트 아이콘은 쓰지 않음
    if (name !== 'heart' || !this.textures.exists('end-heart')) return;
    const im = this.add.image(Math.round(x), Math.round(y), 'end-heart').setDepth(500).setAlpha(0).setScale(scale);
    this.tweens.add({ targets: im, alpha: 1, duration: 160, delay });
    this.tweens.add({ targets: im, y: y - rise, duration: ms, delay, ease: 'Sine.Out' });
    this.tweens.add({ targets: im, alpha: 0, duration: 380, delay: delay + ms - 380, onComplete: () => im.destroy() });
  }


  /** 다음 대사로 (엔딩 '다음 ▶' 버튼): 다음 문장이 시작하는 시각으로 건너뜀 · 마지막 문장 뒤면 타이틀·크레딧으로.
   *  건너뛴 사이의 장면 연출은 바로 적용되고(빨리 감기와 같음), 엔딩 곡도 같은 위치로 옮김 (곡은 하나만) */
  nextLine(): boolean {
    if (this.t >= ENDING_TITLE_AT - 0.05) return false;
    const next = ENDING_LINES.find((l) => l.at > this.t + 0.05);
    const target = next ? next.at : ENDING_TITLE_AT;
    this.t = target - 0.02;
    sound.seekEnding(this.t);
    return true;
  }

  private setStage(st: GonaStage): void {
    this.gStage = st;
    const key = st === 'walker' ? 'dino' : `dino-stage-${st}`;
    if (this.textures.exists(key)) this.gona.setTexture(key, 0);
  }

  private buildCues(): void {
    const L = this.L;
    const Z0 = this.Z0;
    // 클로즈업 배율 (모두 정수): 뽀뽀·킁카 둘만 가까이 = 약 1.6배 · 고나 얼굴 = 약 2.2배
    const ZC = Math.max(Z0 + 1, Math.round(Z0 * 1.6));
    const ZF = Math.max(ZC + 1, Math.round(Z0 * 2.2));
    // 단체 사진 자리 · 화면 가운데(가족 전체의 가운데)
    const GX = L.c + L.gonaX;
    const GY = this.gF + 3;
    const CX = L.c + (this.portrait ? -4 : -9);
    const P = (id: FamId): [number, number] => [L.c + L.photo[id][0], this.gF + ROW_DY[L.photo[id][1]]];
    const photo = (): void => {
      for (const f of this.family) {
        const [x, y] = P(f.id);
        this.tweens.killTweensOf(f);
        f.x = x;
        f.y = y;
        f.s.setDepth(ROW_DEPTH[0]);
      }
    };
    // 클로즈업 삽입 장면 자리 (돌길 앞쪽) · 배율 = 넓은 장면의 3배 (작게 그려진 그림을 가까이)
    const IX = L.c;
    const IY = this.gF + (this.portrait ? 34 : 18);
    const ZI = Z0 * 3;
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
        this.startMemories(s3 - s2 - 0.6, s2);
      }, 700);
    });

    // ── SCENE 03 기다리고 있던 얼굴들: 고나 뒤(오른쪽)에서 → 카메라가 물러나며 길 끝(왼쪽)에서 기다리는 가족 여섯 명
    this.at(s3, () => {
      this.sceneNo = 3;
      this.softCut(() => {
        this.clearMemories();
        this.dim.setAlpha(0);
        this.useSheet = true;
        this.gx = this.portrait ? L.c + 64 : L.c + 130;
        this.gy = this.gNear;
        this.gMode = 'idle';
        photo();
        for (const f of this.family) {
          f.s.setVisible(true).setAlpha(0);
          f.bob = 0;
          this.act(f, 'idle');
        }
        this.frame(this.gx - 10, this.gNear, Z0 * 2, 0);
      }, 700);
    });
    this.at(s3 + 1.6, () => {
      this.frame(CX, this.gNear, Z0, 4.5);
      this.tweens.add({ targets: this.family.map((f) => f.s), alpha: 1, duration: 1600, delay: 900, ease: 'Sine.Out' });
    });

    // ── SCENE 04 달려가는 고나: (달리기 프레임 없음 → 미끄러지게 옮기지 않고 장면 전환으로) 가족 곁에 도착
    this.at(s4, () => {
      this.sceneNo = 4;
      this.softCut(() => {
        this.tweens.killTweensOf(this);
        this.gx = GX;
        this.gy = GY;
        this.frame(CX, this.gF, Z0, 0);
      }, 700);
    });
    this.at(s4 + 2.2, () => this.fx('heart', GX, GY - 40, 10, 1600, 0, 0.6));

    // ── SCENE 05 가족의 품 (클로즈업): 엄마가 걸어와(걷기 4) 두 팔을 벌리고(3) → 고나를 안아 올림 (포옹 프레임)
    this.at(s5, () => {
      this.sceneNo = 5;
      this.softCut(() => {
        this.setInsert(true);
        this.ins.setPosition(IX - 26, IY).setFlipX(false).setVisible(true).play(`${CH_KEY('mom')}-walk`);
        this.tweens.add({ targets: this.ins, x: IX - 4, duration: 1500, ease: 'Linear', onComplete: () => this.ins.play(`${CH_KEY('mom')}-open_arms`) });
        this.frame(IX, IY, ZI, 0);
      }, 700);
    });
    this.at(s5 + 3.0, () => this.special('mom_hug', IX, IY));
    this.at(s5 + 5.2, () => this.fx('heart', IX + 2, IY - 27, 6, 1600, 0, 0.35));

    // ── SCENE 06 뽀뽀와 킁카 (클로즈업): ① 할머니 뽀뽀 프레임 ② 삼촌 킁카 프레임
    this.at(s6, () => {
      this.sceneNo = 6;
      this.softCut(() => {
        this.setInsert(true);
        this.special('grandma_kiss', IX, IY);
        this.frame(IX, IY, ZI, 0);
      });
    });
    this.at(s6 + 1.6, () => {
      sound.smooch();
      this.float('쪽', IX + 10, IY - 24, '#ffb3cf');
    });
    this.at(s6 + 6.3, () => this.softCut(() => this.special('uncle_sniff', IX, IY)));
    this.at(s6 + 7.9, () => {
      sound.inhale();
      this.float('킁킁', IX + 12, IY - 26, '#e8f4c0');
    });

    // ── SCENE 07 고나의 깨달음: 가족 곁의 고나를 천천히 가까이 · 노을빛
    this.at(s7, () => {
      this.sceneNo = 7;
      this.softCut(() => {
        this.setInsert(false);
        photo();
        this.gx = GX;
        this.gy = GY;
        this.frame(GX, this.gF, ZC, 0);
      }, 800);
    });
    this.at(s7 + 0.6, () => {
      this.shot(GX, GY - 18, ZF, 5.2);
      this.tweens.add({ targets: this.glow, alpha: 0.16, duration: 2400, ease: 'Sine.InOut' });
    });

    // ── SCENE 08 마지막 가족사진: 가족 여섯 명과 고나 모두 → 아주 천천히 멀어짐 → 타이틀로
    this.at(s8, () => {
      this.sceneNo = 8;
      this.tweens.add({ targets: this.glow, alpha: 0.06, duration: 3000 });
      this.frame(CX, this.gF, ZC, 1.6);
    });
    this.at(s8 + 2.0, () => this.frame(CX, this.gF, Z0, ENDING_TITLE_AT - s8 - 2.4));
    this.at(s8 + 4.0, () => this.fx('heart', GX - 20, GY - 52, 10, 1600, 0, 0.6));
    this.at(s8 + 6.5, () => this.fx('heart', GX + 24, GY - 54, 10, 1600, 0, 0.6));
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

  private startMemories(total: number, base: number): void {
    const stages: GonaStage[] = ['newborn', 'crawler', 'walker', 'bigbaby'];
    const each = total / stages.length;
    // 장면 02 시작 기준 시각 (빨리 감기로 늦게 불려도 뒤 장면에 회상 카드가 남지 않게) · 장면 02 가 아니면 안 띄움
    stages.forEach((st, i) => this.at(base + 0.1 + i * each, () => this.sceneNo === 2 && this.showMemory(st, each)));
  }

  /** frame(x, ground, z) 로 잡히는 화면 영역 (카메라가 아직 옮겨 가는 중이어도 같은 값) */
  private viewOf(x: number, ground: number, z: number): { x: number; y: number; width: number; height: number } {
    const L = this.L;
    const vw = this.scale.width / z;
    const vh = this.scale.height / z;
    const at = this.portrait ? 0.7 : z > this.Z0 ? 0.99 : 0.9;
    const cx = Phaser.Math.Clamp(x, vw / 2, L.W - vw / 2);
    const cy = Phaser.Math.Clamp(ground - vh * at + vh / 2, vh / 2, L.H - vh / 2);
    return { x: cx - vw / 2, y: cy - vh / 2, width: vw, height: vh };
  }

  private showMemory(st: GonaStage, dur: number): void {
    // 회상 카드 1~4단계: 언제나 같은 자리·크기 (장면 02 의 고정 구도 기준 — 카메라 이동·자막 길이와 상관없음)
    const z = this.Z0;
    const view = this.viewOf(this.L.c, this.gNear, z);
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
    // 게임 속 배경(숲길): 부드럽게 줄이지 않고 배경 도트 1칸 = 반 칸(0.5)으로 그대로 (흐린 축소 없음).
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
      if (this.useSheet) f.s.setVisible(!this.insert);
      if (revealed && f.s.visible && f.s.alpha < 1) f.s.setAlpha(Math.min(1, f.s.alpha + dt * 1.5));
      const b = f.bob ? Math.round(Math.sin((this.t + f.phase) * 3.2) * f.bob) : 0;
      const nx = Math.round(f.x + f.lean.x);
      // 바라보는 쪽: 걸을 때는 가는 쪽, 서 있을 때는 고나 쪽 (시트 그림은 오른쪽을 봄 → 왼쪽은 좌우 반전만)
      if (f.act === 'walk') {
        if (nx !== Math.round(f.s.x)) f.s.setFlipX(nx < f.s.x);
      } else if (this.useSheet) f.s.setFlipX(f.x > this.gx + 2);
      f.s.setPosition(nx, Math.round(f.y + f.lean.y - Math.max(0, b)));
    }
  }

  private updateGona(dt: number): void {
    const g = this.gona;
    if (this.useSheet) {
      // 장면 03부터: 엔딩 시트의 고나 — 동작별 프레임 애니메이션
      if (g.visible) g.setVisible(false);
      const k = this.gk;
      if (!k.visible) k.setVisible(true);
      const act = this.gMode === 'hide' ? '' : this.gMode === 'look' ? 'idle' : this.gMode === 'wow' ? 'happy' : this.gMode === 'held' ? 'open_arms' : this.gMode;
      if (act && act !== this.gAct) {
        this.gAct = act;
        const key = `${CH_KEY('gona')}-${act}`;
        if (this.anims.exists(key)) k.play({ key, startFrame: 0 });
      }
      // 접촉 동작 중엔 두 사람 그림이 고나를 그림
      k.setVisible(this.gMode !== 'hide' && !this.insert);
      // 달리기: 실제 이동 속도에 맞춰 발걸음 빠르기 (가까워지며 감속하면 발도 느려짐) · 발밑 먼지(뒤쪽 = 오른쪽)
      const speed = dt > 0 ? Math.abs(this.gx - this.lastGx) / dt : 0;
      this.lastGx = this.gx;
      if (this.gMode === 'run') {
        k.anims.timeScale = Phaser.Math.Clamp(speed / 26, 0.35, 1.3);
        if (speed > 8 && Math.random() < dt * 10) this.dust.emitParticleAt(this.gx + 10, this.gy - 1);
      } else k.anims.timeScale = 1;
      k.setPosition(Math.round(this.gx), Math.round(this.gy));
      return;
    }
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
