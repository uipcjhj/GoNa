/**
 * ⚔ 최종 보스 '이유식 드래곤 셰프 마녀' — 암흑의 이유식 성 (킁카괴물 뒤 마지막 모험 끝)
 *   뽀뽀괴물·킁카괴물을 키운 진짜 흑막. 박쥐 날개로 공중에 떠서 이유식 숟가락으로 공격.
 *   예고를 보고 피한 다음 반격하는 3페이즈 (스노우브라더스식) — 고나는 옆으로 움직이지 않으므로
 *   모든 공격은 점프(이단 점프)나 방패로 언제나 피할 수 있게, 예고 자리 = 실제 판정 자리.
 *
 *   PHASE 1 이유식의 유혹 (HP 100~70%): A 늘어나는 숟가락 · B 이유식 폭탄 · 통통 폭탄
 *   PHASE 2 마녀의 분노 (70~35%):       + C 이유식 회오리 · D 숟가락 연속 공격 · 이유식 으깨기 · 숟가락 삼연타 (눈이 보라색 · 날개 커짐 · 번개)
 *   PHASE 3 최후의 한 숟가락 (35~0%):   + E 초대형 이유식 폭발 (거대한 냄비) · 숟가락 부메랑 · 이유식 소나기 · 강화 으깨기 · 공격 빨라짐
 *   마지막 발악 (HP 7% 아래): '안 돼!!' → 거대한 숟가락 휘두르기(점프) → 무방비 — 한 방이면 끝 (놓치면 다시, 여러 번 놓치면 맞을 때까지 어질어질)
 *   ※ 강제 이유식 의자 미니게임은 의자·고나 울음 그림(승인 에셋)이 오면 구현 (CLAUDE.md 원칙)
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

type Attack = 'spoon' | 'bomb' | 'swirl' | 'combo' | 'pot' | 'triple' | 'bounce' | 'rain' | 'boomer' | 'mash' | 'last';

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
export const WITCH_LAST_LINE = '안 돼!! 내 이유식을 거부하다니!!';

/** 새 공격이 처음 나올 때 짧은 안내 (기존 팝업 배너) */
const NEW_ATTACK_INFO: Partial<Record<Attack, { name: string; hint: string }>> = {
  bounce: { name: '이유식 통통 폭탄', hint: '통통 튀며 다가와요 — 가까이 오면 점프!' },
  triple: { name: '숟가락 삼연타', hint: '세 번 내리쳐요 — 마지막은 조금 늦게! 고리를 보고 점프' },
  mash: { name: '이유식 으깨기!', hint: '바닥을 내리치면 이유식이 퍼져요 — 점프! 손을 거둘 때 반격' },
  boomer: { name: '마법 숟가락 부메랑', hint: '빨간 줄(낮게)은 점프 · 파란 줄(높게)은 가만히!' },
  rain: { name: '이유식 소나기', hint: '고리 자리에 떨어져요 — 고나 자리에 고리가 있으면 점프!' },
};

interface GroundMark {
  s: Phaser.GameObjects.Image;
  x: number;
}

export class WitchBattle extends BossBattle {
  private count = 0;
  /** 마지막으로 고른 공격 (검증용) */
  lastAttack: Attack | null = null;
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
  /** (검증용) 지금 공격 예고 정보 — 판정 자리와 같음 (high = 머리 위 줄: 점프하지 말 것) */
  telegraph: { kind: Attack; x: number; y: number; r: number; impactAt?: number; high?: boolean } | null = null;
  /** (검증용) 앞으로 고나 자리를 지나갈 위협들 (자동 회피 테스트용) — at = 전투 시각, high = 머리 위 줄 */
  readonly threatsAhead: { kind: Attack; at: number; high: boolean }[] = [];
  /** 처음 나온 공격 (안내 팝업은 한 번만) */
  private seen = new Set<Attack>();
  /** 통통 튀는 덩어리 */
  private bouncers: { h: Hostile; hs: number[]; i: number }[] = [];
  /** 날아가는 숟가락 부메랑 */
  private boomerSp: { h: Hostile; stage: 'out' | 'wait' | 'back'; t: number; arm: Phaser.GameObjects.TileSprite | null } | null = null;
  /** 마지막 발악: none → swing(휘두르는 중) → open(무방비 · 한 방) → done */
  lastPhase: 'none' | 'swing' | 'open' | 'done' = 'none';
  private lastTries = 0;
  private lastTalked = false;
  /** 공격 중에만 쓰는 예고·효과 (고나 필살기 등으로 공격이 끊기면 바로 정리 — 깜빡이는 고리·점선이 남아 쌓이지 않게) */
  private temps: Phaser.GameObjects.GameObject[] = [];
  /** 마지막 발악 휘두르기: 손잡이가 숟가락을 따라 늘어남 (전투 시간 기준 — 일시정지면 같이 멈춤) */
  private lastArm: { arm: Phaser.GameObjects.TileSprite; sp: Hostile; hx: number; k: number } | null = null;
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
      const b = this.tmp(scene.add.image(x, 18, 'castle-bolt').setDepth(7.6).setScale(1.6).setAlpha(0.95));
      scene.tweens.add({ targets: b, alpha: 0, duration: 380, delay: 120, onComplete: () => b.destroy() });
    };
    this.after(0.7, () => bolt(W * 0.7), true);
    // ③ 거대한 마녀 그림자 + 낮은 웃음
    const shadow = this.tmp(scene.add.sprite(W * 0.62, this.host.groundY + 6, this.tex, 0).setOrigin(0.5, 1).setDepth(7.7).setScale(2.4).setAlpha(0));
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
    const reveal = this.tmp(scene.add.sprite(this.homeX, this.host.groundY - this.hov(), this.tex, 0).setOrigin(0.5, 1).setDepth(7.8).setVisible(false).setScale(WitchBattle.SCALE));
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
        const b = this.tmp(scene.add.image(20 + Math.random() * (this.host.W - 40), 16, 'castle-bolt').setDepth(7.6).setScale(1.4));
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
    // 마지막 발악 (HP 가 거의 다 닳았을 때 · 한 번)
    if (this.lastPhase === 'none' && this.rage >= 2 && this.hp <= this.def.maxHp * WITCH.last.at) {
      this.attackLog.push('last');
      this.lastStand();
      return;
    }
    let pick: Attack;
    if (this.rage === 0) {
      const order: Attack[] = ['spoon', 'bounce', 'bomb', 'spoon', 'bomb', 'bounce'];
      pick = order[this.count % order.length];
    } else if (this.rage === 1) {
      const order: Attack[] = ['mash', 'triple', 'swirl', 'spoon', 'combo', 'mash', 'bomb', 'triple'];
      pick = order[this.count % order.length];
    } else {
      const order: Attack[] = ['pot', 'boomer', 'rain', 'mash', 'triple', 'boomer', 'swirl', 'rain', 'combo', 'mash'];
      pick = order[this.count % order.length];
    }
    this.count++;
    this.lastAttack = pick;
    this.attackLog.push(`${pick}#${this.rage + 1}`);
    // 공격 전 제자리 공중으로 · 처음 나오는 새 공격이면 짧은 안내 뒤에
    this.moveTo(this.homeX, this.hov(), 0.35, 0, (t) => 1 - (1 - t) ** 2);
    this.after(0.4 + this.introduce(pick), () => this.runAttack(pick));
  }

  /** 새 공격 첫 등장: 안내 팝업 (기존 배너) → 기다릴 시간(초) */
  private introduce(a: Attack): number {
    const info = NEW_ATTACK_INFO[a];
    if (!info || this.seen.has(a)) return 0;
    this.seen.add(a);
    this.banner({ top: '⚠ 새 공격!', name: info.name, desc: info.hint, ms: 1500, tone: 'boss' });
    return 1.0;
  }

  private runAttack(a: Attack): void {
    if (a === 'spoon') this.spoonAttack(1);
    else if (a === 'combo') this.spoonAttack(2);
    else if (a === 'triple') this.spoonAttack(3);
    else if (a === 'bomb') this.bombs();
    else if (a === 'swirl') this.swirl();
    else if (a === 'bounce') this.bounceBombs();
    else if (a === 'rain') this.rain();
    else if (a === 'boomer') this.spoonBoomerang();
    else if (a === 'mash') this.mash();
    else if (a === 'last') this.lastStand();
    else this.potBlast();
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

  /** 공격용 임시 효과 등록 */
  private tmp<T extends Phaser.GameObjects.GameObject>(o: T): T {
    if (this.temps.length > 48) this.temps = this.temps.filter((x) => x.active);
    this.temps.push(o);
    return this.fx(o);
  }

  private clearTemps(): void {
    const tw = this.host.scene.tweens;
    for (const o of this.temps) {
      if (!o.active) continue;
      tw.killTweensOf(o);
      o.destroy();
    }
    this.temps = [];
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
    this.telegraph = { kind: n > 2 ? 'triple' : n > 1 ? 'combo' : 'spoon', x: T.x, y: T.y, r: 9, impactAt: this.time + tel + WITCH.spoon.strike };
    // 예고: 점선 경로 + 목표 고리 (깜빡)
    const g = this.tmp(scene.add.graphics().setDepth(12.4));
    const dx = T.x - h.x;
    const dy = T.y - h.y;
    const len = Math.hypot(dx, dy);
    for (let d = 4; d < len - 6; d += 7) {
      g.fillStyle(d % 14 < 7 ? 0xff5a6a : 0xfff0f0, 0.9);
      g.fillRect(Math.round(h.x + (dx * d) / len), Math.round(h.y + (dy * d) / len), 2, 2);
    }
    const ring = this.tmp(scene.add.image(T.x, T.y + 4, 'witch-target').setDepth(12.4).setScale(1.3));
    scene.tweens.add({ targets: [g, ring], alpha: 0.35, duration: 140, yoyo: true, repeat: -1 });
    this.after(tel, () => {
      g.destroy();
      ring.destroy();
      this.strike(h, T, n, k);
    });
  }

  private strike(h: { x: number; y: number }, T: { x: number; y: number }, n: number, k: number): void {
    const scene = this.host.scene;
    const dur = WITCH.spoon.strike;
    this.reach(h, T, dur);
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
        const late = n >= 3 && k + 2 === n ? WITCH.triple.lastDelay : 0; // 삼연타: 마지막은 살짝 늦게
        this.after(WITCH.spoon.comboGap * (this.rage >= 2 ? 0.85 : 1) + late, () => this.spoonAttack(n, k + 1));
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

  /**
   * 손에 쥔 숟가락 손잡이가 휙 늘어나 이유식 묻은 숟가락 머리가 목표 T 에 닿음 (마녀와 같은 배율 = 같은 도트 크기)
   * — 늘어나는 숟가락 · 삼연타 · 이유식 으깨기가 같이 씀
   */
  private reach(h: { x: number; y: number }, T: { x: number; y: number }, dur: number): void {
    const scene = this.host.scene;
    const dx = T.x - h.x;
    const dy = T.y - h.y;
    const len = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    const kk = this.k;
    const sw = scene.textures.getFrame('witch-spoon')?.width ?? 18;
    const armLen = Math.max(4, len - 0.53 * sw * kk);
    this.clearArm();
    this.setPose(6, 99);
    const arm = scene.add.tileSprite(h.x, h.y, 2, 4, 'witch-arm').setOrigin(0, 0.5).setRotation(ang).setDepth(8.6).setScale(kk);
    const sp = scene.add.image(h.x, h.y, 'witch-spoon').setOrigin(0.78, 0.5).setRotation(ang - Math.PI).setDepth(8.7).setScale(kk);
    this.arm = this.tmp(arm);
    this.spoon = this.tmp(sp);
    sound.throw();
    scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: dur * 1000,
      ease: 'Quad.In',
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0;
        if (!arm.active) return;
        arm.width = Math.max(2, (armLen * t) / kk);
        sp.setPosition(h.x + Math.cos(ang) * armLen * t, h.y + Math.sin(ang) * armLen * t);
      },
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
    const s = this.tmp(this.host.scene.add.image(x, this.host.groundY + 1, 'witch-target').setOrigin(0.5, 1).setDepth(10.4));
    this.host.scene.tweens.add({ targets: s, alpha: 0.55, duration: 130, yoyo: true, repeat: -1 });
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
      const d = this.tmp(scene.add.image(x, this.host.groundY - 4, 'witch-drop').setDepth(11));
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
        const g = this.tmp(scene.add.graphics().setDepth(12.3));
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
        const ring = this.tmp(scene.add.image(x, this.host.groundY + 1, 'witch-target').setOrigin(0.5, 1).setDepth(10.4).setScale(1.4));
        scene.tweens.add({ targets: ring, alpha: 0.55, duration: 110, yoyo: true, repeat: -1 });
        // 냄비에서 솟아오르는 덩어리 (보이기만) → 떨어짐
        const blob = this.tmp(scene.add.image(this.pot?.x ?? this.host.W - 22, this.host.groundY - 28, 'witch-goo').setDepth(11).setScale(1.4));
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


  // ───────────────────────── 통통 폭탄 (1페이즈~) ─────────────────────────

  /**
   * 손에서 이유식 덩어리를 차례로 던짐 → 바닥에서 통통 튀며 고나 쪽으로. 튀는 높이가 34 → 20 → 10 으로 낮아지고
   * 가장 낮은 마지막 통통이 고나 자리 위를 지나감 (서 있으면 맞고, 점프하면 넘음) → 고나 뒤 바닥에서 철퍽 터짐.
   * 착지 자리는 미리 작은 고리로 예고.
   */
  private bounceBombs(): void {
    const scene = this.host.scene;
    const B = WITCH.bounce;
    const n = B.count;
    const r = 4;
    const g = B.g;
    const T = B.heights.map((hh) => (2 * Math.sqrt(2 * g * hh)) / g); // 통통 한 번의 시간
    const px = this.host.basePlayerX; // 고나 몸 가운데
    this.setPose(2, B.telegraph);
    for (let i = 0; i < n; i++) {
      const at = i * B.gap;
      this.after(at, () => {
        const h = this.hand();
        // 마지막 통통의 꼭대기가 고나 자리 위에 오도록 가로 속도를 맞춤
        const span = B.throwSec + T.slice(0, -1).reduce((a, b) => a + b, 0) + T[T.length - 1] / 2;
        const vx = Math.max(20, (h.x - px) / span);
        // 착지 자리 (예고 고리)
        const lands: number[] = [];
        let x = h.x - vx * B.throwSec;
        for (let k = 0; k < T.length; k++) {
          lands.push(x);
          x -= vx * T[k];
        }
        const rings = lands.map((lx) => {
          const ring = this.tmp(scene.add.image(lx, this.host.groundY + 1, 'witch-target').setOrigin(0.5, 1).setDepth(10.4).setScale(0.7).setAlpha(0.9));
          scene.tweens.add({ targets: ring, alpha: 0.55, duration: 120, yoyo: true, repeat: -1 });
          return ring;
        });
        const cross = this.time + B.telegraph + span;
        // (자동 테스트 봇용) 마지막 통통 직전 착지 무렵에 닿기 시작 → 꼭대기보다 조금 앞서 점프
        this.threatsAhead.push({ kind: 'bounce', at: cross - 0.15, high: false });
        this.telegraph = { kind: 'bounce', x: px, y: this.host.groundY - r - B.heights[B.heights.length - 1], r, impactAt: cross };
        this.warn(B.telegraph);
        this.after(B.telegraph, () => {
          const h2 = this.hand();
          sound.puff();
          this.setPose(this.throwFrame, 0.35);
          // 손 → 첫 착지 자리로 포물선
          const y0 = this.host.groundY - r;
          const vy = (y0 - h2.y - 0.5 * g * B.throwSec * B.throwSec) / B.throwSec;
          const ball = this.spawn('witch-goo', h2.x, h2.y, { vx: -vx, vy, ay: g, r, breakable: true, dmg: B.dmg, spin: -260, life: 9 });
          this.bouncers.push({ h: ball, hs: [...B.heights, 0], i: 0 });
          ball.onHit = () => rings.forEach((rg) => rg.destroy());
          this.after(span + 0.4, () => rings.forEach((rg) => rg.active && rg.destroy()));
        });
      });
    }
    this.after((n - 1) * B.gap + B.telegraph + 2.6, () => {
      this.telegraph = null;
      this.finish(1.3);
    });
  }

  /** 통통: 바닥에 닿으면 다음 높이로 튀어 오름 · 마지막엔 바닥을 굴러 지나감 */
  private updateBouncers(): void {
    if (!this.bouncers.length) return;
    const g = WITCH.bounce.g;
    const floor = this.host.groundY - 4;
    for (const b of this.bouncers) {
      const h = b.h;
      if (h.dead) continue;
      if (h.vy > 0 && h.y >= floor) {
        h.y = floor;
        if (b.i < b.hs.length && b.hs[b.i] > 0) {
          h.vy = -Math.sqrt(2 * g * b.hs[b.i]);
          b.i++;
          sound.puff();
          this.host.sparkle(1, h.x, this.host.groundY - 1);
        } else {
          // 마지막 통통 뒤: 고나 뒤쪽 바닥에서 철퍽 터짐 (굴러서 다시 덮치지 않게)
          this.splat(h.x);
          this.pop(h);
        }
      }
    }
    this.bouncers = this.bouncers.filter((b) => !b.h.dead);
  }

  // ───────────────────────── 이유식 소나기 (3페이즈) ─────────────────────────

  /**
   * 착탄 자리 고리 예고 → 한꺼번에 떨어짐 → 아주 짧은 장판. 물결 3번 — 가운데 물결은 고나 자리가 비어 있음(안전).
   * 고나 자리에 고리가 있으면 떨어지는 순간 점프 (장판은 점프 한 번 동안 사라짐)
   */
  private rain(): void {
    const scene = this.host.scene;
    const R = WITCH.rain;
    const px = this.host.basePlayerX + 4;
    this.moveTo(this.homeX, this.hov(14), 0.4);
    this.setPose(7, 1.0);
    scene.tweens.add({ targets: this.boss, angle: { from: -10, to: 10 }, duration: 200, yoyo: true, repeat: 3, onComplete: () => this.boss.setAngle(0) });
    for (let w = 0; w < R.waves; w++) {
      const safe = w === 1; // 가운데 물결: 고나 자리는 비움
      this.after(0.3 + w * R.gap, () => {
        const spots: number[] = [];
        for (let x = px + (safe ? R.spacing : 0); x < this.host.W - 14; x += R.spacing) spots.push(Math.round(x));
        if (!safe) spots.unshift(...[px - R.spacing].filter((x) => x > 8));
        const impact = this.time + R.telegraph;
        if (!safe) {
          this.threatsAhead.push({ kind: 'rain', at: impact, high: false });
          this.telegraph = { kind: 'rain', x: px, y: this.host.groundY - 6, r: 6, impactAt: impact };
        }
        this.warn(R.telegraph);
        for (const x of spots) {
          const ring = this.tmp(scene.add.image(x, this.host.groundY + 1, 'witch-target').setOrigin(0.5, 1).setDepth(10.4).setScale(0.85));
          scene.tweens.add({ targets: ring, alpha: 0.55, duration: 110, yoyo: true, repeat: -1 });
          const drop = this.tmp(scene.add.image(x, -8, 'witch-drop').setDepth(11).setScale(1.4));
          this.after(R.telegraph - 0.3, () => scene.tweens.add({ targets: drop, y: this.host.groundY - 6, duration: 300, ease: 'Quad.In' }));
          this.after(R.telegraph, () => {
            scene.tweens.killTweensOf(ring);
            ring.destroy();
            drop.destroy();
            // 떨어지는 순간 판정(고리와 같은 자리·크기) + 아주 짧은 바닥 장판
            const hb = this.spawn('boss-dot', x, this.host.groundY - 6, { r: 6, pierce: true, breakable: false, threat: false, dmg: R.dmg, life: 0.12 });
            hb.sprite.setAlpha(0);
            const pd = this.spawn('witch-puddle', x, this.host.groundY - 2.5, { shape: 'box', w: 12, h: 5, pierce: true, breakable: false, threat: false, dmg: R.dmg, life: R.puddle });
            pd.sprite.setScale(0.7);
          });
        }
        this.after(R.telegraph + 0.05, () => {
          sound.puff();
          scene.cameras.main.shake(80, 0.004);
          if (!safe) this.telegraph = null;
        });
      });
    }
    this.after(0.3 + (R.waves - 1) * R.gap + R.telegraph + 0.6, () => {
      this.telegraph = null;
      this.finish(1.3);
    });
  }

  // ───────────────────────── 마법 숟가락 부메랑 (3페이즈) ─────────────────────────

  /**
   * 숟가락을 빙글빙글 던짐: 낮은 줄(빨강 점선 — 점프)로 날아가 화면 끝에서 잠깐 멈췄다가
   * 높은 줄(파랑 점선 — 가만히)로 마녀에게 돌아옴. 두 줄을 미리 보여 줌 (예고 높이 = 판정 높이)
   */
  private spoonBoomerang(): void {
    const scene = this.host.scene;
    const Bm = WITCH.boomer;
    const lowY = this.host.groundY - Bm.low;
    const highY = this.host.groundY - Bm.high;
    const px = this.host.basePlayerX + 4;
    const h = this.hand();
    this.setPose(2, Bm.telegraph);
    this.warn(Bm.telegraph);
    const g = this.tmp(scene.add.graphics().setDepth(12.3));
    g.fillStyle(0xff6a7a, 0.85);
    for (let x = 4; x < h.x - 6; x += 8) g.fillRect(x, Math.round(lowY), 4, 1);
    g.fillStyle(0x8fe3ff, 0.85);
    for (let x = 4; x < h.x - 6; x += 8) g.fillRect(x + 4, Math.round(highY), 4, 1);
    scene.tweens.add({ targets: g, alpha: 0.3, duration: 120, yoyo: true, repeat: -1 });
    const tOut = (h.x - px) / Bm.out;
    const tBack = Bm.pause + (px + 12) / Bm.out + (px + 12) / Bm.back;
    this.threatsAhead.push({ kind: 'boomer', at: this.time + Bm.telegraph + tOut, high: false }, { kind: 'boomer', at: this.time + Bm.telegraph + tOut + tBack, high: true });
    this.telegraph = { kind: 'boomer', x: px, y: lowY, r: 6, impactAt: this.time + Bm.telegraph + tOut };
    this.after(Bm.telegraph, () => {
      sound.throw();
      this.setPose(this.throwFrame, 0.4);
      const sp = this.spawn('witch-spoon', h.x, lowY, { vx: 0, vy: 0, r: 6, pierce: true, breakable: false, dmg: Bm.dmg, spin: -900, life: 20 });
      sp.sprite.setScale(1);
      this.boomerSp = { h: sp, stage: 'out', t: 0, arm: null };
      // 높은 줄 예고는 돌아올 때까지 남김
      this.after(tOut + Bm.pause * 0.5, () => {
        this.telegraph = { kind: 'boomer', x: px, y: highY, r: 6, high: true, impactAt: this.time + tBack - Bm.pause * 0.5 };
      });
    });
  }

  private updateBoomer(dt: number): void {
    const b = this.boomerSp;
    if (!b) return;
    const Bm = WITCH.boomer;
    const h = b.h;
    if (h.dead) {
      this.boomerSp = null;
      return;
    }
    if (b.stage === 'out') {
      h.x -= Bm.out * dt;
      if (h.x < -12) {
        b.stage = 'wait';
        b.t = Bm.pause;
      }
    } else if (b.stage === 'wait') {
      b.t -= dt;
      if (b.t <= 0) {
        b.stage = 'back';
        h.y = this.host.groundY - Bm.high;
        h.hitPlayer = false; // 돌아오는 길도 피해야 함
        h.dodged = false;
      }
    } else {
      h.x += Bm.back * dt;
      const hd = this.hand();
      if (h.x >= hd.x - 4) {
        // 마녀가 다시 받음
        this.kill(h);
        this.boomerSp = null;
        this.telegraph = null;
        sound.catch();
        this.finish(1.4);
      }
    }
  }

  // ───────────────────────── 이유식 으깨기 (2페이즈~) ─────────────────────────

  /**
   * 간사하게 웃음 → '이유식 으깨기!' → 손에 쥔 숟가락이 휙 늘어나 고나 앞 바닥을 콰직!
   * → 초록 이유식이 좌우로 퍼짐 (고나 쪽 물결 = 점프 · 3페이즈는 두 번, 더 넓게) → 앞에 잠깐 위험 지대
   * → 손을 천천히 거두는 동안 반격 기회. 예고: 내리칠 자리 고리 + 물결이 지나갈 바닥 점선
   * (거대한 손바닥 그림은 승인 에셋을 받으면 숟가락 대신 씀 — 지금은 기존 숟가락 동작 재사용)
   */
  private mash(): void {
    const scene = this.host.scene;
    const M = WITCH.mash;
    const ph = this.phaseIdx;
    const px = this.host.basePlayerX + 4;
    const X = Math.min(this.host.W - 30, px + M.front);
    const T = { x: X, y: this.host.groundY - 6 };
    // ① 간사하게 웃기 + 경고
    this.setPose(5, 0.6);
    sound.witchLaugh(true);
    this.floatText('이유식 으깨기!', this.bx - 10, this.host.groundY - this.balt - this.fh * this.k - 2, '#9cff5a');
    this.warn(M.telegraph);
    // ② 예고: 내리칠 자리 고리 + 물결 길(바닥 점선, 고나 쪽은 빨강)
    const ring = this.tmp(scene.add.image(X, this.host.groundY + 1, 'witch-target').setOrigin(0.5, 1).setDepth(10.4).setScale(1.5));
    const g = this.tmp(scene.add.graphics().setDepth(12.3));
    g.fillStyle(0xff6a7a, 0.9);
    for (let x = 2; x < X - 8; x += 7) g.fillRect(x, this.host.groundY - 3, 4, 1);
    g.fillStyle(0xffd27a, 0.7);
    const reachR = 30 * (M.spread[ph] || 1);
    for (let x = X + 8; x < Math.min(this.host.W, X + reachR); x += 7) g.fillRect(x, this.host.groundY - 3, 4, 1);
    scene.tweens.add({ targets: [g, ring], alpha: 0.35, duration: 130, yoyo: true, repeat: -1 });
    const waves = M.waves[ph] || 1;
    const impact = this.time + M.telegraph + M.strike;
    for (let w = 0; w < waves; w++) {
      // 물결 앞이 고나에 닿는 때 (+0.1초: 판정 테스트 봇이 그보다 조금 앞서 점프)
      this.threatsAhead.push({ kind: 'mash', at: impact + w * M.secondDelay + (X - px - 15) / M.waveSpeed + 0.1, high: false });
    }
    this.telegraph = { kind: 'mash', x: px, y: this.host.groundY - 3, r: 4, impactAt: impact + (X - px - 15) / M.waveSpeed + 0.1 };
    // ③ 손(숟가락)이 커지며 뻗음 → ④ 콰직!
    this.after(M.telegraph, () => {
      this.reach(this.hand(), T, M.strike);
    });
    this.after(M.telegraph + M.strike, () => {
      scene.tweens.killTweensOf([g, ring]);
      ring.destroy();
      sound.hit();
      scene.cameras.main.shake(220, 0.014);
      this.shockwave(X, T.y + 4, true);
      this.floatText('콰직!', X + 4, T.y - 16, '#ffffff');
      this.splat(X);
      // 내리친 자리 판정 (고리와 같은 자리 · 고나 자리 아님)
      const hb = this.spawn('boss-dot', X, T.y, { r: 10, pierce: true, breakable: false, threat: false, dmg: M.dmg, life: 0.15 });
      hb.sprite.setAlpha(0);
      // ⑤ 좌우로 퍼지는 이유식 물결 (고나 쪽 = 점프) · ⑥ 잠깐 위험 지대
      const spawnWave = (): void => {
        const left = this.spawn('witch-puddle', X - 8, this.host.groundY - 3, { shape: 'box', w: 14, h: 6, vx: -M.waveSpeed, pierce: true, breakable: false, dmg: M.waveDmg, life: 4 });
        left.sprite.setScale(1.1, 1);
        const right = this.spawn('witch-puddle', X + 8, this.host.groundY - 3, { shape: 'box', w: 14, h: 6, vx: M.waveSpeed, pierce: true, breakable: false, threat: false, dmg: M.waveDmg, life: reachR / M.waveSpeed });
        right.sprite.setScale(1.1, 1);
      };
      spawnWave();
      for (let w = 1; w < waves; w++) this.after(w * M.secondDelay, () => {
        sound.puff();
        spawnWave();
      });
      const zone = this.spawn('witch-puddle', X, this.host.groundY - 2.5, { shape: 'box', w: 18, h: 5, pierce: true, breakable: false, threat: false, dmg: M.waveDmg, life: 1.0 });
      zone.sprite.setScale(1.3, 1);
      this.after(0.5 + (waves - 1) * M.secondDelay, () => {
        g.destroy();
        // ⑦ 손을 천천히 거둠 → 그동안 반격 기회
        this.telegraph = null;
        this.retract(M.recover * 0.8);
        this.stun(M.recover, M.recoverMul, '손을 거두는 중! 반격!');
      });
    });
  }

  // ───────────────────────── 마지막 발악 ─────────────────────────

  /**
   * HP 가 거의 다 닳으면: '안 돼!! 내 이유식을 거부하다니!!' → 거대한 숟가락을 바닥 높이로 휘두름(낮은 줄 = 점프)
   * → 피하면 무방비 (한 방이면 끝 · window 초). 못 맞히면 다시 휘두름 — retries 번 넘게 놓치면 맞을 때까지 어질어질
   */
  private lastStand(): void {
    const first = !this.lastTalked;
    this.lastTalked = true;
    this.lastPhase = 'swing';
    this.busy = true;
    this.moveTo(this.homeX, this.hov(), 0.3);
    const go = (): void => this.after(0.3, () => this.lastSwing());
    if (first) {
      this.talk([WITCH_LAST_LINE], () => {
        sound.rage();
        this.host.scene.cameras.main.shake(300, 0.012);
        this.banner({ top: '🔥 마지막 발악!', name: '거대한 숟가락 휘두르기', desc: '빨간 줄 = 점프! 피하면 마지막 한 방 기회', ms: 1600, tone: 'boss' });
        this.after(0.8, () => this.lastSwing());
      });
    } else {
      this.floatText('아직이다!!', this.bx, this.host.groundY - this.balt - this.fh * this.k, '#ff9ad0');
      go();
    }
  }

  private lastSwing(): void {
    const scene = this.host.scene;
    const L = WITCH.last;
    const lowY = this.host.groundY - 8;
    const px = this.host.basePlayerX + 4;
    const h = this.hand();
    this.setPose(2, L.telegraph);
    this.warn(L.telegraph);
    const g = this.tmp(scene.add.graphics().setDepth(12.3));
    g.fillStyle(0xff4a5a, 0.95);
    for (let x = 2; x < h.x - 6; x += 7) g.fillRect(x, Math.round(lowY), 5, 2);
    scene.tweens.add({ targets: g, alpha: 0.3, duration: 110, yoyo: true, repeat: -1 });
    const cross = this.time + L.telegraph + (h.x - px) / L.speed;
    this.threatsAhead.push({ kind: 'last', at: cross, high: false });
    this.telegraph = { kind: 'last', x: px, y: lowY, r: 7, impactAt: cross };
    this.after(L.telegraph, () => {
      g.destroy();
      sound.throw();
      this.setPose(6, 99);
      // 늘어나는 손잡이 + 숟가락 머리가 바닥 높이로 휙 쓸고 지나감 (같은 도트 크기)
      const kk = this.k;
      const arm = this.tmp(scene.add.tileSprite(h.x, lowY, 2, 4, 'witch-arm').setOrigin(1, 0.5).setDepth(8.6).setScale(kk));
      const sp = this.spawn('witch-spoon', h.x, lowY, { vx: -L.speed, r: 7, pierce: true, breakable: false, dmg: L.dmg, life: 6 });
      sp.sprite.setScale(kk).setDepth(8.7);
      this.lastArm = { arm, sp, hx: h.x, k: kk };
      this.after((h.x + 20) / L.speed, () => {
        this.lastArm = null;
        if (!sp.dead) this.kill(sp);
        arm.destroy();
        this.setPose(0, 0);
        this.telegraph = null;
        this.openWindow();
      });
    });
  }

  /** 휘두르기를 피함 → 무방비 (한 방이면 끝) */
  private openWindow(): void {
    const L = WITCH.last;
    const forever = this.lastTries >= L.retries;
    const sec = forever ? 999 : L.window[Math.min(this.lastTries, L.window.length - 1)];
    this.lastPhase = 'open';
    this.hp = Math.min(this.hp, 1);
    this.floatText('헉… 헉…', this.bx, this.host.groundY - this.balt - this.fh * this.k, '#e2b8ff');
    this.host.scene.tweens.add({ targets: this.boss, angle: { from: -12, to: 12 }, duration: 260, yoyo: true, repeat: forever ? -1 : Math.ceil(sec / 0.52), onComplete: () => this.boss.setAngle(0) });
    this.stun(sec, L.mul, forever ? '마녀가 완전히 지쳤어요! 마지막 한 방!' : '무방비! 마지막 한 방!');
    if (!forever) {
      this.after(sec - 0.02, () => {
        if (this.mode !== 'fight' || this.lastPhase !== 'open') return;
        // 못 맞힘 → 다시 휘두르기 (다음엔 기회가 더 김)
        this.lastPhase = 'none';
        this.lastTries++;
      });
    }
  }

  /** 마지막 발악 전에는 HP 1 아래로 내려가지 않음 (휘두르기를 피한 뒤 무방비일 때만 쓰러짐) */
  protected hpFloor(): number {
    const base = super.hpFloor();
    if (this.rage >= 2 && this.lastPhase !== 'open' && this.lastPhase !== 'done') return Math.max(base, 1);
    return base;
  }

  // ───────────────────────── 매 프레임 ─────────────────────────

  protected onUpdate(dt: number): void {
    if (this.weakT > 0) this.weakT -= dt;
    this.updateBouncers();
    this.updateBoomer(dt);
    const la = this.lastArm;
    if (la && la.arm.active && !la.sp.dead) la.arm.width = Math.max(2, (la.hx - la.sp.x) / la.k);
    // 지나간 위협 기록 정리
    while (this.threatsAhead.length && this.threatsAhead[0].at < this.time - 1) this.threatsAhead.shift();
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
    // 마지막 발악 도중 끊김(= 고나 필살기): 휘두르던 중이든 무방비든 그대로 무방비로 — 필살기 한 방(또는 다음 부메랑)이면 끝
    //   (휘두르기를 다시 시작하게 하면 필살기를 쓸 때마다 처음으로 돌아가 HP 1 로 끝없이 남음)
    if (this.lastPhase === 'swing') {
      this.lastPhase = 'open';
      this.hp = Math.min(this.hp, 1);
    }
    this.clearTemps();
    this.clearArm();
    this.lastArm?.arm.destroy();
    this.lastArm = null;
    this.bouncers = [];
    this.boomerSp = null;
    this.threatsAhead.length = 0;
    for (const m of [...this.marks]) this.removeMark(m);
    this.telegraph = null;
    this.boss.setAngle(0);
  }

  protected onCleanup(): void {
    this.clearTemps();
    this.clearArm();
    this.lastArm?.arm.destroy();
    this.lastArm = null;
    this.bouncers = [];
    this.boomerSp = null;
    this.threatsAhead.length = 0;
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
    this.lastAttack = a;
    this.attackLog.push(`${a}#test`);
    this.moveTo(this.homeX, this.hov(), 0.3);
    this.after(0.35 + this.introduce(a), () => this.runAttack(a));
  }

  /** (테스트) 바로 처치 (마지막 발악 건너뜀) → 패배 컷신 → 엔딩 */
  debugKill(): void {
    this.debugSkipIntro();
    this.rage = 2;
    this.lastPhase = 'done';
    this.hp = 1;
    this.damage(5);
  }

  /** (테스트) 마지막 발악부터 (3페이즈 · HP 거의 0) */
  debugLast(): void {
    this.debugSkipIntro();
    this.rage = 2;
    this.applyTint();
    this.boss.setScale(WitchBattle.SCALE * 1.1);
    this.hp = Math.max(1, Math.floor(this.def.maxHp * WITCH.last.at) - 1);
    this.debugHold = false;
    this.busy = false;
    this.cooldown = 0.3;
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
    const sp = this.tmp(scene.add.image(this.bx - 18, this.host.groundY - 26, 'witch-spoon').setDepth(9).setRotation(-1.2).setScale(WitchBattle.SCALE));
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
    const smoke = this.tmp(scene.add.particles(x, y, 'witch-smoke', { speed: { min: 20, max: 70 }, lifespan: 900, scale: { start: 1.6, end: 3.2 }, alpha: { start: 0.9, end: 0 }, emitting: false }).setDepth(12));
    smoke.explode(perf.low ? 8 : 16);
    scene.tweens.add({ targets: this.boss, alpha: 0, scale: 0.4, duration: 600, ease: 'Quad.In' });
    this.floatText('펑!', x, y - 10, '#e2b8ff');
    return 1.2;
  }
}
