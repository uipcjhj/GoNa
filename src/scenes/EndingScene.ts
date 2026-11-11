/**
 * 가족 엔딩 컷신 — 액자형 픽셀아트 컷신 (8장면, 약 2분) → 타이틀 → 크레딧 → 마지막 문구 → 검은 화면
 *
 *   - 장면 그림: 확정 엔딩 스토리보드의 일러스트를 그대로 잘라 낸 그림(public/assets/ending/frames/s1~s8.png,
 *     tools/build_ending_frames.py)을 화면 위 같은 자리·같은 크기의 픽셀 액자 안에 보여 줌 (DOM · ui/endingFrame.ts)
 *   - 이 씬은 액자 뒤의 보랏빛 버섯마을 배경(고정 카메라 — 흔들림·이동 없음)·반딧불·꽃잎과
 *     진행(내레이션 자막·엔딩 곡·장면 번호·효과음·타이틀/크레딧 단계)만 맡음
 *   - 인물을 따로 떼어 움직이지 않음: 달리기 발걸음·하트·킁카 냄새·별빛 같은 작은 효과만 액자 안에서
 * 내레이션: 자막(한 글자씩)으로만 — 문장은 사용자가 준 그대로. 자막이 나오는 동안 엔딩 곡을 살짝 낮춤.
 * 음악: 엔딩 전용 오리지널 곡 bgm-ending.mp3 한 곡이 장면 전환과 상관없이 이어짐 (배경음악은 언제나 하나 — audio.ts).
 */
import Phaser from 'phaser';
import { bus, EV } from '../events';
import { sound } from '../audio';
import { perf } from '../perf';
import { preloadEndingFrames } from '../ui/endingFrame';

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
/** 황금 왕궁 액자 피날레 시작 (마지막 가족사진 영상 66.3~71.3초 → 마지막 프레임을 잠깐 머문 뒤) */
export const ENDING_FINALE_AT = 74.6;
/** (예전 이름 호환) 내레이션이 끝나는 때 = 피날레 시작 */
export const ENDING_TITLE_AT = ENDING_FINALE_AT;
/** 피날레: 마지막 문장 · The End · 음악 페이드아웃 · 버튼 (피날레 시작 기준 초) */
export const FINALE_TEXT_AT = 5.2;
export const FINALE_END_AT = 7.4;
export const FINALE_FADE_AT = 8.4;
export const FINALE_BUTTONS_AT = 12.6;
/** 버튼이 나오는 때 */
export const ENDING_THE_END_AT = ENDING_FINALE_AT + FINALE_BUTTONS_AT;

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
    this.buildCues();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.cues = [];
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
  /** 다음 대사 버튼: 다음 문장 · 마지막 문장 뒤면 피날레로 */
  nextLine(): boolean {
    if (this.t >= ENDING_TITLE_AT - 0.05) return false;
    const next = ENDING_LINES.find((l) => l.at > this.t + 0.05);
    const target = next ? next.at : ENDING_TITLE_AT;
    this.t = target - 0.02;
    sound.seekEnding(this.t);
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
        sound.playEndingTrack(this.t);
      };
      void sound.prepareEnding().then(go);
      this.time.delayedCall(2500, go);
    });
    ENDING_LINES.forEach((l, i) => this.at(l.at, () => this.line(i)));
    // 장면 1~8: 액자 그림 바꾸기 (같은 자리·같은 크기)
    ENDING_SCENES.forEach((at, i) =>
      this.at(at, () => {
        this.sceneNo = i + 1;
        // 빨리 감기·다음 버튼으로 늦게 불렸으면 그만큼 영상도 건너뜀
        bus.emit(EV.endingFrame, i, Math.max(0, this.t - at));
      }),
    );
    // 장면 6 뽀뽀와 킁카 (영상 두 개, 그림 속 하트·움직임 그대로): 영상에 맞춰 작은 효과음만
    const s6 = ENDING_SCENES[5];
    this.at(s6 + 2.2, () => sound.smooch());
    this.at(s6 + 5.04 + 2.0, () => sound.inhale());
    // ── 황금 왕궁 액자 피날레 (글자·액자는 화면 위 DOM — ui/endingUi.ts): 마지막 문장 → The End → 음악 페이드아웃 → 버튼
    this.at(ENDING_FINALE_AT - 1.2, () => this.tweens.add({ targets: this.dim, alpha: 0.7, duration: 1200, ease: 'Sine.InOut' }));
    this.at(ENDING_FINALE_AT, () => {
      this.sceneNo = 9;
      sound.duckEnding(false);
      bus.emit(EV.endingPhase, 'finale');
    });
    this.at(ENDING_FINALE_AT + FINALE_FADE_AT, () => sound.fadeOutEnding(6));
    this.at(ENDING_THE_END_AT, () => bus.emit(EV.endingTheEnd));
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs, 250) / 1000;
    this.t = Math.min(this.t + dt, this.holdAt);
    for (const c of this.cues) {
      if (!c.done && this.t >= c.at) {
        c.done = true;
        c.fn();
      }
    }
  }
}
