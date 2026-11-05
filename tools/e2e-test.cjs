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
/** 대표 타이틀의 '게임 시작' → 알 부화 컷신 → (자동) 1단계 시작까지 */
async function startFromTitle(page) {
  await page.waitForSelector('.cover:not(.hidden) .cv-base', { timeout: 8000 });
  await page.waitForTimeout(700);
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
  await page.locator('.over-screen .pixel-btn').click(); await page.waitForTimeout(800);
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
  await page.locator('.over-screen .pixel-btn').click(); await page.waitForTimeout(800);
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
  await page.addInitScript(() => {
    window.__seq = [];
    new MutationObserver((ms) => { for (const m of ms) { const c = m.target.className || ''; if (typeof c !== 'string') continue;
      if (/egg-hair peek/.test(c)) window.__seq.push('hair'); if (/t-baby pop/.test(c)) window.__seq.push('hatch'); } })
      .observe(document, { attributes: true, subtree: true, attributeFilter: ['class'] });
  });
  await page.goto(URL + '?test');
  await page.waitForSelector('.cover:not(.hidden) .cv-base', { timeout: 8000 });
  // 첫 화면: 버튼 누르기 전까지 대기 (컷신·게임 시작 안 함), 버튼 아닌 곳 터치해도 그대로
  const vp = page.viewportSize();
  await page.touchscreen.tap(vp.width * 0.5, vp.height * 0.3);
  await page.waitForTimeout(5000);
  const w = await page.evaluate(() => ({ cover: !document.querySelector('.cover').classList.contains('hidden'), seq: window.__seq.length, wobble: !!document.querySelector('.t-egg.wobble'), state: window.__gona.scene.getScene('Game').state }));
  check(`${label}: cover waits until start button`, w.cover && w.seq === 0 && !w.wobble && w.state === 'ready', JSON.stringify(w));
  const audio1 = await page.evaluate(() => window.__sound.ready);
  check(`${label}: first touch unlocks audio`, audio1 === true);
  // 시작 버튼 → 알 부화 → 1단계 자동 시작
  const box = await page.locator('.cover-btn').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').state === 'playing', null, { timeout: 12000 });
  const seq = [...new Set(await page.evaluate(() => window.__seq))];
  check(`${label}: cover → hair peek → hatch → game`, seq.join(',') === 'hair,hatch', seq.join(','));
  const st = await page.evaluate(() => { const s = window.__gona.scene.getScene('Game'); return { stage: s.growth.stageIndex, nest: s.nestBack.visible, cover: document.querySelector('.cover').classList.contains('hidden') }; });
  check(`${label}: starts stage 1 in nest`, st.stage === 0 && st.nest && st.cover, JSON.stringify(st));
  // 배경음악: 파일(<audio>)이 실제로 재생 중인지 + 효과음(Web Audio) 출력 레벨
  const ms = await page.evaluate(() => window.__sound.status());
  check(`${label}: game music file playing`, ms.musicMode === 'game' && ms.musicSource === 'file' && ms.musicPlaying && ms.errors.length === 0, `${ms.musicFile} ${ms.errors.join('|')}`);
  const level = await page.evaluate(() => new Promise((res) => { const s = window.__sound; const an = s.ctx.createAnalyser(); s.master.connect(an);
    s.pickup(30);
    const buf = new Float32Array(2048); let peak = 0; const t0 = performance.now();
    const iv = setInterval(() => { an.getFloatTimeDomainData(buf); for (const v of buf) peak = Math.max(peak, Math.abs(v)); if (performance.now() - t0 > 600) { clearInterval(iv); res(peak); } }, 20); }));
  check(`${label}: sfx audible (web audio level)`, level > 0.2, `peak ${level.toFixed(3)}`);
  // 컷신 건너뛰기: 컷신 중 터치 → 바로 1단계
  await page.reload(); await page.waitForSelector('.cover:not(.hidden) .cv-base', { timeout: 8000 }); await page.waitForTimeout(600);
  const box2 = await page.locator('.cover-btn').boundingBox();
  await page.touchscreen.tap(box2.x + box2.width / 2, box2.y + box2.height / 2);
  await page.waitForTimeout(1200);
  await page.touchscreen.tap(vp.width / 2, vp.height * 0.4);
  const t0 = Date.now();
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').state === 'playing', null, { timeout: 8000 });
  check(`${label}: tap skips cutscene`, Date.now() - t0 < 3500, `${Date.now() - t0}ms`);
  check(`${label}: no page errors (intro)`, errs.length === 0, errs.join(' | '));
  await b.close();
}

(async () => {
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
