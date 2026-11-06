/**
 * 보스전 공통 틀.
 *   등장 연출(intro) → 전투(fight) ⇄ 연출(cutscene: 필살기·각성) → 승리 연출(victory) → 끝(done)
 *   - 보스 체력·2페이즈 전환·피격 반짝임
 *   - 적 투사체(Hostile): 이동·플레이어 충돌·회피 보상·부메랑으로 부수기
 *   - 필살 게이지(0~1)와 필살기 '머리카락 회오리'
 *   - 전투 중 간식 등장 (게이지 충전용)
 * 보스별 공격 패턴은 하위 클래스(KissBattle, SniffBattle)의 chooseAttack() 에서.
 *
 * 시간은 모두 update(dt) 로 진행 — 일시정지(update 멈춤) 때 같이 멈춥니다.
 */
import Phaser from 'phaser';
import { bus, EV, type BannerInfo, type BossId } from '../../events';
import { sound } from '../../audio';
import { perf } from '../../perf';
import { BOSSES, SPECIAL_GAIN, type BossDef } from '../../game/boss';
import type { SnackKind } from '../../config';
import { circleRect, type BattleHost, type Rect } from './types';
import type { HairBoomerang } from './HairBoomerang';

export interface Hostile {
  id: number;
  sprite: Phaser.GameObjects.Image;
  x: number;
  /** 중심 y (화면 좌표) */
  y: number;
  vx: number;
  vy: number;
  ay: number;
  shape: 'circle' | 'box';
  r: number;
  w: number;
  h: number;
  /** 부메랑으로 부술 수 있음 */
  breakable: boolean;
  /** 땅과 함께 흘러감 (바닥 장판) */
  onGround: boolean;
  /** 고나 옆을 지나가면 '회피' 보상 */
  threat: boolean;
  /** 고나에게 맞아도 사라지지 않음 (파동·장판) */
  pierce: boolean;
  hitPlayer: boolean;
  dodged: boolean;
  life: number;
  spin: number;
  /** 위아래 물결 이동 */
  wave: { amp: number; freq: number; t: number; baseY: number } | null;
  /** 맞으면 HP 피해 */
  dmg: number;
  /** 땅에 닿으면 (포물선 탄 → 장판) */
  onLand: ((h: Hostile) => void) | null;
  /** 고나에게 맞거나 방패에 막혔을 때 (필살기 충격 연출) */
  onHit?: ((h: Hostile, blocked: boolean) => void) | null;
  dead: boolean;
}

type Mode = 'intro' | 'fight' | 'cutscene' | 'victory' | 'done';
type Task = { t: number; fn: () => void };
interface Motion {
  x0: number;
  a0: number;
  x1: number;
  a1: number;
  dur: number;
  t: number;
  arc: number;
  ease: (t: number) => number;
  done: (() => void) | null;
}

const SNACKS: SnackKind[] = ['strawberry', 'banana', 'cookie'];

export abstract class BossBattle {
  readonly def: BossDef;
  hp: number;
  /**
   * 분노 단계: 0 일반(HP 100~71%) · 1 1차 분노(70~36%) · 2 2차 분노(35~0%).
   * 바뀔 때 1.5초 멈추고 화내는 연출 + 경고 문구.
   */
  rage: 0 | 1 | 2 = 0;
  get phase2(): boolean {
    return this.rage >= 1;
  }
  /** 지침·기절 남은 시간(초) — 공격 안 하고 약점 노출 */
  stunT = 0;
  private stunMul = 1;
  private stars: Phaser.GameObjects.Image[] = [];
  private pendingRage = false;
  /** 보스가 만든 효과 오브젝트 (예고 화살표·충전 하트·오라·잔상…) — cleanupCombat() 에서 한꺼번에 제거 */
  private fxList: Phaser.GameObjects.GameObject[] = [];
  /** 필살 게이지 0~1 */
  special = 0;
  /** 연출 중: 세상(땅·고나·투사체)이 멈춤 */
  frozen = false;
  mode: Mode = 'intro';
  /** (검증용) 지금까지 쓴 공격 이름 */
  readonly attackLog: string[] = [];

  protected boss: Phaser.GameObjects.Sprite;
  protected bx = 0;
  /** 보스 발이 땅에서 떠 있는 높이 */
  protected balt = 0;
  protected homeX = 0;
  protected hostiles: Hostile[] = [];
  protected busy = false;
  protected cooldown = 1.0;
  protected time = 0;
  /** 연출용 포즈 (프레임, 남은 시간) */
  private pose = { frame: -1, t: 0 };
  private hurtT = 0;
  private motion: Motion | null = null;
  private cine: Task[] = [];
  private ai: Task[] = [];
  private nextId = 1;
  private snackT = 4;
  private warnMark: Phaser.GameObjects.Image;
  private warnT = 0;
  /** 승리 연출: 보스가 날아가는 중 (위치를 트윈에 맡김) */
  private detached = false;
  private dim: Phaser.GameObjects.Rectangle;
  protected readonly fw: number;
  protected readonly fh: number;

  constructor(
    protected host: BattleHost,
    id: BossId,
    protected tex: string,
  ) {
    this.def = BOSSES[id];
    this.hp = this.def.maxHp;
    const scene = host.scene;
    const f = scene.textures.getFrame(tex, 0);
    this.fw = f.cutWidth;
    this.fh = f.cutHeight;
    // 오른쪽 끝 (가로 화면처럼 넓으면 고나에게서 너무 멀지 않게)
    this.homeX = Math.min(host.W - Math.max(26, Math.round(this.fw * 0.5) + 4), host.basePlayerX + 175);
    this.bx = host.W + this.fw;
    this.boss = scene.add.sprite(this.bx, host.groundY, tex, 0).setOrigin(0.5, 1).setDepth(8);
    this.warnMark = scene.add.image(0, 0, 'boss-warn').setOrigin(0.5, 1).setDepth(14).setVisible(false);
    this.dim = scene.add.rectangle(0, -60, 2000, 2000, 0x1a0f24, 0).setOrigin(0, 0).setDepth(9.6);
  }

  get id(): BossId {
    return this.def.id;
  }

  // ───────────────────────── 하위 클래스가 구현 ─────────────────────────

  /** 다음 공격 하나 시작 (끝나면 endAttack) */
  protected abstract chooseAttack(): void;
  /** 분노 단계 진입 (연출이 끝난 뒤 오라 등) */
  protected abstract onRage(level: 1 | 2): void;
  /** 분노 안내 문구 */
  protected abstract rageText(level: 1 | 2): string;
  /** 전투 시작 직후 (각성 등) */
  protected onFightStart(): void {}
  /** 매 프레임 (흡입 같은 지속 효과) */
  protected onUpdate(_dt: number): void {}
  /** 공격 중단 (필살기·승리) */
  protected onInterrupt(): void {}
  /** 대기 모습: 프레임 번호 */
  protected idleFrame(): number {
    return Math.floor(this.time / 0.45) % 2;
  }

  // ───────────────────────── 시작 ─────────────────────────

  start(): void {
    sound.warn();
    this.banner({ top: '⚠ 보스 등장!', name: this.def.name, desc: this.def.intro, ms: 2300, tone: 'boss' });
    bus.emit(EV.bossStart, { id: this.def.id });
    // 오른쪽에서 통통 튀며 등장
    this.moveTo(this.homeX, 0, 1.5, 14, (t) => 1 - (1 - t) ** 2);
    this.after(1.5, () => this.host.scene.cameras.main.shake(160, 0.006), true);
    this.after(2.4, () => {
      this.mode = 'fight';
      this.cooldown = 0.6;
      this.onFightStart();
    }, true);
  }

  // ───────────────────────── 매 프레임 ─────────────────────────

  update(dt: number): void {
    this.time += dt;
    this.runTasks(this.cine, dt);
    if (!this.frozen) {
      if (this.mode === 'fight') {
        this.runTasks(this.ai, dt);
        if (!this.busy) {
          this.cooldown -= dt;
          if (this.cooldown <= 0) {
            this.busy = true;
            this.chooseAttack();
          }
        }
        this.snackT -= dt;
        if (this.snackT <= 0) {
          this.snackT = 5.5 + Math.random() * 2.5;
          const alt = [4, 26, 54][Math.floor(Math.random() * 3)];
          this.host.spawnSnack(SNACKS[Math.floor(Math.random() * 3)], alt);
        }
        this.onUpdate(dt);
      }
      this.updateMotion(dt);
      this.updateHostiles(dt);
      this.bodyContact();
    }
    if (this.stars.length) {
      this.stunT = Math.max(0, this.stunT - (this.frozen ? 0 : dt));
      this.stars.forEach((st, i) => {
        const a = this.time * 5 + (i * Math.PI * 2) / this.stars.length;
        st.setPosition(Math.round(this.bx + Math.cos(a) * this.fw * 0.32), Math.round(this.host.groundY - this.balt - this.fh * 0.92 + Math.sin(a) * 3));
      });
    }
    this.render(dt);
  }

  private runTasks(list: Task[], dt: number): void {
    // 매 프레임 배열을 새로 만들지 않도록 (모바일 GC 끊김 방지)
    let anyDue = false;
    for (const t of list) {
      t.t -= dt;
      if (t.t <= 0) anyDue = true;
    }
    if (!anyDue) return;
    const due: Task[] = [];
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].t <= 0) {
        due.unshift(list[i]);
        list.splice(i, 1);
      }
    }
    for (const t of due) t.fn();
  }

  /** sec 초 뒤 실행 (cine=true: 연출 중에도 진행 / false: 전투 중에만) */
  protected after(sec: number, fn: () => void, cine = false): void {
    (cine ? this.cine : this.ai).push({ t: sec, fn });
  }

  protected endAttack(cool: number): void {
    this.busy = false;
    // 공격 뒤 최소 쉬는 시간은 2페이즈에서도 지킴 (부메랑을 맞힐 빈틈)
    this.cooldown = Math.max(this.def.minRecover, this.phase2 ? cool * 0.8 : cool);
  }

  private render(dt: number): void {
    const b = this.boss;
    if (this.pose.t > 0) {
      this.pose.t -= dt;
      const n = b.texture.frameTotal - 1;
      b.setFrame(this.pose.frame < n ? this.pose.frame : this.pose.frame === 4 ? 0 : 2);
    } else if (this.mode !== 'victory') {
      b.setFrame(this.moodFrame(this.idleFrame()));
    }
    if (!this.detached) b.setPosition(Math.round(this.bx * 5) / 5, Math.round((this.host.groundY - this.balt) * 5) / 5);
    if (this.hurtT > 0) {
      this.hurtT -= dt;
      b.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      if (this.hurtT <= 0) {
        b.setTintMode(Phaser.TintModes.MULTIPLY);
        this.applyTint();
      }
    }
    if (this.warnT > 0) {
      this.warnT -= dt;
      this.warnMark
        .setVisible(Math.floor(this.warnT * 10) % 2 === 0)
        .setPosition(Math.round(this.bx), Math.round(this.host.groundY - this.balt - this.fh - 3));
      if (this.warnT <= 0) this.warnMark.setVisible(false);
    }
  }

  protected applyTint(): void {
    if (this.rage === 2) this.boss.setTint(0xff9a8a);
    else if (this.rage === 1) this.boss.setTint(0xffc4b8);
    else this.boss.clearTint();
  }

  protected setPose(frame: number, sec: number): void {
    this.pose = { frame, t: sec };
  }

  protected warn(sec: number): void {
    this.warnT = sec;
    sound.warn();
  }

  /** 보스 이동 (dt 기반 — 연출로 멈출 때 같이 멈춤) */
  protected moveTo(x: number, alt: number, dur: number, arc = 0, ease: (t: number) => number = (t) => t, done: (() => void) | null = null): void {
    this.motion = { x0: this.bx, a0: this.balt, x1: x, a1: alt, dur, t: 0, arc, ease, done };
  }

  /** 제자리로 (공격이 끊겼을 때) */
  protected returnHome(): void {
    if (Math.abs(this.bx - this.homeX) < 2 && this.balt < 1) return;
    if (this.bx < -10 || this.bx > this.host.W + 10) this.bx = this.host.W + this.fw / 2;
    this.moveTo(this.homeX, 0, 0.7, 14, (t) => 1 - (1 - t) ** 2);
  }

  private updateMotion(dt: number): void {
    const m = this.motion;
    if (!m) return;
    m.t = Math.min(m.dur, m.t + dt);
    const k = m.t / m.dur;
    const e = m.ease(k);
    this.bx = m.x0 + (m.x1 - m.x0) * e;
    this.balt = m.a0 + (m.a1 - m.a0) * e + Math.sin(Math.PI * k) * m.arc;
    if (k >= 1) {
      this.motion = null;
      m.done?.();
    }
  }

  // ───────────────────────── 판정 ─────────────────────────

  /** 보스 몸통 (몸에 닿으면 아픔) */
  bossRect(): Rect {
    const feet = this.host.groundY - this.balt;
    return { x0: this.bx - this.fw * 0.36, x1: this.bx + this.fw * 0.36, y0: feet - this.fh * 0.78, y1: feet - 1 };
  }

  /** 몸통 충돌 높이 비율 (뿔·머리 장식은 제외 — 점프로 넘을 수 있게) */
  protected contactHeight = 1;

  private bodyContact(): void {
    if (this.mode !== 'fight') return;
    const p = this.host.playerRect();
    const b = this.bossRect();
    b.y0 = b.y1 - (b.y1 - b.y0) * this.contactHeight;
    if (p.x0 < b.x1 && p.x1 > b.x0 && p.y0 < b.y1 && p.y1 > b.y0) {
      if (this.host.shieldRect()) return; // 방패 중엔 몸통도 막음
      if (this.host.hurtPlayer(this.def.bodyDamage, 'body')) this.onBodyHit();
    }
  }

  /** 몸에 부딪혔을 때 (흡입 중이면 튕겨 냄 등) */
  protected onBodyHit(): void {}

  /** 부메랑 판정 — 맞혔으면 true (GameScene 이 매 프레임 호출) */
  checkBoomerang(bm: HairBoomerang): boolean {
    if (!bm.isOut || this.frozen) return false;
    for (const h of this.hostiles) {
      if (h.dead || !h.breakable) continue;
      const hr = h.shape === 'circle' ? h.r : Math.max(h.w, h.h) / 2;
      if ((h.x - bm.x) ** 2 + (h.y - bm.y) ** 2 < (hr + bm.r) ** 2) {
        this.pop(h);
        this.gain(SPECIAL_GAIN.projectileBreak);
        this.host.addScore(5, h.x, h.y - 6);
        bm.bounce();
        return true;
      }
    }
    if (bm.hitIds.has('boss')) return false;
    if (circleRect(bm.x, bm.y, bm.r, this.bossRect())) {
      bm.hitIds.add('boss');
      bm.bounce();
      if (this.mode === 'fight') {
        this.damage(bm.damage * this.weakMul());
        this.gain(SPECIAL_GAIN.boomerangHit);
      } else {
        sound.catch(); // 등장 중에는 팅
      }
      return true;
    }
    return false;
  }

  /** 약점 배율 (지침·기절 중엔 더 아픔 / 킁카괴물 흡입 중 코 등은 하위 클래스) */
  protected weakMul(): number {
    return this.stunT > 0 ? this.stunMul : 1;
  }

  /** 표정 프레임 (0 대기 · 1 통통 · 2 공격 · 3 화남 · 4 어지러움) — 정식 PNG 가 3장뿐이면 가까운 프레임으로 */
  protected moodFrame(base: number): number {
    const n = this.boss.texture.frameTotal - 1; // __BASE 제외
    const want = this.stunT > 0 ? 4 : this.rage >= 1 && base !== 2 ? 3 : base;
    if (want < n) return want;
    return want === 4 ? 0 : want === 3 ? base : want;
  }

  /**
   * 지침·기절: sec 초 동안 공격하지 않고, 맞으면 mul 배 피해 (부메랑·필살기 기회)
   * 머리 위로 별이 빙글빙글.
   */
  protected stun(sec: number, mul: number, text: string): void {
    this.stunT = sec;
    this.stunMul = mul;
    this.busy = true;
    this.banner({ top: '⭐ 지금이 기회!', name: text, desc: '머리카락 부메랑으로 공격해요', ms: Math.min(1800, sec * 1000), tone: 'good' });
    const scene = this.host.scene;
    for (let i = 0; i < 3; i++) this.stars.push(scene.add.image(this.bx, this.host.groundY - this.fh, 'boss-star').setDepth(12));
    this.after(sec, () => {
      this.stunT = 0;
      this.stunMul = 1;
      this.clearStars();
      this.endAttack(1.0);
    });
  }

  private clearStars(): void {
    for (const st of this.stars) st.destroy();
    this.stars = [];
  }

  /** 분노 전환: 1.5초 멈춤 + 화내는 연출 + 경고 문구 */
  private enterRage(): void {
    const lv = this.rage as 1 | 2;
    this.pendingRage = false;
    this.ai = [];
    this.onInterrupt();
    this.stunT = 0;
    this.clearStars();
    const scene = this.host.scene;
    const cam = scene.cameras.main;
    sound.rage();
    cam.shake(500, lv === 2 ? 0.014 : 0.009);
    cam.flash(220, 255, 90, 90);
    this.setPose(3, 1.5);
    // 부들부들 + 커졌다 작아짐 + 김
    scene.tweens.add({ targets: this.boss, scaleX: 1.12, scaleY: 1.12, duration: 160, yoyo: true, repeat: 3 });
    for (let i = 0; i < 8; i++) {
      const p = this.fx(scene.add.image(this.bx + (Math.random() - 0.5) * this.fw * 0.6, this.host.groundY - this.fh + 4, 'boss-dot').setDepth(12).setTint(0xffffff));
      scene.tweens.add({ targets: p, y: p.y - 18 - Math.random() * 12, x: p.x + (Math.random() - 0.5) * 14, alpha: 0, scale: 2, duration: 900, delay: i * 90, onComplete: () => p.destroy() });
    }
    this.banner({ top: lv === 1 ? '💢 1차 분노!' : '💥 2차 분노!', name: `${this.def.name}이 ${lv === 1 ? '화났어요!' : '폭발했어요!'}`, desc: this.rageText(lv), ms: 1500, tone: 'boss' });
    this.cutscene(1.5, () => {
      this.busy = false;
      this.cooldown = 0.9;
      this.returnHome();
      this.onRage(lv);
    });
  }

  /** 분노 단계 문턱 (HP 비율) */
  static readonly RAGE_AT = [0.7, 0.35] as const;

  /**
   * 한 번의 공격으로 내려갈 수 있는 최저 HP.
   * 분노 단계를 건너뛰지 않도록 다음 문턱까지만 깎임 (1차 분노 전 → 1차 문턱, 1차 분노 중 → 2차 문턱).
   * 하위 클래스는 필살기를 보여 주기 전까지 1 을 남기는 등 더 올릴 수 있음.
   */
  protected hpFloor(): number {
    const max = this.def.maxHp;
    if (this.rage === 0) return Math.floor(max * BossBattle.RAGE_AT[0]);
    if (this.rage === 1) return Math.floor(max * BossBattle.RAGE_AT[1]);
    return 0;
  }

  protected damage(n: number): void {
    if (this.mode === 'victory' || this.mode === 'done') return;
    // 문턱 아래로는 한 번에 못 내려감 (단, 이미 문턱 아래면 그대로 깎임 — 문턱 때문에 HP 가 올라가는 일은 없음)
    this.hp = Math.max(0, Math.min(this.hp, this.hpFloor()), this.hp - n);
    this.hurtT = 0.12;
    sound.bossHit();
    const r = this.bossRect();
    this.host.sparkle(5, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
    this.floatText(`-${n}`, this.bx, r.y0 - 2, '#ffe680');
    if (this.hp <= 0) {
      this.victory();
      return;
    }
    // 분노 단계 (HP 비율)
    const ratio = this.hp / this.def.maxHp;
    const want = ratio <= BossBattle.RAGE_AT[1] ? 2 : ratio <= BossBattle.RAGE_AT[0] ? 1 : 0;
    if (want > this.rage) {
      this.rage = want as 1 | 2;
      this.applyTint();
      // 필살기 연출 중이면 그게 끝난 뒤
      if (this.mode === 'cutscene') this.pendingRage = true;
      else this.enterRage();
    }
  }

  gain(v: number): void {
    if (this.mode === 'victory' || this.mode === 'done') return;
    const was = this.special >= 1;
    this.special = Math.min(1, this.special + v * this.def.specialGainMul);
    if (!was && this.special >= 1) sound.evolveDone();
  }

  onSnack(): void {
    this.gain(SPECIAL_GAIN.snack);
  }

  // ───────────────────────── 적 투사체 ─────────────────────────

  protected spawn(tex: string, x: number, y: number, o: Partial<Omit<Hostile, 'id' | 'sprite' | 'x' | 'y'>> = {}): Hostile {
    const sprite = this.host.scene.add.image(x, y, tex).setDepth(11);
    const h: Hostile = {
      id: this.nextId++,
      sprite,
      x,
      y,
      vx: 0,
      vy: 0,
      ay: 0,
      shape: 'circle',
      r: Math.min(sprite.width, sprite.height) * 0.38,
      w: sprite.width,
      h: sprite.height,
      breakable: true,
      dmg: 20,
      onGround: false,
      threat: true,
      pierce: false,
      hitPlayer: false,
      dodged: false,
      life: 12,
      spin: 0,
      wave: null,
      onLand: null,
      dead: false,
      ...o,
    };
    this.hostiles.push(h);
    return h;
  }

  private updateHostiles(dt: number): void {
    const p = this.host.playerRect();
    for (const h of this.hostiles) {
      if (h.dead) continue;
      h.life -= dt;
      h.vy += h.ay * dt;
      h.x += (h.vx - (h.onGround ? this.host.scrollSpeed : 0)) * dt;
      h.y += h.vy * dt;
      if (h.wave) {
        h.wave.t += dt;
        h.wave.baseY += h.vy * dt;
        h.y = h.wave.baseY + Math.sin(h.wave.t * h.wave.freq) * h.wave.amp;
      }
      if (h.onLand && h.vy > 0 && h.y >= this.host.groundY - 2) {
        const f = h.onLand;
        h.onLand = null;
        this.kill(h);
        f(h);
        continue;
      }
      if (h.spin) h.sprite.angle += h.spin * dt;
      h.sprite.setPosition(Math.round(h.x * 5) / 5, Math.round(h.y * 5) / 5);
      // 방패: 막으면 피해 0 (탄은 부서지고, 파동·장판은 그냥 지나감)
      const sh = this.host.shieldRect();
      if (sh && !h.hitPlayer) {
        const blocked =
          h.shape === 'circle'
            ? circleRect(h.x, h.y, h.r, sh)
            : h.x - h.w / 2 < sh.x1 && h.x + h.w / 2 > sh.x0 && h.y - h.h / 2 < sh.y1 && h.y + h.h / 2 > sh.y0;
        if (blocked) {
          h.hitPlayer = true;
          this.host.onShieldBlock(h.x, h.y);
          h.onHit?.(h, true);
          this.gain(SPECIAL_GAIN.dodge);
          if (!h.pierce) this.pop(h);
          continue;
        }
      }
      // 고나와 충돌
      if (!h.hitPlayer) {
        const hit =
          h.shape === 'circle'
            ? circleRect(h.x, h.y, h.r, p)
            : h.x - h.w / 2 < p.x1 && h.x + h.w / 2 > p.x0 && h.y - h.h / 2 < p.y1 && h.y + h.h / 2 > p.y0;
        if (hit && this.host.hurtPlayer(h.dmg, h.sprite.texture.key)) {
          h.hitPlayer = true;
          h.onHit?.(h, false);
          if (!h.pierce) this.pop(h);
        }
      }
      // 회피 보상: 고나 옆을 무사히 지나감
      const right = h.x + (h.shape === 'circle' ? h.r : h.w / 2);
      if (h.threat && !h.dodged && !h.hitPlayer && right < p.x0 - 2) {
        h.dodged = true;
        this.gain(SPECIAL_GAIN.dodge);
      }
      if (h.life <= 0 || h.x < -50 || h.x > this.host.W + 80 || h.y > this.host.H + 30 || h.y < -120) this.kill(h);
    }
    if (this.hostiles.some((h) => h.dead)) this.hostiles = this.hostiles.filter((h) => !h.dead);
  }

  protected kill(h: Hostile): void {
    h.dead = true;
    h.sprite.destroy();
  }

  /** 펑 사라짐 */
  protected pop(h: Hostile): void {
    if (h.dead) return;
    h.dead = true;
    const s = h.sprite;
    this.host.sparkle(3, h.x, h.y);
    this.host.scene.tweens.add({ targets: s, scale: 1.8, alpha: 0, duration: 180, onComplete: () => s.destroy() });
  }

  protected clearHostiles(): void {
    for (const h of this.hostiles) this.pop(h);
    this.hostiles = [];
  }

  // ───────────────────────── 필살기 ─────────────────────────

  get specialReady(): boolean {
    return this.special >= 1 && this.mode === 'fight';
  }

  /** 필살기 '머리카락 회오리' — 짧은 연출 + 큰 피해 + 화면의 투사체 모두 제거 */
  useSpecial(): boolean {
    if (!this.specialReady) return false;
    this.special = 0;
    this.mode = 'cutscene';
    this.frozen = true;
    this.ai = [];
    this.stunT = 0;
    this.clearStars();
    this.onInterrupt();
    const scene = this.host.scene;
    const cam = scene.cameras.main;
    sound.special();
    cam.flash(200, 255, 245, 210);
    this.banner({ top: '필살기!', name: '머리카락 회오리', ms: 1500, tone: 'power' });
    scene.tweens.add({ targets: this.dim, fillAlpha: 0.45, duration: 200 });
    const head = this.host.playerHead();
    this.host.sparkle(12, head.x, head.y);
    const big = this.fx(scene.add.image(head.x, head.y, this.host.hairTexture()).setDepth(13).setScale(0));
    scene.tweens.add({ targets: big, scale: 4, angle: -720, duration: 420, ease: 'Back.Out' });
    // 회오리 잔상
    const trail = this.fx(scene.add.particles(0, 0, this.host.hairTexture(), {
      follow: big,
      lifespan: 300,
      scale: { start: 2.4, end: 0 },
      alpha: { start: 0.5, end: 0 },
      rotate: { min: 0, max: 360 },
      frequency: 30,
    }).setDepth(12.9));
    const r = this.bossRect();
    this.after(0.5, () => {
      scene.tweens.add({ targets: big, x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2, angle: big.angle - 1080, duration: 380, ease: 'Quad.In' });
    }, true);
    this.after(0.9, () => {
      cam.shake(320, 0.02);
      cam.flash(160, 255, 255, 255);
      this.clearHostiles();
      this.host.sparkle(24, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
      this.damage(this.def.specialDamage);
    }, true);
    this.after(1.05, () => {
      scene.tweens.add({ targets: big, x: head.x, y: head.y, scale: 0.6, alpha: 0, angle: big.angle + 720, duration: 380, ease: 'Quad.Out', onComplete: () => big.destroy() });
      trail.stop();
      scene.time.delayedCall(400, () => trail.destroy());
    }, true);
    this.after(1.5, () => {
      scene.tweens.add({ targets: this.dim, fillAlpha: 0, duration: 200 });
      this.frozen = false;
      if (this.mode === 'cutscene') {
        this.mode = 'fight';
        this.busy = false;
        this.cooldown = 1.0;
        this.returnHome();
        if (this.pendingRage) this.enterRage();
      }
    }, true);
    return true;
  }

  // ───────────────────────── 보스 필살기 공통 연출 ─────────────────────────

  /**
   * 필살기 예고 (sec 초): 화면이 어두워지고(보스만 밝게), 보스 주위에 오라 고리가 맥박치듯 퍼지고, 긴장되는 소리가 차오름.
   * 오라 고리는 미리 만든 도트 1장(fx 등록 → 정리 보장).
   */
  protected specialTelegraph(ring: string, sec: number): void {
    const scene = this.host.scene;
    scene.tweens.killTweensOf(this.dim);
    scene.tweens.add({ targets: this.dim, fillAlpha: 0.4, duration: 280 });
    this.boss.setDepth(9.7);
    sound.specialCharge(sec);
    const r = this.bossRect();
    const aura = this.fx(scene.add.image((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, ring).setDepth(9.65).setScale(1.4).setAlpha(0.95));
    scene.tweens.add({ targets: aura, scale: 2.8, alpha: 0.15, duration: 450, repeat: Math.max(0, Math.ceil(sec / 0.45) - 1) });
    this.after(sec, () => aura.destroy(), true);
  }

  /** 필살기 발동 순간: 화면 원래대로 + 색 번쩍 + 아주 짧은 흔들림 + 쾅 */
  protected specialRelease(rgb: [number, number, number]): void {
    const scene = this.host.scene;
    scene.tweens.killTweensOf(this.dim);
    scene.tweens.add({ targets: this.dim, fillAlpha: 0, duration: 160 });
    this.boss.setDepth(8);
    scene.cameras.main.flash(220, rgb[0], rgb[1], rgb[2]);
    scene.cameras.main.shake(150, 0.012);
    sound.specialBlast();
  }

  /** 필살기 타격 (고나에게 맞음/방패에 막힘): 강한 충격 + 파편 한 번 (개수 제한) */
  protected specialImpact(x: number, y: number, tex: string, rgb: [number, number, number], blocked: boolean): void {
    const scene = this.host.scene;
    scene.cameras.main.shake(blocked ? 140 : 240, blocked ? 0.01 : 0.018);
    if (!blocked) scene.cameras.main.flash(160, rgb[0], rgb[1], rgb[2]);
    const burst = this.fx(scene.add.particles(x, y, tex, { speed: { min: 50, max: 140 }, lifespan: 500, scale: { start: 1.6, end: 0.4 }, alpha: { start: 1, end: 0 }, emitting: false }).setDepth(12.5));
    burst.explode(perf.low ? 6 : 12);
    this.after(0.7, () => burst.destroy(), true);
  }

  /** 연출 (세상 멈춤) — ms 동안 fn 들이 진행되고 끝나면 전투 재개 */
  protected cutscene(sec: number, end?: () => void): void {
    this.mode = 'cutscene';
    this.frozen = true;
    this.after(sec, () => {
      this.frozen = false;
      if (this.mode === 'cutscene') this.mode = 'fight';
      end?.();
      if (this.pendingRage && this.mode === 'fight') this.enterRage();
    }, true);
  }

  // ───────────────────────── 승리 ─────────────────────────

  private victory(): void {
    this.mode = 'victory';
    // 보스 체력 0: 모든 공격 즉시 중단 + 날아오던 것·예고·효과 제거 (예약된 공격이 뒤늦게 나오지 않게)
    this.cleanupCombat();
    this.host.scene.tweens.killTweensOf(this.boss);
    this.boss.setScale(1);
    this.motion = null;
    this.balt = 0;
    if (this.bx < 20 || this.bx > this.host.W - 10) this.bx = this.homeX;
    const scene = this.host.scene;
    const cam = scene.cameras.main;
    sound.bossDown();
    cam.shake(500, 0.012);
    cam.flash(250, 255, 250, 230);
    const b = this.boss;
    this.setPose(2, 0.9);
    scene.tweens.add({ targets: b, x: b.x + 2, duration: 50, yoyo: true, repeat: 8 });
    this.after(0.9, () => {
      // 빙글빙글 작아지며 멀리 날아감
      this.detached = true;
      scene.tweens.add({ targets: b, angle: 720, scale: 0.2, y: b.y - 70, x: b.x + 40, alpha: 0, duration: 1100, ease: 'Quad.In' });
      this.host.sparkle(20, b.x, b.y - this.fh / 2);
      this.banner({ top: '승리!', name: `${this.def.name}을 물리쳤어요!`, desc: `보너스 +${this.def.scoreBonus}점`, ms: 2000, tone: 'good' });
      this.host.addScore(this.def.scoreBonus, this.host.basePlayerX + 20, this.host.groundY - 40);
    }, true);
    this.after(3.0, () => {
      this.mode = 'done';
      this.host.onBattleEnd(true);
    }, true);
  }

  // ───────────────────────── UI ─────────────────────────

  hud(): { name: string; hp: number; maxHp: number; phase: number } {
    return { name: this.def.name, hp: this.hp, maxHp: this.def.maxHp, phase: this.rage + 1 };
  }

  protected banner(b: BannerInfo): void {
    bus.emit(EV.banner, b);
  }

  protected floatText(text: string, x: number, y: number, color: string): void {
    this.host.floatText(text, x, y, color);
  }

  /** 효과 오브젝트 등록 (전투가 끝나면 cleanupCombat 이 지움) */
  protected fx<T extends Phaser.GameObjects.GameObject>(o: T): T {
    // 이미 사라진 것은 목록에서 정리 (오래 싸워도 목록이 쌓이지 않게)
    if (this.fxList.length > 64) this.fxList = this.fxList.filter((x) => x.active);
    this.fxList.push(o);
    return o;
  }

  /** 하위 클래스가 가진 효과 (오라 등) 정리 */
  protected onCleanup(): void {}

  /**
   * 전투 상태 전부 정리 — 승리 · 패배 · 다시하기 · 씬 전환에서 공통으로 호출.
   * 예약된 공격(ai·연출 타이머) 취소, 날아오던 투사체·예고 화살표·충전 하트·오라·잔상 제거, 관련 트윈 중지,
   * 흡입·어둡게·멈춤 상태 복구. (보스 본체는 승리 연출을 위해 남김 — destroy() 에서 지움)
   */
  cleanupCombat(): void {
    const tw = this.host.scene.tweens;
    if (this.boss?.active) this.boss.setDepth(8); // 필살기 예고 중(어두운 화면 위로 올림)이었으면 원래대로
    this.ai = [];
    this.cine = [];
    this.busy = true;
    this.pendingRage = false;
    this.stunT = 0;
    this.clearStars();
    this.onInterrupt();
    this.onCleanup();
    for (const h of this.hostiles) {
      tw.killTweensOf(h.sprite);
      h.sprite.destroy();
    }
    this.hostiles = [];
    for (const o of this.fxList) {
      tw.killTweensOf(o);
      if (o.active) o.destroy();
    }
    this.fxList = [];
    tw.killTweensOf(this.dim);
    this.dim.setFillStyle(0x1a0f24, 0);
    this.warnT = 0;
    this.warnMark.setVisible(false);
    this.frozen = false;
    this.host.pull = 0;
  }

  destroy(): void {
    this.cleanupCombat();
    this.host.scene.tweens.killTweensOf(this.boss);
    this.boss.destroy();
    this.warnMark.destroy();
    this.dim.destroy();
  }
}
