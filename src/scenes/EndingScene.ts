/**
 * 가족 엔딩 컷신 — 액자형 컷신 8장면(성장 회상 → 그림 → 영상) → 황금 왕궁 액자 + 크레딧 → 헌정 문구 → The End
 *
 * 진행: 처음부터 끝까지 저절로 이어지는 하나의 동화 애니메이션 (버튼을 눌러 넘기는 슬라이드쇼가 아님)
 *   장면마다 ① 그 장면의 그림 애니메이션·영상이 끝나고(액자가 EV.endingMediaDone 으로 알림)
 *            ② 내레이션이 다 써지면 → '다음 ▶' 이 나타남 (그 전에는 숨김 — 자리는 그대로라 대사창이 흔들리지 않음)
 *            ③ 마지막 프레임을 잠깐 머물고 + 문장을 읽을 최소 시간이 지나면 → 저절로 다음 장면
 *   '다음 ▶' 을 누르면 바로 다음 장면 (자동 전환과 겹쳐도 장면 번호로 확인해 한 번만 넘어감)
 *   영상이 안 끝나면(로딩 실패·재생 오류) 장면별 최대 시간이 지나면 끝난 것으로 봄 → 멈춰 있지 않음
 *   마지막 장면 다음은 피날레(액자·크레딧·헌정 문구·The End)가 저절로, 버튼은 The End 뒤에만
 * 화면: 장면 그림·영상은 ui/endingFrame.ts (DOM 액자), 이 씬은 뒤 배경(보랏빛 버섯마을)·반딧불·꽃잎과 진행만.
 * 내레이션: 자막(한 글자씩)으로만 — 문장은 사용자가 준 그대로. 자막이 나오는 동안 엔딩 곡을 살짝 낮춤.
 * 음악: 엔딩 곡 한 곡을 엔딩 시작 때 한 번만 틀고 끝까지 그대로 (장면 전환·다음 버튼·자동 진행과 무관) — The End 뒤에만 페이드아웃.
 */
import Phaser from 'phaser';
import { bus, EV } from '../events';
import { sound } from '../audio';
import { perf } from '../perf';
import { preloadEndingFrames } from '../ui/endingFrame';
import { EndingGrowth } from '../ui/endingGrowth';

/** 내레이션 (사용자가 준 문장 그대로) — 장면 i 의 문장 (at 은 예전 고정 시간표의 참고값) */
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
export const ENDING_SCENE_COUNT = 8;
/** 장면별 그림 애니메이션·영상이 끝나지 않을 때 기다리는 최대 시간(초) — 이 뒤엔 끝난 것으로 봄 (무한 대기 방지) */
export const SCENE_MEDIA_MAX = [11, 14, 10, 13, 2, 15, 2, 10];
/** 매체가 끝난 뒤 마지막 장면을 잠깐 머무는 시간(초) — 이 뒤에 저절로 넘어감 (마지막 가족사진은 조금 더) */
export const SCENE_HOLD = [1.6, 1.6, 1.6, 1.8, 1.4, 1.8, 1.4, 2.8];
/** 자막 한 글자 타이핑 시간(초) */
const TYPE_STEP = 0.06;
/** 문장을 읽을 최소 시간(초) = 기본 + 글자 수 × */
const READ_BASE = 2.2;
const READ_PER_CHAR = 0.12;
/** 피날레 (피날레 시작 기준 초): 액자 → 크레딧이 아래에서 위로 → 헌정 문구 → The End(+음악 페이드아웃) → 버튼
 *  글자의 나타남·사라짐은 ui/endingUi.ts 의 CSS 가 같은 시각으로 맞춤 (style.css 의 fin-* 지연 시간과 같은 값) */
export const FINALE_CREDITS_AT = 4.2;
export const FINALE_CREDITS_LEN = 14;
export const FINALE_DEDICATION_AT = 18.6;
export const FINALE_END_AT = 24.4;
export const FINALE_FADE_AT = FINALE_END_AT;
export const FINALE_BUTTONS_AT = 28.6;

/** 액자 장면 효과 (DOM 액자가 받음) */
export type EndingFx = 'kiss' | 'sniff';

interface Layout {
  bg: string;
  W: number;
  H: number;
  lamps: [number, number][];
}

const LAYOUTS: Record<'land' | 'port', Layout> = {
  land: { bg: 'end-bgB-land', W: 320, H: 180, lamps: [[94, 41], [237, 41]] },
  port: { bg: 'end-bgB-port', W: 180, H: 320, lamps: [[15, 116], [163, 116]] },
};

type Cue = { at: number; fn: () => void; done?: boolean };

/** 엔딩 그림 미리 받기 (최종 보스전 때 GameScene 이 부름) — 0 을 돌려줌 (Phaser 로더는 쓰지 않음) */
export function queueEndingArt(_scene: Phaser.Scene): number {
  preloadEndingFrames();
  return 0;
}

export class EndingScene extends Phaser.Scene {
  /** 지난 시간(초) — (검증용) 바꿔서 빨리 감기 가능 */
  t = 0;
  sceneNo = 1;
  /** (검증용) 이 시간에서 멈춤 */
  holdAt = Infinity;
  /** (검증용) 이 장면에서 더 넘어가지 않음 (마지막 가족사진 바로 보기 등) */
  stayAt = Infinity;
  /** 지금 장면 (0~7 · 8 = 피날레) */
  cur = -1;
  /** 피날레가 시작된 시각 (t 기준 · 아직이면 Infinity) */
  finaleAt = Infinity;
  /** '다음 ▶' 을 눌러도 되는 상태 (장면의 애니메이션·영상과 타이핑이 끝남) */
  ready = false;
  private sceneStart = 0;
  private mediaDoneAt = Infinity;
  private typedAt = Infinity;
  private readyAt = Infinity;
  private autoAt = Infinity;
  private cues: Cue[] = [];
  private L!: Layout;
  private dim!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('EndingCine');
  }

  create(): void {
    const tCreate = performance.now();
    this.t = 0;
    this.sceneNo = 1;
    this.holdAt = Infinity;
    this.stayAt = Infinity;
    this.cur = -1;
    this.finaleAt = Infinity;
    this.ready = false;
    this.cues = [];
    const cam = this.cameras.main;
    const portrait = this.scale.height > this.scale.width;
    this.L = LAYOUTS[portrait ? 'port' : 'land'];
    const L = this.L;
    // 고정 카메라: 배경 전체가 화면을 덮는 정수 배율, 가운데 (장면이 바뀌어도 움직이지 않음)
    const z = Math.max(1, Math.ceil(Math.max(this.scale.width / L.W, this.scale.height / L.H)));
    cam.setZoom(z).setBounds(0, 0, L.W, L.H).setRoundPixels(true).setBackgroundColor('#2a1a3a');
    cam.centerOn(L.W / 2, L.H / 2);
    this.add.image(0, 0, L.bg).setOrigin(0, 0).setDepth(0);
    for (const [i, [x, y]] of L.lamps.entries()) {
      const g = this.add.image(x, y, 'end-glow').setDepth(1).setScale(0.55).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: g, alpha: 0.72, scale: 0.6, duration: 1400 + i * 300, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }
    this.ambience();
    // 액자가 돋보이게 배경을 조금 어둡게 · 타이틀 이후엔 더 어둡게
    this.dim = this.add.rectangle(0, 0, L.W, L.H, 0x140a20, 1).setOrigin(0, 0).setDepth(310).setAlpha(0.35);
    cam.fadeIn(1400, 30, 16, 40);
    EndingGrowth.clock = () => this.t;
    this.buildCues();
    const onMedia = (i: number): void => {
      if (i === this.cur && this.mediaDoneAt === Infinity) this.mediaDoneAt = this.t;
    };
    bus.on(EV.endingMediaDone, onMedia);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      bus.off(EV.endingMediaDone, onMedia);
      bus.emit(EV.endingNextReady, false);
      this.cues = [];
      EndingGrowth.clock = null;
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
  // ───────────────────────── 진행 ─────────────────────────

  private at(at: number, fn: () => void): void {
    this.cues.push({ at, fn });
  }

  /** 장면 i 시작: 액자 그림·영상 + 내레이션. 넘어가는 때는 update() 가 정함 */
  private startScene(i: number): void {
    this.cur = i;
    this.sceneNo = i + 1;
    this.sceneStart = this.t;
    this.mediaDoneAt = Infinity;
    this.readyAt = Infinity;
    this.autoAt = Infinity;
    this.setReady(false);
    bus.emit(EV.endingFrame, i, 0);
    const l = ENDING_LINES[i];
    const chars = Array.from(l.text).length;
    // 타이핑 속도: 한 글자 약 0.06초 (자막 상자는 seconds×0.55/글자 수 로 계산)
    bus.emit(EV.prologueLine, { index: i, total: ENDING_LINES.length, text: l.text, seconds: (chars * TYPE_STEP) / 0.55 });
    this.typedAt = this.t + chars * TYPE_STEP + 0.3;
    sound.duckEnding(true);
    // 장면 6 뽀뽀와 킁카 (영상 두 개): 영상에 맞춰 작은 효과음만
    if (i === 5) {
      const s0 = this.t;
      this.at(s0 + 2.2, () => this.cur === 5 && sound.smooch());
      this.at(s0 + 5.04 + 2.0, () => this.cur === 5 && sound.inhale());
    }
  }

  private setReady(on: boolean): void {
    if (this.ready === on) return;
    this.ready = on;
    bus.emit(EV.endingNextReady, on);
  }

  /** 다음 장면으로 (from = 넘기려는 장면 — 그 사이 이미 넘어갔으면 아무것도 안 함: 자동·버튼이 겹쳐도 한 번만) */
  private advance(from: number): void {
    if (from !== this.cur || this.cur >= ENDING_SCENE_COUNT) return;
    if (from >= this.stayAt) return;
    this.setReady(false);
    if (from + 1 < ENDING_SCENE_COUNT) this.startScene(from + 1);
    else this.startFinale();
  }

  /** 황금 왕궁 액자 피날레: 크레딧 → 헌정 문구 → The End(+음악 페이드아웃) → 버튼 (모두 저절로 · 버튼은 마지막에만) */
  startFinale(): void {
    if (this.cur >= ENDING_SCENE_COUNT) return;
    this.cur = ENDING_SCENE_COUNT;
    this.sceneNo = 9;
    this.setReady(false);
    const f = this.t;
    this.finaleAt = f;
    this.tweens.add({ targets: this.dim, alpha: 0.7, duration: 1200, ease: 'Sine.InOut' });
    sound.duckEnding(false);
    bus.emit(EV.endingPhase, 'finale');
    // The End 가 나타나면 음악을 천천히 줄여 끝냄 (엔딩에서 음악을 건드리는 곳은 시작·자막 낮추기·이 페이드뿐)
    this.at(f + FINALE_FADE_AT, () => sound.fadeOutEnding(7));
    this.at(f + FINALE_BUTTONS_AT, () => bus.emit(EV.endingTheEnd));
  }

  /** (검증·테스트 메뉴) 장면 i 부터 바로 */
  jumpTo(i: number): void {
    if (i >= ENDING_SCENE_COUNT) {
      this.startFinale();
      return;
    }
    this.startScene(i);
  }

  /**
   * 다음 대사 버튼: 장면이 다 끝나 '다음 ▶' 이 보일 때만 바로 다음 장면으로.
   * 화면(장면·자막)만 넘어가고 음악은 건드리지 않음 — 엔딩 곡은 엔딩이 시작될 때 한 번만 틀고, 끝까지 같은 곡이 그대로 이어짐
   */
  nextLine(): boolean {
    if (this.cur < 0 || this.cur >= ENDING_SCENE_COUNT || !this.ready) return false;
    this.advance(this.cur);
    return true;
  }

  private buildCues(): void {
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
        sound.playEndingTrack(); // 늦게 준비돼도 곡은 처음부터 (장면 시각과 묶지 않음)
      };
      void sound.prepareEnding().then(go);
      this.time.delayedCall(2500, go);
    });
    this.at(0, () => this.cur < 0 && this.startScene(0));
  }

  /** 장면 진행: 매체 끝(또는 최대 시간) + 타이핑 끝 → '다음 ▶' · + 머무름·읽을 시간 → 저절로 다음 */
  private stepScene(): void {
    const i = this.cur;
    if (i < 0 || i >= ENDING_SCENE_COUNT) return;
    const t = this.t;
    if (this.mediaDoneAt === Infinity && t - this.sceneStart >= SCENE_MEDIA_MAX[i]) this.mediaDoneAt = t;
    if (this.readyAt === Infinity && this.mediaDoneAt !== Infinity && t >= this.typedAt) {
      this.readyAt = Math.max(this.mediaDoneAt, this.typedAt);
      const chars = Array.from(ENDING_LINES[i].text).length;
      this.autoAt = Math.max(this.mediaDoneAt + SCENE_HOLD[i], this.sceneStart + READ_BASE + chars * READ_PER_CHAR, this.readyAt + 1.2);
      sound.duckEnding(false);
      if (i < this.stayAt) this.setReady(true);
    }
    if (t >= this.autoAt) this.advance(i);
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 250) / 1000;
    this.t = Math.min(this.t + dt, this.holdAt);
    for (const c of [...this.cues]) {
      if (!c.done && this.t >= c.at) {
        c.done = true;
        c.fn();
      }
    }
    this.stepScene();
  }
}
