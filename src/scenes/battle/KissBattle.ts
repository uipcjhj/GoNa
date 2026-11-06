/**
 * ⚔ 뽀뽀괴물 (첫 번째 보스, 2단계 '기어 다니는 고나' 때) — 튜토리얼 보스
 *   모든 공격 전 0.8초 이상 예고, 공격 뒤 2초 쉼, 공격끼리 겹치지 않음, 모두 점프 또는 방패로 피할 수 있음.
 *   일반(HP 100~71%): 느린 하트탄(낮게 3발, 1초 간격) · 짧은 돌진
 *   1차 분노(70~36%): 하트탄 2개 연속(한 번 점프로 둘 다 넘음) · 빠르게 통통 뛰며 자리 바꾸기 · 분홍 오라 · 화난 표정
 *   2차 분노(35~0%): 왕뽀뽀 필살기 — 화살표로 길을 1.6초 미리 보여 준 뒤 커다란 하트 → 점프 또는 방패,
 *                    쓰고 나면 2초 동안 지쳐서 공격 기회 (1.5배 피해)
 *   각성: 처음엔 공격 수단이 없다가, 두 번째 공격 뒤 고나의 머리카락이 반짝 → 머리카락 부메랑 각성
 */
import Phaser from 'phaser';
import { sound } from '../../audio';
import { DAMAGE } from '../../game/boss';
import { BossBattle } from './BossBattle';
import type { BattleHost } from './types';

type Attack = 'shots' | 'double' | 'hop' | 'dash' | 'wave' | 'royal';

export class KissBattle extends BossBattle {
  private done = 0;
  private last: Attack | null = null;
  private dashing = false;
  private dashHit = false;
  private royalTurn = true;
  private aura: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  constructor(
    host: BattleHost,
    tex: string,
    private awakened: boolean,
  ) {
    super(host, 'kiss', tex);
    // 돌진 충돌은 둥근 몸통만 (하트 뿔 제외): 높이 약 26px → 한 번 점프로 넉넉히 넘음
    this.contactHeight = 0.75;
  }

  protected idleFrame(): number {
    // 화나면 더 빨리 통통
    return Math.floor(this.time / (this.rage >= 1 ? 0.25 : 0.4)) % 2;
  }

  protected chooseAttack(): void {
    if (!this.awakened && this.done >= 2) {
      this.awaken();
      return;
    }
    let pick: Attack;
    if (!this.awakened) pick = this.done === 0 ? 'shots' : 'dash';
    else if (this.rage === 2 && this.royalTurn) pick = 'royal';
    else {
      const w: [Attack, number][] =
        this.rage === 0
          ? [
              ['shots', 3],
              ['dash', 2],
            ]
          : [
              ['double', 3],
              ['hop', 2],
              ['dash', 1.5],
              ['wave', 1.2],
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
    if (this.rage === 2) this.royalTurn = pick !== 'royal';
    this.last = pick;
    this.attackLog.push(pick + (this.rage ? `#${this.rage}` : ''));
    this.done++;
    if (pick === 'shots') this.shots();
    else if (pick === 'double') this.doubleShots();
    else if (pick === 'hop') this.hop();
    else if (pick === 'dash') this.dash();
    else if (pick === 'wave') this.wave();
    else this.royalKiss();
  }

  /** 입술 위치 */
  private lips(): { x: number; y: number } {
    return { x: this.bx - this.fw * 0.36, y: this.host.groundY - this.balt - this.fh * 0.36 };
  }

  /** 하트 하나 발사 (낮게 = 점프 / 높게 = 그대로) */
  private fireHeart(low: boolean, speed: number): void {
    this.setPose(2, 0.25);
    sound.smooch();
    const m = this.lips();
    const targetY = this.host.groundY - (low ? 7 : 31);
    const t = Math.max(0.3, (m.x - this.host.basePlayerX) / speed);
    this.spawn('boss-heart', m.x, m.y, { vx: -speed, vy: (targetY - m.y) / t, spin: 0, r: 3.5, dmg: DAMAGE.kissHeart });
  }

  /** 일반: 느린 하트탄 — 0.9초 예고 뒤 낮게 3발, 1초 간격 (한 발씩 점프) */
  private shots(): void {
    const speed = 69;
    this.warn(0.9);
    this.setPose(2, 0.9);
    for (let i = 0; i < 3; i++) this.after(0.9 + i * 1.0, () => this.fireHeart(true, speed));
    const travel = (this.bx - this.host.basePlayerX) / speed;
    this.after(0.9 + 2 * 1.0 + travel, () => this.endAttack(2.0));
  }

  /**
   * 1차 분노: 하트탄 2개 연속 × 2번 — 두 발 사이 0.3초라 한 번 점프로 둘 다 넘음 (점프 체공 약 0.67초),
   * 묶음 사이는 1.6초 (착지하고 다시 뛸 시간). 속도는 그대로.
   */
  private doubleShots(): void {
    const speed = 69;
    this.warn(0.9);
    this.setPose(2, 0.9);
    for (const t0 of [0.9, 2.5]) {
      this.after(t0, () => this.fireHeart(true, speed));
      this.after(t0 + 0.3, () => this.fireHeart(true, speed));
    }
    const travel = (this.bx - this.host.basePlayerX) / speed;
    this.after(2.8 + travel, () => this.endAttack(2.0));
  }

  /** 1차 분노: 빠르게 통통 세 번 뛰어 자리를 바꾼 뒤(고나와 80px 이상 떨어진 곳) 하트 2개 연속 한 번 */
  private hop(): void {
    const near = Math.max(this.host.basePlayerX + 90, this.homeX - 70);
    const target = Math.abs(this.bx - this.homeX) < 4 ? near : this.homeX;
    const step = (target - this.bx) / 3;
    const jump = (i: number): void => {
      if (i >= 3) {
        this.warn(0.8);
        this.setPose(2, 0.8);
        this.after(0.8, () => this.fireHeart(true, 69));
        this.after(1.1, () => this.fireHeart(true, 69));
        const travel = (target - this.host.basePlayerX) / 69;
        this.after(1.1 + travel, () => this.moveTo(this.homeX, 0, 0.6, 14, (t) => t, () => this.endAttack(2.0)));
        return;
      }
      sound.boing();
      this.moveTo(this.bx + step, 0, 0.32, 16, (t) => t, () => jump(i + 1));
    };
    jump(0);
  }

  /** 짧은 돌진 — 0.9초 예고(몸 흔들 + '!') 뒤 땅을 쓸고 지나감 → 점프로 넘기 (또는 방패) */
  private dash(): void {
    this.warn(0.9);
    this.setPose(1, 0.9);
    this.after(0.95, () => {
      sound.boing();
      this.dashing = true;
      this.dashHit = false;
      const speed = this.rage >= 1 ? 175 : 165;
      const dist = this.bx + this.fw;
      this.moveTo(-this.fw, 0, dist / speed, 0, (t) => t, () => {
        this.dashing = false;
        // 오른쪽에서 다시 통통 등장
        this.bx = this.host.W + this.fw / 2;
        this.moveTo(this.homeX, 0, 1.0, 12, (t) => 1 - (1 - t) ** 2, () => this.endAttack(2.0));
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

  /** 뽀뽀 파동 — 가까이 폴짝 → 0.8초 입술 예고 → 땅을 따라 하트 파동 (점프로 넘기 또는 방패) */
  private wave(): void {
    const nearX = Math.min(this.homeX, this.host.basePlayerX + 70);
    this.moveTo(nearX, 0, 0.7, 26, (t) => t, () => {
      sound.nestJump();
      this.host.scene.cameras.main.shake(140, 0.006);
      this.warn(0.8);
      this.setPose(2, 0.8);
      this.after(0.8, () => this.emitWave());
      const done = 1.8;
      this.after(done, () => {
        this.moveTo(this.homeX, 0, 0.8, 26, (t) => t, () => this.endAttack(2.0));
      });
    });
  }

  private emitWave(): void {
    sound.smooch();
    const m = this.lips();
    const y = this.host.groundY - 7;
    const h = this.spawn('boss-wave', m.x, y, { vx: -100, shape: 'box', w: 10, h: 12, pierce: true, breakable: false, life: 1.6, dmg: DAMAGE.kissWave });
    h.sprite.setScale(2);
    // 퍼지는 고리 (보이기만)
    const g = this.fx(this.host.scene.add.ellipse(m.x, y, 8, 6).setStrokeStyle(1, 0xff7aa8, 1).setDepth(10.9));
    this.host.scene.tweens.add({ targets: g, scaleX: 9, scaleY: 3, alpha: 0, duration: 650, onComplete: () => g.destroy() });
  }

  /** 각성 연출: 커다란 뽀뽀 → 고나 머리카락이 반짝 → 머리카락 부메랑 */
  private awaken(): void {
    this.cutscene(3.1, () => {
      this.awakened = true;
      this.endAttack(1.2);
    });
    const scene = this.host.scene;
    this.setPose(2, 1.0);
    sound.smooch();
    const m = this.lips();
    const head = this.host.playerHead();
    const big = this.fx(scene.add.image(m.x, m.y, 'boss-heart').setScale(2).setDepth(12));
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

  /**
   * 2차 분노 필살기 '왕뽀뽀': 분홍 화살표로 하트가 지나갈 길(땅 위 낮은 높이)을 1.6초 동안 보여 준 뒤
   * 커다란 하트가 천천히 날아옴 → 점프(높이 약 22px — 한 번 점프로 넘음) 또는 방패.
   * 쏜 뒤 2.2초 동안 지쳐서 공격하지 않고 1.5배로 아픔.
   */
  private royalKiss(): void {
    const scene = this.host.scene;
    const m = this.lips();
    const y = this.host.groundY - 12;
    this.warn(1.6);
    this.setPose(2, 1.7);
    this.banner({ top: '💗 필살기', name: '왕뽀뽀!', desc: '분홍 화살표 길로 큰 하트가 와요 — 점프하거나 방패!', ms: 1700, tone: 'boss' });
    // 경로 미리 보기 (깜빡이는 화살표)
    const arrows: Phaser.GameObjects.Image[] = [];
    for (let x = m.x - 16; x > -8; x -= 15) arrows.push(this.fx(scene.add.image(x, y, 'boss-arrow').setDepth(10.8).setScale(1.3).setAlpha(0.2)));
    scene.tweens.add({ targets: arrows, alpha: 0.95, duration: 200, yoyo: true, repeat: 3 });
    // 입술 앞에 하트가 점점 커짐
    const charge = this.fx(scene.add.image(m.x - 4, y, 'boss-heart').setDepth(11).setScale(0.5));
    scene.tweens.add({ targets: charge, scale: 3, duration: 1500, ease: 'Sine.In' });
    const speed = 105;
    this.after(1.7, () => {
      arrows.forEach((a) => a.destroy());
      charge.destroy();
      sound.smooch();
      scene.cameras.main.shake(160, 0.006);
      const h = this.spawn('boss-heart', m.x - 4, y, { vx: -speed, shape: 'box', w: 22, h: 20, pierce: true, breakable: false, life: 5, dmg: DAMAGE.kissRoyal });
      h.sprite.setScale(3);
    });
    const pass = (m.x - this.host.basePlayerX) / speed;
    this.after(1.7 + pass + 0.4, () => this.stun(2.2, 1.5, '뽀뽀괴물이 지쳤어요!'));
  }

  protected onRage(level: 1 | 2): void {
    this.aura?.destroy();
    this.aura = this.host.scene.add
      .particles(0, 0, 'boss-tinyheart', {
        follow: this.boss,
        followOffset: { x: 0, y: -this.fh / 2 },
        x: { min: -this.fw / 2, max: this.fw / 2 },
        y: { min: -this.fh / 2, max: this.fh / 3 },
        speedY: { min: -26, max: -8 },
        lifespan: 700,
        alpha: { start: 0.9, end: 0 },
        frequency: level === 2 ? 70 : 140,
      })
      .setDepth(8.5);
  }

  protected rageText(level: 1 | 2): string {
    return level === 1 ? '하트탄이 두 발씩! 통통 뛰며 자리를 바꿔요' : '왕뽀뽀 필살기 — 화살표 길을 보고 피해요';
  }

  protected onCleanup(): void {
    this.aura?.destroy();
    this.aura = null;
    this.dashing = false;
  }

  protected onInterrupt(): void {
    this.dashing = false;
  }
}
