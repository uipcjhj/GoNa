import Phaser from 'phaser';
import { CHARACTER_ASSET, PHYSICS, PLAYER, SNACKS, SPEED, STORAGE_KEYS, VIEW, type SnackKind } from '../config';
import { GROUND_TILE_H, TEX } from '../art/textures';
import { bus, EV, type GameOverInfo } from '../events';
import { sound } from '../audio';
import { storage } from '../storage';
import type { CharacterInfo } from './BootScene';

type State = 'ready' | 'playing' | 'paused' | 'dead';

interface Entity {
  sprite: Phaser.GameObjects.Image;
  type: 'rock' | 'snack';
  snack?: SnackKind;
  /** 화면 x (중심) */
  x: number;
  /** 땅으로부터의 높이 (바닥 기준) */
  alt: number;
  /** 충돌 박스 크기 */
  w: number;
  h: number;
  phase: number;
  done: boolean;
}

const FONT = 'Galmuri11, monospace';
const SNACK_TEX: Record<SnackKind, string> = {
  strawberry: TEX.strawberry,
  banana: TEX.banana,
  cookie: TEX.cookie,
};

export class GameScene extends Phaser.Scene {
  private state: State = 'ready';
  private char!: CharacterInfo;

  // 화면 배치
  private W = 0;
  private H = 0;
  private groundY = 0;

  // 배경
  private sky!: Phaser.GameObjects.Graphics;
  private deepDirt!: Phaser.GameObjects.Graphics;
  private sun!: Phaser.GameObjects.Image;
  private clouds: { img: Phaser.GameObjects.Image; x: number; yRatio: number; speed: number }[] = [];
  private hills!: Phaser.GameObjects.TileSprite;
  private trees!: Phaser.GameObjects.TileSprite;
  private ground!: Phaser.GameObjects.TileSprite;

  // 플레이어
  private player!: Phaser.GameObjects.Sprite;
  private shadow!: Phaser.GameObjects.Ellipse;
  private alt = 0;
  private vy = 0;
  private grounded = true;
  private jumpsUsed = 0;
  private lastPressAt = -9999;
  private invincibleUntil = 0;
  private squash = 1;
  /** 표정 연출: 이 시각까지 exprFrame 을 보여줌 (-1 = 없음) */
  private exprFrame = -1;
  private exprUntil = 0;

  // 진행
  private entities: Entity[] = [];
  private speed = SPEED.start;
  private elapsed = 0;
  private distance = 0;
  private distToNext = 0;
  private score = 0;
  private snacksEaten = 0;
  private hearts = PLAYER.maxHearts;

  // HUD
  private heartIcons: Phaser.GameObjects.Image[] = [];
  private scoreText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private dustEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparkleEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super('Game');
  }

  init(data: { autoStart?: boolean }): void {
    this.state = 'ready';
    this.entities = [];
    this.clouds = [];
    this.heartIcons = [];
    this.speed = SPEED.start;
    this.elapsed = 0;
    this.distance = 0;
    this.distToNext = 140;
    this.score = 0;
    this.snacksEaten = 0;
    this.hearts = PLAYER.maxHearts;
    this.alt = 0;
    this.vy = 0;
    this.grounded = true;
    this.jumpsUsed = 0;
    this.invincibleUntil = 0;
    this.squash = 1;
    this.exprFrame = -1;
    this.exprUntil = 0;
    this.registry.set('autoStart', !!data?.autoStart);
  }

  create(): void {
    this.char = this.registry.get('character') as CharacterInfo;

    this.sky = this.add.graphics();
    this.sun = this.add.image(0, 0, TEX.sun);
    for (let i = 0; i < 4; i++) {
      const img = this.add.image(0, 0, TEX.cloud).setAlpha(0.95);
      this.clouds.push({ img, x: 40 + i * 110 + Math.random() * 40, yRatio: 0.12 + Math.random() * 0.5, speed: 4 + Math.random() * 5 });
    }
    this.hills = this.add.tileSprite(0, 0, 10, 56, TEX.hills).setOrigin(0, 1);
    this.trees = this.add.tileSprite(0, 0, 10, 52, TEX.trees).setOrigin(0, 1);
    this.deepDirt = this.add.graphics();
    this.ground = this.add.tileSprite(0, 0, 10, GROUND_TILE_H, TEX.ground).setOrigin(0, 0);

    this.shadow = this.add.ellipse(0, 0, 14, 3, 0x3d2b22, 0.25);
    this.player = this.add.sprite(0, 0, TEX.dino, this.char.runFrames[0]).setDepth(10);
    this.player.setScale(this.char.scale);
    this.player.play('run');

    this.dustEmitter = this.add.particles(0, 0, TEX.dust, {
      lifespan: 380,
      speedX: { min: -50, max: -20 },
      speedY: { min: -18, max: -4 },
      scale: { start: 1, end: 0.3 },
      alpha: { start: 0.9, end: 0 },
      emitting: false,
    }).setDepth(9);
    this.sparkleEmitter = this.add.particles(0, 0, TEX.sparkle, {
      lifespan: 450,
      speed: { min: 30, max: 80 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      emitting: false,
    }).setDepth(12);

    // HUD
    for (let i = 0; i < PLAYER.maxHearts; i++) {
      this.heartIcons.push(this.add.image(0, 0, TEX.heartFull).setOrigin(0, 0).setDepth(20));
    }
    this.scoreText = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '12px', color: '#fff8e6', stroke: '#5a3a22', strokeThickness: 3 })
      .setOrigin(0.5, 0)
      .setDepth(20);
    this.hintText = this.add
      .text(0, 0, '화면 아무 곳이나 터치!\n공중에서 한 번 더 = 더블 점프', {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#fbe3bd',
        align: 'center',
        lineSpacing: 4,
      })
      .setOrigin(0.5)
      .setAlpha(0.75)
      .setDepth(1);
    this.updateHud();

    this.layout();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);

    const onTap = (): void => this.handleTap();
    const onPause = (): void => this.pauseGame();
    const onResume = (): void => this.resumeGame();
    const onRequestStart = (): void => {
      if (this.state === 'ready') this.startGame();
    };
    const onRestart = (): void => {
      this.scene.restart({ autoStart: true });
    };
    bus.on(EV.tap, onTap);
    bus.on(EV.requestPause, onPause);
    bus.on(EV.requestResume, onResume);
    bus.on(EV.restart, onRestart);
    bus.on(EV.requestStart, onRequestStart);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      bus.off(EV.tap, onTap);
      bus.off(EV.requestPause, onPause);
      bus.off(EV.requestResume, onResume);
      bus.off(EV.restart, onRestart);
      bus.off(EV.requestStart, onRequestStart);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
    });

    this.setHudVisible(false);
    if (this.registry.get('autoStart')) this.startGame();
  }

  // ───────────────────────── 화면 배치 ─────────────────────────

  private layout(): void {
    // 캔버스는 논리 해상도 × renderScale 로 그리고, 카메라 확대로 논리 좌표를 그대로 사용
    const k = VIEW.renderScale;
    this.cameras.main.setOrigin(0, 0).setZoom(k);
    this.W = Math.round(this.scale.width / k);
    this.H = Math.round(this.scale.height / k);
    // 세로 화면에서는 땅을 조금 위로 올려 엄지가 닿는 아래쪽은 흙으로 채움
    const extra = Math.max(0, this.H - VIEW.baseHeight);
    this.groundY = Math.round(this.H - VIEW.groundHeight - extra * 0.45);

    this.drawSky();
    this.sun.setPosition(this.W - 46, Math.max(28, Math.round(this.groundY * 0.22)));
    this.hills.setPosition(0, this.groundY + 2).setSize(this.W, 56);
    this.trees.setPosition(0, this.groundY + 2).setSize(this.W, 52);
    this.ground.setPosition(0, this.groundY).setSize(this.W, GROUND_TILE_H);

    this.deepDirt.clear();
    const dirtTop = this.groundY + GROUND_TILE_H;
    if (dirtTop < this.H) {
      const bands = ['#c48a55', '#b57c4b', '#a66f42', '#96633a', '#875833'];
      const bandH = Math.ceil((this.H - dirtTop) / bands.length);
      bands.forEach((c, i) => {
        this.deepDirt.fillStyle(Phaser.Display.Color.HexStringToColor(c).color, 1);
        this.deepDirt.fillRect(0, dirtTop + i * bandH, this.W, bandH + 1);
      });
    }

    // 세로 화면: 아래쪽 흙 영역에 조작 안내
    const dirtSpace = this.H - dirtTop;
    this.hintText.setVisible(dirtSpace > 44).setPosition(Math.round(this.W / 2), Math.round(dirtTop + dirtSpace / 2));

    this.heartIcons.forEach((h, i) => h.setPosition(6 + i * 11, 6));
    this.scoreText.setPosition(Math.round(this.W / 2), 3);
  }

  private drawSky(): void {
    const g = this.sky;
    g.clear();
    // 따뜻한 오후 하늘: 위에서 아래로 띠 + 도트 디더링 경계
    const colors = [0x8ccbe0, 0x9fd5e3, 0xb4dfe2, 0xcbe7dc, 0xe3ecd0, 0xf8eac0, 0xfde1b0];
    const top = 0;
    const bottom = this.groundY;
    const bandH = Math.ceil((bottom - top) / colors.length);
    colors.forEach((c, i) => {
      g.fillStyle(c, 1);
      g.fillRect(0, top + i * bandH, this.W, bandH + 1);
    });
    // 띠 경계 디더링
    for (let i = 1; i < colors.length; i++) {
      const y = top + i * bandH;
      g.fillStyle(colors[i - 1], 1);
      for (let x = 0; x < this.W; x += 2) g.fillRect(x + (i % 2), y, 1, 1);
      g.fillStyle(colors[i], 1);
      for (let x = 0; x < this.W; x += 2) g.fillRect(x + ((i + 1) % 2), y - 1, 1, 1);
    }
  }

  // ───────────────────────── 상태 전환 ─────────────────────────

  private handleTap(): void {
    if (this.state === 'ready') this.startGame();
    else if (this.state === 'playing') this.pressJump();
    else if (this.state === 'paused') this.resumeGame();
  }

  private startGame(): void {
    this.state = 'playing';
    this.setHudVisible(true);
    sound.unlock();
    sound.startMusic();
    bus.emit(EV.start);
  }

  private pauseGame(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.tweens.pauseAll();
    this.player.anims.pause();
    this.player.setFrame(this.char.idleFrame); // 쉬는 동안은 대기 포즈
    sound.stopMusic();
    bus.emit(EV.pause);
  }

  private resumeGame(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.tweens.resumeAll();
    this.player.anims.resume();
    if (this.player.anims.currentFrame) this.player.setFrame(this.player.anims.currentFrame.frame.name);
    sound.startMusic();
    bus.emit(EV.resume);
  }

  private setHudVisible(v: boolean): void {
    this.heartIcons.forEach((h) => h.setVisible(v));
    this.scoreText.setVisible(v);
  }

  // ───────────────────────── 점프 ─────────────────────────

  private pressJump(): void {
    const now = this.time.now;
    if (this.grounded) {
      this.doJump(PHYSICS.jumpVelocity, false);
    } else if (this.jumpsUsed < 2) {
      this.doJump(PHYSICS.doubleJumpVelocity, true);
    } else {
      // 착지 직전 입력은 기억했다가 착지하자마자 점프
      this.lastPressAt = now;
    }
  }

  private doJump(v: number, isDouble: boolean): void {
    this.vy = v;
    this.grounded = false;
    this.jumpsUsed = isDouble ? 2 : 1;
    this.squash = isDouble ? 1.12 : 1.18;
    if (isDouble) {
      sound.doubleJump();
      this.sparkleEmitter.explode(6, this.player.x, this.player.y + this.player.displayHeight / 2);
      this.tweens.add({ targets: this.player, angle: { from: 0, to: -360 }, duration: 380, ease: 'Cubic.Out' });
    } else {
      sound.jump();
      this.dustEmitter.explode(4, this.player.x - 4, this.groundY);
    }
  }

  private land(): void {
    this.grounded = true;
    this.jumpsUsed = 0;
    this.vy = 0;
    this.squash = 0.82;
    this.player.angle = 0;
    this.dustEmitter.explode(3, this.player.x, this.groundY);
    if (this.time.now - this.lastPressAt < PHYSICS.jumpBuffer && this.state === 'playing') {
      this.lastPressAt = -9999;
      this.doJump(PHYSICS.jumpVelocity, false);
    }
  }

  // ───────────────────────── 메인 루프 ─────────────────────────

  update(time: number, deltaMs: number): void {
    if (this.state === 'paused') return;
    const dt = Math.min(deltaMs, 50) / 1000;

    if (this.state === 'playing') {
      this.elapsed += dt;
      this.speed = Math.min(SPEED.max, SPEED.start + SPEED.accel * this.elapsed);
    } else if (this.state === 'dead') {
      this.speed = Math.max(0, this.speed - 260 * dt);
    } else {
      this.speed = SPEED.start * 0.8;
    }

    const move = this.speed * dt;
    this.distance += move;
    this.scrollBackground(dt);

    if (this.state !== 'dead') this.updatePlayer(dt, time);

    if (this.state === 'playing') {
      this.distToNext -= move;
      if (this.distToNext <= 0) this.distToNext = this.spawnPattern() + this.randomGap();
    }

    this.updateEntities(move, time);
  }

  private scrollBackground(dt: number): void {
    this.ground.tilePositionX = Math.round(this.distance);
    this.trees.tilePositionX = Math.round(this.distance * 0.35);
    this.hills.tilePositionX = Math.round(this.distance * 0.12);
    for (const c of this.clouds) {
      c.x -= (c.speed + this.speed * 0.04) * dt;
      if (c.x < -24) {
        c.x = this.W + 24 + Math.random() * 60;
        c.yRatio = 0.1 + Math.random() * 0.5;
      }
      c.img.setPosition(Math.round(c.x), Math.round(this.groundY * c.yRatio) + 8);
    }
  }

  private updatePlayer(dt: number, time: number): void {
    if (!this.grounded) {
      this.vy -= PHYSICS.gravity * dt;
      this.alt += this.vy * dt;
      if (this.alt <= 0) {
        this.alt = 0;
        this.land();
      }
    }

    const wantAnim = this.grounded ? 'run' : 'jump';
    if (this.exprFrame >= 0) {
      if (time < this.exprUntil) {
        // 표정 연출 중: 그림만 바꾸고 위치·물리·충돌 박스는 그대로
        if (this.player.anims.isPlaying) this.player.anims.stop();
        this.player.setFrame(this.exprFrame);
      } else {
        // 끝나면 지금 상태(달리기/점프)로 자연스럽게 복귀
        this.exprFrame = -1;
        this.player.play(wantAnim);
      }
    } else if (this.player.anims.currentAnim?.key !== wantAnim) {
      this.player.play(wantAnim);
    }

    // 스쿼시 & 스트레치 (부드럽게 1로 복귀)
    this.squash += (1 - this.squash) * Math.min(1, dt * 12);
    // 찌그러짐 배율도 렌더 픽셀 단위(1/renderScale)로 맞춰 도트 한 칸이 항상 같은 정수 픽셀이 되게
    const k = VIEW.renderScale;
    const sy = Math.round(this.char.scale * this.squash * k) / k;
    const sx = Math.round(this.char.scale * (2 - this.squash) * k) / k;
    this.player.setScale(sx, sy);

    // 프레임이 한 장뿐인 커스텀 이미지는 통통 튀는 효과로 달리기 표현
    const bob = this.grounded && this.char.runFrames.length < 2 ? Math.abs(Math.sin(time * 0.018)) * 2 : 0;

    const halfH = (this.char.frameHeight * sy) / 2;
    // 발 = (땅 - 높이). 렌더 픽셀 격자에 맞춰 반올림해서 서 있을 때 발이 정확히 지면에 닿게
    const feetY = Math.round((this.groundY - this.alt - bob) * k) / k;
    this.player.setPosition(VIEW.playerX, feetY - halfH);

    const shadowScale = Math.max(0.35, 1 - this.alt / 110);
    this.shadow.setPosition(VIEW.playerX, this.groundY + 1).setScale(shadowScale * Math.max(1, this.char.scale), 1);

    // 무적 깜빡임
    if (time < this.invincibleUntil) this.player.setAlpha(Math.floor(time / 80) % 2 ? 0.35 : 1);
    else this.player.setAlpha(1);

    if (this.grounded && this.state === 'playing' && Math.random() < dt * 6) {
      this.dustEmitter.explode(1, VIEW.playerX - 6, this.groundY);
    }
  }

  // ───────────────────────── 장애물 / 간식 ─────────────────────────

  private randomGap(): number {
    const d = this.difficulty();
    const min = this.speed * Phaser.Math.Linear(0.95, 0.75, d) + 24;
    const max = this.speed * Phaser.Math.Linear(1.9, 1.3, d) + 50;
    return Phaser.Math.Between(Math.round(min), Math.round(max));
  }

  private difficulty(): number {
    return Phaser.Math.Clamp(this.elapsed / 90, 0, 1);
  }

  private randomSnack(): SnackKind {
    const r = Math.random();
    return r < 0.55 ? 'strawberry' : r < 0.85 ? 'banana' : 'cookie';
  }

  /** 패턴 하나를 화면 오른쪽 밖에 만들고 그 길이(px)를 돌려줍니다. */
  private spawnPattern(): number {
    const x0 = this.W + 20;
    const d = this.difficulty();
    const airHalf = (this.speed * (PHYSICS.jumpVelocity / PHYSICS.gravity)) | 0; // 점프 체공 거리의 절반
    const peak = (PHYSICS.jumpVelocity * PHYSICS.jumpVelocity) / (2 * PHYSICS.gravity);

    const patterns: { w: number; run: () => number }[] = [
      {
        w: 3,
        run: () => {
          const n = Phaser.Math.Between(3, 5);
          const kind = this.randomSnack();
          for (let i = 0; i < n; i++) this.addSnack(kind, x0 + i * 18, 4);
          return n * 18;
        },
      },
      {
        w: 3 + d * 2,
        run: () => {
          this.addRock(x0);
          return 16;
        },
      },
      {
        w: 3,
        run: () => {
          // 바위 위로 점프 궤적을 따라 간식 배치 (점프하면 보상)
          const cx = x0 + airHalf;
          this.addRock(cx);
          const kind = this.randomSnack();
          for (let i = -2; i <= 2; i++) {
            const dx = (i / 2.6) * airHalf;
            const a = 6 + peak * (1 - (dx / airHalf) ** 2) * 0.95;
            this.addSnack(kind, cx + dx, a);
          }
          return airHalf * 2;
        },
      },
      {
        w: 2,
        run: () => {
          // 더블 점프로만 닿는 높은 간식
          const kind: SnackKind = Math.random() < 0.5 ? 'cookie' : 'banana';
          for (let i = 0; i < 3; i++) this.addSnack(kind, x0 + i * 16, 80 + (i === 1 ? 6 : 0));
          return 48;
        },
      },
      {
        w: 1.5,
        run: () => {
          this.addRock(x0);
          this.addSnack('cookie', x0, 58);
          return 16;
        },
      },
      {
        w: d > 0.15 ? 1 + d * 2 : 0,
        run: () => {
          this.addRock(x0);
          this.addRock(x0 + 14);
          return 30;
        },
      },
      {
        w: d > 0.35 ? d * 2 : 0,
        run: () => {
          const gap = Math.round(this.speed * 1.05);
          this.addRock(x0);
          this.addRock(x0 + gap);
          return gap + 16;
        },
      },
    ];

    const total = patterns.reduce((s, p) => s + p.w, 0);
    let r = Math.random() * total;
    for (const p of patterns) {
      r -= p.w;
      if (r <= 0) return p.run();
    }
    return patterns[0].run();
  }

  private addRock(x: number): void {
    const sprite = this.add.image(x, 0, TEX.rock).setOrigin(0.5, 1).setDepth(5);
    this.entities.push({ sprite, type: 'rock', x, alt: 0, w: 11, h: 9, phase: 0, done: false });
  }

  private addSnack(kind: SnackKind, x: number, alt: number): void {
    const sprite = this.add.image(x, 0, SNACK_TEX[kind]).setOrigin(0.5, 1).setDepth(6);
    this.entities.push({ sprite, type: 'snack', snack: kind, x, alt, w: 12, h: 12, phase: x * 0.07, done: false });
  }

  private updateEntities(move: number, time: number): void {
    const p = this.playerBox();
    for (const e of this.entities) {
      e.x -= move;
      if (!e.done) {
        const bob = e.type === 'snack' ? Math.round(Math.sin(time * 0.006 + e.phase) * 1.5) : 0;
        e.sprite.setPosition(Math.round(e.x), Math.round(this.groundY - e.alt + bob));

        if (this.state === 'playing') {
          const left = e.x - e.w / 2;
          const right = e.x + e.w / 2;
          const bottom = e.alt;
          const top = e.alt + e.h;
          if (right > p.left && left < p.right && top > p.bottom && bottom < p.top) {
            if (e.type === 'snack') this.collect(e);
            else if (time >= this.invincibleUntil) this.hitRock(e);
          }
        }
      }
    }
    // 화면 밖으로 나간 것 정리
    this.entities = this.entities.filter((e) => {
      if (e.x < -30 && !e.done) {
        e.sprite.destroy();
        return false;
      }
      return !(e.done && !e.sprite.active);
    });
  }

  /** 플레이어 충돌 박스 (땅 기준 높이 좌표계) */
  private playerBox(): { left: number; right: number; bottom: number; top: number } {
    const w = PLAYER.hitboxWidth;
    const h = PLAYER.hitboxHeight;
    return {
      left: VIEW.playerX - w / 2,
      right: VIEW.playerX + w / 2,
      bottom: this.alt + 1,
      top: this.alt + h,
    };
  }

  /** 잠깐 표정 프레임 보여주기 (프레임이 없으면 아무것도 안 함) */
  private showExpression(frame: number, ms: number): void {
    if (frame < 0) return;
    this.exprFrame = frame;
    this.exprUntil = this.time.now + ms;
  }

  private collect(e: Entity): void {
    e.done = true;
    const info = SNACKS[e.snack ?? 'strawberry'];
    this.score += info.points;
    this.snacksEaten++;
    this.updateHud();
    sound.pickup(info.points);
    this.showExpression(this.char.happyFrame, CHARACTER_ASSET.happyMs);
    this.sparkleEmitter.explode(5, e.sprite.x, e.sprite.y - 6);

    this.tweens.add({
      targets: e.sprite,
      y: e.sprite.y - 14,
      scale: 1.6,
      alpha: 0,
      duration: 260,
      onComplete: () => e.sprite.destroy(),
    });

    const pop = this.add
      .text(Math.round(e.sprite.x), Math.round(e.sprite.y - 14), `+${info.points}`, {
        fontFamily: FONT,
        fontSize: '12px',
        color: '#fff4c2',
        stroke: '#7a3f1f',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(15);
    this.tweens.add({
      targets: pop,
      y: pop.y - 16,
      alpha: 0,
      duration: 650,
      ease: 'Quad.Out',
      onComplete: () => pop.destroy(),
    });

    this.tweens.add({ targets: this.scoreText, scale: 1.25, duration: 80, yoyo: true });
  }

  private hitRock(e: Entity): void {
    this.hearts = Math.max(0, this.hearts - 1);
    this.updateHud();
    sound.hit();
    this.showExpression(this.char.surprisedFrame, CHARACTER_ASSET.surprisedMs);
    this.cameras.main.shake(180, 0.012);
    this.cameras.main.flash(140, 255, 120, 110);
    this.tweens.add({ targets: e.sprite, angle: { from: -8, to: 8 }, duration: 60, yoyo: true, repeat: 2 });

    const icon = this.heartIcons[this.hearts];
    if (icon) this.tweens.add({ targets: icon, scale: 1.5, duration: 120, yoyo: true });

    if (this.hearts <= 0) {
      this.die();
      return;
    }
    this.invincibleUntil = this.time.now + PLAYER.invincibleMs;
    // 살짝 튕겨 오르기
    if (this.grounded) {
      this.vy = 170;
      this.grounded = false;
      this.jumpsUsed = 1;
    }
  }

  private die(): void {
    this.state = 'dead';
    sound.stopMusic();
    sound.gameOver();
    this.player.anims.stop();
    this.exprFrame = -1;
    this.player.setFrame(this.char.surprisedFrame >= 0 ? this.char.surprisedFrame : this.char.jumpFrame).setAlpha(1);
    this.tweens.add({
      targets: this.player,
      y: this.player.y - 30,
      angle: -200,
      duration: 380,
      ease: 'Quad.Out',
      onComplete: () => {
        this.tweens.add({ targets: this.player, y: this.H + 40, angle: -400, duration: 600, ease: 'Quad.In' });
      },
    });
    this.shadow.setVisible(false);

    const prevBest = Number(storage.get(STORAGE_KEYS.best) ?? 0) || 0;
    const isNewBest = this.score > prevBest;
    const best = Math.max(prevBest, this.score);
    if (isNewBest) storage.set(STORAGE_KEYS.best, String(best));

    this.time.delayedCall(1100, () => {
      if (isNewBest && this.score > 0) sound.newRecord();
      const info: GameOverInfo = { score: this.score, best, isNewBest: isNewBest && this.score > 0, snacks: this.snacksEaten };
      bus.emit(EV.gameOver, info);
    });
  }

  private updateHud(): void {
    this.heartIcons.forEach((h, i) => h.setTexture(i < this.hearts ? TEX.heartFull : TEX.heartEmpty));
    this.scoreText.setText(`점수 ${this.score}`);
  }
}
