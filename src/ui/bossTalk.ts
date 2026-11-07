/**
 * 보스 패배 대사 (픽셀 대화창 · 타이핑 효과 · 건너뛰기)
 *   EV.bossTalk { name, lines } → 한 줄씩 타이핑(문장 전체를 미리 배치해 줄바꿈이 흔들리지 않게) → 끝나면 EV.bossTalkDone
 *   음성 없음. 건너뛰기 버튼 = 바로 끝.
 */
import { bus, EV } from '../events';
import { el } from './dom';

export interface BossTalkInfo {
  name: string;
  lines: string[];
}

export class BossTalk {
  private root: HTMLDivElement;
  private nameEl: HTMLSpanElement;
  private shownEl: HTMLSpanElement;
  private restEl: HTMLSpanElement;
  private timer = 0;
  private wait = 0;
  private active = false;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'boss-talk hidden');
    this.nameEl = el('span', 'bt-name');
    const text = el('p', 'bt-text');
    this.shownEl = el('span', 'pr-shown');
    this.restEl = el('span', 'pr-rest');
    text.append(this.shownEl, this.restEl);
    const skip = el('button', 'bt-skip', '건너뛰기 ▶▶');
    skip.type = 'button';
    skip.addEventListener('click', () => this.finish());
    this.root.append(this.nameEl, text, skip);
    parent.append(this.root);
    bus.on(EV.bossTalk, (t: BossTalkInfo) => this.play(t));
    // 다시하기·게임 오버 등으로 끊기면 조용히 닫음 (완료 알림 없이)
    for (const ev of [EV.start, EV.gameOver, EV.bossTalkCancel]) bus.on(ev, () => this.close());
  }

  get isOpen(): boolean {
    return this.active;
  }

  get text(): string {
    return this.shownEl.textContent ?? '';
  }

  private play(t: BossTalkInfo): void {
    this.close();
    this.active = true;
    this.nameEl.textContent = t.name;
    this.root.classList.remove('hidden');
    let li = 0;
    const next = (): void => {
      if (!this.active) return;
      if (li >= t.lines.length) {
        this.wait = window.setTimeout(() => this.finish(), 900);
        return;
      }
      const chars = Array.from(t.lines[li++]);
      let n = 0;
      this.shownEl.textContent = '';
      this.restEl.textContent = chars.join('');
      this.root.classList.remove('pop');
      void this.root.offsetWidth;
      this.root.classList.add('pop');
      this.timer = window.setInterval(() => {
        n++;
        this.shownEl.textContent = chars.slice(0, n).join('');
        this.restEl.textContent = chars.slice(n).join('');
        if (n >= chars.length) {
          clearInterval(this.timer);
          this.wait = window.setTimeout(next, 650 + chars.length * 25);
        }
      }, 55);
    };
    next();
  }

  private close(): void {
    clearInterval(this.timer);
    clearTimeout(this.wait);
    this.active = false;
    this.root.classList.add('hidden');
  }

  private finish(): void {
    if (!this.active) return;
    this.close();
    bus.emit(EV.bossTalkDone);
  }
}
