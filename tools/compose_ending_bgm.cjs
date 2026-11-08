/**
 * 가족 엔딩 전용 배경음악 (오리지널 곡) — 코드로 작곡·합성해 파일로 저장
 *   public/assets/audio/bgm-ending.mp3   (모노, 약 2분, 엔딩 장면 길이에 맞춰 한 곡으로 이어짐)
 *
 * 분위기: 따뜻하고 아련한 엔딩 · 아늑한 픽셀 게임 느낌 · 느린 템포(76BPM, D장조)
 * 악기(모두 합성): 로즈 피아노(FM) · 글로켄슈필 · 따뜻한 벨 · 부드러운 8비트 펄스 · 어쿠스틱 기타(현 튕김 합성) · 패드 · 베이스 · 아주 작은 킥·셰이커
 * 멜로디·화성은 이 파일에서 새로 쓴 것 (다른 곡의 멜로디·샘플 사용 안 함)
 *
 * 구성 (마디 = 3.158초, 엔딩 장면과 같은 순서):
 *   0~2  SCENE 01 처음 만난 세상      — 로즈 + 글로켄 반짝임 (잔잔하게)
 *   3~6  SCENE 02 어느새 자란 고나     — 8비트 아르페지오 (모험 회상)
 *   7~9  SCENE 03 기다리고 있던 얼굴들 — 기타·패드·베이스 들어옴
 *   10~11 SCENE 04 달려가는 고나       — 걷는 베이스 + 작은 킥·셰이커
 *   12~14 SCENE 05 가족의 품           — 주제 선율 (감정 고조)
 *   15~18 SCENE 06 뽀뽀와 킁카
 *   19~20 SCENE 07 고나의 깨달음       — 거의 비움 (패드·벨만)
 *   21~24 SCENE 08 마지막 가족사진     — 마지막 후렴 (가장 풍성)
 *   25~27 타이틀 · 28~33 크레딧 · 34~36 마지막 문구 → 천천히 사라짐
 *
 * 실행: node tools/compose_ending_bgm.cjs   (ffmpeg 필요)
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const SR = 44100;
const BPM = 76;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const BARS = 37;
const TAIL = 5;
const N = Math.ceil((BARS * BAR + TAIL) * SR);
const out = new Float32Array(N);
const wet = new Float32Array(N); // 잔향으로 보낼 신호

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const T = (bar, beat = 0) => (bar * 4 + beat) * BEAT;

// 장면별 전체 세기 (마디마다)
const DYN = [];
for (let b = 0; b < BARS; b++) {
  let v = 0.62;
  if (b >= 3) v = 0.74;
  if (b >= 7) v = 0.8;
  if (b >= 10) v = 0.9;
  if (b >= 12) v = 1.0;
  if (b >= 19) v = 0.7;
  if (b >= 21) v = 1.0;
  if (b >= 25) v = 0.85;
  if (b >= 28) v = 0.78;
  if (b >= 34) v = 0.7;
  DYN.push(v);
}
const dynAt = (t) => DYN[Math.min(BARS - 1, Math.max(0, Math.floor(t / BAR)))];

function add(t0, buf, gain, send = 0.25) {
  const i0 = Math.round(t0 * SR);
  const g = gain * dynAt(t0);
  for (let i = 0; i < buf.length; i++) {
    const j = i0 + i;
    if (j >= N) break;
    out[j] += buf[i] * g;
    wet[j] += buf[i] * g * send;
  }
}

// ───────── 악기 ─────────
function rhodes(m, dur) {
  const f = mtof(m);
  const len = Math.ceil((dur + 1.6) * SR);
  const b = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.004) * Math.exp(-t / (1.2 + 0.4 * (60 / m))) * (t > dur ? Math.exp(-(t - dur) / 0.25) : 1);
    const idx = 1.6 * Math.exp(-t / 0.35) + 0.25;
    const mod = Math.sin(2 * Math.PI * f * t) * idx;
    const tine = 0.12 * Math.sin(2 * Math.PI * f * 4.0 * t) * Math.exp(-t / 0.08);
    const trem = 1 + 0.06 * Math.sin(2 * Math.PI * 4.5 * t);
    b[i] = (Math.sin(2 * Math.PI * f * t + mod) + tine) * env * trem;
  }
  return b;
}
function glock(m, dur) {
  const f = mtof(m);
  const len = Math.ceil(Math.max(dur, 1.2) * SR);
  const b = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const a = Math.min(1, t / 0.002);
    b[i] = a * (Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.7) + 0.35 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t / 0.18) + 0.15 * Math.sin(2 * Math.PI * f * 5.4 * t) * Math.exp(-t / 0.07));
  }
  return b;
}
function bell(m, dur) {
  const f = mtof(m);
  const len = Math.ceil((dur + 2.2) * SR);
  const b = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const a = Math.min(1, t / 0.006);
    b[i] = a * (Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 1.8) + 0.3 * Math.sin(2 * Math.PI * f * 2.0 * t) * Math.exp(-t / 0.9) + 0.18 * Math.sin(2 * Math.PI * f * 3.01 * t) * Math.exp(-t / 0.5));
  }
  return b;
}
function pulse(m, dur) {
  // 부드러운 8비트 (25% 펄스 → 한 번 걸러 낸 소리)
  const f = mtof(m);
  const len = Math.ceil((dur + 0.15) * SR);
  const b = new Float32Array(len);
  let y = 0;
  const k = 1 - Math.exp((-2 * Math.PI * 2400) / SR);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const ph = (t * f) % 1;
    const x = ph < 0.25 ? 1 : -0.33;
    y += k * (x - y);
    const env = Math.min(1, t / 0.006) * Math.exp(-t / 0.35) * (t > dur ? Math.exp(-(t - dur) / 0.04) : 1);
    b[i] = y * env;
  }
  return b;
}
function guitar(m, dur) {
  // 현 튕김 (Karplus-Strong)
  const f = mtof(m);
  const p = Math.max(2, Math.round(SR / f));
  const len = Math.ceil((dur + 1.4) * SR);
  const b = new Float32Array(len);
  const ring = new Float32Array(p);
  let seed = (m * 9301 + 49297) % 233280;
  for (let i = 0; i < p; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    ring[i] = (seed / 233280) * 2 - 1;
  }
  // 손끝 느낌 (밝기 줄임)
  for (let k = 0; k < 2; k++) for (let i = 1; i < p; i++) ring[i] = 0.5 * (ring[i] + ring[i - 1]);
  let idx = 0;
  const damp = 0.996;
  for (let i = 0; i < len; i++) {
    const nxt = (idx + 1) % p;
    const v = ring[idx];
    ring[idx] = damp * 0.5 * (ring[idx] + ring[nxt]);
    idx = nxt;
    const t = i / SR;
    b[i] = v * (t > dur + 0.6 ? Math.exp(-(t - dur - 0.6) / 0.2) : 1);
  }
  return b;
}
function pad(ms, dur) {
  const len = Math.ceil((dur + 1.2) * SR);
  const b = new Float32Array(len);
  let y = 0;
  const k = 1 - Math.exp((-2 * Math.PI * 1100) / SR);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    let x = 0;
    for (const m of ms) {
      const f = mtof(m);
      for (const d of [-0.12, 0.13]) {
        const ph = (t * f * (1 + d / 100)) % 1;
        x += (ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph) / (ms.length * 2);
      }
    }
    y += k * (x - y);
    const env = Math.min(1, t / 0.9) * (t > dur ? Math.exp(-(t - dur) / 0.6) : 1);
    b[i] = y * env;
  }
  return b;
}
function bass(m, dur) {
  const f = mtof(m);
  const len = Math.ceil((dur + 0.3) * SR);
  const b = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.01) * Math.exp(-t / 1.2) * (t > dur ? Math.exp(-(t - dur) / 0.08) : 1);
    b[i] = (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t)) * env;
  }
  return b;
}
function kick() {
  const len = Math.ceil(0.35 * SR);
  const b = new Float32Array(len);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const f = 48 + 70 * Math.exp(-t / 0.04);
    ph += (2 * Math.PI * f) / SR;
    b[i] = Math.sin(ph) * Math.exp(-t / 0.13);
  }
  return b;
}
let nseed = 12345;
function shaker() {
  const len = Math.ceil(0.08 * SR);
  const b = new Float32Array(len);
  let prev = 0;
  for (let i = 0; i < len; i++) {
    nseed = (nseed * 1103515245 + 12345) & 0x7fffffff;
    const x = (nseed / 0x7fffffff) * 2 - 1;
    const hp = x - prev;
    prev = x;
    const t = i / SR;
    b[i] = hp * Math.min(1, t / 0.008) * Math.exp(-t / 0.025);
  }
  return b;
}

// ───────── 화성 ─────────
const CH = {
  Dmaj7: { bass: 38, v: [50, 54, 57, 61], arp: [62, 66, 69, 73] },
  Bm7: { bass: 35, v: [47, 50, 54, 57], arp: [59, 62, 66, 69] },
  Gmaj7: { bass: 31, v: [55, 59, 62, 66], arp: [67, 71, 74, 78] },
  A: { bass: 33, v: [52, 57, 61, 64], arp: [64, 69, 73, 76] },
  'F#m7': { bass: 30, v: [54, 57, 61, 64], arp: [66, 69, 73, 76] },
  Em7: { bass: 28, v: [52, 55, 59, 62], arp: [64, 67, 71, 74] },
  A7sus: { bass: 33, v: [57, 62, 64, 67], arp: [69, 74, 76, 79] },
  Em9: { bass: 28, v: [52, 55, 59, 62, 66], arp: [64, 67, 71, 78] },
};
const PROG = ['Dmaj7', 'Bm7', 'Gmaj7', 'Gmaj7', 'A', 'F#m7', 'Bm7', 'Em7', 'A7sus', 'Dmaj7', 'Gmaj7', 'A', 'Dmaj7', 'F#m7', 'Bm7', 'Gmaj7', 'A', 'Bm7', 'A7sus', 'Em9', 'A7sus', 'Dmaj7', 'Bm7', 'Gmaj7', 'A', 'Dmaj7', 'Gmaj7', 'Dmaj7', 'Gmaj7', 'A', 'F#m7', 'Bm7', 'Em7', 'A7sus', 'Dmaj7', 'Gmaj7', 'Dmaj7'];

// ───────── 선율 (마디, 박, 길이(박), 음) ─────────
const MEL = [];
const m = (bar, list) => list.forEach(([beat, d, n]) => MEL.push([bar, beat, d, n]));
// SCENE 01
m(0, [[2, 2, 81]]);
m(1, [[0, 1.5, 78], [1.5, 0.5, 76], [2, 2, 74]]);
m(2, [[0, 2, 71], [2, 2, 74]]);
// SCENE 02
const s2 = [
  [[0, 1, 83], [1, 1, 81], [2, 2, 78]],
  [[0, 1, 76], [1, 1, 78], [2, 2, 81]],
  [[0, 1, 81], [1, 1, 78], [2, 1, 76], [3, 1, 73]],
  [[0, 3, 74]],
];
s2.forEach((x, i) => m(3 + i, x));
// SCENE 03
const s3 = [
  [[0, 1.5, 79], [1.5, 0.5, 78], [2, 2, 76]],
  [[0, 2, 81], [2, 2, 76]],
  [[0, 4, 78]],
];
s3.forEach((x, i) => m(7 + i, x));
// SCENE 04
m(10, [[0, 0.5, 74], [0.5, 0.5, 76], [1, 0.5, 78], [1.5, 0.5, 79], [2, 1, 81], [3, 1, 83]]);
m(11, [[0, 0.5, 81], [0.5, 0.5, 79], [1, 0.5, 78], [1.5, 0.5, 76], [2, 2, 81]]);
// SCENE 05 (주제)
const theme = [
  [[0, 1, 78], [1, 1, 81], [2, 1.5, 86], [3.5, 0.5, 85]],
  [[0, 1, 85], [1, 1, 81], [2, 2, 76]],
  [[0, 1, 74], [1, 1, 78], [2, 2, 83]],
];
theme.forEach((x, i) => m(12 + i, x));
// SCENE 06
m(15, [[0, 1, 83], [1, 1, 81], [2, 1, 79], [3, 1, 78]]);
m(16, [[0, 1.5, 76], [1.5, 0.5, 78], [2, 2, 81]]);
m(17, [[0, 1, 78], [1, 1, 74], [2, 2, 71]]);
m(18, [[0, 2, 69], [2, 1, 73], [3, 1, 76]]);
// SCENE 07
m(19, [[1, 3, 83]]);
m(20, [[0, 4, 81]]);
// SCENE 08 (마지막 후렴)
m(21, theme[0]);
m(22, [[0, 1, 86], [1, 1, 83], [2, 2, 78]]);
m(23, [[0, 1, 79], [1, 1, 83], [2, 1.5, 86], [3.5, 0.5, 85]]);
m(24, [[0, 2, 85], [2, 2, 88]]);
// 타이틀
m(25, [[0, 4, 78]]);
m(26, [[0, 2, 79], [2, 2, 83]]);
m(27, [[0, 4, 81]]);
// 크레딧 (회상 선율을 가볍게)
s2.forEach((x, i) => m(28 + i, x));
m(32, s3[0]);
m(33, s3[1]);
// 마지막 문구
m(34, [[0, 2, 78], [2, 2, 81]]);
m(35, [[0, 2, 83], [2, 2, 81]]);
m(36, [[0, 1, 81], [1, 1, 78], [2, 4, 74]]);

// ───────── 배치 ─────────
for (let b = 0; b < BARS; b++) {
  const c = CH[PROG[b]];
  const sec = b < 3 ? 'intro' : b < 7 ? 'memory' : b < 10 ? 'wait' : b < 12 ? 'run' : b < 19 ? 'chorus' : b < 21 ? 'still' : b < 25 ? 'final' : b < 28 ? 'title' : b < 34 ? 'credits' : 'end';
  // 로즈 화음
  const hits = sec === 'intro' || sec === 'still' || sec === 'end' || sec === 'title' ? [[0, 4]] : sec === 'chorus' || sec === 'final' ? [[0, 1.5], [1.5, 1.5], [3, 1]] : [[0, 2.5], [2.5, 1.5]];
  if (sec !== 'still') for (const [bt, d] of hits) c.v.forEach((n, k) => add(T(b, bt) + k * 0.012, rhodes(n, d * BEAT), 0.085));
  // 패드 (기다림부터)
  if (b >= 7) add(T(b), pad(c.v, BAR), sec === 'still' ? 0.22 : 0.13, 0.4);
  // 베이스
  if (b >= 7 && sec !== 'still') {
    if (sec === 'run' || sec === 'final') {
      [[0, c.bass], [1, c.bass + 7], [2, c.bass + 12], [3, c.bass + 7]].forEach(([bt, n]) => add(T(b, bt), bass(n, BEAT * 0.9), 0.2, 0.05));
    } else {
      add(T(b), bass(c.bass, BEAT * 2.4), 0.2, 0.05);
      if (sec === 'chorus' || sec === 'credits') add(T(b, 2.5), bass(c.bass + 7, BEAT * 1.4), 0.15, 0.05);
    }
  }
  // 글로켄 반짝임 (처음·고요·끝)
  if (sec === 'intro' || sec === 'end' || sec === 'title') [0, 1.5, 3].forEach((bt, k) => add(T(b, bt), glock(c.arp[(b + k) % c.arp.length] + 12, 0.8), 0.05, 0.45));
  if (sec === 'still') add(T(b, 0), bell(c.arp[0] + 12, 3), 0.06, 0.5);
  // 8비트 아르페지오 (모험 회상·달리기·크레딧)
  if (sec === 'memory' || sec === 'run' || sec === 'credits') {
    for (let s = 0; s < 8; s++) add(T(b, s * 0.5), pulse(c.arp[[0, 1, 2, 3, 2, 1, 0, 1][s]], BEAT * 0.42), sec === 'credits' ? 0.03 : 0.04, 0.3);
  }
  // 기타 (기다림부터, 고요 빼고)
  if (b >= 7 && sec !== 'still' && sec !== 'end') {
    const pat = [c.bass + 12, c.v[1], c.v[2], c.v[3], c.v[1] + 12, c.v[2], c.v[3], c.v[1]];
    pat.forEach((n, s) => add(T(b, s * 0.5) + 0.004 * s, guitar(n, BEAT * 0.5), 0.11, 0.2));
  }
  // 아주 작은 북
  if (sec === 'run' || sec === 'chorus' || sec === 'final') {
    if (sec !== 'chorus' || b < 15) [0, 2].forEach((bt) => add(T(b, bt), kick(), 0.32, 0.02));
    for (let s = 0; s < 8; s++) add(T(b, s * 0.5), shaker(), s % 2 ? 0.05 : 0.03, 0.05);
  }
}
// 선율: 글로켄(위 옥타브는 살짝) + 벨 / 후렴은 로즈도 겹침
for (const [bar, beat, d, n] of MEL) {
  const t = T(bar, beat);
  const dur = d * BEAT;
  const lead = bar >= 12 && bar < 19 ? 'chorus' : bar >= 21 && bar < 25 ? 'final' : '';
  add(t, bell(n, dur), 0.16, 0.35);
  add(t, glock(n + 12, dur), lead ? 0.05 : 0.035, 0.4);
  if (lead) add(t, rhodes(n, dur), 0.1, 0.25);
  if (bar >= 3 && bar < 7) add(t, pulse(n, dur * 0.9), 0.05, 0.25);
}

// ───────── 잔향 (Schroeder) ─────────
function reverb(x) {
  const y = new Float32Array(x.length);
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => ({ d, buf: new Float32Array(d), i: 0, fb: 0.8, lp: 0 }));
  for (let n = 0; n < x.length; n++) {
    let s = 0;
    for (const c of combs) {
      const o = c.buf[c.i];
      c.lp = o * 0.7 + c.lp * 0.3;
      c.buf[c.i] = x[n] + c.lp * c.fb;
      c.i = (c.i + 1) % c.d;
      s += o;
    }
    y[n] = s / combs.length;
  }
  for (const d of [556, 441, 341]) {
    const buf = new Float32Array(d);
    let i = 0;
    for (let n = 0; n < y.length; n++) {
      const b = buf[i];
      const v = y[n] + b * 0.5;
      buf[i] = v;
      y[n] = b - v * 0.5;
      i = (i + 1) % d;
    }
  }
  return y;
}
const rv = reverb(wet);
for (let i = 0; i < N; i++) out[i] += rv[i] * 0.9;

// 마지막 6초 서서히 사라짐 + 첫 0.3초 부드럽게
const fadeStart = (BARS * BAR + TAIL - 8) * SR;
for (let i = 0; i < N; i++) {
  if (i < 0.3 * SR) out[i] *= i / (0.3 * SR);
  if (i > fadeStart) out[i] *= Math.max(0, 1 - (i - fadeStart) / (N - fadeStart)) ** 1.5;
}
// 정규화 (-1.5dB)
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(out[i]));
const g = 0.84 / peak;
const pcm = Buffer.alloc(44 + N * 2);
pcm.write('RIFF', 0);
pcm.writeUInt32LE(36 + N * 2, 4);
pcm.write('WAVEfmt ', 8);
pcm.writeUInt32LE(16, 16);
pcm.writeUInt16LE(1, 20);
pcm.writeUInt16LE(1, 22);
pcm.writeUInt32LE(SR, 24);
pcm.writeUInt32LE(SR * 2, 28);
pcm.writeUInt16LE(2, 32);
pcm.writeUInt16LE(16, 34);
pcm.write('data', 36);
pcm.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(out[i] * g * 32767))), 44 + i * 2);
const tmp = path.join(os.tmpdir(), 'gona-ending.wav');
fs.writeFileSync(tmp, pcm);
const dst = path.join(__dirname, '../public/assets/audio/bgm-ending.mp3');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '96k', dst]);
if (process.env.KEEP_WAV) fs.copyFileSync(tmp, process.env.KEEP_WAV);
console.log(`bgm-ending.mp3: ${(N / SR).toFixed(1)}s · ${(fs.statSync(dst).size / 1024).toFixed(0)}KB · bar ${BAR.toFixed(3)}s`);
