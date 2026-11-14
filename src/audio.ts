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
export type MusicMode = 'title' | 'game' | 'kiss' | 'kiss2' | 'sniff' | 'sniff2' | 'ending' | 'castle' | 'witch' | 'witch2';

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

// ───────────────────────── 보스전 · 엔딩 BGM (오리지널 작곡) ─────────────────────────
// 모두 'Dream Nest' 의 첫 동기(높은음 → 한 칸씩 내려왔다 다시 오름)를 변형해 기존 음악과 이어지게.
type Notes = [number, string, number][][];
/** 뽀뽀괴물: 장난스럽고 귀엽지만 살짝 위험 — D 단조, 빠른 8비트, 통통 튀는 베이스 */
const KISS_CHORDS = ['D3', 'Bb2', 'C3', 'A2', 'D3', 'G2', 'C3', 'A2'];
const KISS_TRIAD: string[][] = [
  ['D4', 'F4', 'A4'], ['Bb3', 'D4', 'F4'], ['C4', 'E4', 'G4'], ['A3', 'C#4', 'E4'],
  ['D4', 'F4', 'A4'], ['G3', 'Bb3', 'D4'], ['C4', 'E4', 'G4'], ['A3', 'C#4', 'E4'],
];
const KISS_LEAD: Notes = [
  [[0, 'A5', 2], [2, 'F5', 1], [4, 'E5', 1], [6, 'F5', 2], [10, 'A5', 1], [12, 'D6', 2]],
  [[0, 'D6', 2], [2, 'C6', 1], [4, 'Bb5', 2], [8, 'F5', 2], [12, 'G5', 1], [14, 'A5', 1]],
  [[0, 'G5', 2], [4, 'E5', 2], [6, 'G5', 1], [8, 'C6', 3], [12, 'Bb5', 1], [14, 'A5', 1]],
  [[0, 'A5', 3], [4, 'C#6', 2], [8, 'E6', 2], [12, 'A5', 2]],
  [[0, 'A5', 2], [2, 'F5', 1], [4, 'E5', 1], [6, 'F5', 2], [10, 'D6', 1], [12, 'F6', 2]],
  [[0, 'D6', 2], [4, 'Bb5', 2], [8, 'G5', 2], [12, 'D6', 2]],
  [[0, 'F6', 2], [2, 'E6', 1], [4, 'D6', 2], [8, 'C6', 2], [10, 'Bb5', 1], [12, 'C6', 2]],
  [[0, 'E6', 2], [4, 'C#6', 2], [8, 'A5', 4], [14, 'E5', 1]],
];
/** 킁카괴물: 최종 보스 — 웅장하면서 귀엽게, 낮은 신스 베이스 + 긴장감 있는 8비트 타악기 */
const SNIFF_ROOT = ['D2', 'Bb1', 'G1', 'A1', 'D2', 'F1', 'G1', 'A1'];
const SNIFF_TRIAD: string[][] = [
  ['D4', 'F4', 'A4'], ['Bb3', 'D4', 'F4'], ['G3', 'Bb3', 'D4'], ['A3', 'C#4', 'E4'],
  ['D4', 'F4', 'A4'], ['F3', 'A3', 'C4'], ['G3', 'Bb3', 'D4'], ['A3', 'C#4', 'E4'],
];
const SNIFF_LEAD: Notes = [
  [[0, 'D5', 4], [4, 'F5', 4], [8, 'A5', 6], [14, 'G5', 2]],
  [[0, 'F5', 4], [4, 'D5', 4], [8, 'Bb4', 8]],
  [[0, 'G5', 4], [4, 'Bb5', 4], [8, 'D6', 6], [14, 'C6', 2]],
  [[0, 'C#6', 8], [8, 'A5', 8]],
  [[0, 'A5', 4], [4, 'D6', 4], [8, 'F6', 6], [14, 'E6', 2]],
  [[0, 'C6', 4], [4, 'A5', 4], [8, 'F5', 8]],
  [[0, 'Bb5', 4], [4, 'D6', 4], [8, 'G6', 4], [12, 'F6', 4]],
  [[0, 'E6', 8], [8, 'C#6', 4], [12, 'E6', 4]],
];
/** 가족 엔딩 테마: 잔잔한 글로켄 + 부드러운 패드, 9마디부터 풍성해지고(가족에게 안기는 장면) 마지막 2마디 페이드아웃 — 16마디 1회 */
const END_CHORDS: string[][] = [
  ['F3', 'A3', 'C4', 'E4'], ['D3', 'F3', 'A3', 'C4'], ['Bb2', 'D3', 'F3', 'A3'], ['C3', 'F3', 'G3', 'Bb3'],
  ['A2', 'C3', 'E3', 'G3'], ['D3', 'F3', 'A3', 'C4'], ['Bb2', 'D3', 'F3', 'A3'], ['C3', 'E3', 'G3', 'Bb3'],
  ['F3', 'A3', 'C4', 'E4'], ['A2', 'C3', 'E3', 'G3'], ['Bb2', 'D3', 'F3', 'A3'], ['C3', 'F3', 'G3', 'Bb3'],
  ['D3', 'F3', 'A3', 'C4'], ['Bb2', 'D3', 'F3', 'A3'], ['G2', 'Bb2', 'D3', 'F3'], ['F3', 'A3', 'C4', 'E4'],
];
const END_BASS = ['F2', 'D2', 'Bb1', 'C2', 'A1', 'D2', 'Bb1', 'C2', 'F2', 'A1', 'Bb1', 'C2', 'D2', 'Bb1', 'G1', 'F2'];
const END_MELODY: Notes = [
  [[0, 'C6', 4], [4, 'A5', 2], [6, 'G5', 2], [8, 'A5', 8]],
  [[0, 'F5', 4], [4, 'G5', 2], [6, 'A5', 2], [8, 'D6', 8]],
  [[0, 'C6', 4], [4, 'A5', 4], [8, 'F5', 8]],
  [[0, 'G5', 12], [12, 'A5', 2], [14, 'Bb5', 2]],
  [[0, 'C6', 4], [4, 'E6', 4], [8, 'D6', 4], [12, 'C6', 4]],
  [[0, 'A5', 6], [6, 'F5', 2], [8, 'A5', 8]],
  [[0, 'Bb5', 4], [4, 'D6', 4], [8, 'C6', 8]],
  [[0, 'G5', 8], [8, 'E5', 8]],
  [[0, 'C6', 4], [4, 'A5', 2], [6, 'G5', 2], [8, 'A5', 6], [14, 'C6', 2]],
  [[0, 'E6', 4], [4, 'C6', 4], [8, 'A5', 8]],
  [[0, 'D6', 4], [4, 'F6', 4], [8, 'E6', 4], [12, 'D6', 4]],
  [[0, 'C6', 12], [12, 'G5', 2], [14, 'A5', 2]],
  [[0, 'F6', 4], [4, 'E6', 4], [8, 'D6', 4], [12, 'A5', 4]],
  [[0, 'D6', 6], [6, 'C6', 2], [8, 'Bb5', 8]],
  [[0, 'A5', 4], [4, 'Bb5', 4], [8, 'G5', 8]],
  [[0, 'F5', 16]],
];
/** 암흑의 성 · 이유식 마녀 (A 단조 · 화성 단조 G# 로 마녀 느낌) */
const WITCH_ROOT = ['A1', 'A1', 'F1', 'E1', 'A1', 'D2', 'F1', 'E1'];
const WITCH_TRIAD: string[][] = [
  ['A3', 'C4', 'E4'], ['A3', 'C4', 'E4'], ['F3', 'A3', 'C4'], ['E3', 'G#3', 'B3'],
  ['A3', 'C4', 'E4'], ['D3', 'F3', 'A3'], ['F3', 'A3', 'C4'], ['E3', 'G#3', 'B3'],
];
/**
 * 이유식 마녀 전투곡 (다크 · 픽셀 마녀 느낌): D 화성 단조 — 파이프오르간 화음 · 하프시코드 아르페지오 ·
 * 반음씩 내려가는 베이스 · 마녀 종소리 선율 (단2도·삼전음). 8마디 반복 (3페이즈판은 같은 빠르기·길이에 층만 더함)
 */
const WITCH_DARK_BASS = ['D2', 'C#2', 'C2', 'B1', 'Bb1', 'A1', 'Bb1', 'A1'];
const WITCH_DARK_CHORD: string[][] = [
  ['D3', 'F3', 'A3'], ['C#3', 'E3', 'A3'], ['C3', 'F3', 'A3'], ['B2', 'D3', 'G#3'],
  ['Bb2', 'D3', 'G3'], ['A2', 'C#3', 'E3'], ['Bb2', 'D3', 'F3'], ['A2', 'C#3', 'G3'],
];
const WITCH_DARK_LEAD: Notes = [
  [[0, 'D5', 3], [3, 'C#5', 1], [4, 'D5', 2], [6, 'F5', 2], [8, 'E5', 3], [11, 'D5', 1], [12, 'C#5', 4]],
  [[0, 'A4', 2], [2, 'Bb4', 2], [4, 'A4', 2], [6, 'G#4', 2], [8, 'A4', 8]],
  [[0, 'F5', 3], [3, 'E5', 1], [4, 'F5', 2], [6, 'A5', 2], [8, 'G#5', 4], [12, 'F5', 4]],
  [[0, 'E5', 2], [2, 'F5', 2], [4, 'D5', 2], [6, 'B4', 2], [8, 'G#4', 6], [14, 'B4', 2]],
  [[0, 'D5', 2], [2, 'G5', 3], [5, 'F#5', 1], [6, 'G5', 2], [8, 'Bb5', 4], [12, 'A5', 4]],
  [[0, 'G5', 2], [2, 'F5', 2], [4, 'E5', 2], [6, 'C#5', 2], [8, 'E5', 6], [14, 'Bb4', 2]],
  [[0, 'D5', 3], [3, 'Eb5', 1], [4, 'D5', 2], [6, 'Bb4', 2], [8, 'F5', 4], [12, 'D5', 4]],
  [[0, 'C#5', 4], [4, 'E5', 2], [6, 'G5', 2], [8, 'Bb5', 3], [11, 'A5', 1], [12, 'C#5', 4]],
];

/** 성으로 가는 길 (드문드문 울리는 으스스한 종소리) */
const CASTLE_BELL: Notes = [
  [[0, 'E5', 8], [12, 'C5', 4]],
  [[4, 'B4', 8]],
  [[0, 'C5', 8], [12, 'A4', 4]],
  [[0, 'G#4', 12]],
  [[0, 'E5', 6], [8, 'F5', 8]],
  [[4, 'D5', 8], [12, 'C5', 4]],
  [[0, 'A4', 8], [10, 'C5', 6]],
  [[0, 'B4', 8], [8, 'G#4', 8]],
];

/** 엔딩 곡 마디 수 (반복 없음) */
export const ENDING_BARS = 16;

const TEMPO: Record<MusicMode, number> = { title: 68, game: 96, kiss: 150, kiss2: 150, sniff: 124, sniff2: 124, ending: 84, castle: 84, witch: 112, witch2: 112 };

const AUDIO_DIR = 'assets/audio/';

/**
 * 끊김 없이 반복할 곡 (Web Audio 버퍼 반복): mp3 는 앞뒤에 인코더 무음이 붙어 <audio loop> 로는 반복 때 잠깐 끊김
 * → 받아서 해독한 뒤 실제 소리가 시작되는 자리부터 정확히 8마디(128칸)만 반복. 값 = 반복 칸 수
 */
const GAPLESS: Partial<Record<MusicMode, number>> = { castle: 128, witch: 128, witch2: 128 };
const loopSec = (mode: MusicMode): number => ((GAPLESS[mode] ?? 128) * 60) / TEMPO[mode] / 4;
/** 미리 만든 소리 파일 (tools/render_audio.cjs) */
export const MUSIC_FILES: Record<MusicMode, string> = {
  title: 'bgm-title.mp3',
  game: 'bgm-game.mp3',
  kiss: 'bgm-kiss.mp3',
  kiss2: 'bgm-kiss2.mp3',
  sniff: 'bgm-sniff.mp3',
  sniff2: 'bgm-sniff2.mp3',
  ending: 'bgm-ending.mp3',
  castle: 'bgm-castle.mp3',
  witch: 'bgm-witch.mp3',
  witch2: 'bgm-witch2.mp3',
};

/** 반복하지 않는 곡 (엔딩) */
const MUSIC_ONCE: Partial<Record<MusicMode, boolean>> = { ending: true };
export const SFX_NAMES = [
  'start', 'eggWobble', 'crack', 'boing', 'hatch', 'jump', 'nestJump', 'doubleJump',
  'pickup10', 'pickup20', 'pickup30', 'hit', 'gameOver', 'evolve', 'evolveDone', 'newRecord',
  'throw', 'catch', 'bossHit', 'smooch', 'inhale', 'special', 'bossDown', 'warn', 'puff', 'shield', 'rage', 'fart',
] as const;
export type SfxName = (typeof SFX_NAMES)[number];
/** 효과음 메서드 (성능 기록용) */
const SFX_METHODS = [
  'start', 'eggWobble', 'crack', 'boing', 'hatch', 'jump', 'nestJump', 'doubleJump', 'pickup', 'hit', 'gameOver', 'evolve',
  'evolveDone', 'newRecord', 'throw', 'catch', 'bossHit', 'smooch', 'inhale', 'special', 'bossDown', 'warn', 'puff', 'shield', 'rage', 'fart', 'curlyPop', 'curlyHit', 'starBurst', 'flaskThrow', 'glassBreak',
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
  /** 배경음악 <audio> 는 단 하나 — 곡을 바꿀 땐 src 만 바꿈 (요소가 하나라 두 곡이 동시에 날 수 없음) */
  private bgmEl!: HTMLAudioElement;
  /** bgmEl 에 지금 걸린 곡 */
  private bgmMode: MusicMode | null = null;
  private seekOnLoad: number | null = null;
  private musicBroken: Partial<Record<MusicMode, boolean>> = {};
  private sfxEls: Partial<Record<SfxName, HTMLAudioElement[]>> = {};
  private keepAliveEl: HTMLAudioElement | null = null;
  /** 배경음악 <audio> 를 사용자 입력 안에서 한 번 재생해 둔 적이 있는지 (iOS: 그 뒤엔 터치 없이 곡을 바꿔 틀 수 있음) */
  private bgmUnlocked = false;
  private wantMusic: MusicMode | null = null;
  /** 배경음악 요청 세대 — 새 요청(시작·정지·전환)마다 +1. 늦게 끝난 예전 play()/해독 결과는 세대가 다르면 무시 */
  private bgmGen = 0;
  /** (디버그) 최근 배경음악 시작·정지 기록 */
  readonly bgmLog: string[] = [];
  private logBgm(msg: string): void {
    const t = new Date();
    this.bgmLog.push(`${t.toTimeString().slice(0, 8)} ${msg}`);
    if (this.bgmLog.length > 12) this.bgmLog.shift();
  }
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
    const wake = (ev: Event): void => {
      this.lastGesture = ev.type;
      this.unlock();
    };
    for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) {
      window.addEventListener(ev, wake, { capture: true, passive: true });
    }
    // 배경음악 감시 (하나만): 0.4초마다 '들리는 배경음악은 최대 1개' 규칙을 강제 — 어떤 경로로 새어 나온 소리든 멈춤
    window.setInterval(() => this.enforceSingleBgm('watch'), 400);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // 앱 전환: 음악 멈춤 (돌아오면 다시)
        this.pauseFileMusic();
        return;
      }
      if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch((e) => this.log('resume(복귀)', e));
      if (this.wantMusic && !this.muted && !this.endingSrc) this.playFileMusic(this.wantMusic, false);
      this.emit();
    });
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  private lastUnlock = 0;
  private lastGesture = '';

  /**
   * 사용자 입력 안에서 호출: 오디오 시작/재개.
   * 터치 한 번에 pointerdown·touchend·click 등으로 여러 번 불리므로,
   * 처음 켠 뒤에는 '할 일이 있을 때만' + 1초에 한 번만 실제 작업을 함
   * (iOS 에서 매 터치 resume()/play()/pause() 를 부르면 메인 스레드가 멈칫함).
   */
  unlock(): void {
    const now = performance.now();
    if (this.ctx && this.unlockedOnce) {
      const ctxOk = this.ctx.state === 'running';
      const keepOk = !this.keepAliveEl || !this.keepAliveEl.paused;
      const want = this.wantedMusicEl();
      const musicOk = !want || this.muted || this.musicSource === 'synth' || !want.paused;
      if (ctxOk && keepOk && musicOk && this.bgmUnlocked) return;
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
    if (this.wantMusic && !this.muted && this.musicSource !== 'synth' && !this.endingSrc && (!want || want.paused)) this.playFileMusic(this.wantMusic, false);
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
    // 배경음악 요소 하나 (곡은 재생할 때 src 로 바꿈)
    const a = mk(AUDIO_DIR + MUSIC_FILES.title, true);
    this.bgmMode = 'title';
    a.addEventListener('error', () => {
      const m = this.bgmMode;
      if (!m) return;
      this.musicBroken[m] = true;
      this.log(`배경음악 파일 오류 (${MUSIC_FILES[m]})`, a.error?.message || `code ${a.error?.code}`);
    });
    a.addEventListener('loadedmetadata', () => {
      if (this.seekOnLoad === null) return;
      try {
        a.currentTime = this.seekOnLoad % (a.duration || 1);
      } catch {
        /* 무시 */
      }
      this.seekOnLoad = null;
    });
    a.addEventListener('playing', () => {
      this.enforceSingleBgm('playing');
      this.emit();
    });
    a.addEventListener('pause', () => this.emit());
    this.bgmEl = a;
    // 처음 화면 곡만 미리 받아 둠 (나머지는 그 곡을 틀 때 · 엔딩 곡은 보스전 때 prepareEnding)
    for (const m of ['game'] as MusicMode[]) fetch(AUDIO_DIR + MUSIC_FILES[m]).catch(() => undefined);
    this.mkEl = mk;
    // <audio>.volume 을 바꿀 수 있는 브라우저인지 (아이폰 Safari 는 항상 1 → 페이드 대신 바로 멈춤)
    try {
      const probe = new Audio();
      probe.volume = 0.5;
      this.volumeWorks = Math.abs(probe.volume - 0.5) < 0.01;
    } catch {
      this.volumeWorks = false;
    }
    // 효과음 파일(<audio>)은 Web Audio 가 안 될 때만 쓰는 예비 수단 → 처음부터 54개를 만들지 않음
    // (예전: 시작할 때 54개 다운로드 + 첫 터치 때 전부 재생→정지 = 아이폰에서 프롤로그 첫 화면이 크게 멈칫)
    try {
      this.keepAliveEl = mk(silentWavUrl(), true);
    } catch (e) {
      this.log('무음 유지용 오디오', e);
    }
  }

  private mkEl: ((src: string, loop: boolean) => HTMLAudioElement) | null = null;
  private volumeWorks = false;
  private fadeTimer = 0;
  private sfxFallbackReady = false;

  /** 효과음 예비 <audio> 만들기 (Web Audio 를 쓸 수 없을 때만, 사용자 입력 안에서) */
  private ensureSfxFallback(): void {
    if (this.sfxFallbackReady || !this.mkEl) return;
    this.sfxFallbackReady = true;
    const made: HTMLAudioElement[] = [];
    for (const n of SFX_NAMES) {
      const list = [0, 1].map(() => {
        const a = this.mkEl!(`${AUDIO_DIR}sfx-${n}.mp3`, false);
        a.preload = 'auto';
        return a;
      });
      this.sfxEls[n] = list;
      made.push(...list);
    }
    // 효과음 예비 파일(짧은 소리)만 음소거 재생→정지로 열어 둠 — 배경음악은 여기서 건드리지 않음
    for (const a of made) {
      a.muted = true;
      a.play().then(
        () => {
          a.pause();
          a.currentTime = 0;
          a.muted = false;
        },
        () => {
          a.muted = false;
        },
      );
    }
  }

  /**
   * 사용자 입력 안에서: 무음 유지 + (아직이면) 배경음악 요소를 한 번 '열어' 둠.
   * 예전엔 터치마다 다른 곡 <audio> 를 음소거로 재생→정지했는데(곡 7개), 아이폰에서 음소거가 무시되거나
   * 정지가 늦어지면 터치할 때마다 다른 곡이 하나씩 더 들렸음 → 이제 요소는 하나, 지금 원하는 곡이 없을 때만 한 번
   */
  private primeElements(): void {
    if (this.keepAliveEl && this.keepAliveEl.paused) {
      this.keepAliveEl.play().then(() => this.emit(), (e) => this.log('무음 유지 재생', e));
    }
    // Web Audio 를 못 쓰는 브라우저 / 앞선 터치에서 켜지지 않았으면 효과음 예비 파일 준비
    if (!this.ctx || (this.bgmUnlocked && this.ctx.state !== 'running')) this.ensureSfxFallback();
    if (this.bgmUnlocked || this.wantMusic || this.endingSrc) return; // 원하는 곡이 있으면 그 곡을 트는 것으로 열림
    const a = this.bgmEl;
    if (!a.paused) return;
    const gen = this.bgmGen;
    a.muted = true;
    this.bgmLog_('열기(음소거) 재생', this.bgmMode ?? '-', true);
    a.play().then(
      () => {
        this.bgmUnlocked = true;
        // 그사이 곡 요청이 없었으면 다시 멈춤 (있었으면 그 요청이 이미 이 요소를 맡음)
        if (gen === this.bgmGen && !this.wantMusic) a.pause();
        a.muted = false;
      },
      () => {
        a.muted = false;
      },
    );
  }

  /** 지금 재생되어야 하는 배경음악 <audio> */
  private wantedMusicEl(): HTMLAudioElement | null {
    if (!this.wantMusic || this.bgmMode !== this.wantMusic) return null;
    return this.bgmEl;
  }

  /** 배경음악 요소에 곡 걸기 (다른 곡이면 src 교체 — 이전 곡은 그 자리에서 끊김) */
  private loadBgm(mode: MusicMode): void {
    if (this.bgmMode === mode) return;
    const a = this.bgmEl;
    a.pause();
    a.loop = !MUSIC_ONCE[mode];
    a.preload = 'auto';
    a.src = AUDIO_DIR + MUSIC_FILES[mode];
    this.bgmMode = mode;
  }

  /** (디버그) 배경음악 재생 시도 기록: 무엇이·어디서 */
  private bgmLog_(what: string, mode: string, allowed: boolean): void {
    const stack = (new Error().stack ?? '').split('\n').slice(3, 5).map((l) => l.trim().replace(/^at /, '').replace(/\(.*\//, '(').slice(0, 48)).join(' < ');
    this.logBgm(`${allowed ? '▶' : '✕'} ${what} ${mode} · 세대 ${this.bgmGen}${this.lastGesture ? ` · 입력 ${this.lastGesture}` : ''} · ${stack}`);
    this.playCalls++;
  }
  /** (테스트·디버그) 배경음악 play() 호출 수 */
  playCalls = 0;

  /** fromStart: 새로 시작(true) / 끊겼던 곡 다시 이어 틀기(false — 앱 복귀·터치 깨우기, 처음으로 되돌리지 않음) */
  private playFileMusic(mode: MusicMode, fromStart = true): boolean {
    if (this.musicBroken[mode]) return false;
    // 엔딩 곡(Web Audio)이 나오는 중이면 파일 곡은 틀지 않음
    if (this.endingSrc) {
      this.bgmLog_('막음(엔딩 중)', mode, false);
      return true;
    }
    const gen = this.bgmGen;
    clearInterval(this.fadeTimer);
    // 끊김 없는 반복 곡: 버퍼가 준비돼 있으면 버퍼로 (아니면 아래 <audio> 로 — 그동안 받아 둠)
    if (this.loopMode && this.loopMode !== mode) this.stopLoop();
    if (GAPLESS[mode]) {
      if (this.playLoop(mode)) return true;
      this.prepareLoops([mode]);
    }
    this.loadBgm(mode);
    const el = this.bgmEl;
    if (this.volumeWorks) el.volume = 1;
    // 반복하지 않는 곡(엔딩)은 새로 시작할 때만 처음부터
    if (fromStart && MUSIC_ONCE[mode] && el.paused) {
      try {
        el.currentTime = 0;
      } catch {
        /* 로드 전 */
      }
    }
    if (!el.paused && !el.muted) return true;
    el.muted = false;
    this.bgmLog_('재생', mode, true);
    el.play().then(
      () => {
        this.bgmUnlocked = true;
        // 그사이 다른 요청(정지·다른 곡·엔딩 버퍼)이 있었으면 이 곡은 멈춤
        if (gen !== this.bgmGen || el !== this.wantedMusicEl() || this.endingSrc) {
          el.pause();
          this.logBgm(`늦게 시작된 ${mode} 정지 (세대 ${gen}→${this.bgmGen})`);
          return;
        }
        this.musicSource = 'file';
        this.emit();
      },
      (e) => {
        this.log(`배경음악 재생 (${mode})`, e);
        if ((e as Error)?.name === 'NotSupportedError' && gen === this.bgmGen && this.wantMusic === mode) {
          this.musicBroken[mode] = true;
          this.startSynthMusic(mode);
        }
      },
    );
    this.musicSource = 'file';
    return true;
  }

  /**
   * 배경음악 하나만 규칙 강제 (구조적 보장):
   *  - 엔딩 곡(Web Audio 버퍼)이 나오는 중이면 → 파일 음악·합성 음악 모두 멈춤, 버퍼도 지금 것 하나만
   *  - 아니면 → 지금 원하는 곡의 <audio> 하나만 (음소거 준비 재생은 소리가 없어 제외), 그 곡이 들리면 합성 음악 멈춤
   */
  private enforceSingleBgm(why: string): void {
    const want = this.endingSrc ? null : this.wantedMusicEl();
    const a = this.bgmEl;
    // 버퍼 반복 곡: 원하는 곡이 아니거나 엔딩 중이면 멈춤 · 나오는 중이면 같은 곡 <audio> 는 멈춤 (겹침 방지)
    if (this.loopSrc && (this.endingSrc || this.wantMusic !== this.loopMode)) {
      this.stopLoop();
      this.logBgm(`${why}: 원하지 않는 반복 버퍼 정지`);
    }
    if (this.loopSrc && !a.paused) a.pause();
    if (!a.paused && !a.muted && a !== want) {
      a.pause();
      this.logBgm(`${why}: 원하지 않는 ${this.bgmMode} 정지`);
    }
    for (const src of [...this.endingAll]) {
      if (src === this.endingSrc) continue;
      this.killSrc(src);
      this.logBgm(`${why}: 겹친 엔딩 버퍼 정지`);
    }
    const fileAudible = (!!want && !want.paused && !want.muted) || !!this.loopSrc;
    if (this.musicTimer !== null && (this.endingSrc || fileAudible || !this.wantMusic)) {
      this.stopSynth();
      this.logBgm(`${why}: 겹친 합성 음악 정지`);
    }
  }

  /** (디버그 패널·테스트) 배경음악 실제 상태 */
  bgmDebug(): { want: string; gen: number; active: number; html: string[]; webAudio: number; synth: boolean; ending: string; log: string[] } {
    const a = this.bgmEl;
    const html = a.paused ? [] : [`${this.bgmMode}${a.muted ? '(음소거)' : ''} ${a.currentTime.toFixed(1)}s`];
    if (this.loopSrc) html.push(`${this.loopMode}(버퍼 반복) ${this.loopPos().toFixed(1)}s`);
    // 음소거라도 재생 중이면 센다 (아이폰은 음소거를 무시할 수 있음)
    const audible = (a.paused ? 0 : 1) + (this.loopSrc ? 1 : 0);
    const synth = this.musicTimer !== null;
    return {
      want: this.endingSrc ? 'ending(버퍼)' : (this.wantMusic ?? '없음'),
      gen: this.bgmGen,
      active: audible + this.endingAll.size + (synth ? 1 : 0),
      html,
      webAudio: this.endingAll.size,
      synth,
      ending: this.endingMode ?? '-',
      log: this.bgmLog.slice(-5),
    };
  }

  private pauseFileMusic(): void {
    this.bgmEl.pause();
    this.stopLoop();
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
    const m = this.wantedMusicEl() ?? undefined;
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
    this.ensureSfxFallback();
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
  /** 마녀의 간사한 웃음 '흐흐흐~' (near = 가까이 · 크게) */
  witchLaugh(near = true): void {
    const v = near ? 0.22 : 0.08;
    for (let i = 0; i < 4; i++) {
      const f = 520 - i * 40;
      this.tone(f, 0.16, 'square', v, i * 0.17, f * 0.82);
      this.tone(f * 1.5, 0.12, 'triangle', v * 0.4, i * 0.17 + 0.01, f * 1.2);
    }
    this.noise(0.5, v * 0.5, 0, 'bandpass', 1200);
  }
  /** 우르르 쾅 (작은 번개) */
  /** 퉤! (이유식 받아치기) — 짧은 바람 소리 + 톡 */
  spit(strong = true): void {
    this.noise(0.09, strong ? 0.22 : 0.14, 0, 'bandpass', 2400);
    this.tone(strong ? 520 : 420, 0.08, 'square', 0.1, 0, strong ? 220 : 260);
  }

  /** 방패 반사 성공 (일반 방어와 확실히 다르게): 반짝 종소리 두 번 + 휙 */
  reflect(): void {
    this.bell(hz('E6'), 0.5, 0.16, 0);
    this.bell(hz('B6'), 0.6, 0.14, 0.07);
    this.noise(0.18, 0.12, 0.02, 'highpass', 3200);
    this.tone(660, 0.16, 'triangle', 0.12, 0, 1320);
  }

  /** 으앙! (울음 음파 한 번) — 커질수록 높고 크게 (level 0~1) */
  cry(level = 0.5): void {
    const f = 380 + level * 260;
    this.tone(f, 0.26, 'square', 0.07 + level * 0.06, 0, f * 0.72);
    this.tone(f * 1.5, 0.22, 'triangle', 0.05, 0.02, f * 1.1);
  }

  /** 리듬 박자 신호 (마녀가 숟가락을 휘두르는 박) */
  rhythmTick(accent = false): void {
    this.tone(accent ? 1180 : 880, 0.05, 'square', 0.06, 0);
  }

  /** 간식 콤보 (n 번째 연속일수록 조금씩 높게 · 짧고 경쾌하게) */
  comboChime(n: number): void {
    const steps = [0, 2, 4, 5, 7, 9, 11, 12];
    const f = hz('C6') * Math.pow(2, steps[Math.min(steps.length - 1, n - 2)] / 12);
    this.tone(f, 0.06, 'square', 0.07, 0.03);
  }

  /** 짧은 음성 효과 (방글할매 웃음·노래 — 새로 만든 음원 · 효과음 길로 재생: BGM 은 그대로 · 음소거 따름) */
  private voiceBufs = new Map<string, AudioBuffer | 'loading' | 'fail'>();
  private voiceSrc: AudioBufferSourceNode | null = null;
  /** (검증용) 마지막으로 재생한 음성 */
  lastVoice = '';
  preloadVoice(name: 'bangeul-laugh' | 'bangeul-song'): void {
    if (!this.ctx || this.voiceBufs.has(name)) return;
    const ctx = this.ctx;
    this.voiceBufs.set(name, 'loading');
    fetch(AUDIO_DIR + name + '.mp3')
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b))
      .then((buf) => this.voiceBufs.set(name, buf))
      .catch(() => this.voiceBufs.set(name, 'fail'));
  }
  /** 재생 (아직 못 읽었으면 false → 부른 쪽에서 종소리만) · 이전 음성은 멈춤 (겹치지 않게) */
  voice(name: 'bangeul-laugh' | 'bangeul-song', vol = 0.55): boolean {
    const buf = this.voiceBufs.get(name);
    if (!this.ctx || !this.sfxBus || !(buf instanceof AudioBuffer)) {
      this.preloadVoice(name);
      return false;
    }
    try {
      this.voiceSrc?.stop();
    } catch {
      /* 이미 끝남 */
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.sfxBus);
    src.start();
    this.voiceSrc = src;
    this.lastVoice = name;
    return true;
  }

  /** 방글할매 노래 음파 한 번 (목소리 아님 — 반짝이는 종소리 + 둥근 울림 · n 번째일수록 조금 높게) */
  bangeulWave(n = 1): void {
    const f = [hz('C6'), hz('E6'), hz('G6')][(n - 1) % 3];
    this.bell(f, 0.45, 0.14, 0);
    this.bell(f * 1.5, 0.35, 0.08, 0.05);
    this.tone(220, 0.28, 'sine', 0.16, 0, 140);
    this.noise(0.12, 0.08, 0, 'highpass', 4000);
  }

  /** 후드리챱챱 난타 한 번 (n 번째마다 챱 · 퍽 · 찰박 소리가 번갈아) */
  chop(n = 0): void {
    const k = n % 3;
    if (k === 0) {
      this.noise(0.07, 0.2, 0, 'bandpass', 2600); // 챱
      this.tone(300, 0.06, 'square', 0.07, 0, 180);
    } else if (k === 1) {
      this.noise(0.1, 0.26, 0, 'lowpass', 900); // 퍽
      this.tone(140, 0.09, 'sine', 0.2, 0, 70);
    } else {
      this.noise(0.14, 0.18, 0, 'bandpass', 1300); // 찰박
      this.tone(240, 0.1, 'triangle', 0.09, 0.02, 120);
    }
  }

  /** 철퍼덕 (이유식이 얼굴·바닥에 붙음) */
  splat(): void {
    this.noise(0.16, 0.2, 0, 'lowpass', 700);
    this.tone(180, 0.12, 'sine', 0.18, 0, 90);
  }

  thunder(): void {
    this.noise(0.08, 0.5, 0, 'highpass', 3000);
    this.noise(1.1, 0.32, 0.05, 'lowpass', 260);
    this.tone(60, 0.9, 'sine', 0.25, 0.05, 35);
  }
  /** 냄새 구름 퐁 */
  puff(): void {
    if (this.sfxFile('puff')) return;
    this.noise(0.22, 0.45, 0, 'lowpass', 700);
    this.tone(140, 0.2, 'sine', 0.25, 0, 80);
  }
  /** 보스 필살기 예고: 긴장감 있게 차오르는 소리 (sec 초) */
  specialCharge(sec = 1.4): void {
    if (this.sfxFile('warn')) return;
    this.tone(160, sec, 'sawtooth', 0.14, 0, 640);
    this.tone(240, sec, 'square', 0.08, 0.05, 960);
    this.noise(sec, 0.22, 0, 'bandpass', 1400);
  }
  /** 보스 필살기 발동: 쾅 + 휘잉 */
  specialBlast(): void {
    if (this.sfxFile('bossDown')) return;
    this.tone(90, 0.45, 'sine', 0.45, 0, 40);
    this.tone(180, 0.25, 'square', 0.18, 0, 70);
    this.noise(0.5, 0.55, 0, 'lowpass', 900);
    this.noise(0.35, 0.25, 0.08, 'highpass', 2500);
  }
  /** 안경잽이몹 플라스크 던지기: 코르크 '뽁' + 휘익 */
  flaskThrow(): void {
    if (this.sfxFile('throw')) return;
    this.tone(880, 0.05, 'square', 0.12, 0, 1320);
    this.noise(0.18, 0.12, 0.03, 'bandpass', 2400);
  }
  /** 유리병 '팡!' 깨지는 소리 (짤랑) */
  glassBreak(): void {
    if (this.sfxFile('catch')) return;
    this.noise(0.12, 0.28, 0, 'highpass', 4200);
    [2637, 3136, 3951].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.07, 0.02 + i * 0.035));
    this.tone(220, 0.08, 'square', 0.08, 0);
  }
  /** 배불뚝이 아저씨몹 방귀 '뿌웅' — 짧고 우스꽝스럽게 (낮은 부르릉 + 피식 바람) */
  fart(): void {
    if (this.sfxFile('fart')) return;
    this.tone(118, 0.11, 'sawtooth', 0.22, 0, 84);
    this.tone(92, 0.12, 'sawtooth', 0.24, 0.1, 128);
    this.tone(124, 0.16, 'square', 0.14, 0.21, 66);
    this.noise(0.34, 0.3, 0.02, 'lowpass', 520);
  }
  /** 고나 필살기 '초특급 꼬불머리 팡팡!' ① 컷인: 8비트 상승 아르페지오 + 반짝 (슬로모션 '슈우웅') */
  special(): void {
    if (this.sfxFile('special')) return;
    ['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'].forEach((n, i) => this.tone(hz(n), 0.09, 'square', 0.13, i * 0.055));
    this.tone(hz('C6'), 0.5, 'square', 0.07, 0.4);
    this.tone(hz('G6'), 0.5, 'square', 0.05, 0.4);
    this.bell(hz('C7'), 0.7, 0.14, 0.4, this.sfxBus, true);
    this.noise(0.7, 0.18, 0, 'bandpass', 3200);
  }
  /** ② 머리카락이 '뽁!' 빠져서 빛나며 커짐 (위로 쭉 올라가는 소리) */
  curlyPop(): void {
    if (this.sfxFile('catch')) return;
    this.tone(520, 0.06, 'square', 0.2, 0, 1040);
    this.tone(330, 0.45, 'triangle', 0.16, 0.06, 1320);
    this.tone(660, 0.45, 'square', 0.06, 0.08, 2640);
    this.noise(0.4, 0.14, 0.05, 'bandpass', 2600);
  }
  /** ③ 거대 부메랑 타격 (i = 0,1,2 → 점점 높고 세게) */
  curlyHit(i = 0): void {
    if (this.sfxFile('bossHit')) return;
    const up = 1 + i * 0.26;
    this.noise(0.14, 0.6, 0, 'bandpass', 1400 * up);
    this.tone(260 * up, 0.14, 'square', 0.24, 0, 120 * up);
    this.tone(hz(['E6', 'G6', 'C7'][i] ?? 'C7'), 0.12, 'square', 0.1, 0.02);
  }
  /** ④ 커다란 별 폭발 '팡!' + 반짝 꼬리 */
  starBurst(): void {
    if (this.sfxFile('bossDown')) return;
    this.tone(110, 0.5, 'square', 0.3, 0, 45);
    this.noise(0.55, 0.65, 0, 'lowpass', 1600);
    this.noise(0.3, 0.3, 0.02, 'highpass', 3600);
    ['G6', 'E6', 'C7', 'G6', 'C7'].forEach((n, i) => this.tone(hz(n), 0.08, 'square', 0.09, 0.18 + i * 0.07));
  }
  /** 보스 쓰러짐 */
  bossDown(): void {
    if (this.sfxFile('bossDown')) return;
    this.noise(0.5, 0.7, 0, 'lowpass', 800);
    ['G4', 'E4', 'C4'].forEach((n, i) => this.tone(hz(n), 0.18, 'square', 0.2, i * 0.12));
    ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => this.bell(hz(n), 0.5, 0.24, 0.5 + i * 0.1));
  }
  /** 보스 분노 (으르렁 + 쾅) */
  rage(): void {
    if (this.sfxFile('rage')) return;
    this.tone(120, 0.5, 'sawtooth', 0.28, 0, 70);
    this.tone(180, 0.45, 'square', 0.16, 0.05, 90);
    this.noise(0.4, 0.5, 0.05, 'lowpass', 500);
    this.noise(0.25, 0.6, 0.45, 'bandpass', 900);
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
    // 같은 곡이 이미 나오고 있으면 아무것도 안 함 (반복 요청으로 다시 시작·중복 없음)
    const cur = this.bgmMode === mode ? this.bgmEl : null;
    if (this.wantMusic === mode && !this.endingSrc && ((cur && !cur.paused && !cur.muted) || (this.loopMode === mode && this.loopSrc) || (this.musicSource === 'synth' && this.musicTimer !== null))) return;
    this.bgmGen++;
    this.logBgm(`시작 ${mode} (세대 ${this.bgmGen})`);
    if (this.endingSrc) this.stopEnding(); // 엔딩 곡이 남아 있으면 정리 (다시 시작·타이틀로)
    this.wantMusic = mode;
    if (this.muted) return;
    if (this.playFileMusic(mode)) {
      this.stopSynth();
      return;
    }
    this.startSynthMusic(mode);
  }

  /**
   * 배경음악을 자연스럽게 줄이며 멈춤 (ms). 음량을 못 바꾸는 아이폰은 바로 멈춤.
   * 다음 곡은 startMusic 으로.
   */
  fadeOutMusic(ms = 700): void {
    const el = this.wantedMusicEl();
    this.bgmGen++;
    this.logBgm(`페이드아웃 (세대 ${this.bgmGen})`);
    this.wantMusic = null;
    this.stopSynth();
    clearInterval(this.fadeTimer);
    if (this.loopSrc) {
      // 버퍼 반복 곡은 Web Audio 로 부드럽게 (아이폰도 됨)
      this.stopLoop(ms);
      this.emit();
      return;
    }
    if (!el || el.paused || !this.volumeWorks) {
      this.pauseFileMusic();
      this.emit();
      return;
    }
    const t0 = performance.now();
    this.fadeTimer = window.setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      el.volume = Math.max(0, 1 - k);
      if (k >= 1) {
        clearInterval(this.fadeTimer);
        el.pause();
        el.volume = 1;
        this.emit();
      }
    }, 40);
  }

  /**
   * 같은 길이·빠르기의 다른 판으로 같은 박자 위치에서 이어 바꿈 (분노 단계: kiss → kiss2 등)
   */
  switchMusicSync(mode: MusicMode): void {
    if (this.wantMusic === mode) return;
    // 버퍼 반복 곡끼리: 같은 박자 자리에서 바로 이어 바꿈 (끊김 없음)
    if (this.loopSrc && GAPLESS[mode] && this.loopBufs.has(mode) && !this.muted) {
      const pos = this.loopPos();
      this.bgmGen++;
      this.wantMusic = mode;
      this.stopLoop();
      if (this.playLoop(mode, pos)) return;
    }
    const from = this.wantedMusicEl();
    if (!from || from.paused || this.musicBroken[mode] || this.muted) {
      this.startMusic(mode);
      return;
    }
    // 같은 요소에서 곡만 바꾸고, 새 곡이 열리면 같은 박자 위치로
    this.seekOnLoad = from.currentTime;
    this.startMusic(mode);
  }

  /** 짧은 승리 팡파르 (보스 처치) */
  fanfare(): void {
    if (this.sfxFile('evolveDone')) return;
    ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => this.tone(hz(n), 0.12, 'square', 0.16, i * 0.11));
    ['C5', 'E5', 'G5', 'C6'].forEach((n) => this.tone(hz(n), 0.7, 'square', 0.08, 0.46));
    this.bell(hz('C7'), 0.9, 0.12, 0.46, this.sfxBus, true);
  }

  stopMusic(): void {
    clearInterval(this.fadeTimer);
    this.bgmGen++;
    this.logBgm(`정지 (세대 ${this.bgmGen})`);
    this.wantMusic = null;
    this.pauseFileMusic();
    this.stopSynth();
    this.stopEnding();
    this.emit();
  }

  // ───────────────────────── 끊김 없는 반복 곡 (Web Audio 버퍼 · 성으로 가는 길 · 마녀 전투곡) ─────────────────────────

  private loopBufs = new Map<MusicMode, { buf: AudioBuffer; lead: number }>();
  private loopLoads = new Map<MusicMode, Promise<boolean>>();
  private loopSrc: AudioBufferSourceNode | null = null;
  private loopGain: GainNode | null = null;
  /** 지금 버퍼로 반복 중인 곡 */
  loopMode: MusicMode | null = null;
  private loopT0 = 0;

  /** 미리 받아 해독 (마지막 모험·최종 보스 전에) — 실패하면 그 곡은 기존 <audio> 로 */
  prepareLoops(modes: MusicMode[]): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const mode of modes) {
      if (!GAPLESS[mode] || this.loopBufs.has(mode) || this.loopLoads.has(mode)) continue;
      const p = fetch(AUDIO_DIR + MUSIC_FILES[mode])
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.arrayBuffer();
        })
        .then((ab) => new Promise<AudioBuffer>((res, rej) => ctx.decodeAudioData(ab, res, rej)))
        .then((buf) => {
          // 인코더가 앞에 붙인 무음 건너뛰기: 처음으로 소리가 나는 자리 (곡은 반복의 두 번째 바퀴를 잘라 낸 것이라 0초부터 소리가 있음)
          const d = buf.getChannelData(0);
          let i = 0;
          const lim = Math.min(d.length, Math.floor(buf.sampleRate * 0.5));
          while (i < lim && Math.abs(d[i]) < 0.002) i++;
          const lead = i >= lim ? 0 : i / buf.sampleRate;
          if (lead + loopSec(mode) > buf.duration + 0.01) throw new Error('반복 길이보다 짧음');
          this.loopBufs.set(mode, { buf, lead });
          this.logBgm(`반복 버퍼 준비 ${mode} (앞 무음 ${(lead * 1000).toFixed(0)}ms)`);
          return true;
        })
        .catch((e) => {
          this.log(`반복 음악 준비 (${mode})`, e);
          this.loopLoads.delete(mode);
          return false;
        });
      this.loopLoads.set(mode, p);
    }
  }

  /** 버퍼 반복 재생 (offset = 반복 안에서 시작할 자리 초). 못 하면 false */
  private playLoop(mode: MusicMode, offset = 0): boolean {
    const ctx = this.ctx;
    const L = this.loopBufs.get(mode);
    if (!ctx || ctx.state !== 'running' || !L || !this.master || this.endingSrc) return false;
    if (this.loopMode === mode && this.loopSrc) return true;
    this.stopLoop();
    const len = loopSec(mode);
    const off = ((offset % len) + len) % len;
    const g = ctx.createGain();
    g.gain.value = 0.92;
    g.connect(this.master);
    const src = ctx.createBufferSource();
    src.buffer = L.buf;
    src.loop = true;
    src.loopStart = L.lead;
    src.loopEnd = L.lead + len;
    src.connect(g);
    src.start(0, L.lead + off);
    this.loopSrc = src;
    this.loopGain = g;
    this.loopMode = mode;
    this.loopT0 = ctx.currentTime - off;
    this.bgmEl.pause();
    this.musicSource = 'file';
    this.logBgm(`반복 버퍼 시작 ${mode} @${off.toFixed(2)}s`);
    this.emit();
    return true;
  }

  /** 반복 안에서 지금 자리 (초) */
  private loopPos(): number {
    if (!this.ctx || !this.loopMode) return 0;
    return (this.ctx.currentTime - this.loopT0) % loopSec(this.loopMode);
  }

  private stopLoop(fadeMs = 0): void {
    const src = this.loopSrc;
    const g = this.loopGain;
    this.loopSrc = null;
    this.loopGain = null;
    this.loopMode = null;
    if (!src || !g) return;
    const end = (): void => {
      try {
        src.stop();
      } catch {
        /* 이미 멈춤 */
      }
      src.disconnect();
      g.disconnect();
    };
    if (fadeMs > 0 && this.ctx) {
      const now = this.ctx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
      window.setTimeout(end, fadeMs + 30);
    } else end();
  }

  // ───────────────────────── 엔딩 곡 (Web Audio 버퍼: 자막 나올 때 음량 낮추기·페이드가 아이폰에서도 됨) ─────────────────────────

  private endingBuf: AudioBuffer | null = null;
  private endingLoad: Promise<boolean> | null = null;
  private endingSrc: AudioBufferSourceNode | null = null;
  /** 시작한 엔딩 버퍼 소스 전부 (끝나면 빠짐) — 하나를 넘으면 감시가 정리 */
  private endingAll = new Set<AudioBufferSourceNode>();
  private killSrc(src: AudioBufferSourceNode): void {
    this.endingAll.delete(src);
    try {
      src.stop();
    } catch {
      /* 이미 끝남 */
    }
    src.disconnect();
  }
  private endingGain: GainNode | null = null;
  /** 엔딩 곡이 Web Audio 로 재생 중인지 (아니면 <audio> 파일로 재생 — 음량 조절 안 됨) */
  endingMode: 'buffer' | 'file' | null = null;

  get endingReady(): boolean {
    return !!this.endingBuf;
  }

  /** 엔딩 곡 미리 받기·해독 (최종 보스전 때 미리 — 엔딩 시작 때 멈칫 없게). 실패하면 false */
  prepareEnding(): Promise<boolean> {
    if (this.endingBuf) return Promise.resolve(true);
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve(false);
    if (!this.endingLoad) {
      this.endingLoad = fetch(AUDIO_DIR + MUSIC_FILES.ending)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.arrayBuffer();
        })
        .then((ab) => new Promise<AudioBuffer>((res, rej) => ctx.decodeAudioData(ab, res, rej)))
        .then((b) => {
          this.endingBuf = b;
          return true;
        })
        .catch((e) => {
          this.log('엔딩 음악 준비', e);
          this.endingLoad = null;
          return false;
        });
    }
    return this.endingLoad;
  }

  /** 엔딩 곡 처음부터 (다른 배경음악은 모두 멈춤 — 겹쳐 나오지 않게) */
  playEndingTrack(offsetSec = 0): void {
    this.stopMusic();
    const ctx = this.ctx;
    if (ctx && ctx.state === 'running' && this.endingBuf && this.master) {
      const g = ctx.createGain();
      g.gain.value = 0.92;
      g.connect(this.master);
      const src = ctx.createBufferSource();
      src.buffer = this.endingBuf;
      src.connect(g);
      // 늦게 시작하면 그만큼 건너뛰어 장면과 박자를 맞춤
      src.start(0, Math.max(0, Math.min(offsetSec, this.endingBuf.duration - 1)));
      src.onended = () => {
        this.endingAll.delete(src);
        if (this.endingSrc === src) this.endingSrc = null;
      };
      this.endingAll.add(src);
      this.endingSrc = src;
      this.logBgm(`엔딩 버퍼 시작 ${offsetSec.toFixed(1)}s`);
      this.endingGain = g;
      this.endingMode = 'buffer';
      this.emit();
      return;
    }
    // 예비: <audio> 파일 (아이폰은 음량을 바꿀 수 없어 낮추기·페이드 없이 그대로 재생)
    this.startMusic('ending');
    this.endingMode = 'file';
    this.seekFile(offsetSec);
  }

  private seekFile(sec: number): void {
    const el = this.bgmEl;
    if (this.bgmMode !== 'ending' || sec <= 0) return;
    try {
      el.currentTime = sec;
    } catch {
      /* 로드 전 */
    }
  }

  /** 자막(내레이션)이 나오는 동안 음악을 살짝 낮춤 */
  duckEnding(on: boolean): void {
    if (!this.ctx || !this.endingGain) return;
    this.endingGain.gain.setTargetAtTime(on ? 0.58 : 0.92, this.ctx.currentTime, 0.35);
  }

  /** 엔딩 곡을 sec 초 동안 천천히 줄여 끝냄 */
  fadeOutEnding(sec: number): void {
    if (this.endingMode === 'file') {
      this.fadeOutMusic(sec * 1000);
      return;
    }
    if (!this.ctx || !this.endingGain) return;
    const g = this.endingGain.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + sec);
  }

  stopEnding(): void {
    this.endingSrc = null;
    for (const src of [...this.endingAll]) this.killSrc(src);
    this.endingGain?.disconnect();
    this.endingGain = null;
    this.endingMode = null;
  }

  private startSynthMusic(mode: MusicMode): void {
    if (!this.ctx || this.endingSrc) return;
    this.logBgm(`합성 음악 ${mode}`);
    this.pauseFileMusic(); // 합성 음악과 파일 음악이 겹치지 않게
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
    if (this.mode === 'kiss' || this.mode === 'kiss2') return this.playKiss(step, when, bus, this.mode === 'kiss2');
    if (this.mode === 'sniff' || this.mode === 'sniff2') return this.playSniff(step, when, bus, this.mode === 'sniff2');
    if (this.mode === 'ending') return this.playEnding(step, when, bus);
    if (this.mode === 'castle') return this.playCastle(step, when, bus);
    if (this.mode === 'witch' || this.mode === 'witch2') return this.playWitch(step, when, bus, this.mode === 'witch2');
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

  /** 뽀뽀괴물 전투곡 (intense = 분노: 킥 4박·16분 하이햇·리드 옥타브 겹침·아르페지오) */
  private playKiss(step: number, when: number, bus: AudioNode, intense: boolean): void {
    const s16 = 60 / TEMPO.kiss / 4;
    const bar = Math.floor(step / 16) % 8;
    const pos = step % 16;
    const root = hz(KISS_CHORDS[bar]);
    // 통통 튀는 신스 베이스 (8분음표, 옥타브 왔다 갔다)
    if (pos % 2 === 0) this.tone(root * (pos % 4 === 2 ? 2 : 1), s16 * 1.5, 'square', 0.11, when, undefined, bus, 0.004);
    if (intense && pos % 2 === 1 && pos % 4 === 3) this.tone(root * 2, s16 * 0.8, 'square', 0.06, when, undefined, bus, 0.003);
    // 화음 '짝' (2·4박에 짧게)
    if (pos === 4 || pos === 12) for (const n of KISS_TRIAD[bar]) this.tone(hz(n), s16 * 1.2, 'triangle', 0.035, when, undefined, bus, 0.005);
    // 타악기
    if (pos === 0 || pos === 8 || (intense && (pos === 4 || pos === 12 || pos === 14))) this.tone(130, 0.14, 'sine', 0.32, when, 48, bus, 0.003);
    if (pos === 4 || pos === 12) this.noise(0.09, 0.09, when, 'bandpass', 1900, bus);
    if (intense ? true : pos % 2 === 1) this.noise(0.025, pos % 4 === 2 ? 0.035 : 0.02, when, 'highpass', 7500, bus);
    // 리드 (스타카토 사각파) — 분노 땐 한 옥타브 위를 작게 겹침
    for (const [p, n, l] of KISS_LEAD[bar]) {
      if (p !== pos) continue;
      this.tone(hz(n), s16 * l * 0.85, 'square', 0.075, when, undefined, bus, 0.004);
      if (intense) this.tone(hz(n) * 2, s16 * l * 0.6, 'square', 0.03, when, undefined, bus, 0.004);
    }
    // 마디 끝 '뾰옹' (장난스러운 미끄럼)
    if (pos === 15 && bar % 2 === 1) this.tone(hz('A5'), s16 * 1.2, 'triangle', 0.05, when, hz('D6'), bus, 0.003);
    // 분노: 16분 아르페지오 반짝이
    if (intense) {
      const tri = KISS_TRIAD[bar];
      this.tone(hz(tri[pos % 3]) * 2, s16 * 0.7, 'triangle', 0.025, when, undefined, bus, 0.003);
    }
  }

  /** 킁카괴물 전투곡 (intense = 2차 분노: 베이스 8분 펄스·16분 하이햇·북 추가·아르페지오) */
  private playSniff(step: number, when: number, bus: AudioNode, intense: boolean): void {
    const s16 = 60 / TEMPO.sniff / 4;
    const bar = Math.floor(step / 16) % 8;
    const pos = step % 16;
    const root = hz(SNIFF_ROOT[bar]);
    // 낮은 신스 베이스 (길게 + 분노 땐 8분 펄스)
    if (pos === 0) this.tone(root, s16 * 7, 'sawtooth', 0.09, when, undefined, bus, 0.02);
    if (pos === 8) this.tone(root, s16 * 6, 'sawtooth', 0.07, when, undefined, bus, 0.02);
    if (intense && pos % 2 === 0) this.tone(root * 2, s16 * 1.4, 'square', 0.05, when, undefined, bus, 0.004);
    // 웅장한 패드 (마디 첫 칸)
    if (pos === 0) for (const n of SNIFF_TRIAD[bar]) this.tone(hz(n), s16 * 16, 'triangle', 0.035, when, undefined, bus, s16 * 4);
    // 긴장감 있는 8비트 타악기: 낮은 북(톰) · 스네어 · 하이햇
    if (pos === 0 || pos === 6 || pos === 10 || (intense && (pos === 3 || pos === 13))) this.tone(pos === 0 ? 95 : 140, 0.22, 'sine', 0.3, when, 45, bus, 0.003);
    if (pos === 4 || pos === 12) this.noise(0.12, 0.1, when, 'bandpass', 1500, bus);
    if (intense ? true : pos % 2 === 1) this.noise(0.03, 0.022, when, 'highpass', 6800, bus);
    // 멜로디 (글로켄 + 사각파 겹침 — 귀엽고 웅장하게)
    for (const [p, n, l] of SNIFF_LEAD[bar]) {
      if (p !== pos) continue;
      this.bell(hz(n), Math.min(2, s16 * l * 1.3 + 0.3), 0.1, when, bus, true);
      this.tone(hz(n), s16 * l * 0.9, 'square', 0.04, when, undefined, bus, 0.01);
    }
    if (intense) {
      const tri = SNIFF_TRIAD[bar];
      this.tone(hz(tri[(pos + bar) % 3]) * 2, s16 * 0.7, 'square', 0.022, when, undefined, bus, 0.003);
    }
  }

  /** 암흑의 성으로 가는 길 (긴장감 · 느린 심장 박동 · 낮은 지속음 · 드문드문 종소리) */
  private playCastle(step: number, when: number, bus: AudioNode): void {
    const s16 = 60 / TEMPO.castle / 4;
    const bar = Math.floor(step / 16) % 8;
    const pos = step % 16;
    const root = hz(WITCH_ROOT[bar]);
    if (pos === 0) {
      this.tone(root, s16 * 16, 'sawtooth', 0.05, when, undefined, bus, s16 * 3);
      this.tone(root * 1.5, s16 * 16, 'triangle', 0.035, when, undefined, bus, s16 * 4);
      for (const n of WITCH_TRIAD[bar]) this.tone(hz(n), s16 * 16, 'sine', 0.03, when, undefined, bus, s16 * 6);
    }
    // 두근… 두근 (심장 박동)
    if (pos === 0 || pos === 3) this.tone(pos === 0 ? 70 : 62, 0.26, 'sine', 0.34, when, 40, bus, 0.004);
    // 똑딱 (시계 · 긴장)
    if (pos % 4 === 2) this.noise(0.03, 0.025, when, 'highpass', 5200, bus);
    for (const [p, n, l] of CASTLE_BELL[bar]) {
      if (p === pos) this.bell(hz(n), Math.min(2.6, s16 * l * 1.4 + 0.5), 0.08, when, bus, true);
    }
  }

  /** 오르간 화음 한 음 (서서히 커져 마디 끝까지 유지 → 짧게 사라짐 — 끊김 없는 패드) */
  private organ(freq: number, dur: number, vol: number, when: number, bus: AudioNode): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + Math.max(0, when);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.09);
    g.gain.setValueAtTime(vol, t + Math.max(0.1, dur - 0.08));
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.02);
    g.connect(bus);
    // 살짝 어긋난 사각파 두 개 + 한 옥타브 위 = 파이프오르간 느낌
    for (const [mul, type, k] of [[1, 'square', 1], [1.004, 'square', 0.8], [2, 'triangle', 0.6]] as [number, OscillatorType, number][]) {
      const o = this.ctx.createOscillator();
      const og = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq * mul, t);
      og.gain.value = k;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  /**
   * 이유식 마녀 전투곡 (다크 · 8마디 반복): 파이프오르간 화음 + 반음씩 내려가는 베이스 + 하프시코드 아르페지오 + 마녀 종소리 선율
   * intense = 3페이즈판 (같은 빠르기·길이): 베이스 16분 · 아르페지오 16분 · 북 · 하이햇 16분 · 선율 옥타브
   */
  private playWitch(step: number, when: number, bus: AudioNode, intense: boolean): void {
    const s16 = 60 / TEMPO.witch / 4;
    const bar = Math.floor(step / 16) % 8;
    const pos = step % 16;
    const bass = hz(WITCH_DARK_BASS[bar]);
    const chord = WITCH_DARK_CHORD[bar];
    // 오르간 화음 (마디 내내)
    if (pos === 0) for (const n of chord) this.organ(hz(n), s16 * 16, 0.012, when, bus);
    // 베이스: 8분 (으스스하게 근음-옥타브-근음-5도) · 3페이즈는 16분
    if (pos % 2 === 0 || intense) {
      const pat = [1, 1, 2, 1, 1.5, 1, 2, 1.5];
      const f = bass * pat[Math.floor(pos / 2) % 8];
      this.tone(f, s16 * (intense ? 0.9 : 1.7), 'sawtooth', intense ? 0.05 : 0.06, when, undefined, bus, 0.004);
    }
    // 하프시코드 아르페지오 (화음 올라갔다 내려옴) — 평소 8분 · 3페이즈 16분
    if (intense || pos % 2 === 0) {
      const arp = [chord[0], chord[1], chord[2], chord[1]];
      const n = hz(arp[(intense ? pos : pos / 2) % 4]) * 2;
      this.tone(n, s16 * 0.7, 'square', 0.022, when, undefined, bus, 0.002);
    }
    // 북: 1·(2의 뒤)·3 (낮고 둔탁하게) · 손뼉 같은 림 · 3페이즈는 하이햇·스네어 몰아치기
    if (pos === 0 || pos === 6 || pos === 8 || (intense && (pos === 11 || pos === 14))) this.tone(pos === 0 ? 74 : 92, 0.24, 'sine', 0.3, when, 40, bus, 0.003);
    if (pos === 4 || pos === 12) this.noise(0.08, 0.06, when, 'bandpass', 1300, bus);
    if (intense) this.noise(0.025, pos % 4 === 2 ? 0.03 : 0.016, when, 'highpass', 7600, bus);
    if (intense && bar === 7 && pos >= 12) this.noise(0.06, 0.05, when, 'bandpass', 1900, bus);
    // 마녀 종소리 선율 (사각파 + 종 메아리)
    for (const [p, nn, l] of WITCH_DARK_LEAD[bar]) {
      if (p !== pos) continue;
      this.tone(hz(nn), s16 * l * 0.8, 'square', 0.03, when, undefined, bus, 0.006);
      this.bell(hz(nn), Math.min(1.8, s16 * l * 1.3 + 0.3), 0.06, when, bus, true);
      if (intense) this.tone(hz(nn) / 2, s16 * l * 0.8, 'triangle', 0.035, when, undefined, bus, 0.006);
    }
  }

  /** 가족 엔딩 테마 (16마디 1회): 글로켄 + 패드 → 9마디부터 베이스·대선율·반짝이로 풍성 → 마지막 2마디 페이드아웃 */
  private playEnding(step: number, when: number, bus: AudioNode): void {
    if (step >= ENDING_BARS * 16) return;
    const s16 = 60 / TEMPO.ending / 4;
    const bar = Math.floor(step / 16);
    const pos = step % 16;
    const full = bar >= 8;
    const fade = bar >= 14 ? Math.max(0.12, 1 - (step - 14 * 16) / 32) : 1;
    const chord = END_CHORDS[bar];
    if (pos === 0) {
      const len = s16 * 16 * (bar === 15 ? 2.2 : 1.05);
      for (const n of chord) {
        this.tone(hz(n), len, 'triangle', 0.05 * fade, when, undefined, bus, len * 0.35);
        this.tone(hz(n) * 1.005, len, 'sine', 0.045 * fade, when, undefined, bus, len * 0.4);
      }
    }
    for (const [p, n, l] of END_MELODY[bar]) {
      if (p === pos) this.bell(hz(n), Math.min(3, s16 * l * 1.6 + 0.5), 0.14 * fade, when, bus, true);
    }
    if (full) {
      // 잔잔한 베이스 · 한 옥타브 아래 대선율 · 반짝이 아르페지오
      if (pos === 0) this.tone(hz(END_BASS[bar]), s16 * 14, 'sine', 0.17 * fade, when, undefined, bus, 0.15);
      if (pos === 8) this.tone(hz(END_BASS[bar]) * 1.5, s16 * 6, 'sine', 0.07 * fade, when, undefined, bus, 0.1);
      for (const [p, n, l] of END_MELODY[bar]) if (p === pos && l >= 4) this.tone(hz(n) / 2, s16 * l * 0.9, 'sine', 0.05 * fade, when, undefined, bus, 0.05);
      if (pos % 4 === 2) this.bell(hz(chord[(pos / 2 + bar) % chord.length]) * 4, 0.5, 0.04 * fade, when, bus, true);
    } else if (pos === 0) {
      this.tone(hz(END_BASS[bar]), s16 * 14, 'sine', 0.1, when, undefined, bus, 0.2);
    }
  }
}

export const sound = new Sound();
