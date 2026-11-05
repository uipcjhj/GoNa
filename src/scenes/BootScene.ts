import Phaser from 'phaser';
import { CHARACTER_ASSET } from '../config';
import { addSheet, buildAllTextures, buildDefaultDinoSheet, TEX } from '../art/textures';
import { DINO_BLINK, DINO_BLINK_PALETTE, DINO_FRAMES } from '../art/sprites';
import { mapToCanvas } from '../art/PixelCanvas';
import { bus, EV } from '../events';

const CUSTOM_KEY = 'dino-custom-src';

/** 타이틀 화면에 보낼 캐릭터 그림 */
export interface CharacterPreview {
  idle: HTMLCanvasElement;
  /** 눈 감은 프레임 (없으면 깜빡임 생략) */
  blink: HTMLCanvasElement | null;
}

/** 캐릭터 프레임 정보 (GameScene 에서 사용) */
export interface CharacterInfo {
  frameCount: number;
  runFrames: number[];
  jumpFrame: number;
  idleFrame: number;
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
  }

  create(): void {
    buildAllTextures(this);
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
    };
    bus.emit(EV.ready, preview);
    this.scene.start('Game');
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
        frameWidth: fw,
        frameHeight: fh,
        scale: CHARACTER_ASSET.displayHeight / fh,
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
