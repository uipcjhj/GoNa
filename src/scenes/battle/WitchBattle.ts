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
import { bus, EV, type BannerInfo, type QteBtn, type QteHud } from '../../events';
import { sound } from '../../audio';
import { haptics } from '../../haptics';
import { perf } from '../../perf';
import { WITCH, WITCH_EXTRA_ART, WITCH_EXTRA_SHEETS } from '../../game/boss';
import { BossBattle, type Hostile } from './BossBattle';
import type { BattleHost } from './types';

type Attack = 'spoon' | 'bomb' | 'swirl' | 'combo' | 'pot' | 'triple' | 'bounce' | 'rain' | 'boomer' | 'high' | 'slam' | 'last' | 'parry' | 'reflect' | 'rhythm' | 'chair';
/** 대응 방법 (예고 아이콘): 점프 · 가만히 · 방패 · (연타 — 의자, 에셋 대기) */
export type Counter = 'jump' | 'stay' | 'shield';

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
/** 처음 나오는 미니게임: 짧은 안내 팝업 + 잠깐 멈춤 */
const MINIGAME_INFO: Partial<Record<Attack, { name: string; hint: string }>> = {
  parry: { name: '이유식 받아치기', hint: '이유식이 입 앞에 왔을 때 「퉤!」 — 딱 맞추면 마녀에게 철퍼덕!' },
  reflect: { name: '이유식 폭탄 돌려주기', hint: '폭탄이 닿기 직전에 방패! — 딱 맞추면 마녀에게 반사' },
  rhythm: { name: '으아앙! 울음 리듬', hint: '음표가 노란 줄에 오면 「으앙!」 · 긴 음표는 꾸욱 누르기' },
  chair: { name: '이유식 의자 탈출!', hint: '「으아앙!」 마구 누르기 → 숟가락이 오면 꾸욱 길게!' },
};
export const WITCH_CHAIR_LINE = '얌전히 앉아서 이유식 먹어!!';
export const WITCH_CHOP_LINE = '이유식을 안 먹겠다고?! 그럼 전부 먹어라!!';
export const WITCH_CHOP_INTERRUPT = '내 이유식에 무슨 짓이야!!!';
export const WITCH_CHOP_DEFEAT = '내… 이유식이… 그렇게 맛없었니…?';
export const WITCH_RHYTHM_LINE = '이것도 안 먹을 거야?!';

const NEW_ATTACK_INFO: Partial<Record<Attack, { name: string; hint: string }>> = {
  spoon: { name: '낮은 숟가락', hint: '빨간 ▲점프! 가 뜨면 점프' },
  high: { name: '높은 숟가락', hint: '파란 ●가만히! — 점프하면 맞아요' },
  bounce: { name: '이유식 통통 폭탄', hint: '▲점프! 가 뜨면 점프' },
  slam: { name: '숟가락 내려치기', hint: '🛡방패! 가 뜨면 방패 버튼 — 막으면 마녀가 휘청' },
  triple: { name: '숟가락 삼연타', hint: '▲점프! 세 번 — 마지막은 조금 늦게' },
  swirl: { name: '이유식 회오리', hint: '▲점프! / ●가만히! 를 보고 따라 하기' },
  boomer: { name: '숟가락 왕복', hint: '갈 때 ▲점프! · 올 때 ●가만히!' },
  rain: { name: '이유식 소나기', hint: '▲점프! 가 뜰 때만 점프' },
  pot: { name: '초대형 냄비 폭발', hint: '▲점프! 를 보고 차례로 점프' },
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
  telegraph: { kind: Attack; x: number; y: number; r: number; impactAt?: number; high?: boolean; shield?: boolean } | null = null;
  /** (검증용) 앞으로 고나 자리를 지나갈 위협들 (자동 회피 테스트용) — at = 전투 시각, high = 머리 위 줄 */
  readonly threatsAhead: { kind: Attack; at: number; high: boolean; shield?: boolean; qte?: 'spit' }[] = [];
  /** 처음 나온 공격 (안내 팝업은 한 번만) */
  private seen = new Set<Attack>();
  /** 통통 튀는 덩어리 */
  private bouncers: { h: Hostile; hs: number[]; i: number }[] = [];
  /** 날아가는 숟가락 부메랑 */
  private boomerSp: { h: Hostile; stage: 'out' | 'wait' | 'back'; t: number; arm: Phaser.GameObjects.TileSprite | null } | null = null;
  /** 마지막 발악: none → swing(휘두르는 중) → open(무방비 · 한 방) → done */
  lastPhase: 'none' | 'swing' | 'open' | 'chop' | 'done' = 'none';
  private lastTries = 0;
  /** ① 받아치기 상태 (날아오는 이유식 · 도착 시각 · 누른 결과) */
  private parryS: { s: Phaser.GameObjects.Image; x0: number; y0: number; x1: number; y1: number; t0: number; arrive: number; result: 'perfect' | 'good' | 'whiff' | null; done: boolean } | null = null;
  /** ③ 반사 상태 */
  private reflectS: { s: Phaser.GameObjects.Image; x0: number; y0: number; x1: number; y1: number; t0: number; arrive: number; done: boolean } | null = null;
  /** 고나가 방패를 켠 전투 시각 (반사 판정) */
  private shieldAt = -99;
  /** ② 울음 리듬 상태 */
  rhythmS: { notes: { t: number; hold: number; state: 'wait' | 'ok' | 'miss' | 'hold'; downAt: number }[]; lead: number; holding: boolean; ok: number; waves: number; end: number; ticked: number } | null = null;
  /** (검증용) 미니게임 결과 기록 */
  readonly qteLog: string[] = [];
  private onQte = (e: { btn: QteBtn; down: boolean }): void => this.qteInput(e.btn, e.down);
  /** ④ 이유식 의자 탈출 상태 */
  chairS: { stage: 'mash' | 'hold'; gauge: number; end: number; holdAt: number; strong: boolean; taps: number } | null = null;
  /** ⑤ 후드리챱챱 상태 (마지막) */
  chopS: { stage: 'mash' | 'cry' | 'final' | 'finish'; gauge: number; cryEnd: number; holdAt: number; interrupted: boolean; taps: number; fails: number } | null = null;
  /** 미니게임 공격을 고른 뒤 시작 전 (이동·안내 중) — 고나 필살기가 끼어들어 미니게임이 사라지지 않게 */
  private qtePending = false;
  /** 후드리챱챱으로 끝났는지 (패배 대사가 바뀜) */
  private chopped = false;
  /** (개발 메뉴) 그림이 없어도 의자·후드리챱챱 흐름을 미리 실행 (승인 그림 자리는 비워 둠) */
  debugForceArt = false;
  private lastTalked = false;
  /** 공격 중에만 쓰는 예고·효과 (고나 필살기 등으로 공격이 끊기면 바로 정리 — 깜빡이는 고리·점선이 남아 쌓이지 않게) */
  private temps: Phaser.GameObjects.GameObject[] = [];
  /** 마지막 발악 휘두르기: 손잡이가 숟가락을 따라 늘어남 (전투 시간 기준 — 일시정지면 같이 멈춤) */
  private lastArm: { arm: Phaser.GameObjects.TileSprite; sp: Hostile; hx: number; k: number } | null = null;
  /** (검증용) 자동 공격 멈춤 (공격 패턴별 테스트) */
  debugHold = false;

  /**
   * 기본 배율 1.2 (예전 1.6 에서 25% 작게 — 화면이 덜 답답하고 공격 예고 공간 확보).
   * 화면 픽셀 배율(VIEW.renderScale 5) × 1.2 = 6 → 원본 도트 1칸이 정확히 6×6 캔버스 픽셀 (흐려지지 않음).
   * 페이즈가 올라도 크기는 그대로 (1.26 같은 배율은 도트가 뭉개짐)
   */
  static readonly SCALE = 1.2;
  /** 프레임 안의 기준점 (스프라이트 칸 66x53 기준: 몸통·머리 범위, 손잡이 끝) */
  private static readonly BODY = { x0: 10, x1: 40, y0: 6, y1: 45 };
  private static readonly HAND = { x: 15, y: 28 };

  constructor(host: BattleHost, tex: string) {
    super(host, 'witch', tex);
    // 날개 끝까지 화면 안에 (화면에 보이는 반폭 + 여백)
    this.homeX = Math.min(host.W - Math.ceil((this.fw * WitchBattle.SCALE) / 2) - 3, host.basePlayerX + 150);
    this.boss.setScale(WitchBattle.SCALE);
    this.restScale = WitchBattle.SCALE;
    bus.on(EV.qteInput, this.onQte);
    // 받아치기 판정 고리 (작은 UI 효과): 노란 고리 + 가운데 점
    const tm = host.scene.textures;
    if (!tm.exists('fx-ring-target')) {
      const c = document.createElement('canvas');
      c.width = 19;
      c.height = 19;
      const g = c.getContext('2d')!;
      for (let y = 0; y < 19; y++) {
        for (let x = 0; x < 19; x++) {
          const d = Math.hypot(x - 9, y - 9);
          if (d > 7.2 && d <= 9) {
            g.fillStyle = d > 8.2 ? '#7a4a00' : '#ffe14a';
            g.fillRect(x, y, 1, 1);
          }
        }
      }
      g.fillStyle = '#ffffff';
      g.fillRect(8, 8, 3, 3);
      tm.addCanvas('fx-ring-target', c);
    }
  }

  update(rawDt: number): void {
    super.update(rawDt);
    // 패배 연출(전투 아님) 동안에도 이유식 뒤집어쓴 마녀가 따라가게
    this.followGooFace();
  }

  destroy(): void {
    bus.off(EV.qteInput, this.onQte);
    this.showChairArt('off');
    this.showChopArt('off');
    this.gooFace?.destroy();
    this.gooFace = null;
    this.gooHat?.destroy();
    this.gooHat = null;
    this.host.setPlayerHidden?.(false);
    super.destroy();
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
    this.count = 0; // 새 페이즈는 그 페이즈 순서의 처음부터
    this.phaseSeen.clear();
    this.talk(lines, () => {
      // 보라 번개 · 눈빛 · 날개가 커짐
      sound.thunder();
      cam.flash(200, 190, 110, 255);
      cam.shake(300, 0.01);
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
    // 마지막 (HP 가 거의 다 닳았을 때): 후드리챱챱! (승인 그림이 있을 때) · 없으면 기존 마지막 발악
    if (this.lastPhase === 'none' && this.rage >= 2 && this.hp <= this.def.maxHp * WITCH.last.at) {
      if (this.artReady('chop')) {
        this.attackLog.push('chop');
        this.chopFinale();
      } else {
        this.attackLog.push('last');
        this.lastStand();
      }
      return;
    }
    // 정해진 순서 (무작위 아님 · 새 조작은 하나씩) — 앞부분이 그 페이즈 필수 이벤트, 뒤는 반복
    //   1페이즈 식사 시간: 숟가락 → 받아치기 → 폭탄 반사
    //   2페이즈 억지로 먹어!: (분노 컷신) → 의자 → 삼연타 → 울음 리듬 → 반복
    //   3페이즈 대폭주: 부메랑 → 소나기 → 반사 → 강화 리듬 → 강화 의자 → 냄비 → 반복
    // HP 가 문턱에 닿았는데 필수 이벤트가 남았으면: 반복 공격을 건너뛰고 남은 필수 이벤트를 바로 (무적으로 오래 기다리지 않게)
    const script = this.script();
    const need = this.mustList();
    let pick: Attack;
    const left = need.filter((x) => !this.phaseSeen.has(x));
    if (left.length && this.atFloor) pick = script.order.find((x) => left.includes(x)) ?? (left[0] as Attack);
    else {
      const all = script.order;
      const head = script.loopFrom;
      pick = this.count < all.length ? all[this.count] : all[head + ((this.count - all.length) % (all.length - head))];
    }
    this.count++;
    this.qtePending = !!MINIGAME_INFO[pick];
    this.lastAttack = pick;
    this.attackLog.push(`${pick}#${this.rage + 1}`);
    // 공격 전 제자리 공중으로 · 처음 나오는 새 공격이면 짧은 안내 뒤에
    this.moveTo(this.homeX, this.hov(), 0.35, 0, (t) => 1 - (1 - t) ** 2);
    this.after(0.4 + this.introduce(pick), () => this.runAttack(pick));
  }

  /** 이번 페이즈 공격 순서 (그림이 없는 의자는 빠짐) — loopFrom 부터 반복 */
  private script(): { order: Attack[]; loopFrom: number } {
    const chair = this.artReady('chair');
    const f = (xs: Attack[]): Attack[] => xs.filter((x) => x !== 'chair' || chair);
    if (this.rage === 0) return { order: ['spoon', 'parry', 'reflect', 'spoon', 'parry', 'reflect'], loopFrom: 3 };
    if (this.rage === 1) {
      const order = f(['chair', 'triple', 'rhythm', 'parry', 'reflect', 'triple', 'rhythm']);
      return { order, loopFrom: order.indexOf('parry') };
    }
    const order = f(['boomer', 'rain', 'reflect', 'rhythm', 'chair', 'pot', 'boomer', 'parry', 'reflect', 'rain', 'rhythm']);
    return { order, loopFrom: order.lastIndexOf('boomer') };
  }

  /** 이번 페이즈 필수 이벤트 (그림이 없는 의자는 빠짐) */
  private mustList(): string[] {
    const chair = this.artReady('chair');
    return (WITCH.mustShow[this.phaseIdx] ?? []).filter((x) => x !== 'chair' || chair);
  }

  /** HP 가 페이즈 문턱(바닥)에 닿아 더 안 깎이는 중 */
  get atFloor(): boolean {
    return !this.phaseDone && this.hp <= this.hpFloor();
  }

  /** 공격이 끝남: 문턱에서 기다리는 중이면 다음 필수 이벤트를 바로 · 필수가 다 끝났으면 바로 다음 페이즈로 */
  protected endAttack(cool: number): void {
    const waiting = this.lastPhase === 'none' && this.hp <= this.floorAt() + 0;
    super.endAttack(cool);
    if (this.mode !== 'fight') return;
    if (waiting && !this.phaseDone) this.cooldown = Math.min(this.cooldown, 0.6);
    else if (waiting && this.phaseDone) {
      // 문턱에서 필수 이벤트를 다 봤음 → 바로 다음 페이즈 (한 번 더 때릴 때까지 기다리지 않게)
      this.after(0.3, () => {
        if (this.mode === 'fight' && !this.busy) this.damage(2);
      });
    }
  }

  /** 지금 페이즈의 문턱 HP (그 아래로는 필수 이벤트를 다 보기 전에 못 내려감) */
  private floorAt(): number {
    const ats: readonly number[] = WITCH.phaseAt;
    const at = this.rage < ats.length ? ats[this.rage] : WITCH.last.at;
    return Math.floor(this.def.maxHp * at + 1e-6) + 1;
  }

  /** 미니게임 첫 등장: 짧은 안내 팝업 + 전투를 잠깐(1.2초) 멈춤 → 기다릴 시간 */
  private introduceMinigame(a: Attack): number {
    const info = MINIGAME_INFO[a];
    if (!info || this.seen.has(a)) return 0;
    this.seen.add(a);
    this.banner({ top: '✋ 새 조작!', name: info.name, desc: info.hint, ms: 1500, tone: 'good' });
    this.frozen = true;
    this.after(1.2, () => {
      if (this.mode === 'fight') this.frozen = false;
    }, true);
    return 0.2;
  }

  /** 새 공격 첫 등장: 안내 팝업 (기존 배너) → 기다릴 시간(초) */
  private introduce(a: Attack): number {
    if (MINIGAME_INFO[a]) return this.introduceMinigame(a);
    const info = NEW_ATTACK_INFO[a];
    if (!info || this.seen.has(a)) return 0;
    this.seen.add(a);
    this.banner({ top: '⚠ 새 공격!', name: info.name, desc: info.hint, ms: 1500, tone: 'boss' });
    return this.atFloor ? 0.5 : 1.0; // 문턱에서 이어지는 필수 이벤트는 안내 대기를 짧게
  }

  /** 이번 페이즈에 이미 나온 공격 (mustShow 확인용) */
  private phaseSeen = new Set<string>();

  /** 이번 페이즈에 꼭 나와야 하는 상호작용이 다 나왔는지 */
  get phaseDone(): boolean {
    return this.mustList().every((a) => this.phaseSeen.has(a));
  }

  private runAttack(a: Attack): void {
    this.qtePending = false;
    this.phaseSeen.add(a);
    if (a === 'spoon') this.spoonAttack(1);
    else if (a === 'combo') this.spoonAttack(2);
    else if (a === 'triple') this.spoonAttack(3);
    else if (a === 'bomb') this.bombs();
    else if (a === 'swirl') this.swirl();
    else if (a === 'bounce') this.bounceBombs();
    else if (a === 'rain') this.rain();
    else if (a === 'boomer') this.spoonBoomerang();
    else if (a === 'high') this.highSpoon();
    else if (a === 'parry') this.parryAttack();
    else if (a === 'reflect') this.reflectBomb();
    else if (a === 'rhythm') this.cryRhythm();
    else if (a === 'slam') this.slam();
    else if (a === 'last') this.lastStand();
    else if (a === 'chair') this.chairTrap();
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

  /** 기절(어질어질·휘청·지침) 때마다 마녀 머리 위에 ★지금 공격! */
  protected stun(sec: number, mul: number, text: string): void {
    // HP 가 페이즈 문턱에 닿아 더 깎이지 않는 동안엔 기절을 짧게 (때려도 소용없는 시간을 기다리지 않게 — 남은 필수 이벤트로 바로)
    if (this.atFloor && this.lastPhase === 'none') sec = Math.min(sec, 0.9);
    super.stun(sec, mul, text);
    this.cue('counter', Math.min(sec, 30));
  }

  /** 기절한 마녀에게 고나 필살기를 쓰면 추가 피해 (WITCH.stunSpecialMul) */
  private stunBonus = false;

  useSpecial(): boolean {
    const stunned = this.stunT > 0;
    const ok = super.useSpecial();
    if (ok && stunned) {
      this.stunBonus = true;
      this.floatText('기절 보너스!', this.bx - 10, this.host.groundY - this.balt - this.fh * this.k, '#ffe14a');
    }
    return ok;
  }

  protected damage(n: number): void {
    super.damage(this.stunBonus && this.mode === 'cutscene' ? Math.round(n * WITCH.stunSpecialMul) : n);
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
    scene.tweens.add({ targets: g, alpha: 0.35, duration: 140, yoyo: true, repeat: -1 });
    this.cue('jump', tel + WITCH.spoon.strike);
    this.after(tel, () => {
      g.destroy();
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
    const gap = S.gap * (this.rage >= 2 ? 0.9 : 1);
    const lanes = [0, 1, 0, 0, 1, 0, 1, 0];
    for (let i = 0; i < S.count; i++) {
      const high = lanes[i % lanes.length] === 1;
      const y = high ? this.host.groundY - WITCH.high.lane : this.host.groundY - 6;
      this.after(i * gap, () => {
        // 방울이 고나에 닿기 0.85초 전부터 대응 안내 (아래 줄 = ▲점프! / 위 줄 = ●가만히!) — 방울 간격(≥0.9초)보다 짧아 안내가 겹치지 않음
        const travel = (this.hand().x - this.host.basePlayerX - 8) / S.speed;
        const cross = this.time + S.arrow + travel;
        this.threatsAhead.push({ kind: 'swirl', at: cross, high });
        this.after(Math.max(0, S.arrow + travel - 0.85), () => this.cue(high ? 'stay' : 'jump', 0.85));
        this.telegraph = { kind: 'swirl', x: this.host.basePlayerX, y, r: 5, high };
        this.after(S.arrow, () => {
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
        // 고나 자리에 떨어지는 것만 ▲점프! 안내 (나머지 자리는 고나와 상관없음 — 덩어리만 보임)
        if (Math.abs(x - px) < 12) {
          this.telegraph = { kind: 'pot', x, y: this.host.groundY - 6, r: 11, impactAt: this.time + P.telegraph };
          this.threatsAhead.push({ kind: 'pot', at: this.time + P.telegraph, high: false });
          this.cue('jump', P.telegraph);
        }
        // 냄비에서 솟아오르는 덩어리 (보이기만) → 떨어짐
        const blob = this.tmp(scene.add.image(this.pot?.x ?? this.host.W - 22, this.host.groundY - 28, 'witch-goo').setDepth(11).setScale(1.4));
        scene.tweens.add({ targets: blob, y: -10, duration: (P.telegraph - 0.4) * 1000, ease: 'Quad.Out' });
        this.after(P.telegraph - 0.35, () => {
          blob.setPosition(x, -10);
          scene.tweens.add({ targets: blob, y: this.host.groundY - 6, duration: 330, ease: 'Quad.In' });
        });
        this.after(P.telegraph, () => {
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



  // ───────────────────────── 대응 안내 (예고 아이콘) ─────────────────────────
  //   낮은 공격 = 빨강 아래쪽 띠 + ▲점프! · 높은 공격 = 파랑 위쪽 띠 + ●가만히! · 방패 = 파랑 방패 아이콘 + 방패!
  //   반격 = 노랑 ★지금 공격! (마녀 머리 위) — 색 + 아이콘 + 위치(아래/위/앞)로 구분. 아이콘·띠는 코드로 그린 UI (CLAUDE.md 허용)

  private static readonly CUE_LABEL: Record<Counter | 'counter', [string, string, string]> = {
    jump: ['▲ 점프!', '#ff4d5e', '#ffffff'],
    stay: ['● 가만히!', '#3d8bff', '#ffffff'],
    shield: ['방패!', '#3d8bff', '#ffffff'],
    counter: ['★ 지금 공격!', '#ffd23f', '#3a2400'],
  };

  /** 안내 칩 그림 (한 번만 만듦 · 5배로 그려 0.2배로 표시 → 화면 픽셀과 1:1 선명) */
  private cueTex(kind: Counter | 'counter'): string {
    const key = `witch-cue-${kind}`;
    const tm = this.host.scene.textures;
    if (tm.exists(key)) return key;
    const [label, bg, fg] = WitchBattle.CUE_LABEL[kind];
    const c = document.createElement('canvas');
    const g = c.getContext('2d')!;
    // 5배로 그려 0.2배로 표시 (게임 1px = 화면 캔버스 5px → 1:1 선명) · 높이 56 → 게임 안 약 11px (아이폰 세로 약 26pt)
    const font = 'bold 40px Galmuri11, monospace';
    g.font = font;
    const icon = kind === 'shield' ? 44 : 0;
    const w = Math.ceil(g.measureText(label).width) + 30 + icon;
    c.width = w;
    c.height = 56;
    g.fillStyle = 'rgba(20, 8, 30, 0.88)';
    g.fillRect(0, 0, w, 56);
    g.fillStyle = bg;
    g.fillRect(4, 4, w - 8, 48);
    if (kind === 'shield') {
      // 방패 아이콘 (작은 UI 그림)
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.moveTo(13, 11);
      g.lineTo(47, 11);
      g.lineTo(47, 28);
      g.quadraticCurveTo(47, 42, 30, 48);
      g.quadraticCurveTo(13, 42, 13, 28);
      g.closePath();
      g.fill();
      g.fillStyle = bg;
      g.fillRect(27, 16, 6, 24);
      g.fillRect(19, 24, 22, 6);
    }
    g.font = font;
    g.textBaseline = 'middle';
    g.fillStyle = fg;
    g.fillText(label, 15 + icon, 29);
    tm.addCanvas(key, c);
    return key;
  }

  /**
   * 대응 안내를 sec 초 동안 (공격 판정 순간까지). 고나 자리 기준:
   *   jump: 고나 발밑 빨강 띠(낮은 공격이 지나갈 높이) + 고나 앞 아래쪽 칩 / stay: 머리 위 파랑 띠(높은 공격 높이) + 머리 위 칩
   *   shield: 고나 앞 방패 칩 + 내려칠 기둥 테두리 / counter: 마녀 머리 위 노랑 칩
   */
  private cue(kind: Counter | 'counter', sec: number): void {
    const scene = this.host.scene;
    const px = this.host.basePlayerX;
    const gy = this.host.groundY;
    const objs: Phaser.GameObjects.GameObject[] = [];
    if (kind === 'jump') {
      objs.push(this.tmp(scene.add.rectangle(px - 16, gy - 12, 64, 12, 0xff3b4e, 0.32).setOrigin(0, 0).setDepth(10.3)));
      objs.push(this.tmp(scene.add.image(px + 34, gy - 7, this.cueTex('jump')).setScale(0.2).setDepth(12.6)));
    } else if (kind === 'stay') {
      objs.push(this.tmp(scene.add.rectangle(px - 16, gy - WITCH.high.lane - 7, 64, 14, 0x3d8bff, 0.32).setOrigin(0, 0).setDepth(10.3)));
      objs.push(this.tmp(scene.add.image(px + 4, gy - WITCH.high.lane - 17, this.cueTex('stay')).setScale(0.2).setDepth(12.6)));
    } else if (kind === 'shield') {
      const S = WITCH.slam;
      const col = this.tmp(scene.add.rectangle(px, gy, S.width, S.height, 0x3d8bff, 0.16).setOrigin(0.5, 1).setStrokeStyle(1, 0x9cc4ff, 0.9).setDepth(10.3));
      objs.push(col);
      objs.push(this.tmp(scene.add.image(px + 36, gy - 26, this.cueTex('shield')).setScale(0.2).setDepth(12.6)));
    } else {
      const r = this.bossRect();
      // 마녀 발밑 (머리 위는 '지금이 기회!' 배너와 겹침)
      objs.push(this.tmp(scene.add.image((r.x0 + r.x1) / 2, Math.min(gy - 8, r.y1 + 9), this.cueTex('counter')).setScale(0.2).setDepth(12.6)));
    }
    // 깜빡임 (끝에 가까울수록 빠르게) → 판정 순간에 사라짐
    scene.tweens.add({ targets: objs, alpha: 0.45, duration: 180, yoyo: true, repeat: -1 });
    this.after(Math.max(0.2, sec - 0.35), () => {
      scene.tweens.killTweensOf(objs);
      scene.tweens.add({ targets: objs, alpha: 0.3, duration: 70, yoyo: true, repeat: -1 });
    });
    this.after(sec, () => {
      scene.tweens.killTweensOf(objs);
      for (const o of objs) o.destroy();
    });
  }

  // ───────────────────────── 높은 숟가락 (가만히) ─────────────────────────

  /**
   * 손잡이가 늘어나 숟가락이 고나 머리 위 높이(땅에서 lane)로 쓸고 지나감.
   * 서 있는 고나(머리 꼭대기 = 땅 위 19)는 안 닿고, 점프하면 맞음 → '●가만히!'
   */
  private highSpoon(): void {
    const H = WITCH.high;
    const y = this.host.groundY - H.lane;
    const px = this.host.basePlayerX;
    const h = this.hand();
    this.setPose(2, H.telegraph);
    this.warn(H.telegraph);
    const cross = this.time + H.telegraph + (h.x - px) / H.speed;
    this.threatsAhead.push({ kind: 'high', at: cross, high: true });
    this.telegraph = { kind: 'high', x: px, y, r: 6, high: true, impactAt: cross };
    this.cue('stay', H.telegraph + (h.x - px) / H.speed);
    this.after(H.telegraph, () => this.sweep(h.x, y, H.speed, H.dmg, () => this.finish(1.3)));
  }

  /** 늘어나는 손잡이 + 숟가락 머리가 y 높이로 화면 왼쪽까지 쓸고 지나감 (높은 숟가락 · 마지막 발악 공용) */
  private sweep(hx: number, y: number, speed: number, dmg: number, done: () => void): void {
    const scene = this.host.scene;
    sound.throw();
    this.setPose(6, 99);
    const kk = this.k;
    const arm = this.tmp(scene.add.tileSprite(hx, y, 2, 4, 'witch-arm').setOrigin(1, 0.5).setDepth(8.6).setScale(kk));
    const sp = this.spawn('witch-spoon', hx, y, { vx: -speed, r: 6, pierce: true, breakable: false, dmg, life: 6 });
    sp.sprite.setScale(kk).setDepth(8.7);
    this.lastArm = { arm, sp, hx, k: kk };
    this.after((hx + 20) / speed, () => {
      this.lastArm = null;
      if (!sp.dead) this.kill(sp);
      arm.destroy();
      this.setPose(0, 0);
      this.telegraph = null;
      done();
    });
  }

  // ───────────────────────── 숟가락 내려치기 (방패) ─────────────────────────

  /**
   * 숟가락을 높이 들었다가 고나 자리를 위에서 내려침 — 판정이 점프 높이까지 닿는 기둥이라 점프로는 못 피함.
   * 방패(누르면 1초 유지)로 막으면 마녀가 휘청 (큰 반격 기회). 예고: 파랑 방패 아이콘 + 내려칠 기둥 테두리
   */
  private slam(): void {
    const S = WITCH.slam;
    const tel = S.telegraph[this.phaseIdx];
    const px = this.host.basePlayerX;
    const gy = this.host.groundY;
    this.moveTo(this.homeX, this.hov(10), 0.3);
    this.setPose(2, tel + 0.1);
    this.warn(tel);
    const impact = this.time + tel + S.strike;
    this.threatsAhead.push({ kind: 'slam', at: impact, high: false, shield: true });
    this.telegraph = { kind: 'slam', x: px, y: gy - S.height / 2, r: S.width / 2, impactAt: impact, shield: true };
    this.cue('shield', tel + S.strike);
    let result: 'hit' | 'block' | null = null;
    this.after(tel, () => this.reach(this.hand(), { x: px + 4, y: gy - 8 }, S.strike));
    this.after(tel + S.strike, () => {
      sound.hit();
      this.host.scene.cameras.main.shake(200, 0.012);
      this.shockwave(px, gy - 4, true);
      this.splat(px + 6);
      // 판정: 고나 자리 기둥 (땅 ~ 점프 높이 위까지) — 방패가 앞에서 먼저 막음
      const hb = this.spawn('boss-dot', px, gy - S.height / 2, { shape: 'box', w: S.width, h: S.height, pierce: true, breakable: false, threat: false, dmg: S.dmg, life: 0.15 });
      hb.sprite.setAlpha(0);
      hb.onHit = (_h: Hostile, blocked: boolean) => (result = blocked ? 'block' : 'hit');
    });
    this.after(tel + S.strike + 0.2, () => {
      this.telegraph = null;
      this.spoonLog.push(result ?? 'miss');
      if (result === 'block') {
        this.floatText('막았다!', px + 8, gy - 30, '#9cc4ff');
        this.host.scene.tweens.add({ targets: this.boss, angle: { from: -10, to: 10 }, duration: 200, yoyo: true, repeat: 4, onComplete: () => this.boss.setAngle(0) });
        this.after(Math.max(0.2, S.stun - 0.4), () => this.retract(0.3));
        this.stun(S.stun, S.stunMul, '방패에 막혀 휘청!');
      } else {
        this.retract(0.35);
        this.after(0.4, () => this.finish(1.3));
      }
    });
  }

  // ───────────────────────── 통통 폭탄 (1페이즈~) ─────────────────────────

  /**
   * 손에서 이유식 덩어리를 차례로 던짐 → 바닥에서 통통 튀며 고나 쪽으로. 튀는 높이가 34 → 20 → 10 으로 낮아지고
   * 가장 낮은 마지막 통통이 고나 자리 위를 지나감 (서 있으면 맞고, 점프하면 넘음) → 고나 뒤 바닥에서 철퍽 터짐.
   * 고나 위를 지나가기 직전 ▲점프! 안내.
   */
  private bounceBombs(): void {
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
        void lands;
        // ▲점프! 안내: 마지막 통통으로 고나 위를 지나가기 0.9초 전부터 (덩어리 간격 1.3초 — 안내가 겹치지 않음)
        this.after(Math.max(0, B.telegraph + span - 0.95), () => this.cue('jump', 0.9));
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
          this.cue('jump', R.telegraph); // 고나 자리에 떨어지는 물결만 ▲점프! (가운데 물결은 안내 없음 = 가만히 있어도 안전)
        }
        this.warn(R.telegraph);
        for (const x of spots) {
          const drop = this.tmp(scene.add.image(x, -8, 'witch-drop').setDepth(11).setScale(1.4));
          this.after(R.telegraph - 0.3, () => scene.tweens.add({ targets: drop, y: this.host.groundY - 6, duration: 300, ease: 'Quad.In' }));
          this.after(R.telegraph, () => {
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
    const Bm = WITCH.boomer;
    const lowY = this.host.groundY - Bm.low;
    const highY = this.host.groundY - Bm.high;
    const px = this.host.basePlayerX + 4;
    const h = this.hand();
    this.setPose(2, Bm.telegraph);
    this.warn(Bm.telegraph);
    const tOut = (h.x - px) / Bm.out;
    const tBack = Bm.pause + (px + 12) / Bm.out + (px + 12) / Bm.back;
    this.threatsAhead.push({ kind: 'boomer', at: this.time + Bm.telegraph + tOut, high: false }, { kind: 'boomer', at: this.time + Bm.telegraph + tOut + tBack, high: true });
    this.telegraph = { kind: 'boomer', x: px, y: lowY, r: 6, impactAt: this.time + Bm.telegraph + tOut };
    // 갈 때(낮게) ▲점프! → 올 때(높게) ●가만히! — 두 안내는 겹치지 않음 (돌아오기까지 약 1.4초)
    this.after(Math.max(0, Bm.telegraph + tOut - 0.9), () => this.cue('jump', 0.9));
    this.after(Bm.telegraph + tOut + tBack - 0.9, () => this.cue('stay', 0.9));
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
    const L = WITCH.last;
    const lowY = this.host.groundY - 8;
    const px = this.host.basePlayerX;
    const h = this.hand();
    this.setPose(2, L.telegraph);
    this.warn(L.telegraph);
    const cross = this.time + L.telegraph + (h.x - px) / L.speed;
    this.threatsAhead.push({ kind: 'last', at: cross, high: false });
    this.telegraph = { kind: 'last', x: px, y: lowY, r: 7, impactAt: cross };
    this.cue('jump', L.telegraph + (h.x - px) / L.speed);
    // 늘어나는 손잡이 + 숟가락 머리가 바닥 높이로 휙 쓸고 지나감 → 피하면 무방비
    this.after(L.telegraph, () => this.sweep(h.x, lowY, L.speed, L.dmg, () => this.openWindow()));
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
    let base = super.hpFloor();
    // 이번 페이즈의 상호작용이 다 나오기 전엔 다음 페이즈(3페이즈는 마지막 발악)로 못 넘어감
    if (!this.phaseDone && this.lastPhase !== 'open' && this.lastPhase !== 'done') base = Math.max(base, this.floorAt()); // (0.7 배 소수 오차 보정 포함)
    if (this.rage >= 2 && this.lastPhase !== 'open' && this.lastPhase !== 'done') return Math.max(base, 1);
    return base;
  }


  // ═════════════════════════ '이유식 대탈출!' 미니게임 ═════════════════════════
  //   ① 받아치기(퉤!) · ③ 폭탄 반사(방패) · ② 울음 리듬(으앙!) — 판정은 모두 전투 시각 기준 (일시정지하면 같이 멈춤)
  //   이유식 덩어리·폭탄·음파·판정 고리는 작은 효과 (코드) · 고나·마녀 그림은 승인 스프라이트 그대로

  /** 미니게임 버튼이 떠 있는 동안: 공격·방패·필살 버튼 잠금 */
  get qteBusy(): boolean {
    return this.qtePending || (!!this.parryS && !this.parryS.done) || !!this.rhythmS || !!this.chairS || !!this.chopS;
  }

  /** 신규 연출의 승인 그림이 다 있는지 (없으면 그 연출은 실제 전투에서 건너뜀 — 임시 그림으로 채우지 않음) */
  artReady(kind: keyof typeof WITCH_EXTRA_ART): boolean {
    if (this.debugForceArt) return true;
    const tm = this.host.scene.textures;
    return WITCH_EXTRA_ART[kind].every((k) => tm.exists(k));
  }

  /** 미니게임 동안 화면 터치 점프 막기 */
  get jumpLocked(): boolean {
    return this.qteBusy;
  }

  private get spitVisible(): boolean {
    const p = this.parryS;
    return !!p && !p.done && this.time >= p.arrive - WITCH.parry.show;
  }

  qteHud(): QteHud | null {
    const p = this.parryS;
    // 받아치기 공격 내내 '받아치기 화면' (기존 버튼 숨김) · 퉤! 버튼은 이유식이 다가올 때만
    if (p && !p.done) return { kind: 'spit', show: this.spitVisible, ready: this.spitVisible && this.time >= p.arrive - WITCH.parry.early };
    const c = this.chairS;
    if (c) {
      const C = WITCH.chair;
      return { kind: 'chair', stage: c.stage, gauge: c.gauge, left: Math.max(0, c.end - this.time), hold: c.holdAt >= 0 ? Math.min(1, (this.time - c.holdAt) / C.hold) : 0 };
    }
    const ch = this.chopS;
    if (ch) {
      return { kind: 'chop', stage: ch.stage, gauge: ch.gauge, left: ch.stage === 'cry' ? Math.max(0, ch.cryEnd - this.time) : 0, hold: ch.holdAt >= 0 ? Math.min(1, (this.time - ch.holdAt) / WITCH.chop.hold) : 0 };
    }
    const r = this.rhythmS;
    if (r) {
      return {
        kind: 'rhythm',
        notes: r.notes.map((n) => ({ x: 0.18 + ((n.t - this.time) / r.lead) * 0.82, len: (n.hold / r.lead) * 0.82, hold: n.hold > 0, state: n.state })),
        holding: r.holding,
        title: '😭 으아앙! 울음 리듬',
        score: r.ok,
        total: r.notes.length,
      };
    }
    return null;
  }

  onShieldRaised(): void {
    this.shieldAt = this.time;
  }

  /** 미니게임 버튼 (퉤! · 으앙!) — 일시정지·대사 중엔 무시 */
  private qteInput(btn: QteBtn, down: boolean): void {
    const state = (this.host.scene as unknown as { state?: string }).state;
    if (state !== 'playing' || this.frozen || this.mode !== 'fight') return;
    if (btn === 'spit' && down) this.spitPress();
    else if (btn === 'cry') this.cryPress(down);
    else if (btn === 'mash') {
      if (this.chairS) this.chairPress(down);
      else if (this.chopS) this.chopCry(down);
    } else if (btn === 'chop' && down) this.chopHit();
    else if (btn === 'final' && down) this.chopFinal();
  }

  /** 마녀 얼굴 자리 (스프라이트 칸 66×53 에서 얼굴 가운데 28,27) */
  private face(): { x: number; y: number } {
    return { x: this.bx + (28 - this.fw / 2) * this.k, y: this.host.groundY - this.balt - (this.fh - 27) * this.k };
  }

  /** 얼굴에 이유식이 철퍼덕 (잠깐 붙어 있다가 흘러내림) */
  private faceSplat(big: boolean): void {
    const scene = this.host.scene;
    const f = this.face();
    sound.splat();
    const g = this.tmp(scene.add.image(f.x, f.y, 'witch-goo').setDepth(9.2).setScale(big ? 2.2 : 1.6));
    this.faceGoo = { s: g, t: 1.6 };
    for (let i = 0; i < (perf.low ? 3 : 6); i++) {
      const d = this.tmp(scene.add.image(f.x, f.y, 'witch-drop').setDepth(9.3));
      scene.tweens.add({ targets: d, x: f.x + (Math.random() - 0.5) * 26, y: f.y + 6 + Math.random() * 18, alpha: 0, duration: 520, ease: 'Quad.Out', onComplete: () => d.destroy() });
    }
    this.floatText('철퍼덕!', f.x - 8, f.y - 16, '#b8ff7a');
  }
  private faceGoo: { s: Phaser.GameObjects.Image; t: number } | null = null;

  /** 고나 입 앞 (판정 구역) */
  private mouth(): { x: number; y: number } {
    const h = this.host.playerHead();
    return { x: h.x + 12, y: h.y + 4 };
  }

  // ───────── ① 이유식 받아치기 (퉤!) ─────────

  private parryAttack(): void {
    const P = WITCH.parry;
    const fly = P.fly[this.phaseIdx];
    this.setPose(2, P.raise + 0.2);
    this.warn(P.raise);
    this.floatText('이유식이 날아온다!', this.bx - 26, this.host.groundY - this.balt - this.fh * this.k - 4, '#b8ff7a');
    this.after(P.raise, () => {
      const scene = this.host.scene;
      const h = this.hand();
      const m = this.mouth();
      sound.throw();
      this.setPose(this.throwFrame, 0.35);
      const s = this.tmp(scene.add.image(h.x, h.y, 'witch-goo').setDepth(11).setScale(1.5));
      const arrive = this.time + fly;
      this.parryS = { s, x0: h.x, y0: h.y, x1: m.x, y1: m.y, t0: this.time, arrive, result: null, done: false };
      this.telegraph = { kind: 'parry', x: m.x, y: m.y, r: 6, impactAt: arrive };
      this.threatsAhead.push({ kind: 'parry', at: arrive, high: false, qte: 'spit' });
      // 판정 구역 고리 (고나 입 앞 — 도착 직전부터 노랗게)
      const ring = this.tmp(scene.add.image(m.x, m.y, 'fx-ring-target').setDepth(10.6).setAlpha(0));
      this.after(Math.max(0, fly - P.show), () => {
        ring.setAlpha(0.9);
        scene.tweens.add({ targets: ring, scale: { from: 1.6, to: 1 }, duration: P.show * 1000, ease: 'Quad.In' });
      });
      this.after(fly + P.perfect + 0.02, () => ring.destroy());
    });
  }

  private spitPress(): void {
    const p = this.parryS;
    const P = WITCH.parry;
    if (!p || p.done || p.result || this.time < p.arrive - P.show) return;
    const d = this.time - p.arrive;
    const m = this.mouth();
    if (Math.abs(d) <= P.perfect) this.parryWin(true);
    else if (d < -P.perfect && d >= -P.early) this.parryWin(false);
    else if (d < -P.early) {
      // 너무 일찍: 헛퉤 (기회는 한 번)
      p.result = 'whiff';
      sound.spit(false);
      this.floatText('헛퉤!', m.x - 4, m.y - 14, '#ffd0d0');
    }
  }

  private parryWin(perfect: boolean): void {
    const p = this.parryS!;
    const P = WITCH.parry;
    const scene = this.host.scene;
    p.result = perfect ? 'perfect' : 'good';
    p.done = true;
    this.qteLog.push(`parry:${p.result}`);
    sound.spit(perfect);
    haptics.play('monsterHit');
    const m = this.mouth();
    this.floatText(perfect ? '퉤!! PERFECT' : '퉤!', m.x - 6, m.y - 16, perfect ? '#ffe14a' : '#b8ff7a');
    this.host.sparkle(perfect ? 8 : 4, m.x, m.y);
    // 이유식이 마녀 얼굴로 되돌아감
    const f = this.face();
    this.telegraph = null;
    scene.tweens.add({
      targets: p.s,
      x: f.x,
      y: f.y,
      angle: 540,
      duration: 340,
      ease: 'Quad.In',
      onComplete: () => {
        p.s.destroy();
        this.parryS = null;
        if (this.mode !== 'fight') return;
        this.faceSplat(perfect);
        this.setPose(4, 0.8);
        this.damage(perfect ? P.dmgPerfect : P.dmgGood);
        if (perfect) this.stun(1.4, 1.4, '이유식을 뒤집어썼어요!');
        else this.finish(1.3);
      },
    });
  }

  private parryLose(): void {
    const p = this.parryS!;
    p.done = true;
    this.qteLog.push(`parry:${p.result === 'whiff' ? 'whiff' : 'miss'}`);
    this.telegraph = null;
    const m = this.mouth();
    p.s.destroy();
    this.parryS = null;
    sound.splat();
    this.splat(m.x);
    this.host.hurtPlayer(this.dmg(WITCH.parry.hurt), 'witch-goo');
    this.floatText('으엑!', m.x - 6, m.y - 14, '#ff9f9f');
    this.finish(1.3);
  }

  private updateParry(): void {
    const p = this.parryS;
    if (!p || p.done) return;
    const k = Math.min(1, (this.time - p.t0) / (p.arrive - p.t0));
    p.s.setPosition(p.x0 + (p.x1 - p.x0) * k, p.y0 + (p.y1 - p.y0) * k - Math.sin(Math.PI * k) * 10);
    p.s.angle -= 9;
    if (this.time > p.arrive + WITCH.parry.perfect) this.parryLose();
  }

  // ───────── ③ 이유식 폭탄 돌려주기 (방패 반사) ─────────

  private reflectBomb(): void {
    const R = WITCH.reflect;
    const fly = R.fly[this.phaseIdx];
    this.setPose(2, R.raise + 0.2);
    this.warn(R.raise);
    this.after(R.raise, () => {
      const scene = this.host.scene;
      const h = this.hand();
      const x1 = this.host.basePlayerX + 14;
      const y1 = this.host.groundY - 14;
      sound.puff();
      this.setPose(this.throwFrame, 0.35);
      const s = this.tmp(scene.add.image(h.x, h.y, 'witch-goo').setDepth(11).setScale(2));
      const arrive = this.time + fly;
      this.reflectS = { s, x0: h.x, y0: h.y, x1, y1, t0: this.time, arrive, done: false };
      this.telegraph = { kind: 'reflect', x: x1, y: y1, r: 8, impactAt: arrive, shield: true };
      this.threatsAhead.push({ kind: 'reflect', at: arrive, high: false, shield: true });
      this.cue('shield', fly);
    });
  }

  private updateReflect(): void {
    const r = this.reflectS;
    if (!r || r.done) return;
    const k = Math.min(1, (this.time - r.t0) / (r.arrive - r.t0));
    r.s.setPosition(r.x0 + (r.x1 - r.x0) * k, r.y0 + (r.y1 - r.y0) * k - Math.sin(Math.PI * k) * 26);
    r.s.angle += 7;
    if (this.time < r.arrive) return;
    r.done = true;
    this.telegraph = null;
    const scene = this.host.scene;
    const R = WITCH.reflect;
    const active = !!this.host.shieldRect();
    if (active && r.arrive - this.shieldAt <= R.perfect) {
      // 반사: 금빛 번쩍 + 종소리 (일반 방어와 다르게) → 마녀에게 되돌아감
      this.qteLog.push('reflect:perfect');
      sound.reflect();
      haptics.play('bossHit');
      this.shockwave(r.x1, r.y1, true);
      this.host.sparkle(10, r.x1, r.y1);
      this.floatText('반사!', r.x1 - 4, r.y1 - 18, '#ffe14a');
      r.s.setTint(0xfff3a0);
      const f = this.face();
      const trail = this.tmp(scene.add.particles(0, 0, 'boss-star', { follow: r.s, lifespan: 240, scale: { start: 1.2, end: 0 }, alpha: { start: 0.9, end: 0 }, frequency: perf.low ? 50 : 25, tint: [0xffe14a, 0xffffff] }).setDepth(10.9));
      scene.tweens.add({
        targets: r.s,
        x: f.x,
        y: f.y,
        duration: 300,
        ease: 'Quad.In',
        onComplete: () => {
          trail.destroy();
          r.s.destroy();
          this.reflectS = null;
          if (this.mode !== 'fight') return;
          this.faceSplat(true);
          this.setPose(4, 0.8);
          this.damage(R.dmg);
          this.stun(1.3, 1.4, '폭탄이 되돌아왔어요!');
        },
      });
    } else if (active) {
      this.qteLog.push('reflect:block');
      this.host.onShieldBlock(r.x1, r.y1);
      this.floatText('막았다! (조금 일찍)', r.x1 - 16, r.y1 - 18, '#9cc4ff');
      r.s.destroy();
      this.reflectS = null;
      this.finish(1.3);
    } else {
      this.qteLog.push('reflect:miss');
      r.s.destroy();
      this.reflectS = null;
      this.splat(r.x1);
      sound.splat();
      this.host.hurtPlayer(this.dmg(R.hurt), 'witch-goo');
      this.finish(1.3);
    }
  }

  // ───────── ② 으아앙! 울음 리듬 배틀 ─────────

  private cryRhythm(): void {
    const Rh = WITCH.rhythm;
    const sp = Rh.speed[this.phaseIdx];
    this.setPose(5, 0.9);
    sound.witchLaugh(true);
    this.floatText(WITCH_RHYTHM_LINE, this.bx - 30, this.host.groundY - this.balt - this.fh * this.k - 4, '#ff9ad0');
    const lead = Rh.lead * Math.max(0.85, sp);
    const start = this.time + 0.9 + lead;
    this.rhythmS = {
      notes: Rh.pattern.map(([t, hold]) => ({ t: start + t * sp, hold: hold * Math.max(0.9, sp), state: 'wait' as const, downAt: -1 })),
      lead,
      holding: false,
      ok: 0,
      waves: 0,
      end: 0,
      ticked: 0,
    };
    this.telegraph = { kind: 'rhythm', x: this.host.basePlayerX, y: this.host.groundY - 20, r: 0 };
  }

  private cryPress(down: boolean): void {
    const r = this.rhythmS;
    if (!r) return;
    const Rh = WITCH.rhythm;
    if (down) {
      const n = r.notes.find((x) => x.state === 'wait' && Math.abs(this.time - x.t) <= Rh.good);
      if (!n) return; // 아무 음표도 없을 때 누른 것은 벌 없음 (넉넉하게)
      if (n.hold > 0) {
        n.state = 'hold';
        n.downAt = this.time;
        r.holding = true;
        sound.cry(Math.min(1, r.ok / 5));
      } else this.rhythmHit(n);
    } else {
      const n = r.notes.find((x) => x.state === 'hold');
      r.holding = false;
      if (!n) return;
      if (this.time - n.downAt >= n.hold - 0.22) this.rhythmHit(n);
      else this.rhythmMiss(n, '너무 짧아!');
    }
  }

  private rhythmHit(n: { state: string }): void {
    const r = this.rhythmS!;
    n.state = 'ok';
    r.ok++;
    const lv = Math.min(1, r.ok / r.notes.length);
    sound.cry(lv);
    haptics.play('monsterHit');
    this.soundWave(lv, false);
    // 마녀가 음파에 밀림
    this.host.scene.tweens.add({ targets: this.boss, x: this.boss.x + 3, duration: 80, yoyo: true });
    this.setPose(4, 0.18);
  }

  private rhythmMiss(n: { state: string }, text = '삐끗!'): void {
    n.state = 'miss';
    const m = this.mouth();
    this.floatText(text, m.x - 4, m.y - 16, '#ffb0b0');
  }

  /** 고나의 울음 음파 (코드 효과: 겹친 반원 고리) — big = 마지막 강타 */
  private soundWave(level: number, big: boolean): void {
    const scene = this.host.scene;
    const m = this.mouth();
    const f = this.face();
    const g = this.tmp(scene.add.graphics().setDepth(11.5));
    const r0 = 4 + level * 6 + (big ? 6 : 0);
    for (let i = 0; i < 3; i++) {
      g.lineStyle(big ? 2 : 1, i === 1 ? 0xffffff : 0x8fd0ff, 0.95 - i * 0.2);
      g.beginPath();
      g.arc(0, 0, r0 + i * 4, -1.0, 1.0);
      g.strokePath();
    }
    g.setPosition(m.x, m.y);
    scene.tweens.add({ targets: g, x: big ? f.x : m.x + 30 + level * 30, y: big ? f.y : m.y - 4, scale: big ? 2.6 : 1.6 + level, alpha: big ? 1 : 0, duration: big ? 380 : 420, ease: 'Quad.Out', onComplete: () => g.destroy() });
  }

  private updateRhythm(): void {
    const r = this.rhythmS;
    if (!r) return;
    const Rh = WITCH.rhythm;
    // 박마다 마녀가 숟가락 휘두르기 + 짧은 박자 소리 (BGM 과 따로)
    while (r.ticked < r.notes.length && this.time >= r.notes[r.ticked].t) {
      const n = r.notes[r.ticked];
      this.setPose(r.ticked % 2 ? 2 : 6, 0.22);
      sound.rhythmTick(n.hold > 0);
      r.ticked++;
    }
    for (const n of r.notes) {
      if (n.state === 'wait' && this.time > n.t + Rh.good) this.rhythmMiss(n);
      // 꾸욱: 충분히 눌렀으면 떼기 전에도 성공
      if (n.state === 'hold' && this.time - n.downAt >= n.hold) {
        r.holding = false;
        this.rhythmHit(n);
      }
    }
    const last = r.notes[r.notes.length - 1];
    if (r.notes.every((n) => n.state === 'ok' || n.state === 'miss') && this.time > last.t + last.hold + 0.35) this.endRhythm();
  }

  private endRhythm(): void {
    const r = this.rhythmS!;
    const Rh = WITCH.rhythm;
    this.rhythmS = null;
    this.telegraph = null;
    const total = r.notes.length;
    const misses = total - r.ok;
    this.qteLog.push(`rhythm:${r.ok}/${total}`);
    // 마지막 큰 음파 → 마녀 강타
    this.soundWave(1, true);
    sound.cry(1);
    this.after(0.38, () => {
      if (this.mode !== 'fight') return;
      const great = r.ok >= Rh.stunAt;
      this.banner({ top: '😭 으아아앙!!', name: great ? '울음 음파 대성공!' : `울음 음파 ${r.ok}/${total}`, desc: great ? '마녀가 어질어질 — 지금 공격!' : '음표가 노란 줄에 올 때 누르기', ms: 1300, tone: great ? 'good' : 'aim' });
      this.host.scene.cameras.main.shake(180, 0.01);
      this.damage(Rh.base + Rh.perHit * r.ok);
      this.setPose(4, 0.6);
      if (misses > 0) this.host.hurtPlayer(this.dmg(Rh.missHurt * misses), 'witch-rhythm');
      if (great) this.stun(1.6, 1.5, '울음 음파에 어질어질!');
      else this.finish(1.3);
    });
  }

  // ───────── ④ 이유식 의자 탈출 (승인 그림: 의자 · 의자에 앉아 우는 고나 — artReady('chair')) ─────────
  //   '얌전히 앉아서 이유식 먹어!' → 의자에 갇힘 → '으아앙!' 연타(탈출 게이지 · 음파가 커짐)
  //   → 마녀 숟가락이 입으로 (경고) → 꾸욱 길게 = 강력한 울음 음파 → 의자 부서짐 · 마녀 밀려나 기절 / 실패 = 작은 피해 + 자동 탈출

  private chairTrap(): void {
    const C = WITCH.chair;
    const i = Math.max(0, this.phaseIdx - 1);
    const strong = this.phaseIdx >= 2;
    this.setPose(5, 0.9);
    sound.witchLaugh(true);
    this.floatText(WITCH_CHAIR_LINE, this.bx - 34, this.host.groundY - this.balt - this.fh * this.k - 4, '#ff9ad0');
    this.showChairArt('appear');
    this.chairS = { stage: 'mash', gauge: 0, end: this.time + 0.6 + C.mash[i], holdAt: -1, strong, taps: 0 };
    this.telegraph = { kind: 'chair', x: this.host.basePlayerX, y: this.host.groundY - 20, r: 0 };
  }

  private chairPress(down: boolean): void {
    const c = this.chairS!;
    const C = WITCH.chair;
    if (c.stage === 'mash') {
      if (!down) return;
      c.taps++;
      c.gauge = Math.min(1, c.gauge + C.perTap);
      sound.cry(c.gauge);
      this.soundWave(c.gauge * 0.8, false);
      haptics.play('monsterHit');
      this.showChairArt('cry', c.taps);
    } else if (down) {
      c.holdAt = this.time;
      sound.cry(1);
      this.showChairArt('charge');
    } else {
      c.holdAt = -1; // 일찍 뗌 → 다시 꾸욱
      this.showChairArt('hold');
    }
  }

  private updateChair(dt: number): void {
    const c = this.chairS;
    if (!c) return;
    const C = WITCH.chair;
    const i = c.strong ? 1 : 0;
    if (c.stage === 'mash') {
      c.gauge = Math.max(0, c.gauge - C.decay[i] * dt);
      if (this.time >= c.end) {
        // 숟가락이 고나 입으로 다가옴 → 경고 · 꾸욱!
        c.stage = 'hold';
        c.end = this.time + C.warn[i];
        const m = this.mouth();
        this.setPose(2, C.warn[i]);
        this.warn(C.warn[i]);
        this.moveTo(Math.min(this.homeX, m.x + 46), this.hov(-8), C.warn[i] * 0.9);
        this.floatText('숟가락이 온다! 꾸욱!', m.x - 10, m.y - 26, '#ffe14a');
        this.showChairArt('hold');
      }
      return;
    }
    if (c.holdAt >= 0 && this.time - c.holdAt >= C.hold) return this.endChair(true);
    if (this.time >= c.end) this.endChair(false);
  }

  private endChair(ok: boolean): void {
    const c = this.chairS!;
    const C = WITCH.chair;
    this.chairS = null;
    this.telegraph = null;
    this.qteLog.push(`chair:${ok ? 'ok' : 'fail'}:${Math.round(c.gauge * 100)}`);
    this.showChairArt(ok ? 'break' : 'fail');
    if (ok) {
      // 강력한 울음 음파 → 의자 부서짐 · 마녀가 뒤로 밀려나 기절
      this.soundWave(1, true);
      sound.cry(1);
      this.host.scene.cameras.main.shake(240, 0.012);
      this.banner({ top: '😭 으아아앙!!', name: '울음 폭발 탈출!', desc: '마녀가 날아갔어요 — 지금 공격!', ms: 1300, tone: 'good' });
      this.after(0.3, () => {
        if (this.mode !== 'fight') return;
        this.moveTo(this.homeX, this.hov(), 0.35);
        this.damage(Math.round(C.dmg * (0.6 + c.gauge)));
        this.stun(C.stun, C.stunMul, '울음 음파에 날아가 어질어질!');
      });
    } else {
      this.banner({ top: '🥄 냠…', name: '억지로 한 입…', desc: '퉤퉤! 겨우 빠져나왔어요', ms: 1200, tone: 'aim' });
      this.host.hurtPlayer(this.dmg(C.hurt), 'witch-chair');
      this.moveTo(this.homeX, this.hov(), 0.5);
      this.finish(1.2);
    }
  }

  /**
   * 의자 그림 (witch-chair · gona-chair-cry — 사용자 시안에서 정리) · 고나 자리에 대신 나옴 (그동안 고나 그림은 숨김)
   *   appear: 의자가 뿅(0 반짝 → 1·2 흔들림) → 고나가 앉음(울음 시트 0) · cry: 연타마다 울기(1)/몸부림(2) 번갈아 + 흔들림
   *   hold: 숟가락 경고 — 울며 덜덜 · charge: 꾸욱 누르는 중(크게 울며 몸부림 · 빠르게 떨림) · break: 의자를 부수고 탈출(3) · fail: 억지로 한 입 → 빠져나옴(3)
   */
  private chairArt: Phaser.GameObjects.Sprite | null = null;

  private showChairArt(step: 'appear' | 'cry' | 'hold' | 'charge' | 'break' | 'fail' | 'off', n = 0): void {
    if (!this.host.scene.textures.exists('gona-chair-cry')) return; // (개발 메뉴 흐름 미리보기 · 그림이 없을 때)
    const scene = this.host.scene;
    const S = WitchBattle.SCALE;
    const foot = this.host.playerFoot?.() ?? { x: this.host.basePlayerX, y: this.host.groundY };
    let a = this.chairArt;
    if (step === 'appear') {
      a?.destroy();
      a = this.chairArt = scene.add.sprite(foot.x, foot.y + 1, 'witch-chair', 0).setOrigin(0.5, 1).setDepth(10.3).setScale(0);
      sound.puff();
      scene.tweens.add({ targets: a, scale: S, duration: 260, ease: 'Back.Out' });
      this.after(0.2, () => this.chairArt?.texture.key === 'witch-chair' && this.chairArt.setFrame(1));
      this.after(0.3, () => this.chairArt?.texture.key === 'witch-chair' && this.chairArt.setFrame(2));
      // 고나가 의자에 붙잡혀 앉음
      this.after(0.4, () => {
        if (!this.chairArt) return;
        this.host.setPlayerHidden?.(true);
        this.chairArt.setTexture('gona-chair-cry', 0);
        sound.nestJump();
      });
      return;
    }
    if (!a) return;
    if (step === 'off') {
      scene.tweens.killTweensOf(a);
      a.destroy();
      this.chairArt = null;
      this.host.setPlayerHidden?.(false);
      return;
    }
    if (a.texture.key !== 'gona-chair-cry') {
      this.host.setPlayerHidden?.(true);
      a.setTexture('gona-chair-cry', 0).setScale(S);
    }
    scene.tweens.killTweensOf(a);
    a.setAngle(0).setX(foot.x);
    if (step === 'cry') {
      // 연타마다 울기 ↔ 몸부림 + 좌우로 흔들
      a.setFrame(n % 2 ? 1 : 2);
      scene.tweens.add({ targets: a, x: foot.x + (n % 2 ? -1.5 : 1.5), duration: 60, yoyo: true });
    } else if (step === 'hold' || step === 'charge') {
      a.setFrame(step === 'charge' ? 2 : 1);
      scene.tweens.add({ targets: a, angle: { from: -2.5, to: 2.5 }, duration: step === 'charge' ? 50 : 110, yoyo: true, repeat: -1 });
    } else if (step === 'break' || step === 'fail') {
      // 의자를 부수고 탈출 (실패: 억지로 한 입 먹고 겨우 빠져나옴)
      a.setFrame(step === 'break' ? 2 : 0);
      this.after(step === 'break' ? 0.12 : 0.55, () => {
        if (!this.chairArt) return;
        this.chairArt.setFrame(3);
        sound.bossHit();
        this.host.scene.cameras.main.shake(140, 0.008);
      });
      this.after(step === 'break' ? 0.75 : 1.1, () => this.showChairArt('off'));
    }
  }

  // ───────── ⑤ 후드리챱챱! (마지막 · 승인 그림: 고나 양손 난타 · 거대한 이유식 덩어리 · 이유식 뒤집어쓴 마녀 · 날아가는 모자 — artReady('chop')) ─────────
  //   '안 돼!! 내 이유식을 거부하다니!!' → 거대한 덩어리 소환 → '챱챱!' 연타(때릴 때마다 덩어리 출렁 · 초록 방울 · 챱/퍽/찰박)
  //   → 60% 마녀 방해 '내 이유식에 무슨 짓이야!!!' → '으아앙!' 꾸욱 = 음파로 밀어냄(실패해도 짧게 다시) → 100% '후드리챱챱!!!' 한 번 → 피니시

  private chopFinale(): void {
    this.lastPhase = 'chop';
    this.busy = true;
    this.moveTo(this.homeX, this.hov(), 0.3);
    this.talk([WITCH_CHOP_LINE], () => {
      sound.rage();
      this.host.scene.cameras.main.shake(300, 0.012);
      this.setPose(5, 0.8);
      this.showChopArt('summon');
      this.banner({ top: '🥣 고나의 대반란!', name: '후드리챱챱!', desc: '「챱챱!」 을 마구 눌러서 이유식을 후드려 패기!', ms: 1600, tone: 'special' });
      this.chopS = { stage: 'mash', gauge: 0, cryEnd: 0, holdAt: -1, interrupted: false, taps: 0, fails: 0 };
      this.telegraph = { kind: 'last', x: this.host.basePlayerX, y: this.host.groundY - 20, r: 0 };
    });
  }

  private chopHit(): void {
    const c = this.chopS;
    if (!c || c.stage !== 'mash') return;
    const K = WITCH.chop;
    c.taps++;
    c.gauge = Math.min(1, c.gauge + K.perTap);
    sound.chop(c.taps);
    haptics.play('monsterHit');
    this.showChopArt('hit', c.taps);
    // 초록 이유식 방울이 튐 (작은 픽셀 효과) — 이유식 덩어리에서
    const scene = this.host.scene;
    const hp = this.chopHitPoint();
    const x = hp.x;
    const y = hp.y;
    for (let i = 0; i < (perf.low ? 2 : 4); i++) {
      const d = this.tmp(scene.add.image(x, y, 'witch-drop').setDepth(11.4));
      scene.tweens.add({ targets: d, x: x + (Math.random() - 0.3) * 40, y: y - 10 - Math.random() * 26, alpha: 0, duration: 380, ease: 'Quad.Out', onComplete: () => d.destroy() });
    }
    if (c.taps % 2 === 0) this.floatText(['챱!', '퍽!', '찰박!'][(c.taps / 2) % 3], x - 6 + (Math.random() - 0.5) * 12, y - 20, '#b8ff7a');
    scene.cameras.main.shake(50, 0.003);
    if (!c.interrupted && c.gauge >= K.interruptAt) this.chopInterrupt();
    else if (c.gauge >= 1) this.chopReady();
  }

  /** 60%: 마녀 방해 — 거대한 숟가락으로 다가옴 → '으아앙!' 꾸욱 */
  private chopInterrupt(): void {
    const c = this.chopS!;
    const K = WITCH.chop;
    c.stage = 'cry';
    c.holdAt = -1;
    c.cryEnd = this.time + K.cryWindow;
    const m = this.mouth();
    sound.rage();
    this.setPose(2, K.cryWindow);
    this.warn(K.cryWindow);
    this.showChopArt('cry');
    this.floatText(WITCH_CHOP_INTERRUPT, this.bx - 40, this.host.groundY - this.balt - this.fh * this.k - 4, '#ff9ad0');
    this.moveTo(Math.min(this.homeX, m.x + 50), this.hov(-6), K.cryWindow * 0.8);
  }

  private chopCry(down: boolean): void {
    const c = this.chopS;
    if (!c || c.stage !== 'cry') return;
    if (down) {
      c.holdAt = this.time;
      sound.cry(0.6);
    } else c.holdAt = -1;
  }

  private chopReady(): void {
    const c = this.chopS!;
    c.stage = 'final';
    this.host.scene.cameras.main.flash(160, 255, 250, 200);
    this.banner({ top: '💥 게이지 가득!', name: '후드리챱챱!!!', desc: '마지막 버튼을 한 번!', ms: 1800, tone: 'special' });
  }

  private chopFinal(): void {
    const c = this.chopS;
    if (!c || c.stage !== 'final') return;
    c.stage = 'finish';
    this.qteLog.push(`chop:win:${c.fails}`);
    const scene = this.host.scene;
    this.showChopArt('rush');
    // 초고속 난타 (0.9초) → 마지막 한 방에 이유식이 마녀 얼굴로
    for (let i = 0; i < 9; i++) {
      this.after(i * 0.1, () => {
        sound.chop(i);
        scene.cameras.main.shake(60, 0.005);
        this.showChopArt('rush', i);
        const hp = this.chopHitPoint();
        for (let j = 0; j < (perf.low ? 2 : 3); j++) {
          const d = this.tmp(scene.add.image(hp.x, hp.y, 'witch-drop').setDepth(11.4));
          scene.tweens.add({ targets: d, x: d.x + (Math.random() - 0.5) * 60, y: d.y - 14 - Math.random() * 30, alpha: 0, duration: 360, onComplete: () => d.destroy() });
        }
      }, true);
    }
    this.after(1.0, () => {
      sound.spit(true);
      scene.cameras.main.shake(260, 0.014);
      this.showChopArt('launch');
      this.setPose(4, 1.2);
    }, true);
    this.after(1.6, () => {
      this.chopS = null;
      this.telegraph = null;
      this.chopped = true;
      this.lastPhase = 'done';
      this.hp = 1;
      this.damage(5);
    }, true);
  }

  private updateChop(_dt: number): void {
    const c = this.chopS;
    if (!c || c.stage !== 'cry') return;
    const K = WITCH.chop;
    if (c.holdAt >= 0 && this.time - c.holdAt >= K.hold) {
      // 울음 음파로 밀어냄 → 기절 → 다시 난타
      c.stage = 'mash';
      c.interrupted = true;
      c.holdAt = -1;
      this.soundWave(1, true);
      sound.cry(1);
      this.host.scene.cameras.main.shake(200, 0.01);
      this.qteLog.push('chop:cry:ok');
      this.showChopArt('resume');
      this.after(0.3, () => {
        this.moveTo(this.homeX, this.hov(), 0.35);
        this.setPose(4, 1.4);
        this.floatText('으악!', this.bx, this.host.groundY - this.balt - this.fh * this.k, '#e2b8ff');
        this.banner({ top: '😭 으아앙!', name: '마녀가 날아갔어요!', desc: '다시 「챱챱!」', ms: 1100, tone: 'good' });
      }, true);
      return;
    }
    if (this.time >= c.cryEnd) {
      // 실패: 작은 피해 → 잠깐 뒤 다시 방해 (게임 오버 없음)
      c.fails++;
      c.holdAt = -1;
      this.qteLog.push('chop:cry:fail');
      this.host.hurtPlayer(this.dmg(K.cryHurt), 'witch-chop');
      this.banner({ top: '🥄 앗!', name: '숟가락에 맞았어요', desc: '이번엔 「으아앙!」 을 꾸욱 길게!', ms: 1100, tone: 'aim' });
      c.cryEnd = this.time + K.retry + K.cryWindow;
    }
  }

  /**
   * 후드리챱챱 그림 (gona-chop · giant-goo · witch-goo-face · witch-hat — 사용자 시안에서 정리)
   *   summon: 거대한 이유식 덩어리가 고나 앞에 쿵 · 고나는 난타 자세(0)로 (원래 고나 그림은 숨김)
   *   hit: 챱챱! 누를 때마다 주먹(1·2 번갈아) → 덩어리가 움푹(1)·크게 찌그러짐(2) + 출렁 · 60% 넘으면 덩어리가 움푹 들어간 채
   *   cry: 마녀 방해 — 고나 준비 자세로 덜덜 (방해 때 우는 전용 그림은 시안에 없음) · resume: 다시 난타
   *   rush: 초고속 난타 · launch: 크게 휘두르기(3) → 덩어리가 마녀 얼굴로 날아감 → 이유식 뒤집어쓴 마녀 · 모자가 빙글빙글 날아감
   */
  private chopArt: { gona: Phaser.GameObjects.Sprite; goo: Phaser.GameObjects.Sprite; back: number } | null = null;
  /** 이유식 뒤집어쓴 마녀 (패배 연출 동안 마녀 그림 대신 · 마녀 위치·기울기·투명도를 그대로 따라감) */
  private gooFace: Phaser.GameObjects.Sprite | null = null;
  private gooHat: Phaser.GameObjects.Sprite | null = null;

  /** 이유식 덩어리 맞는 자리 (방울이 튀는 곳) */
  private chopHitPoint(): { x: number; y: number } {
    const g = this.chopArt?.goo;
    if (g) return { x: g.x - g.displayWidth * 0.3, y: g.y - g.displayHeight * 0.5 };
    const m = this.mouth();
    return { x: m.x + 16, y: this.host.groundY - 14 };
  }

  private showChopArt(step: 'summon' | 'hit' | 'cry' | 'resume' | 'rush' | 'launch' | 'off', n = 0): void {
    const scene = this.host.scene;
    if (!scene.textures.exists('gona-chop')) return; // (그림이 없을 때 — 흐름만)
    const S = WitchBattle.SCALE;
    const foot = this.host.playerFoot?.() ?? { x: this.host.basePlayerX, y: this.host.groundY };
    const art = this.chopArt;
    if (step === 'summon') {
      this.showChopArt('off');
      this.host.setPlayerHidden?.(true);
      const gona = scene.add.sprite(foot.x, foot.y + 1, 'gona-chop', 0).setOrigin(0.5, 1).setDepth(10.2).setScale(S);
      // 덩어리: 고나 주먹이 닿는 바로 앞 (왼쪽 끝이 고나 몸 앞)
      const gx = foot.x + 24 + (WITCH_EXTRA_SHEETS['giant-goo'].fw * S) / 2;
      const goo = scene.add.sprite(gx, foot.y - 70, 'giant-goo', 0).setOrigin(0.5, 1).setDepth(10.1).setScale(S);
      scene.tweens.add({
        targets: goo,
        y: foot.y + 1,
        duration: 360,
        ease: 'Bounce.Out',
        onComplete: () => {
          sound.splat();
          scene.cameras.main.shake(160, 0.008);
        },
      });
      this.chopArt = { gona, goo, back: 0 };
      return;
    }
    if (step === 'off') {
      if (art) {
        scene.tweens.killTweensOf([art.gona, art.goo]);
        art.gona.destroy();
        art.goo.destroy();
        this.chopArt = null;
      }
      this.host.setPlayerHidden?.(false);
      return;
    }
    if (!art) return;
    const dentedNow = (): boolean => !!this.chopS && this.chopS.gauge >= WITCH.chop.interruptAt;
    scene.tweens.killTweensOf(art.gona);
    art.gona.setAngle(0).setX(foot.x);
    if (step === 'hit' || step === 'rush') {
      // 주먹 → 덩어리가 맞은 만큼 찌그러졌다가 출렁 (타격과 같은 순간)
      art.gona.setFrame(n % 2 ? 1 : 2);
      art.goo.setFrame(step === 'rush' || dentedNow() ? 2 : 1);
      scene.tweens.killTweensOf(art.goo);
      art.goo.setScale(S * 1.08, S * 0.86);
      scene.tweens.add({ targets: art.goo, scaleX: S, scaleY: S, duration: 140, ease: 'Back.Out' });
      const id = ++art.back;
      this.after(
        0.13,
        () => {
          if (this.chopArt !== art || art.back !== id) return;
          if (this.chopS?.stage === 'mash' || this.chopS?.stage === 'final') art.gona.setFrame(0);
          if (this.chopS?.stage !== 'finish') art.goo.setFrame(dentedNow() ? 1 : 0);
        },
        true,
      );
    } else if (step === 'cry') {
      art.gona.setFrame(0);
      scene.tweens.add({ targets: art.gona, angle: { from: -3, to: 3 }, duration: 70, yoyo: true, repeat: -1 });
    } else if (step === 'resume') {
      art.gona.setFrame(0);
      art.goo.setFrame(dentedNow() ? 1 : 0);
    } else if (step === 'launch') {
      // 마지막 한 방: 크게 휘두르기 → 덩어리가 마녀 얼굴로 휙
      art.gona.setFrame(3);
      const goo = art.goo;
      const f = this.face();
      scene.tweens.killTweensOf(goo);
      goo.setFrame(2);
      scene.tweens.add({
        targets: goo,
        x: f.x,
        y: f.y + goo.displayHeight * 0.5,
        angle: -200,
        scale: S * 0.7,
        duration: 360,
        ease: 'Quad.In',
        onComplete: () => {
          goo.setVisible(false);
          this.faceSplat(true);
          this.coverWitch();
        },
      });
      this.after(
        0.7,
        () => {
          // 고나는 원래 모습으로 (에퉤!)
          if (this.chopArt === art) {
            art.gona.destroy();
            art.goo.destroy();
            this.chopArt = null;
          }
          this.host.setPlayerHidden?.(false);
        },
        true,
      );
    }
  }

  /** 이유식을 뒤집어쓴 마녀 · 모자가 빙글빙글 날아감 */
  private coverWitch(): void {
    const scene = this.host.scene;
    const S = WitchBattle.SCALE;
    this.gooFace?.destroy();
    this.gooFace = scene.add.sprite(this.boss.x, this.boss.y, 'witch-goo-face', 0).setOrigin(0.5, 1).setDepth(this.boss.depth + 0.01).setScale(S);
    this.boss.setVisible(false);
    // 모자: 머리 위에서 튕겨 올라 빙글빙글 → 바닥에 툭
    const top = this.host.groundY - this.balt - this.fh * this.k;
    this.gooHat?.destroy();
    const hat = (this.gooHat = scene.add.sprite(this.bx, top + 4, 'witch-hat', 1).setDepth(this.boss.depth + 0.02).setScale(S));
    const x1 = Math.min(this.host.W - 12, this.bx + 30);
    scene.tweens.add({ targets: hat, x: x1, duration: 1100, ease: 'Linear' });
    scene.tweens.add({
      targets: hat,
      y: { from: top + 4, to: top - 26 },
      duration: 420,
      ease: 'Quad.Out',
      onComplete: () =>
        scene.tweens.add({
          targets: hat,
          y: this.host.groundY - 2,
          duration: 680,
          ease: 'Bounce.Out',
          onComplete: () => {
            hat.setFrame(4).setAngle(0);
            // (마녀 그림에도 모자가 그려져 있어 오래 두 개로 보이지 않게 — 떨어진 모자는 곧 사라짐)
            scene.tweens.add({ targets: hat, alpha: 0, delay: 500, duration: 400 });
          },
        }),
    });
    scene.tweens.add({ targets: hat, angle: 720, duration: 1000, ease: 'Linear', onUpdate: (tw) => hat.setFrame(1 + (Math.floor(tw.progress * 6) % 3)) });
  }

  /** 이유식 뒤집어쓴 마녀가 마녀 그림(숨김)의 위치·기울기·투명도를 따라감 · 쓰러지면 쓰러진 그림 */
  private followGooFace(): void {
    const g = this.gooFace;
    if (!g) return;
    const b = this.boss;
    const fallen = this.mode === 'victory' && this.stunT > 50;
    const r = this.restScale || WitchBattle.SCALE;
    g.setPosition(b.x, b.y).setAngle(fallen ? 0 : b.angle).setAlpha(b.alpha);
    g.setScale((WitchBattle.SCALE * b.scaleX) / r, (WitchBattle.SCALE * b.scaleY) / r);
    g.setFrame(fallen ? 2 : Math.floor(this.time * 3) % 2);
    if (b.visible) b.setVisible(false);
  }


  private clearMinigames(): void {
    this.parryS?.s.destroy();
    this.parryS = null;
    this.reflectS?.s.destroy();
    this.reflectS = null;
    this.rhythmS = null;
    this.qtePending = false;
    if (this.chairArt) this.showChairArt('off');
    if (this.chopArt) this.showChopArt('off');
    this.chairS = null;
    this.chopS = null;
    this.faceGoo?.s.destroy();
    this.faceGoo = null;
  }

  // ───────────────────────── 매 프레임 ─────────────────────────

  protected onUpdate(dt: number): void {
    if (this.weakT > 0) this.weakT -= dt;
    if (this.stunBonus && this.mode !== 'cutscene') this.stunBonus = false;
    this.updateBouncers();
    this.updateBoomer(dt);
    this.updateParry();
    this.updateReflect();
    this.updateRhythm();
    this.updateChair(dt);
    this.updateChop(dt);
    if (this.faceGoo) {
      // 얼굴에 붙은 이유식: 마녀를 따라다니다 흘러내림
      const f = this.face();
      this.faceGoo.t -= dt;
      this.faceGoo.s.setPosition(f.x, f.y + Math.max(0, 0.6 - this.faceGoo.t) * 8).setAlpha(Math.min(1, this.faceGoo.t * 2));
      if (this.faceGoo.t <= 0) {
        this.faceGoo.s.destroy();
        this.faceGoo = null;
      }
    }
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
    this.clearMinigames();
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
    this.clearMinigames();
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
  /** (테스트) 이번 페이즈 필수 상호작용을 이미 본 것으로 (페이즈 건너뛰기 테스트용) */
  debugMustDone(): void {
    for (const a of WITCH.mustShow[this.phaseIdx] ?? []) this.phaseSeen.add(a);
  }

  debugPhase(p: 2 | 3): void {
    this.debugSkipIntro();
    if (p === 3) {
      // 2페이즈는 이미 지난 것으로 (대사 없이 모습만)
      this.rage = 1;
      this.applyTint();
    }
    this.debugMustDone();
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

  /** (테스트) 이유식 의자 탈출 바로 (2 · 3페이즈 강화형) — 그림이 없어도 흐름 확인용 */
  debugChair(p: 2 | 3): void {
    this.debugForceArt = true;
    this.rage = (p - 1) as 1 | 2;
    this.applyTint();
    this.debugAttack('chair');
  }

  /** (테스트) 후드리챱챱 바로: mash = 처음부터(대사 포함) · cry = 60% 마녀 방해부터 · final = 게이지 가득(마지막 버튼) */
  debugChop(from: 'mash' | 'cry' | 'final'): void {
    this.debugSkipIntro();
    this.debugForceArt = true;
    this.debugHold = true;
    this.rage = 2;
    this.applyTint();
    this.debugMustDone();
    this.hp = Math.max(1, Math.floor(this.def.maxHp * WITCH.last.at) - 1);
    this.busy = true;
    this.cooldown = 99;
    if (from === 'mash') {
      this.attackLog.push('chop#test');
      this.chopFinale();
      return;
    }
    this.lastPhase = 'chop';
    this.lastTalked = true;
    this.chopS = { stage: 'mash', gauge: from === 'cry' ? WITCH.chop.interruptAt - 0.01 : 0.99, cryEnd: 0, holdAt: -1, interrupted: from === 'final', taps: 0, fails: 0 };
    this.chopHit();
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
    this.debugMustDone();
    this.hp = Math.max(1, Math.floor(this.def.maxHp * WITCH.last.at) - 1);
    this.debugHold = false;
    this.busy = false;
    this.cooldown = 0.3;
  }

  // ───────────────────────── 패배 ─────────────────────────

  protected defeatLines(): string[] {
    if (this.chopped) {
      // 후드리챱챱으로 끝: 마지막 대사 → 고나 '에퉤!'
      bus.once(EV.bossTalkDone, () => {
        const h = this.host.playerHead();
        this.floatText('에퉤!', h.x - 6, h.y - 18, '#b8ff7a');
        sound.spit(false);
      });
      return [WITCH_CHOP_DEFEAT];
    }
    return WITCH_DEFEAT_LINES;
  }

  /** 비틀 → 숟가락을 떨어뜨림 → 날개가 축 · 모자가 삐뚤 · 작은 드래곤 모습으로 주저앉음 */
  protected onDefeat(): void {
    const scene = this.host.scene;
    // 작아지며 비틀 → 고개 숙이고 기울어진 채 주저앉음 (날개·모자 처짐은 기울기와 눌림으로)
    this.boss.setScale(WitchBattle.SCALE);
    scene.tweens.add({ targets: this.boss, angle: { from: -14, to: 10 }, duration: 160, yoyo: true, repeat: 2, onComplete: () => this.boss.setAngle(-9) });
    scene.tweens.add({ targets: this.boss, scaleY: 1, duration: 420, delay: 500, ease: 'Bounce.Out' }); // 1.0 = 도트 1칸 5픽셀 (선명)
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
