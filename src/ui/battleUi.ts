/**
 * 보스전 조작 버튼 + 체력 표시 + 큰 안내 (DOM — 한글이 선명하고 터치 영역을 크게 잡기 쉬움).
 *
 * 보스전:  위 왼쪽 [고나 하트 + HP]   위 오른쪽 [보스 이름 + 체력]
 *          왼쪽 아래 [방패]   오른쪽 아래 [필살] [공격(크게)]   화면 빈 곳 터치 = 점프 (main.ts)
 * 평소 달리기(3단계~): 오른쪽 아래 [공격]만
 *
 * 멀티터치: 버튼마다 pointerdown 에서 바로 실행하고 그 손가락(pointerId)을 setPointerCapture 로 붙잡음 →
 *   화면 터치 점프(다른 손가락)와 서로 취소되지 않고, 손가락이 버튼 밖으로 나가도 떼는 순간 상태가 정리됨.
 *   버튼 위 터치는 main.ts 에서 점프로 처리하지 않음 (중복 입력 방지).
 */
import { bus, EV, type BannerInfo, type CombatHud } from '../events';
import { mapToCanvas } from '../art/PixelCanvas';
import { heartCanvas } from '../art/textures';
import { perf } from '../perf';
import { el, pixelImg } from './dom';

const PAL = { k: '#4a2a14', b: '#9a6238', w: '#d79a62', d: '#6e4024', y: '#ffd84a', c: '#8fe3ff', l: '#e6fbff', s: '#4fb6e8', t: '#e8c79a', g: '#7ccf4a', L: '#b8f07a', K: '#24401a', e: '#24401a', p: '#ff9fb0', W: '#ffffff', m: '#a8e070' };
/** 공격 = 고나 머리카락 부메랑: 갈색 머리카락 한 가닥이 C자로 휜 모양 (위 끝은 가늘고 밝게, 아래 끝은 두툼하게 — 비대칭) + 도는 잔상 */
const HAIR_ICON = [
  '......kkkk....',
  '....kkbwwbk...',
  '...kbbwwbk....',
  '..kbbbkkk.....',
  '.kbbbk.....t..',
  '.kbbk.....t...',
  'kbbbk.........',
  'kbbbk....tt...',
  'kbbbk.........',
  '.kbbdk....t...',
  '.kdbbdkk...t..',
  '..kddbbbkkk...',
  '...kkddddbbk..',
  '.....kkkkkkk..',
];
/** 두바이 똥냄새 공격: 초록 울룩불룩 아기 똥 + 냄새 점 */
const DUBAI_ICON = ['.m..kk..m..', 'm..kLgk...m', '...kgggk.m.', '..kkkkkkk..', '.kLggggdk..', 'kgWegWegdk.', 'kkkkkkkkkk.', 'kLgpggpgdk.', 'kggggggddk.', '.kkkkkkkk..'];
const STAR_ICON = ['....k....', '...kyk...', '...kyk...', 'kkkkyykkk', 'kyyyyyyyk', '.kyyyyyk.', '..kyyyk..', '.kyykyyk.', 'kyyk.kyyk', 'kkk...kkk'];
const SHIELD_ICON = ['kkkkkkkkk', 'klllcccck', 'klccccssk', 'klccccssk', 'klccccssk', '.kcccssk.', '.kcccssk.', '..kccsk..', '...kck...', '....k....'];

type Btn = HTMLButtonElement;

export class BattleUi {
  private pad: HTMLDivElement;
  private shieldBtn: Btn;
  private shieldCool: HTMLDivElement;
  private shieldLabel: HTMLSpanElement;
  private atk: Btn;
  private sp: Btn;
  private sp2: Btn;
  private sp2Fill: HTMLDivElement;
  private sp2Label: HTMLSpanElement;
  /** 킁카괴물 강력한 흡입 때만 화면 가운데에 나오는 큰 '버티기!' 버튼 */
  private resistBtn: Btn;
  private atkCool: HTMLDivElement;
  private atkLabel: HTMLSpanElement;
  private spFill: HTMLDivElement;
  private spLabel: HTMLSpanElement;
  private top: HTMLDivElement;
  private me: HTMLDivElement;
  private playerHearts: HTMLImageElement[] = [];
  private playerHp: HTMLDivElement;
  private playerHpText: HTMLSpanElement;
  private growRow: HTMLDivElement;
  private scoreEl: HTMLDivElement;
  private lastScore = -1;
  private growFill: HTMLDivElement;
  private growText: HTMLSpanElement;
  private bossBar: HTMLDivElement;
  private bossName: HTMLSpanElement;
  private bossPhase: HTMLSpanElement;
  private bossHp: HTMLDivElement;
  private banner: HTMLDivElement;
  private resistBox: HTMLDivElement;
  private aimBox: HTMLDivElement;
  private aimGood: HTMLDivElement;
  private aimPerfect: HTMLDivElement;
  private aimCursor: HTMLDivElement;
  private aimJudgeEl: HTMLDivElement;
  private resistFill: HTMLDivElement;
  /** 최종 보스: 이유식 받아치기 '퉤!' · 울음 리듬 '으앙!' 버튼 + 리듬 줄 */
  private spitBtn: HTMLButtonElement;
  private cryBtn: HTMLButtonElement;
  private rhythmBox: HTMLDivElement;
  private rhythmTitle: HTMLParagraphElement;
  private rhythmScore: HTMLSpanElement;
  private rhythmNotes: HTMLDivElement[] = [];
  private bannerTimer = 0;
  private lastHp = -1;
  private lastPlayerHp = -1;
  private hud: CombatHud | null = null;
  private heartSrc = { full: '', empty: '' };

  constructor(root: HTMLElement) {
    this.pad = el('div', 'battle-pad mode-none');
    this.shieldBtn = this.makeBtn('bt-shield', '방패', SHIELD_ICON, 4);
    this.shieldCool = el('div', 'bt-cool');
    this.shieldBtn.querySelector('.bt-face')!.prepend(this.shieldCool);
    this.shieldLabel = this.shieldBtn.querySelector('.bt-label') as HTMLSpanElement;
    this.atk = this.makeBtn('bt-attack', '공격', HAIR_ICON, 5);
    this.atkCool = el('div', 'bt-cool');
    this.atk.querySelector('.bt-face')!.prepend(this.atkCool);
    this.atkLabel = this.atk.querySelector('.bt-label') as HTMLSpanElement;
    this.sp = this.makeBtn('bt-special', '필살', STAR_ICON, 3);
    this.spFill = el('div', 'bt-fill');
    this.sp.querySelector('.bt-face')!.prepend(this.spFill);
    this.spLabel = this.sp.querySelector('.bt-label') as HTMLSpanElement;
    const left = el('div', 'bt-group bt-left');
    left.append(this.shieldBtn);
    this.sp2 = this.makeBtn('bt-special bt-special2', '두바이!', DUBAI_ICON, 3);
    this.sp2Fill = el('div', 'bt-fill');
    this.sp2.querySelector('.bt-face')!.prepend(this.sp2Fill);
    this.sp2Label = this.sp2.querySelector('.bt-label') as HTMLSpanElement;
    const right = el('div', 'bt-group bt-right');
    right.append(this.sp2, this.sp, this.atk);
    this.resistBtn = el('button', 'bt-resist hidden', '버티기!');
    this.resistBtn.type = 'button';
    this.resistBtn.setAttribute('aria-label', '버티기');
    // 최종 보스 미니게임 버튼 (그때만 화면 가운데 아래 — 엄지로 누르기 쉬운 자리)
    this.spitBtn = el('button', 'bt-qte bt-spit hidden', '퉤!') as HTMLButtonElement;
    this.spitBtn.type = 'button';
    this.spitBtn.setAttribute('aria-label', '퉤');
    this.cryBtn = el('button', 'bt-qte bt-cry hidden', '으앙!') as HTMLButtonElement;
    this.cryBtn.type = 'button';
    this.cryBtn.setAttribute('aria-label', '으앙');
    this.pad.append(left, right, this.resistBtn, this.spitBtn, this.cryBtn);

    // 위: 고나 하트 + HP · 보스 체력
    this.top = el('div', 'battle-top hidden');
    this.me = el('div', 'bt-me');
    const hearts = el('div', 'bt-hearts');
    const full = heartCanvas(true);
    const empty = heartCanvas(false);
    this.heartSrc = { full: full.toDataURL(), empty: empty.toDataURL() };
    for (let i = 0; i < 3; i++) {
      const h = pixelImg(full, 3, 'bt-heart');
      this.playerHearts.push(h);
      hearts.append(h);
    }
    this.playerHpText = el('span', 'bt-hp-text', 'HP 100');
    hearts.append(this.playerHpText);
    const track = el('div', 'bt-hp-track');
    this.playerHp = el('div', 'bt-hp-fill');
    track.append(this.playerHp);
    // 성장 게이지 (보스전 중엔 숨김)
    this.growRow = el('div', 'bt-grow');
    this.growText = el('span', 'bt-grow-text', '성장 1/4');
    const gTrack = el('div', 'bt-grow-track');
    this.growFill = el('div', 'bt-grow-fill');
    gTrack.append(this.growFill);
    this.growRow.append(this.growText, gTrack);
    this.me.append(hearts, track, this.growRow);

    this.bossBar = el('div', 'boss-bar');
    const bTop = el('div', 'bb-top');
    this.bossName = el('span', 'bb-name');
    this.bossPhase = el('span', 'bb-phase hidden', '2페이즈');
    bTop.append(this.bossName, this.bossPhase);
    const bTrack = el('div', 'bb-track');
    this.bossHp = el('div', 'bb-hp');
    bTrack.append(this.bossHp);
    this.bossBar.append(bTop, bTrack);
    this.top.append(this.me, this.bossBar);

    this.banner = el('div', 'battle-banner hidden');
    // 버티기 게이지 (킁카괴물 강력한 흡입 때만)
    this.resistBox = el('div', 'resist-box hidden');
    this.resistBox.append(el('p', 'resist-title', '💨 강력한 흡입!'), el('p', 'resist-hint', '버티기 버튼을 연타해서 흡입을 막아!'));
    const rt = el('div', 'resist-track');
    this.resistFill = el('div', 'resist-fill');
    rt.append(this.resistFill, el('span', 'resist-goal'));
    this.resistBox.append(rt);
    // 울음 리듬 배틀: 음표가 오른쪽에서 판정선으로 (톡 = 동그라미 · 꾸욱 = 긴 막대)
    this.rhythmBox = el('div', 'rhythm-box hidden') as HTMLDivElement;
    const rhHead = el('p', 'rhythm-title');
    this.rhythmTitle = el('span', 'rhythm-name', '😭 으아앙! 울음 리듬') as unknown as HTMLParagraphElement;
    this.rhythmScore = el('span', 'rhythm-score', '0/5') as HTMLSpanElement;
    rhHead.append(this.rhythmTitle, this.rhythmScore);
    const rhTrack = el('div', 'rhythm-track');
    rhTrack.append(el('span', 'rhythm-line'));
    for (let i = 0; i < 8; i++) {
      const n = el('div', 'rhythm-note hidden') as HTMLDivElement;
      this.rhythmNotes.push(n);
      rhTrack.append(n);
    }
    this.rhythmBox.append(rhHead, rhTrack, el('p', 'rhythm-hint', '● 톡 = 짧게 · ▬ 꾸욱 = 길게 누르기'));
    // 킁카괴물 코 타이밍 바 (지친 동안만): 커서가 양 끝을 왕복 · 가운데 PERFECT(코) · 주변 GOOD
    this.aimBox = el('div', 'aimbar hidden');
    const at = el('div', 'aimbar-track');
    this.aimGood = el('div', 'aimbar-good');
    this.aimPerfect = el('div', 'aimbar-perfect');
    this.aimPerfect.append(el('span', 'aimbar-nose'));
    this.aimCursor = el('div', 'aimbar-cursor');
    at.append(this.aimGood, this.aimPerfect, this.aimCursor);
    this.aimJudgeEl = el('div', 'aimbar-judge');
    this.aimBox.append(at, this.aimJudgeEl);
    bus.on(EV.aimBar, (b: { show: boolean; pos?: number; perfect?: number; good?: number; paused?: boolean }) => {
      if (!b.show) {
        this.aimBox.classList.add('hidden');
        return;
      }
      if (b.perfect !== undefined && b.good !== undefined) {
        this.aimPerfect.style.left = `${(0.5 - b.perfect) * 100}%`;
        this.aimPerfect.style.width = `${b.perfect * 200}%`;
        this.aimGood.style.left = `${(0.5 - b.good) * 100}%`;
        this.aimGood.style.width = `${b.good * 200}%`;
        this.aimJudgeEl.textContent = '';
        this.aimJudgeEl.className = 'aimbar-judge';
      }
      this.aimBox.classList.remove('hidden');
      this.aimCursor.style.left = `${(b.pos ?? 0) * 100}%`;
      this.aimCursor.classList.toggle('paused', !!b.paused);
    });
    bus.on(EV.aimJudge, (j: 'perfect' | 'good' | 'miss') => {
      this.aimJudgeEl.textContent = j === 'perfect' ? 'PERFECT!' : j === 'good' ? 'GOOD!' : 'MISS';
      this.aimJudgeEl.className = `aimbar-judge ${j}`;
      void this.aimJudgeEl.offsetWidth; // 같은 판정이 연달아 와도 다시 튀어오르게
      this.aimJudgeEl.classList.add('pop');
    });
    // 점수: 화면 위 왼쪽 (오른쪽 위 일시정지·소리 버튼과 겹치지 않게)
    this.scoreEl = el('div', 'hud-score hidden', '점수 0');
    root.append(this.scoreEl, this.top, this.banner, this.resistBox, this.aimBox, this.rhythmBox, this.pad);

    this.bindPress(this.shieldBtn, () => bus.emit(EV.shield));
    this.bindPress(this.atk, () => bus.emit(EV.attack));
    this.bindPress(this.sp, () => bus.emit(EV.special));
    this.bindPress(this.sp2, () => bus.emit(EV.special2));
    // 버티기: 한 번 누를 때마다 한 번 (게임의 방패 입력이 흡입 중엔 버티기로 처리)
    this.bindPress(this.resistBtn, () => bus.emit(EV.shield));
    // 퉤!: 누르는 순간 한 번 · 으앙!: 누름·뗌 둘 다 (톡과 꾸욱 구분)
    this.bindPress(this.spitBtn as Btn, () => bus.emit(EV.qteInput, { btn: 'spit', down: true }));
    this.bindPress(this.cryBtn as Btn, () => bus.emit(EV.qteInput, { btn: 'cry', down: true }), () => bus.emit(EV.qteInput, { btn: 'cry', down: false }));

    bus.on(EV.combatHud, (h: CombatHud) => this.render(h));
    bus.on(EV.banner, (b: BannerInfo) => this.showBanner(b));
    bus.on(EV.start, () => this.hideBanner());
    bus.on(EV.gameOver, () => this.reset());
    bus.on(EV.ending, () => this.reset());
    bus.on(EV.endingStart, () => this.reset());
    // 보스 패배 확정 → 마지막 대사·퇴장 동안 점수·하트·보스 체력바·버튼 숨김 (대화창과 겹치지 않게)
    bus.on(EV.bossDefeat, () => document.body.classList.add('boss-defeat'));
    // 보스 대사(등장·분노 대사) 중엔 버튼을 숨김 — 대화창과 겹치지 않게
    bus.on(EV.bossTalk, () => document.body.classList.add('boss-talking'));
    for (const ev of [EV.bossTalkDone, EV.bossTalkCancel, EV.start, EV.gameOver, EV.endingStart]) bus.on(ev, () => document.body.classList.remove('boss-talking'));
    for (const ev of [EV.bossEnd, EV.start, EV.gameOver, EV.endingStart, EV.bossTalkCancel]) bus.on(ev, () => document.body.classList.remove('boss-defeat'));
  }

  private makeBtn(cls: string, label: string, icon: string[], scale: number): Btn {
    const b = el('button', `bt ${cls}`);
    b.type = 'button';
    b.setAttribute('aria-label', label);
    const face = el('span', 'bt-face');
    face.append(pixelImg(mapToCanvas(icon, PAL), scale, 'bt-icon'), el('span', 'bt-label', label));
    b.append(face);
    return b;
  }

  /** 누르는 즉시 실행 + 손가락별로 따로 추적 (멀티터치) */
  private bindPress(btn: Btn, fire: () => void, onRelease?: () => void): void {
    const active = new Set<number>();
    const release = (e: PointerEvent): void => {
      if (!active.has(e.pointerId)) return;
      active.delete(e.pointerId);
      if (!active.size) {
        btn.classList.remove('pressed');
        onRelease?.();
      }
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        /* 일부 브라우저 */
      }
      active.add(e.pointerId);
      btn.classList.add('pressed');
      // 버튼 표시 상태와 상관없이 게임에 바로 전달 (게임이 판단 — 부메랑이 돌아오기 직전이면 기억했다가 발사)
      perf.time(`btn:${btn.getAttribute('aria-label')}`, fire);
    });
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => e.preventDefault());
  }

  /** 값이 바뀔 때만 DOM 에 씀 */
  private setText(n: HTMLElement, v: string): void {
    if (n.textContent !== v) n.textContent = v;
  }

  private setStyle(n: HTMLElement, k: 'height' | 'width' | 'left', v: string): void {
    if (n.style[k] !== v) n.style[k] = v;
  }

  private render(h: CombatHud): void {
    const prev = this.hud;
    this.hud = h;
    if (prev?.mode !== h.mode) {
      this.pad.className = `battle-pad mode-${h.mode}`;
      document.body.classList.toggle('in-battle', h.mode === 'battle');
      document.body.classList.toggle('has-pad', h.mode !== 'none');
    }
    const off = !h.enabled;
    const resist = h.qte?.kind === 'resist' ? h.qte : null;
    const aim = h.qte?.kind === 'aim';
    /** 조준 안내·조준·결과 · 버티기 동안: 방패·필살 잠금 (조준 중엔 '발사!' 만) */
    const qteLock = !!h.qte;
    // 방패
    this.shieldBtn.classList.toggle('off', off || qteLock || h.shield !== 'ready');
    this.shieldBtn.classList.toggle('active', h.shield === 'active');
    this.setStyle(this.shieldCool, 'height', h.shield === 'cool' ? `${Math.round(h.shieldCool * 100)}%` : '0%');
    this.setText(this.shieldLabel, h.shield === 'active' ? '막는 중!' : h.shield === 'cool' ? '준비 중' : '방패');
    // 버티기: 방패 버튼 대신 화면 가운데 큰 버튼 (흡입 패턴 동안만)
    this.resistBtn.classList.toggle('hidden', !resist);
    this.resistBox.classList.toggle('hidden', !resist);
    if (resist) {
      this.setStyle(this.resistFill, 'width', `${Math.round(resist.gauge * 100)}%`);
      this.resistFill.classList.toggle('low', resist.gauge < 0.25);
    }
    // 최종 보스: 퉤! (이유식이 다가올 때만) · 울음 리듬 (줄 + 으앙! 버튼)
    const spit = h.qte?.kind === 'spit' ? h.qte : null;
    this.spitBtn.classList.toggle('hidden', !spit);
    this.spitBtn.classList.toggle('ready', !!spit?.ready);
    const rh = h.qte?.kind === 'rhythm' ? h.qte : null;
    this.cryBtn.classList.toggle('hidden', !rh);
    this.rhythmBox.classList.toggle('hidden', !rh);
    if (rh) {
      this.cryBtn.classList.toggle('holding', rh.holding);
      this.setText(this.rhythmTitle, rh.title);
      this.setText(this.rhythmScore, `${rh.score}/${rh.total}`);
      this.rhythmNotes.forEach((n, i) => {
        const nt = rh.notes[i];
        const show = !!nt && nt.x > -0.1 && nt.x < 1.05 && nt.state !== 'ok';
        n.classList.toggle('hidden', !show);
        if (!nt || !show) return;
        this.setStyle(n, 'left', `${(nt.x * 100).toFixed(1)}%`);
        this.setStyle(n, 'width', nt.hold ? `calc(${(nt.len * 100).toFixed(1)}% + 22px)` : '22px');
        n.className = `rhythm-note${nt.hold ? ' hold' : ''} st-${nt.state}`;
      });
    }
    // 공격: 잠김(각성 전) / 준비 / 돌아오는 중(쿨타임)
    this.atk.classList.toggle('off', off || h.attack !== 'ready' || (qteLock && !aim));
    this.atk.classList.toggle('locked', h.attack === 'locked');
    this.atk.classList.toggle('out', h.attack === 'out');
    this.setStyle(this.atkCool, 'height', h.attack === 'out' ? `${Math.round(h.cooldown * 100)}%` : '0%');
    this.setText(this.atkLabel, aim ? '발사!' : h.attack === 'locked' ? '각성 전' : h.attack === 'out' ? '돌아오는 중' : '공격');
    this.atk.classList.toggle('aim', aim);
    if (aim) this.atk.classList.remove('off');
    // 필살
    this.setStyle(this.spFill, 'height', `${Math.round(h.special * 100)}%`);
    const spOk = h.specialReady && !off && !qteLock;
    this.sp.classList.toggle('ready', spOk);
    this.sp.classList.toggle('off', !spOk);
    this.setText(this.spLabel, h.specialReady ? '필살!' : `${Math.round(h.special * 100)}%`);
    // 킁카괴물 전용 필살기 (같은 게이지 — 둘 중 하나를 쓰면 게이지가 비워짐)
    this.pad.classList.toggle('has-sp2', h.dubai);
    this.setStyle(this.sp2Fill, 'height', `${Math.round(h.special * 100)}%`);
    this.sp2.classList.toggle('ready', spOk && h.dubai);
    this.sp2.classList.toggle('off', !(spOk && h.dubai));
    this.setText(this.sp2Label, h.specialReady ? '두바이!' : `${Math.round(h.special * 100)}%`);
    // 위: 점수 · 고나 하트 + HP + 성장 · 보스 (보스전에서만)
    this.scoreEl.classList.toggle('hidden', !h.player);
    if (h.score !== this.lastScore) {
      this.setText(this.scoreEl, `점수 ${h.score}`);
      if (this.lastScore >= 0 && h.score > this.lastScore) this.scoreEl.animate?.([{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 160 });
      this.lastScore = h.score;
    }
    this.top.classList.toggle('hidden', !h.player);
    this.bossBar.classList.toggle('hidden', !h.boss);
    this.growRow.classList.toggle('hidden', !h.growth);
    if (h.growth) {
      this.setStyle(this.growFill, 'width', `${Math.round(h.growth.ratio * 100)}%`);
      this.growFill.classList.toggle('final', h.growth.final);
      this.setText(this.growText, `성장 ${h.growth.level}/${h.growth.levels}`);
    }
    if (h.player) {
      const p = h.player;
      this.playerHearts.forEach((img, i) => {
        const src = i < p.hearts ? this.heartSrc.full : this.heartSrc.empty;
        if (img.src !== src) img.src = src;
      });
      const pct = Math.max(0, p.hp / p.maxHp);
      this.setStyle(this.playerHp, 'width', `${Math.round(pct * 100)}%`);
      this.playerHp.classList.toggle('low', pct <= 0.3);
      this.setText(this.playerHpText, `HP ${p.hp}`);
      if (this.lastPlayerHp >= 0 && (p.hp < this.lastPlayerHp || p.hearts < (prev?.player?.hearts ?? p.hearts))) this.shake(this.me);
      this.lastPlayerHp = p.hp;
    } else this.lastPlayerHp = -1;
    if (h.boss) {
      this.setText(this.bossName, h.boss.name);
      this.bossPhase.classList.toggle('hidden', h.boss.phase < 2);
      this.setText(this.bossPhase, h.boss.label ?? (h.boss.phase >= 4 ? '🔥 최종 분노' : h.boss.phase >= 3 ? '💥 2차 분노' : '💢 1차 분노'));
      this.bossBar.classList.toggle('phase2', h.boss.phase >= 2);
      this.setStyle(this.bossHp, 'width', `${Math.max(0, (h.boss.hp / h.boss.maxHp) * 100)}%`);
      if (this.lastHp >= 0 && h.boss.hp < this.lastHp) this.shake(this.bossBar);
      this.lastHp = h.boss.hp;
    } else this.lastHp = -1;
  }

  /** 흔들림 (강제 레이아웃 없이 Web Animations) */
  private shake(n: HTMLElement): void {
    n.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }], { duration: 240, easing: 'steps(4)' });
  }

  private showBanner(b: BannerInfo): void {
    const n = this.banner;
    n.className = `battle-banner tone-${b.tone ?? 'good'}`;
    n.replaceChildren(el('p', 'bn-top', b.top), el('p', 'bn-name', b.name));
    if (b.desc) n.append(el('p', 'bn-desc', b.desc));
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.hideBanner(), b.ms);
  }

  private hideBanner(): void {
    this.banner.classList.add('hidden');
  }

  private reset(): void {
    this.pad.className = 'battle-pad mode-none';
    document.body.classList.remove('in-battle');
    document.body.classList.remove('has-pad');
    this.top.classList.add('hidden');
    this.scoreEl.classList.add('hidden');
    this.lastScore = -1;
    this.hideBanner();
    this.hud = null;
  }
}
