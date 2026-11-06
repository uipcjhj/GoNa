/**
 * 보스전·머리카락 부메랑 화면 UI (DOM — 한글이 선명하게).
 *   - 오른쪽 아래: 공격 버튼(머리카락 부메랑) · 필살 버튼(게이지가 차오름)
 *   - 위 가운데: 보스 이름 + 체력 바
 *   - 가운데: 큰 안내 (보스 등장 · 각성 · 필살기 · 승리)
 * 버튼은 pointerdown 으로 바로 반응 (화면 터치 = 점프와 겹치지 않게 버튼은 main.ts 에서 제외됨)
 */
import { bus, EV, type BannerInfo, type CombatHud } from '../events';
import { mapToCanvas } from '../art/PixelCanvas';
import { el, pixelImg } from './dom';

const HAIR_ICON = [
  '....k....',
  '...kbk...',
  '...kbk...',
  '..kbbbk..',
  '.kbbwbbk.',
  'kbbbwbbbk',
  'kbbbbbbbk',
  'kbbbbbbdk',
  '.kbbbbdk.',
  '..kkkkk..',
];
const STAR_ICON = [
  '....k....',
  '...kyk...',
  '...kyk...',
  'kkkkyykkk',
  'kyyyyyyyk',
  '.kyyyyyk.',
  '..kyyyk..',
  '.kyykyyk.',
  'kyyk.kyyk',
  'kkk...kkk',
];
const ICON_PAL = { k: '#4a2a14', b: '#9a6238', w: '#d79a62', d: '#6e4024', y: '#ffd84a' };

export class BattleUi {
  private pad: HTMLDivElement;
  private atk: HTMLButtonElement;
  private sp: HTMLButtonElement;
  private spFill: HTMLDivElement;
  private bossBar: HTMLDivElement;
  private bossName: HTMLSpanElement;
  private bossPhase: HTMLSpanElement;
  private bossHp: HTMLDivElement;
  private banner: HTMLDivElement;
  private bannerTimer = 0;
  private lastHp = -1;

  constructor(root: HTMLElement) {
    this.pad = el('div', 'battle-pad hidden');
    this.sp = el('button', 'bt-btn bt-special hidden');
    this.sp.type = 'button';
    this.sp.setAttribute('aria-label', '필살기');
    this.spFill = el('div', 'bt-fill');
    this.sp.append(this.spFill, pixelImg(mapToCanvas(STAR_ICON, ICON_PAL), 3, 'bt-icon'), el('span', 'bt-label', '필살'));
    this.atk = el('button', 'bt-btn bt-attack');
    this.atk.type = 'button';
    this.atk.setAttribute('aria-label', '머리카락 부메랑 공격');
    this.atk.append(pixelImg(mapToCanvas(HAIR_ICON, ICON_PAL), 4, 'bt-icon'), el('span', 'bt-label', '공격'));
    this.pad.append(this.sp, this.atk);

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

    const press = (btn: HTMLButtonElement, ev: string): void => {
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.add('pressed');
        bus.emit(ev);
      });
      const up = (): void => btn.classList.remove('pressed');
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointerleave', up);
    };
    press(this.atk, EV.attack);
    press(this.sp, EV.special);

    bus.on(EV.combatHud, (h: CombatHud) => this.render(h));
    bus.on(EV.banner, (b: BannerInfo) => this.showBanner(b));
    bus.on(EV.start, () => this.hideBanner());
    bus.on(EV.gameOver, () => this.reset());
    bus.on(EV.ending, () => this.reset());
  }

  private render(h: CombatHud): void {
    this.pad.classList.toggle('hidden', h.attack === 'hidden');
    this.atk.classList.toggle('out', h.attack === 'out');
    this.atk.setAttribute('aria-disabled', String(h.attack !== 'ready'));
    const showSp = h.special !== null;
    this.sp.classList.toggle('hidden', !showSp);
    if (showSp) {
      this.spFill.style.height = `${Math.round((h.special ?? 0) * 100)}%`;
      this.sp.classList.toggle('ready', h.specialReady);
      this.sp.setAttribute('aria-disabled', String(!h.specialReady));
    }
    this.bossBar.classList.toggle('hidden', !h.boss);
    if (h.boss) {
      this.bossName.textContent = h.boss.name;
      this.bossPhase.classList.toggle('hidden', h.boss.phase < 2);
      this.bossBar.classList.toggle('phase2', h.boss.phase >= 2);
      this.bossHp.style.width = `${Math.max(0, (h.boss.hp / h.boss.maxHp) * 100)}%`;
      if (this.lastHp >= 0 && h.boss.hp < this.lastHp) {
        this.bossBar.classList.remove('hit');
        void this.bossBar.offsetWidth;
        this.bossBar.classList.add('hit');
      }
      this.lastHp = h.boss.hp;
    } else {
      this.lastHp = -1;
    }
  }

  private showBanner(b: BannerInfo): void {
    const n = this.banner;
    n.className = `battle-banner tone-${b.tone ?? 'good'}`;
    n.replaceChildren(el('p', 'bn-top', b.top), el('p', 'bn-name', b.name));
    if (b.desc) n.append(el('p', 'bn-desc', b.desc));
    n.style.animation = 'none';
    void n.offsetWidth;
    n.style.animation = '';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.hideBanner(), b.ms);
  }

  private hideBanner(): void {
    this.banner.classList.add('hidden');
  }

  private reset(): void {
    this.pad.classList.add('hidden');
    this.bossBar.classList.add('hidden');
    this.hideBanner();
  }
}
