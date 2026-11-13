/**
 * ⚔ 최종 보스 '이유식 드래곤 셰프 마녀' — 암흑의 이유식 성 (킁카괴물 뒤 마지막 모험 끝)
 *   뽀뽀괴물·킁카괴물을 키운 진짜 흑막. 박쥐 날개로 공중에 떠서 이유식 숟가락으로 공격.
 *   예고를 보고 피한 다음 반격하는 3페이즈 (스노우브라더스식) — 고나는 옆으로 움직이지 않으므로
 *   모든 공격은 점프(이단 점프)나 방패로 언제나 피할 수 있게, 예고 자리 = 실제 판정 자리.
 *
 *   PHASE 1 이유식의 유혹 (HP 100~70%): A 늘어나는 숟가락 · B 이유식 폭탄
 *   PHASE 2 마녀의 분노 (70~35%):       + C 이유식 회오리 · D 숟가락 연속 공격 (눈이 보라색 · 날개 커짐 · 번개)
 *   PHASE 3 최후의 한 숟가락 (35~0%):   + E 초대형 이유식 폭발 (거대한 냄비) · 공격 빨라짐
 *   반격: 공격 중에도 몸을 맞힐 수 있음 · 공격 직후 잠깐 약점(×1.4) · 숟가락이 빗나가 바닥에 꽂히면 어질어질(×1.7 · 큰 기회)
 *   수치: src/game/boss.ts 의 WITCH
 */
import Phaser from 'phaser';
import { bus, EV, type BannerInfo } from '../../events';
import { sound } from '../../audio';
import { haptics } from '../../haptics';
import { perf } from '../../perf';
import { WITCH } from '../../game/boss';
import { BossBattle, type Hostile } from './BossBattle';
import type { BattleHost } from './types';

type Attack = 'spoon' | 'bomb' | 'swirl' | 'combo' | 'pot';

export const WITCH_INTRO_LINES = [
  '여기까지 잘도 왔구나…!',
  '뽀뽀와 킁카는 내가 애지중지 키운 아이들이지.',
  '그 아이들을 모두 쓰러뜨리다니… 제법이구나.',
  '하지만 네 모험도 여기까지다!',
  '내가 특별히 만든 이유식을…',
  '한 숟가락도 남김없이 먹여주마!',
  '각오는 돼 있겠지? 흐흐흐!',
];
export const WITCH_PHASE2_LINES = ['이 녀석… 내 이유식을 거부하다니!', '그렇다면 더 많이 먹여주마!'];
export const WITCH_PHASE3_LINES = ['말도 안 돼…!', '내가 만든 이유식을 안 먹겠다고?!', '그렇다면… 전부 먹여주겠어!'];
export const WITCH_DEFEAT_LINES = ['내… 내 특별 이유식이…!', '한 입도 안 먹다니…!', '흥! 다음엔 꼭 먹이고 말 테다!'];

interface GroundMark {
  s: Phaser.GameObjects.Image;
  x: number;
}

export class WitchBattle extends BossBattle {
  private count = 0;
  private last: Attack | null = null;
  /** 공격 직후 약점 노출 남은 시간 */
  private weakT = 0;
  /** 땅을 따라 흘러가는 낙하 예고 고리 */
  private marks: GroundMark[] = [];
  /** 늘어난 팔·숟가락 (공격 중에만) */
  private arm: Phaser.GameObjects.TileSprite | null = null;
  private spoon: Phaser.GameObjects.Image | null = null;
  private pot: Phaser.GameObjects.Image | null = null;
  private dark: Phaser.GameObjects.Rectangle | null = null;
  /** (검증용) 숟가락 판정 기록 */
  readonly spoonLog: ('miss' | 'hit' | 'block')[] = [];
  /** (검증용) 폭탄 기록 */
  readonly bombLog: { mark: number; land?: number; puddle?: boolean }[] = [];
  /** (검증용) 지금 공격 예고 정보 — 판정 자리와 같음 */
  telegraph: { kind: Attack; x: number; y: number; r: number; impactAt?: number } | null = null;
  /** (검증용) 자동 공격 멈춤 (공격 패턴별 테스트) */
  debugHold = false;

  /** 기본 배율 = 4단계(자이언트 곤룡) 고나와 같은 1.6배 (스프라이트 도트 1칸 = 고나 도트 1칸 → 픽셀 크기·외곽선 두께 동일) */
  static readonly SCALE = 1.6;
  /** 프레임 안의 기준점 (스프라이트 칸 66x53 기준: 몸통·머리 범위, 손잡이 끝) */
  private static readonly BODY = { x0: 10, x1: 40, y0: 6, y1: 45 };
  private static readonly HAND = { x: 15, y: 28 };

  constructor(host: BattleHost, tex: string) {
    super(host, 'witch', tex);
    this.homeX = Math.min(host.W - 38, host.basePlayerX + 150); // 날개 끝까지 화면 안에
    this.boss.setScale(WitchBattle.SCALE);
    this.restScale = WitchBattle.SCALE;
  }

  /** 지금 배율 (페이즈가 오를수록 조금 커짐) */
  private get k(): number {
    return this.boss.scaleX || WitchBattle.SCALE;
  }

  // ───────────────────────── 모습 ─────────────────────────

  protected idleFrame(): number {
    return Math.floor(this.time / 0.22) % 2; // 날갯짓
  }

  protected moodFrame(base: number): number {
    if (this.mode === 'victory') return this.stunT > 0 ? 8 : base;
    if (this.stunT > 0) return 4;
    if (this.rage >= 1 && base <= 1) return base === 0 ? 3 : 1;
    return base;
  }

  /** 몸통 판정 (날개는 빼고 몸·머리만) */
  bossRect(): { x0: number; y0: number; x1: number; y1: number } {
    const feet = this.host.groundY - this.balt;
    const k = this.k;
    const B = WitchBattle.BODY;
    const cx = this.fw / 2;
    return { x0: this.bx + (B.x0 - cx) * k, x1: this.bx + (B.x1 - cx) * k, y0: feet - (this.fh - B.y0) * k, y1: feet - (this.fh - B.y1) * k };
  }

  // ───────────────────────── 등장 컷신 ─────────────────────────

  /**
   * 성 안이 어두워짐 → 보라 번개 → 거대한 마녀 그림자 · 낮고 간사한 웃음 → 요리사 모자·포니테일이 먼저 보임
   * → 박쥐 날개가 펼쳐지며 정체 공개 → 등장 대사 (대화창) → 전투 시작
   */
  start(): void {
    const scene = this.host.scene;
    const cam = scene.cameras.main;
    const { W } = this.host;
    bus.emit(EV.bossStart, { id: this.def.id });
    this.mode = 'intro';
    this.bx = this.homeX;
    this.balt = this.hov();
    this.boss.setVisible(false);
    // ① 어두워짐
    this.dark = this.fx(scene.add.rectangle(-200, -200, 4000, 4000, 0x0c0616, 0).setOrigin(0, 0).setDepth(7.5));
    scene.tweens.add({ targets: this.dark, fillAlpha: 0.72, duration: 800 });
    // ② 보라 번개
    const bolt = (x: number): void => {
      sound.thunder();
      cam.flash(140, 190, 120, 255);
      const b = this.fx(scene.add.image(x, 18, 'castle-bolt').setDepth(7.6).setScale(1.6).setAlpha(0.95));
      scene.tweens.add({ targets: b, alpha: 0, duration: 380, delay: 120, onComplete: () => b.destroy() });
    };
    this.after(0.7, () => bolt(W * 0.7), true);
    // ③ 거대한 마녀 그림자 + 낮은 웃음
    const shadow = this.fx(scene.add.sprite(W * 0.62, this.host.groundY + 6, this.tex, 0).setOrigin(0.5, 1).setDepth(7.7).setScale(2.4).setAlpha(0));
    shadow.setTint(0x05020a).setTintMode(Phaser.TintModes.FILL);
    this.after(1.1, () => {
      scene.tweens.add({ targets: shadow, alpha: 0.85, duration: 600 });
      sound.witchLaugh(false);
    }, true);
    this.after(1.7, () => bolt(W * 0.35), true);
    // ④ 그림자가 작아지며 제자리로 · 모자와 포니테일이 먼저 드러남
    this.after(2.6, () => {
      scene.tweens.add({ targets: shadow, scale: WitchBattle.SCALE, x: this.homeX, y: this.host.groundY - this.hov(), duration: 700, ease: 'Quad.Out' });
    }, true);
    const reveal = this.fx(scene.add.sprite(this.homeX, this.host.groundY - this.hov(), this.tex, 0).setOrigin(0.5, 1).setDepth(7.8).setVisible(false).setScale(WitchBattle.SCALE));
    this.after(3.4, () => {
      reveal.setVisible(true).setCrop(0, 0, this.fw, 20); // 모자·포니테일
      sound.witchLaugh(true);
    }, true);
    // ⑤ 날개가 펼쳐짐 → 정체 공개
    this.after(4.2, () => {
      reveal.setFrame(2).setCrop();
      shadow.setVisible(false);
      cam.flash(220, 220, 170, 255);
      cam.shake(240, 0.008);
      sound.rage();
      scene.tweens.add({ targets: this.dark, fillAlpha: 0.32, duration: 500 });
    }, true);
    this.after(4.9, () => {
      reveal.destroy();
      shadow.destroy();
      this.boss.setVisible(true);
      this.setPose(5, 1.2); // 간사하게 웃기
      this.banner({ top: '⚠ 최종 보스!', name: this.def.name, desc: this.def.intro, ms: 2000, tone: 'boss' });
    }, true);
    // ⑥ 등장 대사 → 전투
    this.after(6.2, () => {
      this.talk(WITCH_INTRO_LINES, () => {
        if (this.dark) scene.tweens.add({ targets: this.dark, fillAlpha: 0, duration: 500 });
        this.mode = 'fight';
        this.cooldown = 0.8;
        this.host.startBattleMusic?.();
      });
    }, true);
  }

  // ───────────────────────── 페이즈 ─────────────────────────

  protected rageAt(): readonly number[] {
    return WITCH.phaseAt;
  }

  /** 페이즈 전환에 보스 필살기가 필요 없음 (대사·연출로 전환) */
  protected get specialDue(): boolean {
    return false;
  }

  protected rageText(level: 1 | 2 | 3): string {
    return level === 1 ? '눈이 보라색으로 빛나요 — 더 빨라져요!' : '거대한 이유식 냄비가 나타났어요!';
  }

  protected rageBanner(lv: 1 | 2 | 3): BannerInfo {
    return lv === 1
      ? { top: '💢 PHASE 2', name: '마녀의 분노', desc: this.rageText(1), ms: 1500, tone: 'boss' }
      : { top: '🔥 PHASE 3', name: '최후의 한 숟가락', desc: this.rageText(2), ms: 1500, tone: 'boss' };
  }

  protected onRage(level: 1 | 2 | 3): void {
    const scene = this.host.scene;
    const cam = scene.cameras.main;
    this.busy = true;
    const lines = level === 1 ? WITCH_PHASE2_LINES : WITCH_PHASE3_LINES;
    this.talk(lines, () => {
      // 보라 번개 · 눈빛 · 날개가 커짐
      sound.thunder();
      cam.flash(200, 190, 110, 255);
      cam.shake(300, 0.01);
      this.boss.setScale(WitchBattle.SCALE * (level === 1 ? 1.05 : 1.1));
      for (let i = 0; i < 3; i++) {
        const b = this.fx(scene.add.image(20 + Math.random() * (this.host.W - 40), 16, 'castle-bolt').setDepth(7.6).setScale(1.4));
        scene.tweens.add({ targets: b, alpha: 0, duration: 420, delay: i * 140, onComplete: () => b.destroy() });
      }
      if (level === 2) {
        sound.switchMusicSync('witch2');
        // 거대한 이유식 냄비 등장
        this.pot = this.fx(scene.add.image(this.host.W - 22, this.host.groundY + 2, 'witch-pot').setOrigin(0.5, 1).setDepth(7).setScale(0));
        scene.tweens.add({ targets: this.pot, scale: 1, duration: 420, ease: 'Back.Out' });
      }
      this.busy = false;
      this.cooldown = 0.6;
    });
  }

  // ───────────────────────── 공격 고르기 ─────────────────────────

  protected chooseAttack(): void {
    if (this.debugHold) {
      this.busy = false;
      this.cooldown = 0.5;
      return;
    }
    let pick: Attack;
    if (this.rage === 0) pick = this.last === 'spoon' ? 'bomb' : 'spoon';
    else if (this.rage === 1) {
      const order: Attack[] = ['swirl', 'combo', 'bomb', 'spoon'];
      pick = order[this.count % order.length];
    } else {
      const order: Attack[] = ['pot', 'combo', 'swirl', 'pot', 'bomb', 'spoon'];
      pick = order[this.count % order.length];
    }
    this.count++;
    this.last = pick;
    this.attackLog.push(`${pick}#${this.rage + 1}`);
    // 공격 전 제자리 공중으로
    this.moveTo(this.homeX, this.hov(), 0.35, 0, (t) => 1 - (1 - t) ** 2);
    this.after(0.4, () => {
      if (pick === 'spoon') this.spoonAttack(1);
      else if (pick === 'combo') this.spoonAttack(2);
      else if (pick === 'bomb') this.bombs();
      else if (pick === 'swirl') this.swirl();
      else this.potBlast();
    });
  }

  private get phaseIdx(): 0 | 1 | 2 {
    return Math.min(2, this.rage) as 0 | 1 | 2;
  }

  /** 공격이 끝남 → 잠깐 약점 노출 */
  private finish(cool: number): void {
    this.weakT = WITCH.weak.sec;
    this.endAttack(cool);
  }

  // ───────────────────────── A · D 늘어나는 숟가락 ─────────────────────────

  /**
   * 떠 있는 높이: 기본 WITCH.hover(+더 높이) — 단, 모자 끝이 화면 위 보스 HP 바(HUD)에 가리지 않게 낮춤
   * (가로 화면처럼 세로가 짧을 때)
   */
  private hudAt = -1;
  private hudBottom = 30;

  private hov(extra = 0): number {
    const want = WITCH.hover + extra;
    // HUD 아래 끝 (게임 좌표) — 1초에 한 번만 잼 (화면 회전 대비)
    if (this.hudAt < 0 || this.time - this.hudAt > 1) {
      this.hudAt = this.time;
      const bar = document.querySelector('.boss-bar') as HTMLElement | null;
      const cv = this.host.scene.game.canvas.getBoundingClientRect();
      if (bar && cv.height > 0) {
        const r = bar.getBoundingClientRect();
        if (r.height > 0) this.hudBottom = ((r.bottom - cv.top) / cv.height) * this.host.H + 2;
      }
    }
    const top = this.hudBottom;
    const hatTop = (this.fh - 4) * this.k; // 발밑 → 모자 끝
    return Math.max(4, Math.min(want, this.host.groundY - hatTop - top));
  }

  /** 이유식 뿌리기 그림 (레퍼런스 '공격' 포즈 · 비상용 코드 도트에는 없음 → 숟가락 들기) */
  private get throwFrame(): number {
    return this.boss.texture.frameTotal > 10 ? 9 : 2;
  }

  /** 손 위치 (화면) */
  private hand(): { x: number; y: number } {
    const H = WitchBattle.HAND;
    return { x: this.bx + (H.x - this.fw / 2) * this.k, y: this.host.groundY - this.balt - (this.fh - H.y) * this.k };
  }

  /**
   * 숟가락 내리꽂기 n 번 (A = 1 · D = 2): 경로(점선)·목표 고리 예고 → 팔이 휙 늘어나 숟가락이 고나 자리 땅에 꽝
   *   판정: 내리꽂는 순간 목표 고리 둘레 (반지름 9) — 그 순간 점프로 떠 있거나 방패면 피함
   *   마지막 한 번이 빗나가면 숟가락이 바닥에 꽂혀 어질어질 (큰 반격 기회)
   */
  private spoonAttack(n: number, k = 0): void {
    const scene = this.host.scene;
    const tel = WITCH.spoon.telegraph[this.phaseIdx] * (k > 0 ? 0.8 : 1);
    const h = this.hand();
    const T = { x: this.host.basePlayerX + 4, y: this.host.groundY - 6 };
    this.setPose(2, tel + 0.1);
    this.warn(tel);
    this.telegraph = { kind: n > 1 ? 'combo' : 'spoon', x: T.x, y: T.y, r: 9, impactAt: this.time + tel + WITCH.spoon.strike };
    // 예고: 점선 경로 + 목표 고리 (깜빡)
    const g = this.fx(scene.add.graphics().setDepth(12.4));
    const dx = T.x - h.x;
    const dy = T.y - h.y;
    const len = Math.hypot(dx, dy);
    for (let d = 4; d < len - 6; d += 7) {
      g.fillStyle(d % 14 < 7 ? 0xff5a6a : 0xfff0f0, 0.9);
      g.fillRect(Math.round(h.x + (dx * d) / len), Math.round(h.y + (dy * d) / len), 2, 2);
    }
    const ring = this.fx(scene.add.image(T.x, T.y + 4, 'witch-target').setDepth(12.4).setScale(1.3));
    scene.tweens.add({ targets: [g, ring], alpha: 0.35, duration: 140, yoyo: true, repeat: -1 });
    this.after(tel, () => {
      g.destroy();
      ring.destroy();
      this.strike(h, T, n, k);
    });
  }

  private strike(h: { x: number; y: number }, T: { x: number; y: number }, n: number, k: number): void {
    const scene = this.host.scene;
    const dx = T.x - h.x;
    const dy = T.y - h.y;
    const len = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    // 손에 쥔 숟가락 손잡이가 휙 늘어나 이유식 묻은 숟가락 머리가 목표에 닿음 (마녀와 같은 배율 = 같은 도트 크기)
    const kk = this.k;
    const sw = this.host.scene.textures.getFrame('witch-spoon')?.width ?? 18;
    const armLen = Math.max(4, len - 0.53 * sw * kk);
    this.clearArm();
    this.setPose(6, 99);
    const arm = scene.add.tileSprite(h.x, h.y, 2, 4, 'witch-arm').setOrigin(0, 0.5).setRotation(ang).setDepth(8.6).setScale(kk);
    const sp = scene.add.image(h.x, h.y, 'witch-spoon').setOrigin(0.78, 0.5).setRotation(ang - Math.PI).setDepth(8.7).setScale(kk);
    this.arm = this.fx(arm);
    this.spoon = this.fx(sp);
    sound.throw();
    const dur = WITCH.spoon.strike;
    scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: dur * 1000,
      ease: 'Quad.In',
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0;
        arm.width = Math.max(2, (armLen * t) / kk);
        sp.setPosition(h.x + Math.cos(ang) * armLen * t, h.y + Math.sin(ang) * armLen * t);
      },
    });
    // 내리꽂는 순간 판정 (예고 고리와 같은 자리 · 같은 크기)
    let blockedOrHit: 'hit' | 'block' | null = null;
    this.after(dur, () => {
      sound.hit();
      scene.cameras.main.shake(160, 0.01);
      this.shockwave(T.x, T.y + 4, false);
      const hb = this.spawn('boss-dot', T.x, T.y, { r: 9, pierce: true, breakable: false, threat: false, dmg: WITCH.spoon.dmg, life: 0.12 });
      hb.sprite.setAlpha(0);
      hb.onHit = (_h: Hostile, blocked: boolean) => (blockedOrHit = blocked ? 'block' : 'hit');
    });
    this.after(dur + 0.18, () => {
      this.telegraph = null;
      const result = blockedOrHit ?? 'miss';
      this.spoonLog.push(result);
      const lastOne = k + 1 >= n;
      if (!lastOne) {
        // 연속 공격: 팔을 거두고 짧게 쉬었다가 두 번째
        this.retract(0.25);
        this.after(WITCH.spoon.comboGap * (this.rage >= 2 ? 0.85 : 1), () => this.spoonAttack(n, k + 1));
        return;
      }
      if (result === 'hit') {
        this.retract(0.35);
        this.after(0.4, () => this.finish(1.4));
        return;
      }
      // 빗나감(또는 방패): 숟가락이 바닥에 콱 꽂혀 어질어질 — 코믹하게
      this.floatText('꽝!', T.x + 6, T.y - 14, '#ffffff');
      this.after(0.25, () => this.floatText('어질어질~', this.bx - 6, this.host.groundY - this.balt - this.fh * this.k - 2, '#e2b8ff'));
      scene.tweens.add({ targets: this.boss, angle: { from: -10, to: 10 }, duration: 220, yoyo: true, repeat: 4, onComplete: () => this.boss.setAngle(0) });
      const sec = WITCH.spoon.stun * (result === 'block' ? 0.7 : 1);
      this.stun(sec, WITCH.spoon.stunMul, result === 'block' ? '방패에 막혀 휘청!' : '숟가락이 바닥에 꽂혔어요!');
      this.after(Math.max(0.2, sec - 0.35), () => this.retract(0.3));
    });
  }

  /** 팔을 거둬들임 */
  private retract(sec: number): void {
    const arm = this.arm;
    const sp = this.spoon;
    if (!arm || !sp) return;
    const scene = this.host.scene;
    const h = { x: arm.x, y: arm.y };
    const w0 = arm.width;
    const ang = arm.rotation;
    scene.tweens.addCounter({
      from: 1,
      to: 0,
      duration: sec * 1000,
      ease: 'Quad.Out',
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0;
        if (!arm.active) return;
        arm.width = Math.max(2, w0 * t);
        sp.setPosition(h.x + Math.cos(ang) * w0 * t, h.y + Math.sin(ang) * w0 * t);
      },
      onComplete: () => {
        if (this.arm === arm) this.clearArm();
        this.setPose(0, 0);
      },
    });
  }

  private clearArm(): void {
    this.arm?.destroy();
    this.spoon?.destroy();
    this.arm = null;
    this.spoon = null;
  }

  // ───────────────────────── B 이유식 폭탄 ─────────────────────────

  /** 공중으로 올라가 초록 덩어리를 차례로 떨어뜨림 — 낙하 자리 예고 → 장판이 되어 땅을 따라 고나 쪽으로 (점프로 넘음) */
  private bombs(): void {
    const B = WITCH.bomb;
    const n = B.count[this.phaseIdx];
    this.moveTo(this.homeX, this.hov(16), 0.45, 0, (t) => 1 - (1 - t) ** 2);
    this.setPose(2, 0.6);
    // 하나씩: 장판끼리 점프 한 번 거리 이상 떨어지게 (땅이 흐르는 속도 기준)
    const every = Math.max(0.85, 70 / Math.max(40, this.host.scrollSpeed) + 0.15);
    for (let i = 0; i < n; i++) {
      this.after(0.5 + i * every, () => {
        const mx = Math.round(Math.min(this.host.W - 30, this.host.basePlayerX + (this.host.W - this.host.basePlayerX) * 0.55));
        const mark = this.addMark(mx);
        this.warn(B.telegraph);
        this.telegraph = { kind: 'bomb', x: mx, y: this.host.groundY - 3, r: 9 };
        this.bombLog.push({ mark: mx });
        this.after(B.telegraph - B.fall, () => {
          // 손에서 던짐 → 예고 고리(땅과 함께 흐르는 중)에 정확히 떨어지게
          const h = this.hand();
          const land = mark.x; // 예고 고리 자리에 정확히
          const g = 260;
          const vy = (this.host.groundY - 2 - h.y - 0.5 * g * B.fall * B.fall) / B.fall;
          sound.puff();
          this.setPose(this.throwFrame, 0.35);
          const bomb = this.spawn('witch-goo', h.x, h.y, { vx: (land - h.x) / B.fall, vy, ay: g, r: 4, breakable: true, threat: false, dmg: B.dmg, spin: 220 });
          bomb.onLand = (bh) => {
            const rec = this.bombLog[this.bombLog.length - 1];
            if (rec) {
              rec.land = Math.round(bh.x);
              rec.puddle = true;
            }
            this.removeMark(mark);
            this.splat(bh.x);
            // 장판: 땅과 함께 고나 쪽으로 (점프로 넘기)
            this.spawn('witch-puddle', bh.x, this.host.groundY - 3, { shape: 'box', w: 16, h: 6, onGround: true, pierce: true, breakable: false, dmg: B.dmg, life: 6 });
          };
        });
      });
    }
    this.after(0.5 + n * every + 0.6, () => {
      this.telegraph = null;
      this.finish(1.3);
    });
  }

  private addMark(x: number): GroundMark {
    const s = this.fx(this.host.scene.add.image(x, this.host.groundY + 1, 'witch-target').setOrigin(0.5, 1).setDepth(6.5));
    this.host.scene.tweens.add({ targets: s, alpha: 0.4, duration: 130, yoyo: true, repeat: -1 });
    const m = { s, x };
    this.marks.push(m);
    return m;
  }

  private removeMark(m: GroundMark): void {
    this.host.scene.tweens.killTweensOf(m.s);
    m.s.destroy();
    this.marks = this.marks.filter((x) => x !== m);
  }

  private splat(x: number): void {
    const scene = this.host.scene;
    sound.puff();
    scene.cameras.main.shake(90, 0.005);
    for (let i = 0; i < (perf.low ? 3 : 6); i++) {
      const d = this.fx(scene.add.image(x, this.host.groundY - 4, 'witch-drop').setDepth(11));
      scene.tweens.add({ targets: d, x: x + (Math.random() - 0.5) * 30, y: this.host.groundY - 12 - Math.random() * 14, alpha: 0, duration: 420, ease: 'Quad.Out', onComplete: () => d.destroy() });
    }
  }

  protected phaseLabel(): string {
    return this.rage >= 2 ? '🔥 PHASE 3' : '💢 PHASE 2';
  }

  /** 화가 나도 얼굴이 빨갛게 물들지 않게 (분노는 보라 눈·커진 날개로 표현) — 아주 옅은 보라만 */
  protected applyTint(): void {
    if (this.rage >= 2) this.boss.setTint(0xeedcff);
    else if (this.rage === 1) this.boss.setTint(0xf6eeff);
    else this.boss.clearTint();
  }

  // ───────────────────────── C 이유식 회오리 ─────────────────────────

  /**
   * 공중에서 빙글빙글 → 초록 방울이 아래 줄(땅 가까이 → 점프) · 위 줄(머리 위 → 가만히) 로 차례로 날아옴.
   * 방울마다 그 줄을 미리 점선으로 보여 줌 (예고 높이 = 판정 높이) · 방울은 부메랑으로 부술 수 있음
   */
  private swirl(): void {
    const scene = this.host.scene;
    const S = WITCH.swirl;
    this.moveTo(this.homeX, this.hov(6), 0.3);
    this.setPose(7, S.arrow + S.count * S.gap + 0.4);
    // 빙글빙글: 발밑 기준으로 통째로 돌면 땅까지 내려와 보이므로 좌우로 흔들흔들 (몸은 제자리)
    scene.tweens.add({ targets: this.boss, angle: { from: -14, to: 14 }, duration: 260, yoyo: true, repeat: Math.ceil((S.count * S.gap + S.arrow) / 0.52), onComplete: () => this.boss.setAngle(0) });
    const gap = S.gap * (this.rage >= 2 ? 0.85 : 1);
    const lanes = [0, 1, 0, 0, 1, 0, 1, 0];
    for (let i = 0; i < S.count; i++) {
      const high = lanes[i % lanes.length] === 1;
      const y = high ? this.host.groundY - 34 : this.host.groundY - 6;
      this.after(i * gap, () => {
        // 줄 예고 (점선 · 아래 = 빨강 '점프!' / 위 = 하늘색 '가만히')
        const g = this.fx(scene.add.graphics().setDepth(12.3));
        g.fillStyle(high ? 0x8fe3ff : 0xff6a7a, 0.85);
        for (let x = 4; x < this.bx - 18; x += 8) g.fillRect(x, Math.round(y), 4, 1);
        scene.tweens.add({ targets: g, alpha: 0.3, duration: 120, yoyo: true, repeat: -1 });
        this.telegraph = { kind: 'swirl', x: this.host.basePlayerX, y, r: 5 };
        this.after(S.arrow, () => {
          g.destroy();
          const h = this.hand();
          sound.puff();
          const b = this.spawn('witch-goo', h.x, y, { vx: -S.speed, r: 5, breakable: true, dmg: S.dmg, spin: -300 });
          b.sprite.setScale(1.1);
        });
      });
    }
    this.after(S.arrow + S.count * gap + 0.6, () => {
      this.telegraph = null;
      this.finish(1.2);
    });
  }

  // ───────────────────────── E 초대형 이유식 폭발 (3페이즈) ─────────────────────────

  /**
   * 거대한 냄비를 휘저음 → 초록 이유식이 솟아올라 예고 자리에 차례로 떨어져 펑!
   *   고나 자리에 떨어지는 것은 그 순간 점프(또는 방패)로 피함 · 나머지 자리는 안전 · 끝나면 마녀가 지쳐 멈춤 (큰 기회)
   */
  private potBlast(): void {
    const scene = this.host.scene;
    const P = WITCH.pot;
    if (!this.pot) {
      this.pot = this.fx(scene.add.image(this.host.W - 22, this.host.groundY + 2, 'witch-pot').setOrigin(0.5, 1).setDepth(7));
    }
    this.moveTo(Math.min(this.host.W - 30, (this.pot.x ?? this.homeX) - 4), this.hov(8), 0.4);
    this.setPose(7, 1.4);
    sound.witchLaugh(true);
    // 휘젓기 (냄비 덜컹덜컹 + 거품)
    scene.tweens.add({ targets: this.pot, angle: { from: -4, to: 4 }, duration: 120, yoyo: true, repeat: 5, onComplete: () => this.pot?.setAngle(0) });
    const px = this.host.basePlayerX + 4;
    const spots = [px, px + 44, px, px + 78, px, px + 30, px];
    const n = P.drops;
    const gap = P.gap * (this.rage >= 2 ? 1 : 1);
    for (let i = 0; i < n; i++) {
      const x = Math.min(this.host.W - 26, spots[i % spots.length]);
      const at = 1.0 + i * gap;
      // 예고 고리 (모두 미리 보이고 차례로 터짐)
      this.after(at - P.telegraph, () => {
        if (Math.abs(x - px) < 12) this.telegraph = { kind: 'pot', x, y: this.host.groundY - 6, r: 11, impactAt: this.time + P.telegraph };
        const ring = this.fx(scene.add.image(x, this.host.groundY + 1, 'witch-target').setOrigin(0.5, 1).setDepth(6.5).setScale(1.4));
        scene.tweens.add({ targets: ring, alpha: 0.35, duration: 110, yoyo: true, repeat: -1 });
        // 냄비에서 솟아오르는 덩어리 (보이기만) → 떨어짐
        const blob = this.fx(scene.add.image(this.pot?.x ?? this.host.W - 22, this.host.groundY - 28, 'witch-goo').setDepth(11).setScale(1.4));
        scene.tweens.add({ targets: blob, y: -10, duration: (P.telegraph - 0.4) * 1000, ease: 'Quad.Out' });
        this.after(P.telegraph - 0.35, () => {
          blob.setPosition(x, -10);
          scene.tweens.add({ targets: blob, y: this.host.groundY - 6, duration: 330, ease: 'Quad.In' });
        });
        this.after(P.telegraph, () => {
          scene.tweens.killTweensOf(ring);
          ring.destroy();
          blob.destroy();
          this.splat(x);
          this.shockwave(x, this.host.groundY - 6, false);
          // 터지는 순간 판정 (예고 고리와 같은 자리) — 고나 자리면 점프·방패로
          const hb = this.spawn('boss-dot', x, this.host.groundY - 6, { r: 11, pierce: true, breakable: false, threat: false, dmg: P.dmg, life: 0.18 });
          hb.sprite.setAlpha(0);
        });
      });
    }
    this.after(1.0 + n * gap + 0.4, () => {
      this.telegraph = null;
      // 지쳐서 잠깐 멈춤 (큰 반격 기회)
      this.moveTo(this.homeX, 6, 0.5, 0, (t) => 1 - (1 - t) ** 2);
      this.stun(P.tired, P.tiredMul, '마녀가 지쳤어요!');
    });
  }

  // ───────────────────────── 매 프레임 ─────────────────────────

  protected onUpdate(dt: number): void {
    if (this.weakT > 0) this.weakT -= dt;
    // (낙하 예고 고리는 화면에 고정 — 폭탄이 그 자리에 떨어진 뒤 장판이 땅과 함께 고나 쪽으로 흘러옴)
    // 둥실둥실 (이동 중이 아닐 때)
    if (!this.moving && this.stunT <= 0) this.balt += (this.hov() + Math.sin(this.time * 2.6) * 2 - this.balt) * Math.min(1, dt * 4);
  }

  protected weakMul(x?: number, y?: number): number {
    const base = super.weakMul(x, y);
    const mul = Math.max(base, this.weakT > 0 ? WITCH.weak.mul : 1);
    if (mul > 1) {
      // 약점에 맞음 → 휘청
      this.floatText(mul >= 1.6 ? '약점 명중!' : '약점!', this.bx, this.host.groundY - this.balt - this.fh * this.k, '#ffe14a');
      this.host.scene.tweens.add({ targets: this.boss, angle: { from: -7, to: 7 }, duration: 90, yoyo: true, repeat: 1, onComplete: () => this.boss.setAngle(0) });
      haptics.play('bossHit');
    }
    return mul;
  }

  protected onInterrupt(): void {
    this.clearArm();
    for (const m of [...this.marks]) this.removeMark(m);
    this.telegraph = null;
    this.boss.setAngle(0);
  }

  protected onCleanup(): void {
    this.clearArm();
    this.marks = [];
    this.pot = null;
    this.dark = null;
  }

  // ───────────────────────── 개발용 테스트 ─────────────────────────

  /** (테스트) 등장 컷신 건너뛰기 → 바로 전투 */
  debugSkipIntro(): void {
    if (this.mode !== 'intro') return;
    this.clearCine();
    bus.emit(EV.bossTalkCancel);
    this.frozen = false;
    for (const o of this.host.scene.children.list.filter((c) => c instanceof Phaser.GameObjects.Sprite && c !== this.boss && (c as Phaser.GameObjects.Sprite).texture.key === this.tex)) o.destroy();
    if (this.dark) this.dark.setFillStyle(0x0c0616, 0);
    this.boss.setVisible(true).setAlpha(1);
    this.mode = 'fight';
    this.cooldown = 0.6;
    this.host.startBattleMusic?.();
  }

  /** (테스트) 페이즈로 바로 (2 · 3 — 전환 대사 포함) */
  debugPhase(p: 2 | 3): void {
    this.debugSkipIntro();
    if (p === 3) {
      // 2페이즈는 이미 지난 것으로 (대사 없이 모습만)
      this.rage = 1;
      this.applyTint();
      this.boss.setScale(WitchBattle.SCALE * 1.05);
    }
    this.hp = Math.floor(this.def.maxHp * (p === 2 ? WITCH.phaseAt[0] : WITCH.phaseAt[1])) + 2;
    this.damage(3);
  }

  /** (테스트) 공격 하나 바로 */
  debugAttack(a: Attack): void {
    this.debugSkipIntro();
    this.debugHold = true;
    this.busy = true;
    this.cooldown = 99;
    this.last = a;
    this.attackLog.push(`${a}#test`);
    this.moveTo(this.homeX, this.hov(), 0.3);
    this.after(0.35, () => {
      if (a === 'spoon') this.spoonAttack(1);
      else if (a === 'combo') this.spoonAttack(2);
      else if (a === 'bomb') this.bombs();
      else if (a === 'swirl') this.swirl();
      else this.potBlast();
    });
  }

  // ───────────────────────── 패배 ─────────────────────────

  protected defeatLines(): string[] {
    return WITCH_DEFEAT_LINES;
  }

  /** 비틀 → 숟가락을 떨어뜨림 → 날개가 축 · 모자가 삐뚤 · 작은 드래곤 모습으로 주저앉음 */
  protected onDefeat(): void {
    const scene = this.host.scene;
    // 작아지며 비틀 → 고개 숙이고 기울어진 채 주저앉음 (날개·모자 처짐은 기울기와 눌림으로)
    this.boss.setScale(WitchBattle.SCALE * 0.92);
    scene.tweens.add({ targets: this.boss, angle: { from: -14, to: 10 }, duration: 160, yoyo: true, repeat: 2, onComplete: () => this.boss.setAngle(-9) });
    scene.tweens.add({ targets: this.boss, scaleY: WitchBattle.SCALE * 0.84, duration: 420, delay: 500, ease: 'Bounce.Out' });
    this.boss.setTint(0xd8cce6);
    const sp = this.fx(scene.add.image(this.bx - 18, this.host.groundY - 26, 'witch-spoon').setDepth(9).setRotation(-1.2).setScale(WitchBattle.SCALE));
    scene.tweens.add({ targets: sp, y: this.host.groundY - 3, rotation: -2.6, duration: 380, ease: 'Bounce.Out' });
    sound.catch();
    this.floatText('털썩…', this.bx, this.host.groundY - this.fh * this.k + 14, '#e2b8ff');
  }

  /** 보라 연기와 함께 펑 사라짐 */
  protected exitAnim(): number {
    const scene = this.host.scene;
    const x = this.bx;
    const y = this.host.groundY - (this.fh * this.k) / 2;
    sound.puff();
    const smoke = this.fx(scene.add.particles(x, y, 'witch-smoke', { speed: { min: 20, max: 70 }, lifespan: 900, scale: { start: 1.6, end: 3.2 }, alpha: { start: 0.9, end: 0 }, emitting: false }).setDepth(12));
    smoke.explode(perf.low ? 8 : 16);
    scene.tweens.add({ targets: this.boss, alpha: 0, scale: 0.4, duration: 600, ease: 'Quad.In' });
    this.floatText('펑!', x, y - 10, '#e2b8ff');
    return 1.2;
  }
}
