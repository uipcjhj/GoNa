/**
 * 배경음악·효과음을 파일로 미리 녹음 (게임 안의 합성 코드를 그대로 사용).
 *   public/assets/audio/bgm-title.mp3, bgm-game.mp3  (끊김 없이 반복되도록 2번 연주 중 두 번째 반복을 잘라 냄)
 *   public/assets/audio/sfx-*.mp3
 * 사용법: npm run build && npx vite preview --port 4173 (다른 터미널)
 *        node tools/render_audio.cjs
 * 필요: ffmpeg
 * 내레이션 중 낮춘 배경음악(아이폰용): ffmpeg -i bgm-title.mp3 -af volume=0.32 -c:a libmp3lame -b:a 96k bgm-title-duck.mp3
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT = path.join(__dirname, '../public/assets/audio');
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gona-audio-'));
const URL = process.env.GAME_URL || 'http://localhost:4173/';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const page = await b.newPage();
  await page.goto(URL + '?test');
  await page.waitForFunction(() => !!window.__sound);
  const render = (job) => page.evaluate(async (job) => {
    const s = window.__sound;
    const SR = 44100;
    const off = new OfflineAudioContext(1, Math.ceil(SR * job.secs), SR);
    s.ctx = off; s.unlockedOnce = true; s.muted = false; s.forceSynth = true; s.build();
    let base = 0;
    Object.defineProperty(off, 'currentTime', { get: () => base, configurable: true });
    if (job.music) {
      s.mode = job.music;
      const st = 60 / job.tempo / 4;
      for (let i = 0; i < 256; i++) s.playStep(i, i * st);
    } else {
      s[job.sfx](...(job.args || []));
    }
    delete off.currentTime;
    const buf = await off.startRendering();
    let d = buf.getChannelData(0);
    if (job.music) {
      // 두 번째 반복만: 첫 반복의 잔향이 앞에 섞여 있어 이어 붙여도 자연스러움
      const loop = Math.round(128 * (60 / job.tempo / 4) * SR);
      d = d.slice(loop, loop * 2);
    } else {
      // 뒤쪽 무음 잘라 내기
      let end = d.length;
      while (end > 1000 && Math.abs(d[end - 1]) < 0.0015) end--;
      d = d.slice(0, Math.min(d.length, end + 2000));
    }
    const n = d.length; const ab = new ArrayBuffer(44 + n * 2); const v = new DataView(ab);
    const w = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    let peak = 0;
    for (let i = 0; i < n; i++) { const x = Math.max(-1, Math.min(1, d[i])); peak = Math.max(peak, Math.abs(x)); v.setInt16(44 + i * 2, x * 32767, true); }
    let bin = ''; const u = new Uint8Array(ab);
    for (let i = 0; i < u.length; i += 8192) bin += String.fromCharCode(...u.subarray(i, i + 8192));
    return { data: btoa(bin), peak, secs: n / SR };
  }, job);

  const jobs = [
    { name: 'bgm-title', music: 'title', tempo: 68, secs: 256 * (60 / 68 / 4) + 3, kbps: 112 },
    { name: 'bgm-game', music: 'game', tempo: 96, secs: 256 * (60 / 96 / 4) + 3, kbps: 112 },
    ...['start', 'eggWobble', 'crack', 'boing', 'hatch', 'jump', 'nestJump', 'doubleJump', 'hit', 'gameOver', 'evolve', 'evolveDone', 'newRecord']
      .map((n) => ({ name: `sfx-${n}`, sfx: n, secs: 3, kbps: 96 })),
    ...[10, 20, 30].map((p) => ({ name: `sfx-pickup${p}`, sfx: 'pickup', args: [p], secs: 1.5, kbps: 96 })),
  ];
  for (const j of jobs) {
    const r = await render(j);
    const wav = path.join(TMP, `${j.name}.wav`);
    fs.writeFileSync(wav, Buffer.from(r.data, 'base64'));
    // 아이폰은 <audio> 볼륨을 코드로 못 바꾸므로 파일 자체 크기를 맞춤 (음악 0.8 · 효과음 0.9 피크)
    const target = j.music ? 0.8 : 0.9;
    const gain = Math.min(8, target / Math.max(0.01, r.peak));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-af', `volume=${gain.toFixed(3)}`, '-codec:a', 'libmp3lame', '-b:a', `${j.kbps}k`, path.join(OUT, `${j.name}.mp3`)]);
    console.log(`${j.name}.mp3  ${r.secs.toFixed(1)}s  peak ${r.peak.toFixed(2)} → x${gain.toFixed(1)}`);
  }
  await b.close();
})();
