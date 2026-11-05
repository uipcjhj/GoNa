import Phaser from 'phaser';
import { CHARACTER_ASSET, GAME_BG, SNACK_ASSETS, type SnackKind } from '../config';
import { addCanvas, addSheet, buildAllTextures, buildDefaultDinoSheet, buildGround, snackCanvas, TEX } from '../art/textures';
import { DINO_BLINK, DINO_BLINK_PALETTE, DINO_FRAMES } from '../art/sprites';
import { mapToCanvas } from '../art/PixelCanvas';
import { bus, EV } from '../events';

const CUSTOM_KEY = 'dino-custom-src';
const SNACK_KINDS: SnackKind[] = ['strawberry', 'banana', 'cookie'];
const SNACK_TEX: Record<SnackKind, string> = { strawberry: TEX.strawberry, banana: TEX.banana, cookie: TEX.cookie };
const snackSrcKey = (k: SnackKind): string => `snack-src-${k}`;

/** 타이틀 화면에 보낼 캐릭터 그림 */
export interface CharacterPreview {
  idle: HTMLCanvasElement;
  /** 눈 감은 프레임 (없으면 깜빡임 생략) */
  blink: HTMLCanvasElement | null;
  /** 간식 아이콘 (이미지가 있으면 이미지, 없으면 기본 도트) */
  snacks: Record<SnackKind, HTMLCanvasElement>;
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
  }

  create(): void {
    buildAllTextures(this);
    const snackIcons = this.setupSnacks();
    this.setupBackgroundGround();
    const info = this.setupCharacter();
    this.registry.set('character', info);

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

    const preview: CharacterPreview = {
      idle: this.frameCanvas(info, Math.min(Math.max(0, CHARACTER_ASSET.titleFrame), info.frameCount - 1)),
      blink: info.custom
        ? CHARACTER_ASSET.blinkFrame >= 0 && CHARACTER_ASSET.blinkFrame < info.frameCount
          ? this.frameCanvas(info, CHARACTER_ASSET.blinkFrame)
          : null
        : mapToCanvas(DINO_BLINK, DINO_BLINK_PALETTE),
      snacks: snackIcons,
    };
    bus.emit(EV.ready, preview);
    this.scene.start('Game');
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
