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
  /** 땅에 닿으면 (포물선 탄 → 장판) */
  onLand: ((h: Hostile) => void) | null;
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
  phase2 = false;
  /** 필살 게이지 0~1 */
  special = 0;
  /** 연출 중: 세상(땅·고나·투사체)이 멈춤 */
  frozen = false;
  mode: Mode = 'intro';

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
  /** 2페이즈 진입 */
  protected abstract onPhase2(): void;
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
    this.render(dt);
  }

  private runTasks(list: Task[], dt: number): void {
    for (const t of list) t.t -= dt;
    const due = list.filter((t) => t.t <= 0);
    if (!due.length) return;
    const keep = list.filter((t) => t.t > 0);
    list.length = 0;
    list.push(...keep);
    for (const t of due) t.fn();
  }

  /** sec 초 뒤 실행 (cine=true: 연출 중에도 진행 / false: 전투 중에만) */
  protected after(sec: number, fn: () => void, cine = false): void {
    (cine ? this.cine : this.ai).push({ t: sec, fn });
  }

  protected endAttack(cool: number): void {
    this.busy = false;
    this.cooldown = this.phase2 ? cool * 0.7 : cool;
  }

  private render(dt: number): void {
    const b = this.boss;
    if (this.pose.t > 0) {
      this.pose.t -= dt;
      b.setFrame(this.pose.frame);
    } else if (this.mode !== 'victory') {
      b.setFrame(this.idleFrame());
    }
    if (!this.detached) b.setPosition(Math.round(this.bx), Math.round(this.host.groundY - this.balt));
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
    if (this.phase2) this.boss.setTint(0xffb0a0);
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

  private bodyContact(): void {
    if (this.mode !== 'fight') return;
    const p = this.host.playerRect();
    const b = this.bossRect();
    if (p.x0 < b.x1 && p.x1 > b.x0 && p.y0 < b.y1 && p.y1 > b.y0) {
      if (this.host.hurtPlayer()) this.onBodyHit();
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

  /** 약점 배율 (킁카괴물 흡입 중 코 등) */
  protected weakMul(): number {
    return 1;
  }

  protected damage(n: number): void {
    if (this.mode === 'victory' || this.mode === 'done') return;
    this.hp = Math.max(0, this.hp - n);
    this.hurtT = 0.12;
    sound.bossHit();
    const r = this.bossRect();
    this.host.sparkle(5, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
    this.floatText(`-${n}`, this.bx, r.y0 - 2, '#ffe680');
    if (this.hp <= 0) {
      this.victory();
      return;
    }
    if (!this.phase2 && this.hp <= this.def.maxHp * this.def.phase2At) {
      this.phase2 = true;
      this.applyTint();
      this.onPhase2();
    }
  }

  gain(v: number): void {
    if (this.mode === 'victory' || this.mode === 'done') return;
    const was = this.special >= 1;
    this.special = Math.min(1, this.special + v);
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
      h.sprite.setPosition(Math.round(h.x), Math.round(h.y));
      // 고나와 충돌
      if (!h.hitPlayer) {
        const hit =
          h.shape === 'circle'
            ? circleRect(h.x, h.y, h.r, p)
            : h.x - h.w / 2 < p.x1 && h.x + h.w / 2 > p.x0 && h.y - h.h / 2 < p.y1 && h.y + h.h / 2 > p.y0;
        if (hit && this.host.hurtPlayer()) {
          h.hitPlayer = true;
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
    this.hostiles = this.hostiles.filter((h) => !h.dead);
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
    this.onInterrupt();
    const scene = this.host.scene;
    const cam = scene.cameras.main;
    sound.special();
    cam.flash(200, 255, 245, 210);
    this.banner({ top: '필살기!', name: '머리카락 회오리', ms: 1500, tone: 'power' });
    scene.tweens.add({ targets: this.dim, fillAlpha: 0.45, duration: 200 });
    const head = this.host.playerHead();
    this.host.sparkle(12, head.x, head.y);
    const big = scene.add.image(head.x, head.y, this.host.hairTexture()).setDepth(13).setScale(0);
    scene.tweens.add({ targets: big, scale: 4, angle: -720, duration: 420, ease: 'Back.Out' });
    // 회오리 잔상
    const trail = scene.add.particles(0, 0, this.host.hairTexture(), {
      follow: big,
      lifespan: 300,
      scale: { start: 2.4, end: 0 },
      alpha: { start: 0.5, end: 0 },
      rotate: { min: 0, max: 360 },
      frequency: 30,
    }).setDepth(12.9);
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
      }
    }, true);
    return true;
  }

  /** 연출 (세상 멈춤) — ms 동안 fn 들이 진행되고 끝나면 전투 재개 */
  protected cutscene(sec: number, end?: () => void): void {
    this.mode = 'cutscene';
    this.frozen = true;
    this.after(sec, () => {
      this.frozen = false;
      if (this.mode === 'cutscene') this.mode = 'fight';
      end?.();
    }, true);
  }

  // ───────────────────────── 승리 ─────────────────────────

  private victory(): void {
    this.mode = 'victory';
    this.onInterrupt();
    this.ai = [];
    this.motion = null;
    this.balt = 0;
    if (this.bx < 20 || this.bx > this.host.W - 10) this.bx = this.homeX;
    this.clearHostiles();
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
    return { name: this.def.name, hp: this.hp, maxHp: this.def.maxHp, phase: this.phase2 ? 2 : 1 };
  }

  protected banner(b: BannerInfo): void {
    bus.emit(EV.banner, b);
  }

  protected floatText(text: string, x: number, y: number, color: string): void {
    const t = this.host.scene.add
      .text(Math.round(x), Math.round(y), text, { fontFamily: 'Galmuri11, monospace', fontSize: '12px', color, stroke: '#5a2a1a', strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setDepth(15);
    this.host.scene.tweens.add({ targets: t, y: t.y - 14, alpha: 0, duration: 650, onComplete: () => t.destroy() });
  }

  destroy(): void {
    for (const h of this.hostiles) h.sprite.destroy();
    this.hostiles = [];
    this.boss.destroy();
    this.warnMark.destroy();
    this.dim.destroy();
  }
}
