/**
 * ⚔ 킁카괴물 (마지막 보스, 4단계 '자이언트 곤룡 고나' 때 · 엔딩 직전)
 *   모든 공격은 예고(!·부풂·화살표) 뒤에 오고, 점프 또는 방패로 피할 수 있음
 *   일반(HP 100~71%): 냄새 구름탄(3발, 부메랑으로 부술 수 있음) · 코 흡입(점프하면 덜 끌려감, 흡입 중 코를 맞히면 2배)
 *   1차 분노(70~36%): 흡입 범위·힘 증가 · 냄새 구름 5발 · 짧게 남는 냄새 장판 · 냄새 폭발
 *   2차 분노(35~0%): 킁카 폭풍 필살기 — 코가 부풀고 화면에 바람 방향(초록 화살표) 표시 → 강한 흡입(계속 점프)
 *                    → 냄새 파동(점프 또는 방패) → 기절하며 약점 노출 (2배 피해)
 */
import Phaser from 'phaser';
import { sound } from '../../audio';
import { perf } from '../../perf';
import { DAMAGE } from '../../game/boss';
import { BossBattle } from './BossBattle';
import type { BattleHost } from './types';

type Attack = 'clouds' | 'inhale' | 'bomb' | 'puddles' | 'storm';

export class SniffBattle extends BossBattle {
  private last: Attack | null = null;
  private count = 0;
  private inhaling = 0;
  private inhaleSnd = 0;
  /** 흡입 힘 배율 (1차 분노 1.4 · 폭풍 2.2) */
  private inhalePower = 1;
  private stormTurn = true;
  private aura: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  constructor(host: BattleHost, tex: string) {
    super(host, 'sniff', tex);
  }

  protected idleFrame(): number {
    return this.inhaling > 0 ? 1 : 0;
  }

  protected moodFrame(base: number): number {
    // 흡입 중엔 화가 나도 코 벌렁 프레임
    return this.inhaling > 0 && this.stunT <= 0 ? 1 : super.moodFrame(base);
  }

  protected chooseAttack(): void {
    let pick: Attack;
    const order: Attack[] = ['clouds', 'inhale'];
    if (this.rage === 0 && this.count < order.length) pick = order[this.count];
    else if (this.rage === 2 && this.stormTurn) pick = 'storm';
    else {
      const w: [Attack, number][] =
        this.rage === 0
          ? [
              ['clouds', 3],
              ['inhale', 2],
            ]
          : [
              ['clouds', 3],
              ['inhale', 2],
              ['puddles', 2],
              ['bomb', 1.3],
            ];
      const pool = w.filter(([a]) => a !== this.last);
      const total = pool.reduce((sum, [, n]) => sum + n, 0);
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
    if (this.rage === 2) this.stormTurn = pick !== 'storm';
    this.count++;
    this.last = pick;
    this.attackLog.push(pick + (this.rage ? `#${this.rage}` : ''));
    if (pick === 'clouds') this.clouds();
    else if (pick === 'inhale') this.inhale();
    else if (pick === 'bomb') this.bomb();
    else if (pick === 'storm') this.storm();
    else this.puddles(this.rage >= 1 && Math.random() < 0.4);
  }

  private nose(): { x: number; y: number } {
    return { x: this.bx - this.fw * 0.4, y: this.host.groundY - this.balt - this.fh * 0.36 };
  }

  private clouds(): void {
    const n = this.rage >= 1 ? 5 : 3;
    this.warn(0.7);
    this.setPose(2, 0.7);
    const alts = [8, 30, 12, 44, 8];
    for (let i = 0; i < n; i++) {
      this.after(0.7 + i * 0.45, () => {
        sound.puff();
        const m = this.nose();
        const speed = 68 + Math.random() * 10;
        const targetY = this.host.groundY - alts[i];
        const t = Math.max(0.4, (m.x - this.host.basePlayerX) / speed);
        const h = this.spawn('boss-cloud', m.x, m.y, { vx: -speed, vy: (targetY - m.y) / t, r: 4.5, dmg: DAMAGE.sniffCloud });
        h.wave = { amp: 4, freq: 5 + Math.random() * 2, t: Math.random() * 6, baseY: m.y };
      });
    }
    this.after(0.7 + n * 0.45 + 0.3, () => this.endAttack(1.5));
  }

  private inhale(): void {
    this.warn(0.5);
    this.after(0.55, () => {
      this.inhaling = this.rage >= 1 ? 2.8 : 2.3;
      this.inhalePower = this.rage >= 1 ? 1.4 : 1;
      this.inhaleSnd = 0;
    });
    this.after(0.55 + (this.rage >= 1 ? 2.8 : 2.3) + 0.2, () => this.endAttack(1.2));
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
      const s = (host.playerGrounded() ? 30 : 9) * this.inhalePower;
      const maxPull = this.bx - this.fw * 0.5 - host.basePlayerX;
      host.pull = Math.min(maxPull, host.pull + s * dt);
      // 빨려 들어가는 냄새 알갱이 (보이기만)
      if (Math.random() < dt * 14 * this.inhalePower) {
        const m = this.nose();
        // 흡입 범위가 넓을수록 더 멀리서 빨려 옴
        const reach = 90 * this.inhalePower;
        const p = this.fx(host.scene.add.image(m.x - 40 - Math.random() * reach, m.y - 30 + Math.random() * 50, 'boss-dot').setDepth(10.8));
        host.scene.tweens.add({ targets: p, x: m.x, y: m.y, alpha: 0.2, duration: 420, ease: 'Quad.In', onComplete: () => p.destroy() });
      }
    } else if (host.pull > 0) {
      host.pull = Math.max(0, host.pull - 70 * dt);
    }
  }

  /** 흡입 중 코를 맞히면 2배 + 흡입 멈춤 */
  protected weakMul(): number {
    if (this.inhaling <= 0) return super.weakMul();
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
        const c = this.fx(this.host.scene.add.image(this.bx, m.y, 'boss-bigcloud').setDepth(10.7).setAlpha(0.9));
        this.host.scene.tweens.add({ targets: c, x: this.bx + Math.cos(a) * 46, y: m.y + Math.sin(a) * 30, alpha: 0, scale: 1.6, duration: 700, onComplete: () => c.destroy() });
      }
      // 땅을 따라 오는 큰 파동 (한 번 점프)
      const h = this.spawn('boss-bigcloud', m.x, this.host.groundY - 9, { vx: -150, shape: 'box', w: 14, h: 18, pierce: true, breakable: false, life: 3, dmg: DAMAGE.sniffBlast });
      h.sprite.setScale(1.3);
      // 공중 구름 (더블 점프로 너무 높이 뛰면 맞음)
      for (const alt of [50, 66]) {
        const c = this.spawn('boss-cloud', m.x + 10, this.host.groundY - alt, { vx: -70, r: 4.5, threat: false, dmg: DAMAGE.sniffCloud });
        c.wave = { amp: 3, freq: 4, t: alt, baseY: this.host.groundY - alt };
      }
    };
    this.after(1.0, blast);
    this.after(1.7, () => this.endAttack(1.6));
  }

  private puddles(combo: boolean): void {
    const n = this.rage >= 1 ? 3 : 2;
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
          dmg: DAMAGE.sniffPuddle,
          spin: 360,
          onLand: (h) => {
            const p = this.spawn('boss-puddle', h.x, this.host.groundY - 2.5, { shape: 'box', w: 24, h: 5, onGround: true, pierce: true, breakable: false, life: this.rage >= 1 ? 4.5 : 14, dmg: DAMAGE.sniffPuddle });
            p.sprite.setAlpha(0);
            this.host.scene.tweens.add({ targets: p.sprite, alpha: 1, duration: 120 });
          },
        });
      });
    }
    if (combo) this.after(0.3 + n * 0.4 + 0.2, () => this.clouds());
    else this.after(0.3 + n * 0.4 + 0.5, () => this.endAttack(1.3));
  }

  /**
   * 2차 분노 필살기 '킁카 폭풍': 코가 부풀고 화면에 초록 바람 화살표(킁카괴물 쪽) → 1.4초 뒤 강한 흡입 2초
   * (땅에 있으면 세게 끌려감 — 계속 점프하면 버팀, 방패로 몸통 충돌도 막음) → 땅을 따라 냄새 파동(점프·방패)
   * → 2.6초 기절, 코가 약점 (2배 피해).
   */
  private storm(): void {
    const scene = this.host.scene;
    const gy = this.host.groundY;
    this.warn(1.4);
    this.setPose(1, 3.6);
    sound.warn();
    this.banner({ top: '🌪 필살기', name: '초강력 킁카 폭풍!', desc: '빨려 들어가요 — 초록 화살표 자리에서 계속 점프! 그다음 냄새 파동을 넘어요', ms: 1800, tone: 'boss' });
    // 예고: 크게 숨을 들이마시며 몸·코가 부풀어 오름 · 초록 오라 · 화면 어둡게
    scene.tweens.add({ targets: this.boss, scaleX: 1.26, scaleY: 1.22, duration: 1300, ease: 'Sine.In' });
    this.specialTelegraph('sp-ring-green', 1.4);
    const m0 = this.nose();
    const noseRing = this.fx(scene.add.image(m0.x, m0.y, 'sp-ring-green').setDepth(9.75).setScale(0.3).setAlpha(0.9));
    scene.tweens.add({ targets: noseRing, scale: 0.9, duration: 500, yoyo: true, repeat: 3 });
    // 보스 둘레 거대한 황록 회오리 (미리 그린 3프레임, 나뭇잎·냄새 구름이 함께 돎)
    const tornado = this.fx(scene.add.sprite(this.bx, gy, 'sp-tornado', 0).setOrigin(0.5, 1).setDepth(9.68).setScale(0.4).setAlpha(0.85));
    scene.tweens.add({ targets: tornado, scale: 1.8, duration: 1400, ease: 'Sine.Out' });
    const turn = scene.tweens.addCounter({
      from: 0,
      to: 60,
      duration: 6000,
      onUpdate: (tw) => {
        if (!tornado.active) return void tw.stop();
        tornado.setFrame(Math.floor(tw.getValue() ?? 0) % 3);
      },
    });
    // 바람 방향 화살표 (화면 왼쪽 → 킁카괴물 쪽으로 흘러감)
    const arrows: Phaser.GameObjects.Image[] = [];
    for (const alt of [16, 40]) {
      for (let x = 10; x < this.bx - 20; x += 34) {
        const a = this.fx(scene.add.image(x, gy - alt, 'boss-wind').setDepth(10.7).setFlipX(true).setScale(1.4).setAlpha(0.85));
        arrows.push(a);
        scene.tweens.add({ targets: a, x: x + 34, alpha: { from: 0.85, to: 0.2 }, duration: 600, repeat: -1 });
      }
    }
    // 안전한 회피 구간: 고나 자리 발밑 초록 '여기서 점프!' 표시 (흡입~파동이 지나갈 때까지)
    const safe = this.fx(scene.add.image(this.host.basePlayerX, gy + 1, 'sp-safe').setOrigin(0.5, 1).setDepth(10.75).setAlpha(0));
    scene.tweens.add({ targets: safe, alpha: { from: 0.4, to: 1 }, duration: 260, yoyo: true, repeat: -1, delay: 900 });
    // 주변 나뭇잎·먼지가 보스 쪽으로 빨려 들어감 (흡입 동안만, 개수 제한)
    const suck = this.fx(
      scene.add
        .particles(0, 0, 'sp-leaf', {
          x: { min: 0, max: Math.max(20, this.bx - 40) },
          y: { min: gy - 46, max: gy - 4 },
          speedX: { min: 110, max: 180 },
          speedY: { min: -10, max: 10 },
          rotate: { min: 0, max: 360 },
          lifespan: 900,
          frequency: perf.low ? 160 : 90,
          scale: 1.8,
          alpha: { start: 1, end: 0.3 },
          emitting: false,
        })
        .setDepth(10.6),
    );
    this.after(1.4, () => {
      this.inhaling = 2.0;
      this.inhalePower = 2.2;
      this.inhaleSnd = 0;
      suck.start();
    });
    this.after(3.5, () => {
      this.inhaling = 0;
      suck.stop();
      arrows.forEach((a) => a.destroy());
      noseRing.destroy();
      scene.tweens.add({ targets: this.boss, scaleX: 1, scaleY: 1, duration: 200 });
      this.setPose(2, 0.5);
      // 발사 순간: 황록으로 번쩍 + 짧은 흔들림 + 쾅
      this.specialRelease([200, 255, 120]);
      sound.puff();
      const m = this.nose();
      // 초대형 냄새 파동 (그림 2.4배 — 판정은 예전 그대로 14x18: 한 번 점프로 넘음)
      const h = this.spawn('boss-bigcloud', m.x, gy - 9, { vx: -140, shape: 'box', w: 14, h: 18, pierce: true, breakable: false, life: 3, dmg: DAMAGE.sniffStorm });
      h.sprite.setScale(2.4).setOrigin(0.5, 0.65);
      h.onHit = (hh, blocked) => this.specialImpact(hh.x, hh.y, 'boss-dot', [200, 255, 120], blocked);
      // 파동 뒤로 작은 냄새 구름이 흩어짐 (개수 제한)
      const tail = this.fx(
        scene.add
          .particles(0, 0, 'boss-dot', { follow: h.sprite, lifespan: 500, frequency: perf.low ? 140 : 70, speedX: { min: 30, max: 90 }, speedY: { min: -30, max: 10 }, scale: { start: 2, end: 0.6 }, alpha: { start: 0.9, end: 0 } })
          .setDepth(10.8),
      );
      this.after(1.6, () => tail.stop(), true);
      // 회오리는 파동과 함께 흩어짐
      scene.tweens.add({ targets: tornado, alpha: 0, scale: 2.2, duration: 500, onComplete: () => tornado.destroy() });
    });
    const pass = (this.bx - this.host.basePlayerX) / 140;
    this.after(3.5 + pass + 0.3, () => {
      safe.destroy();
      turn.stop();
      this.stun(2.6, 2, '킁카괴물이 기절했어요! 코가 약점!');
    });
    // 중간에 끊기면 정리
    this.after(6.5, () => [...arrows, safe, noseRing, tornado].forEach((a) => a.active && a.destroy()), true);
  }

  protected onRage(level: 1 | 2): void {
    this.aura?.destroy();
    this.aura = this.host.scene.add
      .particles(0, 0, 'boss-dot', {
        follow: this.boss,
        followOffset: { x: 0, y: -this.fh / 2 },
        x: { min: -this.fw / 2, max: this.fw / 2 },
        y: { min: -this.fh / 2, max: this.fh / 3 },
        speedY: { min: -30, max: -10 },
        lifespan: 700,
        alpha: { start: 0.9, end: 0 },
        frequency: level === 2 ? 50 : 100,
      })
      .setDepth(8.5);
  }

  protected rageText(level: 1 | 2): string {
    return level === 1 ? '흡입이 더 세지고 냄새 구름·장판이 늘어나요' : '킁카 폭풍 필살기 — 초록 화살표를 보면 계속 점프!';
  }

  protected onInterrupt(): void {
    this.inhaling = 0;
    this.boss.setScale(1);
  }

  protected onCleanup(): void {
    this.aura?.destroy();
    this.aura = null;
    this.inhaling = 0;
  }
}
