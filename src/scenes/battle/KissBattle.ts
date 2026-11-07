/**
 * ⚔ 뽀뽀괴물 (첫 번째 보스, 2단계 '기어 다니는 고나' 때) — 튜토리얼 보스
 *   모든 공격 전 0.8초 이상 예고, 공격 뒤 2초 쉼, 공격끼리 겹치지 않음, 모두 점프 또는 방패로 피할 수 있음.
 *   일반(HP 100~71%): 느린 하트탄(낮게 3발, 1초 간격) · 짧은 돌진
 *   1차 분노(70~36%): 하트탄 2개 연속(한 번 점프로 둘 다 넘음) · 빠르게 통통 뛰며 자리 바꾸기 · 분홍 오라 · 화난 표정
 *   2차 분노(40~16%): 뽀뽀 파동이 더 자주 · 하트가 조금 빨라짐
 *   최종 분노(15~0%): 가장 빠르고 화려함
 *   필살기 (분노 단계마다 첫 공격 = 최소 3회, 최종 분노에선 4번째 공격마다 다시):
 *     ① 초대형 왕뽀뽀 1개  ② 왕뽀뽀 + 작은 하트탄 연발  ③ 왕뽀뽀 2연속 + 하트 폭풍(가장 화려)
 *     모두 화살표로 길을 1.6초 미리 보여 줌 → 점프 또는 방패. 쓰고 나면 지쳐서 공격 기회 (1.5배 피해)
 *   각성: 처음엔 공격 수단이 없다가, 두 번째 공격 뒤 고나의 머리카락이 반짝 → 머리카락 부메랑 각성
 */
import Phaser from 'phaser';
import { sound } from '../../audio';
import { perf } from '../../perf';
import { DAMAGE } from '../../game/boss';
import { BossBattle } from './BossBattle';
import type { BattleHost } from './types';

type Attack = 'shots' | 'double' | 'hop' | 'dash' | 'wave' | 'royal';

export class KissBattle extends BossBattle {
  private done = 0;
  private last: Attack | null = null;
  private dashing = false;
  private dashHit = false;
  /** 마지막 필살기 뒤 공격 수 (최종 분노에서 4번째마다 필살기 다시) */
  private sinceRoyal = 0;
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
    let variant = 0;
    if (!this.awakened) pick = this.done === 0 ? 'shots' : 'dash';
    else if (this.specialDue) {
      pick = 'royal';
      variant = this.specialsDone + 1;
    } else if (this.rage === 3 && this.sinceRoyal >= 4) {
      pick = 'royal';
      variant = 3;
    } else {
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
              ['wave', this.rage >= 2 ? 2.2 : 1.2],
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
    this.sinceRoyal = pick === 'royal' ? 0 : this.sinceRoyal + 1;
    this.last = pick;
    this.attackLog.push(pick + (variant ? variant : '') + (this.rage ? `#${this.rage}` : ''));
    this.done++;
    if (pick === 'royal') {
      this.royalKiss(variant || 1);
      return;
    }
    if (pick === 'shots') this.shots();
    else if (pick === 'double') this.doubleShots();
    else if (pick === 'hop') this.hop();
    else if (pick === 'dash') this.dash();
    else this.wave();
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
  /** 분노할수록 하트가 조금씩 빨라짐 (점프 타이밍은 그대로 넉넉하게) */
  private get heartSpeed(): number {
    return 69 * (1 + 0.07 * this.rage);
  }

  private shots(): void {
    const speed = this.heartSpeed;
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
    const speed = this.heartSpeed;
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
   * 필살기 '왕뽀뽀' (variant 1~3) — 분홍 화살표로 하트가 지나갈 길(땅 위 낮은 높이)을 1.6초 동안 보여 준 뒤
   * 커다란 하트가 날아옴 → 점프(높이 약 22px — 한 번 점프로 넘음) 또는 방패.
   *   ① 왕뽀뽀 1개  ② 왕뽀뽀 + 작은 하트탄 2발(착지 뒤 하나씩 점프)  ③ 왕뽀뽀 2연속(1.5초 간격) + 하트 폭풍 연출
   * 다 지나가면 지쳐서 공격하지 않고 1.5배로 아픔 (반격 시간).
   */
  private royalKiss(variant: number): void {
    const scene = this.host.scene;
    const m = this.lips();
    const y = this.host.groundY - 12;
    const names = ['', '초대형 왕뽀뽀!', '왕뽀뽀 + 하트 연발!', '왕뽀뽀 하트 폭풍!'];
    const descs = ['', '분홍 화살표 길로 거대한 하트가 와요 — 점프하거나 방패!', '큰 하트를 넘고, 작은 하트도 하나씩 점프!', '거대한 하트가 두 번! 한 번씩 점프!'];
    this.warn(1.6);
    this.setPose(2, 1.7); // 입술 쭉 (오므림)
    this.banner({ top: `💗 필살기 ${variant}/3`, name: names[variant], desc: descs[variant], ms: 1700, tone: 'boss' });
    // 예고 1.6초: 크게 부풀어 오름 · 분홍 오라 · 화면이 어두워짐(보스만 밝게) · 차오르는 소리
    scene.tweens.add({ targets: this.boss, scaleX: 1.3, scaleY: 1.3, duration: 1400, ease: 'Sine.In' });
    this.specialTelegraph('sp-ring-pink', 1.6);
    // 경로 미리 보기 (깜빡이는 화살표)
    const arrows: Phaser.GameObjects.Image[] = [];
    for (let x = m.x - 16; x > -8; x -= 15) arrows.push(this.fx(scene.add.image(x, y, 'boss-arrow').setDepth(10.8).setScale(1.3).setAlpha(0.2)));
    scene.tweens.add({ targets: arrows, alpha: 0.95, duration: 200, yoyo: true, repeat: 3 });
    // 입술 앞에 거대한 하트가 점점 커짐
    const charge = this.fx(scene.add.image(m.x - 6, this.host.groundY - 4, 'sp-heart').setOrigin(0.5, 1).setDepth(11).setScale(0.3));
    scene.tweens.add({ targets: charge, scale: 2.2, duration: 1500, ease: 'Sine.In' });
    // ③ 하트 폭풍: 화면 가득 분홍 하트가 휘몰아침 (보이기만 — 판정 없음, 개수 제한)
    if (variant === 3) {
      const storm = this.fx(
        scene.add
          .particles(0, 0, 'boss-tinyheart', {
            x: { min: 0, max: this.host.W },
            y: { min: -10, max: this.host.groundY - 40 },
            speedX: { min: -90, max: -40 },
            speedY: { min: 10, max: 40 },
            lifespan: 1600,
            scale: { start: 1.6, end: 0.6 },
            alpha: { start: 0.75, end: 0 },
            frequency: perf.low ? 120 : 55,
          })
          .setDepth(9.7),
      );
      this.after(6.2, () => {
        storm.stop();
        scene.time.delayedCall(1700, () => storm.active && storm.destroy());
      }, true);
      this.after(0.9, () => scene.cameras.main.flash(260, 255, 150, 200), true);
    }
    const speed = 105 + (variant - 1) * 8;
    this.after(1.7, () => {
      arrows.forEach((a) => a.destroy());
      charge.destroy();
      scene.tweens.add({ targets: this.boss, scaleX: 1, scaleY: 1, duration: 140 });
      // 발사 순간: 화면이 분홍으로 번쩍 + 아주 짧은 흔들림 + 쾅
      this.specialRelease([255, 120, 190]);
      this.launchRoyal(m.x - 6, y, speed);
    });
    let lastPass = 1.7 + (m.x - this.host.basePlayerX) / speed;
    if (variant === 2) {
      // 큰 하트를 넘고 착지한 뒤 작은 하트 2발 (1초 간격)
      const hs = this.heartSpeed;
      const travel = (m.x - this.host.basePlayerX) / hs;
      const arrive0 = lastPass + 1.0;
      for (let i = 0; i < 2; i++) this.after(Math.max(1.9, arrive0 + i * 1.0 - travel), () => this.fireHeart(true, hs));
      lastPass = arrive0 + 1.0;
    } else if (variant === 3) {
      // 두 번째 왕뽀뽀 (1.5초 뒤 — 착지하고 다시 뛸 시간)
      this.after(3.2, () => {
        this.setPose(2, 0.4);
        scene.cameras.main.flash(160, 255, 140, 200);
        this.launchRoyal(m.x - 6, y, speed);
      });
      lastPass += 1.5;
    }
    // 다 지나간 뒤: 어지러워하며 약점 노출 (1.5배)
    this.after(lastPass + 0.4, () => {
      this.specialShown();
      this.stun(variant === 3 ? 2.8 : 2.3, 1.5, variant === 3 ? '뽀뽀괴물이 녹초가 됐어요!' : '뽀뽀괴물이 지쳤어요!');
    });
  }

  /** 거대한 하트 한 발 (그림 약 40x35 = 일반 하트탄의 4배 · 판정 22x20) + 도는 하트 4개 + 꼬리 */
  private launchRoyal(x: number, y: number, speed: number): void {
    const scene = this.host.scene;
    sound.smooch();
    const h = this.spawn('sp-heart', x, y, { vx: -speed, shape: 'box', w: 22, h: 20, pierce: true, breakable: false, life: 5, dmg: DAMAGE.kissRoyal });
    h.sprite.setScale(2.2).setOrigin(0.5, 0.66); // 그림 아래가 땅에 닿게 (판정 중심은 그대로)
    h.onHit = (hh, blocked) => this.specialImpact(hh.x, hh.y, 'boss-heart', [255, 150, 200], blocked);
    const orbit = [0, 1, 2, 3].map(() => this.fx(scene.add.image(h.x, h.y, 'boss-heart').setDepth(11.2)));
    const trail = this.fx(
      scene.add
        .particles(0, 0, 'boss-heart', { follow: h.sprite, followOffset: { x: 12, y: -6 }, lifespan: 450, frequency: perf.low ? 140 : 70, speedX: { min: 20, max: 70 }, speedY: { min: -40, max: 30 }, scale: { start: 0.9, end: 0.3 }, alpha: { start: 1, end: 0 } })
        .setDepth(10.9),
    );
    const spin = scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 5000,
      onUpdate: (tw) => {
        if (h.dead || !h.sprite.active) {
          orbit.forEach((o) => o.active && o.destroy());
          if (trail.active) {
            trail.stop();
            scene.time.delayedCall(500, () => trail.active && trail.destroy());
          }
          tw.stop();
          return;
        }
        const a0 = (tw.getValue() ?? 0) * Math.PI * 2 * 7;
        orbit.forEach((o, i) => {
          const a = a0 + (i * Math.PI) / 2;
          o.setPosition(Math.round((h.x + Math.cos(a) * 26) * 5) / 5, Math.round((h.y - 12 + Math.sin(a) * 18) * 5) / 5);
        });
      },
    });
    this.after(5.2, () => spin.stop(), true);
  }

  protected onRage(level: 1 | 2 | 3): void {
    // 분노: 전투 음악이 같은 박자 위치에서 더 강한 판으로
    if (level >= 1) sound.switchMusicSync('kiss2');
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
        frequency: level === 3 ? 40 : level === 2 ? 70 : 140,
        scale: level === 3 ? 1.5 : 1,
      })
      .setDepth(8.5);
  }

  protected rageText(level: 1 | 2 | 3): string {
    return level === 1 ? '왕뽀뽀 필살기가 와요! 하트탄도 두 발씩' : level === 2 ? '왕뽀뽀 + 하트 연발! 뽀뽀 파동도 자주 와요' : '마지막 왕뽀뽀 하트 폭풍! 화살표 길을 보고 피해요';
  }

  // ───────────────────────── 패배 ─────────────────────────

  protected defeatLines(): string[] {
    return ['크윽… 두고 보자, 고나…!', '하지만… 내 뽀뽀는…', '절대 멈추지 않는다아아…! 쪽♡'];
  }

  /** 주저앉아 어질어질 — 작은 하트가 주변에 톡톡 떨어짐 */
  protected onDefeat(): void {
    const scene = this.host.scene;
    const hearts = this.fx(
      scene.add
        .particles(this.bx, this.host.groundY - this.fh, 'boss-tinyheart', {
          x: { min: -this.fw * 0.6, max: this.fw * 0.6 },
          speedY: { min: -30, max: -10 },
          speedX: { min: -20, max: 20 },
          gravityY: 120,
          lifespan: 900,
          alpha: { start: 1, end: 0 },
          frequency: perf.low ? 260 : 150,
        })
        .setDepth(12),
    );
    this.after(6, () => hearts.active && hearts.stop(), true);
  }

  /** 대사 뒤: 입술 삐죽 → 고나에게 작은 하트 하나 '쪽♡' → 펑! 사라짐 */
  protected exitAnim(): number {
    const scene = this.host.scene;
    this.stunT = 0;
    this.setPose(2, 1.2);
    this.boss.setScale(1);
    const m = this.lips();
    const head = this.host.playerHead();
    this.after(0.25, () => {
      sound.smooch();
      const h = this.fx(scene.add.image(m.x, m.y, 'boss-heart').setDepth(12));
      scene.tweens.add({ targets: h, x: head.x + 6, y: head.y - 8, duration: 600, ease: 'Sine.InOut', onComplete: () => {
        this.floatText('쪽♡', head.x, head.y - 16, '#ff9fc4');
        this.host.sparkle(6, head.x, head.y - 6);
        h.destroy();
      } });
    }, true);
    this.after(1.0, () => {
      this.detached = true;
      sound.puff();
      const b = this.boss;
      const pop = this.fx(scene.add.sprite(b.x, b.y - this.fh / 2, 'mon-pop', 0).setDepth(12).setScale(2.4));
      scene.tweens.add({ targets: pop, alpha: 0, duration: 380, delay: 120, onComplete: () => pop.destroy() });
      scene.tweens.add({ targets: b, scaleX: 1.4, scaleY: 0.2, alpha: 0, duration: 220, ease: 'Quad.In' });
      this.host.sparkle(14, b.x, b.y - this.fh / 2);
    }, true);
    return 1.3;
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
