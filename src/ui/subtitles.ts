/**
 * 프롤로그 자막 상자 (화면 아래, 둥근 도트 대화창 · 타이핑 효과) + '이야기 시작' 대기 화면.
 * 자막은 EV.prologueLine 을 받아 표시합니다.
 */
import { bus, EV } from '../events';
import { el } from './dom';

interface LineInfo {
  index: number;
  total: number;
  text: string;
  seconds: number;
}

export class Subtitles {
  readonly root: HTMLDivElement;
  private box: HTMLDivElement;
  private textEl: HTMLParagraphElement;
  private pageEl: HTMLSpanElement;
  private gate: HTMLDivElement;
  private typeTimer = 0;
  /** 대기 화면에서 '이야기 시작'을 눌렀을 때 */
  onBegin: () => void = () => {};

  constructor(parent: HTMLElement) {
    this.root = el('div', 'prologue-ui hidden');
    // 대기 화면
    this.gate = el('div', 'pr-gate');
    const card = el('div', 'pr-gate-card');
    const btn = el('button', 'pr-begin', '📖 이야기 시작');
    btn.type = 'button';
    btn.addEventListener('click', () => this.onBegin());
    card.append(btn, el('p', 'pr-gate-hint', '🔊 소리를 켜고 들어 보세요 · 화면을 터치해도 시작돼요'));
    this.gate.append(card);
    // 자막 상자
    this.box = el('div', 'pr-box hidden');
    this.textEl = el('p', 'pr-text');
    this.pageEl = el('span', 'pr-page');
    const more = el('span', 'pr-more', '▼');
    this.box.append(this.textEl, this.pageEl, more);
    this.root.append(this.gate, this.box);
    parent.append(this.root);

    bus.on(EV.prologueLine, (l: LineInfo) => this.showLine(l));
  }

  /** 프롤로그 화면 준비 (대기 화면부터) */
  show(): void {
    this.root.classList.remove('hidden');
    this.gate.classList.remove('hidden');
    this.box.classList.add('hidden');
  }

  hideGate(): void {
    this.gate.classList.add('hidden');
  }

  hide(): void {
    clearInterval(this.typeTimer);
    this.root.classList.add('hidden');
  }

  get text(): string {
    return this.textEl.textContent ?? '';
  }

  private showLine(l: LineInfo): void {
    this.hideGate();
    this.box.classList.remove('hidden', 'typed');
    this.box.dataset.index = String(l.index);
    this.pageEl.textContent = `${l.index + 1}/${l.total}`;
    // 타이핑 효과: 문장 길이에 맞춰, 다음 문장 전에 조금 여유 있게 끝나게
    const chars = Array.from(l.text);
    const step = Math.max(28, Math.min(70, (l.seconds * 1000 * 0.55) / chars.length));
    let n = 0;
    clearInterval(this.typeTimer);
    this.textEl.textContent = '';
    this.typeTimer = window.setInterval(() => {
      n++;
      this.textEl.textContent = chars.slice(0, n).join('');
      if (n >= chars.length) {
        clearInterval(this.typeTimer);
        this.box.classList.add('typed');
      }
    }, step);
  }
}
