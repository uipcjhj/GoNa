import Phaser from 'phaser';
import { CHARACTER_ASSET, GAME_BG, PHYSICS, PLAYER, SNACKS, SPEED, STORAGE_KEYS, VIEW, type SnackKind } from '../config';
import { FAR_H, GROUND_TILE_H, MID_H, NEAR_H, TEX } from '../art/textures';
import { bus, EV, type GameOverInfo } from '../events';
import { sound } from '../audio';
import { storage } from '../storage';
import type { StageVisual } from './BootScene';
import { GROWTH_STAGES, GrowthState, SNACK_GROWTH, type GrowthStageId } from '../game/growth';
import { StageManager } from '../game/stages';
import { NEST_H, NEST_SINK, NEST_W } from '../art/nest';

type State = 'ready' | 'playing' | 'paused' | 'evolving' | 'dead';

/** 진화 연출 시간(초): 변신 반짝임 → 새 모습 공개 → 게임 재개 */
const EVO_TRANSFORM = 1.4;
const EVO_TOTAL = 2.5;

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

  // 성장 (점수와 독립)
  private growth = new GrowthState();
  private stageMgr = new StageManager();
  private visuals!: Record<GrowthStageId, StageVisual>;
  /** 지금 성장 단계의 모습 */
  private vis!: StageVisual;
  private gaugeGfx!: Phaser.GameObjects.Graphics;
  private evoT = 0;
  private evoFrom!: StageVisual;
  private evoTo!: StageVisual;
  private evoCommitted = false;
  private evoSparkleT = 0;
  private pauseAfterEvolve = false;

  // 1단계 둥지: 실제로 움직이는 건 둥지, 아기는 안에서 스프링처럼 반응
  private nestBack!: Phaser.GameObjects.Image;
  private nestFront!: Phaser.GameObjects.Image;
  /** 둥지 기준 아기 위치(위가 -)와 속도 — 출렁·퐁 반응 */
  private babyOff = 0;
  private babyVel = 0;
  /** 둥지 덜컹 흔들림 남은 시간(초) */
  private nestShake = 0;
  /** 진화로 둥지를 내려놓음 */
  private nestLeft = false;

  // 화면 배치
  private W = 0;
  private H = 0;
  private groundY = 0;
  private playerX = VIEW.playerX;

  // 배경
  private sky!: Phaser.GameObjects.Graphics;
  private deepDirt!: Phaser.GameObjects.Graphics;
  private sun!: Phaser.GameObjects.Image;
  private clouds: { img: Phaser.GameObjects.Image; x: number; yRatio: number; speed: number }[] = [];
  private far!: Phaser.GameObjects.TileSprite;
  private mid!: Phaser.GameObjects.TileSprite;
  private near!: Phaser.GameObjects.TileSprite;
  private waterfallTimer = 0;
  /** 이미지 배경 (있을 때만) */
  private bgImage: Phaser.GameObjects.TileSprite | null = null;
  private bgHaze: Phaser.GameObjects.Graphics | null = null;
  private bgScale = 1;
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
    // 게임 오버 후 규칙: 한 판 = 한 번의 성장 여정 → 다시하기는 항상 갓난아기부터 (GROWTH_ON_GAME_OVER)
    this.growth.reset();
    this.stageMgr.reset();
    this.pauseAfterEvolve = false;
    this.babyOff = 0;
    this.babyVel = 0;
    this.nestShake = 0;
    this.nestLeft = false;
    this.registry.set('autoStart', !!data?.autoStart);
  }

  create(): void {
    this.visuals = this.registry.get('stageVisuals') as Record<GrowthStageId, StageVisual>;
    this.vis = this.visuals[this.growth.stage.id];

    this.sky = this.add.graphics();
    this.sun = this.add.image(0, 0, TEX.sun);
    for (let i = 0; i < 4; i++) {
      const img = this.add.image(0, 0, TEX.cloud).setAlpha(0.95);
      this.clouds.push({ img, x: 40 + i * 110 + Math.random() * 40, yRatio: 0.12 + Math.random() * 0.5, speed: 4 + Math.random() * 5 });
    }
    // 패럴랙스 배경: 먼 바위산·폭포 → 중간 나무·버섯 → 가까운 풀숲 (모두 캐릭터·간식·장애물 뒤)
    this.far = this.add.tileSprite(0, 0, 10, FAR_H, TEX.far).setOrigin(0, 1);
    this.mid = this.add.tileSprite(0, 0, 10, MID_H, TEX.mid).setOrigin(0, 1);
    this.near = this.add.tileSprite(0, 0, 10, NEAR_H, TEX.near).setOrigin(0, 1);
    // 배경 이미지가 있으면: 코드 배경(해·구름·산·나무·풀숲) 대신 이미지 한 장을 반복 스크롤
    if (this.textures.exists(TEX.bgImage)) {
      this.bgImage = this.add.tileSprite(0, 0, 10, 10, TEX.bgImage).setOrigin(0, 0);
      this.bgHaze = this.add.graphics();
      for (const o of [this.sun, this.far, this.mid, this.near, ...this.clouds.map((c) => c.img)]) o.setVisible(false);
    }
    this.deepDirt = this.add.graphics();
    const groundTex = this.bgImage && this.textures.exists(TEX.groundImg) ? TEX.groundImg : TEX.ground;
    this.ground = this.add.tileSprite(0, 0, 10, GROUND_TILE_H, groundTex).setOrigin(0, 0);

    this.shadow = this.add.ellipse(0, 0, 14, 3, 0x3d2b22, 0.25);
    this.nestBack = this.add.image(0, 0, TEX.nestBack).setOrigin(0.5, 1).setDepth(9.5);
    this.nestFront = this.add.image(0, 0, TEX.nestFront).setOrigin(0.5, 1).setDepth(10.5);
    this.player = this.add.sprite(0, 0, this.vis.texture, this.vis.runFrames[0]).setDepth(10);
    this.player.setScale(this.vis.scale);
    this.player.play(this.vis.runAnim);

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
      this.heartIcons.push(this.add.image(0, 0, TEX.heartFull).setOrigin(0, 0).setDepth(20).setScrollFactor(0));
    }
    this.scoreText = this.add
      .text(0, 0, '', { fontFamily: FONT, fontSize: '12px', color: '#fff8e6', stroke: '#5a3a22', strokeThickness: 3 })
      .setOrigin(0.5, 0)
      .setDepth(20)
      .setScrollFactor(0);
    // 성장 게이지 (하트 아래)
    this.gaugeGfx = this.add.graphics().setDepth(20).setScrollFactor(0);
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
    this.cameras.main.setOrigin(0, 0).setZoom(k).setScroll(0, 0);
    this.W = Math.round(this.scale.width / k);
    this.H = Math.round(this.scale.height / k);
    // 세로 화면에서는 땅을 조금 위로 올려 엄지가 닿는 아래쪽은 흙으로 채움
    const portrait = this.H > VIEW.baseHeight;
    if (portrait) {
      // 세로 화면: 지면을 화면 약 72% 높이에. 더블 점프 최고점(약 90px + 캐릭터 키)이
      // 점수·하트 아래에서 잘리지 않고, 아래 흙은 최소 groundHeight 는 남도록
      const peakRoom = VIEW.portraitTopMargin + 92 + 44;
      this.groundY = Phaser.Math.Clamp(Math.round(this.H * VIEW.portraitGroundRatio), peakRoom, this.H - VIEW.groundHeight);
      this.playerX = VIEW.portraitPlayerX;
    } else {
      this.groundY = this.H - VIEW.groundHeight;
      this.playerX = VIEW.playerX;
    }

    this.drawSky();
    this.sun.setPosition(this.W - 46, Math.max(28, Math.round(this.groundY * 0.22)));
    this.far.setPosition(0, this.groundY + 2).setSize(this.W, FAR_H);
    this.mid.setPosition(0, this.groundY + 2).setSize(this.W, MID_H);
    this.near.setPosition(0, this.groundY + 1).setSize(this.W, NEAR_H);
    if (this.bgImage) {
      // 원본의 groundRow 줄이 게임 땅 윗면에 오도록 확대 (위쪽은 화면 맨 위부터)
      const src = this.textures.get(TEX.bgImage).getSourceImage() as HTMLImageElement;
      // 가로: 원본 그림(숲 지붕 제외)의 맨 위가 화면 맨 위에 오도록 / 세로: 덜 확대해서 숲을 넓게 (위는 숲 지붕이 채움)
      const landscapeScale = this.groundY / (GAME_BG.groundRow - GAME_BG.extraTop);
      const minScale = this.groundY / GAME_BG.groundRow; // 이보다 작으면 화면 위가 빔
      this.bgScale = this.H > VIEW.baseHeight ? Math.max(GAME_BG.portraitScale, minScale) : landscapeScale;
      this.bgImage
        .setPosition(0, Math.round((this.groundY - GAME_BG.groundRow * this.bgScale) * VIEW.renderScale) / VIEW.renderScale)
        .setSize(this.W, Math.ceil(src.height * this.bgScale))
        .setTileScale(this.bgScale, this.bgScale);
      this.bgHaze?.clear().fillStyle(GAME_BG.hazeColor, GAME_BG.haze).fillRect(0, -80, this.W, this.groundY + 80);
    }
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
      // 첫 띠는 화면 위쪽 바깥까지 칠해 둠 (높은 점프 때 카메라가 살짝 올라가도 빈 곳이 안 보이게)
      const extraTop = i === 0 ? 40 : 0;
      g.fillRect(0, top + i * bandH - extraTop, this.W, bandH + 1 + extraTop);
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
    if (this.state === 'evolving') {
      this.pauseAfterEvolve = true; // 진화 연출이 끝나면 바로 일시정지
      return;
    }
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.tweens.pauseAll();
    this.player.anims.pause();
    this.player.setFrame(this.vis.idleFrame); // 쉬는 동안은 대기 포즈
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
    this.gaugeGfx?.setVisible(v);
  }

  // ───────────────────────── 점프 ─────────────────────────

  private pressJump(): void {
    const now = this.time.now;
    const c = this.growth.stage.controls; // 단계별 조작 (기본값 1배 = 기존과 동일)
    if (this.grounded) {
      this.doJump(PHYSICS.jumpVelocity * c.jumpMul, false);
    } else if (this.jumpsUsed < c.maxJumps) {
      this.doJump(PHYSICS.doubleJumpVelocity * c.doubleJumpMul, true);
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
    if (this.inNest) {
      // 둥지째 튀어오름: 아기는 둥지에 꾹 눌렸다가 따라 올라감 (아기가 직접 뛰지 않음)
      this.babyVel += isDouble ? 90 : 70;
      if (isDouble) {
        sound.doubleJump();
        this.sparkleEmitter.explode(6, this.playerX, this.nestBack.y - 6);
      } else {
        sound.jump();
        this.dustEmitter.explode(4, this.playerX - 10, this.groundY);
      }
    } else if (isDouble) {
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
    if (this.inNest) this.babyVel -= 100; // 착지하면 아기가 둥지 안에서 퐁
    this.dustEmitter.explode(3, this.player.x, this.groundY);
    if (this.time.now - this.lastPressAt < PHYSICS.jumpBuffer && this.state === 'playing') {
      this.lastPressAt = -9999;
      this.doJump(PHYSICS.jumpVelocity * this.growth.stage.controls.jumpMul, false);
    }
  }

  // ───────────────────────── 메인 루프 ─────────────────────────

  update(time: number, deltaMs: number): void {
    if (this.state === 'paused') return;
    const dt = Math.min(deltaMs, 50) / 1000;
    if (this.state === 'evolving') {
      // 진화 연출 중: 세상은 멈추고 연출만 진행
      this.updateEvolution(dt, time);
      return;
    }

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
    this.near.tilePositionX = Math.round(this.distance * 0.7);
    this.mid.tilePositionX = Math.round(this.distance * 0.35);
    this.far.tilePositionX = Math.round(this.distance * 0.1);
    if (this.bgImage) this.bgImage.tilePositionX = (this.distance * GAME_BG.scroll) / this.bgScale;
    // 폭포 물 흐름 (2프레임 교대)
    this.waterfallTimer += dt;
    if (this.waterfallTimer > 0.22) {
      this.waterfallTimer = 0;
      this.far.setTexture(this.far.texture.key === TEX.far ? TEX.far2 : TEX.far);
    }
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

    const wantAnim = this.grounded ? this.vis.runAnim : this.vis.jumpAnim;
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

    // 갓난아기: 땅에서 꼬물꼬물 흔들림
    if (this.grounded && this.vis.wiggleDeg > 0) this.player.angle = Math.sin(time * this.vis.wiggleSpeed) * this.vis.wiggleDeg;

    this.placePlayer(dt, time);

    if (this.grounded && this.state === 'playing' && Math.random() < dt * (this.inNest ? 9 : 6)) {
      this.dustEmitter.explode(1, this.playerX - (this.inNest ? 18 : 6), this.groundY);
    }
  }

  /** 크기(스쿼시)·위치·그림자·카메라 들림·무적 깜빡임 — 물리와 무관한 표시만 */
  private placePlayer(dt: number, time: number): void {
    // 스쿼시 & 스트레치 (부드럽게 1로 복귀)
    this.squash += (1 - this.squash) * Math.min(1, dt * 12);
    // 찌그러짐 배율도 렌더 픽셀 단위(1/renderScale)로 맞춰 도트 한 칸이 항상 같은 정수 픽셀이 되게
    const k = VIEW.renderScale;
    const sy = Math.round(this.vis.scale * this.squash * k) / k;
    const sx = Math.round(this.vis.scale * (2 - this.squash) * k) / k;
    this.player.setScale(sx, sy);

    // 프레임이 한 장뿐인 커스텀 이미지는 통통 튀는 효과로 달리기 표현
    const bobAmp = this.vis.bob > 0 ? this.vis.bob : this.vis.runFrames.length < 2 ? 2 : 0;
    const bob = this.grounded && this.state === 'playing' && bobAmp > 0 ? Math.abs(Math.sin(time * 0.018)) * bobAmp : 0;

    const halfH = (this.vis.frameHeight * sy) / 2;
    // 발 = (땅 - 높이). 렌더 픽셀 격자에 맞춰 반올림해서 서 있을 때 발이 정확히 지면에 닿게
    let feetY = Math.round((this.groundY - this.alt - bob) * k) / k;
    const snap = (v: number): number => Math.round(v * k) / k;
    const nest = this.inNest;
    this.nestBack.setVisible(nest);
    this.nestFront.setVisible(nest);
    if (nest) {
      // ── 둥지가 땅 위를 통통 굴러가고, 아기는 그 안에서 스프링처럼 출렁
      const moving = this.grounded && this.state === 'playing';
      const bump = moving ? Math.abs(Math.sin(time * 0.022)) * 1.2 : 0;
      const tilt = moving ? Math.sin(time * 0.011) * 2.5 : 0;
      const shakeX = this.nestShake > 0 ? Math.sin(this.nestShake * 70) * 2.5 : 0;
      this.nestShake = Math.max(0, this.nestShake - dt);
      // 스프링 (둥지 움직임에 아기가 늦게 따라옴)
      this.babyVel += (-320 * this.babyOff - 16 * this.babyVel) * dt;
      this.babyOff = Phaser.Math.Clamp(this.babyOff + this.babyVel * dt, -12, 3);
      const nestBottom = snap(this.groundY - this.alt - bump);
      const nsx = snap(this.vis.scale * (2 - this.squash));
      const nsy = snap(this.vis.scale * this.squash);
      for (const n of [this.nestBack, this.nestFront]) n.setPosition(snap(this.playerX + shakeX), nestBottom).setScale(nsx, nsy).setAngle(tilt);
      // 아기 발 = 둥지 바닥에서 (둥지 높이 - 묻히는 깊이)만큼 위 + 출렁
      feetY = snap(nestBottom - (NEST_H - NEST_SINK - 1) * nsy + this.babyOff);
      this.player.setPosition(snap(this.playerX + shakeX), feetY - halfH);
    } else {
      this.player.setPosition(this.playerX, feetY - halfH);
    }

    if (nest) feetY = snap(this.groundY - this.alt); // 화면 위 여유 계산은 둥지 기준
    // 아주 높은 더블 점프로 머리가 화면 위로 나가면, 그만큼만 카메라를 살짝 올림 (물리·판정은 그대로)
    const headTop = feetY - this.vis.frameHeight * sy;
    const lift = Math.min(0, Math.round((headTop - 2) * k) / k);
    this.cameras.main.scrollY = lift;

    const shadowScale = Math.max(0.35, 1 - this.alt / 110);
    const shadowW = nest ? (NEST_W * this.vis.scale) / 14 : Math.max(1, this.vis.scale);
    this.shadow.setPosition(this.playerX, this.groundY + 1).setScale(shadowScale * shadowW, 1);

    // 무적 깜빡임
    if (time < this.invincibleUntil) this.player.setAlpha(Math.floor(time / 80) % 2 ? 0.35 : 1);
    else this.player.setAlpha(1);
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
    // 충돌 박스는 그림 크기와 별개 — 성장 단계 정의의 hitbox (기본: 모든 단계 기존과 동일)
    const w = this.growth.stage.hitbox.width;
    const h = this.growth.stage.hitbox.height;
    return {
      left: this.playerX - w / 2,
      right: this.playerX + w / 2,
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
    if (this.vis.happyFrame >= 0) this.showExpression(this.vis.happyFrame, CHARACTER_ASSET.happyMs);
    else if (this.inNest) this.babyVel = -150; // 둥지에서 퐁! 솟았다 쏙
    else this.squash = 0.8; // 표정 프레임이 없는 단계는 통통 반응

    // 성장 게이지 (점수와 별개로 증가)
    const full = this.growth.add(SNACK_GROWTH[e.snack ?? 'strawberry']);
    this.updateHud();
    if (full) this.startEvolution();
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
    this.showExpression(this.vis.surprisedFrame, CHARACTER_ASSET.surprisedMs);
    if (this.inNest) {
      this.nestShake = 0.35; // 둥지가 덜컹
      this.babyVel = -90;
    }
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
    this.cameras.main.scrollY = 0;
    this.state = 'dead';
    sound.stopMusic();
    sound.gameOver();
    this.player.anims.stop();
    this.exprFrame = -1;
    this.player.setFrame(this.vis.surprisedFrame >= 0 ? this.vis.surprisedFrame : this.vis.jumpFrame).setAlpha(1);
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
    // 최고 성장 단계 기록 (성장 자체는 다음 판에 갓난아기부터 다시)
    const reached = this.growth.maxStageIndex + 1;
    const prevBestStage = Number(storage.get(STORAGE_KEYS.bestStage) ?? 0) || 0;
    if (reached > prevBestStage) storage.set(STORAGE_KEYS.bestStage, String(reached));
    const bestStage = Math.max(prevBestStage, reached);

    this.time.delayedCall(1100, () => {
      if (isNewBest && this.score > 0) sound.newRecord();
      const info: GameOverInfo = {
        score: this.score,
        best,
        isNewBest: isNewBest && this.score > 0,
        snacks: this.snacksEaten,
        growthLevel: reached,
        growthName: GROWTH_STAGES[reached - 1].name,
        bestGrowthLevel: bestStage,
        growthLevels: GROWTH_STAGES.length,
      };
      bus.emit(EV.gameOver, info);
    });
  }

  private updateHud(): void {
    this.heartIcons.forEach((h, i) => h.setTexture(i < this.hearts ? TEX.heartFull : TEX.heartEmpty));
    this.scoreText.setText(`점수 ${this.score}`);
    this.drawGauge();
  }

  // ───────────────────────── 성장 게이지 / 진화 ─────────────────────────

  /** 하트 아래 성장 게이지: [막대] + 단계 칸 4개 */
  private drawGauge(): void {
    const g = this.gaugeGfx;
    if (!g) return;
    const x = 6;
    const y = 16;
    const w = 31;
    const h = 5;
    const final = this.growth.isFinal;
    g.clear();
    g.fillStyle(0x4a2a14, 1).fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle(0xf6e7c6, 1).fillRect(x, y, w, h);
    const fill = Math.round(w * this.growth.ratio);
    if (fill > 0) {
      g.fillStyle(final ? 0xffcf4d : 0x8fd35a, 1).fillRect(x, y, fill, h);
      g.fillStyle(final ? 0xfff1a8 : 0xc8f29a, 1).fillRect(x, y, fill, 1);
    }
    // 단계 칸
    for (let i = 0; i < GROWTH_STAGES.length; i++) {
      const px = x + w + 3 + i * 4;
      g.fillStyle(0x4a2a14, 1).fillRect(px, y, 3, h);
      g.fillStyle(i <= this.growth.stageIndex ? (final ? 0xffcf4d : 0x8fd35a) : 0xf6e7c6, 1).fillRect(px, y + 1, 1, h - 2);
      g.fillRect(px + 1, y + 1, 1, h - 2);
    }
  }

  private setVisual(v: StageVisual, frame: number): void {
    this.vis = v;
    this.player.setTexture(v.texture, frame);
  }

  /** 게이지가 가득 참 → 게임 정지 + 진화 연출 시작 */
  private startEvolution(): void {
    if (this.growth.isFinal) return;
    const next = GROWTH_STAGES[this.growth.stageIndex + 1];
    this.state = 'evolving';
    this.evoT = 0;
    this.evoSparkleT = 0;
    this.evoCommitted = false;
    this.evoFrom = this.vis;
    this.evoTo = this.visuals[next.id];
    this.exprFrame = -1;
    this.tweens.killTweensOf(this.player);
    this.player.anims.stop();
    this.player.setAngle(0).setAlpha(1);
    this.squash = 1;
    sound.evolve();
    this.cameras.main.flash(220, 255, 250, 225);
    bus.emit(EV.evolveStart, { level: next.level });
  }

  private updateEvolution(dt: number, time: number): void {
    this.evoT += dt;
    const t = this.evoT;
    // 반짝이: 공룡 주변에 계속
    this.evoSparkleT -= dt;
    if (this.evoSparkleT <= 0) {
      this.evoSparkleT = t < EVO_TRANSFORM ? 0.08 : 0.2;
      const r = 14 + Math.random() * 10;
      const a = Math.random() * Math.PI * 2;
      this.sparkleEmitter.explode(2, this.player.x + Math.cos(a) * r, this.player.y + Math.sin(a) * r);
    }
    if (t < EVO_TRANSFORM) {
      // 변신: 이전 모습 ↔ 새 모습이 점점 빠르게 번갈아 (크기·자세가 함께 바뀜)
      const period = Math.max(0.05, 0.22 * (1 - t / EVO_TRANSFORM));
      const showNew = Math.floor(t / period) % 2 === 1;
      const v = showNew ? this.evoTo : this.evoFrom;
      this.setVisual(v, v.idleFrame);
    } else if (!this.evoCommitted) {
      // 새 단계 확정
      this.evoCommitted = true;
      const leavingNest = this.inNest;
      const st = this.growth.evolve();
      if (leavingNest) this.leaveNest();
      this.setVisual(this.evoTo, this.evoTo.idleFrame);
      this.squash = 0.7;
      this.sparkleEmitter.explode(18, this.player.x, this.player.y);
      this.cameras.main.flash(160, 255, 255, 240);
      sound.evolveDone();
      this.updateHud();
      bus.emit(EV.evolve, { level: st.level, name: st.name, description: st.description });
    } else if (t >= EVO_TOTAL) {
      // 게임 재개 (바로 부딪히지 않도록 잠깐 무적)
      this.state = 'playing';
      this.invincibleUntil = time + 1000;
      this.player.play(this.grounded ? this.vis.runAnim : this.vis.jumpAnim);
      bus.emit(EV.evolveEnd);
      if (this.pauseAfterEvolve) {
        this.pauseAfterEvolve = false;
        this.pauseGame();
      }
      return;
    }
    this.placePlayer(dt, time);
  }

  /** 지금 둥지에 누워 있는 단계인지 (진화 연출 중 깜빡일 때는 보이는 모습 기준) */
  private get inNest(): boolean {
    return !this.nestLeft && this.vis.id === 'newborn' && !!GROWTH_STAGES.find((s) => s.id === 'newborn')?.vehicle;
  }

  /** 진화: 둥지를 내려놓고 기어 나옴 → 둥지는 땅에 남아 뒤로 멀어짐 */
  private leaveNest(): void {
    this.nestLeft = true;
    const ghostB = this.add.image(this.nestBack.x, this.groundY, TEX.nestBack).setOrigin(0.5, 1).setScale(this.vis.scale).setDepth(4);
    const ghostF = this.add.image(this.nestFront.x, this.groundY, TEX.nestFront).setOrigin(0.5, 1).setScale(this.vis.scale).setDepth(4);
    // 게임이 다시 달리기 시작하면 땅과 같은 속도로 뒤로 (장애물/간식 목록과 별개인 장식)
    const startD = this.distance;
    const x0 = ghostB.x;
    const follow = (): void => {
      const x = x0 - (this.distance - startD);
      ghostB.setX(Math.round(x));
      ghostF.setX(Math.round(x));
      if (x < -40) {
        ghostB.destroy();
        ghostF.destroy();
        this.events.off('update', follow);
      }
    };
    this.events.on('update', follow);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off('update', follow));
  }

  // ───────────────────────── 테스트·디버그용 ─────────────────────────

  /** (자동 테스트용) 성장 단계를 바로 지정 */
  debugSetStage(index: number): void {
    this.growth.stageIndex = Phaser.Math.Clamp(index, 0, GROWTH_STAGES.length - 1);
    this.growth.gauge = 0;
    this.growth.maxStageIndex = Math.max(this.growth.maxStageIndex, this.growth.stageIndex);
    this.nestLeft = this.growth.stageIndex > 0;
    this.setVisual(this.visuals[this.growth.stage.id], this.visuals[this.growth.stage.id].runFrames[0]);
    this.player.setAngle(0);
    this.player.play(this.grounded ? this.vis.runAnim : this.vis.jumpAnim);
    this.updateHud();
  }
}
