import Phaser from 'phaser';
import { CHARACTER_ASSET, CASTLE_ART, GAME_BG, PHYSICS, PLAYER, SNACKS, SPEED, STORAGE_KEYS, VIEW, type SnackKind } from '../config';
import { addCanvas, addSheet, FAR_H, GROUND_TILE_H, MID_H, NEAR_H, TEX } from '../art/textures';
import { bus, EV, type AttackState, type BossId, type CombatHud, type GameOverInfo, type RestartOptions } from '../events';
import { haptics } from '../haptics';
import { sound, type MusicMode } from '../audio';
import { perf } from '../perf';
import { storage } from '../storage';
import type { StageVisual } from './BootScene';
import { GROWTH_STAGES, GrowthState, SNACK_GROWTH, type GrowthStageId } from '../game/growth';
import { StageManager } from '../game/stages';
import { NEST_H, NEST_SINK, NEST_W } from '../art/nest';
import { BATTLE_HP, BOSSES, SHIELD } from '../game/boss';
import { clearCheckpoint, loadCheckpoint, saveCheckpoint } from '../game/checkpoint';
import { MONSTER_DASH, MONSTERS, ROCK_DAMAGE, maxMonsters, monsterWeight, type MonsterKind } from '../game/monsters';
import { CLOUD_FRAME, dizzyStar, FLASK_FRAME, flaskSheet, fartCloudSheet, monsterSheet, pathArrow, POP_FRAME, popSheet, PUDDLE_FRAME, puddleSheet, SHATTER_FRAME, shatterSheet } from '../art/monsterArt';
import { boomerangStats } from '../game/weapons';
import { hurtFace } from '../art/hurtFace';
import { petalSheet, sunRays, sunsetSky, tinyHeart as endHeart } from '../art/familyArt';
import { queueEndingArt, type EndingScene } from './EndingScene';
import { auraRing, leaf, moodFlower, PIG_NOSE_FRAME, pigNoseSheet, royalHeart, safeMark, targetSheet, TORNADO_FRAME, tornadoSheet } from '../art/specialArt';
import { witchArm, witchDrop, witchGoo, witchPot, witchPuddle, witchSheet, witchSmoke, witchSpoon, witchTarget, WITCH_SHEET_FRAMES } from '../art/witchArt';
import { castleBolt, clueBush, cluePrint, clueSpoon } from '../art/castleArt';
import { battleShield, bigCloud, bossSheet, hairTuft, heartShot, removeHair, smellCloud, stinkDot, stinkPuddle, tinyHeart, waveHeart, warnMark } from '../art/bossArt';
import { PixelCanvas } from '../art/PixelCanvas';
import type { BossBattle } from './battle/BossBattle';
import { KissBattle } from './battle/KissBattle';
import { WitchBattle } from './battle/WitchBattle';
import { FinaleRun } from './FinaleRun';
import { SniffBattle } from './battle/SniffBattle';
import { HairBoomerang } from './battle/HairBoomerang';
import type { BattleHost } from './battle/types';

type State = 'ready' | 'playing' | 'paused' | 'evolving' | 'dead' | 'cleared' | 'ending';

/** 진화 연출 시간(초): 변신 반짝임 → 새 모습 공개 → 게임 재개 */
const EVO_TRANSFORM = 1.4;
const EVO_TOTAL = 2.5;

interface Entity {
  sprite: Phaser.GameObjects.Image;
  /** rock 바위 · snack 간식 · monster 일반 몬스터 · mshot 몬스터 투사체 · cloud 방귀 구름 · puddle 깨진 물약(땅에 잠시) · fx 연출(충돌 없음) */
  type: 'rock' | 'snack' | 'monster' | 'mshot' | 'cloud' | 'puddle' | 'fx';
  /** 포물선으로 나는 것(플라스크): 높이 속도·중력 — 땅에 닿으면 onLand */
  valt?: number;
  grav?: number;
  /** fx: 따라다닐 대상과 x 간격 (대상이 사라지면 같이 사라짐) */
  follow?: Entity;
  fxOff?: number;
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
  /** 땅보다 더 빨리 왼쪽으로 (몬스터 걷기·투사체) px/s */
  vx?: number;
  /** 남은 시간(초) — 구름 */
  life?: number;
  /** 맞으면 HP 피해 */
  dmg?: number;
  /** 이미 고나를 맞힘 (구름은 한 번만) */
  hit?: boolean;
  mon?: { kind: MonsterKind; hp: number; cd: number; tele: number; flash: number; id: number; burst: number; burstT: number; post: number; burstN?: number; attacks: number; dashTele: number; dashT: number; recover: number };
  /** 투사체·구름 애니메이션 시간(초) */
  age?: number;
}

const FONT = 'Galmuri11, monospace';
/** 고나 발이 땅 그림 맨 윗줄(밝은 풀 가장자리)에 걸치도록 그림만 내리는 양 (논리 px) */
const FOOT_SINK = 1;
const SNACK_TEX: Record<SnackKind, string> = {
  strawberry: TEX.strawberry,
  banana: TEX.banana,
  cookie: TEX.cookie,
  jelly: TEX.jelly,
};

/** 성 입구에서 멈출 때 감속 (px/s²) */
const HALT_DECEL = 140;

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

  // 보스전 · 머리카락 부메랑
  private battle: BossBattle | null = null;
  private boomerang!: HairBoomerang;
  /** 뽀뽀괴물전에서 각성 (3단계 전에도 사용 가능) */
  private boomerangAwake = false;
  private clearedBosses = new Set<BossId>();
  /** 흡입으로 끌려간 거리 (고나 x = basePlayerX + pull) */
  private pull = 0;
  private basePlayerX = VIEW.playerX;
  /** 다시 도전: 시작하자마자 이 보스전 */
  private pendingBoss: BossId | null = null;
  /** 마지막 모험 (킁카괴물 뒤 → 암흑의 이유식 성) */
  private finale: FinaleRun | null = null;
  /** 이어하기·테스트: 시작하면 바로 마지막 모험 (값 = 시작 시각 초) */
  private pendingFinale: number | null = null;
  /** 성 안 (최종 보스 무대) */
  inCastle = false;
  /** 달리기 멈춤 (성 입구 도착 · 등장 컷신) */
  private halt = false;
  /** 보스전 시작 때의 점수 (보스전 다시 도전용) */
  private retryCarry = { score: 0, snacks: 0 };
  private hudKey = '';
  /** 보스전 체력: 지금 하트의 HP (하트 1개 = 100) */
  private hp: number = BATTLE_HP.perHeart;
  /** 방패: 켜진 동안 / 다시 쓸 수 있는 시각 (scene time ms) */
  private shieldUntil = 0;
  private shieldReadyAt = 0;
  private shieldSprite!: Phaser.GameObjects.Image;
  /** 부메랑이 돌아오기 직전에 누른 공격은 기억했다가 돌아오자마자 발사 */
  private attackBufferUntil = 0;
  private phaserHearts = true;
  /** 일반 스테이지에서 모은 필살 게이지 (몬스터 처치) → 다음 보스전에서 이어서 */
  private specialCarry = 0;
  /** (검증용) 처치한 몬스터 수 · 나온 몬스터 수 · 이벤트 수 */
  kills = 0;
  spawned = 0;
  eventCount = 0;
  /** 마지막 몬스터 이후 지난 시간(초) — 너무 오래 안 나오면 다음 패턴은 몬스터 (3단계 첫 몬스터는 금방) */
  private sinceMonster = 8;
  /** 떠오르는 점수 글자 재사용 (매번 Text 를 새로 만들면 텍스처 생성으로 멈칫) */
  private popPool: Phaser.GameObjects.Image[] = [];
  private host!: BattleHost;

  // 화면 배치
  private W = 0;
  private H = 0;
  private groundY = 0;
  private playerX = VIEW.playerX;

  // 배경
  /** 하늘: 한 번 그린 그림 한 장 (예전엔 디더링 사각형 약 1000개를 매 프레임 다시 그렸음) */
  private sky!: Phaser.GameObjects.Image;
  private skySeq = 0;
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
  /** 지금 배경 그림의 지면선 줄 · 위쪽 숨김 줄 (숲·성 앞: 400·100 / 성 안 그림은 바닥선이 336줄: 336·36) */
  private bgRow = GAME_BG.groundRow;
  private bgTop = GAME_BG.extraTop;
  /** 마지막 모험의 승인된 성 배경 (숲 배경과 같은 좌표·배율로 겹침 · 좌우 반복 없이 그림 안에서만 천천히 다가감) */
  private backdrops: { key: string; spr: Phaser.GameObjects.TileSprite; focus: number; t: number; pan: number; stop: boolean }[] = [];
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
  /** 보스전 분위기: 배경 위(캐릭터 아래)에 드리우는 보랏빛·남색 그림자 + 바람에 날리는 나뭇잎 (전투 중에만) */
  private moodTint!: Phaser.GameObjects.Rectangle;
  private moodLeaves: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  /** 아파! 표정: 이 시각까지 hurt-<단계> 프레임 · 맞은 시각 · 뒤로 밀림(표시만) */
  private hurtUntil = 0;
  /** 킁카괴물 흡입에 버티는 중 (발을 빠르게 구름 · 바람에 흔들림) */
  private resisting = false;
  private hurtAt = 0;
  private hurtKick = 0;
  /** 표정 연출: 이 시각까지 exprFrame 을 보여줌 (-1 = 없음) */
  private exprFrame = -1;
  private exprUntil = 0;

  // 진행
  private entities: Entity[] = [];
  private speed = SPEED.start;
  /** 달리기 속도 배율 (SPEED.start 기준) — 20초마다 조금씩 오름, 단계별 하한·상한 */
  private speedMul = 1;
  private speedStepT = 0;
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

  init(data: { autoStart?: boolean } & RestartOptions): void {
    this.state = 'ready';
    this.entities = [];
    this.clouds = [];
    this.heartIcons = [];
    this.speed = SPEED.start;
    this.elapsed = 0;
    this.speedStepT = 0;
    this.speedMul = 1;
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
    this.hurtUntil = 0;
    this.hurtKick = 0;
    this.moodLeaves = null;
    // 게임 오버 후 규칙: 한 판 = 한 번의 성장 여정 → 다시하기는 항상 갓난아기부터 (GROWTH_ON_GAME_OVER)
    this.growth.reset();
    this.stageMgr.reset();
    this.pauseAfterEvolve = false;
    this.babyOff = 0;
    this.babyVel = 0;
    this.nestShake = 0;
    this.nestLeft = false;
    this.battle = null;
    this.specialCarry = 0;
    this.kills = 0;
    this.spawned = 0;
    this.eventCount = 0;
    this.sinceMonster = data?.devMonsters ? 99 : 8;
    this.hp = BATTLE_HP.perHeart;
    this.shieldUntil = 0;
    this.shieldReadyAt = 0;
    this.attackBufferUntil = 0;
    this.eventT = 35;
    this.boomerangAwake = false;
    this.clearedBosses = new Set();
    this.pull = 0;
    this.hudKey = '';
    this.pendingBoss = null;
    this.finale?.destroy();
    this.finale = null;
    this.pendingFinale = null;
    this.inCastle = false;
    this.halt = false;
    this.bgRow = GAME_BG.groundRow;
    this.bgTop = GAME_BG.extraTop;
    this.backdrops = [];
    // 체크포인트에서 이어하기 (개발용 몬스터 테스트는 3단계 체크포인트와 같은 상태, 저장은 안 함)
    const cp = data?.checkpoint ? loadCheckpoint() : data?.devMonsters ? { id: 'walker' as const, score: 0, snacks: 0, at: 0 } : null;
    if (cp?.id === 'walker') {
      // 뽀뽀괴물을 이긴 직후: 3단계 처음, 머리카락 부메랑 있음
      this.growth.stageIndex = GROWTH_STAGES.findIndex((g) => g.id === 'walker');
      this.growth.gauge = 0;
      this.growth.maxStageIndex = this.growth.stageIndex;
      this.nestLeft = true;
      this.clearedBosses.add('kiss');
      this.score = cp.score;
      this.snacksEaten = cp.snacks;
    }
    // 보스전 다시 도전 · 최종 보스 체크포인트 (또는 테스트용 주소 ?boss=kiss / ?boss=sniff — 처음 한 번만)
    let boss = data?.boss ?? (cp?.id === 'sniff' ? 'sniff' : cp?.id === 'witch' ? 'witch' : null);
    if (cp?.id === 'sniff' || cp?.id === 'witch') data = { ...data, score: cp.score, snacks: cp.snacks };
    if (cp?.id === 'finale') {
      // 킁카괴물을 이긴 직후: 4단계 · 마지막 모험 처음부터
      this.growth.stageIndex = GROWTH_STAGES.findIndex((g) => g.id === 'bigbaby');
      this.growth.gauge = 0;
      this.growth.maxStageIndex = this.growth.stageIndex;
      this.nestLeft = true;
      this.clearedBosses.add('kiss');
      this.clearedBosses.add('sniff');
      this.score = cp.score;
      this.snacksEaten = cp.snacks;
      this.pendingFinale = 0;
    }
    if (__DEV_TOOLS__ && !boss && !this.registry.get('debugBossUsed')) {
      const q = new URLSearchParams(window.location.search).get('boss');
      if (q === 'kiss' || q === 'sniff' || q === 'witch') boss = q;
      this.registry.set('debugBossUsed', true);
    }
    if (boss) {
      const def = BOSSES[boss];
      this.growth.stageIndex = GROWTH_STAGES.findIndex((g) => g.id === def.atStage);
      this.growth.gauge = this.growth.stage.gaugeToNext ?? 0;
      this.growth.maxStageIndex = this.growth.stageIndex;
      this.nestLeft = true;
      if (boss === 'sniff' || boss === 'witch') this.clearedBosses.add('kiss');
      if (boss === 'witch') this.clearedBosses.add('sniff');
      this.pendingBoss = boss;
      this.score = data?.score ?? 0;
      this.snacksEaten = data?.snacks ?? 0;
    }
    this.registry.set('autoStart', !!data?.autoStart);
  }

  create(): void {
    this.scene.setVisible(true); // (엔딩 컷신에서 돌아올 때)
    this.visuals = this.registry.get('stageVisuals') as Record<GrowthStageId, StageVisual>;
    this.vis = this.visuals[this.growth.stage.id];
    this.buildBattleTextures();
    this.host = this.makeHost();

    this.sky = this.add.image(0, -40, '__DEFAULT').setOrigin(0, 0);
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
    // 보스전 분위기 그림자 (배경·땅 위, 캐릭터·간식·몬스터 아래 · 화면 고정)
    this.moodTint = this.add.rectangle(-100, -100, 3000, 3000, 0x1d1640, 0).setOrigin(0, 0).setDepth(3).setScrollFactor(0);
    this.moodLeaves = null;
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

    this.boomerang = new HairBoomerang(this);
    this.boomerang.onCaught = () => {
      // 머리카락이 다시 뽁! 붙음
      this.squash = 0.86;
      const h = this.headPos();
      this.sparkleEmitter.explode(4, h.x, h.y);
      if (this.time.now < this.attackBufferUntil) {
        this.attackBufferUntil = 0;
        this.throwHair();
      }
    };
    this.shieldSprite = this.add.image(0, 0, 'battle-shield').setOrigin(0.5, 1).setDepth(11.5).setVisible(false).setAlpha(0.85);

    // 떠오르는 글자 미리 만들어 둠 (첫 간식 때 텍스처 생성으로 멈칫하지 않게)
    this.popPool = [];
    for (let i = 0; i < 8; i++) this.popPool.push(this.add.image(0, 0, '__DEFAULT').setOrigin(0.5).setDepth(15).setVisible(false));
    // 자주 쓰는 글자는 미리 그려 둠
    for (const t of ['+5', '+10', '+20', '+30', '+40', '+50', '+60']) this.textTexture(t, '#fff4c2');
    for (const t of ['-20', '-25', '-30', '-35', '-50']) this.textTexture(t, '#ff8f8f');

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
    const onRequestStart = (opt?: RestartOptions): void => {
      if (this.state !== 'ready') return;
      // 이어하기(체크포인트) · 개발용 보스전 바로가기
      if (opt?.checkpoint || opt?.boss || opt?.devMonsters) this.scene.restart({ autoStart: true, ...opt });
      else this.startGame();
    };
    const onRestart = (opt?: RestartOptions): void => {
      if (opt?.toTitle) {
        this.scene.restart({});
        return;
      }
      const retry = opt?.checkpoint ? { checkpoint: true } : opt?.boss ? { boss: opt.boss, score: this.retryCarry.score, snacks: this.retryCarry.snacks } : {};
      this.scene.restart({ autoStart: true, ...retry });
    };
    const onAttack = (): void => this.throwHair();
    const onDodge = (): void => this.dodge();
    const onShield = (): void => this.raiseShield();
    const onSpecial = (): void => {
      if (this.state === 'playing') this.battle?.useSpecial();
    };
    // 킁카괴물 전용 필살기 '두바이 똥냄새 공격!' (같은 필살 게이지)
    const onSpecial2 = (): void => {
      if (this.state === 'playing') this.battle?.useSpecial2();
    };
    bus.on(EV.special2, onSpecial2);
    bus.on(EV.tap, onTap);
    bus.on(EV.requestPause, onPause);
    bus.on(EV.requestResume, onResume);
    bus.on(EV.restart, onRestart);
    bus.on(EV.requestStart, onRequestStart);
    bus.on(EV.attack, onAttack);
    bus.on(EV.special, onSpecial);
    bus.on(EV.dodge, onDodge);
    bus.on(EV.shield, onShield);
    const onEndingReplay = (): void => this.startEnding();
    bus.on(EV.endingReplay, onEndingReplay);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      bus.off(EV.endingReplay, onEndingReplay);
      this.scene.stop('EndingCine');
      bus.off(EV.shield, onShield);
      bus.off(EV.dodge, onDodge);
      bus.off(EV.attack, onAttack);
      bus.off(EV.special, onSpecial);
      bus.off(EV.special2, onSpecial2);
      this.battle?.destroy();
      this.battle = null;
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
      this.basePlayerX = VIEW.portraitPlayerX;
    } else {
      this.groundY = this.H - VIEW.groundHeight;
      this.basePlayerX = VIEW.playerX;
    }
    this.playerX = this.basePlayerX + this.pull;

    this.drawSky();
    this.sun.setPosition(this.W - 46, Math.max(28, Math.round(this.groundY * 0.22)));
    this.far.setPosition(0, this.groundY + 2).setSize(this.W, FAR_H);
    this.mid.setPosition(0, this.groundY + 2).setSize(this.W, MID_H);
    this.near.setPosition(0, this.groundY + 1).setSize(this.W, NEAR_H);
    if (this.bgImage) {
      // 원본의 groundRow 줄이 게임 땅 윗면에 오도록 확대 (위쪽은 화면 맨 위부터)
      const src = this.textures.get(TEX.bgImage).getSourceImage() as HTMLImageElement;
      // 가로: 원본 그림(숲 지붕 제외)의 맨 위가 화면 맨 위에 오도록 / 세로: 덜 확대해서 숲을 넓게 (위는 숲 지붕이 채움)
      const landscapeScale = this.groundY / (this.bgRow - this.bgTop);
      const minScale = this.groundY / this.bgRow; // 이보다 작으면 화면 위가 빔
      this.bgScale = this.H > VIEW.baseHeight ? Math.max(GAME_BG.portraitScale, minScale) : landscapeScale;
      this.bgImage
        .setPosition(0, Math.round((this.groundY - this.bgRow * this.bgScale) * VIEW.renderScale) / VIEW.renderScale)
        .setSize(this.W, Math.ceil(src.height * this.bgScale))
        .setTileScale(this.bgScale, this.bgScale);
      if (!this.inCastle) this.bgHaze?.clear().fillStyle(GAME_BG.hazeColor, GAME_BG.haze).fillRect(0, -80, this.W, this.groundY + 80);
      for (const b of this.backdrops) this.placeBackdrop(b.spr);
    }
    this.ground.setPosition(0, this.groundY).setSize(this.W, GROUND_TILE_H);
    // 성 안: 땅 띠도 승인된 성 안 그림의 바닥 부분 (같은 배율 · 바닥선 2줄 위부터)
    if (this.inCastle && this.ground.texture.key === CASTLE_ART.interior.key) this.ground.setTileScale(this.bgScale, this.bgScale).setTilePosition(this.ground.tilePositionX, this.bgRow - 2);

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
    // 따뜻한 오후 하늘: 위에서 아래로 띠 + 도트 디더링 경계 — 캔버스에 한 번 그려 텍스처 한 장으로
    const colors = ['#8ccbe0', '#9fd5e3', '#b4dfe2', '#cbe7dc', '#e3ecd0', '#f8eac0', '#fde1b0'];
    const extra = 40; // 높은 점프 때 카메라가 살짝 올라가도 빈 곳이 안 보이게
    const W = Math.max(1, this.W);
    const bottom = Math.max(1, this.groundY);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = bottom + extra;
    const ctx = c.getContext('2d')!;
    const bandH = Math.ceil(bottom / colors.length);
    colors.forEach((col, i) => {
      ctx.fillStyle = col;
      const y0 = i === 0 ? 0 : extra + i * bandH;
      ctx.fillRect(0, y0, W, (i === 0 ? extra : 0) + bandH + 1);
    });
    for (let i = 1; i < colors.length; i++) {
      const y = extra + i * bandH;
      ctx.fillStyle = colors[i - 1];
      for (let x = 0; x < W; x += 2) ctx.fillRect(x + (i % 2), y, 1, 1);
      ctx.fillStyle = colors[i];
      for (let x = 0; x < W; x += 2) ctx.fillRect(x + ((i + 1) % 2), y - 1, 1, 1);
    }
    const old = this.sky.texture.key;
    const key = `sky-${this.skySeq++}`;
    this.textures.addCanvas(key, c);
    this.sky.setTexture(key).setPosition(0, -extra);
    if (old.startsWith('sky-') && this.textures.exists(old)) this.textures.remove(old);
  }

  // ───────────────────────── 상태 전환 ─────────────────────────

  private handleTap(): void {
    if (this.state === 'ready') this.startGame();
    else if (this.state === 'playing') {
      // 흡입에 버티는 중엔 화면 터치로 점프하지 않음 (버티기 버튼 연타가 점프로 새지 않게)
      if (!this.battle?.jumpLocked) this.pressJump();
    } else if (this.state === 'paused') this.resumeGame();
  }

  private startGame(): void {
    this.state = 'playing';
    this.setHudVisible(true);
    sound.unlock();
    sound.startMusic();
    bus.emit(EV.start);
    if (this.pendingBoss) {
      const b = this.pendingBoss;
      this.pendingBoss = null;
      this.time.delayedCall(900, () => {
        if (this.state !== 'playing' || this.battle) return;
        // 최종 보스는 성 안에서 (이어하기 · 보스전 다시 — 마지막 모험은 건너뜀)
        if (b === 'witch') this.enterCastle(true);
        else this.startBoss(b);
      });
    } else if (this.pendingFinale !== null) {
      const t0 = this.pendingFinale;
      this.pendingFinale = null;
      this.time.delayedCall(600, () => {
        if (this.state === 'playing' && !this.battle) this.startFinale(t0);
      });
    }
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
    this.emitHud(); // 일시정지 중엔 update 가 멈추므로 버튼 비활성 표시를 바로 보냄
  }

  private resumeGame(): void {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.tweens.resumeAll();
    this.player.anims.resume();
    if (this.player.anims.currentFrame) this.player.setFrame(this.player.anims.currentFrame.frame.name);
    sound.startMusic(this.musicNow());
    bus.emit(EV.resume);
    this.emitHud();
  }

  private setHudVisible(v: boolean): void {
    // 하트·HP·성장 게이지·점수는 모두 화면 UI(ui/battleUi.ts) — 캔버스 HUD 는 쓰지 않음 (겹침 방지)
    void v;
    this.heartIcons.forEach((h) => h.setVisible(false));
    this.gaugeGfx?.setVisible(false);
    this.scoreText.setVisible(false);
  }

  // ───────────────────────── 점프 ─────────────────────────

  private pressJump(): void {
    if (this.battle?.mode === 'victory') return; // 보스 마지막 대사·퇴장 중엔 조작 없음
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
    perf.mark(isDouble ? 'doubleJump' : 'jump');
    this.vy = v;
    this.grounded = false;
    this.jumpsUsed = isDouble ? 2 : 1;
    this.squash = isDouble ? 1.12 : 1.18;
    haptics.play('jump');
    if (this.inNest) {
      // 둥지째 튀어오름: 아기는 둥지에 꾹 눌렸다가 따라 올라감 (아기가 직접 뛰지 않음)
      this.babyVel += isDouble ? 90 : 70;
      if (isDouble) {
        sound.doubleJump();
        this.sparkleEmitter.explode(6, this.playerX, this.nestBack.y - 6);
      } else {
        sound.nestJump();
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
    const rawDt = Math.min(deltaMs, 50) / 1000;
    // 필살기 슬로모션: 세상(땅·고나·투사체)만 느리게, 연출 타이머는 그대로
    const ts = this.battle?.timeScale ?? 1;
    const dt = rawDt * ts;
    const animTs = this.resisting ? ts * 2.6 : ts; // 버티기: 발을 빠르게 구름
    if (this.player.anims.timeScale !== animTs) this.player.anims.timeScale = animTs;
    if (this.state === 'evolving') {
      // 진화 연출 중: 세상은 멈추고 연출만 진행
      this.updateEvolution(dt, time);
      this.emitHud();
      return;
    }
    if (this.state === 'ending') return; // 가족 엔딩은 별도 컷신 씬(EndingCine)이 그림
    if (this.battle?.frozen) {
      // 보스전 연출(필살기·각성) 중: 세상은 멈추고 연출만
      this.battle.update(rawDt);
      this.placePlayer(dt, time);
      this.updateShield();
      this.emitHud();
      return;
    }

    if (this.halt && this.battle?.mode === 'fight') this.halt = false;
    if (this.halt && this.state === 'playing') {
      // 성 입구 도착 · 등장 컷신: 일정하게 감속해 완전히 멈춰 섬 (속도 회복 계산을 건너뜀 — 멈추는 지점에 성 입구 문이 오게)
      this.speed = Math.max(0, this.speed - HALT_DECEL * dt);
    } else if (this.state === 'playing' && this.battle) {
      // 보스전: 속도 고정, 장애물 없음
      this.speed += (SPEED.start - this.speed) * Math.min(1, dt * 2);
    } else if (this.state === 'playing') {
      this.elapsed += dt;
      // 오래 달릴수록 조금씩 빨라짐: SPEED.stepSec 마다 +3%(1·2단계) / +5%(3·4단계), 단계별 하한·상한 (보스전 시간은 세지 않음)
      const si = this.growth.stageIndex;
      this.speedStepT += dt;
      if (this.speedStepT >= SPEED.stepSec) {
        this.speedStepT -= SPEED.stepSec;
        this.speedMul += si >= 2 ? SPEED.stepLate : SPEED.stepEarly;
      }
      this.speedMul = Phaser.Math.Clamp(this.speedMul, SPEED.stageFloor[si], SPEED.stageCap[si]);
      // 목표 속도로 부드럽게 (갑자기 휙 빨라지지 않게 약 1초)
      const target = SPEED.start * this.speedMul;
      this.speed += (target - this.speed) * Math.min(1, dt * 1.2);
    } else if (this.state === 'cleared') {
      this.speed = SPEED.start * 0.8;
    } else if (this.state === 'dead') {
      this.speed = Math.max(0, this.speed - 260 * dt);
    } else {
      this.speed = SPEED.start * 0.8;
    }

    const move = this.speed * dt;
    this.distance += move;
    this.scrollBackground(dt);

    this.playerX = this.basePlayerX + this.pull;
    if (this.state !== 'dead') this.updatePlayer(dt, time);

    if (this.finale && this.state === 'playing' && !this.battle) this.finale.update(dt);
    if (this.state === 'playing' && !this.battle && !this.finale && !this.inCastle && !this.halt) {
      this.eventT -= dt;
      this.sinceMonster += dt;
      this.distToNext -= move;
      if (this.distToNext <= 0) this.distToNext = this.spawnPattern() + this.randomGap();
    }

    this.updateEntities(move, time, dt);
    this.syncMonsterTags();
    if (this.battle && this.state === 'playing') this.battle.update(rawDt);
    this.updateBoomerang(dt);
    this.updateShield();
    this.emitHud();
  }

  private scrollBackground(dt: number): void {
    // 스크롤은 캔버스 픽셀(논리 1/5) 단위로 — 논리 1px(=5 캔버스 px) 단위로 자르면 한 프레임 5px·10px 로 들쭉날쭉 움직여 끊겨 보임
    const sp = (v: number): number => Math.round(v * VIEW.renderScale) / VIEW.renderScale;
    this.ground.tilePositionX = this.inCastle && this.ground.texture.key === CASTLE_ART.interior.key ? sp(this.distance) / this.bgScale : sp(this.distance);
    this.updateBackdrops(dt);
    if (this.near.visible) this.near.tilePositionX = sp(this.distance * 0.7);
    if (this.mid.visible) this.mid.tilePositionX = sp(this.distance * 0.35);
    if (this.far.visible) this.far.tilePositionX = sp(this.distance * 0.1);
    if (this.bgImage) this.bgImage.tilePositionX = sp(this.distance * GAME_BG.scroll) / this.bgScale;
    // 폭포 물 흐름 (2프레임 교대)
    this.waterfallTimer += dt;
    if (this.far.visible && this.waterfallTimer > 0.22) {
      this.waterfallTimer = 0;
      this.far.setTexture(this.far.texture.key === TEX.far ? TEX.far2 : TEX.far);
    }
    for (const c of this.bgImage ? [] : this.clouds) {
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

    // 머리카락 부메랑을 던진 동안은 머리카락이 빠진 그림 (-bald)
    const bald = this.isBald();
    const wantAnim = (this.grounded ? this.vis.runAnim : this.vis.jumpAnim) + (bald ? '-bald' : '');
    if (this.specialLook) {
      // 필살기 연출: 진지한 얼굴 그림 고정 (setSpecialLook 이 정함)
    } else if (time < this.hurtUntil && this.textures.exists(`hurt-${this.vis.id}`)) {
      // 아파! 표정 (같은 단계·같은 포즈 그림에 얼굴만 찡그림) — 처음 0.26초는 머리카락이 흔들
      if (this.player.anims.isPlaying) this.player.anims.stop();
      const t = time - this.hurtAt;
      const jig = t < 260 ? Math.floor(t / 65) % 2 : 0;
      this.player.setTexture(`hurt-${this.vis.id}`, (bald ? 2 : 0) + jig);
    } else if (this.hurtUntil > 0) {
      // 끝나면 지금 상태(달리기/점프)로 복귀
      this.hurtUntil = 0;
      this.exprFrame = -1;
      this.player.play(wantAnim);
    } else if (this.exprFrame >= 0) {
      if (time < this.exprUntil) {
        // 표정 연출 중: 그림만 바꾸고 위치·물리·충돌 박스는 그대로
        if (this.player.anims.isPlaying) this.player.anims.stop();
        this.player.setTexture(bald ? `${this.vis.texture}-bald` : this.vis.texture, this.exprFrame);
      } else {
        // 끝나면 지금 상태(달리기/점프)로 자연스럽게 복귀
        this.exprFrame = -1;
        this.player.play(wantAnim);
      }
    } else if (this.halt && this.grounded && this.speed < 8) {
      // 성 입구에서 멈춰 섬 (대기 포즈)
      if (this.player.anims.isPlaying) this.player.anims.stop();
      this.player.setFrame(this.vis.idleFrame);
    } else if (this.player.anims.currentAnim?.key !== wantAnim) {
      this.player.play(wantAnim);
    }

    // 갓난아기: 땅에서 꼬물꼬물 흔들림
    if (this.grounded && this.vis.wiggleDeg > 0) this.player.angle = Math.sin(time * this.vis.wiggleSpeed) * this.vis.wiggleDeg;

    this.placePlayer(dt, time);

    if (!perf.low && this.grounded && this.state === 'playing' && Math.random() < dt * (this.inNest ? 9 : 6)) {
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
    // (발을 번갈아 딛는 달리기 프레임이 있으면 몸 전체를 띄우지 않음 — 걷는 동안에도 발이 땅에 닿게)
    const bobAmp = this.vis.runFrames.length < 2 ? Math.max(2, this.vis.bob) : 0;
    const bob = this.grounded && this.state === 'playing' && bobAmp > 0 ? Math.abs(Math.sin(time * 0.018)) * bobAmp : 0;

    const halfH = (this.vis.frameHeight * sy) / 2;
    // 발 = (땅 - 높이). 렌더 픽셀 격자에 맞춰 반올림해서 서 있을 때 발이 정확히 지면에 닿게
    // 발 = (땅 - 높이) + FOOT_SINK: 땅 그림 맨 윗줄은 밝은 풀 가장자리라, 발바닥이 그 줄에 걸쳐야 '서 있는' 것처럼 보임
    // (그림만 내림 — 충돌 판정·점프 높이는 alt 기준이라 그대로)
    let feetY = Math.round((this.groundY - this.alt - bob + FOOT_SINK) * k) / k;
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
      const nestBottom = snap(this.groundY - this.alt - bump + FOOT_SINK);
      const nsx = snap(this.vis.scale * (2 - this.squash));
      const nsy = snap(this.vis.scale * this.squash);
      for (const n of [this.nestBack, this.nestFront]) n.setPosition(snap(this.playerX + shakeX), nestBottom).setScale(nsx, nsy).setAngle(tilt);
      // 아기 발 = 둥지 바닥에서 (둥지 높이 - 묻히는 깊이)만큼 위 + 출렁
      feetY = snap(nestBottom - (NEST_H - NEST_SINK - 1) * nsy + this.babyOff);
      this.player.setPosition(snap(this.playerX + shakeX), feetY - halfH);
    } else {
      this.player.setPosition(snap(this.playerX - this.hurtKick * 4), feetY - halfH);
    }
    this.hurtKick = Math.max(0, this.hurtKick - dt / 0.3);

    if (nest) feetY = snap(this.groundY - this.alt); // 화면 위 여유 계산은 둥지 기준
    // 아주 높은 더블 점프로 머리가 화면 위로 나가면, 그만큼만 카메라를 살짝 올림 (물리·판정은 그대로)
    const headTop = feetY - this.vis.frameHeight * sy;
    const lift = Math.min(0, Math.round((headTop - 2) * k) / k);
    this.cameras.main.scrollY = lift;

    const shadowScale = Math.max(0.35, 1 - this.alt / 110);
    const shadowW = nest ? (NEST_W * this.vis.scale) / 14 : Math.max(1, this.vis.scale);
    this.shadow.setPosition(this.playerX, this.groundY + FOOT_SINK).setScale(shadowScale * shadowW, 1);

    // 무적 깜빡임
    if (time < this.invincibleUntil) this.player.setAlpha(Math.floor(time / 110) % 2 ? 0.55 : 1); // 은은하게
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
    // 2단계부터 드물게 별 젤리
    if (this.growth.stageIndex >= 1 && r < 0.05) return 'jelly';
    return r < 0.55 ? 'strawberry' : r < 0.85 ? 'banana' : 'cookie';
  }

  /** 다음 '간식 비' 이벤트까지(초) — 성장이 길어진 만큼 중간중간 즐길 거리 */
  private eventT = 35;

  /** 간식 비: 안내 + 무지개 모양 간식 줄 (바위 없음) */
  private snackRain(x0: number): number {
    this.eventCount++;
    bus.emit(EV.banner, { top: '🍓 이벤트', name: '간식 비가 내려요!', desc: '하늘에서 간식이 쏟아져요', ms: 1800, tone: 'good' });
    sound.newRecord();
    const n = 9;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const alt = 6 + Math.sin(t * Math.PI) * 52;
      this.addSnack(i === Math.floor(n / 2) ? 'jelly' : this.randomSnack(), x0 + i * 20, alt);
    }
    for (let i = 0; i < 4; i++) this.addSnack(this.randomSnack(), x0 + 30 + i * 30, 4);
    return n * 20 + 40;
  }

  /** 패턴 하나를 화면 오른쪽 밖에 만들고 그 길이(px)를 돌려줍니다. */
  private spawnPattern(): number {
    const x0 = this.W + 20;
    if (this.eventT <= 0) {
      this.eventT = 45 + Math.random() * 20;
      return this.snackRain(x0);
    }
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

    // 3단계부터 일반 몬스터 (뽀뽀괴물을 이기고 부메랑을 얻은 뒤) — 처음엔 한 마리씩, 성장할수록 조금씩 자주
    const alive = this.entities.filter((e) => !e.done && e.type === 'monster').length;
    const mw = this.clearedBosses.has('kiss') && alive < maxMonsters(this.growth.stageIndex) ? monsterWeight(this.growth.stageIndex, this.growth.ratio) : 0;
    if (mw > 0) {
      // 오래 안 나왔으면(3단계 14초 · 4단계 10초) 이번엔 꼭 몬스터 — 무작위라 한참 안 보이는 일 방지
      const due = this.sinceMonster >= (this.growth.stageIndex >= 3 ? 10 : 14);
      if (due) {
        this.addMonster(Math.random() < 0.55 ? 'glasses' : 'farter', x0 + 10);
        return 40 + Math.round(this.speed * 0.9);
      }
      for (const kind of ['glasses', 'farter'] as const) {
        patterns.push({
          w: mw * (kind === 'glasses' ? 0.55 : 0.45),
          run: () => {
            this.addMonster(kind, x0 + 10);
            // 몬스터 뒤로 넉넉한 빈칸 (바위·몬스터·투사체가 한꺼번에 겹치지 않게)
            return 40 + Math.round(this.speed * 0.9);
          },
        });
      }
    }

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

  private updateEntities(move: number, time: number, dt = 0): void {
    const p = this.playerBox();
    for (const e of this.entities) {
      e.x -= move + (e.vx ?? 0) * dt;
      if (e.done) continue;
      if (e.type === 'monster') this.updateMonster(e, dt, time);
      if (e.grav && e.valt !== undefined) {
        e.valt -= e.grav * dt;
        e.alt += e.valt * dt;
        if (e.alt <= 0) {
          this.breakFlask(e, true);
          continue;
        }
      }
      if (e.follow) {
        if (e.follow.done) {
          e.done = true;
          e.sprite.destroy();
          continue;
        }
        e.x = e.follow.x + (e.fxOff ?? 0);
      }
      if (e.life !== undefined) {
        e.life -= dt;
        if (e.life < 0.4) e.sprite.setAlpha(Math.max(0, e.life / 0.4));
        if (e.life <= 0) {
          e.done = true;
          e.sprite.destroy();
          continue;
        }
      }
      let bob = e.type === 'snack' ? Math.round(Math.sin(time * 0.006 + e.phase) * 1.5) : 0;
      if (e.age !== undefined) {
        e.age += dt;
        const spr = e.sprite as unknown as Phaser.GameObjects.Sprite;
        if (e.type === 'mshot') {
          spr.setFrame(Math.floor(e.age / 0.1) % 3); // 플라스크 물약 보글보글
        } else if (e.type === 'puddle') {
          spr.setFrame(Math.floor(e.age / 0.2) % 2);
        } else if (e.type === 'cloud') {
          // 팡! 작게 → 부풀어 오름 → 크게 뭉게뭉게(끓듯이 두 장 번갈아)
          spr.setFrame(e.age < 0.08 ? 0 : e.age < 0.22 ? 1 : 2 + (Math.floor(e.age / 0.25) % 2));
        } else if (e.type === 'fx' && spr.texture.key === 'mon-pop') spr.setFrame(e.age < 0.09 ? 0 : 1);
        else if (e.type === 'fx' && spr.texture.key === 'mon-shatter') spr.setFrame(e.age < 0.1 ? 0 : 1);
        else if (e.type === 'fx' && spr.texture.key === 'mon-flask') spr.setFrame(Math.floor(e.age / 0.12) % 3); // 손에 든 플라스크 보글보글
      }
      e.sprite.setPosition(Math.round(e.x * VIEW.renderScale) / VIEW.renderScale, Math.round(this.groundY - e.alt + bob));

      if (this.state === 'playing' && e.type !== 'fx') {
        const left = e.x - e.w / 2;
        const right = e.x + e.w / 2;
        const bottom = e.alt;
        const top = e.alt + e.h;
        if (right > p.left && left < p.right && top > p.bottom && bottom < p.top) {
          if (e.type === 'snack') this.collect(e);
          else if (e.type === 'rock') this.hitRock(e);
          else if (!e.hit && this.hurtHp(e.dmg ?? 20, e.type === 'monster' ? `mon-${e.mon?.kind}` : e.type)) {
            if (e.type === 'mshot') {
              if (e.grav) this.breakFlask(e, false); // 고나에게 맞음 → 그 자리에서 깨짐 (웅덩이 없이)
              else {
                e.done = true;
                e.sprite.destroy();
              }
            } else if (e.type === 'cloud' || e.type === 'puddle') e.hit = true;
          }
        }
      }
    }
    // 화면 밖으로 나간 것 정리 (정리할 게 있을 때만 새 배열 — 매 프레임 쓰레기 줄이기)
    let dirty = false;
    for (const e of this.entities) {
      if (((e.x < -30 || e.x > this.W + 400) && !e.done) || (e.done && !e.sprite.active)) {
        dirty = true;
        break;
      }
    }
    if (dirty) {
      this.entities = this.entities.filter((e) => {
        if ((e.x < -30 || e.x > this.W + 400) && !e.done) {
          e.sprite.destroy();
          return false;
        }
        return !(e.done && !e.sprite.active);
      });
    }
  }

  // ───────────────────────── 일반 몬스터 ─────────────────────────

  private monsterSeq = 1;
  /** 몬스터 이름표 */
  private monTags = new Map<Entity, Phaser.GameObjects.Image>();

  /** 이름표: 몬스터 머리 바로 위 (화면 위로 잘리지 않게) · 몬스터가 사라지면 같이 삭제 */
  private syncMonsterTags(): void {
    if (!this.monTags.size) return;
    for (const [e, tag] of this.monTags) {
      if (e.done || !e.sprite.active) {
        tag.destroy();
        this.monTags.delete(e);
        continue;
      }
      const top = this.groundY - e.alt - e.sprite.displayHeight - 2;
      const half = tag.displayWidth / 2;
      tag.setPosition(Math.round(Phaser.Math.Clamp(e.x, half + 1, this.W - half - 1) * 5) / 5, Math.round(Math.max(tag.displayHeight + 1, top) * 5) / 5);
    }
  }

  private addMonster(kind: MonsterKind, x: number): void {
    const d = MONSTERS[kind];
    const sprite = this.add.image(x, 0, `mon-${kind}`, 0).setOrigin(0.5, 1).setDepth(6);
    this.spawned++;
    this.sinceMonster = 0;
    this.entities.push({ sprite, type: 'monster', x, alt: 0, w: d.box.w, h: d.box.h, phase: 0, done: false, vx: 0, dmg: d.bodyDamage, mon: { kind, hp: d.hp, cd: 0.8, tele: 0, flash: 0, id: this.monsterSeq++, burst: 0, burstT: 0, post: 0, attacks: 0, dashTele: 0, dashT: 0, recover: 0 } });
    // 머리 위 이름표 ([화학과안경잽이] · [방구할배]) — 몬스터를 따라다니고 사라지면 같이 지움 (syncMonsterTags)
    const tag = this.add.image(x, 0, this.textTexture(`[${d.name}]`, kind === 'glasses' ? '#e8d4ff' : '#f2ffc8')).setOrigin(0.5, 1).setScale(0.5).setDepth(6.95);
    this.monTags.set(this.entities[this.entities.length - 1], tag);
  }

  private updateMonster(e: Entity, dt: number, time: number): void {
    const m = e.mon!;
    const d = MONSTERS[m.kind];
    const dx = e.x - this.playerX;
    const onScreen = e.x < this.W - 6;
    const stopped = m.tele > 0 || m.post > 0 || m.dashTele > 0 || m.recover > 0;
    // 이동 (vx = 땅 흐름보다 더 왼쪽으로 가는 속도 → 화면 속도 = -(speed + vx))
    //   화면 밖: 빨리 들어옴 · 화면 안: 고나 쪽으로 계속 천천히 · 예고·뀐 직후만 잠깐 멈춤
    //   안경잽이는 현금다발을 쏘는 동안에도 조금씩(절반 속도) 다가옴 · 고나를 지나치면 땅과 함께 지나감
    const approach = Math.max(d.approach, (this.W - this.playerX) / d.travelSec) * (m.burst > 0 ? 0.5 : 1);
    if (m.dashT > 0) e.vx = MONSTER_DASH.speed - this.speed; // 돌진: 화면에서 빠르게 고나 쪽으로
    else if (stopped) e.vx = -this.speed;
    else if (!onScreen) e.vx = d.walk;
    else if (dx < -4) e.vx = 0;
    else e.vx = approach - this.speed;
    // 그림: 걷기 2프레임(아저씨는 배가 출렁) · 예고 프레임 · 맞으면 하얗게
    let frame = Math.floor(time / (m.kind === 'farter' ? 260 : 200)) % 2;
    if (m.kind === 'glasses' && (m.tele > 0 || m.burst > 0)) frame = 2; // 안경 번쩍
    if (m.kind === 'farter') {
      if (m.tele > 0) {
        // 엉덩이 뒤로 쭉(0.35초) → 씰룩 씰룩
        const t = d.telegraph - m.tele;
        frame = t < 0.35 ? 2 : 2 + (Math.floor((t - 0.35) / 0.1) % 2);
      } else if (m.post > 0) frame = 4; // 능청스러운 만족 표정
    }
    // 돌진: 예고(안경 번쩍 + 몸 뒤로 젖힘 / 배 내밀고 출렁) → 앞으로 기울여 다다다 → (안경잽이) 비틀비틀
    let ang = 0;
    let sx = 1;
    if (m.dashTele > 0) {
      const t = MONSTER_DASH.telegraph - m.dashTele;
      if (m.kind === 'glasses') {
        frame = 2;
        ang = Math.min(1, t / 0.25) * 9;
      } else {
        frame = 0;
        sx = 1 + Math.abs(Math.sin(t * 18)) * 0.12 * Math.max(0, 1 - t / 0.5); // 배가 한 번 출렁
        ang = -4;
      }
    } else if (m.dashT > 0) {
      frame = Math.floor(time / 70) % 2;
      ang = -8;
    } else if (m.recover > 0) {
      ang = Math.sin(m.recover * 22) * 7;
    }
    e.sprite.setAngle(ang).setScale(sx, 1);
    const total = e.sprite.texture.frameTotal - 1;
    e.sprite.setFrame(Math.min(frame, total - 1));
    if (m.flash > 0) {
      m.flash -= dt;
      e.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      if (m.flash <= 0) e.sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    }
    if (this.state !== 'playing' || this.battle) return;
    if (m.post > 0) {
      m.post -= dt;
      return;
    }
    // 돌진 예고 → 돌진 → 숨 고르기 (방구할배는 돌진 끝에 바로 엉덩이 내밀고 방귀)
    if (m.dashTele > 0) {
      m.dashTele -= dt;
      if (m.dashTele <= 0) {
        m.dashT = MONSTER_DASH.time;
        sound.boing();
        this.dustEmitter.explode(perf.low ? 2 : 4, e.x + 6, this.groundY - 2);
      }
      return;
    }
    if (m.dashT > 0) {
      m.dashT -= dt;
      if (!perf.low && Math.random() < dt * 20) this.dustEmitter.explode(1, e.x + 6, this.groundY - 2);
      if (m.dashT <= 0) {
        if (m.kind === 'farter') m.tele = d.telegraph;
        else m.recover = MONSTER_DASH.recover;
      }
      return;
    }
    if (m.recover > 0) {
      m.recover -= dt;
      return;
    }
    // 플라스크 연속 투척
    if (m.burst > 0) {
      m.burstT -= dt;
      if (m.burstT <= 0) {
        m.burst--;
        m.burstT = 0.75;
        this.throwFlask(e);
      }
      return;
    }
    // 공격 예고(안경 번쩍 / 엉덩이 내밀기) 동안 멈춤 → 공격
    if (m.tele > 0) {
      m.tele -= dt;
      if (m.tele <= 0) this.monsterAttack(e);
      return;
    }
    m.cd -= dt;
    if (!onScreen || dx < d.minDist) return;
    // 고나와 몬스터 사이에 바위·다른 공격이 있으면 쏘지 않음 (한 번에 못 피하는 상황 방지)
    const blocked = this.entities.some((o) => !o.done && (o.type === 'rock' || o.type === 'mshot' || o.type === 'cloud' || o.type === 'puddle') && o.x > this.playerX - 10 && o.x < e.x);
    if (m.cd <= 0 && !blocked) {
      m.attacks++;
      // 가끔 돌진 (처음 공격은 절대 아님 · 너무 가깝거나 멀면 안 함) — 반드시 0.7초 예고 ('!' + 안경 번쩍/배 출렁)
      if (m.attacks > 1 && dx > MONSTER_DASH.minDist && dx < MONSTER_DASH.maxDist && (this.debugForceDash || Math.random() < MONSTER_DASH.chance)) {
        m.dashTele = MONSTER_DASH.telegraph;
        m.cd = d.cooldownFar;
        sound.warn();
        this.floatText('!', e.x, this.groundY - e.h - 12, '#ffef7a');
        if (m.kind === 'glasses') this.sparkleEmitter.explode(perf.low ? 2 : 4, e.x - 4, this.groundY - 14);
        return;
      }
      m.tele = d.telegraph;
      if (m.kind === 'glasses') {
        // 안경 번쩍 + 앞에 보라 물약 플라스크를 꺼냄 (보글보글)
        sound.boing();
        this.sparkleEmitter.explode(perf.low ? 2 : 4, e.x - 4, this.groundY - 14);
        m.burstN = Math.random() < 0.5 ? 2 : 3;
        this.addFx('mon-flask', e, -11, 3, d.telegraph + 0.75 * (m.burstN - 1) + 0.2);
      }
    }
  }

  /** 연출용 그림 (충돌 없음 · 대상을 따라다니고 대상이 사라지면 같이 사라짐) */
  private addFx(tex: string, follow: Entity, off: number, alt: number, life: number): Entity {
    const sprite = this.add.sprite(follow.x + off, 0, tex, 0).setOrigin(0.5, 1).setDepth(6.4);
    const fx: Entity = { sprite: sprite as unknown as Phaser.GameObjects.Image, type: 'fx', x: follow.x + off, alt, w: 1, h: 1, phase: 0, done: false, vx: 0, life, age: 0, hit: true, follow, fxOff: off };
    this.entities.push(fx);
    return fx;
  }

  private monsterAttack(e: Entity): void {
    const m = e.mon!;
    const d = MONSTERS[m.kind];
    // 가까울수록 자주 (멀 때 cooldownFar → 가까울 때 cooldownNear)
    const span = Math.max(1, this.W - this.playerX - d.minDist);
    const near = Phaser.Math.Clamp(1 - (e.x - this.playerX - d.minDist) / span, 0, 1);
    m.cd = d.cooldownFar + (d.cooldownNear - d.cooldownFar) * near;
    if (m.kind === 'glasses') {
      // 플라스크 2~3개 연속 투척 (0.75초 간격 — 하나씩 점프로 넘을 수 있게)
      this.throwFlask(e);
      m.burst = (m.burstN ?? d.burstCount) - 1;
      m.burstT = 0.75;
    } else {
      // 더러운 공기 팡! — 반드시 엉덩이(몸 뒤쪽 아래)에서 터짐 → 황록 구름이 부풀며 고나 쪽으로 퍼짐
      sound.fart();
      const buttX = e.x + 8;
      const sprite = this.add.sprite(buttX, 0, 'mon-cloud', 0).setOrigin(0.5, 1).setDepth(6.5);
      this.entities.push({ sprite: sprite as unknown as Phaser.GameObjects.Image, type: 'cloud', x: buttX, alt: 1, w: 18, h: 13, phase: 0, done: false, vx: 16, life: 3.0, dmg: d.shotDamage, age: 0 });
      const pop = this.addFx('mon-pop', e, 10, 3, 0.22);
      pop.follow = undefined; // 터진 자리에 남음
      this.dustEmitter.explode(perf.low ? 2 : 4, buttX + 3, this.groundY - 6);
      m.post = 0.7;
    }
  }

  /**
   * 안경잽이몹 보라 물약 플라스크: 포물선으로 던져 고나 근처(조금 앞)에 떨어짐.
   * 날아오는 플라스크에 맞으면 HP -20 · 땅에 닿으면 '팡' 깨지며 보라 물약이 잠깐 퍼짐(밟으면 -15) → 점프로 넘기 / 부메랑으로 공중에서 깨기
   */
  private throwFlask(e: Entity): void {
    if (e.done) return;
    const d = MONSTERS.glasses;
    sound.flaskThrow();
    const x = e.x - 11;
    const alt0 = 8;
    const T = 0.8 + Math.random() * 0.2;
    const g = 220;
    // 떨어질 곳: 고나 바로 앞 ~ 고나 자리 (화면 기준) → 그동안 땅이 흘러가며 고나 쪽으로 다가옴
    const target = this.playerX + 4 + Math.random() * 22;
    const vx = (x - target) / T - this.speed;
    const sprite = this.add.sprite(x, 0, 'mon-flask', 0).setOrigin(0.5, 1).setDepth(6.5);
    this.entities.push({ sprite: sprite as unknown as Phaser.GameObjects.Image, type: 'mshot', x, alt: alt0, w: 8, h: 10, phase: 0, done: false, vx, dmg: d.shotDamage, age: 0, valt: (g * T * T * 0.5 - alt0) / T, grav: g });
  }

  /** 플라스크가 깨짐: 유리 조각·보라 물방울 '팡!' (+ 땅에 닿았으면 물약 웅덩이) */
  private breakFlask(e: Entity, puddle: boolean): void {
    e.done = true;
    e.sprite.destroy();
    sound.glassBreak();
    const y = puddle ? 0 : Math.max(0, e.alt);
    const sh = this.add.sprite(e.x, this.groundY - y, 'mon-shatter', 0).setOrigin(0.5, 1).setDepth(6.6);
    this.entities.push({ sprite: sh as unknown as Phaser.GameObjects.Image, type: 'fx', x: e.x, alt: y, w: 1, h: 1, phase: 0, done: false, vx: 0, life: 0.3, age: 0, hit: true });
    if (!puddle) return;
    const pd = this.add.sprite(e.x, this.groundY, 'mon-puddle', 0).setOrigin(0.5, 1).setDepth(5.2);
    this.entities.push({ sprite: pd as unknown as Phaser.GameObjects.Image, type: 'puddle', x: e.x, alt: 0, w: 14, h: 4, phase: 0, done: false, vx: 0, life: 1.6, dmg: 15, age: 0 });
  }

  /** 부메랑에 맞음 → 체력 -1, 0 이면 처치 (점수·필살 게이지·간식) */
  private hitMonster(e: Entity): void {
    const m = e.mon!;
    const d = MONSTERS[m.kind];
    m.hp--;
    m.flash = 0.12;
    m.tele = 0;
    e.x += 6; // 뒤로 밀림
    sound.bossHit();
    haptics.play('monsterHit');
    this.sparkleEmitter.explode(perf.low ? 2 : 4, e.x, this.groundY - e.h / 2);
    this.cameras.main.shake(60, 0.003);
    if (m.hp > 0) return;
    e.done = true;
    sound.pickup(30);
    this.dustEmitter.explode(perf.low ? 4 : 10, e.x, this.groundY - 6);
    this.sparkleEmitter.explode(perf.low ? 4 : 8, e.x, this.groundY - 10);
    this.tweens.add({ targets: e.sprite, scale: 1.5, alpha: 0, angle: 20, y: e.sprite.y - 6, duration: 260, onComplete: () => e.sprite.destroy() });
    this.addPoints(d.score, e.x, this.groundY - 22);
    this.specialCarry = Math.min(1, this.specialCarry + d.special);
    this.kills++;
    if (Math.random() < d.dropChance) this.addSnack(Math.random() < 0.15 ? 'jelly' : this.randomSnack(), e.x, 4);
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
    haptics.play('snack');
    if (this.vis.happyFrame >= 0) this.showExpression(this.vis.happyFrame, CHARACTER_ASSET.happyMs);
    else if (this.inNest) this.babyVel = -150; // 둥지에서 퐁! 솟았다 쏙
    else this.squash = 0.8; // 표정 프레임이 없는 단계는 통통 반응

    if (this.battle) {
      // 보스전 중: 성장 대신 필살 게이지
      this.battle.onSnack();
    } else {
      // 성장 게이지 (점수와 별개로 증가)
      const full = this.growth.add(SNACK_GROWTH[e.snack ?? 'strawberry']);
      this.updateHud();
      if (full) this.onGaugeFull();
    }
    this.sparkleEmitter.explode(5, e.sprite.x, e.sprite.y - 6);

    this.tweens.add({
      targets: e.sprite,
      y: e.sprite.y - 14,
      scale: 1.6,
      alpha: 0,
      duration: 260,
      onComplete: () => e.sprite.destroy(),
    });

    this.floatText(`+${info.points}`, e.sprite.x, e.sprite.y - 14, '#fff4c2');

    this.tweens.add({ targets: this.scoreText, scale: 1.25, duration: 80, yoyo: true });
  }

  private hitRock(e: Entity): void {
    if (!this.hurtHp(ROCK_DAMAGE, 'rock')) return;
    this.tweens.add({ targets: e.sprite, angle: { from: -8, to: 8 }, duration: 60, yoyo: true, repeat: 2 });
    // 살짝 튕겨 오르기 (바위 위로 넘어가게)
    if (this.grounded && this.state === 'playing') {
      this.vy = 170;
      this.grounded = false;
      this.jumpsUsed = 1;
    }
  }

  // ───────────────────────── 보스전 체력 · 방패 ─────────────────────────

  /** 방패: 보스전 전용 (일반 스테이지에선 버튼도 입력도 없음) */
  private get shieldOn(): boolean {
    return !!this.battle && this.time.now < this.shieldUntil;
  }

  /**
   * 보스 공격에 맞음: HP 만 깎임. HP 0 → 하트 -1 (남은 하트가 있으면 HP 100 으로, 넘친 피해는 버림)
   * 맞은 직후 짧은 무적, 하트를 잃은 직후 1.5초 무적. 방패 중엔 피해 0.
   */
  /** (검증용) 받은 피해 기록 */
  readonly damageLog: string[] = [];
  lastAttackLog: string[] = [];

  private hurtBattle(damage: number, source = '?'): boolean {
    return this.hurtHp(damage, source);
  }

  /**
   * 체력 (보스전·일반 스테이지 공통): 하트 3개 × HP 100.
   * 맞으면 HP 만 깎이고, 0 이 되면 하트 -1 → 남은 하트가 있으면 HP 100 (넘친 피해는 버림).
   * 맞은 직후 0.7초 · 하트 잃은 직후 1.5초 무적. 방패 중엔 피해 0.
   */
  private hurtHp(damage: number, source = '?'): boolean {
    if (this.state !== 'playing') return false;
    if (this.shieldOn) return false;
    if (this.time.now < this.invincibleUntil) return false;
    if (this.battle?.protectPlayer) return false; // 필살기 연출 중 무적
    this.damageLog.push(`${source}:${damage}`);
    if (this.damageLog.length > 60) this.damageLog.shift();
    this.hp = Math.max(0, this.hp - damage);
    sound.hit();
    haptics.play('hurt');
    // 아파! — 단계별 찡그린 표정 0.5초 + 움찔(찌그러짐) + 살짝 뒤로 밀림 + 머리카락 흔들
    this.hurtUntil = this.time.now + 500;
    this.hurtAt = this.time.now;
    this.hurtKick = 1;
    this.squash = 0.8;
    // 맞은 순간 고나가 빨갛게 번쩍 (짧은 색 변화 — 진동 없는 기기에서도 피격이 확실히 보이게)
    this.player.setTint(0xff7a7a);
    this.time.delayedCall(110, () => this.player.clearTint());
    this.floatText(`-${damage}`, this.playerX, this.player.y - this.player.displayHeight / 2 - 4, '#ff8f8f');
    if (this.inNest) {
      this.nestShake = 0.35; // 둥지가 덜컹
      this.babyVel = -90;
    }
    if (this.hp > 0) {
      this.invincibleUntil = this.time.now + BATTLE_HP.hitInvulnMs;
      this.cameras.main.shake(120, 0.006);
      this.cameras.main.flash(90, 255, 140, 130);
      return true;
    }
    // 하트 하나 잃음
    this.hearts = Math.max(0, this.hearts - 1);
    this.updateHud();
    this.cameras.main.shake(220, 0.014);
    this.cameras.main.flash(160, 255, 110, 100);
    if (this.hearts <= 0) {
      this.die();
      return true;
    }
    this.hp = BATTLE_HP.perHeart;
    this.invincibleUntil = this.time.now + BATTLE_HP.heartLossInvulnMs;
    return true;
  }

  /** 방패 버튼: 고나 앞에 1초 동안 반투명 방패 */
  private raiseShield(): void {
    if (!this.battle || this.state !== 'playing' || this.battle.frozen || this.battle.mode === 'victory') return;
    // 강력한 흡입 중: 방패 버튼 = '버티기!' (한 번 누를 때마다 한 번)
    if (this.battle.resistActive) {
      this.battle.resistTap();
      return;
    }
    // 코 조준 중: 방패 잠금 (발사! 버튼만)
    if (this.battle.qteBusy) return;
    if (this.time.now < this.shieldReadyAt) return;
    this.shieldUntil = this.time.now + SHIELD.activeMs;
    this.shieldReadyAt = this.time.now + SHIELD.cooldownMs;
    this.battle.onShieldRaised();
    sound.shield();
    this.updateShield();
    this.sparkleEmitter.explode(perf.low ? 3 : 6, this.shieldSprite.x, this.shieldSprite.y - 12);
  }

  /** 방패 영역 (고나 앞쪽, 키보다 조금 크게) */
  private shieldRect(): { x0: number; y0: number; x1: number; y1: number } | null {
    if (!this.shieldOn) return null;
    const feet = this.groundY - this.alt;
    return { x0: this.playerX - 2, x1: this.playerX + 20, y0: feet - 38, y1: feet + 2 };
  }

  private updateShield(): void {
    const on = this.shieldOn;
    if (!on) {
      if (this.shieldSprite.visible) this.shieldSprite.setVisible(false);
      return;
    }
    const left = this.shieldUntil - this.time.now;
    // 끝나기 직전엔 깜빡
    const a = left < 250 ? (Math.floor(left / 60) % 2 ? 0.3 : 0.75) : 0.8 + Math.sin(this.time.now * 0.02) * 0.1;
    this.shieldSprite
      .setVisible(true)
      .setAlpha(a)
      .setPosition(Math.round(this.playerX + 11), Math.round(this.groundY - this.alt + 2));
  }

  private die(): void {
    this.cameras.main.scrollY = 0;
    this.state = 'dead';
    const bossRetry = this.battle?.id;
    if (this.battle) this.lastAttackLog = this.battle.attackLog;
    this.battle?.destroy();
    this.battle = null;
    this.pull = 0;
    this.boomerang.reset();
    this.resetMood();
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
        bossRetry,
      };
      bus.emit(EV.gameOver, info);
    });
  }

  private updateHud(): void {
    this.heartIcons.forEach((h, i) => h.setTexture(i < this.hearts ? TEX.heartFull : TEX.heartEmpty));
    // (점수는 화면 UI 에 표시 — 숨긴 캔버스 글자를 매번 다시 그리지 않음)
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
    this.boomerang.reset();
    this.tweens.killTweensOf(this.player);
    this.player.anims.stop();
    this.player.setAngle(0).setAlpha(1);
    this.squash = 1;
    sound.evolve();
    haptics.play('evolve');
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

  // ───────────────────────── 보스전 · 머리카락 부메랑 ─────────────────────────

  /** 보스·투사체 그림, 단계별 '머리카락 빠진' 시트·애니메이션, 머리카락 그림 */
  private buildBattleTextures(): void {
    const tm = this.textures;
    for (const id of ['kiss', 'sniff'] as const) {
      const key = `boss-${id}`;
      if (tm.exists(key)) continue;
      const src = `boss-src-${id}`;
      if (tm.exists(src)) {
        // 정식 PNG (프레임 3장 또는 5장 가로 — 4·5번째가 없으면 화남·어지러움은 가까운 프레임으로)
        const img = tm.get(src).getSourceImage() as HTMLImageElement;
        const count = img.width >= img.height * 4.5 ? 5 : 3;
        addSheet(this, key, img, Math.floor(img.width / count), img.height);
      } else {
        const sh = bossSheet(id);
        addSheet(this, key, sh.canvas, sh.fw, sh.fh);
      }
    }
    // 최종 보스 '이유식 드래곤 셰프 마녀' (코드 도트 · 프레임 9장) + 공격 그림 + 마지막 모험·성 그림
    // 확정 레퍼런스 스프라이트(PNG, 프레임 10장 가로)를 씀 — 파일을 못 읽었을 때만 비상용 코드 도트
    if (!tm.exists('boss-witch')) {
      if (tm.exists('boss-src-witch')) {
        const img = tm.get('boss-src-witch').getSourceImage() as HTMLImageElement;
        addSheet(this, 'boss-witch', img, Math.floor(img.width / WITCH_SHEET_FRAMES), img.height);
      } else {
        const sh = witchSheet();
        addSheet(this, 'boss-witch', sh.canvas, sh.fw, sh.fh);
      }
    }
    if (!tm.exists('witch-spoon') && tm.exists('witch-spoon-src')) tm.addImage('witch-spoon', tm.get('witch-spoon-src').getSourceImage() as HTMLImageElement);
    const witchSmall: [string, () => HTMLCanvasElement][] = [
      ['witch-arm', witchArm],
      ['witch-spoon', witchSpoon],
      ['witch-goo', witchGoo],
      ['witch-puddle', witchPuddle],
      ['witch-drop', witchDrop],
      ['witch-pot', witchPot],
      ['witch-smoke', witchSmoke],
      ['witch-target', witchTarget],
      ['castle-bolt', castleBolt],
      ['clue-spoon', clueSpoon],
      ['clue-bush', clueBush],
      ['clue-print', cluePrint],
    ];
    for (const [k, fn] of witchSmall) if (!tm.exists(k)) addCanvas(this, k, fn());
    const small: [string, () => HTMLCanvasElement][] = [
      ['boss-heart', heartShot],
      ['boss-wave', waveHeart],
      ['boss-cloud', smellCloud],
      ['boss-bigcloud', bigCloud],
      ['boss-puddle', stinkPuddle],
      ['boss-dot', stinkDot],
      ['boss-warn', warnMark],
      ['boss-tinyheart', tinyHeart],
      ['battle-shield', battleShield],
    ];
    for (const [k, f] of small) if (!tm.exists(k)) addCanvas(this, k, f());
    // 일반 몬스터 (정식 PNG 가 있으면 그것, 없으면 코드 도트)
    for (const kind of ['glasses', 'farter'] as const) {
      const key = `mon-${kind}`;
      if (tm.exists(key)) continue;
      const src = `mon-src-${kind}`;
      if (tm.exists(src)) {
        const img = tm.get(src).getSourceImage() as HTMLImageElement;
        addSheet(this, key, img, Math.floor(img.width / 3), img.height);
      } else {
        const sh = monsterSheet(kind);
        addSheet(this, key, sh.canvas, sh.fw, sh.fh);
      }
    }
    if (!tm.exists('mood-flower')) addCanvas(this, 'mood-flower', moodFlower());
    // 보스 필살기 전용 도트 (한 번 만들어 재사용)
    if (!tm.exists('sp-heart')) addCanvas(this, 'sp-heart', royalHeart());
    if (!tm.exists('sp-ring-pink')) addCanvas(this, 'sp-ring-pink', auraRing('#ff5fa2', '#ffd0e6'));
    if (!tm.exists('sp-ring-green')) addCanvas(this, 'sp-ring-green', auraRing('#a8d040', '#efffb0'));
    if (!tm.exists('end-petal')) addSheet(this, 'end-petal', petalSheet(), 3, 3);
    if (!tm.exists('end-rays')) addCanvas(this, 'end-rays', sunRays());
    if (!tm.exists('end-sunset')) addCanvas(this, 'end-sunset', sunsetSky());
    if (!tm.exists('end-heart')) addCanvas(this, 'end-heart', endHeart());
    if (!tm.exists('sp-ring-gold')) addCanvas(this, 'sp-ring-gold', auraRing('#ffd54a', '#c8ff8a'));
    if (!tm.exists('sp-tornado')) addSheet(this, 'sp-tornado', tornadoSheet(), TORNADO_FRAME.w, TORNADO_FRAME.h);
    if (!tm.exists('sp-target')) addSheet(this, 'sp-target', targetSheet(), 17, 17);
    if (!tm.exists('sp-pignose')) addSheet(this, 'sp-pignose', pigNoseSheet(), PIG_NOSE_FRAME.w, PIG_NOSE_FRAME.h);
    if (!tm.exists('sp-leaf')) addCanvas(this, 'sp-leaf', leaf());
    if (!tm.exists('sp-safe')) addCanvas(this, 'sp-safe', safeMark());
    if (!tm.exists('mon-flask')) addSheet(this, 'mon-flask', flaskSheet(), FLASK_FRAME.w, FLASK_FRAME.h);
    if (!tm.exists('mon-shatter')) addSheet(this, 'mon-shatter', shatterSheet(), SHATTER_FRAME.w, SHATTER_FRAME.h);
    if (!tm.exists('mon-puddle')) addSheet(this, 'mon-puddle', puddleSheet(), PUDDLE_FRAME.w, PUDDLE_FRAME.h);
    if (!tm.exists('mon-pop')) addSheet(this, 'mon-pop', popSheet(), POP_FRAME.w, POP_FRAME.h);
    if (!tm.exists('boss-star')) addCanvas(this, 'boss-star', dizzyStar());
    if (!tm.exists('boss-arrow')) addCanvas(this, 'boss-arrow', pathArrow('#ff6f9f'));
    if (!tm.exists('boss-wind')) addCanvas(this, 'boss-wind', pathArrow('#f0ffc8', '#3c5a14'));
    if (!tm.exists('mon-cloud')) addSheet(this, 'mon-cloud', fartCloudSheet(), CLOUD_FRAME.w, CLOUD_FRAME.h);

    for (const v of Object.values(this.visuals)) {
      const key = `hurt-${v.id}`;
      if (tm.exists(key)) continue;
      const base = this.frameCanvas(v.texture, v.runFrames[0]);
      const bald = v.id === 'newborn' ? base : removeHair(base);
      const frames = [hurtFace(base, -1), hurtFace(base, 1), hurtFace(bald, 0), hurtFace(bald, 0)];
      const pc = new PixelCanvas(base.width * 4, base.height);
      frames.forEach((f, i) => pc.ctx.drawImage(f, i * base.width, 0));
      addSheet(this, key, pc.canvas, base.width, base.height);
      // 필살기 '초특급 꼬불머리 팡팡!' 진지한 얼굴 (0: 머리카락 있음 · 1: 머리카락 빠짐)
      const sk = `serious-${v.id}`;
      if (!tm.exists(sk)) {
        const sp = new PixelCanvas(base.width * 2, base.height);
        sp.ctx.drawImage(hurtFace(base, 0, 'serious'), 0, 0);
        sp.ctx.drawImage(hurtFace(bald, 0, 'serious'), base.width, 0);
        addSheet(this, sk, sp.canvas, base.width, base.height);
      }
    }
    // 엔딩용 웃는 얼굴(모든 프레임) · 반가워 눈이 커진 얼굴 — 아기(newborn)·자이언트(bigbaby)만, 같은 그림에서 눈·입만 바꿈
    for (const id of ['newborn', 'walker', 'bigbaby'] as const) {
      const v = this.visuals[id];
      const tex = tm.get(v.texture);
      const n = tex.frameTotal - 1;
      const f0 = this.frameCanvas(v.texture, 0);
      for (const mood of ['happy', 'wow'] as const) {
        const key = `${mood}-${id}`;
        if (tm.exists(key)) continue;
        const pc = new PixelCanvas(f0.width * n, f0.height);
        for (let i = 0; i < n; i++) pc.ctx.drawImage(hurtFace(this.frameCanvas(v.texture, i), 0, mood), i * f0.width, 0);
        addSheet(this, key, pc.canvas, f0.width, f0.height);
      }
    }
    const done = new Set<string>();
    for (const v of Object.values(this.visuals)) {
      if (v.id === 'newborn' || done.has(v.texture)) continue;
      done.add(v.texture);
      const bald = `${v.texture}-bald`;
      if (!tm.exists(bald)) {
        const tex = tm.get(v.texture);
        const srcImg = tex.getSourceImage() as CanvasImageSource & { width: number; height: number };
        const pc = new PixelCanvas(srcImg.width, srcImg.height);
        const names = tex.getFrameNames();
        for (const n of names) {
          const f = tex.get(n);
          pc.ctx.drawImage(removeHair(this.frameCanvas(v.texture, n)), f.cutX, f.cutY);
        }
        addCanvas(this, bald, pc.canvas);
        const bt = tm.get(bald);
        for (const n of names) {
          const f = tex.get(n);
          bt.add(n, 0, f.cutX, f.cutY, f.cutWidth, f.cutHeight);
        }
      }
      const hair = `${v.texture}-hair`;
      if (!tm.exists(hair)) {
        let c = hairTuft(this.frameCanvas(v.texture, v.idleFrame));
        if (!c) {
          // 머리카락을 못 찾으면 갈색 물방울
          const pc = new PixelCanvas(7, 9);
          pc.disc(3, 5, 3, '#8a5a34');
          pc.rect(3, 0, 1, 3, '#8a5a34');
          pc.outline('#4a2a14');
          c = pc.canvas;
        }
        addCanvas(this, hair, c);
      }
    }
    for (const v of Object.values(this.visuals)) {
      if (v.id === 'newborn') continue;
      const bald = `${v.texture}-bald`;
      for (const [k, frames, repeat] of [
        [v.runAnim, v.runFrames, -1],
        [v.jumpAnim, [v.jumpFrame], 0],
      ] as const) {
        const key = `${k}-bald`;
        if (this.anims.exists(key)) continue;
        const base = this.anims.get(k);
        this.anims.create({ key, frames: frames.map((f) => ({ key: bald, frame: f })), frameRate: base?.frameRate ?? 8, repeat });
      }
    }
  }

  private frameCanvas(key: string, frame: string | number): HTMLCanvasElement {
    const f = this.textures.getFrame(key, frame);
    const c = document.createElement('canvas');
    c.width = f.cutWidth;
    c.height = f.cutHeight;
    c.getContext('2d')?.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
    return c;
  }

  private makeHost(): BattleHost {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      scene: this,
      get W() {
        return self.W;
      },
      get H() {
        return self.H;
      },
      get groundY() {
        return self.groundY;
      },
      get basePlayerX() {
        return self.basePlayerX;
      },
      get scrollSpeed() {
        return self.speed;
      },
      get pull() {
        return self.pull;
      },
      set pull(v: number) {
        self.pull = Math.max(0, v);
      },
      playerRect: () => {
        const b = this.playerBox();
        return { x0: b.left, x1: b.right, y0: this.groundY - b.top, y1: this.groundY - b.bottom };
      },
      playerHead: () => this.headPos(),
      playerGrounded: () => this.grounded,
      hurtPlayer: (d, src) => this.hurtBattle(d, src),
      setResisting: (on) => {
        this.resisting = on;
      },
      shieldRect: () => this.shieldRect(),
      onShieldBlock: (x, y) => {
        sound.catch();
        this.sparkleEmitter.explode(perf.low ? 2 : 4, x, y);
      },
      spawnSnack: (k, alt) => this.addSnack(k, this.W + 14, alt),
      addScore: (p, x, y) => this.addPoints(p, x, y),
      sparkle: (n, x, y) => this.sparkleEmitter.explode(perf.low ? Math.ceil(n / 2) : n, x, y),
      floatText: (t, x, y, c) => this.floatText(t, x, y, c),
      unlockBoomerang: () => {
        this.boomerangAwake = true;
      },
      hairTexture: () => this.hairKey(),
      seriousTexture: () => `serious-${this.vis.id}`,
      setSpecialLook: (look) => this.setSpecialLook(look),
      onBattleEnd: (win) => this.endBattle(win),
      startBattleMusic: () => {
        if (this.state === 'playing') sound.startMusic(this.musicNow());
      },
    };
  }

  /** 머리 꼭대기 (부메랑이 나가고 돌아오는 곳) */
  private headPos(): { x: number; y: number } {
    return { x: this.player.x + 2, y: this.player.y - this.player.displayHeight / 2 + 4 };
  }

  /** 필살기 연출 중 고나 그림: 'serious' 진지한 얼굴 · 'bald' 머리카락이 빠진 진지한 얼굴 · null 원래대로 */
  private specialLook: 'serious' | 'bald' | null = null;
  /** 가족 엔딩 연출 (마지막 보스 뒤) */
  /** (검증용) 엔딩 컷신 */
  get ending(): EndingScene | null {
    const sc = this.scene.get('EndingCine') as EndingScene;
    return sc && this.scene.isActive('EndingCine') ? sc : null;
  }
  private endingInfo: GameOverInfo | null = null;
  private setSpecialLook(look: 'serious' | 'bald' | null): void {
    if (look === this.specialLook) return;
    this.specialLook = look;
    if (look) {
      if (this.boomerang.isOut) this.boomerang.reset(); // 날아가던 보통 부메랑은 즉시 머리로
      this.player.anims.stop();
      this.hurtUntil = 0;
      this.exprFrame = -1;
      const bald = look === 'bald' && this.vis.id !== 'newborn';
      this.player.setTexture(`serious-${this.vis.id}`, bald ? 1 : 0);
      this.squash = look === 'bald' ? 1.22 : 1.1; // 두 손 번쩍! 하듯 위로 쭉 늘어났다 돌아옴
    } else {
      this.player.play((this.grounded ? this.vis.runAnim : this.vis.jumpAnim) + (this.isBald() ? '-bald' : ''));
    }
  }

  private hairKey(): string {
    const v = this.vis.id === 'newborn' ? this.visuals.crawler : this.vis;
    return `${v.texture}-hair`;
  }

  private isBald(): boolean {
    return !!this.boomerang?.isOut && this.vis.id !== 'newborn' && this.anims.exists(`${this.vis.runAnim}-bald`);
  }

  /** 머리카락 부메랑을 쓸 수 있는지 (뽀뽀괴물전 각성 또는 3단계 이상) */
  private get canThrow(): boolean {
    return this.boomerangAwake || this.growth.stage.abilities.hairBoomerang;
  }

  private throwHair(): void {
    if (this.state !== 'playing' || !this.canThrow || this.battle?.frozen || this.battle?.mode === 'victory') return;
    // 흡입에 버티는 중엔 공격 안 함 (버티기 버튼과 겹치지 않게)
    if (this.battle?.resistActive) return;
    // 코 타이밍 바: 공격 버튼 = '발사!' — 누른 순간 판정. PERFECT·GOOD 면 코로 부메랑 발사, MISS 면 빗나감(발사 안 함)
    // 조준 안내·결과 안내 중엔 공격 안 함
    if (this.battle?.qteBusy && !this.battle.aimActive) return;
    let aimJudge: unknown = null;
    if (this.battle?.aimActive) {
      // 부메랑이 아직 날아가 있으면 판정하지 않음 (돌아오면 다시 '발사!')
      if (this.boomerang.isOut) return;
      aimJudge = this.battle.lockAim();
    }
    if (this.boomerang.isOut) {
      // 돌아오기 직전에 누른 것은 기억 (돌아오자마자 발사)
      this.attackBufferUntil = this.time.now + 250;
      return;
    }
    const h = this.headPos();
    const stats = boomerangStats(this.growth.stage.id);
    // 보스전: 보스까지는 꼭 닿게
    if (this.battle) stats.range = Math.max(stats.range, this.battle.bossRect().x1 - h.x);
    if (this.boomerang.throw(this.hairKey(), this.vis.scale, h.x + 4, h.y, stats)) {
      // 조준 실패: 조준점이 있던 자리로 날아가 빗나감 (보스에 맞지 않음)
      if (aimJudge === 'miss') this.boomerang.hitIds.add('boss');
      this.squash = 1.12;
      this.sparkleEmitter.explode(2, h.x, h.y);
    }
  }

  private updateBoomerang(dt: number): void {
    const b = this.boomerang;
    if (!b.isOut) return;
    const h = this.headPos();
    let aimY = this.groundY - 8; // 평소: 바위·몬스터 높이로
    if (this.battle) {
      const r = this.battle.bossRect();
      aimY = Math.max(h.y, (r.y0 + r.y1) / 2 - 2);
      // 약점(과녁)이 열려 있으면 부메랑이 코를 향해 날아감
      const wp = this.battle.aimPoint();
      if (wp) aimY = wp.y;
    }
    b.update(dt, h.x, h.y, aimY);
    if (!b.isOut || this.state !== 'playing') return;
    if (this.battle) {
      this.battle.checkBoomerang(b);
    }
    // 평소: 몬스터를 때리고 · 몬스터 투사체를 부수고 · 간식은 주워 옴
    // 바위는 부메랑과 상관없음(그대로 통과 — 깨지지 않고 점수·필살 게이지도 없음). 바위는 점프로 피하는 장애물
    for (const e of this.entities) {
      if (e.done) continue;
      const y = this.groundY - e.alt - e.h / 2;
      if (Math.abs(e.x - b.x) < e.w / 2 + b.r && Math.abs(y - b.y) < e.h / 2 + b.r) {
        if (e.type === 'snack') this.collect(e);
        else if (e.type === 'monster') {
          const id = `m${e.mon!.id}`;
          if (b.hitIds.has(id)) continue;
          b.hitIds.add(id);
          this.hitMonster(e);
          b.bounce();
        } else if (e.type === 'mshot') {
          if (e.grav) this.breakFlask(e, false);
          else {
            e.done = true;
            e.sprite.destroy();
          }
          this.sparkleEmitter.explode(3, e.x, y);
          b.bounce();
        }
      }
    }
  }

  private addPoints(points: number, x: number, y: number): void {
    this.score += points;
    this.updateHud();
    this.floatText(`+${points}`, x, y, '#fff4c2');
  }

  /** 글자 그림 (글자·색마다 한 번만 그려 텍스처로 재사용 — 매번 다시 그리면 텍스처 생성·업로드로 멈칫) */
  private textTexture(text: string, color: string): string {
    const key = `ft:${color}:${text}`;
    if (this.textures.exists(key)) return key;
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d')!;
    ctx.font = `12px ${FONT}`;
    c.width = Math.ceil(ctx.measureText(text).width) + 8;
    c.height = 18;
    ctx.font = `12px ${FONT}`;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#7a3f1f';
    ctx.strokeText(text, 4, 9);
    ctx.fillStyle = color;
    ctx.fillText(text, 4, 9);
    this.textures.addCanvas(key, c);
    return key;
  }

  /** 떠오르는 글자 (풀에서 꺼내 씀) */
  private floatText(text: string, x: number, y: number, color: string): void {
    let t = this.popPool.find((p) => !p.visible);
    if (!t) t = this.popPool[0];
    this.tweens.killTweensOf(t);
    t.setTexture(this.textTexture(text, color)).setPosition(Math.round(x), Math.round(y)).setAlpha(1).setVisible(true);
    const pop = t;
    this.tweens.add({ targets: pop, y: pop.y - 16, alpha: 0, duration: 750, ease: 'Quad.Out', onComplete: () => pop.setVisible(false) });
  }

  /** 성장 게이지 가득: 이 단계의 보스가 남아 있으면 보스전, 아니면 진화 */
  private onGaugeFull(): void {
    const boss = Object.values(BOSSES).find((b) => b.atStage === this.growth.stage.id && b.trigger !== 'story' && !this.clearedBosses.has(b.id));
    if (boss && !this.clearedBosses.has(boss.id)) {
      this.startBoss(boss.id);
      return;
    }
    if (!this.growth.isFinal) this.startEvolution();
  }

  /** 엔딩에 쓰는 캐릭터 스프라이트(고나·가족 여섯 명)·이펙트를 미리 불러 둠 (이미 있으면 아무것도 안 함) */
  private preloadEndingArt(): void {
    if (queueEndingArt(this)) this.load.start();
  }

  /** 마지막 모험 시작 (킁카괴물 뒤 · 이어하기 · 테스트: from = 시작 시각 초) */
  startFinale(from = 0): void {
    this.loadCastleArt();
    this.finale?.destroy();
    this.clearedBosses.add('kiss');
    this.clearedBosses.add('sniff');
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.finale = new FinaleRun(
      {
        scene: this,
        get W() {
          return self.W;
        },
        get H() {
          return self.H;
        },
        get groundY() {
          return self.groundY;
        },
        addSnack: (k, x, alt) => this.addSnack(k, x, alt),
        addRock: (x) => this.addRock(x),
        addProp: (tex, x, alt, depth, scale = 1) => {
          const sprite = this.add.image(x, 0, tex).setOrigin(0.5, 1).setDepth(depth).setScale(scale);
          this.entities.push({ sprite, type: 'fx', x, alt, w: 1, h: 1, phase: 0, done: false, vx: 0, life: 9, hit: true });
        },
        tint: (color, alpha, ms) => {
          this.tweens.killTweensOf(this.moodTint);
          this.moodTint.setFillStyle(color, this.moodTint.fillAlpha);
          this.tweens.add({ targets: this.moodTint, fillAlpha: alpha, duration: ms, ease: 'Sine.InOut' });
        },
        backdrop: (kind, ms, pan) => this.finaleBackdrop(kind, ms, pan),
        arrive: () => this.enterCastle(false),
      },
      from,
    );
    bus.emit(EV.finaleStart, { from });
  }

  /** 승인된 성 배경 그림 4장 불러오기 (처음 로딩을 무겁게 하지 않으려고 킁카괴물전·마지막 모험 때 미리) → 다 있으면 done */
  loadCastleArt(done?: () => void): void {
    // 성으로 가는 길·마녀 전투곡도 미리 받아 해독 (끊김 없는 반복 재생용)
    sound.prepareLoops(['castle', 'witch', 'witch2']);
    const all = [CASTLE_ART.far, CASTLE_ART.near, CASTLE_ART.gate, CASTLE_ART.interior];
    const missing = all.filter((a) => !this.textures.exists(a.key));
    if (!missing.length) {
      done?.();
      return;
    }
    for (const a of missing) this.load.image(a.key, a.url);
    if (done) {
      const check = (): void => {
        if (all.every((a) => this.textures.exists(a.key))) {
          this.load.off(Phaser.Loader.Events.COMPLETE, check);
          done();
        }
      };
      this.load.on(Phaser.Loader.Events.COMPLETE, check);
    }
    if (!this.load.isLoading()) this.load.start();
  }

  /**
   * 성 배경 그림을 지금 배경(숲·앞 단계 그림) 위에 ms 동안 겹쳐 나타나게 함.
   * 숲 배경과 같은 위치·배율. far·near: pan 초 동안 그림 안에서 성 쪽으로 천천히 다가감 / gate: 고나가 멈추는 순간 문이 제자리
   */
  private finaleBackdrop(kind: 'far' | 'near' | 'gate', ms: number, pan: number): void {
    const art = CASTLE_ART[kind];
    if (!this.bgImage) return;
    if (!this.textures.exists(art.key)) {
      this.loadCastleArt(() => this.finaleBackdrop(kind, Math.min(ms, 800), pan));
      return;
    }
    if (this.backdrops.some((b) => b.key === art.key)) return;
    const spr = this.add.tileSprite(0, 0, 10, 10, art.key).setOrigin(0, 0).setAlpha(0);
    this.placeBackdrop(spr);
    this.children.moveAbove(spr, this.backdrops.length ? this.backdrops[this.backdrops.length - 1].spr : this.bgImage);
    const b = { key: art.key, spr, focus: art.focus, t: 0, pan: Math.max(0.1, pan), stop: kind === 'gate' };
    this.backdrops.push(b);
    this.updateBackdrops(0);
    this.tweens.add({
      targets: spr,
      alpha: 1,
      duration: Math.max(10, ms),
      ease: 'Sine.InOut',
      onComplete: () => {
        // 다 덮었으면 아래 단계 그림은 정리 (겹친 채 계속 그리지 않게)
        for (const o of this.backdrops.filter((x) => x !== b && x.spr.depth === b.spr.depth && this.children.getIndex(x.spr) < this.children.getIndex(b.spr))) o.spr.setVisible(false);
      },
    });
  }

  /**
   * 성 배경 배율: 숲 배경과 같은 배율 · 같은 지면선(400줄) — 단, 그림 폭(772)이 화면보다 좁아지는 가로 화면에서는
   * 화면 폭을 덮을 만큼만 키움 (좌우 끝이 이어지지 않는 그림이라 반복하면 경계가 보임)
   */
  private get backdropScale(): number {
    return Math.max(this.bgScale, this.W / 772);
  }

  private placeBackdrop(spr: Phaser.GameObjects.TileSprite): void {
    const k = this.backdropScale;
    spr
      .setPosition(0, Math.round((this.groundY - GAME_BG.groundRow * k) * VIEW.renderScale) / VIEW.renderScale)
      .setSize(this.W, Math.ceil(460 * k))
      .setTileScale(k, k);
  }

  /** 성 배경의 보이는 범위: 그림 안에서만 (좌우 반복 경계가 보이지 않게) · 성(문)은 고나보다 오른쪽 */
  private updateBackdrops(dt: number): void {
    if (!this.backdrops.length) return;
    const sc = this.backdropScale;
    const ww = this.W / sc;
    const maxLeft = Math.max(0, 772 - ww);
    for (const b of this.backdrops) {
      if (!b.spr.visible) continue;
      const end = Phaser.Math.Clamp(b.focus - CASTLE_ART.screenAt * ww, 0, maxLeft);
      let left: number;
      if (b.stop) {
        // 남은 감속 거리만큼 앞에서 시작 → 멈추는 순간 문이 제자리 (배경은 땅의 GAME_BG.scroll 배 속도)
        const rem = (GAME_BG.scroll * this.speed * this.speed) / (2 * HALT_DECEL) / sc;
        left = Math.max(0, end - rem);
      } else {
        b.t += dt;
        const k = Math.min(1, b.t / b.pan);
        const e = k * k * (3 - 2 * k);
        const start = Math.max(0, end - CASTLE_ART.drift);
        left = start + (end - start) * e;
      }
      b.spr.tilePositionX = Math.round(left * sc * VIEW.renderScale) / (VIEW.renderScale * sc);
    }
  }

  private clearBackdrops(): void {
    for (const b of this.backdrops) b.spr.destroy();
    this.backdrops = [];
  }

  /** (검증용) 마지막 모험 상태 */
  debugFinale(): { t: number; phase: string; inCastle: boolean; halt: boolean; speed: number } | null {
    return this.finale ? { t: +this.finale.t.toFixed(2), phase: this.finale.phase, inCastle: this.inCastle, halt: this.halt, speed: Math.round(this.speed) } : { t: -1, phase: 'none', inCastle: this.inCastle, halt: this.halt, speed: Math.round(this.speed) };
  }

  /**
   * 암흑의 이유식 성 도착: 달리기를 멈추고 → 화면이 잠깐 어두워졌다가 → 성 안 (배경·바닥을 성으로) → 최종 보스 등장 컷신
   * instant = 이어하기·보스전 다시 (바로 성 안)
   */
  enterCastle(instant: boolean): void {
    if (this.inCastle || this.battle) return;
    this.halt = true;
    for (const e of this.entities) {
      if (e.done || e.type === 'snack') continue;
      e.done = true;
      this.tweens.add({ targets: e.sprite, alpha: 0, duration: 300, onComplete: () => e.sprite.destroy() });
    }
    const go = (): void => {
      this.finale?.destroy();
      this.finale = null;
      this.setCastleLook();
      this.startBoss('witch');
    };
    if (instant) {
      this.speed = 0;
      // 이어하기·다시하기: 성 안 그림을 불러온 뒤 바로 성 안
      this.loadCastleArt(() => {
        if (!this.inCastle && !this.battle) go();
      });
      return;
    }
    // 성 입구 그림이 겹쳐 나타나며 감속 → 멈춘 채 잠깐 → 암전 → 성 안 → 등장 컷신
    this.finaleBackdrop('gate', 1100, 1);
    const cam = this.cameras.main;
    const stopSec = this.speed / HALT_DECEL;
    this.time.delayedCall(Math.round(stopSec * 1000) + 1100, () => {
      if (this.state !== 'playing' && this.state !== 'paused') return;
      cam.fadeOut(600, 12, 6, 22);
      this.time.delayedCall(660, () => {
        this.loadCastleArt(() => {
          go();
          cam.fadeIn(700, 12, 6, 22);
        });
      });
    });
  }

  /** 성 안 모습: 배경·바닥을 성으로 바꿈 (배치·스크롤은 숲 배경과 같은 방식) */
  private setCastleLook(): void {
    this.inCastle = true;
    this.clearBackdrops();
    // 승인된 성 안 그림: 배경 + 땅 띠(같은 그림의 바닥 부분) — 그림 속 바닥선 336줄을 게임 땅 윗면에
    const art = CASTLE_ART.interior;
    if (this.bgImage && this.textures.exists(art.key)) {
      this.bgImage.setTexture(art.key);
      this.ground.setTexture(art.key);
      this.bgRow = art.groundRow;
      this.bgTop = art.extraTop;
    }
    this.bgHaze?.clear();
    this.deepDirt.clear();
    const dirtTop = this.groundY + GROUND_TILE_H;
    if (dirtTop < this.H) {
      // 땅 띠 아래(세로 화면의 남는 아래쪽): 성 안 그림 맨 아래 흙과 같은 색으로 점점 어둡게
      const bands = ['#6f3850', '#68344b', '#603046', '#572c41', '#4e273b'];
      const bandH = Math.ceil((this.H - dirtTop) / bands.length);
      bands.forEach((c, i) => {
        this.deepDirt.fillStyle(Phaser.Display.Color.HexStringToColor(c).color, 1);
        this.deepDirt.fillRect(0, dirtTop + i * bandH, this.W, bandH + 1);
      });
    }
    this.tweens.killTweensOf(this.moodTint);
    this.moodTint.setFillStyle(0x1d1640, 0.12);
    this.layout();
  }

  private startBoss(id: BossId): void {
    if (this.battle) return;
    // 화면의 바위는 치움 (간식은 그대로)
    for (const e of this.entities) {
      if (e.type === 'rock' && !e.done) {
        e.done = true;
        this.tweens.add({ targets: e.sprite, alpha: 0, duration: 300, onComplete: () => e.sprite.destroy() });
      }
    }
    this.retryCarry = { score: this.score, snacks: this.snacksEaten };
    // 보스 진입 → 체크포인트 (킁카괴물 · 최종 보스 마녀)
    if (id === 'sniff') saveCheckpoint('sniff', this.score, this.snacksEaten);
    if (id === 'witch') saveCheckpoint('witch', this.score, this.snacksEaten);
    this.hp = BATTLE_HP.perHeart;
    this.shieldUntil = 0;
    this.shieldReadyAt = 0;
    const tex = `boss-${id}`;
    this.battle = id === 'kiss' ? new KissBattle(this.host, tex, this.canThrow) : id === 'witch' ? new WitchBattle(this.host, tex) : new SniffBattle(this.host, tex);
    // 마지막 보스들 동안 엔딩 곡·엔딩 그림을 미리 받아 둠 (엔딩이 시작될 때 내려받기·해독으로 멈칫하지 않게)
    if (id === 'sniff' || id === 'witch') {
      void sound.prepareEnding();
      this.preloadEndingArt();
    }
    if (id === 'sniff') this.loadCastleArt(); // 킁카괴물 다음 마지막 모험에서 쓸 성 그림을 미리
    // 일반 스테이지에서 모은 필살 게이지를 이어서
    this.battle.special = this.specialCarry;
    this.specialCarry = 0;
    // 화면의 몬스터·투사체는 퇴장
    for (const e of this.entities) {
      if (!e.done && (e.type === 'monster' || e.type === 'mshot' || e.type === 'cloud' || e.type === 'puddle' || e.type === 'fx')) {
        e.done = true;
        this.tweens.add({ targets: e.sprite, alpha: 0, duration: 300, onComplete: () => e.sprite.destroy() });
      }
    }
    // 분위기 전환: 평화로운 음악이 작아지고 → 바람·나뭇잎 · 보랏빛 그림자 · 짧은 흔들림·경고음(보스 등장) → 보스 전용 음악
    sound.fadeOutMusic(700);
    this.setBossMood(true, id === 'witch');
    this.cameras.main.shake(260, 0.007);
    const battle = this.battle;
    // 최종 보스는 등장 컷신이 끝나고 싸움이 시작될 때 음악 (host.startBattleMusic)
    if (id !== 'witch') {
      this.time.delayedCall(1600, () => {
        if (this.battle === battle && this.state === 'playing') sound.startMusic(this.musicNow());
      });
    }
    this.battle.start();
  }

  /** 지금 상황에 맞는 배경음악 (보스전이면 보스·분노 단계별 곡) */
  private musicNow(): MusicMode {
    const b = this.battle;
    if (!b) return 'game';
    if (b.id === 'kiss') return b.rage >= 1 ? 'kiss2' : 'kiss';
    if (b.id === 'witch') return b.rage >= 2 ? 'witch2' : 'witch';
    return b.rage >= 2 ? 'sniff2' : 'sniff';
  }

  /** 보스전 분위기 켜기/끄기 (끌 때는 햇살이 돌아오며 꽃·반짝이) — 배경 색을 영구적으로 바꾸지 않음 */
  private setBossMood(on: boolean, castle = false): void {
    this.tweens.killTweensOf(this.moodTint);
    if (castle) this.moodTint.setFillStyle(0x1d1640, this.moodTint.fillAlpha);
    this.tweens.add({ targets: this.moodTint, fillAlpha: on ? (castle ? 0.18 : 0.34) : 0, duration: on ? 1200 : 1400, ease: 'Sine.InOut' });
    if (on && !castle) {
      // 바람: 나뭇잎이 오른쪽에서 왼쪽으로 잠깐 흩날림 (1.4초 · 개수 제한)
      this.moodLeaves?.destroy();
      const leaves = this.add
        .particles(0, 0, 'sp-leaf', {
          x: this.W + 6,
          y: { min: 10, max: this.groundY - 6 },
          speedX: { min: -260, max: -150 },
          speedY: { min: -20, max: 30 },
          rotate: { min: 0, max: 360 },
          lifespan: 1700,
          frequency: perf.low ? 140 : 80,
          scale: 1.6,
        })
        .setDepth(9)
        .setScrollFactor(0);
      this.moodLeaves = leaves;
      this.time.delayedCall(1400, () => leaves.active && leaves.stop());
      this.time.delayedCall(3300, () => {
        if (leaves.active) leaves.destroy();
        if (this.moodLeaves === leaves) this.moodLeaves = null;
      });
    } else {
      // 햇살이 돌아옴: 땅 위에 꽃이 톡톡 피고 작은 반짝이 (땅과 함께 흘러가다 사라짐)
      for (let i = 0; i < 6; i++) {
        const x = this.playerX + 20 + i * ((this.W - this.playerX - 20) / 6) + Math.random() * 10;
        const sprite = this.add.image(x, this.groundY, 'mood-flower').setOrigin(0.5, 1).setDepth(5.5).setScale(0);
        this.tweens.add({ targets: sprite, scale: 1, duration: 260, delay: 200 + i * 90, ease: 'Back.Out' });
        this.entities.push({ sprite, type: 'fx', x, alt: 0, w: 1, h: 1, phase: 0, done: false, vx: 0, life: 4.5, hit: true });
        this.sparkleEmitter.explode(perf.low ? 1 : 2, x, this.groundY - 6);
      }
    }
  }

  /** 즉시 원래대로 (죽음·다시하기 — 연출 없이) */
  private resetMood(): void {
    if (this.moodTint?.active) {
      this.tweens.killTweensOf(this.moodTint);
      this.moodTint.fillAlpha = 0;
    }
    if (this.moodLeaves?.active) this.moodLeaves.destroy();
    this.moodLeaves = null;
  }

  private endBattle(win: boolean): void {
    const b = this.battle;
    if (!b) return;
    const id = b.id;
    this.lastAttackLog = b.attackLog;
    b.destroy();
    this.battle = null;
    this.pull = 0;
    if (!win) {
      this.resetMood();
      return;
    }
    this.clearedBosses.add(id);
    bus.emit(EV.bossEnd, { id, win });
    // 어두웠던 숲에 햇살이 돌아옴 + 꽃·반짝이 → 평화로운 버섯숲 음악 (최종 보스는 가족 엔딩 음악이 따로)
    this.setBossMood(false);
    const after = BOSSES[id].afterWin;
    if (after === 'evolve' || after === 'adventure') sound.startMusic('game');
    if (after === 'evolve') {
      // 첫 보스 클리어 → 체크포인트 (게임 오버가 나도 3단계부터)
      saveCheckpoint('walker', this.score, this.snacksEaten);
      this.sinceMonster = 8; // 3단계 첫 몬스터는 약 6초 뒤
      this.startEvolution();
    } else if (after === 'adventure') {
      // 킁카괴물 → 최종 보스로 가는 마지막 모험 (게임 오버가 나도 여기부터)
      saveCheckpoint('finale', this.score, this.snacksEaten);
      this.time.delayedCall(1200, () => {
        if (this.state === 'playing' && !this.battle) this.startFinale(0);
      });
    } else {
      // 최종 보스 처치: 성 안에 따뜻한 빛이 돌아옴 → 가족 엔딩
      if (this.inCastle) {
        this.cameras.main.flash(700, 255, 226, 170);
        const warm = this.add.rectangle(-100, -100, 3000, 3000, 0xffd9a0, 0).setOrigin(0, 0).setDepth(3.2).setScrollFactor(0);
        this.tweens.add({ targets: warm, fillAlpha: 0.22, duration: 900, yoyo: true, hold: 300 });
      }
      this.finishGame();
    }
  }

  /** 마지막 보스 격파 → 가족 엔딩 */
  private finishGame(): void {
    this.state = 'cleared';
    clearCheckpoint(); // 이야기 끝 — 다음엔 새 게임
    this.boomerang.reset();
    this.showExpression(this.vis.happyFrame, 1500);
    const prevBest = Number(storage.get(STORAGE_KEYS.best) ?? 0) || 0;
    const isNewBest = this.score > prevBest;
    const best = Math.max(prevBest, this.score);
    if (isNewBest) storage.set(STORAGE_KEYS.best, String(best));
    const reached = GROWTH_STAGES.length;
    storage.set(STORAGE_KEYS.bestStage, String(reached));
    this.endingInfo = {
      score: this.score,
      best,
      isNewBest: isNewBest && this.score > 0,
      snacks: this.snacksEaten,
      growthLevel: reached,
      growthName: GROWTH_STAGES[reached - 1].name,
      bestGrowthLevel: reached,
      growthLevels: GROWTH_STAGES.length,
      cleared: true,
    };
    // 승리 연출(꽃·햇살)이 잠깐 보인 뒤 엔딩으로
    this.time.delayedCall(1200, () => {
      if (this.state === 'cleared') this.startEnding();
    });
  }

  /** 가족 엔딩 시작 (엔딩 다시보기도 여기로) — 게임 화면은 숨기고 별도 컷신 씬을 처음부터 */
  private startEnding(): void {
    if (this.state !== 'cleared' && this.state !== 'ending') return;
    this.state = 'ending';
    this.speed = 0;
    this.resetMood();
    for (const e of this.entities) {
      this.tweens.killTweensOf(e.sprite);
      e.sprite.destroy();
    }
    this.entities = [];
    this.setHudVisible(false);
    this.scene.setVisible(false);
    this.scene.stop('EndingCine');
    this.scene.launch('EndingCine');
    bus.emit(EV.endingStart, this.endingInfo);
  }

  /** (자동 테스트용) 엔딩 진행 상태 */
  debugEnding(): { state: string; t: number; scene: number } | null {
    return this.ending ? { state: this.state, t: +this.ending.t.toFixed(2), scene: this.ending.sceneNo } : null;
  }

  /** (개발용 테스트) 몬스터가 돌진 조건이면 항상 돌진 */
  debugForceDash = false;
  private groundGuide: Phaser.GameObjects.Rectangle | null = null;
  /** (개발용 테스트) 땅 기준선 표시 — 발이 닿는지 확인 */
  showGroundGuide(on: boolean): void {
    this.groundGuide?.destroy();
    this.groundGuide = on ? this.add.rectangle(0, this.groundY, 4000, 0.4, 0xffe14a, 0.9).setOrigin(0, 0).setDepth(30) : null;
  }

  /** (자동 테스트용) 바로 엔딩으로 */
  debugFinish(): void {
    this.battle?.destroy();
    this.battle = null;
    this.finishGame();
  }

  /** 공격·방패·필살 버튼, 고나 하트+HP, 보스 체력 → 화면 UI (값이 바뀔 때만 — DOM 작업 최소화) */
  private emitHud(): void {
    const live = this.state === 'playing' || this.state === 'evolving' || this.state === 'paused';
    const b = this.battle && live ? this.battle : null;
    const mode: CombatHud['mode'] = !live ? 'none' : b ? 'battle' : this.canThrow ? 'run' : 'none';
    const showPlayer = live || this.state === 'dead';
    const enabled = this.state === 'playing' && !b?.frozen && b?.mode !== 'victory' && b?.mode !== 'done';
    const attack: AttackState = mode === 'none' ? 'hidden' : !this.canThrow ? 'locked' : this.boomerang.isOut ? 'out' : 'ready';
    const now = this.time.now;
    const shield: CombatHud['shield'] = !b ? 'hidden' : now < this.shieldUntil ? 'active' : now < this.shieldReadyAt ? 'cool' : 'ready';
    const hud: CombatHud = {
      mode,
      enabled,
      attack,
      cooldown: Math.ceil(this.boomerang.remaining * 20) / 20,
      shield,
      shieldCool: shield === 'cool' ? Math.ceil(((this.shieldReadyAt - now) / (SHIELD.cooldownMs - SHIELD.activeMs)) * 20) / 20 : 0,
      special: Math.floor((b ? b.special : this.specialCarry) * 20) / 20,
      specialReady: !!b?.specialReady,
      dubai: !!b?.special2Available && b.mode !== 'done' && b.mode !== 'victory',
      boss: b && b.mode !== 'done' ? b.hud() : null,
      score: this.score,
      player: showPlayer ? { hearts: this.hearts, maxHearts: PLAYER.maxHearts, hp: this.hp, maxHp: BATTLE_HP.perHeart } : null,
      qte: b ? b.qteHud() : null,
      growth: showPlayer && !b ? { ratio: Math.round(this.growth.ratio * 40) / 40, level: this.growth.stageIndex + 1, levels: GROWTH_STAGES.length, final: this.growth.isFinal } : null,
    };
    // 하트·HP·성장 게이지는 화면 UI(왼쪽 위 패널)로 — 캔버스 하트·게이지는 쓰지 않음 (점수와 겹치던 '단계 칸' 제거)
    const wantPhaser = false;
    if (wantPhaser !== this.phaserHearts) {
      this.phaserHearts = wantPhaser;
      this.heartIcons.forEach((h) => h.setVisible(wantPhaser));
      this.gaugeGfx.setVisible(wantPhaser);
    }
    const key = `${hud.mode}|${hud.enabled}|${hud.attack}|${hud.cooldown}|${hud.shield}|${hud.shieldCool}|${hud.special}|${hud.specialReady}|${hud.boss ? `${hud.boss.hp}/${hud.boss.maxHp}/${hud.boss.phase}` : '-'}|${hud.player ? `${hud.player.hearts}/${hud.player.hp}` : '-'}|${hud.growth ? `${hud.growth.level}/${hud.growth.ratio}` : '-'}|${hud.score}|${this.qteKey(hud.qte)}|${hud.dubai}`;
    if (key === this.hudKey) return;
    this.hudKey = key;
    bus.emit(EV.combatHud, hud);
  }

  /** 미니게임 화면이 바뀌었는지 (리듬 음표는 움직이므로 위치까지 — 그때만 매 프레임) */
  private qteKey(q: CombatHud['qte']): string {
    if (!q) return '-';
    if (q.kind === 'resist') return `r${Math.round(q.gauge * 50)}`;
    if (q.kind === 'spit') return `s${q.show ? 1 : 0}${q.ready ? 1 : 0}`;
    if (q.kind === 'chair') return `c${Math.round(q.gauge * 50)}:${Math.ceil(q.left)}`;
    if (q.kind === 'crush') return `k${q.next}${q.count}:${Math.ceil(q.left)}`;
    if (q.kind === 'rhythm') return `m${q.holding ? 1 : 0}${q.score}:${q.notes.map((n) => `${Math.round(n.x * 300)}${n.state[0]}`).join(',')}`;
    return q.kind;
  }

  /** 보스전 '피하기' 버튼 */
  private dodge(): void {
    if (this.state !== 'playing' || this.battle?.frozen) return;
    this.pressJump();
  }

  // ───────────────────────── 테스트·디버그용 ─────────────────────────

  /** (자동 테스트용) 무적 */
  debugGod(on = true): void {
    this.invincibleUntil = on ? Number.MAX_SAFE_INTEGER : 0;
  }

  /** (자동 테스트용) 부메랑·흡입 상태 */
  debugCombat(): { out: boolean; pull: number; canThrow: boolean; stage: number; state: string; bald: boolean; tex: string } {
    return { out: this.boomerang.isOut, pull: this.pull, canThrow: this.canThrow, stage: this.growth.stageIndex, state: this.state, bald: this.isBald(), tex: this.player.texture.key };
  }

  /** (자동 테스트용) 보스전 바로 시작 */
  debugStartBoss(id: BossId): void {
    const def = BOSSES[id];
    this.debugSetStage(GROWTH_STAGES.findIndex((g) => g.id === def.atStage));
    this.growth.gauge = this.growth.stage.gaugeToNext ?? 0;
    if (id === 'sniff' || id === 'witch') this.clearedBosses.add('kiss');
    if (id === 'witch') {
      this.clearedBosses.add('sniff');
      this.enterCastle(true);
      return;
    }
    this.startBoss(id);
  }

  /** (자동 테스트용) 지금 보스전 정보 */
  debugBattle(): { id: BossId; hp: number; mode: string; special: number; phase2: boolean; frozen: boolean } | null {
    const b = this.battle;
    return b ? { id: b.id, hp: b.hp, mode: b.mode, special: b.special, phase2: b.phase2, frozen: b.frozen } : null;
  }

  /** (자동 테스트용) 보스 체력·필살 게이지 조절 */
  debugBoss(hp?: number, special?: number): void {
    if (!this.battle) return;
    if (hp !== undefined) this.battle.hp = hp;
    if (special !== undefined) this.battle.special = special;
  }

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
