/**
 * ⚔ 킁카괴물 (마지막 보스, 4단계 '빅베이비 곤룡' 때 · 엔딩 직전)
 *   - 냄새 구름탄: 물결치며 날아오는 구름 (부메랑으로 부술 수 있음)
 *   - 코 흡입: 고나를 끌어당김 → 점프하면 덜 끌려감 / 흡입 중 코를 맞히면 2배 피해 + 흡입 중단
 *   - 냄새 폭발: 부풀었다가 땅을 따라 큰 냄새 파동 + 공중 구름 → 타이밍 맞춰 한 번 점프
 *   - 냄새 장판: 포물선으로 던진 냄새 덩어리가 바닥에 남아 땅과 함께 다가옴 → 점프
 *   - 2페이즈(체력 절반): '냄새 폭주' — 빨라지고, 구름 5발·장판 3개·폭발 2연속, 흡입이 더 셈
 */
import Phaser from 'phaser';
import { sound } from '../../audio';
import { BossBattle } from './BossBattle';
import type { BattleHost } from './types';

type Attack = 'clouds' | 'inhale' | 'bomb' | 'puddles';

export class SniffBattle extends BossBattle {
  private last: Attack | null = null;
  private count = 0;
  private inhaling = 0;
  private inhaleSnd = 0;
  private aura: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  constructor(host: BattleHost, tex: string) {
    super(host, 'sniff', tex);
  }

  protected idleFrame(): number {
    return this.inhaling > 0 ? 1 : 0;
  }

  protected chooseAttack(): void {
    const w: [Attack, number][] = [
      ['clouds', 3],
      ['inhale', 2],
      ['bomb', this.phase2 ? 2.4 : 1.6],
      ['puddles', 2],
    ];
    const order: Attack[] = ['clouds', 'puddles', 'inhale', 'bomb'];
    let pick: Attack;
    if (this.count < order.length) pick = order[this.count];
    else {
      const pool = w.filter(([a]) => a !== this.last);
      const total = pool.reduce((s, [, n]) => s + n, 0);
      let r = Math.random() * total;
      pick = pool[0][0];
      for (const [a, n] of pool) {
        r -= n;
        if (r <= 0) {
          pick = a;
          break;
        }
      }
    }
    this.count++;
    this.last = pick;
    if (pick === 'clouds') this.clouds();
    else if (pick === 'inhale') this.inhale();
    else if (pick === 'bomb') this.bomb();
    else this.puddles(this.phase2 && Math.random() < 0.5);
  }

  private nose(): { x: number; y: number } {
    return { x: this.bx - this.fw * 0.4, y: this.host.groundY - this.balt - this.fh * 0.36 };
  }

  private clouds(): void {
    const n = this.phase2 ? 5 : 3;
    this.setPose(2, 0.4);
    const alts = [8, 30, 12, 44, 8];
    for (let i = 0; i < n; i++) {
      this.after(0.3 + i * 0.36, () => {
        sound.puff();
        const m = this.nose();
        const speed = (this.phase2 ? 82 : 66) + Math.random() * 10;
        const targetY = this.host.groundY - alts[i];
        const t = Math.max(0.4, (m.x - this.host.basePlayerX) / speed);
        const h = this.spawn('boss-cloud', m.x, m.y, { vx: -speed, vy: (targetY - m.y) / t, r: 4.5 });
        h.wave = { amp: 4, freq: 5 + Math.random() * 2, t: Math.random() * 6, baseY: m.y };
      });
    }
    this.after(0.3 + n * 0.36 + 0.3, () => this.endAttack(1.4));
  }

  private inhale(): void {
    this.warn(0.5);
    this.after(0.55, () => {
      this.inhaling = this.phase2 ? 3.0 : 2.3;
      this.inhaleSnd = 0;
    });
    this.after(0.55 + (this.phase2 ? 3.0 : 2.3) + 0.2, () => this.endAttack(1.2));
  }

  protected onUpdate(dt: number): void {
    const host = this.host;
    if (this.inhaling > 0) {
      this.inhaling -= dt;
      this.inhaleSnd -= dt;
      if (this.inhaleSnd <= 0) {
        this.inhaleSnd = 0.9;
        sound.inhale();
      }
      // 끌어당김: 땅에 있으면 세게, 점프 중엔 약하게
      const s = (host.playerGrounded() ? 30 : 9) * (this.phase2 ? 1.35 : 1);
      const maxPull = this.bx - this.fw * 0.5 - host.basePlayerX;
      host.pull = Math.min(maxPull, host.pull + s * dt);
      // 빨려 들어가는 냄새 알갱이 (보이기만)
      if (Math.random() < dt * 14) {
        const m = this.nose();
        const p = host.scene.add.image(m.x - 40 - Math.random() * 90, m.y - 30 + Math.random() * 50, 'boss-dot').setDepth(10.8);
        host.scene.tweens.add({ targets: p, x: m.x, y: m.y, alpha: 0.2, duration: 420, ease: 'Quad.In', onComplete: () => p.destroy() });
      }
    } else if (host.pull > 0) {
      host.pull = Math.max(0, host.pull - 70 * dt);
    }
  }

  /** 흡입 중 코를 맞히면 2배 + 흡입 멈춤 */
  protected weakMul(): number {
    if (this.inhaling <= 0) return 1;
    this.inhaling = 0;
    this.setPose(2, 0.8);
    this.floatText('콧구멍 직격!', this.bx, this.host.groundY - this.fh - 6, '#fff3a0');
    return 2;
  }

  protected onBodyHit(): void {
    // 빨려 들어가 부딪힘 → 튕겨 나옴
    this.inhaling = 0;
    this.host.pull = Math.max(0, this.host.pull - 30);
  }

  private bomb(): void {
    this.warn(0.9);
    this.setPose(2, 1.0);
    this.host.scene.tweens.add({ targets: this.boss, scaleX: 1.15, scaleY: 1.12, duration: 900, yoyo: true, hold: 60, ease: 'Sine.In' });
    const blast = (): void => {
      sound.puff();
      sound.hit();
      this.host.scene.cameras.main.shake(260, 0.01);
      const m = this.nose();
      // 사방으로 퍼지는 냄새 (보이기만)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const c = this.host.scene.add.image(this.bx, m.y, 'boss-bigcloud').setDepth(10.7).setAlpha(0.9);
        this.host.scene.tweens.add({ targets: c, x: this.bx + Math.cos(a) * 46, y: m.y + Math.sin(a) * 30, alpha: 0, scale: 1.6, duration: 700, onComplete: () => c.destroy() });
      }
      // 땅을 따라 오는 큰 파동 (한 번 점프)
      const h = this.spawn('boss-bigcloud', m.x, this.host.groundY - 9, { vx: -150, shape: 'box', w: 14, h: 18, pierce: true, breakable: false, life: 3 });
      h.sprite.setScale(1.3);
      // 공중 구름 (더블 점프로 너무 높이 뛰면 맞음)
      for (const alt of [50, 66]) {
        const c = this.spawn('boss-cloud', m.x + 10, this.host.groundY - alt, { vx: -70, r: 4.5, threat: false });
        c.wave = { amp: 3, freq: 4, t: alt, baseY: this.host.groundY - alt };
      }
    };
    this.after(1.0, blast);
    if (this.phase2) this.after(1.6, blast);
    this.after(this.phase2 ? 2.3 : 1.7, () => this.endAttack(1.6));
  }

  private puddles(combo: boolean): void {
    const n = this.phase2 ? 3 : 2;
    this.setPose(2, 0.35);
    for (let i = 0; i < n; i++) {
      this.after(0.3 + i * 0.4, () => {
        sound.puff();
        const x0 = this.bx - 6;
        const y0 = this.host.groundY - this.fh * 0.8;
        const T = 0.85;
        const ay = 420;
        const tx = this.host.basePlayerX + 30 + i * 34 + Math.random() * 14;
        const vx = (tx - x0) / T;
        const vy = (this.host.groundY - 2 - y0 - 0.5 * ay * T * T) / T;
        this.spawn('boss-cloud', x0, y0, {
          vx,
          vy,
          ay,
          r: 4,
          threat: false,
          spin: 360,
          onLand: (h) => {
            const p = this.spawn('boss-puddle', h.x, this.host.groundY - 2.5, { shape: 'box', w: 24, h: 5, onGround: true, pierce: true, breakable: false, life: 14 });
            p.sprite.setAlpha(0);
            this.host.scene.tweens.add({ targets: p.sprite, alpha: 1, duration: 120 });
          },
        });
      });
    }
    if (combo) this.after(0.3 + n * 0.4 + 0.2, () => this.clouds());
    else this.after(0.3 + n * 0.4 + 0.5, () => this.endAttack(1.3));
  }

  protected onPhase2(): void {
    const scene = this.host.scene;
    scene.cameras.main.shake(400, 0.012);
    sound.warn();
    this.banner({ top: '💢 2페이즈', name: '냄새 폭주!', desc: '킁카괴물이 더 세졌어요', ms: 1800, tone: 'boss' });
    this.aura = scene.add
      .particles(0, 0, 'boss-dot', {
        follow: this.boss,
        followOffset: { x: 0, y: -this.fh / 2 },
        x: { min: -this.fw / 2, max: this.fw / 2 },
        y: { min: -this.fh / 2, max: this.fh / 3 },
        speedY: { min: -30, max: -10 },
        lifespan: 700,
        alpha: { start: 0.9, end: 0 },
        frequency: 70,
      })
      .setDepth(8.5);
  }

  protected onInterrupt(): void {
    this.inhaling = 0;
  }

  destroy(): void {
    this.aura?.destroy();
    this.host.pull = 0;
    super.destroy();
  }
}
