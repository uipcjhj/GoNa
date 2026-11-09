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

const PAL = { k: '#4a2a14', b: '#9a6238', w: '#d79a62', d: '#6e4024', y: '#ffd84a', c: '#8fe3ff', l: '#e6fbff', s: '#4fb6e8' };
const HAIR_ICON = ['....k....', '...kbk...', '...kbk...', '..kbbbk..', '.kbbwbbk.', 'kbbbwbbbk', 'kbbbbbbbk', 'kbbbbbbdk', '.kbbbbdk.', '..kkkkk..'];
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
  private resistFill: HTMLDivElement;
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
    this.atk = this.makeBtn('bt-attack', '공격', HAIR_ICON, 6);
    this.atkCool = el('div', 'bt-cool');
    this.atk.querySelector('.bt-face')!.prepend(this.atkCool);
    this.atkLabel = this.atk.querySelector('.bt-label') as HTMLSpanElement;
    this.sp = this.makeBtn('bt-special', '필살', STAR_ICON, 3);
    this.spFill = el('div', 'bt-fill');
    this.sp.querySelector('.bt-face')!.prepend(this.spFill);
    this.spLabel = this.sp.querySelector('.bt-label') as HTMLSpanElement;
    const left = el('div', 'bt-group bt-left');
    left.append(this.shieldBtn);
    const right = el('div', 'bt-group bt-right');
    right.append(this.sp, this.atk);
    this.pad.append(left, right);

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
    // 점수: 화면 위 왼쪽 (오른쪽 위 일시정지·소리 버튼과 겹치지 않게)
    this.scoreEl = el('div', 'hud-score hidden', '점수 0');
    root.append(this.scoreEl, this.top, this.banner, this.resistBox, this.pad);

    this.bindPress(this.shieldBtn, () => bus.emit(EV.shield));
    this.bindPress(this.atk, () => bus.emit(EV.attack));
    this.bindPress(this.sp, () => bus.emit(EV.special));

    bus.on(EV.combatHud, (h: CombatHud) => this.render(h));
    bus.on(EV.banner, (b: BannerInfo) => this.showBanner(b));
    bus.on(EV.start, () => this.hideBanner());
    bus.on(EV.gameOver, () => this.reset());
    bus.on(EV.ending, () => this.reset());
    bus.on(EV.endingStart, () => this.reset());
    // 보스 패배 확정 → 마지막 대사·퇴장 동안 점수·하트·보스 체력바·버튼 숨김 (대화창과 겹치지 않게)
    bus.on(EV.bossDefeat, () => document.body.classList.add('boss-defeat'));
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
  private bindPress(btn: Btn, fire: () => void): void {
    const active = new Set<number>();
    const release = (e: PointerEvent): void => {
      active.delete(e.pointerId);
      if (!active.size) btn.classList.remove('pressed');
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

  private setStyle(n: HTMLElement, k: 'height' | 'width', v: string): void {
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
    // 방패
    this.shieldBtn.classList.toggle('off', off || h.shield !== 'ready');
    this.shieldBtn.classList.toggle('active', h.shield === 'active');
    this.setStyle(this.shieldCool, 'height', h.shield === 'cool' ? `${Math.round(h.shieldCool * 100)}%` : '0%');
    const resist = h.qte?.kind === 'resist' ? h.qte : null;
    const aim = h.qte?.kind === 'aim';
    this.setText(this.shieldLabel, resist ? '버티기!' : h.shield === 'active' ? '막는 중!' : h.shield === 'cool' ? '준비 중' : '방패');
    this.shieldBtn.classList.toggle('qte', !!resist);
    if (resist) this.shieldBtn.classList.remove('off');
    this.resistBox.classList.toggle('hidden', !resist);
    if (resist) {
      this.setStyle(this.resistFill, 'width', `${Math.round(resist.gauge * 100)}%`);
      this.resistFill.classList.toggle('low', resist.gauge < 0.25);
    }
    // 공격: 잠김(각성 전) / 준비 / 돌아오는 중(쿨타임)
    this.atk.classList.toggle('off', off || h.attack !== 'ready');
    this.atk.classList.toggle('locked', h.attack === 'locked');
    this.atk.classList.toggle('out', h.attack === 'out');
    this.setStyle(this.atkCool, 'height', h.attack === 'out' ? `${Math.round(h.cooldown * 100)}%` : '0%');
    this.setText(this.atkLabel, aim ? '조준!' : h.attack === 'locked' ? '각성 전' : h.attack === 'out' ? '돌아오는 중' : '공격');
    this.atk.classList.toggle('aim', aim);
    if (aim) this.atk.classList.remove('off');
    // 필살
    this.setStyle(this.spFill, 'height', `${Math.round(h.special * 100)}%`);
    this.sp.classList.toggle('ready', h.specialReady && !off);
    this.sp.classList.toggle('off', off || !h.specialReady);
    this.setText(this.spLabel, h.specialReady ? '필살!' : `${Math.round(h.special * 100)}%`);
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
      this.setText(this.bossPhase, h.boss.phase >= 4 ? '🔥 최종 분노' : h.boss.phase >= 3 ? '💥 2차 분노' : '💢 1차 분노');
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
