/**
 * ⚔ 킁카괴물 (마지막 보스, 4단계 '자이언트 곤룡 고나' 때 · 엔딩 직전)
 *   모든 공격은 예고(!·부풂·화살표) 뒤에 오고, 점프 또는 방패로 피할 수 있음
 *   일반(HP 100~71%): 냄새 구름탄(3발, 부메랑으로 부술 수 있음) · 코 흡입(점프하면 덜 끌려감, 흡입 중 코를 맞히면 2배)
 *   1차 분노(70~36%): 흡입 범위·힘 증가 · 냄새 구름 5발 · 짧게 남는 냄새 장판 · 냄새 폭발
 *   2차 분노(40~16%) · 최종 분노(15~0%): 냄새 폭발이 잦아지고 흡입이 더 셈
 *   필살기 '돼지코 군단' (분노 단계마다 첫 공격 = 최소 3회): ① 킁킁 탐지! ② 돼지코 대소동! ③ 초특급 킁카 폭풍!
 *     돼지코(콧구멍 2개 분홍 코)들이 보스 코에서 튀어나와 킁킁(수축·팽창) · 고나 쪽으로 고개를 돌림 · 나뭇잎이 빨려 듦
 *     → 땅을 따라 오는 냄새 파동 (한 번 점프 또는 방패) → 어질어질/재채기 기절, 코가 약점 (2배 피해)
 */
import Phaser from 'phaser';
import { sound } from '../../audio';
import { haptics } from '../../haptics';
import { perf } from '../../perf';
import { DAMAGE } from '../../game/boss';
import { BossBattle, type Hostile } from './BossBattle';
import type { BattleHost } from './types';

type Attack = 'clouds' | 'inhale' | 'bomb' | 'puddles' | 'storm';
interface PigNose {
  s: Phaser.GameObjects.Sprite;
  on: boolean;
  /** 뿜는 중 (크게 부풂) 남은 시간 */
  puff: number;
  /** 다음 '킁!' 글자까지 */
  kung: number;
  scale: number;
  hx: number;
  hy: number;
}

export class SniffBattle extends BossBattle {
  private last: Attack | null = null;
  private count = 0;
  private inhaling = 0;
  private inhaleSnd = 0;
  /** 흡입 힘 배율 (1차 분노 1.4 · 폭풍 2.2) */
  private inhalePower = 1;
  /** 마지막 필살기 뒤 공격 수 (최종 분노에서 4번째마다 필살기 다시) */
  private sinceStorm = 0;
  /** (검증용) 약점 명중 횟수 */
  weakHits = 0;
  /** 돼지코 (재사용, 최대 5개) */
  private pigNoses: PigNose[] = [];
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
    let variant = 0;
    const order: Attack[] = ['clouds', 'inhale'];
    if (this.specialDue) {
      pick = 'storm';
      variant = this.specialsDone + 1;
    } else if (this.rage === 3 && this.sinceStorm >= 4) {
      pick = 'storm';
      variant = 3;
    } else if (this.rage === 0 && this.count < order.length) pick = order[this.count];
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
              ['bomb', this.rage >= 2 ? 2.2 : 1.3],
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
    this.sinceStorm = pick === 'storm' ? 0 : this.sinceStorm + 1;
    this.count++;
    this.last = pick;
    this.attackLog.push(pick + (variant ? variant : '') + (this.rage ? `#${this.rage}` : ''));
    if (pick === 'clouds') this.clouds();
    else if (pick === 'inhale') this.inhale();
    else if (pick === 'bomb') this.bomb();
    else if (pick === 'storm') this.pigStorm(variant || 3);
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
    if (this.pigNoses.length) this.updateNoses(dt);
    // 돌진하는 돼지코: 킁킁 프레임 · 화면 끝에서 땅에 부딪혀 터짐
    for (const h of this.hostiles) {
      if (h.dead || !h.crash) continue;
      h.sprite.setFrame(Math.floor(this.time / 0.08) % 2 ? 1 : 2);
      if (h.x < 10) this.noseCrash(h);
    }
    // 과녁은 코를 따라감
    if (this.target?.active) {
      const m = this.nose();
      this.target.setPosition(Math.round(m.x), Math.round(m.y)).setFrame(Math.floor(this.time / 0.15) % 2);
    }
    if (this.inhaling > 0) {
      this.inhaling -= dt;
      this.inhaleSnd -= dt;
      if (this.inhaleSnd <= 0) {
        this.inhaleSnd = 0.9;
        sound.inhale();
      }
      // 끌어당김: 땅에 있으면 세게, 점프 중엔 약하게
      const s = (host.playerGrounded() ? 30 : 9) * this.inhalePower * (this.rage >= 2 ? 1.15 : 1);
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

  /** 약점(과녁) 때 코를 맞히면 2배 + 코가 찌그러지고 밀려남 · 흡입 중 코를 맞혀도 2배 */
  protected weakMul(x?: number, y?: number): number {
    if (this.weakOpen && x !== undefined && y !== undefined) {
      const m = this.nose();
      if ((x - m.x) ** 2 + (y - m.y) ** 2 < 15 * 15) {
        this.weakHits++;
        const scene = this.host.scene;
        this.floatText('약점 명중! ×2', m.x, m.y - 16, '#ffe14a');
        sound.puff();
        haptics.play('specialHit');
        this.setPose(4, 0.6); // 눈 찡그림
        scene.tweens.add({ targets: this.boss, scaleX: 1.18, scaleY: 0.84, duration: 90, yoyo: true, ease: 'Quad.Out' });
        this.moveTo(Math.min(this.host.W - this.fw / 2 - 2, this.bx + 8), 0, 0.25, 4);
        this.host.sparkle(10, m.x, m.y);
        if (this.target?.active) this.target.setFrame(1);
        return 2;
      }
      return 1;
    }
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

  // ───────────────────────── 필살기: 돼지코 군단 ─────────────────────────

  /** 돼지코 (미리 그린 3프레임 · 최대 5개를 만들어 두고 재사용) */
  private nose3(i: number): PigNose {
    let n = this.pigNoses[i];
    if (!n || !n.s.active) {
      const s = this.host.scene.add.sprite(0, 0, 'sp-pignose', 0).setDepth(10.66).setVisible(false);
      n = { s, on: false, puff: 0, kung: 0, scale: 1, hx: 0, hy: 0 };
      this.pigNoses[i] = n;
    }
    return n;
  }

  /** 돼지코 등장: 보스 코에서 뿅 튀어나와 자리로 */
  private noseIn(i: number, x: number, y: number, scale = 1, delay = 0): void {
    const n = this.nose3(i);
    const m = this.nose();
    const scene = this.host.scene;
    n.on = true;
    n.puff = 0;
    n.kung = 0.3 + i * 0.17;
    n.scale = scale;
    n.hx = Math.round(Phaser.Math.Clamp(x, this.host.basePlayerX + 56, this.host.W - 14));
    n.hy = Math.round(y);
    scene.tweens.killTweensOf(n.s);
    n.s.setPosition(m.x, m.y).setScale(0).setAlpha(1).setAngle(0).setVisible(true).setFrame(0);
    scene.tweens.add({ targets: n.s, x: n.hx, y: n.hy, scale, duration: 380, delay: delay * 1000, ease: 'Back.Out', onStart: () => sound.boing() });
  }

  /** 돼지코 퇴장: 쏙 보스 코로 / drop = 힘이 빠져 툭 떨어짐 */
  private noseOut(i: number, drop = false, delay = 0): void {
    const n = this.pigNoses[i];
    if (!n || !n.on) return;
    const scene = this.host.scene;
    const m = this.nose();
    n.on = false;
    scene.tweens.killTweensOf(n.s);
    if (drop) scene.tweens.add({ targets: n.s, y: this.host.groundY - 4, angle: 70 + i * 20, alpha: 0, duration: 520, delay: delay * 1000, ease: 'Quad.In', onComplete: () => n.s.setVisible(false) });
    else scene.tweens.add({ targets: n.s, x: m.x, y: m.y, scale: 0, duration: 300, delay: delay * 1000, ease: 'Back.In', onComplete: () => n.s.setVisible(false) });
  }

  private allNosesOut(drop = false): void {
    this.pigNoses.forEach((_, i) => this.noseOut(i, drop, drop ? i * 0.12 : i * 0.06));
  }

  /**
   * 돼지코 돌진: 예고 0.55초(땅 높이로 내려와 부르르 떨며 '킁!' + 앞에 빨간 화살표) → 고나를 향해 빠르게 돌진
   * (땅을 따라 옴 → 한 번 점프 또는 방패 · 부메랑으로 부술 수 있음) → 피하면 화면 끝 땅에 '쾅' 부딪혀 터짐
   */
  private noseDash(i: number, speed: number, big = false): void {
    const n = this.pigNoses[i];
    if (!n?.on) return;
    const scene = this.host.scene;
    const gy = this.host.groundY;
    const laneY = gy - (big ? 12 : 9);
    n.on = false;
    scene.tweens.killTweensOf(n.s);
    // 예고: 땅 높이로 휙 내려와 부르르 (킁! 킁!)
    n.s.setFrame(1);
    scene.tweens.add({ targets: n.s, y: laneY, x: n.s.x + 4, angle: 0, duration: 260, ease: 'Quad.Out' });
    scene.tweens.add({ targets: n.s, scaleX: n.scale * 1.18, scaleY: n.scale * 0.86, duration: 70, yoyo: true, repeat: 3, delay: 260 });
    this.floatText(big ? '킁!! 킁!!' : '킁!', n.s.x, laneY - 14 * n.scale, '#ffc2d8');
    sound.inhale();
    const arrows: Phaser.GameObjects.Image[] = [];
    for (let x = n.s.x - 22; x > this.host.basePlayerX - 10; x -= 16) arrows.push(this.fx(scene.add.image(x, gy - 7, 'boss-arrow').setDepth(10.8).setTint(0xff7a7a).setAlpha(0.2)));
    scene.tweens.add({ targets: arrows, alpha: 0.95, duration: 120, yoyo: true, repeat: 2 });
    this.after(0.55, () => {
      arrows.forEach((a) => a.destroy());
      const x = n.s.x;
      n.s.setVisible(false);
      sound.puff();
      sound.boing();
      const w = big ? 26 : 18;
      const hgt = big ? 18 : 12;
      const h = this.spawn('sp-pignose', x, laneY, { vx: -speed, shape: 'box', w, h: hgt, pierce: false, breakable: true, life: 4, dmg: big ? DAMAGE.sniffStorm : DAMAGE.sniffNose, crash: true });
      h.sprite.setScale(n.scale).setDepth(11);
      h.onHit = (hh, blocked) => this.specialImpact(hh.x, hh.y, 'boss-dot', [255, 160, 200], blocked);
      // 뒤로 남는 바람 자국 (개수 제한)
      const trail = this.fx(scene.add.particles(0, 0, 'boss-dot', { follow: h.sprite, lifespan: 260, frequency: perf.low ? 90 : 45, speedX: { min: 40, max: 90 }, scale: { start: 1.6, end: 0.4 }, alpha: { start: 0.8, end: 0 } }).setDepth(10.9));
      this.after(3, () => trail.active && trail.stop(), true);
    });
  }

  /** 돌진한 돼지코가 화면 끝 땅에 부딪힘 → 픽셀 폭발 */
  private noseCrash(h: Hostile): void {
    const scene = this.host.scene;
    this.kill(h);
    sound.puff();
    sound.nestJump();
    scene.cameras.main.shake(140, 0.009);
    const burst = this.fx(scene.add.particles(Math.max(6, h.x), this.host.groundY - 4, 'boss-dot', { speed: { min: 40, max: 120 }, angle: { min: 200, max: 340 }, lifespan: 420, scale: { start: 2, end: 0.4 }, emitting: false }).setDepth(11));
    burst.explode(perf.low ? 6 : 12);
    const pop = this.fx(scene.add.sprite(Math.max(8, h.x), this.host.groundY, 'mon-pop', 1).setOrigin(0.5, 1).setDepth(11).setScale(1.6));
    scene.tweens.add({ targets: pop, alpha: 0, scale: 2.4, duration: 300, onComplete: () => pop.destroy() });
    this.after(0.6, () => burst.destroy(), true);
  }

  /** 도착 시각(arrive, 초)에 맞춰 돌진 예고·출발 시각 계산 — 돌진 사이 간격을 1초 이상으로 지키려고 */
  private fireAt(i: number, x: number, arrive: number, speed: number, big = false): number {
    const t = Math.max(0.8, arrive - (x - this.host.basePlayerX) / speed);
    this.after(t - 0.55, () => this.noseDash(i, speed, big));
    return t;
  }

  // ───────────────────────── 코 약점 (필살기 뒤 지쳤을 때) ─────────────────────────

  private weakOpen = false;
  private target: Phaser.GameObjects.Sprite | null = null;

  /** 코 중앙에 황금 과녁 — 그동안 부메랑이 코를 노리고, 코에 맞으면 2배 */
  private openWeakPoint(sec: number): void {
    const scene = this.host.scene;
    this.weakOpen = true;
    const m = this.nose();
    this.target?.destroy();
    this.target = this.fx(scene.add.sprite(m.x, m.y, 'sp-target', 0).setDepth(12.5).setScale(0.4));
    scene.tweens.add({ targets: this.target, scale: 1.3, duration: 260, ease: 'Back.Out' });
    this.floatText('코가 약점! 지금 공격!', m.x, m.y - 20, '#ffe14a');
    sound.warn();
    this.after(sec, () => this.closeWeakPoint());
  }

  private closeWeakPoint(): void {
    this.weakOpen = false;
    if (this.target?.active) {
      const t = this.target;
      this.host.scene.tweens.add({ targets: t, alpha: 0, scale: 0.4, duration: 200, onComplete: () => t.destroy() });
    }
    this.target = null;
  }

  aimPoint(): { x: number; y: number } | null {
    return this.weakOpen ? this.nose() : null;
  }

  /** 매 프레임: 돼지코 킁킁 (수축·팽창) · 고나 쪽으로 고개 돌림 · '킁!' 글자 */
  private updateNoses(dt: number): void {
    const p = this.host.playerHead();
    for (const [i, n] of this.pigNoses.entries()) {
      if (!n?.on || !n.s.active) continue;
      n.puff = Math.max(0, n.puff - dt);
      n.kung -= dt;
      const t = this.time + i * 0.13;
      const sniffing = this.inhaling > 0;
      let frame = Math.floor(t / (sniffing ? 0.12 : 0.2)) % 2 ? 2 : 0;
      let k = 1 + Math.sin(t * (sniffing ? 26 : 16)) * 0.06;
      if (n.puff > 0) {
        frame = 1;
        k = 1.25;
      }
      n.s.setFrame(frame);
      if (!this.host.scene.tweens.isTweening(n.s)) {
        n.s.setScale(Math.round(n.scale * k * 5) / 5);
        // 고나를 향해 고개를 돌림 (살짝 · 최대 28도)
        const deg = Phaser.Math.RadToDeg(Math.atan2(p.y - n.s.y, p.x - n.s.x));
        const tilt = Phaser.Math.Clamp(Phaser.Math.Angle.WrapDegrees(deg - 180) * 0.5, -28, 28);
        n.s.setAngle(tilt);
        n.s.y = n.hy + Math.round(Math.sin(t * 5) * 1.5);
      }
      if (n.kung <= 0) {
        n.kung = 0.7 + Math.random() * 0.3;
        this.floatText('킁!', n.s.x, n.s.y - 10 * n.scale, '#ffc2d8');
      }
    }
  }

  /** 빨려 드는 나뭇잎·먼지 (돼지코 쪽으로) — 필살기 동안만 */
  private suckLeaves(sec: number, toX: number): void {
    const scene = this.host.scene;
    const gy = this.host.groundY;
    const suck = this.fx(
      scene.add
        .particles(0, 0, 'sp-leaf', {
          x: { min: 0, max: Math.max(20, toX - 30) },
          y: { min: gy - 50, max: gy - 4 },
          speedX: { min: 110, max: 180 },
          speedY: { min: -14, max: 10 },
          rotate: { min: 0, max: 360 },
          lifespan: 900,
          frequency: perf.low ? 160 : 90,
          scale: 1.8,
          alpha: { start: 1, end: 0.3 },
        })
        .setDepth(10.6),
    );
    this.after(sec, () => {
      suck.stop();
      this.host.scene.time.delayedCall(950, () => suck.active && suck.destroy());
    }, true);
  }

  /**
   * 필살기 '돼지코 군단' (분노 단계마다 하나씩 — 최소 3회, 최종 분노에선 4번째 공격마다 ③ 다시)
   *   ① 킁킁 탐지! — 돼지코 2개가 고나를 킁킁 찾아낸 뒤 냄새 파동 2번
   *   ② 돼지코 대소동! — 돼지코 4개가 번갈아 빨아들였다(점프로 버팀) 파동을 뿜음 (4번)
   *   ③ 초특급 킁카 폭풍! — 거대 돼지코 + 작은 돼지코 4개 · 황록 회오리 · 강한 흡입 → 동시에 발사 → 에취! 기절
   * 모든 파동은 땅을 따라 옴 (한 번 점프 또는 방패) · 도착 간격 1초 이상. 끝나면 지쳐서/기절해서 약점 2배.
   */
  private pigStorm(variant: number): void {
    const scene = this.host.scene;
    const gy = this.host.groundY;
    const names = ['', '킁킁 탐지!', '돼지코 대소동!', '초특급 킁카 폭풍!'];
    const descs = ['', '돼지코가 돌진해요 — 빨간 화살표를 보면 점프!', '돼지코 4개가 연속 돌진! 하나씩 점프!', '빨려 들어가지 않게 계속 점프! 마지막 거대 돼지코도 점프!'];
    this.bossSpecialOn = true;
    const prep = variant === 3 ? 1.4 : 1.0;
    /** 돼지코 배율 (렌더 배율 5 와 곱해 정수 → 도트가 고르게) */
    const S = 1.6;
    this.warn(prep);
    this.setPose(1, prep + 0.4);
    this.banner({ top: `🐽 필살기 ${variant}/3`, name: names[variant], desc: descs[variant], ms: 1800, tone: 'boss' });
    // 예고: 코를 크게 부풀림 · 초록 오라 · 화면 어둡게
    scene.tweens.add({ targets: this.boss, scaleX: 1.2 + variant * 0.03, scaleY: 1.16 + variant * 0.03, duration: prep * 900, yoyo: true, hold: 200, ease: 'Sine.In' });
    this.specialTelegraph('sp-ring-green', prep);
    const left = this.bx - this.fw * 0.5;
    let lastArrive = 0;
    if (variant === 1) {
      this.noseIn(0, left - 4, gy - this.fh - 30, S, 0.25);
      this.noseIn(1, left - 26, gy - 34, S, 0.45);
      // 킁킁 탐지 (짧게 빨아들임 — 고나 쪽으로 고개를 돌림)
      this.after(1.0, () => {
        this.inhaling = 1.2;
        this.inhalePower = 0.8;
        this.inhaleSnd = 0;
      });
      this.suckLeaves(2.2, left - 20);
      this.after(1.1, () => this.specialRelease([200, 255, 120]));
      this.fireAt(0, left - 4, 3.6, 150);
      this.fireAt(1, left - 26, 4.8, 150);
      lastArrive = 4.8;
    } else if (variant === 2) {
      const pos: [number, number][] = [
        [left + 6, gy - this.fh - 52],
        [left - 22, gy - this.fh - 26],
        [left - 34, gy - 30],
        [left + 22, gy - this.fh - 16],
      ];
      pos.forEach(([x, y], i) => this.noseIn(i, x, y, S, 0.2 + i * 0.16));
      this.suckLeaves(5.6, left - 20);
      this.after(1.0, () => this.specialRelease([200, 255, 120]));
      // 번갈아 연속 돌진 (점점 빨라짐 · 도착 간격 1.05초 — 한 번씩 점프)
      const order = [2, 0, 3, 1];
      const speeds = [140, 160, 150, 185];
      order.forEach((ni, k) => this.fireAt(ni, pos[ni][0], 3.4 + k * 1.05, speeds[k]));
      lastArrive = 3.4 + 3 * 1.05;
    } else {
      // 거대 돼지코 + 작은 돼지코 4개 · 황록 회오리 · 강한 흡입
      this.noseIn(4, left + 4, gy - this.fh - 30, 2.8, 0.2);
      const small: [number, number][] = [
        [left - 30, gy - this.fh - 50],
        [left - 34, gy - 30],
        [left + 30, gy - this.fh - 62],
        [left - 8, gy - this.fh - 76],
      ];
      small.forEach(([x, y], i) => this.noseIn(i, x, y, S, 0.5 + i * 0.15));
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
      // 바람 방향 화살표 + 안전한 회피 구간 표시
      const arrows: Phaser.GameObjects.Image[] = [];
      for (const alt of [16, 40]) {
        for (let x = 10; x < left - 10; x += 34) {
          const a = this.fx(scene.add.image(x, gy - alt, 'boss-wind').setDepth(10.7).setFlipX(true).setScale(1.4).setAlpha(0.85));
          arrows.push(a);
          scene.tweens.add({ targets: a, x: x + 34, alpha: { from: 0.85, to: 0.2 }, duration: 600, repeat: -1 });
        }
      }
      const safe = this.fx(scene.add.image(this.host.basePlayerX, gy + 1, 'sp-safe').setOrigin(0.5, 1).setDepth(10.75).setAlpha(0));
      scene.tweens.add({ targets: safe, alpha: { from: 0.4, to: 1 }, duration: 260, yoyo: true, repeat: -1, delay: 900 });
      this.suckLeaves(3.6, left);
      this.after(1.4, () => {
        this.inhaling = 2.0;
        this.inhalePower = 2.0;
        this.inhaleSnd = 0;
      });
      this.after(3.5, () => {
        this.inhaling = 0;
        arrows.forEach((a) => a.destroy());
        this.setPose(2, 0.5);
        this.specialRelease([200, 255, 120]);
        scene.tweens.add({ targets: tornado, alpha: 0, scale: 2.2, duration: 500, onComplete: () => tornado.destroy() });
      });
      // 냄새 폭발 → 작은 돼지코 2개 연속 돌진 → 마지막 거대 돼지코가 가장 빠르게 돌진 (도착 간격 1.1초 이상)
      this.after(3.5, () => {
        const m = this.nose();
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const c = this.fx(scene.add.image(m.x, m.y, 'boss-bigcloud').setDepth(10.7).setAlpha(0.9));
          scene.tweens.add({ targets: c, x: m.x + Math.cos(a) * 50, y: m.y + Math.sin(a) * 30, alpha: 0, scale: 1.7, duration: 700, onComplete: () => c.destroy() });
        }
      });
      this.fireAt(1, small[1][0], 4.6, 150);
      this.fireAt(0, small[0][0], 5.7, 165);
      this.fireAt(4, left + 4, 7.0, 215, true);
      lastArrive = 7.0;
      this.after(lastArrive + 0.3, () => {
        safe.destroy();
        turn.stop();
      });
      // 에~에~에취! 재채기 → 기절
      this.after(lastArrive + 0.35, () => {
        this.floatText('에~ 에~ 에취!!', this.bx - 6, gy - this.fh - 8, '#fff3a0');
        sound.puff();
        sound.hit();
        scene.cameras.main.shake(260, 0.012);
        this.setPose(4, 0.8);
      });
      this.after(6.5 + 3, () => [...arrows, safe, tornado].forEach((a) => a.active && a.destroy()), true);
    }
    // 끝: 돼지코들이 힘이 빠져 떨어지거나 쏙 들어가고 → 어질어질(기절) · 코가 약점 2배
    this.after(lastArrive + 0.45, () => {
      this.allNosesOut(variant === 3);
      this.specialShown();
      const sec = variant === 3 ? 3.2 : 2.6;
      this.stun(sec, 1, variant === 3 ? '킁카괴물이 재채기하다 기절했어요!' : '킁카괴물이 어질어질!');
      this.openWeakPoint(sec);
    });
  }

  protected onRage(level: 1 | 2 | 3): void {
    // 분노: 전투 음악이 같은 박자 위치에서 더 강한 판으로
    if (level === 2) sound.switchMusicSync('sniff2');
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
        frequency: level === 3 ? 34 : level === 2 ? 50 : 100,
        scale: level === 3 ? 1.6 : 1,
      })
      .setDepth(8.5);
  }

  protected rageText(level: 1 | 2 | 3): string {
    return level === 1 ? '돼지코가 나타나요! 흡입도 더 세져요' : level === 2 ? '돼지코 대소동! 냄새 폭발도 잦아져요' : '초특급 킁카 폭풍 — 초록 화살표를 보면 계속 점프!';
  }

  // ───────────────────────── 패배 ─────────────────────────

  protected defeatLines(): string[] {
    return ['크으윽… 고나… 제법이군…!', '하지만 기억해라…', '나의 킁카는… 영원하다아아!!', '킁… 킁… 킁카아아!!'];
  }

  /** 코가 부풀었다가 힘없이 줄어듦 · 돼지코들이 하나씩 툭툭 떨어짐 · 고나 쪽을 킁킁 */
  protected onDefeat(): void {
    const scene = this.host.scene;
    const b = this.boss;
    scene.tweens.add({ targets: b, scaleX: 1.3, scaleY: 1.05, duration: 260, yoyo: true, ease: 'Sine.Out', onComplete: () => b.setScale(1.12, 0.82) });
    const left = this.bx - this.fw * 0.5;
    const pos: [number, number][] = [
      [left - 6, this.host.groundY - this.fh - 10],
      [left + 14, this.host.groundY - this.fh - 22],
      [left - 24, this.host.groundY - this.fh + 4],
    ];
    pos.forEach(([x, y], i) => {
      const n = this.fx(scene.add.sprite(x, y, 'sp-pignose', 1).setDepth(10.66).setScale(0));
      scene.tweens.add({ targets: n, scale: 1, duration: 260, delay: 120 + i * 120, ease: 'Back.Out' });
      // 힘을 잃고 하나씩 떨어짐
      scene.tweens.add({ targets: n, y: this.host.groundY - 4, angle: 80 + i * 30, alpha: 0, duration: 520, delay: 700 + i * 260, ease: 'Quad.In', onStart: () => n.setFrame(2), onComplete: () => n.destroy() });
    });
    this.after(1.6, () => {
      sound.inhale();
      this.floatText('킁… 킁…', this.bx - this.fw * 0.5, this.host.groundY - this.fh - 6, '#ffc2d8');
    }, true);
  }

  /** 대사 뒤: 엉덩이에서 아주 작은 냄새 구름 '뿡' → 털썩 쓰러짐 */
  protected exitAnim(): number {
    const scene = this.host.scene;
    this.stunT = 0;
    this.setPose(2, 1.4);
    this.after(0.3, () => {
      sound.fart();
      const c = this.fx(scene.add.sprite(this.bx + this.fw * 0.42, this.host.groundY - this.fh * 0.3, 'mon-cloud', 1).setDepth(12).setScale(0.6).setAlpha(0.95));
      scene.tweens.add({ targets: c, x: c.x + 10, y: c.y - 6, scale: 1, alpha: 0, duration: 900, onComplete: () => c.destroy() });
      this.floatText('뿡', this.bx + this.fw * 0.5, this.host.groundY - this.fh * 0.5, '#d8f080');
    }, true);
    this.after(0.9, () => {
      this.detached = true;
      const b = this.boss;
      sound.nestJump();
      scene.cameras.main.shake(200, 0.01);
      scene.tweens.add({ targets: b, angle: 90, y: b.y + 4, duration: 380, ease: 'Bounce.Out' });
      scene.tweens.add({ targets: b, alpha: 0, duration: 400, delay: 700 });
      this.host.sparkle(10, b.x, b.y - this.fh / 2);
    }, true);
    return 1.7;
  }

  protected onInterrupt(): void {
    this.inhaling = 0;
    this.boss.setScale(1);
    this.allNosesOut();
  }

  protected onCleanup(): void {
    this.aura?.destroy();
    this.aura = null;
    this.inhaling = 0;
    this.weakOpen = false;
    this.target = null;
    for (const n of this.pigNoses) {
      this.host.scene.tweens.killTweensOf(n.s);
      n.s.destroy();
    }
    this.pigNoses = [];
  }
}
