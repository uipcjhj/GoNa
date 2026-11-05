/**
 * Web Audio 로 즉석에서 만드는 8비트 효과음과 배경음악.
 * (오디오 파일 없이 동작, 모바일은 첫 터치 후 소리가 켜집니다)
 */
import { STORAGE_KEYS } from './config';
import { storage } from './storage';

type Wave = OscillatorType;

const NOTE: Record<string, number> = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0,
  C3: 130.81, F3: 174.61, G3: 196.0, A3: 220.0,
};

// 느긋한 농장 느낌의 짧은 반복 멜로디 (8분음표 단위, '-' 는 쉼표)
const MELODY = [
  'E5', 'G5', 'C5', 'G5', 'A5', 'G5', 'E5', '-',
  'D5', 'E5', 'F5', 'E5', 'D5', 'C5', 'D5', '-',
  'E5', 'G5', 'C5', 'G5', 'A5', 'G5', 'E5', 'C5',
  'D5', 'F5', 'E5', 'D5', 'C5', '-', 'C5', '-',
];
const BASS = ['C3', 'C3', 'A3', 'A3', 'F3', 'F3', 'G3', 'G3'];

class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicTimer: number | null = null;
  private step = 0;
  private nextTime = 0;
  muted: boolean;

  constructor() {
    this.muted = storage.get(STORAGE_KEYS.muted) === '1';
  }

  /** 사용자 터치 이벤트 안에서 호출해야 모바일에서 소리가 납니다. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    storage.set(STORAGE_KEYS.muted, m ? '1' : '0');
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
  }

  private tone(freq: number, dur: number, wave: Wave, vol: number, when = 0, slideTo?: number): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number): void {
    if (!this.ctx || !this.master) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    src.connect(filter).connect(g).connect(this.master);
    src.start();
  }

  jump(): void {
    this.tone(330, 0.14, 'square', 0.12, 0, 660);
  }
  doubleJump(): void {
    this.tone(520, 0.12, 'square', 0.1, 0, 1040);
    this.tone(780, 0.1, 'triangle', 0.08, 0.05, 1300);
  }
  pickup(points: number): void {
    const base = points >= 30 ? NOTE.G5 : points >= 20 ? NOTE.E5 : NOTE.C5;
    this.tone(base, 0.08, 'square', 0.09);
    this.tone(base * 1.5, 0.12, 'square', 0.09, 0.06);
  }
  hit(): void {
    this.noise(0.25, 0.35);
    this.tone(220, 0.25, 'square', 0.12, 0, 80);
  }
  gameOver(): void {
    [NOTE.G4, NOTE.E4, NOTE.C4, NOTE.G3].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.16, i * 0.18));
  }
  newRecord(): void {
    [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C5 * 2].forEach((f, i) => this.tone(f, 0.14, 'square', 0.08, i * 0.1));
  }

  startMusic(): void {
    if (!this.ctx || this.musicTimer !== null) return;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.05;
    const stepDur = 0.2;
    const schedule = (): void => {
      if (!this.ctx) return;
      while (this.nextTime < this.ctx.currentTime + 0.3) {
        const when = this.nextTime - this.ctx.currentTime;
        const n = MELODY[this.step % MELODY.length];
        if (n !== '-') this.tone(NOTE[n], stepDur * 0.9, 'triangle', 0.05, when);
        if (this.step % 4 === 0) {
          const b = BASS[Math.floor(this.step / 4) % BASS.length];
          this.tone(NOTE[b], stepDur * 3.5, 'triangle', 0.06, when);
        }
        this.step++;
        this.nextTime += stepDur;
      }
    };
    schedule();
    this.musicTimer = window.setInterval(schedule, 100);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}

export const sound = new Sound();
