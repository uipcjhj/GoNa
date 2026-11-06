/**
 * 보스전 조작 버튼 + 보스 체력 바 + 큰 안내 (DOM — 한글이 선명하고 터치 영역을 크게 잡기 쉬움).
 *
 * 보스전: 왼쪽 아래 [피하기]  ·  오른쪽 아래 [필살] [공격]   (화면 터치 점프는 꺼짐 — main.ts)
 * 평소 달리기(3단계~): 오른쪽 아래 [공격]만 (점프는 화면 터치)
 *
 * 멀티터치: 버튼마다 pointerdown 에서 바로 실행하고 그 손가락(pointerId)을 setPointerCapture 로 붙잡아,
 *   다른 손가락의 터치·버튼과 서로 취소되지 않고, 손가락이 버튼 밖으로 나가도 떼는 순간까지 상태가 맞게 유지됩니다.
 *   (pointerup / pointercancel / lostpointercapture 모두 처리)
 */
import { bus, EV, type BannerInfo, type CombatHud } from '../events';
import { mapToCanvas } from '../art/PixelCanvas';
import { perf } from '../perf';
import { el, pixelImg } from './dom';

const PAL = { k: '#4a2a14', b: '#9a6238', w: '#d79a62', d: '#6e4024', y: '#ffd84a', o: '#f08a2a', g: '#7cc45a', l: '#c8f29a' };
const HAIR_ICON = ['....k....', '...kbk...', '...kbk...', '..kbbbk..', '.kbbwbbk.', 'kbbbwbbbk', 'kbbbbbbbk', 'kbbbbbbdk', '.kbbbbdk.', '..kkkkk..'];
const STAR_ICON = ['....k....', '...kyk...', '...kyk...', 'kkkkyykkk', 'kyyyyyyyk', '.kyyyyyk.', '..kyyyk..', '.kyykyyk.', 'kyyk.kyyk', 'kkk...kkk'];
const JUMP_ICON = ['....k....', '...kgk...', '..kgggk..', '.kgglggk.', 'kkkgggkkk', '...kgk...', '...kgk...', '...kgk...', '..kk.kk..', '.k.....k.'];

type Btn = HTMLButtonElement;

export class BattleUi {
  private pad: HTMLDivElement;
  private dodgeBtn: Btn;
  private atk: Btn;
  private sp: Btn;
  private atkCool: HTMLDivElement;
  private atkLabel: HTMLSpanElement;
  private spFill: HTMLDivElement;
  private spLabel: HTMLSpanElement;
  private dodgeBadge: HTMLSpanElement;
  private bossBar: HTMLDivElement;
  private bossName: HTMLSpanElement;
  private bossPhase: HTMLSpanElement;
  private bossHp: HTMLDivElement;
  private banner: HTMLDivElement;
  private bannerTimer = 0;
  private lastHp = -1;
  private hud: CombatHud | null = null;

  constructor(root: HTMLElement) {
    this.pad = el('div', 'battle-pad mode-none');
    // 피하기 (왼쪽)
    this.dodgeBtn = this.makeBtn('bt-dodge', '피하기', JUMP_ICON, 4);
    this.dodgeBadge = el('span', 'bt-badge hidden', '2단!');
    this.dodgeBtn.querySelector('.bt-face')!.append(this.dodgeBadge);
    // 공격 (오른쪽)
    this.atk = this.makeBtn('bt-attack', '공격', HAIR_ICON, 4);
    this.atkCool = el('div', 'bt-cool');
    this.atk.querySelector('.bt-face')!.prepend(this.atkCool);
    this.atkLabel = this.atk.querySelector('.bt-label') as HTMLSpanElement;
    // 필살 (공격 옆)
    this.sp = this.makeBtn('bt-special', '필살', STAR_ICON, 3);
    this.spFill = el('div', 'bt-fill');
    this.sp.querySelector('.bt-face')!.prepend(this.spFill);
    this.spLabel = this.sp.querySelector('.bt-label') as HTMLSpanElement;
    const left = el('div', 'bt-group bt-left');
    left.append(this.dodgeBtn);
    const right = el('div', 'bt-group bt-right');
    right.append(this.sp, this.atk);
    this.pad.append(left, right);

    this.bossBar = el('div', 'boss-bar hidden');
    const top = el('div', 'bb-top');
    this.bossName = el('span', 'bb-name');
    this.bossPhase = el('span', 'bb-phase hidden', '2페이즈');
    top.append(this.bossName, this.bossPhase);
    const track = el('div', 'bb-track');
    this.bossHp = el('div', 'bb-hp');
    track.append(this.bossHp);
    this.bossBar.append(top, track);

    this.banner = el('div', 'battle-banner hidden');
    root.append(this.bossBar, this.banner, this.pad);

    this.bindPress(this.dodgeBtn, () => bus.emit(EV.dodge));
    this.bindPress(this.atk, () => bus.emit(EV.attack));
    this.bindPress(this.sp, () => bus.emit(EV.special));

    bus.on(EV.combatHud, (h: CombatHud) => this.render(h));
    bus.on(EV.banner, (b: BannerInfo) => this.showBanner(b));
    bus.on(EV.start, () => this.hideBanner());
    bus.on(EV.gameOver, () => this.reset());
    bus.on(EV.ending, () => this.reset());
  }

  /** 보스전 버튼이 화면에 있는지 (main.ts: 이때는 화면 터치 점프를 끔) */
  get battleMode(): boolean {
    return this.hud?.mode === 'battle';
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
      if (!btn.classList.contains('off')) perf.time(`btn:${btn.getAttribute('aria-label')}`, fire);
    });
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
    // 길게 누르기 메뉴·더블탭 확대·클릭 지연 방지
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => e.preventDefault());
  }

  /** 값이 바뀔 때만 DOM 에 씀 (같은 값을 다시 쓰면 iOS 가 스타일 재계산으로 멈칫할 수 있음) */
  private setText(n: HTMLElement, v: string): void {
    if (n.textContent !== v) n.textContent = v;
  }

  private setH(n: HTMLElement, v: string): void {
    if (n.style.height !== v) n.style.height = v;
  }

  private render(h: CombatHud): void {
    const prev = this.hud;
    this.hud = h;
    if (prev?.mode !== h.mode) {
      this.pad.className = `battle-pad mode-${h.mode}`;
      document.body.classList.toggle('in-battle', h.mode === 'battle');
    }
    const off = !h.enabled;
    this.dodgeBtn.classList.toggle('off', off);
    this.dodgeBadge.classList.toggle('hidden', !h.airJump || off);
    // 공격: 잠김(각성 전) / 준비 / 돌아오는 중(쿨타임 표시)
    this.atk.classList.toggle('off', off || h.attack !== 'ready');
    this.atk.classList.toggle('locked', h.attack === 'locked');
    this.atk.classList.toggle('out', h.attack === 'out');
    this.setH(this.atkCool, h.attack === 'out' ? `${Math.round(h.cooldown * 100)}%` : '0%');
    this.setText(this.atkLabel, h.attack === 'locked' ? '각성 전' : h.attack === 'out' ? '돌아오는 중' : '공격');
    // 필살: 게이지
    this.setH(this.spFill, `${Math.round(h.special * 100)}%`);
    this.sp.classList.toggle('ready', h.specialReady && !off);
    this.sp.classList.toggle('off', off || !h.specialReady);
    this.setText(this.spLabel, h.specialReady ? '필살!' : `${Math.round(h.special * 100)}%`);
    // 보스 체력
    this.bossBar.classList.toggle('hidden', !h.boss);
    if (h.boss) {
      this.setText(this.bossName, h.boss.name);
      this.bossPhase.classList.toggle('hidden', h.boss.phase < 2);
      this.bossBar.classList.toggle('phase2', h.boss.phase >= 2);
      const w = `${Math.max(0, (h.boss.hp / h.boss.maxHp) * 100)}%`;
      if (this.bossHp.style.width !== w) this.bossHp.style.width = w;
      if (this.lastHp >= 0 && h.boss.hp < this.lastHp && this.bossBar.animate) {
        // 흔들림 (강제 레이아웃 없이 Web Animations)
        this.bossBar.animate(
          [{ transform: 'translateX(-50%)' }, { transform: 'translateX(calc(-50% - 3px))' }, { transform: 'translateX(calc(-50% + 3px))' }, { transform: 'translateX(-50%)' }],
          { duration: 240, easing: 'steps(4)' },
        );
      }
      this.lastHp = h.boss.hp;
    } else this.lastHp = -1;
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
    this.bossBar.classList.add('hidden');
    this.hideBanner();
    this.hud = null;
  }
}
