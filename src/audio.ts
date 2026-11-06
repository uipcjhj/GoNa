import { perf } from './perf';
/**
 * Web Audio 로 즉석에서 만드는 효과음과 오리지널 배경음악 (오디오 파일 없음).
 *
 * ▸ 모바일(특히 iPhone) 소리 문제 대응
 *   - 첫 터치/클릭/키 입력(touchend·click 포함) 때마다 AudioContext 를 만들고 resume()
 *   - 무음 버퍼를 한 번 재생해 iOS 오디오 출력을 '깨움'
 *   - iOS 17+ navigator.audioSession = 'playback' (무음 스위치가 켜져 있어도 게임 소리 재생)
 *   - 탭 전환·화면 잠금 후 돌아오면 다시 resume()
 * ▸ 모든 소리는 master → compressor 로 모아 크게 키워도 찢어지지 않게
 * ▸ 배경음악은 미리 만든 MP3 파일(public/assets/audio, tools/render_audio.cjs)을 HTML <audio> 로 재생
 *   - iPhone 에서 Web Audio 는 무음 스위치·인앱 브라우저 정책에 따라 소리가 안 날 수 있지만,
 *     <audio> 재생은 '미디어 재생'으로 취급되어 무음 스위치와 상관없이 들리고,
 *     <audio> 가 재생 중이면 Web Audio 효과음도 같이 들리게 됨
 *   - 처음 터치 때 모든 <audio> 를 (음소거로) 한 번 재생→정지해 두어, 이후 터치 없이도 재생 가능
 * ▸ 효과음은 Web Audio 합성. Web Audio 가 시작되지 않으면 미리 만든 효과음 파일로 대신 재생
 * ▸ 오류는 조용히 무시하지 않고 기록 → 소리 테스트 화면(ui/audioPanel.ts)에서 확인
 * ▸ BGM 'Dream Nest' (오리지널): 같은 테마를
 *   title 모드 = 느리고 몽환적 (패드 + 글로켄 + 부드러운 베이스, 타악기 없음)
 *   game  모드 = 조금 빠르고 리듬감 (가벼운 킥·셰이커·베이스 펄스 추가)
 */
import { STORAGE_KEYS } from './config';
import { storage } from './storage';

type Wave = OscillatorType;
export type MusicMode = 'title' | 'game';

/** 음 이름 → 주파수 (예: 'F4', 'Bb3', 'C#5') */
function hz(n: string): number {
  const m = /^([A-G])([b#]?)(\d)$/.exec(n);
  if (!m) return 0;
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const semi = base[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) - 4) * 12 - 9;
  return 440 * Math.pow(2, semi / 12);
}

// ───────────────────────── BGM 'Dream Nest' (오리지널 작곡) ─────────────────────────
// 8마디 반복, 한 마디 = 16칸(16분음표). 화성: F 장조 계열의 몽환적인 7화음 진행.
const CHORDS: string[][] = [
  ['F3', 'A3', 'C4', 'E4'], // Fmaj7
  ['D3', 'F3', 'A3', 'C4'], // Dm7
  ['Bb2', 'D3', 'F3', 'A3'], // Bbmaj7
  ['C3', 'F3', 'G3', 'Bb3'], // C7sus4
  ['A2', 'C3', 'E3', 'G3'], // Am7
  ['D3', 'F3', 'A3', 'E4'], // Dm(add9)
  ['Bb2', 'D3', 'F3', 'C4'], // Bb(add9)
  ['C3', 'E3', 'G3', 'Bb3'], // C7
];
const BASS_ROOT = ['F2', 'D2', 'Bb1', 'C2', 'A1', 'D2', 'Bb1', 'C2'];
/** 글로켄 멜로디: [마디 안 칸(0~15), 음, 길이(칸)] */
const MELODY: [number, string, number][][] = [
  [[0, 'C6', 4], [4, 'A5', 2], [6, 'G5', 2], [8, 'A5', 6], [14, 'C6', 2]],
  [[0, 'D6', 4], [4, 'C6', 2], [6, 'A5', 2], [8, 'F5', 8]],
  [[0, 'D6', 2], [2, 'C6', 2], [4, 'A5', 4], [8, 'F5', 2], [10, 'G5', 2], [12, 'A5', 4]],
  [[0, 'G5', 8], [10, 'F5', 2], [12, 'G5', 4]],
  [[0, 'E6', 4], [4, 'C6', 2], [6, 'A5', 2], [8, 'G5', 6], [14, 'A5', 2]],
  [[0, 'F5', 4], [4, 'A5', 2], [6, 'D6', 2], [8, 'E6', 8]],
  [[0, 'D6', 2], [2, 'C6', 2], [4, 'D6', 4], [8, 'F6', 4], [12, 'E6', 4]],
  [[0, 'C6', 12], [12, 'G5', 2], [14, 'A5', 2]],
];
/** 반짝이 아르페지오 (화음 음을 한 옥타브 위에서) — 칸 위치 */
const ARP_STEPS_TITLE = [2, 6, 10, 14];
const ARP_STEPS_GAME = [1, 3, 5, 7, 9, 11, 13, 15];

const TEMPO: Record<MusicMode, number> = { title: 68, game: 96 };

const AUDIO_DIR = 'assets/audio/';
/** 미리 만든 소리 파일 (tools/render_audio.cjs) */
export const MUSIC_FILES: Record<MusicMode, string> = { title: 'bgm-title.mp3', game: 'bgm-game.mp3' };
/** 내레이션 중 낮춘 타이틀 음악 (아이폰은 <audio> 음량을 코드로 못 바꿔서, 미리 작게 녹음한 파일로 같은 위치에서 바꿔 탐) */
const TITLE_DUCK_FILE = 'bgm-title-duck.mp3';
/** 프롤로그 내레이션 파일 (public/assets/voice/prologue-01.mp3 …) */
export const NARRATION_COUNT = 10;
export const narrationUrl = (i: number): string => `assets/voice/prologue-${String(i + 1).padStart(2, '0')}.mp3`;
export const SFX_NAMES = [
  'start', 'eggWobble', 'crack', 'boing', 'hatch', 'jump', 'nestJump', 'doubleJump',
  'pickup10', 'pickup20', 'pickup30', 'hit', 'gameOver', 'evolve', 'evolveDone', 'newRecord',
  'throw', 'catch', 'bossHit', 'smooch', 'inhale', 'special', 'bossDown', 'warn', 'puff', 'shield',
] as const;
export type SfxName = (typeof SFX_NAMES)[number];
/** 효과음 메서드 (성능 기록용) */
const SFX_METHODS = [
  'start', 'eggWobble', 'crack', 'boing', 'hatch', 'jump', 'nestJump', 'doubleJump', 'pickup', 'hit', 'gameOver', 'evolve',
  'evolveDone', 'newRecord', 'throw', 'catch', 'bossHit', 'smooch', 'inhale', 'special', 'bossDown', 'warn', 'puff', 'shield',
] as const;

/** 아주 짧은 무음 WAV (iOS 오디오 세션을 '미디어 재생'으로 유지) */
function silentWavUrl(): string {
  const n = 2205; // 0.1초 @ 22050
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o: number, t: string): void => {
    for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i));
  };
  w(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  w(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 22050, true);
  v.setUint32(28, 44100, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

export interface AudioStatus {
  unlocked: boolean;
  contextState: string;
  sampleRate: number;
  muted: boolean;
  musicMode: MusicMode | null;
  musicSource: 'file' | 'synth' | 'none';
  musicPlaying: boolean;
  musicFile: string;
  keepAlive: string;
  audioSession: string;
  sfxPath: 'webaudio' | 'file';
  errors: string[];
}

class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private echoIn: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private musicTimer: number | null = null;
  private mode: MusicMode = 'game';
  private step = 0;
  private nextTime = 0;
  private unlockedOnce = false;
  muted: boolean;
  // 파일 기반 소리
  private music: Partial<Record<MusicMode, HTMLAudioElement>> = {};
  private musicBroken: Partial<Record<MusicMode, boolean>> = {};
  private duckEl: HTMLAudioElement | null = null;
  private ducked = false;
  private volumeWorks = false;
  private duckTimer = 0;
  /** 지금 나와야 하는 내레이션 (준비 재생이 멈추지 않게) */
  private narrWanted: HTMLAudioElement | null = null;
  private narr: HTMLAudioElement[] = [];
  private narrBroken: boolean[] = [];
  private sfxEls: Partial<Record<SfxName, HTMLAudioElement[]>> = {};
  private keepAliveEl: HTMLAudioElement | null = null;
  private primed = false;
  private wantMusic: MusicMode | null = null;
  private musicSource: 'file' | 'synth' | 'none' = 'none';
  private errors: string[] = [];
  private listeners: (() => void)[] = [];

  constructor() {
    this.muted = storage.get(STORAGE_KEYS.muted) === '1';
    this.createElements();
    // 성능 기록: 효과음마다 걸린 시간과 경로(Web Audio 합성 / 파일)
    const self = this as unknown as Record<string, (...a: unknown[]) => void>;
    for (const m of SFX_METHODS) {
      const f = self[m].bind(this);
      self[m] = (...a: unknown[]) => perf.time(`sfx:${m}${this.ctx?.state === 'running' && !this.forceSynth ? '' : '(파일)'}`, () => f(...a));
    }
    // 어떤 사용자 입력이든 소리를 깨우도록 (iOS 는 touchend/click 에서만 허용되는 경우가 있음)
    const wake = (): void => this.unlock();
    for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) {
      window.addEventListener(ev, wake, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // 앱 전환: 음악 멈춤 (돌아오면 다시)
        this.pauseFileMusic();
        return;
      }
      if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch((e) => this.log('resume(복귀)', e));
      if (this.wantMusic && !this.muted) this.playFileMusic(this.wantMusic);
      this.emit();
    });
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  private lastUnlock = 0;

  /**
   * 사용자 입력 안에서 호출: 오디오 시작/재개.
   * 터치 한 번에 pointerdown·touchend·click 등으로 여러 번 불리므로,
   * 처음 켠 뒤에는 '할 일이 있을 때만' + 1초에 한 번만 실제 작업을 함
   * (iOS 에서 매 터치 resume()/play()/pause() 를 부르면 메인 스레드가 멈칫함).
   */
  unlock(): void {
    const now = performance.now();
    if (this.ctx && this.primed) {
      const ctxOk = this.ctx.state === 'running';
      const keepOk = !this.keepAliveEl || !this.keepAliveEl.paused;
      const want = this.wantedMusicEl();
      const musicOk = !want || this.muted || this.musicSource === 'synth' || !want.paused;
      if (ctxOk && keepOk && musicOk) return;
      if (now - this.lastUnlock < 1000) return;
    }
    this.lastUnlock = now;
    perf.time('audio:unlock', () => this.unlockNow());
  }

  private unlockNow(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        // iOS 17+: 무음 스위치와 상관없이 재생되는 오디오 세션
        const nav = navigator as unknown as { audioSession?: { type: string } };
        if (nav.audioSession) nav.audioSession.type = 'playback';
      } catch {
        /* 지원 안 함 */
      }
      try {
        this.ctx = new Ctor();
        this.ctx.onstatechange = () => this.emit();
        this.build();
      } catch (e) {
        this.log('AudioContext 생성', e);
        this.ctx = null;
      }
    }
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().then(() => this.emit(), (e) => this.log('AudioContext.resume', e));
    this.primeElements();
    // 터치 전에 음악을 틀려다 막혔으면 지금 다시 (이미 나오고 있으면 건드리지 않음)
    const want = this.wantedMusicEl();
    if (this.wantMusic && !this.muted && this.musicSource !== 'synth' && (!want || want.paused)) this.playFileMusic(this.wantMusic);
    this.emit();
    if (!this.ctx) return;
    if (!this.unlockedOnce && this.ctx) {
      // 무음 버퍼 재생으로 iOS 오디오 출력 깨우기
      this.unlockedOnce = true;
      const b = this.ctx.createBuffer(1, 1, 22050);
      const s = this.ctx.createBufferSource();
      s.buffer = b;
      s.connect(this.ctx.destination);
      s.start(0);
    }
  }

  private build(): void {
    const ctx = this.ctx!;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 1.8; // 효과음을 충분히 크게 (압축기가 찢어짐 방지)
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.55;
    this.musicBus.connect(this.master);
    // 몽환적인 메아리 (BGM 벨·글로켄용): delay + 피드백 + 고음 깎기
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.33;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2600;
    this.echoIn = ctx.createGain();
    this.echoIn.gain.value = 0.5;
    this.echoIn.connect(delay);
    delay.connect(tone).connect(fb).connect(delay);
    tone.connect(this.musicBus);
    // 타악기용 노이즈
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    storage.set(STORAGE_KEYS.muted, m ? '1' : '0');
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.02);
    if (m) this.pauseFileMusic();
    else if (this.wantMusic) this.startMusic(this.wantMusic);
    this.emit();
  }

  // ───────────────────────── 파일 기반 소리 · 진단 ─────────────────────────

  private createElements(): void {
    const mk = (src: string, loop: boolean): HTMLAudioElement => {
      const a = new Audio();
      a.preload = 'auto';
      a.loop = loop;
      a.setAttribute('playsinline', '');
      a.src = src;
      return a;
    };
    (Object.keys(MUSIC_FILES) as MusicMode[]).forEach((m) => {
      const a = mk(AUDIO_DIR + MUSIC_FILES[m], true);
      a.addEventListener('error', () => {
        this.musicBroken[m] = true;
        this.log(`배경음악 파일 오류 (${MUSIC_FILES[m]})`, a.error?.message || `code ${a.error?.code}`);
      });
      a.addEventListener('playing', () => this.emit());
      a.addEventListener('pause', () => this.emit());
      this.music[m] = a;
    });
    this.duckEl = mk(AUDIO_DIR + TITLE_DUCK_FILE, true);
    // <audio>.volume 을 바꿀 수 있는 브라우저인지 (아이폰 Safari 는 항상 1)
    try {
      const probe = new Audio();
      probe.volume = 0.5;
      this.volumeWorks = Math.abs(probe.volume - 0.5) < 0.01;
    } catch {
      this.volumeWorks = false;
    }
    for (let i = 0; i < NARRATION_COUNT; i++) {
      const a = mk(narrationUrl(i), false);
      this.narrBroken[i] = false;
      a.addEventListener('error', () => {
        this.narrBroken[i] = true;
      });
      this.narr.push(a);
    }
    for (const n of SFX_NAMES) {
      const list = [0, 1].map(() => {
        const a = mk(`${AUDIO_DIR}sfx-${n}.mp3`, false);
        // 첫 재생 때 내려받느라 멈칫하지 않게 미리 받아 둠 (아주 작은 파일)
        a.preload = 'auto';
        return a;
      });
      this.sfxEls[n] = list;
    }
    try {
      this.keepAliveEl = mk(silentWavUrl(), true);
    } catch (e) {
      this.log('무음 유지용 오디오', e);
    }
  }

  /** 사용자 입력 안에서: 모든 <audio> 를 음소거로 한 번 재생→정지 (iOS 는 이후 터치 없이 재생 허용) */
  private primeElements(): void {
    if (this.keepAliveEl && this.keepAliveEl.paused) {
      this.keepAliveEl.play().then(() => this.emit(), (e) => this.log('무음 유지 재생', e));
    }
    if (this.primed) return;
    this.primed = true;
    const all: HTMLAudioElement[] = [...(Object.values(this.music) as HTMLAudioElement[]), ...this.narr];
    if (this.duckEl) all.push(this.duckEl);
    for (const list of Object.values(this.sfxEls)) all.push(...(list as HTMLAudioElement[]));
    for (const a of all) {
      if (!a.paused) continue;
      a.muted = true;
      a.play().then(
        () => {
          // 원하는 음악이면 그대로 두고, 아니면 멈춤
          const isWanted = (!this.muted && a === this.wantedMusicEl()) || a === this.narrWanted;
          if (!isWanted) {
            a.pause();
            a.currentTime = 0;
          }
          a.muted = false;
        },
        (e) => {
          a.muted = false;
          if ((e as Error)?.name !== 'AbortError') this.log('오디오 준비(prime)', e);
        },
      );
    }
  }

  /** 지금 재생되어야 하는 배경음악 <audio> (내레이션 중 아이폰이면 작게 녹음한 판) */
  private wantedMusicEl(): HTMLAudioElement | null {
    if (!this.wantMusic) return null;
    if (this.wantMusic === 'title' && this.ducked && !this.volumeWorks && this.duckEl && !this.duckEl.error) return this.duckEl;
    return this.music[this.wantMusic] ?? null;
  }

  private playFileMusic(mode: MusicMode): boolean {
    // 내레이션 중(아이폰): 타이틀 음악은 작게 녹음한 판으로
    const useDuck = mode === 'title' && this.ducked && !this.volumeWorks && this.duckEl && !this.duckEl.error;
    if (!useDuck) this.duckEl?.pause();
    const el = useDuck ? this.duckEl! : this.music[mode];
    if (!el || this.musicBroken[mode]) return false;
    for (const m of Object.keys(this.music) as MusicMode[]) {
      if (this.music[m] !== el) this.music[m]?.pause();
    }
    if (!el.paused && !el.muted) return true;
    el.muted = false;
    el.play().then(
      () => {
        this.musicSource = 'file';
        this.emit();
      },
      (e) => {
        this.log(`배경음악 재생 (${mode})`, e);
        if ((e as Error)?.name !== 'NotAllowedError') {
          // 파일 문제: 합성 음악으로 대신
          this.musicBroken[mode] = true;
          this.startSynthMusic(mode);
        }
      },
    );
    this.musicSource = 'file';
    return true;
  }

  private pauseFileMusic(): void {
    for (const a of Object.values(this.music) as HTMLAudioElement[]) a.pause();
    this.duckEl?.pause();
  }

  // ───────────────────────── 내레이션 ─────────────────────────

  /** 내레이션 i 번 재생. 파일이 없거나 재생할 수 없으면 false */
  narrate(i: number): boolean {
    this.stopNarration();
    const a = this.narr[i];
    if (!a || this.narrBroken[i] || this.muted) return false;
    this.narrWanted = a;
    a.muted = false;
    try {
      a.currentTime = 0;
    } catch {
      /* 로드 전 */
    }
    a.play().catch((e) => this.log(`내레이션 ${i + 1}`, e));
    this.duck(true);
    a.onended = () => this.duck(false);
    return true;
  }

  stopNarration(): void {
    this.narrWanted = null;
    for (const a of this.narr) {
      if (!a.paused) a.pause();
      a.onended = null;
    }
  }

  /** 내레이션 i 번 길이(초). 아직 모르거나 없으면 null */
  narrationDuration(i: number): number | null {
    const a = this.narr[i];
    if (!a || this.narrBroken[i] || !isFinite(a.duration) || a.duration <= 0) return null;
    return a.duration;
  }

  /** 내레이션 i 번이 아직 재생 중인지 */
  narrationPlaying(i: number): boolean {
    const a = this.narr[i];
    return !!a && !a.paused && !a.ended;
  }

  /** 내레이션 i 번 재생 위치(초) */
  narrationTime(i: number): number {
    return this.narr[i]?.currentTime ?? 0;
  }

  narrationAvailable(i: number): boolean {
    return !!this.narr[i] && !this.narrBroken[i];
  }

  /** 내레이션 동안 배경음악 낮추기 */
  duck(on: boolean): void {
    if (this.ducked === on) return;
    this.ducked = on;
    const title = this.music.title;
    if (!title || this.wantMusic !== 'title' || this.muted) return;
    if (this.volumeWorks) {
      // 부드럽게 음량 조절
      clearInterval(this.duckTimer);
      const target = on ? 0.32 : 1;
      this.duckTimer = window.setInterval(() => {
        const v = title.volume + (target - title.volume) * 0.25;
        title.volume = Math.abs(v - target) < 0.02 ? target : v;
        if (title.volume === target) clearInterval(this.duckTimer);
      }, 40);
      return;
    }
    // 아이폰: 같은 곡의 작은 판으로 같은 위치에서 바꿔 탐
    const d = this.duckEl;
    if (!d || d.error) return;
    const from = on ? title : d;
    const to = on ? d : title;
    if (from.paused) return;
    try {
      to.currentTime = from.currentTime % (to.duration || from.duration || 1);
    } catch {
      /* 로드 전 */
    }
    to.muted = false;
    to.play().then(
      () => {
        // 그 사이 상태가 바뀌었으면 지금 나와야 하는 쪽만 남김
        const want = this.wantedMusicEl();
        if (from !== want) from.pause();
        if (to !== want) to.pause();
      },
      (e) => this.log('배경음악 낮추기', e),
    );
  }

  /** 효과음 파일로 대신 재생 (Web Audio 가 동작하지 않을 때). 재생했으면 true */
  /** (도구용) 파일로 미리 녹음할 때는 항상 합성 */
  forceSynth = false;

  private sfxFile(name: SfxName): boolean {
    if (this.forceSynth) return false;
    if (this.muted) return true;
    if (this.ctx && this.ctx.state === 'running') return false;
    const list = this.sfxEls[name];
    if (!list) return false;
    const a = list.find((x) => x.paused) ?? list[0];
    try {
      a.currentTime = 0;
    } catch {
      /* 아직 로드 전 */
    }
    a.play().catch((e) => this.log(`효과음 파일 (${name})`, e));
    return true;
  }

  private log(where: string, e: unknown): void {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    const line = `${new Date().toLocaleTimeString()} ${where} — ${msg}`;
    this.errors.unshift(line);
    this.errors.length = Math.min(this.errors.length, 12);
    console.warn('[audio]', line);
    this.emit();
  }

  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  private emit(): void {
    for (const f of this.listeners) f();
  }

  status(): AudioStatus {
    const m = this.wantMusic ? this.music[this.wantMusic] : undefined;
    const nav = navigator as unknown as { audioSession?: { type: string } };
    return {
      unlocked: this.unlockedOnce,
      contextState: this.ctx ? this.ctx.state : '없음 (아직 터치 전)',
      sampleRate: this.ctx?.sampleRate ?? 0,
      muted: this.muted,
      musicMode: this.wantMusic,
      musicSource: this.musicSource,
      musicPlaying: this.musicSource === 'synth' ? this.musicTimer !== null : !!m && !m.paused,
      musicFile: m ? `${m.paused ? '정지' : '재생 중'} · 로드 ${m.readyState}/4${m.error ? ` · 오류 ${m.error.code}` : ''}` : '-',
      keepAlive: this.keepAliveEl ? (this.keepAliveEl.paused ? '정지' : '재생 중') : '없음',
      audioSession: nav.audioSession ? nav.audioSession.type : '지원 안 함',
      sfxPath: this.ctx && this.ctx.state === 'running' ? 'webaudio' : 'file',
      errors: [...this.errors],
    };
  }

  /** 소리 테스트: 단순한 '삐' (Web Audio) */
  testBeep(): void {
    this.unlock();
    this.tone(880, 0.35, 'square', 0.35);
    this.tone(1320, 0.35, 'square', 0.25, 0.18);
  }

  /** 소리 테스트: 효과음 파일 (HTML audio) 직접 재생 */
  testSfxFile(): void {
    this.unlock();
    const a = this.sfxEls.pickup30?.[0];
    if (!a) return;
    a.currentTime = 0;
    a.play().catch((e) => this.log('효과음 파일 테스트', e));
  }

  // ───────────────────────── 기본 소리 재료 ─────────────────────────

  private tone(
    freq: number,
    dur: number,
    wave: Wave,
    vol: number,
    when = 0,
    slideTo?: number,
    dest: AudioNode | null = this.sfxBus,
    attack = 0.006,
  ): void {
    if (!this.ctx || !dest || freq <= 0) return;
    const t = this.ctx.currentTime + Math.max(0, when);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, when = 0, type: BiquadFilterType = 'lowpass', freq = 900, dest: AudioNode | null = this.sfxBus): void {
    if (!this.ctx || !dest || !this.noiseBuf) return;
    const t = this.ctx.currentTime + Math.max(0, when);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  /** 벨/글로켄: 기본음 + 비정수 배음의 짧은 반짝임 */
  private bell(freq: number, dur: number, vol: number, when = 0, dest: AudioNode | null = this.sfxBus, echo = false): void {
    this.tone(freq, dur, 'sine', vol, when, undefined, dest, 0.003);
    this.tone(freq * 2.76, dur * 0.35, 'sine', vol * 0.35, when, undefined, dest, 0.002);
    this.tone(freq * 5.4, dur * 0.12, 'sine', vol * 0.12, when, undefined, dest, 0.001);
    if (echo && this.echoIn) this.tone(freq, dur, 'sine', vol * 0.8, when, undefined, this.echoIn, 0.003);
  }

  // ───────────────────────── 효과음 ─────────────────────────

  /** 시작 버튼 */
  start(): void {
    if (this.sfxFile('start')) return;
    ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => this.bell(hz(n), 0.5, 0.32, i * 0.07));
    this.tone(hz('C4'), 0.4, 'triangle', 0.18, 0.02);
  }
  /** 알 흔들림 (톡톡) */
  eggWobble(): void {
    if (this.sfxFile('eggWobble')) return;
    this.tone(320, 0.06, 'triangle', 0.28, 0, 260);
    this.noise(0.04, 0.12, 0, 'bandpass', 2200);
  }
  /** 알에 금 가는 소리 */
  crack(): void {
    if (this.sfxFile('crack')) return;
    this.noise(0.08, 0.5, 0, 'highpass', 2500);
    this.noise(0.06, 0.4, 0.06, 'highpass', 3200);
    this.tone(900, 0.05, 'square', 0.12, 0, 600);
  }
  /** 머리카락 삐죽 */
  boing(): void {
    if (this.sfxFile('boing')) return;
    this.tone(260, 0.22, 'triangle', 0.32, 0, 620);
    this.tone(620, 0.18, 'sine', 0.18, 0.12, 400);
  }
  /** 알이 팍! 깨짐 + 탄생 반짝임 */
  hatch(): void {
    if (this.sfxFile('hatch')) return;
    this.noise(0.25, 0.75, 0, 'bandpass', 1800);
    this.noise(0.12, 0.5, 0, 'highpass', 4000);
    this.tone(180, 0.18, 'square', 0.25, 0, 90);
    ['F5', 'A5', 'C6', 'E6', 'F6'].forEach((n, i) => this.bell(hz(n), 0.6, 0.26, 0.12 + i * 0.07));
  }
  jump(): void {
    if (this.sfxFile('jump')) return;
    this.tone(330, 0.16, 'square', 0.2, 0, 700);
    this.tone(660, 0.1, 'triangle', 0.12, 0.03, 1000);
  }
  /** 둥지째 통 튀어오름 */
  nestJump(): void {
    if (this.sfxFile('nestJump')) return;
    this.tone(200, 0.18, 'triangle', 0.36, 0, 520);
    this.noise(0.06, 0.18, 0, 'bandpass', 1400);
  }
  doubleJump(): void {
    if (this.sfxFile('doubleJump')) return;
    this.tone(520, 0.14, 'square', 0.18, 0, 1100);
    this.bell(hz('E6'), 0.3, 0.2, 0.05);
  }
  pickup(points: number): void {
    if (this.sfxFile(points >= 30 ? 'pickup30' : points >= 20 ? 'pickup20' : 'pickup10')) return;
    const base = points >= 30 ? hz('G5') : points >= 20 ? hz('E5') : hz('C5');
    this.tone(base, 0.09, 'square', 0.2);
    this.tone(base * 1.5, 0.14, 'square', 0.2, 0.06);
    this.bell(base * 2, 0.35, 0.22, 0.1);
  }
  hit(): void {
    if (this.sfxFile('hit')) return;
    this.noise(0.3, 0.8, 0, 'lowpass', 900);
    this.tone(220, 0.3, 'square', 0.3, 0, 70);
    this.tone(110, 0.25, 'sine', 0.4, 0, 55);
  }
  gameOver(): void {
    if (this.sfxFile('gameOver')) return;
    ['G4', 'E4', 'C4', 'G3'].forEach((n, i) => this.tone(hz(n), 0.3, 'triangle', 0.32, i * 0.2));
  }
  /** 진화 시작: 반짝반짝 올라감 */
  evolve(): void {
    if (this.sfxFile('evolve')) return;
    ['C4', 'E4', 'G4', 'C5', 'E5', 'G5', 'C6'].forEach((n, i) => {
      this.tone(hz(n), 0.16, 'triangle', 0.22, i * 0.15);
      this.bell(hz(n) * 2, 0.4, 0.14, i * 0.15);
    });
  }
  /** 진화 완료 팡파레 */
  evolveDone(): void {
    if (this.sfxFile('evolveDone')) return;
    ['G5', 'C6'].forEach((n, i) => this.tone(hz(n), 0.2, 'square', 0.22, i * 0.09));
    this.bell(hz('E6'), 0.9, 0.34, 0.2);
    this.tone(hz('C4'), 0.6, 'triangle', 0.3, 0.2);
  }
  newRecord(): void {
    if (this.sfxFile('newRecord')) return;
    ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => this.bell(hz(n), 0.5, 0.26, i * 0.1));
  }

  // ── 보스전
  /** 머리카락 부메랑 슝 */
  throw(): void {
    if (this.sfxFile('throw')) return;
    this.noise(0.18, 0.35, 0, 'bandpass', 2600);
    this.tone(500, 0.16, 'triangle', 0.16, 0, 900);
  }
  /** 머리카락이 다시 붙음 (뽁) */
  catch(): void {
    if (this.sfxFile('catch')) return;
    this.tone(700, 0.07, 'sine', 0.26, 0, 1100);
    this.bell(hz('A5'), 0.2, 0.12, 0.03);
  }
  /** 보스가 맞음 */
  bossHit(): void {
    if (this.sfxFile('bossHit')) return;
    this.noise(0.12, 0.55, 0, 'bandpass', 1500);
    this.tone(300, 0.12, 'square', 0.22, 0, 160);
  }
  /** 뽀뽀 (쪽!) */
  smooch(): void {
    if (this.sfxFile('smooch')) return;
    this.tone(900, 0.05, 'sine', 0.3, 0, 1500);
    this.noise(0.05, 0.3, 0.02, 'highpass', 3500);
    this.tone(1200, 0.12, 'sine', 0.14, 0.05, 700);
  }
  /** 코로 흡입 (스으읍) */
  inhale(): void {
    if (this.sfxFile('inhale')) return;
    this.noise(0.9, 0.4, 0, 'bandpass', 900);
    this.noise(0.9, 0.25, 0.1, 'bandpass', 1800);
  }
  /** 냄새 구름 퐁 */
  puff(): void {
    if (this.sfxFile('puff')) return;
    this.noise(0.22, 0.45, 0, 'lowpass', 700);
    this.tone(140, 0.2, 'sine', 0.25, 0, 80);
  }
  /** 필살기 */
  special(): void {
    if (this.sfxFile('special')) return;
    ['C5', 'G5', 'C6', 'E6', 'G6'].forEach((n, i) => this.bell(hz(n), 0.5, 0.25, i * 0.06));
    this.noise(0.6, 0.5, 0.25, 'bandpass', 2000);
    this.tone(110, 0.6, 'square', 0.25, 0.3, 55);
  }
  /** 보스 쓰러짐 */
  bossDown(): void {
    if (this.sfxFile('bossDown')) return;
    this.noise(0.5, 0.7, 0, 'lowpass', 800);
    ['G4', 'E4', 'C4'].forEach((n, i) => this.tone(hz(n), 0.18, 'square', 0.2, i * 0.12));
    ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => this.bell(hz(n), 0.5, 0.24, 0.5 + i * 0.1));
  }
  /** 방패 (반짝 웅) */
  shield(): void {
    if (this.sfxFile('shield')) return;
    this.tone(440, 0.25, 'triangle', 0.22, 0, 880);
    this.bell(hz('E6'), 0.35, 0.18, 0.05);
    this.bell(hz('B6'), 0.3, 0.12, 0.1);
  }
  /** 보스 등장 경고 */
  warn(): void {
    if (this.sfxFile('warn')) return;
    for (let i = 0; i < 3; i++) this.tone(440, 0.14, 'square', 0.18, i * 0.22, 330);
  }

  // ───────────────────────── 배경음악 ─────────────────────────

  /** BGM 시작 또는 모드 전환 — 파일(우선) 또는 합성 */
  startMusic(mode: MusicMode = 'game'): void {
    this.wantMusic = mode;
    if (this.muted) return;
    if (this.playFileMusic(mode)) {
      this.stopSynth();
      return;
    }
    this.startSynthMusic(mode);
  }

  stopMusic(): void {
    this.wantMusic = null;
    this.pauseFileMusic();
    this.stopSynth();
    this.emit();
  }

  private startSynthMusic(mode: MusicMode): void {
    if (!this.ctx) return;
    this.musicSource = 'synth';
    this.mode = mode;
    if (this.musicTimer !== null) return;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    const tick = (): void => {
      if (!this.ctx) return;
      if (this.ctx.state !== 'running') {
        this.nextTime = this.ctx.currentTime + 0.08;
        return;
      }
      while (this.nextTime < this.ctx.currentTime + 0.35) {
        this.playStep(this.step, this.nextTime - this.ctx.currentTime);
        this.step++;
        this.nextTime += 60 / TEMPO[this.mode] / 4;
      }
    };
    tick();
    this.musicTimer = window.setInterval(tick, 90);
  }

  private stopSynth(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private playStep(step: number, when: number): void {
    const bus = this.musicBus;
    if (!bus) return;
    const game = this.mode === 'game';
    const s16 = 60 / TEMPO[this.mode] / 4;
    const bar = Math.floor(step / 16) % 8;
    const pos = step % 16;
    const chord = CHORDS[bar];

    // 신스 패드: 마디 첫 칸에 천천히 부풀었다 사라지는 화음 (살짝 어긋난 두 음으로 몽환적인 울림)
    if (pos === 0) {
      const len = s16 * 16 * 1.05;
      for (const n of chord) {
        const f = hz(n);
        this.tone(f, len, 'triangle', game ? 0.045 : 0.06, when, undefined, bus, len * 0.35);
        this.tone(f * 1.006, len, 'sine', game ? 0.04 : 0.055, when, undefined, bus, len * 0.4);
      }
    }
    // 잔잔한 베이스
    const root = hz(BASS_ROOT[bar]);
    if (game) {
      if (pos === 0 || pos === 8) this.tone(root, s16 * 6, 'triangle', 0.2, when, undefined, bus, 0.01);
      if (pos === 6 || pos === 14) this.tone(root * 2, s16 * 2, 'triangle', 0.1, when, undefined, bus, 0.01);
    } else if (pos === 0) {
      this.tone(root, s16 * 14, 'sine', 0.18, when, undefined, bus, 0.15);
    }
    // 글로켄 멜로디 (+메아리)
    for (const [p, n, l] of MELODY[bar]) {
      if (p === pos) this.bell(hz(n), Math.min(2.2, s16 * l * 1.6 + 0.4), game ? 0.13 : 0.12, when, bus, true);
    }
    // 반짝이 아르페지오 (화음 음 2옥타브 위, 아주 작게)
    const arp = game ? ARP_STEPS_GAME : ARP_STEPS_TITLE;
    const ai = arp.indexOf(pos);
    if (ai >= 0) {
      const n = chord[(ai + bar) % chord.length];
      this.bell(hz(n) * 4, 0.5, game ? 0.035 : 0.045, when, bus, !game);
    }
    // 가벼운 타악기 (게임 모드만)
    if (game) {
      if (pos === 0 || pos === 8) {
        this.tone(120, 0.16, 'sine', 0.3, when, 50, bus, 0.003); // 부드러운 킥
      }
      if (pos === 4 || pos === 12) this.noise(0.08, 0.06, when, 'bandpass', 1800, bus); // 손뼉 같은 스냅
      if (pos % 2 === 1) this.noise(0.03, pos % 4 === 3 ? 0.035 : 0.02, when, 'highpass', 7000, bus); // 셰이커
    }
  }
}

export const sound = new Sound();
