/**
 * ⚔ 뽀뽀괴물 (첫 번째 보스, 2단계 '기어 다니는 고나' 때)
 *   - 하트 뽀뽀탄: 입술에서 하트 3발(2페이즈 5발). 낮은 탄은 점프, 높은 탄은 땅에 그대로
 *   - 짧은 돌진: '!' 뒤에 땅을 쓸며 돌진 → 점프로 넘기
 *   - 뽀뽀 파동: 가까이 뛰어와 땅을 따라 퍼지는 하트 파동 → 점프
 *   - 각성: 처음엔 공격 수단이 없다가, 두 번째 공격 뒤 고나의 머리카락이 반짝 → 머리카락 부메랑 각성
 */
import { sound } from '../../audio';
import { BossBattle } from './BossBattle';
import type { BattleHost } from './types';

type Attack = 'shots' | 'dash' | 'wave';

export class KissBattle extends BossBattle {
  private done = 0;
  private last: Attack | null = null;
  private dashing = false;
  private dashHit = false;

  constructor(
    host: BattleHost,
    tex: string,
    private awakened: boolean,
  ) {
    super(host, 'kiss', tex);
  }

  protected idleFrame(): number {
    return Math.floor(this.time / 0.4) % 2;
  }

  protected chooseAttack(): void {
    if (!this.awakened && this.done >= 2) {
      this.awaken();
      return;
    }
    const w: [Attack, number][] = this.awakened
      ? [
          ['shots', 3],
          ['dash', this.phase2 ? 2.2 : 1.6],
          ['wave', this.phase2 ? 2.2 : 1.6],
        ]
      : [
          ['shots', 1],
          ['dash', 1],
        ];
    const pool = w.filter(([a]) => a !== this.last);
    const total = pool.reduce((s, [, n]) => s + n, 0);
    let r = Math.random() * total;
    let pick: Attack = pool[0][0];
    for (const [a, n] of pool) {
      r -= n;
      if (r <= 0) {
        pick = a;
        break;
      }
    }
    // 처음 두 번은 항상 같은 순서 (배우기 쉽게)
    if (this.done === 0) pick = 'shots';
    else if (this.done === 1 && !this.awakened) pick = 'dash';
    this.last = pick;
    this.done++;
    if (pick === 'shots') this.shots();
    else if (pick === 'dash') this.dash();
    else this.wave();
  }

  /** 입술 위치 */
  private lips(): { x: number; y: number } {
    return { x: this.bx - this.fw * 0.36, y: this.host.groundY - this.balt - this.fh * 0.36 };
  }

  private shots(): void {
    const n = this.phase2 ? 5 : 3;
    const gap = this.phase2 ? 0.26 : 0.34;
    const speed = this.phase2 ? 120 : 98;
    // 낮은 탄(점프) · 높은 탄(그대로) — 적어도 하나는 낮게
    const lows = this.phase2 ? [true, false, true, true, false] : [true, false, true];
    if (this.phase2) lows.sort(() => Math.random() - 0.5);
    this.setPose(2, 0.4);
    for (let i = 0; i < n; i++) {
      this.after(0.35 + i * gap, () => {
        this.setPose(2, 0.18);
        sound.smooch();
        const m = this.lips();
        const targetY = this.host.groundY - (lows[i] ? 7 : 31);
        const t = Math.max(0.3, (m.x - this.host.basePlayerX) / speed);
        this.spawn('boss-heart', m.x, m.y, { vx: -speed, vy: (targetY - m.y) / t, spin: 0, r: 3.5 });
      });
    }
    this.after(0.35 + n * gap + 0.2, () => this.endAttack(1.3));
  }

  private dash(): void {
    this.warn(0.75);
    this.setPose(1, 0.75);
    this.after(0.8, () => {
      sound.boing();
      this.dashing = true;
      this.dashHit = false;
      const speed = this.phase2 ? 270 : 225;
      const dist = this.bx + this.fw;
      this.moveTo(-this.fw, 0, dist / speed, 0, (t) => t, () => {
        this.dashing = false;
        // 오른쪽에서 다시 통통 등장
        this.bx = this.host.W + this.fw / 2;
        this.moveTo(this.homeX, 0, 0.9, 12, (t) => 1 - (1 - t) ** 2, () => this.endAttack(1.1));
      });
    });
  }

  protected onUpdate(): void {
    // 돌진을 맞지 않고 넘김 → 회피 보상
    if (this.dashing && !this.dashHit && this.bx + this.fw * 0.36 < this.host.basePlayerX - 8) {
      this.dashHit = true;
      this.gain(0.06);
    }
  }

  protected onBodyHit(): void {
    if (this.dashing) this.dashHit = true;
  }

  private wave(): void {
    // 가까이 폴짝 → 쿵 → 땅을 따라 하트 파동
    const nearX = Math.min(this.homeX, this.host.basePlayerX + 64);
    this.moveTo(nearX, 0, 0.6, 26, (t) => t, () => {
      sound.nestJump();
      this.host.scene.cameras.main.shake(140, 0.006);
      this.setPose(2, 0.6);
      this.after(0.25, () => this.emitWave());
      if (this.phase2) this.after(0.6, () => this.emitWave());
      this.after(this.phase2 ? 1.1 : 0.8, () => {
        this.moveTo(this.homeX, 0, 0.7, 26, (t) => t, () => this.endAttack(1.2));
      });
    });
  }

  private emitWave(): void {
    sound.smooch();
    const m = this.lips();
    const y = this.host.groundY - 7;
    const h = this.spawn('boss-wave', m.x, y, { vx: -125, shape: 'box', w: 10, h: 12, pierce: true, breakable: false, life: 1.25 });
    h.sprite.setScale(2);
    // 퍼지는 고리 (보이기만)
    const g = this.host.scene.add.ellipse(m.x, y, 8, 6).setStrokeStyle(1, 0xff7aa8, 1).setDepth(10.9);
    this.host.scene.tweens.add({ targets: g, scaleX: 9, scaleY: 3, alpha: 0, duration: 650, onComplete: () => g.destroy() });
  }

  /** 각성 연출: 커다란 뽀뽀 → 고나 머리카락이 반짝 → 머리카락 부메랑 */
  private awaken(): void {
    this.cutscene(3.1, () => {
      this.awakened = true;
      this.endAttack(0.9);
    });
    const scene = this.host.scene;
    this.setPose(2, 1.0);
    sound.smooch();
    const m = this.lips();
    const head = this.host.playerHead();
    const big = scene.add.image(m.x, m.y, 'boss-heart').setScale(2).setDepth(12);
    scene.tweens.add({ targets: big, x: head.x + 22, y: head.y - 4, scale: 3, duration: 900, ease: 'Sine.InOut' });
    this.after(0.95, () => {
      // 머리카락이 반짝! 하트를 튕겨 냄
      scene.cameras.main.flash(260, 255, 240, 200);
      this.host.sparkle(16, head.x, head.y - 4);
      scene.tweens.add({ targets: big, x: m.x + 30, y: m.y - 60, angle: 540, scale: 0.5, alpha: 0, duration: 700, ease: 'Quad.Out', onComplete: () => big.destroy() });
      sound.evolveDone();
      this.host.unlockBoomerang();
      this.banner({ top: '✨ 각성! ✨', name: '머리카락 부메랑', desc: '오른쪽 아래 공격 버튼으로 머리카락을 던져요!', ms: 2600, tone: 'power' });
    }, true);
  }

  protected onPhase2(): void {
    this.host.scene.cameras.main.shake(260, 0.008);
    sound.warn();
    this.banner({ top: '💢', name: '뽀뽀괴물이 화났어요!', desc: '공격이 빨라져요', ms: 1500, tone: 'boss' });
  }

  protected onInterrupt(): void {
    this.dashing = false;
  }
}
