import Phaser from 'phaser';
import { CHARACTER_ASSET, GAME_BG, SNACK_ASSETS, type SnackKind } from '../config';
import { addCanvas, addSheet, buildAllTextures, buildDefaultDinoSheet, buildGround, snackCanvas, TEX } from '../art/textures';
import { DINO_BLINK, DINO_BLINK_PALETTE, DINO_FRAMES } from '../art/sprites';
import { mapToCanvas } from '../art/PixelCanvas';
import { cropHairTuft } from '../art/nest';
import { bus, EV } from '../events';
import { GROWTH_STAGES, STAGE_ASSETS, type GrowthStageDef, type GrowthStageId } from '../game/growth';
import { BOSSES } from '../game/boss';
import { MONSTERS } from '../game/monsters';

const CUSTOM_KEY = 'dino-custom-src';
const SNACK_KINDS: SnackKind[] = ['strawberry', 'banana', 'cookie', 'jelly'];
const SNACK_TEX: Record<SnackKind, string> = { strawberry: TEX.strawberry, banana: TEX.banana, cookie: TEX.cookie, jelly: TEX.jelly };
const snackSrcKey = (k: SnackKind): string => `snack-src-${k}`;

/** 타이틀 화면에 보낼 캐릭터 그림 */
export interface CharacterPreview {
  idle: HTMLCanvasElement;
  /** 눈 감은 프레임 (없으면 깜빡임 생략) */
  blink: HTMLCanvasElement | null;
  /** 간식 아이콘 (이미지가 있으면 이미지, 없으면 기본 도트) */
  snacks: Record<SnackKind, HTMLCanvasElement>;
  /** 오프닝 컷신용: 1단계 갓난아기 프레임들(대기·꿈틀·깜빡)과 머리카락만 잘라 낸 그림 */
  newborn: { frames: HTMLCanvasElement[]; blink: HTMLCanvasElement | null; hair: HTMLCanvasElement };
}

/** 캐릭터 프레임 정보 (GameScene 에서 사용) */
export interface CharacterInfo {
  frameCount: number;
  runFrames: number[];
  jumpFrame: number;
  idleFrame: number;
  /** 표정 프레임 (-1 = 없음) */
  happyFrame: number;
  surprisedFrame: number;
  frameWidth: number;
  frameHeight: number;
  scale: number;
  custom: boolean;
}

/** 성장 단계 하나의 실제 '모습' (그림·애니메이션·크기). 판정·조작은 GrowthStageDef 에 따로 있음 */
export interface StageVisual {
  id: GrowthStageId;
  texture: string;
  frameHeight: number;
  scale: number;
  runAnim: string;
  jumpAnim: string;
  runFrames: number[];
  jumpFrame: number;
  idleFrame: number;
  happyFrame: number;
  surprisedFrame: number;
  wiggleDeg: number;
  wiggleSpeed: number;
  bob: number;
  /** 'asset' = 단계 전용 PNG / 'sheet' = 기본 시트의 임시 애니메이션 / 'fallback' = 코드 그림 */
  source: 'asset' | 'sheet' | 'fallback';
}

const stageSrcKey = (id: GrowthStageId): string => `stage-src-${id}`;
const stageTexKey = (id: GrowthStageId): string => `dino-stage-${id}`;
/** 기본 시트에 성장용 포즈(9~12번)가 있어야 임시 애니메이션 사용 */
const SHEET_FRAMES_NEEDED = 13;

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    if (CHARACTER_ASSET.url) {
      // 파일이 없으면 조용히 기본 캐릭터로 대체
      this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, () => undefined);
      this.load.image(CUSTOM_KEY, CHARACTER_ASSET.url);
    }
    for (const k of SNACK_KINDS) if (SNACK_ASSETS[k]) this.load.image(snackSrcKey(k), SNACK_ASSETS[k]);
    if (GAME_BG.url) this.load.image(TEX.bgImage, GAME_BG.url);
    for (const st of GROWTH_STAGES) {
      const a = STAGE_ASSETS[st.id];
      if (a?.url) this.load.image(stageSrcKey(st.id), a.url);
    }
    // 엔딩 컷신 전용: 노을 마을 배경(가로·세로) · 대형 가족 시트 · 고나 타이틀 그림
    this.load.image('end-bg-land', 'assets/ending/bg-land.png');
    this.load.image('end-bg-port', 'assets/ending/bg-port.png');
    for (const id of ['mom', 'dad', 'aunt', 'uncle', 'grandma', 'grandpa']) {
      this.load.spritesheet(`endfam-${id}`, `assets/ending/family-${id}.png`, { frameWidth: 112, frameHeight: 144 });
      this.load.spritesheet(`endfam-${id}-arms`, `assets/ending/family-${id}-arms.png`, { frameWidth: 112, frameHeight: 144 });
    }
    for (const n of ['walk1', 'walk2', 'trot', 'surprise']) this.load.image(`end-gona-${n}`, `assets/title4/gona-${n}.png`);
    this.load.image('end-gona-laugh', 'assets/ending/gona-laugh.png');
    // 보스 정식 그림 (선택 — 없으면 코드 도트)
    for (const b of Object.values(BOSSES)) if (b.sheetUrl) this.load.image(`boss-src-${b.id}`, b.sheetUrl);
    // 일반 몬스터 정식 그림 (선택)
    for (const m of Object.values(MONSTERS)) this.load.image(`mon-src-${m.kind}`, m.sheetUrl);
  }

  create(): void {
    buildAllTextures(this);
    const snackIcons = this.setupSnacks();
    this.setupBackgroundGround();
    const info = this.setupCharacter();
    this.registry.set('character', info);
    const visuals = this.setupStageVisuals(info);
    this.registry.set('stageVisuals', visuals);

    this.anims.create({
      key: 'run',
      frames: info.runFrames.map((f) => ({ key: TEX.dino, frame: f })),
      frameRate: CHARACTER_ASSET.runFps,
      repeat: -1,
    });
    this.anims.create({
      key: 'jump',
      frames: [{ key: TEX.dino, frame: info.jumpFrame }],
      frameRate: 1,
    });

    // 엔딩 컷신: 해 주변의 둥근 빛 (한 번만 생성)
    if (!this.textures.exists('end-glow')) {
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      const g = c.getContext('2d')!;
      const gr = g.createRadialGradient(48, 48, 6, 48, 48, 48);
      gr.addColorStop(0, 'rgba(255,240,180,0.9)');
      gr.addColorStop(0.4, 'rgba(255,214,140,0.45)');
      gr.addColorStop(1, 'rgba(255,190,120,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 96, 96);
      this.textures.addCanvas('end-glow', c);
    }
    const preview: CharacterPreview = {
      idle: this.frameCanvas(info, Math.min(Math.max(0, CHARACTER_ASSET.titleFrame), info.frameCount - 1)),
      blink: info.custom
        ? CHARACTER_ASSET.blinkFrame >= 0 && CHARACTER_ASSET.blinkFrame < info.frameCount
          ? this.frameCanvas(info, CHARACTER_ASSET.blinkFrame)
          : null
        : mapToCanvas(DINO_BLINK, DINO_BLINK_PALETTE),
      snacks: snackIcons,
      newborn: this.newbornPreview(visuals.newborn),
    };
    bus.emit(EV.ready, preview);
    this.scene.start('Game');
    // 게임을 처음 열면 알 부화 시네마틱부터 (게임 장면 위에 겹쳐 그림)
    this.scene.launch('Opening');
  }

  /** 텍스처의 프레임 하나를 캔버스로 */
  private frameToCanvas(key: string, frame: number): HTMLCanvasElement {
    const f = this.textures.getFrame(key, frame);
    const c = document.createElement('canvas');
    c.width = f.cutWidth;
    c.height = f.cutHeight;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
    }
    return c;
  }

  private newbornPreview(v: StageVisual): CharacterPreview['newborn'] {
    const uniq = [...new Set(v.runFrames)];
    // 눈 감은 프레임: 전용 그림은 2번, 임시(기본 시트)는 11번
    const blinkFrame = v.source === 'asset' ? 2 : v.source === 'sheet' ? 11 : -1;
    const open = uniq.filter((f) => f !== blinkFrame);
    const frames = (open.length ? open : uniq).map((f) => this.frameToCanvas(v.texture, f));
    return {
      frames,
      blink: blinkFrame >= 0 && uniq.includes(blinkFrame) ? this.frameToCanvas(v.texture, blinkFrame) : null,
      hair: cropHairTuft(frames[0]),
    };
  }

  /** 성장 단계별 모습 준비: 전용 PNG → 기본 시트 임시 애니메이션 → 코드 그림 순서로 */
  private setupStageVisuals(info: CharacterInfo): Record<GrowthStageId, StageVisual> {
    const out = {} as Record<GrowthStageId, StageVisual>;
    for (const st of GROWTH_STAGES) {
      const v = this.resolveStage(st, info);
      this.anims.create({
        key: v.runAnim,
        frames: v.runFrames.map((f) => ({ key: v.texture, frame: f })),
        frameRate: st.anim.runFps,
        repeat: -1,
      });
      this.anims.create({ key: v.jumpAnim, frames: [{ key: v.texture, frame: v.jumpFrame }], frameRate: 1 });
      out[st.id] = v;
    }
    return out;
  }

  private resolveStage(st: GrowthStageDef, info: CharacterInfo): StageVisual {
    const base = {
      id: st.id,
      runAnim: `${st.id}-run`,
      jumpAnim: `${st.id}-jump`,
      wiggleDeg: st.anim.wiggleDeg,
      wiggleSpeed: st.anim.wiggleSpeed,
      bob: st.anim.bob,
    };
    // 1) 단계 전용 PNG
    const asset = STAGE_ASSETS[st.id];
    if (asset && this.textures.exists(stageSrcKey(st.id))) {
      const img = this.textures.get(stageSrcKey(st.id)).getSourceImage() as HTMLImageElement;
      const frames = Math.max(1, asset.frameCount);
      const fh = img.height;
      const count = addSheet(this, stageTexKey(st.id), img, Math.floor(img.width / frames), fh);
      const ok = (f: number | undefined, d: number): number => (f !== undefined && f >= 0 && f < count ? f : d);
      const run = (asset.anim.run ?? [0]).filter((f) => f < count);
      return {
        ...base,
        texture: stageTexKey(st.id),
        frameHeight: fh,
        // 1:1 도트 시트는 지정 배율(도트 크기 통일), 크기가 제각각인 그림은 기존 캐릭터 키에 맞춰
        scale: asset.scale ?? (CHARACTER_ASSET.displayHeight / fh) * (st.anim.scale / 1.2),
        runFrames: run.length ? run : [0],
        jumpFrame: ok(asset.anim.jump, 0),
        idleFrame: ok(asset.anim.idle, 0),
        happyFrame: ok(asset.anim.happy, -1),
        surprisedFrame: ok(asset.anim.surprised, -1),
        source: 'asset',
      };
    }
    // 2) 기본 dino.png 시트의 포즈로 만든 임시 애니메이션
    if (info.custom && info.frameCount >= SHEET_FRAMES_NEEDED) {
      const a = st.anim;
      return {
        ...base,
        texture: TEX.dino,
        frameHeight: info.frameHeight,
        scale: a.scale,
        runFrames: a.run,
        jumpFrame: a.jump,
        idleFrame: a.idle,
        happyFrame: a.happy,
        surprisedFrame: a.surprised,
        source: 'sheet',
      };
    }
    // 3) 그림 파일이 없거나 예전 시트: 기존 캐릭터 프레임을 단계별 크기만 달리해서
    const fallbackScale: Record<GrowthStageId, number> = { newborn: 0.8, crawler: 1, walker: 1, bigbaby: 1.4 };
    const k = info.custom ? info.scale / 1.2 : 1;
    return {
      ...base,
      texture: TEX.dino,
      frameHeight: info.frameHeight,
      scale: Math.round(fallbackScale[st.id] * k * 5) / 5,
      runFrames: info.runFrames,
      jumpFrame: info.jumpFrame,
      idleFrame: info.idleFrame,
      happyFrame: st.anim.happy >= 0 ? info.happyFrame : -1,
      surprisedFrame: st.anim.surprised >= 0 ? info.surprisedFrame : -1,
      source: 'fallback',
    };
  }

  /** 배경 이미지가 있으면 그 풀밭 색으로 땅 풀 색을 맞춘 땅 텍스처를 따로 만듦 */
  private setupBackgroundGround(): void {
    if (!this.textures.exists(TEX.bgImage)) return;
    const img = this.textures.get(TEX.bgImage).getSourceImage() as HTMLImageElement;
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    // 지면과 맞닿는 줄 바로 위 풀밭(가운데 쪽)에서 초록 계열 색의 중앙값
    const y0 = Math.max(0, GAME_BG.groundRow - 14);
    const data = ctx.getImageData(Math.floor(img.width * 0.15), y0, Math.floor(img.width * 0.7), 14).data;
    const rs: number[] = [];
    const gs: number[] = [];
    const bs: number[] = [];
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if (g > b + 50 && g >= r * 0.85 && g > 120) {
        rs.push(r);
        gs.push(g);
        bs.push(b);
      }
    }
    if (rs.length < 50) return;
    const med = (a: number[]): number => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const base = [med(rs), med(gs), med(bs)];
    const toHex = (v: number[]): string => `#${v.map((n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')).join('')}`;
    addCanvas(
      this,
      TEX.groundImg,
      buildGround({
        grass: toHex(base),
        grassDark: toHex(base.map((n) => n * 0.72)),
        grassLight: toHex(base.map((n) => n + (255 - n) * 0.35)),
      }),
    );
  }

  /** 간식 이미지가 있으면 기본 도트 간식 텍스처를 이미지로 교체 */
  private setupSnacks(): Record<SnackKind, HTMLCanvasElement> {
    const icons = {} as Record<SnackKind, HTMLCanvasElement>;
    for (const k of SNACK_KINDS) {
      const src = snackSrcKey(k);
      if (this.textures.exists(src)) {
        const img = this.textures.get(src).getSourceImage() as HTMLImageElement;
        this.textures.remove(SNACK_TEX[k]);
        this.textures.addImage(SNACK_TEX[k], img);
        // Phaser 가 쓰고 난 임시 주소(blob)는 사라지므로 캔버스로 복사해서 전달
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        c.getContext('2d')?.drawImage(img, 0, 0);
        icons[k] = c;
      } else {
        icons[k] = snackCanvas(k);
      }
    }
    return icons;
  }

  private setupCharacter(): CharacterInfo {
    if (this.textures.exists(CUSTOM_KEY)) {
      const img = this.textures.get(CUSTOM_KEY).getSourceImage() as HTMLImageElement;
      const frames = Math.max(1, Math.floor(CHARACTER_ASSET.frameCount));
      const fh = img.height;
      const fw = Math.floor(img.width / frames);
      const count = addSheet(this, TEX.dino, img, fw, fh);
      const run = CHARACTER_ASSET.runFrames.filter((f) => f < count);
      return {
        frameCount: count,
        runFrames: run.length ? run : [0],
        jumpFrame: CHARACTER_ASSET.jumpFrame < count ? CHARACTER_ASSET.jumpFrame : 0,
        idleFrame: CHARACTER_ASSET.idleFrame < count ? CHARACTER_ASSET.idleFrame : 0,
        happyFrame: CHARACTER_ASSET.happyFrame < count ? CHARACTER_ASSET.happyFrame : -1,
        surprisedFrame: CHARACTER_ASSET.surprisedFrame < count ? CHARACTER_ASSET.surprisedFrame : -1,
        frameWidth: fw,
        frameHeight: fh,
        scale: CHARACTER_ASSET.displayScale ?? CHARACTER_ASSET.displayHeight / fh,
        custom: true,
      };
    }
    const fw = DINO_FRAMES[0][0].length;
    const fh = DINO_FRAMES[0].length;
    const count = addSheet(this, TEX.dino, buildDefaultDinoSheet(), fw, fh);
    return {
      frameCount: count,
      runFrames: [0, 1],
      jumpFrame: 2,
      idleFrame: 0,
      happyFrame: -1,
      surprisedFrame: -1,
      frameWidth: fw,
      frameHeight: fh,
      scale: 1, // 기본 캐릭터는 원래 크기(24px) 그대로
      custom: false,
    };
  }

  /** 시트에서 프레임 하나를 잘라 캔버스로 (타이틀 화면용) */
  private frameCanvas(info: CharacterInfo, frame: number): HTMLCanvasElement {
    const src = this.textures.get(TEX.dino).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const c = document.createElement('canvas');
    c.width = info.frameWidth;
    c.height = info.frameHeight;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      const cols = Math.max(1, Math.floor(src.width / info.frameWidth));
      const sx = (frame % cols) * info.frameWidth;
      const sy = Math.floor(frame / cols) * info.frameHeight;
      ctx.drawImage(src, sx, sy, info.frameWidth, info.frameHeight, 0, 0, info.frameWidth, info.frameHeight);
    }
    return c;
  }
}
