/**
 * 마지막 모험 (킁카괴물을 이긴 뒤 약 75초 → 암흑의 이유식 성 도착)
 *   A 평화로운 시작 (0~22초): 버섯숲 그대로 · 딸기·바나나·쿠키가 줄줄이 (점프·이단 점프로 모으기) · 쉬운 바위 몇 개
 *   B 수상한 흔적 (22~48초): 바닥의 초록 이유식 자국 · 이유식 묻은 작은 발자국 · 덤불 뒤 커다란 숟가락 · 옅은 보라 안개 · 멀리서 웃음소리
 *     (최종 보스의 정체는 보여 주지 않음)
 *   C 암흑의 성으로 (48~72초): 승인된 배경 그림으로 천천히 바뀜 — 원경(먼 성, finale-bg-far) → 60초 근경(finale-bg-near)
 *     · 작은 번개 · 배경의 초록 방울 · 음악이 긴장감 있는 '성으로 가는 길'로 자연스럽게 바뀜
 *   도착 (72초~): 성 입구(finale-bg-gate)가 겹쳐 나타나며 달리기를 멈춤 → 암전 → 성 안(castle-interior) → 등장 컷신
 * 배경 그림은 GameScene.finaleBackdrop 이 숲 배경과 같은 좌표계(772×460 · 지면선 400)로 지면 뒤에 겹쳐 그림.
 * 흔적은 땅과 함께 흘러감.
 */
import Phaser from 'phaser';
import { sound } from '../audio';
import { perf } from '../perf';
import type { SnackKind } from '../config';

export interface FinaleHost {
  readonly scene: Phaser.Scene;
  readonly W: number;
  readonly H: number;
  readonly groundY: number;
  addSnack(kind: SnackKind, x: number, alt: number): void;
  addRock(x: number): void;
  /** 땅과 함께 흘러가는 장식 (충돌 없음) */
  addProp(tex: string, x: number, alt: number, depth: number, scale?: number): void;
  /** 화면 전체 색 덮개 (보스 분위기와 같은 층) */
  tint(color: number, alpha: number, ms: number): void;
  /** 승인된 성 배경 그림을 지금 배경 위에 겹쳐 나타나게 함 (ms = 겹치는 시간 · pan = 다가가는 시간(초)) */
  backdrop(kind: 'far' | 'near', ms: number, pan: number): void;
  /** 도착 (달리기 멈춤 → 성 안으로) */
  arrive(): void;
}

/** 구간 시각(초) */
export const FINALE = { clues: 22, castle: 48, near: 60, arrive: 72 };

export class FinaleRun {
  t = 0;
  done = false;
  private cues: { at: number; fn: () => void; done?: boolean }[] = [];
  private snackT = 1.2;
  private rockT = 7;
  private objs: Phaser.GameObjects.GameObject[] = [];
  private drops: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private fog: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private pattern = 0;

  constructor(private host: FinaleHost, start = 0) {
    this.t = start;
    this.build();
    // 건너뛴 시각의 연출은 바로 적용 (테스트로 중간부터 시작할 때)
    for (const c of this.cues) if (c.at < start) c.done = true;
    if (start >= FINALE.castle) this.applyCastleNow(start);
  }

  get phase(): 'peace' | 'clues' | 'castle' | 'arrive' {
    return this.t < FINALE.clues ? 'peace' : this.t < FINALE.castle ? 'clues' : this.t < FINALE.arrive ? 'castle' : 'arrive';
  }

  private at(at: number, fn: () => void): void {
    this.cues.push({ at, fn });
  }

  private build(): void {
    const h = this.host;
    // ── B 수상한 흔적 (풀밭 위에서도 잘 보이게 크게 · 여러 번)
    const stain = (dx: number, sc = 1.8) => h.addProp('witch-puddle', h.W + dx, 0, 4.6, sc);
    const prints = (n: number) => {
      for (let i = 0; i < n; i++) h.addProp('clue-print', h.W + 14 + i * 20, 0, 4.6, 1.5);
    };
    this.at(23, () => stain(20));
    this.at(25.5, () => stain(30, 1.5));
    this.at(27.5, () => prints(4));
    this.at(30, () => {
      h.addProp('clue-spoon', h.W + 34, 0, 4.4, 1.7);
      h.addProp('clue-bush', h.W + 26, 0, 4.5, 1.3);
    });
    this.at(33, () => {
      stain(20);
      stain(64, 1.4);
    });
    this.at(34.5, () => sound.witchLaugh(false));
    this.at(36, () => this.startFog(0.18));
    this.at(38, () => prints(5));
    this.at(40.5, () => stain(24, 2));
    this.at(42.5, () => {
      h.addProp('clue-spoon', h.W + 40, 0, 4.4, 1.4);
      stain(70, 1.5);
    });
    this.at(44.5, () => sound.witchLaugh(false));
    this.at(45.5, () => prints(6));
    // ── C 암흑의 성으로
    // 그림 자체가 보라 하늘이라 색 덮개는 옅게 (숲 → 원경 사이를 부드럽게 잇는 정도)
    this.at(FINALE.castle, () => {
      h.tint(0x2a1046, 0.16, 6000);
      h.backdrop('far', 4000, FINALE.near - FINALE.castle);
      sound.fadeOutMusic(1800);
    });
    this.at(FINALE.castle + 2, () => sound.startMusic('castle'));
    this.at(FINALE.near, () => h.backdrop('near', 3500, FINALE.arrive - FINALE.near));
    this.at(FINALE.castle + 5, () => this.startDrops());
    for (const tt of [53, 58.5, 63, 67.5, 70.5]) this.at(tt, () => this.lightning());
    this.at(60, () => sound.witchLaugh(true));
    this.at(66, () => this.startFog(0.3));
    this.at(FINALE.arrive, () => {
      this.done = true;
      h.arrive();
    });
  }

  /** 테스트로 C 구간부터 시작할 때 (분위기 즉시) */
  private applyCastleNow(start: number): void {
    this.host.tint(0x2a1046, 0.16, 10);
    if (start >= FINALE.near) this.host.backdrop('near', 10, Math.max(1, FINALE.arrive - start));
    else this.host.backdrop('far', 10, Math.max(1, FINALE.near - start));
    this.startDrops();
    this.startFog(0.3);
    sound.startMusic('castle');
  }

  update(dt: number): void {
    if (this.done) return;
    this.t += dt;
    for (const c of this.cues) {
      if (!c.done && this.t >= c.at) {
        c.done = true;
        c.fn();
      }
    }
    if (this.t >= FINALE.castle - 4) return; // 성 앞 구간은 간식만 조금
    // ── A·B 간식 줄 · 쉬운 바위
    this.snackT -= dt;
    if (this.snackT <= 0) {
      this.snackT = this.t < FINALE.clues ? 1.6 : 2.4;
      this.snackRow();
    }
    this.rockT -= dt;
    if (this.rockT <= 0) {
      this.rockT = 7 + Math.random() * 3;
      this.host.addRock(this.host.W + 24);
    }
  }

  /** 딸기·바나나·쿠키 줄 (낮게 · 점프 높이 아치 · 이단 점프 높이) */
  private snackRow(): void {
    const kinds: SnackKind[] = ['strawberry', 'banana', 'cookie'];
    const x0 = this.host.W + 16;
    const p = this.pattern++ % 3;
    for (let i = 0; i < 5; i++) {
      const alt = p === 0 ? 4 : p === 1 ? Math.round(10 + Math.sin((i / 4) * Math.PI) * 30) : 46 + (i % 2) * 6;
      this.host.addSnack(kinds[(i + p) % 3], x0 + i * 16, alt);
    }
  }

  private startDrops(): void {
    const s = this.host.scene;
    this.drops = s.add
      .particles(0, 0, 'witch-drop', {
        x: { min: 0, max: this.host.W },
        y: -6,
        speedY: { min: 26, max: 46 },
        lifespan: 5200,
        alpha: { start: 0.65, end: 0.15 },
        frequency: perf.low ? 520 : 300,
        maxAliveParticles: 12,
      })
      .setDepth(3.07);
    this.objs.push(this.drops);
  }

  private startFog(alpha: number): void {
    const s = this.host.scene;
    this.fog?.destroy();
    this.fog = s.add
      .particles(0, 0, 'witch-smoke', {
        x: { min: 0, max: this.host.W + 40 },
        y: { min: this.host.groundY - 18, max: this.host.groundY - 2 },
        speedX: { min: -24, max: -10 },
        lifespan: 6000,
        scale: { start: 3, end: 5 },
        alpha: { start: alpha, end: 0 },
        frequency: perf.low ? 700 : 420,
        maxAliveParticles: 10,
      })
      .setDepth(4.2);
    this.objs.push(this.fog);
  }

  private lightning(): void {
    const s = this.host.scene;
    sound.thunder();
    s.cameras.main.flash(110, 180, 120, 240);
    const b = s.add.image(20 + Math.random() * (this.host.W - 40), 14, 'castle-bolt').setDepth(3.08).setScale(1.3);
    this.objs.push(b);
    s.tweens.add({ targets: b, alpha: 0, duration: 380, delay: 100, onComplete: () => b.destroy() });
  }

  /** 정리 (성 안으로 들어갈 때 · 다시하기) */
  destroy(): void {
    for (const o of this.objs) if (o.active) o.destroy();
    this.objs = [];
    this.drops = null;
    this.fog = null;
  }
}
