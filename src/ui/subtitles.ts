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
  /** 타이핑: 문장 전체를 한 번만 배치해 두고, 보이는 부분(shown)과 아직 안 보이는 부분(rest)만 바꿈 */
  private shownEl: HTMLSpanElement;
  private restEl: HTMLSpanElement;
  private pageEl: HTMLSpanElement;
  private gate: HTMLDivElement;
  private typeTimer = 0;
  private fullText = '';
  /** 엔딩 '다음 ▶' 버튼 (엔딩 중에만 보임) */
  onNext: () => void = () => {};
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
    this.shownEl = el('span', 'pr-shown');
    this.restEl = el('span', 'pr-rest');
    this.textEl.append(this.shownEl, this.restEl);
    this.pageEl = el('span', 'pr-page');
    const more = el('span', 'pr-more', '▼');
    const next = el('button', 'pr-next', '다음 ▶');
    next.type = 'button';
    next.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onNext();
    });
    this.box.append(this.textEl, this.pageEl, more, next);
    this.root.append(this.gate, this.box);
    parent.append(this.root);

    bus.on(EV.prologueLine, (l: LineInfo) => this.showLine(l));
    // 엔딩: 장면의 애니메이션·영상과 타이핑이 끝났을 때만 '다음 ▶' (자리는 그대로 두고 보이기만 바꿈 → 대사창이 흔들리지 않음)
    bus.on(EV.endingNextReady, (on: boolean) => this.box.classList.toggle('can-next', !!on));
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

  /** 타이핑 중인지 */
  get typing(): boolean {
    return !this.box.classList.contains('hidden') && !this.box.classList.contains('typed') && this.fullText !== '';
  }

  /** 타이핑 중인 문장을 바로 끝까지 보여 줌 */
  finishTyping(): void {
    clearInterval(this.typeTimer);
    this.shownEl.textContent = this.fullText;
    this.restEl.textContent = '';
    this.box.classList.add('typed');
  }

  /** 지금 화면에 보이는(타이핑된) 자막 */
  get text(): string {
    return this.shownEl.textContent ?? '';
  }

  private showLine(l: LineInfo): void {
    this.hideGate();
    this.box.classList.remove('hidden', 'typed', 'can-next');
    this.box.dataset.index = String(l.index);
    this.pageEl.textContent = `${l.index + 1}/${l.total}`;
    // 타이핑 효과: 문장 길이에 맞춰, 다음 문장 전에 조금 여유 있게 끝나게
    const chars = Array.from(l.text);
    this.fullText = l.text;
    const step = Math.max(28, Math.min(70, (l.seconds * 1000 * 0.55) / chars.length));
    let n = 0;
    clearInterval(this.typeTimer);
    // 줄바꿈 위치가 타이핑 중에 바뀌지 않도록 문장 전체를 미리 배치 (안 보이는 부분은 visibility:hidden)
    this.shownEl.textContent = '';
    this.restEl.textContent = l.text;
    this.typeTimer = window.setInterval(() => {
      n++;
      this.shownEl.textContent = chars.slice(0, n).join('');
      this.restEl.textContent = chars.slice(n).join('');
      if (n >= chars.length) {
        clearInterval(this.typeTimer);
        this.box.classList.add('typed');
      }
    }, step);
  }
}
