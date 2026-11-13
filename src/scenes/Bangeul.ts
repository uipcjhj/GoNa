/**
 * 방글할매 스페셜 — GONA 글자 쿠키 4개를 모으면 플레이어가 원하는 때 소환하는 조력자 필살기
 *   일반 간식 사이에 G·O·N·A 글자 쿠키가 가끔 (아직 없는 글자가 더 잘 나옴 · 중복·놓쳐도 모은 글자는 그대로)
 *   → 네 글자 완성 → '방글할매 소환!' 버튼 → 등장(반짝) → 웃음 → 노래(음파 3번: 화면 몬스터 처치 · 보스 큰 피해+휘청)
 *   → 고나 5초 무적(황금 보호막 · 남은 시간) → 손 흔들며 퇴장 · 모은 글자는 다시 0
 * 그림: 사용자 시트에서 잘라 정리 (tools/art/bangeul_from_sheet.py → public/assets/bangeul) · 코드로 새로 그린 캐릭터 없음
 * 시간은 게임 update 의 dt 로만 진행 (일시정지하면 연출·무적이 같이 멈춤)
 * 음성(웃음·노래) 파일은 아직 없음 — 사람 목소리를 임의로 만들지 않고 글자·화면 효과로만 (음파 타격음만 효과음)
 */
import Phaser from 'phaser';
import { sound } from '../audio';
import { perf } from '../perf';
import type { BannerInfo } from '../events';

export type Letter = 'g' | 'o' | 'n' | 'a';
export const LETTERS: Letter[] = ['g', 'o', 'n', 'a'];

export const BANGEUL = {
  /** 글자 쿠키: 첫 등장(초) · 그다음 간격 [최소, 최대] · 아직 없는 글자가 나올 확률 */
  firstSpawn: 7,
  gap: [9, 13] as [number, number],
  missingChance: 0.8,
  /** 고나 무적(초) */
  invSec: 5,
  /** 음파 횟수 · 간격 */
  pulses: 3,
  pulseGap: 0.5,
  /** 보스 피해 (음파 3번 합계 · 보스 HP 에 맞춰 — 뽀뽀 42 · 킁카 196 · 마녀 200). 마녀는 페이즈 문턱(필수 이벤트) 규칙 그대로 */
  bossDamage: { kiss: 9, sniff: 30, witch: 30 } as Record<string, number>,
  /** 화면 표시 배율 (도트 1칸 = 정수 픽셀: 1.2 × 5) */
  scale: 1.2,
};

/** 시트 (public/assets/bangeul) — 캐릭터 칸 64×58 (몸은 48×45 · 웃음 !!·음표가 잘리지 않게 여유) */
export const BANGEUL_SHEETS: Record<string, { url: string; fw: number; fh: number }> = {
  'bangeul-idle': { url: 'assets/bangeul/bangeul-idle.png', fw: 64, fh: 58 },
  'bangeul-laugh': { url: 'assets/bangeul/bangeul-laugh.png', fw: 64, fh: 58 },
  'bangeul-song': { url: 'assets/bangeul/bangeul-song.png', fw: 64, fh: 58 },
  'bangeul-appear': { url: 'assets/bangeul/bangeul-appear.png', fw: 64, fh: 58 },
  'bangeul-exit': { url: 'assets/bangeul/bangeul-exit.png', fw: 64, fh: 58 },
  'bangeul-wave': { url: 'assets/bangeul/bangeul-wave.png', fw: 51, fh: 55 },
  'bangeul-shield': { url: 'assets/bangeul/bangeul-shield.png', fw: 59, fh: 44 },
};
/** 게임 안 글자 쿠키 (20×20) · HUD 는 32×32 (DOM) */
export const COOKIE_TEX = (l: Letter): string => `gona-cookie-${l}-s`;
export const COOKIE_URL = (l: Letter, small = false): string => `assets/bangeul/gona-cookie-${l}${small ? '-s' : ''}.png`;

export interface BangeulHost {
  readonly scene: Phaser.Scene;
  readonly W: number;
  readonly groundY: number;
  /** 고나 발밑 가운데 · 키 */
  playerFoot(): { x: number; y: number; h: number };
  /** 글자 쿠키를 화면 오른쪽 끝에 (바위 근처면 false → 잠깐 뒤 다시) */
  spawnLetter(l: Letter): boolean;
  /** 음파 한 번: 화면 안 일반 몬스터 처치 · 몬스터 투사체 정리 → 맞힌 수 */
  waveMonsters(): number;
  /** 보스에게 피해 (보스전이 아니면 false) */
  waveBoss(dmg: number): boolean;
  /** 지금 보스 (없으면 null) */
  bossId(): string | null;
  banner(b: BannerInfo): void;
  floatText(t: string, x: number, y: number, color: string): void;
  sparkle(n: number, x: number, y: number): void;
  /** 고나가 반기는 작은 반응 (기존 그림 그대로 · 통통·표정) */
  gonaCheer(): void;
  /** 소환 상태가 바뀜 (HUD) */
  changed(): void;
}

type Step = 'appear' | 'laugh' | 'song' | 'exit';

export class BangeulSpecial {
  readonly letters = new Set<Letter>();
  /** 소환 연출 진행 (null = 없음) */
  private run: { t: number; step: Step; spr: Phaser.GameObjects.Sprite; pulses: number; waves: Phaser.GameObjects.Sprite[] } | null = null;
  /** 남은 무적(초) */
  invT = 0;
  private shield: Phaser.GameObjects.Sprite | null = null;
  private invText: Phaser.GameObjects.Text | null = null;
  private spawnT = BANGEUL.firstSpawn;
  /** (검증용) 기록 */
  readonly log: string[] = [];
  /** (개발 메뉴) 글자 쿠키를 더 자주 */
  fastSpawn = false;

  constructor(private host: BangeulHost) {}

  get ready(): boolean {
    return this.letters.size === LETTERS.length;
  }

  get active(): boolean {
    return !!this.run;
  }

  get invincible(): boolean {
    return this.invT > 0;
  }

  /** HUD 용 글자 문자열 (모은 글자만, GONA 순서) */
  get lettersKey(): string {
    return LETTERS.filter((l) => this.letters.has(l)).join('');
  }

  /** 다음에 나올 글자: 아직 없는 글자 쪽으로 기울여서 */
  pickLetter(): Letter {
    const missing = LETTERS.filter((l) => !this.letters.has(l));
    if (missing.length && Math.random() < BANGEUL.missingChance) return missing[Math.floor(Math.random() * missing.length)];
    return LETTERS[Math.floor(Math.random() * LETTERS.length)];
  }

  collect(l: Letter, x: number, y: number): void {
    const had = this.letters.has(l);
    this.letters.add(l);
    this.log.push(`get:${l}${had ? ':dup' : ''}`);
    sound.pickup(had ? 20 : 50);
    this.host.sparkle(perf.low ? 4 : 8, x, y);
    this.host.floatText(l.toUpperCase() + (had ? '' : '!'), x, y - 10, ['#ff8fb8', '#ffc94a', '#8fe36a', '#7fc8ff'][LETTERS.indexOf(l)]);
    if (!had && this.ready) {
      this.host.banner({ top: '✨ GONA 완성! ✨', name: '방글할매 소환 가능!', desc: '원할 때 「방글할매 소환!」 버튼', ms: 1800, tone: 'special' });
      sound.reflect();
    }
    this.host.changed();
  }

  /** 매 프레임 (일시정지 땐 불리지 않음) · canSpawn = 일반 달리기 중 */
  update(dt: number, canSpawn: boolean): void {
    if (canSpawn && !this.run) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        const l = this.pickLetter();
        if (this.host.spawnLetter(l)) {
          const [a, b] = BANGEUL.gap;
          this.spawnT = (this.fastSpawn ? 0.35 : 1) * (a + Math.random() * (b - a));
          this.log.push(`spawn:${l}`);
        } else this.spawnT = 0.8;
      }
    }
    if (this.invT > 0) {
      this.invT = Math.max(0, this.invT - dt);
      this.updateShield();
      if (this.invT <= 0) this.endShield();
    }
    if (this.run) this.updateRun(dt);
  }

  /** 소환 (버튼) — 성공하면 true · 연출 중 · 미완성이면 무시 */
  summon(): boolean {
    if (this.run || !this.ready) return false;
    const scene = this.host.scene;
    const f = this.host.playerFoot();
    this.letters.clear();
    this.log.push(`summon:${this.host.bossId() ?? 'run'}`);
    this.host.changed();
    // 고나 5초 무적 (다른 무적과 겹쳐도 더 짧게 줄이지 않음 — 남은 시간이 더 길면 그대로)
    this.invT = Math.max(this.invT, BANGEUL.invSec);
    this.startShield();
    // 방글할매: 고나 앞(오른쪽)에 반짝이며 등장 — 노래가 몬스터 쪽으로
    const x = Math.min(this.host.W - 22, f.x + 34);
    const spr = scene.add.sprite(x, this.host.groundY + 1, 'bangeul-appear', 0).setOrigin(0.5, 1).setDepth(10.4).setScale(BANGEUL.scale);
    this.run = { t: 0, step: 'appear', spr, pulses: 0, waves: [] };
    sound.reflect();
    this.host.sparkle(perf.low ? 6 : 12, x, this.host.groundY - 20);
    this.host.banner({ top: '✨ 방글할매 등장! ✨', name: '방글할매 파워!', desc: '하하하하~♪', ms: 1500, tone: 'special' });
    this.host.gonaCheer();
    return true;
  }

  private updateRun(dt: number): void {
    const r = this.run!;
    r.t += dt;
    const s = r.spr;
    // 1 등장 0~0.6 · 2 웃음 0.6~1.7 · 3 노래 1.7~3.4 (음파 3번) · 4 퇴장 3.4~4.0
    if (r.t < 0.6) {
      s.setTexture('bangeul-appear', Math.min(3, Math.floor((r.t / 0.6) * 4)));
    } else if (r.t < 1.7) {
      if (r.step !== 'laugh') {
        r.step = 'laugh';
        this.host.floatText('아하하하하하!!!', s.x - 10, s.y - s.displayHeight - 2, '#ffe14a');
      }
      s.setTexture('bangeul-laugh', Math.floor(r.t * 8) % 4);
      s.y = this.host.groundY + 1 - (Math.floor(r.t * 8) % 2); // 웃음에 몸이 들썩
    } else if (r.t < 3.4) {
      if (r.step !== 'song') {
        r.step = 'song';
        s.y = this.host.groundY + 1;
      }
      s.setTexture('bangeul-song', Math.floor(r.t * 6) % 4);
      // 음파 3번
      const due = Math.min(BANGEUL.pulses, Math.floor((r.t - 1.75) / BANGEUL.pulseGap) + 1);
      while (r.pulses < due) this.pulse(r);
    } else if (r.t < 4.0) {
      if (r.step !== 'exit') {
        r.step = 'exit';
        this.host.floatText('또 보자~ 하하!', s.x - 8, s.y - s.displayHeight - 2, '#ffe14a');
      }
      s.setTexture('bangeul-exit', Math.min(3, Math.floor(((r.t - 3.4) / 0.6) * 4)));
    } else {
      this.host.sparkle(perf.low ? 4 : 8, s.x, this.host.groundY - 20);
      this.finishRun();
      return;
    }
    // 음파 그림: 오른쪽으로 퍼지며 커짐 (최대 3개만)
    for (const w of r.waves) {
      if (!w.active) continue;
      const age = (w.getData('age') as number) + dt;
      w.setData('age', age);
      w.setFrame(Math.min(3, Math.floor(age * 8)));
      w.x += 90 * dt;
      w.setAlpha(Math.max(0, 1 - age / 0.75));
      if (age > 0.75) w.destroy();
    }
    r.waves = r.waves.filter((w) => w.active);
  }

  /** 노래 음파 한 번: 몬스터 처치 · 보스 피해 · 음표 */
  private pulse(r: NonNullable<BangeulSpecial['run']>): void {
    r.pulses++;
    const scene = this.host.scene;
    const s = r.spr;
    const y = s.y - s.displayHeight * 0.55;
    const w = scene.add.sprite(s.x + 14, y, 'bangeul-wave', 0).setDepth(10.5).setScale(BANGEUL.scale).setOrigin(0.2, 0.5);
    w.setData('age', 0);
    r.waves.push(w);
    sound.bangeulWave(r.pulses);
    scene.cameras.main.shake(90, 0.004);
    this.host.floatText(r.pulses % 2 ? '♪' : '♫', s.x + 8 + r.pulses * 6, y - 8 - r.pulses * 3, '#ffe14a');
    const n = this.host.waveMonsters();
    const id = this.host.bossId();
    let boss = false;
    if (id) {
      const total = BANGEUL.bossDamage[id] ?? 20;
      const per = Math.floor(total / BANGEUL.pulses) + (r.pulses === BANGEUL.pulses ? total % BANGEUL.pulses : 0);
      boss = this.host.waveBoss(per);
    }
    this.log.push(`wave:${r.pulses}:mon${n}${boss ? ':boss' : ''}`);
  }

  private finishRun(): void {
    const r = this.run;
    if (!r) return;
    r.spr.destroy();
    for (const w of r.waves) w.destroy();
    this.run = null;
    this.log.push('exit');
    this.host.changed();
  }

  private startShield(): void {
    const scene = this.host.scene;
    if (!this.shield) {
      this.shield = scene.add.sprite(0, 0, 'bangeul-shield', 0).setOrigin(0.5, 1).setDepth(10.6).setScale(BANGEUL.scale).setAlpha(0.85);
      this.invText = scene.add.text(0, 0, '', { fontFamily: 'Galmuri11, monospace', fontSize: '8px', color: '#fff3a0', stroke: '#5a3a08', strokeThickness: 2, resolution: 5 }).setOrigin(0.5, 1).setDepth(10.7);
    }
    this.updateShield();
  }

  private updateShield(): void {
    const sh = this.shield;
    if (!sh) return;
    const f = this.host.playerFoot();
    // 보호막: 고나를 감쌈 (보호막 시트의 가운데 원 · 반짝이는 프레임 순환)
    sh.setPosition(f.x, f.y + 4).setFrame(Math.floor(this.invT * 8) % 4);
    sh.setAlpha(this.invT < 1 ? 0.4 + 0.45 * (Math.floor(this.invT * 10) % 2) : 0.85); // 끝나기 1초 전 깜빡
    this.invText?.setPosition(f.x, f.y - f.h - 6).setText(`무적 ${Math.ceil(this.invT)}`);
  }

  private endShield(): void {
    this.shield?.destroy();
    this.shield = null;
    this.invText?.destroy();
    this.invText = null;
    this.log.push('inv-end');
  }

  /** 다시하기·게임 오버·씬 정리 */
  destroy(): void {
    this.finishRun();
    this.endShield();
    this.invT = 0;
  }
}
