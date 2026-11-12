/**
 * 소리 테스트 화면 — 실제 기기에서 소리가 나는지 직접 확인하는 용도.
 *   열기: 대표 타이틀 왼쪽 위 '소리 테스트' / 일시정지 화면의 '소리 테스트' / 주소 끝에 ?audiotest
 *   표시: 오디오 활성화 여부 · AudioContext 상태 · 배경음악 재생 경로 · 오류 메시지
 *   버튼: 배경음악(타이틀/게임/정지) · 효과음(Web Audio/파일) · 삐 소리 · 음소거 켜기/끄기
 */
import { sound } from '../audio';
import { el } from './dom';

export class AudioPanel {
  private root: HTMLElement;
  private info: HTMLElement;
  private errs: HTMLElement;
  private muteBtn!: HTMLButtonElement;
  private timer = 0;

  constructor(parent: HTMLElement) {
    this.root = el('section', 'audio-panel hidden');
    const box = el('div', 'panel ap-box');
    const title = el('h2', '', '🔊 소리 테스트');
    const how = el('p', 'ap-how', '버튼을 눌렀을 때 소리가 들리는지 확인해 주세요. 아이폰은 옆면 무음 스위치와 음량 버튼도 확인!');
    this.info = el('dl', 'ap-info');
    const btns = el('div', 'ap-btns');
    const add = (label: string, fn: () => void, cls = ''): HTMLButtonElement => {
      const b = el('button', `ap-btn ${cls}`, label);
      b.type = 'button';
      b.addEventListener('click', () => {
        sound.unlock();
        fn();
        this.refresh();
      });
      btns.append(b);
      return b;
    };
    add('▶ 배경음악 (타이틀)', () => sound.startMusic('title'));
    add('▶ 배경음악 (게임)', () => sound.startMusic('game'));
    add('■ 배경음악 정지', () => sound.stopMusic());
    add('🍓 효과음 (Web Audio)', () => {
      sound.forceSynth = true;
      sound.pickup(30);
      sound.forceSynth = false;
    });
    add('🍪 효과음 (파일)', () => sound.testSfxFile());
    add('🔔 삐 소리 (Web Audio)', () => sound.testBeep());
    this.muteBtn = add('', () => sound.setMuted(!sound.muted), 'ap-mute');
    this.errs = el('ol', 'ap-errs');
    const close = el('button', 'pixel-btn ap-close', '닫기');
    close.type = 'button';
    close.addEventListener('click', () => this.close());
    box.append(title, how, btns, this.info, el('h3', '', '오류 기록'), this.errs, close);
    this.root.append(box);
    parent.append(this.root);
    sound.onChange(() => this.refresh());
    if (__DEV_TOOLS__ && new URLSearchParams(window.location.search).has('audiotest')) this.open();
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  open(): void {
    this.root.classList.remove('hidden');
    this.refresh();
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.refresh(), 500);
  }

  close(): void {
    this.root.classList.add('hidden');
    clearInterval(this.timer);
  }

  private refresh(): void {
    if (!this.isOpen) return;
    const s = sound.status();
    const ok = (b: boolean): string => (b ? '✅' : '⚠️');
    const rows: [string, string][] = [
      ['오디오 활성화 (첫 터치)', `${ok(s.unlocked)} ${s.unlocked ? '됨' : '아직 — 아무 버튼이나 눌러 주세요'}`],
      ['AudioContext 상태', `${ok(s.contextState === 'running')} ${s.contextState}${s.sampleRate ? ` · ${s.sampleRate}Hz` : ''}`],
      ['음소거 (게임 설정)', s.muted ? '🔇 켜짐 — 아래 버튼으로 해제' : '🔊 꺼짐'],
      ['배경음악', `${s.musicMode ?? '없음'} · ${s.musicSource === 'file' ? '파일(<audio>)' : s.musicSource === 'synth' ? '합성(Web Audio)' : '-'} · ${s.musicPlaying ? '재생 중' : '정지'}`],
      ['배경음악 파일', s.musicFile],
      ['무음 유지용 오디오', s.keepAlive],
      ['효과음 경로', s.sfxPath === 'webaudio' ? 'Web Audio 합성' : '파일(<audio>) 대체'],
      ['iOS 오디오 세션', s.audioSession],
    ];
    this.info.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', '', k), el('dd', '', v)]));
    this.errs.replaceChildren(...(s.errors.length ? s.errors.map((e) => el('li', '', e)) : [el('li', 'ap-none', '오류 없음')]));
    this.muteBtn.textContent = s.muted ? '🔊 음소거 해제' : '🔇 음소거';
  }
}
