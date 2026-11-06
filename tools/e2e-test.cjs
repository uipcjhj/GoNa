/**
 * 모바일 자동 테스트 (Playwright): 간식 점수·표정·점프·충돌·무적·일시정지·게임오버·다시하기,
 * 그리고 이미지가 없을 때 기본 그래픽으로 동작하는지 확인합니다.
 * 실패한 리소스 로드(선택 이미지 404)는 오류로 보지 않습니다.
 */
const { chromium, devices } = require('playwright');
// 사용법: npm run build && npx vite preview --port 4173  (다른 터미널)
//        node tools/e2e-test.cjs [스크린샷 폴더]
const S = process.argv[2] || require('os').tmpdir();
const URL = process.env.GAME_URL || 'http://localhost:4173/';
const results = [];
/** 알 부화 시네마틱 → 대표 타이틀 등장 → '게임 시작' → 1단계 시작까지 */
async function startFromTitle(page) {
  // 스토리 프롤로그는 건너뛰기로 넘김 (프롤로그 자체는 introTests 에서 검사)
  await page.waitForSelector('.op-skip', { state: 'visible', timeout: 15000 });
  await page.locator('.op-skip').click();
  await page.waitForSelector('.cover.revealed', { timeout: 15000 });
  await page.waitForTimeout(2600); // 카메라 물러남 + 버튼 나타남
  const box = await page.locator('.cover-btn').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => window.__gona?.scene.getScene('Game')?.state === 'playing', null, { timeout: 12000 });
}
const check = (name, ok, info = "") => { const line = `${ok ? "PASS" : "FAIL"} ${name} ${info}`; results.push(line); if (process.env.PROGRESS) console.error(line); };
async function run(label, device, { noImages = false, stage = null } = {}) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...device, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to process file|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  if (noImages) await page.route(/assets\/(character|snacks)\/.*\.png$/, r => r.abort());
  await page.goto(URL + '?test'); await page.waitForTimeout(1500);
  await page.screenshot({ path: `${S}/t5-${label}-title.png` });
  const ev = (fn, arg) => page.evaluate(([f, a]) => { const sc = window.__gona.scene.getScene('Game'); return eval(f)(sc, a); }, [fn.toString(), arg]);
  await startFromTitle(page);
  await page.waitForTimeout(1300);
  // 성장 단계 지정 (null = 시작 단계 그대로)
  if (stage !== null) await ev((sc, i) => sc.debugSetStage(i), stage);
  // 기대 프레임은 '현재 성장 단계의 모습' 정의에서 읽어 옴
  const info = await ev((sc) => ({ custom: sc.vis.source !== 'fallback' || sc.vis.happyFrame >= 0, happy: sc.vis.happyFrame, sur: sc.vis.surprisedFrame, run: sc.vis.runFrames, jump: sc.vis.jumpFrame, idle: sc.vis.idleFrame, stage: sc.growth.stage.name, state: sc.state }));
  const isRun = (f) => info.run.map(String).includes(String(f)) || String(f) === String(info.idle);
  check(`${label}: game started`, info.state === 'playing', `${info.stage} ${JSON.stringify(info.run)}`);
  await ev((sc) => { sc.distToNext = 1e9; sc.entities.forEach(e => { e.sprite.destroy(); }); sc.entities = []; });
  const frame = () => ev((sc) => ({ f: sc.player.frame.name, y: sc.player.y, alt: sc.alt, score: sc.score, hearts: sc.hearts, inv: sc.invincibleUntil - sc.time.now, grounded: sc.grounded }));

  // 간식 획득 + 점수
  for (const [kind, pts] of [['strawberry', 10], ['banana', 20], ['cookie', 30]]) {
    const before = await frame();
    await ev((sc, k) => sc.addSnack(k, sc.playerX + 22, 4), kind);
    let s; for (let i = 0; i < 40; i++) { s = await frame(); if (s.score !== before.score) break; await page.waitForTimeout(15); }
    check(`${label}: ${kind} +${pts}`, s.score - before.score === pts, `score ${before.score}->${s.score}`);
    await page.waitForTimeout(150);
    const mid = await frame();
    if (info.happy < 0) check(`${label}: no expression frame in this stage (pose kept)`, isRun(mid.f), `frame ${mid.f}`);
    else {
      check(`${label}: happy face during pickup`, String(mid.f) === String(info.happy), `frame ${mid.f}`);
      check(`${label}: position unchanged during expression`, Math.abs(mid.y - before.y) <= 1, `y ${before.y}->${mid.y}`);
      if (kind === 'strawberry') await page.screenshot({ path: `${S}/t5-${label}-happy.png` });
    }
    await page.waitForTimeout(400);
    const after = await frame();
    check(`${label}: back to run after happy`, isRun(after.f), `frame ${after.f}`);
  }

  // 기쁨 표정 중 점프 / 더블 점프
  await ev((sc) => sc.addSnack('banana', sc.playerX + 22, 4));
  await page.waitForTimeout(260);
  const vp = page.viewportSize();
  await page.touchscreen.tap(vp.width / 2, vp.height / 2); await page.waitForTimeout(120);
  const j1 = await frame();
  await page.touchscreen.tap(vp.width / 2, vp.height / 2); await page.waitForTimeout(120);
  const j2 = await frame();
  check(`${label}: jump works during expression`, j1.alt > 5 && !j1.grounded, `alt ${j1.alt.toFixed(1)} frame ${j1.f}`);
  check(`${label}: double jump works during expression`, j2.alt > j1.alt, `alt ${j1.alt.toFixed(1)}->${j2.alt.toFixed(1)}`);
  await page.waitForTimeout(300);
  const j3 = await frame();
  check(`${label}: back to jump pose in air`, !j3.grounded ? String(j3.f) === String(info.jump) : true, `frame ${j3.f} grounded ${j3.grounded}`);
  for (let i = 0; i < 60; i++) { if ((await frame()).grounded) break; await page.waitForTimeout(30); }
  await page.waitForTimeout(200);

  // 바위 충돌 + 무적 시간
  const h0 = (await frame()).hearts;
  await ev((sc) => sc.addRock(sc.playerX + 22));
  let r; for (let i = 0; i < 40; i++) { r = await frame(); if (r.hearts !== h0) break; await page.waitForTimeout(15); }
  check(`${label}: rock hit -1 heart`, r.hearts === h0 - 1, `hearts ${h0}->${r.hearts}`);
  check(`${label}: invincible after hit`, r.inv > 1100, `inv ${Math.round(r.inv)}ms`);
  await page.waitForTimeout(120);
  const sface = await frame();
  if (info.sur >= 0) { check(`${label}: surprised face on hit`, String(sface.f) === String(info.sur), `frame ${sface.f}`); await page.screenshot({ path: `${S}/t5-${label}-surprised.png` }); }
  // 무적 중 다시 충돌 → 하트 유지
  for (let i = 0; i < 60; i++) { if ((await frame()).grounded) break; await page.waitForTimeout(20); }
  await ev((sc) => sc.addRock(sc.playerX + 18));
  await page.waitForTimeout(450);
  const r2 = await frame();
  check(`${label}: no damage while invincible`, r2.hearts === h0 - 1, `hearts ${r2.hearts} inv ${Math.round(r2.inv)}`);
  await page.waitForTimeout(300);
  const r3 = await frame();
  check(`${label}: back to run after surprised`, isRun(r3.f) || !r3.grounded, `frame ${r3.f}`);

  // 일시정지
  await page.waitForTimeout(800);
  await page.locator('.icon-btn[aria-label="일시정지"]').click(); await page.waitForTimeout(200);
  const p = await ev((sc) => ({ state: sc.state, f: sc.player.frame.name }));
  check(`${label}: pause`, p.state === 'paused', JSON.stringify(p));
  await page.touchscreen.tap(vp.width / 2, vp.height / 2); await page.waitForTimeout(200);
  const p2 = await ev((sc) => sc.state);
  check(`${label}: resume`, p2 === 'playing', p2);

  // 무적 끝난 뒤 충돌 → 하트 감소 → 게임 오버
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i < 100; i++) { const f = await frame(); if (f.inv <= 0 && f.grounded) break; await page.waitForTimeout(30); }
    const hb = (await frame()).hearts; if (hb <= 0) break;
    await ev((sc) => sc.addRock(sc.playerX + 22));
    await page.waitForTimeout(450);
    const ha = await ev((sc) => sc.hearts);
    check(`${label}: hit after invincibility ends`, ha === hb - 1, `hearts ${hb}->${ha}`);
  }
  await page.waitForTimeout(1600);
  const over = await page.evaluate(() => !document.querySelector('.over-screen').classList.contains('hidden'));
  const scoreTxt = await page.locator('.score-big').textContent();
  check(`${label}: game over screen`, over, scoreTxt);
  await page.screenshot({ path: `${S}/t5-${label}-over.png` });
  await page.locator('.over-screen .retry-btn').click(); await page.waitForTimeout(800);
  const rs = await ev((sc) => ({ state: sc.state, hearts: sc.hearts, score: sc.score }));
  check(`${label}: retry`, rs.state === 'playing' && rs.hearts === 3 && rs.score === 0, JSON.stringify(rs));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${S}/t5-${label}-play.png` });
  check(`${label}: no page errors`, errs.length === 0, errs.join(' | '));
  await b.close();
}
async function growthTests(label, device) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...device, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(URL + '?test'); await page.waitForTimeout(1500);
  const ev = (fn, arg) => page.evaluate(([f, a]) => { const sc = window.__gona.scene.getScene('Game'); return eval(f)(sc, a); }, [fn.toString(), arg]);
  await startFromTitle(page);
  await page.waitForTimeout(1300);
  await ev((sc) => { sc.distToNext = 1e9; sc.entities.forEach(e => e.sprite.destroy()); sc.entities = []; });
  const g = () => ev((sc) => ({ state: sc.state, stage: sc.growth.stageIndex, gauge: sc.growth.gauge, score: sc.score, d: sc.distance, vis: sc.vis.id, alt: sc.alt, grounded: sc.grounded, hearts: sc.hearts }));
  const s0 = await g();
  check(`${label}: starts as newborn`, s0.stage === 0 && s0.vis === 'newborn', JSON.stringify(s0));
  // 간식 → 점수와 게이지가 각자 증가
  await ev((sc) => sc.addSnack('cookie', sc.playerX + 22, 4));
  await page.waitForTimeout(600);
  const s1 = await g();
  check(`${label}: cookie +30 score, +3 gauge`, s1.score - s0.score === 30 && s1.gauge - s0.gauge === 3, `score ${s1.score} gauge ${s1.gauge}`);
  // 게이지 가득 → 진화 연출 동안 정지
  await ev((sc) => { sc.growth.gauge = 11; sc.addSnack('strawberry', sc.playerX + 18, 4); });
  let e1; for (let i = 0; i < 50; i++) { e1 = await g(); if (e1.state === 'evolving') break; await page.waitForTimeout(15); }
  check(`${label}: evolution starts when gauge full`, e1.state === 'evolving', e1.state);
  await page.waitForTimeout(150);
  await page.touchscreen.tap(20, 200); // 진화 중 터치는 무시
  await page.waitForTimeout(500);
  const e2 = await g();
  check(`${label}: game paused during evolution`, e2.state === 'evolving' && Math.abs(e2.d - e1.d) < 0.01 && e2.alt === e1.alt, `distance ${e1.d.toFixed(1)}→${e2.d.toFixed(1)}`);
  // 연출 시간은 게임 프레임 시간 기준이라, 느린 기기에서는 실제 시간보다 늦을 수 있어 나타날 때까지 기다림
  let banner = '';
  for (let i = 0; i < 60 && !banner; i++) {
    banner = await page.evaluate(() => { const el = document.querySelector('.evolve-banner'); return el.classList.contains('hidden') ? '' : el.textContent; });
    if (!banner) await page.waitForTimeout(50);
  }
  check(`${label}: new stage name shown`, banner.includes('기어 다니는 고나'), banner);
  let e3; for (let i = 0; i < 80; i++) { e3 = await g(); if (e3.state === 'playing') break; await page.waitForTimeout(50); }
  check(`${label}: game resumes as crawler`, e3.state === 'playing' && e3.stage === 1 && e3.vis === 'crawler' && e3.gauge === 0, JSON.stringify(e3));
  // 진화 후 점프·점수 정상
  const vp = page.viewportSize();
  await page.waitForTimeout(1100);
  await page.touchscreen.tap(vp.width / 2, vp.height / 2); await page.waitForTimeout(150);
  const j = await g();
  check(`${label}: jump works after evolution`, !j.grounded && j.alt > 5, `alt ${j.alt.toFixed(1)}`);
  for (let i = 0; i < 60; i++) { if ((await g()).grounded) break; await page.waitForTimeout(25); }
  const before = await g();
  await ev((sc) => sc.addSnack('banana', sc.playerX + 22, 4)); await page.waitForTimeout(600);
  const after = await g();
  check(`${label}: score & gauge after evolution`, after.score - before.score === 20 && after.gauge - before.gauge === 2, `score +${after.score - before.score} gauge +${after.gauge - before.gauge}`);
  // 3·4단계까지 진화
  // (보스전은 bossTests 에서 따로 — 여기서는 이미 이긴 것으로 두고 성장만 확인)
  await ev((sc) => sc.clearedBosses.add('kiss'));
  for (const [target, name] of [[2, '직립보행 고나'], [3, '빅베이비 곤룡']]) {
    await ev((sc) => { sc.growth.gauge = sc.growth.stage.gaugeToNext - 1; sc.addSnack('strawberry', sc.playerX + 18, 4); });
    let st; await page.waitForTimeout(300);
    for (let i = 0; i < 100; i++) { st = await g(); if (st.state === 'playing') break; await page.waitForTimeout(50); }
    check(`${label}: evolves to ${name}`, st.stage === target && st.state === 'playing', JSON.stringify(st));
    if (target === 3) await page.screenshot({ path: `${S}/grow-${label}-bigbaby.png` });
  }
  // 최종 단계: 더 진화하지 않음
  await ev((sc) => { sc.growth.gauge = 999; sc.addSnack('cookie', sc.playerX + 18, 4); });
  await page.waitForTimeout(700);
  const fin = await g();
  check(`${label}: final stage stays (no evolution)`, fin.state === 'playing' && fin.stage === 3, JSON.stringify(fin));
  // 빅베이비도 충돌 판정 동일 (박스 크기)
  const hb = await ev((sc) => { const b = sc.playerBox(); return [b.right - b.left, b.top - b.bottom + 1]; });
  check(`${label}: hitbox unchanged at bigbaby`, Math.round(hb[0]) === 11 && Math.round(hb[1]) === 19, JSON.stringify(hb));
  // 게임 오버 → 다시하기는 갓난아기부터, 최고 단계 기록
  await ev((sc) => { sc.hearts = 1; sc.invincibleUntil = 0; });
  for (let i = 0; i < 60; i++) { const f = await g(); if (f.grounded) break; await page.waitForTimeout(25); }
  await ev((sc) => sc.addRock(sc.playerX + 22));
  await page.waitForTimeout(2000);
  const overText = await page.locator('.growth-line').textContent();
  check(`${label}: game over shows growth`, overText.includes('4/4') && overText.includes('빅베이비'), overText);
  await page.locator('.over-screen .retry-btn').click(); await page.waitForTimeout(800);
  const rs = await g();
  check(`${label}: retry restarts as newborn (rule)`, rs.stage === 0 && rs.gauge === 0 && rs.vis === 'newborn', JSON.stringify(rs));
  const bestStage = await page.evaluate(() => localStorage.getItem('dino-snack-adventure.bestStage'));
  check(`${label}: best growth stage saved`, bestStage === '4', bestStage);
  check(`${label}: no page errors (growth)`, errs.length === 0, errs.join(' | '));
  await b.close();
}

async function introTests(label, device) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...device, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(URL + '?test');
  await page.waitForFunction(() => window.__gona?.scene.isActive('Opening'), null, { timeout: 8000 });
  await page.waitForSelector('.pr-gate', { state: 'visible', timeout: 8000 });
  // 프롤로그 진행 기록: 머리카락이 나온 시각, 아기가 나온 시각
  await page.evaluate(() => {
    window.__tl = {}; const t0 = performance.now();
    const iv = setInterval(() => { const o = window.__gona.scene.getScene('Opening'); if (!o || !o.hair) return;
      if (!window.__tl.hair && Math.abs(o.hair.y - o.hairUpY) < 2) window.__tl.hair = performance.now() - t0;
      if (!window.__tl.baby && o.baby.visible) window.__tl.baby = performance.now() - t0;
      if (window.__tl.baby) clearInterval(iv); }, 20);
  });
  const lineIdx = () => page.evaluate(() => { const bx = document.querySelector('.pr-box'); return bx.classList.contains('hidden') ? -1 : Number(bx.dataset.index); });
  const st0 = await page.evaluate(() => ({ cover: document.querySelector('.cover').classList.contains('hidden'), game: window.__gona.scene.getScene('Game').state,
    narr: window.__sound.narr.some((a) => !a.paused), box: document.querySelector('.pr-box').classList.contains('hidden') }));
  check(`${label}: starts with story gate (title hidden, no narration yet)`, st0.cover && st0.game === 'ready' && !st0.narr && st0.box, JSON.stringify(st0));
  const vp = page.viewportSize();
  await page.touchscreen.tap(vp.width * 0.5, vp.height * 0.3); // 첫 터치 = 이야기 시작 (소리 켜짐)
  await page.waitForTimeout(500);
  const t1 = await page.evaluate(() => ({ audio: window.__sound.ready, idx: document.querySelector('.pr-box').dataset.index, gate: document.querySelector('.pr-gate').classList.contains('hidden'),
    n0: !window.__sound.narr[0].paused, music: window.__sound.status().musicMode, vol: window.__sound.music.title.volume }));
  check(`${label}: first tap starts story + narration 1 + title music`, t1.audio && t1.idx === '0' && t1.gate && t1.n0 && t1.music === 'title', JSON.stringify(t1));
  check(`${label}: BGM ducked during narration`, t1.vol < 0.8, `title volume ${t1.vol.toFixed(2)}`);
  await page.touchscreen.tap(vp.width * 0.5, vp.height * 0.3); // 터치 = 다음 문장
  await page.waitForTimeout(300);
  const t2 = await page.evaluate(() => ({ idx: document.querySelector('.pr-box').dataset.index, n0: !window.__sound.narr[0].paused, n1: !window.__sound.narr[1].paused, op: window.__gona.scene.isActive('Opening') }));
  check(`${label}: tap → exactly next sentence (narration switches)`, t2.idx === '1' && !t2.n0 && t2.n1 && t2.op, JSON.stringify(t2));
  // 2번 문장 끝까지 기다렸다가 자막 전체 확인
  await page.waitForFunction(() => document.querySelector('.pr-box').classList.contains('typed'), null, { timeout: 8000 });
  const txt = await page.evaluate(() => document.querySelector('.pr-text').textContent);
  check(`${label}: subtitle text (typing finished)`, txt === '벚꽃이 흐드러지게 피던 어느 봄날.', txt);
  // 자동으로 3번 문장(부화)으로 넘어가는지
  await page.waitForFunction(() => document.querySelector('.pr-box').dataset.index === '2', null, { timeout: 12000 });
  await page.waitForFunction(() => window.__tl.baby > 0, null, { timeout: 15000 });
  const tl = await page.evaluate(() => window.__tl);
  check(`${label}: auto-advance; hair peeks before hatch`, tl.hair > 0 && tl.baby > tl.hair, JSON.stringify(tl));
  // 나머지 문장은 터치로 하나씩
  const seen = [];
  for (let i = 0; i < 8; i++) {
    const before = await lineIdx();
    await page.touchscreen.tap(vp.width * 0.5, vp.height * 0.3);
    await page.waitForTimeout(350);
    seen.push(`${before}>${await lineIdx()}`);
  }
  const mon = await page.evaluate(() => { const o = window.__gona.scene.getScene('Opening'); return o ? { k: o.kiss.visible, s: o.sniff.visible } : null; });
  check(`${label}: taps advance one sentence each`, seen.slice(0, 7).every((x) => { const [a, c] = x.split('>').map(Number); return c === a + 1; }), seen.join(' '));
  await page.waitForSelector('.cover.revealed', { timeout: 8000 });
  await page.waitForTimeout(2600);
  const st1 = await page.evaluate(() => ({ op: window.__gona.scene.isActive('Opening'), btn: getComputedStyle(document.querySelector('.cover-ui')).opacity, game: window.__gona.scene.getScene('Game').state,
    subs: document.querySelector('.prologue-ui').classList.contains('hidden'), narr: window.__sound.narr.some((a) => !a.paused) }));
  check(`${label}: title after last sentence (waits for start button)`, !st1.op && st1.btn === '1' && st1.game === 'ready' && st1.subs && !st1.narr, JSON.stringify(st1));
  const box = await page.locator('.cover-btn').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').state === 'playing', null, { timeout: 5000 });
  const st = await page.evaluate(() => { const s = window.__gona.scene.getScene('Game'); return { stage: s.growth.stageIndex, nest: s.nestBack.visible, op: window.__gona.scene.isActive('Opening') }; });
  check(`${label}: start → stage 1 nest, no egg replay`, st.stage === 0 && st.nest && !st.op, JSON.stringify(st));
  // 배경음악 파일 재생 + 효과음 레벨
  const ms = await page.evaluate(() => window.__sound.status());
  check(`${label}: game music file playing`, ms.musicMode === 'game' && ms.musicSource === 'file' && ms.musicPlaying && ms.errors.length === 0, `${ms.musicFile} ${ms.errors.join('|')}`);
  const level = await page.evaluate(() => new Promise((res) => { const s = window.__sound; const an = s.ctx.createAnalyser(); s.master.connect(an);
    s.pickup(30);
    const buf = new Float32Array(2048); let peak = 0; const t0 = performance.now();
    const iv = setInterval(() => { an.getFloatTimeDomainData(buf); for (const v of buf) peak = Math.max(peak, Math.abs(v)); if (performance.now() - t0 > 600) { clearInterval(iv); res(peak); } }, 20); }));
  check(`${label}: sfx audible (web audio level)`, level > 0.2, `peak ${level.toFixed(3)}`);
  // 건너뛰기 (대기 화면에서도, 이야기 중에도)
  await page.reload();
  await page.waitForFunction(() => window.__gona?.scene.isActive('Opening'), null, { timeout: 8000 });
  await page.waitForTimeout(800);
  await page.touchscreen.tap(vp.width * 0.5, vp.height * 0.3);
  await page.waitForTimeout(1200);
  await page.locator('.op-skip').click();
  await page.waitForTimeout(400);
  const sk = await page.evaluate(() => ({ cover: document.querySelector('.cover').className, op: window.__gona.scene.isActive('Opening'), btn: getComputedStyle(document.querySelector('.cover-ui')).opacity,
    narr: window.__sound.narr.some((a) => !a.paused), vol: window.__sound.music.title.volume }));
  check(`${label}: skip button → title immediately, narration stops`, sk.cover.includes('revealed') && !sk.op && sk.btn === '1' && !sk.narr, JSON.stringify(sk));
  await page.waitForTimeout(1200);
  const vol = await page.evaluate(() => window.__sound.music.title.volume);
  check(`${label}: BGM back to full after skip`, vol > 0.95, String(vol));
  // 오프닝 다시 보기: 대기 없이 바로 1번 문장부터
  await page.locator('.cover-replay').click();
  await page.waitForTimeout(600);
  const rp = await page.evaluate(() => ({ op: window.__gona.scene.isActive('Opening'), hidden: document.querySelector('.cover').classList.contains('hidden'), idx: document.querySelector('.pr-box').dataset.index,
    gate: document.querySelector('.pr-gate').classList.contains('hidden') }));
  check(`${label}: replay opening (starts story directly)`, rp.op && rp.hidden && rp.idx === '0' && rp.gate, JSON.stringify(rp));
  await page.locator('.op-skip').click();
  await page.waitForSelector('.cover.revealed', { timeout: 15000 });
  check(`${label}: no page errors (opening)`, errs.length === 0, errs.join(' | '));
  await b.close();
}

async function bossTests(label, device) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...device, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  const G = (fn, arg) => page.evaluate(fn, arg);
  const battle = () => G(() => window.__gona.scene.getScene('Game').debugBattle());
  const combat = () => G(() => window.__gona.scene.getScene('Game').debugCombat());
  const tapEl = async (sel) => { const bb = await page.locator(sel).boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); };
  const begin = async (boss) => {
    await page.goto(URL + '?test&boss=' + boss);
    await startFromTitle(page).catch(() => {});
    await page.waitForFunction(() => window.__gona.scene.getScene('Game').debugBattle(), null, { timeout: 6000 });
  };

  // ── 뽀뽀괴물 (자연 진행: 성장 게이지 가득 → 보스전)
  await page.goto(URL + '?test');
  await startFromTitle(page);
  await G(() => { const sc = window.__gona.scene.getScene('Game'); sc.debugSetStage(1); sc.growth.gauge = sc.growth.stage.gaugeToNext - 1; sc.addSnack('strawberry', sc.playerX + 18, 4); });
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').debugBattle(), null, { timeout: 4000 }).catch(() => {});
  const k0 = await battle();
  const c0 = await combat();
  check(`${label}: crawler gauge full → 뽀뽀괴물 battle (no evolution yet)`, k0?.id === 'kiss' && c0.stage === 1 && c0.state === 'playing', JSON.stringify({ k0, c0 }));
  const bar = await page.locator('.boss-bar').isVisible();
  check(`${label}: boss HP bar visible`, bar);
  check(`${label}: no boomerang before awakening`, !c0.canThrow && !(await page.locator('.bt-attack').isVisible()));
  await G(() => window.__gona.scene.getScene('Game').debugGod());
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').debugBattle()?.frozen, null, { timeout: 16000 });
  await page.waitForSelector('.bt-attack', { state: 'visible', timeout: 6000 });
  check(`${label}: hair boomerang awakens mid-battle`, (await combat()).canThrow);
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').debugBattle()?.mode === 'fight', null, { timeout: 6000 });
  const hp0 = (await battle()).hp;
  // 날아오는 하트탄에 막히지 않게 (부메랑은 투사체를 먼저 부숨 — 정상 동작)
  await G(() => { const bt = window.__gona.scene.getScene('Game').battle; bt.hostiles.forEach((h) => { h.dead = true; h.sprite.destroy(); }); bt.hostiles = []; bt.cooldown = 3; });
  await tapEl('.bt-attack');
  await page.waitForTimeout(120);
  const t1 = await combat();
  const cls = await page.locator('.bt-attack').getAttribute('class');
  check(`${label}: attack button throws hair (bald sprite, button waiting)`, t1.out && t1.bald && cls.includes('out'), JSON.stringify(t1));
  await tapEl('.bt-attack'); // 돌아오기 전엔 재발사 불가
  await page.waitForFunction(() => !window.__gona.scene.getScene('Game').debugCombat().out, null, { timeout: 4000 });
  await page.waitForTimeout(100);
  const t2 = await combat(); const k1 = await battle();
  check(`${label}: boomerang hits boss and returns (hair back)`, k1.hp < hp0 && !t2.bald && t2.tex.indexOf('-bald') < 0, `hp ${hp0}→${k1.hp}`);
  // 필살기
  await G(() => window.__gona.scene.getScene('Game').debugBoss(undefined, 1));
  await page.waitForTimeout(150);
  check(`${label}: special button ready when gauge full`, (await page.locator('.bt-special').getAttribute('class')).includes('ready'));
  const hp1 = (await battle()).hp;
  await tapEl('.bt-special');
  await page.waitForTimeout(300);
  const sp = await battle();
  await page.waitForTimeout(1700);
  const sp2 = await battle();
  check(`${label}: special = cutscene + big damage`, sp.frozen && sp2.hp === hp1 - 4 && sp2.special === 0 && sp2.mode === 'fight', `${JSON.stringify(sp)} → hp ${sp2.hp}`);
  // 승리 → 3단계 직립보행
  await G(() => window.__gona.scene.getScene('Game').debugBoss(1));
  for (let i = 0; i < 6 && (await battle())?.mode === 'fight'; i++) { await page.keyboard.press('KeyX'); await page.waitForTimeout(900); }
  check(`${label}: 뽀뽀괴물 defeated`, (await battle())?.mode === 'victory');
  await page.waitForFunction(() => { const c = window.__gona.scene.getScene('Game').debugCombat(); return c.stage === 2 && c.state === 'playing'; }, null, { timeout: 9000 }).catch(() => {});
  const w = await combat();
  check(`${label}: after win → evolves to walker, boomerang kept`, w.stage === 2 && w.state === 'playing' && w.canThrow && !(await battle()) && (await page.locator('.bt-attack').isVisible()), JSON.stringify(w));
  check(`${label}: boss UI hidden after battle`, !(await page.locator('.boss-bar').isVisible()) && !(await page.locator('.bt-special').isVisible()));
  // 평소 달리기: 부메랑으로 바위 깨기
  const sc0 = await G(() => window.__gona.scene.getScene('Game').score);
  await G(() => { const sc = window.__gona.scene.getScene('Game'); sc.entities.forEach((e) => { e.done = true; e.sprite.destroy(); }); sc.entities = []; sc.addRock(sc.playerX + 60); sc.distToNext = 9999; });
  await page.keyboard.press('KeyX');
  await page.waitForTimeout(700);
  const rocks = await G(() => window.__gona.scene.getScene('Game').entities.filter((e) => e.type === 'rock' && !e.done).length);
  const sc1 = await G(() => window.__gona.scene.getScene('Game').score);
  check(`${label}: boomerang breaks rocks in normal run`, rocks === 0 && sc1 - sc0 === 5, `rocks ${rocks} score +${sc1 - sc0}`);
  await page.screenshot({ path: `${S}/boss-${label}-walker.png` });

  // ── 킁카괴물 (4단계 게이지 가득 → 최종 보스전 → 엔딩)
  await page.goto(URL + '?test');
  await startFromTitle(page);
  await G(() => { const sc = window.__gona.scene.getScene('Game'); sc.clearedBosses.add('kiss'); sc.debugSetStage(3); sc.growth.gauge = sc.growth.stage.gaugeToNext - 1; sc.addSnack('strawberry', sc.playerX + 18, 4); });
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').debugBattle(), null, { timeout: 4000 }).catch(() => {});
  check(`${label}: bigbaby gauge full → 킁카괴물 battle`, (await battle())?.id === 'sniff');
  await G(() => window.__gona.scene.getScene('Game').debugGod());
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').debugBattle()?.mode === 'fight', null, { timeout: 8000 });
  let pull = 0, puddle = false; const t0 = Date.now();
  while (Date.now() - t0 < 16000 && !(pull > 5 && puddle)) {
    const st = await G(() => { const g = window.__gona.scene.getScene('Game'); return { pull: g.pull, pud: g.battle.hostiles.some((h) => h.onGround) }; });
    pull = Math.max(pull, st.pull); puddle = puddle || st.pud;
    await page.waitForTimeout(150);
  }
  check(`${label}: sniff inhale pulls GONA, stink puddles on ground`, pull > 5 && puddle, `pull ${pull.toFixed(1)} puddle ${puddle}`);
  await page.screenshot({ path: `${S}/boss-${label}-sniff.png` });
  const shp = (await battle()).hp;
  await page.waitForFunction(() => !window.__gona.scene.getScene('Game').debugCombat().out, null, { timeout: 4000 }).catch(() => {});
  await page.keyboard.press('KeyX');
  await page.waitForFunction(() => !window.__gona.scene.getScene('Game').debugCombat().out, null, { timeout: 4000 }).catch(() => {});
  check(`${label}: boomerang reaches small boss from tall bigbaby`, (await battle()).hp < shp, `${shp} → ${(await battle()).hp}`);
  await G(() => window.__gona.scene.getScene('Game').debugBoss(15));
  for (let i = 0; i < 5 && !(await battle())?.phase2; i++) { await page.keyboard.press('KeyX'); await page.waitForTimeout(1000); }
  check(`${label}: sniff phase 2 at half HP`, (await battle())?.phase2 && (await page.locator('.bb-phase').isVisible()));
  await G(() => window.__gona.scene.getScene('Game').debugBoss(1));
  for (let i = 0; i < 8 && (await battle()) && (await battle()).mode !== 'victory'; i++) { await page.keyboard.press('KeyX'); await page.waitForTimeout(900); }
  await page.waitForSelector('.over-screen.cleared:not(.hidden)', { timeout: 9000 }).catch(() => {});
  const end = await page.locator('.over-screen h2').textContent();
  check(`${label}: final boss win → ending screen`, end.includes('모험 완료'), end);
  await page.screenshot({ path: `${S}/boss-${label}-ending.png` });
  await page.locator('.over-screen .retry-btn').click(); await page.waitForTimeout(800);
  const rs = await combat();
  check(`${label}: ending → restart from newborn`, rs.stage === 0 && rs.state === 'playing', JSON.stringify(rs));

  // ── 보스전에서 짐 → '보스전 다시' 버튼
  await begin('kiss');
  await G(() => { const sc = window.__gona.scene.getScene('Game'); sc.hearts = 1; });
  await page.waitForSelector('.over-screen:not(.hidden)', { timeout: 25000 });
  check(`${label}: losing in boss battle offers boss retry`, await page.locator('.boss-retry').isVisible());
  await page.waitForTimeout(600);
  await page.locator('.boss-retry').click();
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').debugBattle()?.id === 'kiss', null, { timeout: 6000 }).catch(() => {});
  const rb = await combat();
  check(`${label}: boss retry restarts at 뽀뽀괴물 as crawler`, (await battle())?.id === 'kiss' && rb.stage === 1, JSON.stringify(rb));
  check(`${label}: no page errors (boss)`, errs.length === 0, errs.join(' | '));
  await b.close();
}

(async () => {
  await bossTests('boss-port', devices['iPhone 13']);
  await bossTests('boss-land', devices['iPhone 13 landscape']);
  await introTests('intro-land', devices['iPhone 13 landscape']);
  await introTests('intro-port', devices['iPhone 13']);
  await run('land', devices['iPhone 13 landscape']);
  await run('land-walker', devices['iPhone 13 landscape'], { stage: 2 });
  await run('port-walker', devices['iPhone 13'], { stage: 2 });
  await run('port', devices['iPhone 13']);
  await run('noimg', devices['iPhone 13 landscape'], { noImages: true });
  await growthTests('grow-land', devices['iPhone 13 landscape']);
  await growthTests('grow-port', devices['iPhone 13']);
  console.log(results.join('\n'));
  process.exitCode = results.some((r) => r.startsWith('FAIL')) ? 1 : 0;
})();
