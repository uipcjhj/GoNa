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
  const frame = () => ev((sc) => ({ tex: sc.player.texture.key, f: sc.player.frame.name, y: sc.player.y, alt: sc.alt, score: sc.score, hearts: sc.hearts, hp: sc.hp, inv: sc.invincibleUntil - sc.time.now, grounded: sc.grounded }));

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
  const f0 = await frame();
  const h0 = f0.hearts;
  await ev((sc) => sc.addRock(sc.playerX + 22));
  let r; for (let i = 0; i < 40; i++) { r = await frame(); if (r.hp !== f0.hp) break; await page.waitForTimeout(15); }
  check(`${label}: rock hit -50 HP (hearts kept)`, r.hp === f0.hp - 50 && r.hearts === h0, `hp ${f0.hp}->${r.hp} hearts ${h0}->${r.hearts}`);
  check(`${label}: short invincibility after hit`, r.inv > 400, `inv ${Math.round(r.inv)}ms`);
  // 무적 중 바로 또 충돌 → HP 유지
  await ev((sc) => sc.addRock(sc.playerX + 4));
  await page.waitForTimeout(150);
  check(`${label}: no damage while invincible`, (await frame()).hp === r.hp, `hp ${(await frame()).hp}`);
  await page.waitForTimeout(120);
  const sface = await frame();
  // 맞으면 (예전 '놀람' 대신) 같은 단계 그림의 '아파!' 찡그린 표정
  check(`${label}: hurt face on hit`, String(sface.tex).startsWith('hurt-'), `tex ${sface.tex}#${sface.f}`);
  await page.screenshot({ path: `${S}/t5-${label}-hurt.png` });
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

  // 무적 끝난 뒤 충돌 → HP 0 이면 하트 -1 · HP 100 으로 → 하트가 다 없어지면 게임 오버
  let heartLossOk = true;
  for (let k = 0; k < 8; k++) {
    for (let i = 0; i < 100; i++) { const f = await frame(); if (f.inv <= 0 && f.grounded) break; await page.waitForTimeout(30); }
    const fb = await frame(); if (fb.hearts <= 0) break;
    await ev((sc) => sc.addRock(sc.playerX + 22));
    await page.waitForTimeout(450);
    const fa = await frame();
    if (fb.hp === 50) heartLossOk = heartLossOk && (fa.hearts === fb.hearts - 1 && (fa.hearts === 0 || fa.hp === 100));
    if (fa.hearts <= 0) break;
  }
  check(`${label}: HP 0 → heart -1 → HP 100 (until game over)`, heartLossOk);
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
  await ev((sc) => { sc.growth.gauge = sc.growth.stage.gaugeToNext - 1; sc.addSnack('strawberry', sc.playerX + 18, 4); });
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
  for (const [target, name] of [[2, '직립보행 고나'], [3, '자이언트 곤룡 고나']]) {
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
  // 자이언트 곤룡 고나도 충돌 판정 동일 (박스 크기)
  const hb = await ev((sc) => { const b = sc.playerBox(); return [b.right - b.left, b.top - b.bottom + 1]; });
  check(`${label}: hitbox unchanged at bigbaby`, Math.round(hb[0]) === 11 && Math.round(hb[1]) === 19, JSON.stringify(hb));
  // 게임 오버 → 다시하기는 갓난아기부터, 최고 단계 기록
  await ev((sc) => { sc.hearts = 1; sc.hp = 10; sc.invincibleUntil = 0; });
  for (let i = 0; i < 60; i++) { const f = await g(); if (f.grounded) break; await page.waitForTimeout(25); }
  await ev((sc) => sc.addRock(sc.playerX + 22));
  await page.waitForTimeout(2000);
  const overText = await page.locator('.growth-line').textContent();
  check(`${label}: game over shows growth`, overText.includes('4/4') && overText.includes('자이언트 곤룡 고나'), overText);
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
  // 음성 내레이션은 제거됨: voice 파일 요청이 한 번도 없어야 함
  const voiceReq = []; page.on('request', (r) => { if (/assets\/voice\/|bgm-title-duck/.test(r.url())) voiceReq.push(r.url()); });
  const noVoice = () => page.evaluate(() => !('narr' in window.__sound) && ![...document.querySelectorAll('audio')].some((a) => /voice/.test(a.src)));
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
    box: document.querySelector('.pr-box').classList.contains('hidden') }));
  check(`${label}: starts with story gate (title hidden)`, st0.cover && st0.game === 'ready' && st0.box, JSON.stringify(st0));
  const vp = page.viewportSize();
  await page.touchscreen.tap(vp.width * 0.5, vp.height * 0.3); // 첫 터치 = 이야기 시작 (소리 켜짐)
  await page.waitForTimeout(500);
  const t1 = await page.evaluate(() => ({ audio: window.__sound.ready, idx: document.querySelector('.pr-box').dataset.index, gate: document.querySelector('.pr-gate').classList.contains('hidden'),
    music: window.__sound.status().musicMode, vol: window.__sound.bgmEl.volume }));
  check(`${label}: first tap starts story subtitle 1 + title music (no voice)`, t1.audio && t1.idx === '0' && t1.gate && t1.music === 'title' && (await noVoice()), JSON.stringify(t1));
  check(`${label}: BGM stays at full volume (no narration ducking)`, t1.vol > 0.95, `title volume ${t1.vol.toFixed(2)}`);
  await page.touchscreen.tap(vp.width * 0.5, vp.height * 0.3); // 터치 = 다음 문장
  await page.waitForTimeout(300);
  const t2 = await page.evaluate(() => ({ idx: document.querySelector('.pr-box').dataset.index, typing: !document.querySelector('.pr-box').classList.contains('typed'), len: document.querySelector('.pr-shown').textContent.length, op: window.__gona.scene.isActive('Opening') }));
  check(`${label}: tap → exactly next sentence, typed letter by letter`, t2.idx === '1' && t2.op && t2.typing && t2.len < '벚꽃이 흐드러지게 피던 어느 봄날.'.length, JSON.stringify(t2));
  // 2번 문장 끝까지 기다렸다가 자막 전체 확인
  await page.waitForFunction(() => document.querySelector('.pr-box').classList.contains('typed'), null, { timeout: 8000 });
  const txt = await page.evaluate(() => document.querySelector('.pr-shown').textContent);
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
    subs: document.querySelector('.prologue-ui').classList.contains('hidden') }));
  check(`${label}: title after last sentence (waits for start button)`, !st1.op && st1.btn === '1' && st1.game === 'ready' && st1.subs, JSON.stringify(st1));
  // 새 타이틀: 고나가 화면 안에서 실제로 걸어 다니고, 나비 쫓기·열매 먹기까지 한 바퀴
  const tr = await page.evaluate(() => new Promise((res) => {
    const out = { phases: new Set(), poses: new Set(), minX: 1e9, maxX: -1e9, bfly: false, inView: true, moves: 0 };
    const cv = document.querySelector('.t4-gona'); let last = '';
    const t0 = performance.now();
    const iv = setInterval(() => {
      const r = cv.getBoundingClientRect(); const tf = cv.style.transform;
      if (tf !== last) { out.moves++; last = tf; }
      const d = window.__coverDebug();
      out.phases.add(d.phase); out.poses.add(d.pose); if (d.bfly) out.bfly = true;
      out.minX = Math.min(out.minX, r.left + r.width / 2); out.maxX = Math.max(out.maxX, r.left + r.width / 2);
      if (r.left + r.width / 2 < 0 || r.left + r.width / 2 > innerWidth || r.top < 0 || r.bottom > innerHeight) out.inView = false;
      if (performance.now() - t0 > 23000) { clearInterval(iv); res({ ...out, phases: [...out.phases], poses: [...out.poses], run: d.running, vw: innerWidth, stageW: d.stageW }); }
    }, 100);
  }));
  check(`${label}: title GONA walks across the forest path (stays in view)`, tr.inView && tr.maxX - tr.minX > tr.stageW * 0.45 && tr.moves > 40, JSON.stringify({ minX: tr.minX, maxX: tr.maxX, stageW: tr.stageW, moves: tr.moves }));
  check(`${label}: title loop: walk → butterfly → net chase → look back → fruit → eat → trot`, ['walk', 'notice', 'chase', 'lookback', 'walkback', 'find', 'eat', 'trot'].every((p) => tr.phases.includes(p)) && tr.bfly && ['gona-net', 'gona-eat', 'gona-trot', 'gona-surprise', 'gona-walk1', 'gona-walk2'].every((p) => tr.poses.includes(p)), JSON.stringify(tr.phases));
  const lg = await page.evaluate(() => { const r = window.__coverDebug().logo; return { l: r.x, r: innerWidth - (r.x + r.w), t: r.y, w: r.w }; });
  check(`${label}: logo fully inside screen with side margins`, lg.l >= 19 && lg.r >= 19 && lg.t >= 0 && lg.w > 150, JSON.stringify(lg));
  const box = await page.locator('.cover-btn').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').state === 'playing', null, { timeout: 5000 });
  await page.waitForTimeout(1000);
  const st = await page.evaluate(() => { const s = window.__gona.scene.getScene('Game'); return { stage: s.growth.stageIndex, nest: s.nestBack.visible, op: window.__gona.scene.isActive('Opening'), titleLoop: window.__coverDebug().running }; });
  check(`${label}: start → stage 1 nest, no egg replay, title animation stopped`, st.stage === 0 && st.nest && !st.op && !st.titleLoop, JSON.stringify(st));
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
    vol: window.__sound.bgmEl.volume }));
  check(`${label}: skip button → title immediately`, sk.cover.includes('revealed') && !sk.op && sk.btn === '1', JSON.stringify(sk));
  await page.waitForTimeout(1200);
  const vol = await page.evaluate(() => window.__sound.bgmEl.volume);
  check(`${label}: BGM full volume after skip`, vol > 0.95, String(vol));
  // 오프닝 다시 보기: 대기 없이 바로 1번 문장부터
  await page.locator('.cover-replay').click();
  await page.waitForTimeout(600);
  const rp = await page.evaluate(() => ({ op: window.__gona.scene.isActive('Opening'), hidden: document.querySelector('.cover').classList.contains('hidden'), idx: document.querySelector('.pr-box').dataset.index,
    gate: document.querySelector('.pr-gate').classList.contains('hidden') }));
  check(`${label}: replay opening (starts story directly)`, rp.op && rp.hidden && rp.idx === '0' && rp.gate, JSON.stringify(rp));
  await page.locator('.op-skip').click();
  await page.waitForSelector('.cover.revealed', { timeout: 15000 });
  check(`${label}: no voice narration requested or played`, voiceReq.length === 0 && (await noVoice()), voiceReq.join(' '));
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
  check(`${label}: 3 buttons shown from battle start, attack locked before awakening`, !c0.canThrow && (await page.locator('.bt-shield').isVisible()) && (await page.locator('.bt-attack').isVisible()) && (await page.locator('.bt-special:not(.bt-special2)').isVisible()) && (await page.locator('.bt-attack').getAttribute('class')).includes('locked'));
  await G(() => window.__gona.scene.getScene('Game').debugGod());
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').debugBattle()?.frozen, null, { timeout: 30000 });
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').debugCombat().canThrow, null, { timeout: 6000 }).catch(() => {});
  const aw = await page.locator('.bt-attack').getAttribute('class');
  check(`${label}: hair boomerang awakens mid-battle (button unlocks)`, (await combat()).canThrow && !aw.includes('locked'), aw);
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
  check(`${label}: special button ready when gauge full`, (await page.locator('.bt-special:not(.bt-special2)').getAttribute('class')).includes('ready'));
  const hp1 = (await battle()).hp;
  await tapEl('.bt-special:not(.bt-special2)');
  await page.waitForTimeout(300);
  const sp = await battle();
  // '초특급 꼬불머리 팡팡!' 약 3.6초 (슬로모션 → 멈춤 → 3연타) → 분노 전환 연출이 이어질 수 있음 → 전투로 돌아올 때까지
  await page.waitForTimeout(3700);
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').debugBattle()?.mode === 'fight', null, { timeout: 6000 }).catch(() => {});
  const sp2 = await battle();
  check(`${label}: special = cutscene + big damage`, sp.mode === 'cutscene' && sp2.hp === Math.max(0, hp1 - 3) && sp2.special === 0 && sp2.mode === 'fight', `${JSON.stringify(sp)} → hp ${sp2.hp}`);
  // 승리 → 3단계 직립보행
  // (HP 를 1 로 낮춰도 1차·2차·최종 분노마다 왕뽀뽀 ①②③ → 지침을 보여 준 뒤에야 쓰러짐)
  await G(() => window.__gona.scene.getScene('Game').debugBoss(1));
  for (let i = 0; i < 70 && ['fight', 'cutscene'].includes((await battle())?.mode); i++) { await page.keyboard.press('KeyX'); await page.waitForTimeout(700); }
  const klog = await G(() => window.__gona.scene.getScene('Game').battle?.attackLog.join(',') ?? '');
  check(`${label}: 뽀뽀괴물 uses 왕뽀뽀 ①②③ before defeat`, ['royal1', 'royal2', 'royal3'].every((r) => klog.includes(r)) && (await battle())?.mode === 'victory', klog);
  // 패배 대사 (타이핑) → 퇴장 → 승리
  await page.waitForSelector('.boss-talk:not(.hidden)', { timeout: 6000 }).catch(() => {});
  await page.waitForFunction(() => (document.querySelector('.boss-talk .pr-shown')?.textContent ?? '').length > 3, null, { timeout: 6000 }).catch(() => {});
  const talk1 = await G(() => document.querySelector('.boss-talk .pr-shown')?.textContent ?? '');
  check(`${label}: 뽀뽀괴물 last words typed in pixel dialog`, /^(크윽|하지만|절대)/.test(talk1) && (await page.locator('.bt-skip').isVisible()), talk1);
  await page.waitForFunction(() => { const c = window.__gona.scene.getScene('Game').debugCombat(); return c.stage === 2 && c.state === 'playing'; }, null, { timeout: 30000 }).catch(() => {});
  const w = await combat();
  check(`${label}: after win → evolves to walker, boomerang kept`, w.stage === 2 && w.state === 'playing' && w.canThrow && !(await battle()) && (await page.locator('.bt-attack').isVisible()), JSON.stringify(w));
  // (필살 버튼은 평소에도 보임 — 몬스터 처치로 모은 게이지를 다음 보스전으로)
  check(`${label}: boss UI hidden after battle (boss bar · shield · special gone, attack stays)`, !(await page.locator('.boss-bar').isVisible()) && !(await page.locator('.bt-shield').isVisible()) && !(await page.locator('.bt-special:not(.bt-special2)').isVisible()) && (await page.locator('.bt-attack').isVisible()));
  // 일반 스테이지: 방패·필살 입력도 꺼짐 (버튼 숨김뿐 아니라)
  const sh0 = await G(() => { const g = window.__gona.scene.getScene('Game'); const { bus } = window; g.raiseShield(); return { shieldOn: g.shieldOn, special: g.debugBattle() }; });
  check(`${label}: shield input ignored outside boss fights`, sh0.shieldOn === false && sh0.special === null, JSON.stringify(sh0));
  // 평소 달리기: 부메랑은 바위를 통과 (깨지지 않음 · 점수·필살 게이지 그대로)
  const st0 = await G(() => { const sc = window.__gona.scene.getScene('Game'); return { score: sc.score, carry: sc.specialCarry, throws: sc.boomerang.throws }; });
  await G(() => { const sc = window.__gona.scene.getScene('Game'); sc.debugGod(); sc.entities.forEach((e) => { e.done = true; e.sprite.destroy(); }); sc.entities = []; sc.addRock(sc.playerX + 60); sc.distToNext = 9999; });
  await page.keyboard.press('KeyX');
  let passed = false;
  for (let i = 0; i < 8; i++) { await page.waitForTimeout(60); passed = passed || (await G(() => { const sc = window.__gona.scene.getScene('Game'); const r = sc.entities.find((e) => e.type === 'rock'); return !!r && sc.boomerang.isOut && sc.boomerang.x > r.x; })); }
  const st1 = await G(() => { const sc = window.__gona.scene.getScene('Game'); return { score: sc.score, carry: sc.specialCarry, throws: sc.boomerang.throws, rocks: sc.entities.filter((e) => e.type === 'rock' && !e.done).length }; });
  check(`${label}: boomerang passes rocks (rock stays, no score, no special gauge)`, passed && st1.rocks === 1 && st1.score === st0.score && st1.carry === st0.carry && st1.throws === st0.throws + 1, JSON.stringify({ passed, ...st1, score0: st0.score }));
  await page.screenshot({ path: `${S}/boss-${label}-walker.png` });

  // ── 킁카괴물 (4단계 게이지 가득 → 최종 보스전 → 엔딩)
  await page.goto(URL + '?test');
  await startFromTitle(page);
  await G(() => { const sc = window.__gona.scene.getScene('Game'); sc.clearedBosses.add('kiss'); sc.debugSetStage(3); sc.growth.gauge = sc.growth.stage.gaugeToNext - 1; sc.addSnack('strawberry', sc.playerX + 18, 4); });
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').debugBattle(), null, { timeout: 4000 }).catch(() => {});
  check(`${label}: bigbaby gauge full → 킁카괴물 battle`, (await battle())?.id === 'sniff');
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').hearts < 3, null, { timeout: 20000 }).catch(() => {});
  check(`${label}: 킁카괴물 attacks damage GONA`, (await G(() => window.__gona.scene.getScene('Game').hearts)) < 3);
  await G(() => { const g = window.__gona.scene.getScene('Game'); g.hearts = 3; g.updateHud(); g.debugGod(); });
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').debugBattle()?.mode === 'fight', null, { timeout: 8000 });
  let pull = 0, puddle = false; const t0 = Date.now();
  while (Date.now() - t0 < 16000 && !(pull > 5)) {
    const st = await G(() => { const g = window.__gona.scene.getScene('Game'); return { pull: g.pull, pud: g.battle.hostiles.some((h) => h.onGround) }; });
    pull = Math.max(pull, st.pull); puddle = puddle || st.pud;
    await page.waitForTimeout(150);
  }
  check(`${label}: sniff inhale pulls GONA`, pull > 5, `pull ${pull.toFixed(1)} (장판은 1차 분노부터)`);
  await page.screenshot({ path: `${S}/boss-${label}-sniff.png` });
  // 흡입 버티기(QTE) 중에는 공격이 막혀 있으므로 끝날 때까지 기다림 (버티기 연타는 qte 묶음에서 따로 검사)
  await page.waitForFunction(() => !window.__gona.scene.getScene('Game').battle?.resistActive, null, { timeout: 12000 }).catch(() => {});
  const shp = (await battle()).hp;
  await page.waitForFunction(() => !window.__gona.scene.getScene('Game').debugCombat().out, null, { timeout: 4000 }).catch(() => {});
  await page.keyboard.press('KeyX');
  await page.waitForFunction(() => !window.__gona.scene.getScene('Game').debugCombat().out, null, { timeout: 4000 }).catch(() => {});
  check(`${label}: boomerang reaches small boss from tall bigbaby`, (await battle()).hp < shp, `${shp} → ${(await battle()).hp}`);
  await G(() => window.__gona.scene.getScene('Game').debugBoss(21));
  for (let i = 0; i < 5 && !(await battle())?.phase2; i++) { await page.keyboard.press('KeyX'); await page.waitForTimeout(1000); }
  check(`${label}: sniff phase 2 at half HP`, (await battle())?.phase2 && (await page.locator('.bb-phase').isVisible()));
  // (엔딩 화면 확인용: HP 1 로 낮춰도 2차 분노 전환을 거친 뒤 쓰러짐 — 그동안 고나는 무적)
  await G(() => { const g = window.__gona.scene.getScene('Game'); g.debugGod(); g.debugBoss(1); });
  for (let i = 0; i < 80 && (await battle()) && (await battle()).mode !== 'victory'; i++) { await page.keyboard.press('KeyX'); await page.waitForTimeout(700); }
  const slog = await G(() => window.__gona.scene.getScene('Game').battle?.attackLog.join(',') ?? '');
  check(`${label}: 킁카괴물 uses 돼지코 필살기 ①②③ before defeat`, ['storm1', 'storm2', 'storm3'].every((r) => slog.includes(r)), slog);
  // 건너뛰기 버튼으로 대사 넘기기
  await page.waitForSelector('.boss-talk:not(.hidden)', { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(700);
  const talk2 = await G(() => document.querySelector('.boss-talk .pr-shown')?.textContent ?? '');
  await tapEl('.bt-skip');
  check(`${label}: 킁카괴물 last words + skip`, talk2.startsWith('크으윽'), talk2);
  // 가족 엔딩: 연출이 시작되고 (자막 저절로) → 끝까지 빨리 감기 → THE END + 버튼 3개
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').debugEnding()?.state === 'ending', null, { timeout: 20000 }).catch(() => {});
  const en = await G(() => ({ e: window.__gona.scene.getScene('Game').debugEnding(), gameHidden: !window.__gona.scene.getScene('Game').sys.settings.visible, bg: window.__gona.scene.getScene('EndingCine').children.list.some((o) => /^end-bgB-/.test(o.texture?.key || '')) }));
  check(`${label}: final boss win → framed ending (village bg behind, game hidden)`, en.e?.state === 'ending' && en.bg && en.gameHidden, JSON.stringify(en));
  await page.waitForTimeout(2500);
  const music = await G(() => ({ mode: window.__sound.endingMode, want: window.__sound.wantMusic }));
  check(`${label}: ending music started (one track, buffer or file fallback)`, music.mode === 'buffer' || (music.mode === 'file' && music.want === 'ending'), JSON.stringify(music));
  const sub1 = await G(() => document.querySelector('.pr-shown')?.textContent ?? '');
  check(`${label}: ending narration line 1 types by itself`, '처음 세상에 왔을 땐, 모든 것이 낯설고 커다랬던 고나.'.startsWith(sub1) && sub1.length > 3, sub1);
  // SCENE 06 뽀뽀와 킁카 (할머니 볼뽀뽀)
  await G(() => window.__gona.scene.getScene('Game').ending.jumpTo(5));
  await page.waitForTimeout(1500);
  const s6 = await G(() => { const e = window.__gona.scene.getScene('Game').ending; const f = document.querySelector('.end-frame'); return { scene: e.sceneNo, frame: f?.dataset.scene, vid: [...document.querySelectorAll('.ef-vid.on')].map((v) => v.dataset.name).join(','), line: document.querySelector('.pr-shown')?.textContent?.slice(0, 10) }; });
  check(`${label}: ending scene 6 — grandma kiss video in the frame`, s6.scene === 6 && s6.frame === '6' && /ending_0[23]/.test(s6.vid), JSON.stringify(s6));
  // 황금 왕궁 액자 피날레: 크레딧 → 헌정 문구 → The End → 버튼 2개 (자동으로 돌아가지 않음)
  await G(() => window.__gona.scene.getScene('Game').ending.jumpTo(8));
  await page.waitForTimeout(800);
  const early = await G(() => document.querySelector('.ending-ui').classList.contains('with-btns'));
  check(`${label}: finale buttons not shown before The End (credits still running)`, !early);
  await G(() => { const e = window.__gona.scene.getScene('Game').ending; e.t = e.finaleAt + 29; });
  await page.waitForSelector('.ending-ui.with-btns', { timeout: 8000 }).catch(() => {});
  const fin = await G(() => ({ phase: document.querySelector('.ending-ui')?.dataset.phase, oldText: !!document.querySelector('.fin-text'), roll: [...document.querySelectorAll('.fin-roll-line')].map((p) => p.textContent).join('|'), dedi: document.querySelector('.fin-dedi')?.textContent, end: document.querySelector('.fin-end')?.textContent, btns: [...document.querySelectorAll('.fin-btns .fin-btn')].map((b) => b.textContent) }));
  check(`${label}: golden-frame finale — no repeated last sentence, credits, dedication, The End, 2 buttons`, fin.phase === 'finale' && !fin.oldText && fin.roll === 'GONA’s Food Adventure|A Little Adventure,|A Whole Lot of Love.|Made with Love' && fin.dedi === '현이의 모든 도전을 응원하며..' && fin.end === 'The End' && fin.btns.join('|') === '처음부터 다시 하기|타이틀로 돌아가기', JSON.stringify(fin));
  await page.waitForTimeout(2500);
  check(`${label}: finale stays until a button is pressed`, (await G(() => window.__gona.scene.getScene('Game').state)) === 'ending');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${S}/boss-${label}-ending.png` });
  await page.waitForTimeout(700);
  await page.locator('.fin-restart').click(); await page.waitForTimeout(800);
  const rs = await combat();
  check(`${label}: ending → restart from newborn`, rs.stage === 0 && rs.state === 'playing', JSON.stringify(rs));

  // ── 보스전에서 짐 → '보스전 다시' 버튼
  await begin('kiss');
  await G(() => { const sc = window.__gona.scene.getScene('Game'); sc.hearts = 1; sc.hp = 10; });
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

/** 보스전 조작: 실제 터치 이벤트(CDP Input.dispatchTouchEvent — 멀티터치 포함) + HP 시스템 + 프레임 시간 */
async function controlTests(label, device) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...device, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 6, radiusY: 6, force: 1 })) });
  const center = async (sel) => { const r = await page.locator(sel).boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };
  const tap = async (sel) => { const [x, y] = await center(sel); await T('touchStart', [[x, y, 1]]); await T('touchEnd', []); };
  const vp = page.viewportSize();
  const SX = vp.width * 0.5, SY = vp.height * 0.32; // 화면 빈 곳
  const tapScreen = async () => { await T('touchStart', [[SX, SY, 1]]); await T('touchEnd', []); };
  const G = (fn, arg) => page.evaluate(fn, arg);
  const game = () => G(() => { const g = window.__gona.scene.getScene('Game'); return { grounded: g.grounded, jumps: g.jumpsUsed, out: g.boomerang.isOut, state: g.state, hp: g.hp, hearts: g.hearts, shield: g.shieldOn, battle: g.debugBattle() }; });
  const waitGround = () => page.waitForFunction(() => window.__gona.scene.getScene('Game').grounded, null, { timeout: 4000 });

  // 타이틀 테스트 메뉴 → 뽀뽀괴물전 바로
  await page.goto(URL + '?test');
  await page.waitForSelector('.op-skip', { state: 'visible' });
  await page.locator('.op-skip').click();
  await page.waitForSelector('.cover.revealed'); await page.waitForTimeout(2600);
  await tap('.cover-dev-toggle'); await page.waitForTimeout(150);
  await tap('.cover-dev-btn >> nth=0');
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').debugBattle()?.id === 'kiss', null, { timeout: 8000 }).catch(() => {});
  const g0 = await game();
  check(`${label}: title test menu → 뽀뽀괴물 battle directly (HP 100, hearts 3, boss HP 50)`, g0.battle?.id === 'kiss' && g0.hp === 100 && g0.hearts === 3 && g0.battle.hp === 50, JSON.stringify(g0));
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').debugBattle()?.mode === 'fight', null, { timeout: 6000 });
  const top = await G(() => ({ me: !!document.querySelector('.bt-me') && getComputedStyle(document.querySelector('.battle-top')).display !== 'none', hp: document.querySelector('.bt-hp-text').textContent, hearts: document.querySelectorAll('.bt-heart').length }));
  check(`${label}: top shows GONA hearts + HP gauge + boss HP`, top.me && top.hp === 'HP 100' && top.hearts === 3 && (await page.locator('.boss-bar').isVisible()), JSON.stringify(top));
  check(`${label}: buttons: shield (left), big attack + special (right), no dodge button`, (await page.locator('.bt-shield').isVisible()) && (await page.locator('.bt-attack').isVisible()) && (await page.locator('.bt-special:not(.bt-special2)').isVisible()) && (await page.locator('.bt-dodge').count()) === 0);

  // 버튼 위치·크기: 고나·보스를 가리지 않음, 터치 영역 64px 이상, 공격 버튼은 크게
  const geo = await G(() => {
    const g = window.__gona.scene.getScene('Game'); const cv = g.game.canvas.getBoundingClientRect();
    const k = cv.width / g.W; const p = g.player.getBounds(); const br = g.battle.bossRect();
    const S = (x, y) => [cv.left + x * k, cv.top + y * k];
    return { player: [...S(p.x, p.y), ...S(p.right, p.bottom)], boss: [...S(br.x0, br.y0), ...S(br.x1, br.y1)] };
  });
  const rects = [];
  for (const sel of ['.bt-shield .bt-face', '.bt-attack .bt-face', '.bt-special:not(.bt-special2) .bt-face']) rects.push(await page.locator(sel).boundingBox());
  const hit = (r, q) => r.x < q[2] && r.x + r.width > q[0] && r.y < q[3] && r.y + r.height > q[1];
  const inView = rects.every((r) => r.x >= 0 && r.y >= 0 && r.x + r.width <= vp.width && r.y + r.height <= vp.height);
  check(`${label}: buttons inside screen, not covering GONA or boss`, inView && !rects.some((r) => hit(r, geo.player) || hit(r, geo.boss)), JSON.stringify({ geo, rects: rects.map((r) => [r.x, r.y, r.width, r.height].map(Math.round)) }));
  const atkHit = await page.locator('.bt-attack').boundingBox();
  const shHit = await page.locator('.bt-shield').boundingBox();
  check(`${label}: attack face big (≥ 1.5× old) & touch areas ≥ 64px`, rects[1].width >= (label.includes('land') ? 84 : 110) && atkHit.width >= 64 && shHit.width >= 64, `attack face ${rects[1].width} hit ${atkHit.width} · shield hit ${shHit.width}`);

  // ① 화면 빈 곳 터치 = 점프 / 공중에서 한 번 더 = 더블 점프
  await waitGround();
  await tapScreen(); await page.waitForTimeout(80);
  const j1 = await game();
  check(`${label}: screen tap → jump in boss battle`, !j1.grounded && j1.jumps === 1, JSON.stringify(j1));
  await tapScreen(); await page.waitForTimeout(60);
  check(`${label}: tap again in air → double jump`, (await game()).jumps === 2);
  await waitGround();
  // 버튼 터치는 점프로 새지 않음
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').time.now >= window.__gona.scene.getScene('Game').shieldReadyAt, null, { timeout: 5000 });
  await tap('.bt-shield'); await page.waitForTimeout(80);
  const sh = await game();
  check(`${label}: shield button → shield on, no jump`, sh.shield && sh.grounded, JSON.stringify(sh));

  // ② 방패: 1초 동안 막음, 피해 0, 4초 대기 표시, 대기 중 재사용 불가
  const blocked = await G(() => {
    const g = window.__gona.scene.getScene('Game'); const bt = g.battle;
    const hp0 = g.hp;
    bt.spawn('boss-heart', g.playerX + 30, g.groundY - 8, { vx: -150, r: 3.5, dmg: 20 });
    return new Promise((res) => setTimeout(() => res({ hp0, hp1: g.hp, left: bt.hostiles.filter((h) => !h.dead).length }), 400));
  });
  check(`${label}: shield blocks projectile (damage 0)`, blocked.hp1 === blocked.hp0, JSON.stringify(blocked));
  const shUi = await G(() => ({ cls: document.querySelector('.bt-shield').className, label: document.querySelector('.bt-shield .bt-label').textContent }));
  await page.waitForTimeout(800);
  const shCool = await G(() => ({ on: window.__gona.scene.getScene('Game').shieldOn, cls: document.querySelector('.bt-shield').className, cool: document.querySelector('.bt-shield .bt-cool').style.height, label: document.querySelector('.bt-shield .bt-label').textContent }));
  await tap('.bt-shield'); await page.waitForTimeout(60);
  const again = await game();
  check(`${label}: shield ends after ~1s, cooldown shown, can't reuse`, shUi.cls.includes('active') && !shCool.on && parseInt(shCool.cool) > 0 && shCool.label === '준비 중' && !again.shield, JSON.stringify({ shUi, shCool }));

  // ③ 화면 누른 채(점프 손가락) 공격 버튼 (멀티터치)
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').debugCombat().canThrow, null, { timeout: 30000 });
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').debugBattle()?.mode === 'fight', null, { timeout: 6000 });
  await page.waitForFunction(() => !window.__gona.scene.getScene('Game').boomerang.isOut, null, { timeout: 4000 });
  await waitGround();
  const [ax, ay] = await center('.bt-attack');
  await T('touchStart', [[SX, SY, 1]]);
  await T('touchStart', [[SX, SY, 1], [ax, ay, 2]]);
  await page.waitForTimeout(50);
  const mt = await game();
  const pressed = await G(() => [...document.querySelectorAll('.bt.pressed')].map((e) => e.getAttribute('aria-label')));
  check(`${label}: finger on screen (jump) + attack button → both work`, !mt.grounded && mt.out && pressed.includes('공격'), JSON.stringify({ mt, pressed }));
  const cool = await G(() => ({ h: document.querySelector('.bt-attack .bt-cool').style.height, label: document.querySelector('.bt-attack .bt-label').textContent }));
  check(`${label}: attack cooldown clearly shown`, parseInt(cool.h) > 0 && cool.label === '돌아오는 중', JSON.stringify(cool));
  await T('touchMove', [[SX, SY, 1], [ax - 250, ay - 300, 2]]);
  await T('touchEnd', []);
  await page.waitForTimeout(40);
  check(`${label}: no stuck pressed state after finger slides off`, (await G(() => document.querySelectorAll('.bt.pressed').length)) === 0);
  // 돌아오기 직전에 누른 공격은 돌아오자마자 발사 (공격이 씹히지 않음)
  await page.waitForFunction(() => { const b = window.__gona.scene.getScene('Game').boomerang; return b.state === 'back' && b.remaining < 0.1; }, null, { timeout: 4000, polling: 10 }).catch(() => {});
  const th0 = await G(() => window.__gona.scene.getScene('Game').boomerang.throws);
  await tap('.bt-attack');
  await page.waitForFunction((n) => window.__gona.scene.getScene('Game').boomerang.throws > n, th0, { timeout: 800 }).catch(() => {});
  check(`${label}: attack pressed just before return fires on return`, (await G(() => window.__gona.scene.getScene('Game').boomerang.throws)) > th0);
  // 버튼 반응 시간: 터치 → 부메랑 발사까지 (같은 프레임 안)
  await page.waitForFunction(() => !window.__gona.scene.getScene('Game').boomerang.isOut, null, { timeout: 4000 });
  await page.waitForTimeout(50);
  const lat = await G(() => new Promise((res) => {
    const btn = document.querySelector('.bt-attack'); const g = window.__gona.scene.getScene('Game');
    const r = btn.getBoundingClientRect(); const t0 = performance.now();
    btn.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, bubbles: true, clientX: r.x + 5, clientY: r.y + 5, pointerType: 'touch' }));
    const t1 = performance.now();
    res({ out: g.boomerang.isOut, ms: +(t1 - t0).toFixed(2), pressed: btn.classList.contains('pressed') });
  }));
  check(`${label}: attack button reacts in the same event (pressed + throw)`, lat.out && lat.pressed && lat.ms < 8, JSON.stringify(lat));

  // ④ 필살: 게이지 100% 에서만
  const spSt = await G(() => ({ cls: document.querySelector('.bt-special:not(.bt-special2)').className, g: window.__gona.scene.getScene('Game').battle.special }));
  check(`${label}: special enabled only at 100%`, spSt.g >= 1 ? spSt.cls.includes('ready') : spSt.cls.includes('off') && !spSt.cls.includes('ready'), JSON.stringify(spSt));

  // ⑤ HP 시스템: HP 만 감소 → 0 이면 하트 -1, HP 100 회복, 넘친 피해 버림, 무적
  const hpT = await G(() => {
    const g = window.__gona.scene.getScene('Game'); g.shieldUntil = 0; g.invincibleUntil = 0; g.hp = 100; g.hearts = 3;
    const r = {};
    g.hurtBattle(20, 't'); r.a = [g.hearts, g.hp];
    r.inv = g.hurtBattle(20, 't'); // 맞은 직후 무적
    g.invincibleUntil = 0; g.hp = 10; g.hurtBattle(35, 't'); r.b = [g.hearts, g.hp]; // 넘친 25 는 버림
    r.invMs = Math.round(g.invincibleUntil - g.time.now);
    return r;
  });
  check(`${label}: HP system (100→80, i-frames, HP0 → heart -1 → HP 100, no overflow, 1.5s i-frames)`, hpT.a[0] === 3 && hpT.a[1] === 80 && hpT.inv === false && hpT.b[0] === 2 && hpT.b[1] === 100 && hpT.invMs > 1300, JSON.stringify(hpT));

  // ⑥ 일시정지 중 버튼 비활성
  await page.locator('.top-buttons .icon-btn >> nth=0').click();
  await page.waitForTimeout(150);
  const offs = await G(() => [...document.querySelectorAll('.bt-shield, .bt-attack')].map((e) => e.classList.contains('off')));
  const before = await game();
  await tap('.bt-attack'); await page.waitForTimeout(80);
  const ps = await game();
  check(`${label}: buttons disabled while paused`, offs.every(Boolean) && ps.state === 'paused' && ps.out === before.out, JSON.stringify({ offs, ps }));
  await page.locator('.top-buttons .icon-btn >> nth=0').click();
  await page.waitForTimeout(150);

  // ⑦ 프레임 시간: 화면 터치 점프 20번 (이 컨테이너는 GPU 없이 그려서 절대값은 실제 기기보다 나쁨 — 터치 순간 튀는지만 봄)
  await G(() => window.__perf.reset());
  for (let i = 0; i < 20; i++) { await tapScreen(); await page.waitForTimeout(350); }
  const ps2 = await G(() => window.__perf.stats());
  const longEv = await G(() => window.__perf.long.slice(0, 40).map((f) => f.events.map((e) => e.name).join('+')));
  check(`${label}: frame time during 20 jump taps (info)`, true, `${JSON.stringify(ps2)} long frames with input/sfx: ${longEv.filter((e) => /input|btn|jump|sfx|audio/.test(e)).length}/${longEv.length}`);
  const unl = await G(() => window.__perf.long.flatMap((f) => f.events).filter((e) => e.name === 'audio:unlock').length);
  check(`${label}: no audio unlock work on repeated taps`, unl === 0, `unlock in long frames: ${unl}`);
  check(`${label}: no page errors (controls)`, errs.length === 0, errs.join(' | '));
  await b.close();
}

/** 이번 개선: 위쪽 HUD 겹침 · 일반 몬스터 · 보스 분노 · 체크포인트 */
async function featureTests(label, device) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...device, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  const G = (f, a) => page.evaluate(f, a);
  await page.goto(URL + '?test');
  await G(() => localStorage.removeItem('gona.checkpoint'));
  await startFromTitle(page);
  // HUD: 점수 · 하트+HP+성장 · 일시정지 버튼이 겹치지 않음 (점수 큰 값, 3단계 공격 버튼까지)
  await G(() => { const g = window.__gona.scene.getScene('Game'); g.clearedBosses.add('kiss'); g.debugSetStage(2); g.growth.gauge = 30; g.score = 123456; g.updateHud(); });
  await page.waitForTimeout(300);
  const rects = await G(() => {
    const r = (sel) => { const e = document.querySelector(sel); const q = e.getBoundingClientRect(); return [q.left, q.top, q.right, q.bottom]; };
    return { score: r('.hud-score'), me: r('.bt-me'), btns: r('.top-buttons'), attack: r('.bt-attack .bt-face'), vw: innerWidth, vh: innerHeight, canvasHearts: window.__gona.scene.getScene('Game').heartIcons.some((h) => h.visible), grow: document.querySelector('.bt-grow-text').textContent };
  });
  const ov = (a, c) => a[0] < c[2] && a[2] > c[0] && a[1] < c[3] && a[3] > c[1];
  const inside = (a) => a[0] >= 0 && a[1] >= 0 && a[2] <= rects.vw && a[3] <= rects.vh;
  check(`${label}: HUD score / hearts+HP+growth / pause don't overlap`, !ov(rects.score, rects.me) && !ov(rects.score, rects.btns) && !ov(rects.me, rects.btns) && [rects.score, rects.me, rects.btns, rects.attack].every(inside), JSON.stringify(rects));
  check(`${label}: old canvas stage cells gone, growth shown as text`, !rects.canvasHearts && rects.grow === '성장 3/4', rects.grow);
  // 몬스터: 1·2단계엔 안 나옴
  const early = await G(() => { const g = window.__gona.scene.getScene('Game'); g.clearedBosses.clear(); g.debugSetStage(1); let n = 0; for (let i = 0; i < 300; i++) { const before = g.spawned; g.spawnPattern(); n += g.spawned - before; } g.entities.forEach((e) => { e.done = true; e.sprite.destroy(); }); g.entities = []; return n; });
  check(`${label}: no monsters in stage 1-2`, early === 0, `spawned ${early}`);
  const later = await G(() => { const g = window.__gona.scene.getScene('Game'); g.clearedBosses.add('kiss'); g.debugSetStage(2); let n = 0; for (let i = 0; i < 300; i++) { const before = g.spawned; g.spawnPattern(); n += g.spawned - before; g.entities.filter((e) => e.type === 'monster').forEach((e) => { e.done = true; e.sprite.destroy(); }); g.entities = g.entities.filter((e) => !e.done); } g.entities.forEach((e) => { e.done = true; e.sprite.destroy(); }); g.entities = []; g.distToNext = 1e9; return n; });
  check(`${label}: monsters appear from stage 3`, later > 10, `spawned ${later} / 300 patterns`);
  // 몬스터 공격(예고 뒤) → 맞으면 HP / 부메랑 처치 → 점수·필살 게이지
  await G(() => { const g = window.__gona.scene.getScene('Game'); g.hp = 100; g.invincibleUntil = 0; g.addMonster('glasses', g.W + 5); });
  const tagKey = await G(() => { const g = window.__gona.scene.getScene('Game'); const t = [...g.monTags.values()][0]; return t ? t.texture.key : ''; });
  check(`${label}: monster name tag [화학과안경잽이] above head`, tagKey.includes('[화학과안경잽이]'), tagKey);
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').entities.some((e) => !e.done && e.type === 'mshot'), null, { timeout: 8000 }).catch(() => {});
  const shotDist = await G(() => { const g = window.__gona.scene.getScene('Game'); const sh = g.entities.find((e) => !e.done && e.type === 'mshot'); return sh ? Math.round(sh.x - g.playerX) : -1; });
  check(`${label}: glasses throws a dodgeable potion flask from distance`, shotDist > 70, `shot at +${shotDist}px`);
  // 보라 물약 플라스크 2~3개 포물선 → 땅에서 '팡' 깨지고 웅덩이 / 부메랑에 맞으면 공중에서 깨짐
  await G(() => { const g = window.__gona.scene.getScene('Game'); g.debugGod(); window.__fl = { n: 0, arcs: 0, maxAlt: 0, shatter: 0, puddle: 0 }; const seen = new Set(); g.events.on('postupdate', window.__flFn = () => { for (const e of g.entities) { if (e.type === 'mshot' && !e.done) { window.__fl.maxAlt = Math.max(window.__fl.maxAlt, e.alt); } if (seen.has(e)) continue; seen.add(e); if (e.type === 'mshot') { window.__fl.n++; window.__fl.tex = e.sprite.texture.key; if (e.grav) window.__fl.arcs++; window.__fl.box = [e.w, e.h]; } else if (e.type === 'puddle') window.__fl.puddle++; else if (e.sprite.texture?.key === 'mon-shatter') window.__fl.shatter++; } }); });
  await page.waitForTimeout(2600);
  const fl = await G(() => { window.__gona.scene.getScene('Game').events.off('postupdate', window.__flFn); return window.__fl; });
  check(`${label}: glasses throws 2-3 purple flasks in arcs (shatter + puddle, no cash)`, fl.n >= 2 && fl.tex === 'mon-flask' && fl.arcs === fl.n && fl.maxAlt > 20 && fl.shatter >= 1 && fl.puddle >= 1, JSON.stringify(fl));
  const pd = await G(() => new Promise((res) => { const g = window.__gona.scene.getScene('Game'); g.debugGod(false); g.invincibleUntil = 0; g.hp = 100; const f = { x: g.playerX + 14, alt: 30, done: false, sprite: g.add.sprite(0, 0, 'mon-flask', 0) }; g.breakFlask(f, true); setTimeout(() => res({ hp: g.hp, log: g.damageLog.slice(-1)[0] }), 900); }));
  check(`${label}: stepping in the purple puddle costs HP`, pd.hp < 100 && pd.log === 'puddle:15', JSON.stringify(pd));
  const bm = await G(() => new Promise((res) => { const g = window.__gona.scene.getScene('Game'); g.debugGod(); g.entities.filter((e) => e.type === 'mshot' || e.type === 'puddle').forEach((e) => { e.done = true; e.sprite.destroy(); }); const sp = g.add.sprite(0, 0, 'mon-flask', 0).setOrigin(0.5, 1).setDepth(6); const fe = { sprite: sp, type: 'mshot', x: g.playerX + 40, alt: 12, w: 8, h: 10, phase: 0, done: false, vx: -g.speed, valt: 0, grav: 0.0001, dmg: 20, age: 0 }; g.entities.push(fe); const n0 = g.entities.filter((e) => e.type === 'puddle' && !e.done).length; g.throwHair(); setTimeout(() => res({ broke: fe.done, puddles: g.entities.filter((e) => e.type === 'puddle' && !e.done).length - n0 }), 900); }));
  check(`${label}: boomerang shatters a flask in the air (no puddle)`, bm.broke && bm.puddles === 0, JSON.stringify(bm));
  await G(() => { const g = window.__gona.scene.getScene('Game'); g.debugGod(false); g.invincibleUntil = 0; });
  const k0 = await G(() => window.__gona.scene.getScene('Game').kills);
  // (몬스터는 화면 오른쪽에서 걸어 들어옴 — 부메랑 사거리에 올 때까지 계속 던짐)
  for (let i = 0; i < 30; i++) { if (!(await G(() => window.__gona.scene.getScene('Game').entities.some((e) => !e.done && e.type === 'monster')))) break; await page.keyboard.press('KeyX'); await page.waitForTimeout(500); }
  const kd = await G(() => { const g = window.__gona.scene.getScene('Game'); return { kills: g.kills, special: g.specialCarry, score: g.score }; });
  // 배불뚝이 아저씨: 엉덩이(몸 뒤쪽)에서 방귀 구름
  const fart = await G(() => new Promise((res) => { const g = window.__gona.scene.getScene('Game'); g.debugGod(); g.entities.forEach((e) => { e.done = true; e.sprite.destroy(); }); g.entities = []; g.addMonster('farter', g.W - 30);
    const m = g.entities.find((e) => e.type === 'monster'); m.mon.cd = 0;
    const fn = () => { const c = g.entities.find((e) => e.type === 'cloud'); if (c) { g.events.off('postupdate', fn); res({ relX: Math.round((c.x - m.x) * 10) / 10, frame: m.sprite.frame.name, alt: c.alt }); } };
    g.events.on('postupdate', fn); setTimeout(() => { g.events.off('postupdate', fn); res(null); }, 6000); }));
  check(`${label}: uncle farts from his butt (cloud spawns behind, not face)`, !!fart && fart.relX > 0, JSON.stringify(fart));
  // 고나 아파! 표정: 4단계 모두 전용 프레임이 있고, 맞으면 같은 단계 그림의 찡그린 표정 → 0.5초 뒤 원래대로
  const hurt = await G(() => new Promise((res) => { const g = window.__gona.scene.getScene('Game'); const ids = ['newborn', 'crawler', 'walker', 'bigbaby'];
    const tex = ids.map((id) => g.textures.exists(`hurt-${id}`) && g.textures.get(`hurt-${id}`).frameTotal - 1 === 4);
    g.entities.forEach((e) => { e.done = true; e.sprite.destroy(); }); g.entities = []; g.distToNext = 1e9; g.sinceMonster = -1e9;
    g.debugGod(false); g.invincibleUntil = 0; g.hearts = 3; g.hp = 100; g.hurtHp(10, 'test');
    setTimeout(() => { const a = g.player.texture.key; setTimeout(() => res({ tex, during: a, after: g.player.texture.key, stage: g.vis.id }), 650); }, 120); }));
  check(`${label}: GONA hurt face for all 4 stages, shown on hit then restored`, hurt.tex.every(Boolean) && hurt.during === `hurt-${hurt.stage}` && !hurt.after.startsWith('hurt-'), JSON.stringify(hurt));
  check(`${label}: boomerang kills monster → score + special gauge`, kd.kills > k0 && kd.special > 0, JSON.stringify(kd));
  // 체크포인트
  await G(() => { const g = window.__gona.scene.getScene('Game'); g.debugGod(); g.boomerangAwake = true; g.debugStartBoss('kiss'); });
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').debugBattle()?.mode === 'fight', null, { timeout: 8000 });
  // 분노 1단계(HP 70%) — 전환 때 멈춤 → 필살기 ① → 그 뒤에야 2차 분노(40%)
  const rage = [];
  await G(() => window.__gona.scene.getScene('Game').debugBoss(3));
  for (let i = 0; i < 8; i++) { await page.keyboard.press('KeyX'); await page.waitForTimeout(400); const r = await G(() => { const bt = window.__gona.scene.getScene('Game').battle; return { rage: bt.rage, frozen: bt.frozen, label: document.querySelector('.bb-phase').textContent }; }); if (r.rage >= 1) { rage.push(r); break; } }
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').battle?.attackLog.some((a) => a.startsWith('royal1')), null, { timeout: 25000 }).catch(() => {});
  for (let i = 0; i < 40; i++) { await page.keyboard.press('KeyX'); await page.waitForTimeout(500); const r = await G(() => { const bt = window.__gona.scene.getScene('Game').battle; return { rage: bt.rage, frozen: bt.frozen, label: document.querySelector('.bb-phase').textContent, done: bt.specialsDone }; }); if (r.rage >= 2) { rage.push(r); break; } }
  check(`${label}: boss rage 1 → 왕뽀뽀① → rage 2 (special shown before next rage)`, rage.length === 2 && rage[0].frozen && rage[1].rage === 2 && rage[1].done >= 1 && rage[1].label.includes('2차'), JSON.stringify(rage));
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').battle?.attackLog.some((a) => a.startsWith('royal2')), null, { timeout: 25000 }).catch(() => {});
  check(`${label}: rage 2 uses 왕뽀뽀② special`, await G(() => window.__gona.scene.getScene('Game').battle?.attackLog.some((a) => a.startsWith('royal2'))));
  await G(() => window.__gona.scene.getScene('Game').debugBoss(1));
  for (let i = 0; i < 60 && ['fight', 'cutscene'].includes(await G(() => window.__gona.scene.getScene('Game').debugBattle()?.mode)); i++) { await page.keyboard.press('KeyX'); await page.waitForTimeout(600); }
  await page.waitForFunction(() => { const g = window.__gona.scene.getScene('Game'); return g.growth.stageIndex === 2 && g.state === 'playing'; }, null, { timeout: 35000 }).catch(() => {});
  const cp = await G(() => JSON.parse(localStorage.getItem('gona.checkpoint') || 'null'));
  check(`${label}: checkpoint saved after first boss`, cp?.id === 'walker', JSON.stringify(cp));
  await G(() => { const g = window.__gona.scene.getScene('Game'); g.debugGod(false); g.hearts = 1; g.hp = 10; g.invincibleUntil = 0; g.entities.forEach((e) => { e.done = true; e.sprite.destroy(); }); g.entities = []; g.addRock(g.playerX + 25); });
  await page.waitForSelector('.over-screen:not(.hidden)', { timeout: 8000 });
  await page.waitForTimeout(600);
  check(`${label}: game over offers checkpoint continue + new game`, (await page.locator('.cp-retry').isVisible()) && (await page.locator('.over-screen .retry-btn').textContent()).includes('새 게임'));
  await page.locator('.cp-retry').click();
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').state === 'playing', null, { timeout: 6000 });
  const rs = await G(() => { const g = window.__gona.scene.getScene('Game'); return { stage: g.growth.stageIndex, hp: g.hp, hearts: g.hearts, kiss: g.clearedBosses.has('kiss'), throw: g.canThrow }; });
  check(`${label}: continue from checkpoint = stage 3, HP 100, boomerang`, rs.stage === 2 && rs.hp === 100 && rs.hearts === 3 && rs.kiss && rs.throw, JSON.stringify(rs));
  check(`${label}: no page errors (features)`, errs.length === 0, errs.join(' | '));
  await b.close();
}

/** 보스 대사창 배치 · 필살기 컷인 · 킁카 움직이는 과녁 · 흡입 버티기 연타 (?test= 경로로) */
async function qteTests(label, device) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...device, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  const G = (f, a) => page.evaluate(f, a);
  // 1) 대사창: 이름표 → 본문 → 버튼 순서, 모두 상자 안, 상자는 화면 안, 전투 HUD 숨김
  for (const id of ['kiss-talk', 'sniff-talk']) {
    await page.goto(URL + '?test=' + id);
    await page.waitForSelector('.boss-talk:not(.hidden)', { timeout: 30000 });
    await page.waitForTimeout(2500);
    const d = await G(() => {
      const vw = innerWidth, vh = innerHeight;
      const r = (s) => { const e = document.querySelector(s); if (!e) return null; const q = e.getBoundingClientRect(); return { x: q.x, y: q.y, r: q.right, b: q.bottom }; };
      const box = r('.boss-talk'), name = r('.btk-name'), text = r('.btk-text'), next = r('.btk-next'), skip = r('.bt-skip');
      const inside = (a) => a && a.x >= 0 && a.y >= 0 && a.r <= vw + 0.5 && a.b <= vh + 0.5;
      const within = (a) => a && box && a.x >= box.x - 0.5 && a.y >= box.y - 0.5 && a.r <= box.r + 0.5 && a.b <= box.b + 0.5;
      const hidden = ['.battle-top', '.battle-pad'].every((s) => { const e = document.querySelector(s); return !e || getComputedStyle(e).visibility === 'hidden' || getComputedStyle(e).display === 'none' || e.classList.contains('hidden'); });
      return { ok: inside(box) && within(name) && within(text) && within(next) && within(skip) && name.b <= text.y + 0.5 && text.b <= Math.min(next.y, skip.y) + 0.5, hidden, box };
    });
    check(`${label}: ${id} dialog — name/text/buttons inside a safe box, HUD hidden`, d.ok && d.hidden, JSON.stringify(d));
    await page.screenshot({ path: `${S}/${label}-${id}.png` });
  }
  // 2) 필살기 컷인: 고나 얼굴 전체가 화면 안
  await page.goto(URL + '?test=kiss-special');
  await page.waitForFunction(() => { const f = window.__gona?.scene.getScene('Game').battle?.cutInFace; return f && f.active && f.parentContainer && f.parentContainer.x >= -0.5; }, null, { timeout: 30000, polling: 30 });
  const ci = await G(() => { const g = window.__gona.scene.getScene('Game'); const f = g.battle.cutInFace; const x0 = f.parentContainer.x + f.x; return { x0, y0: f.y, x1: x0 + f.displayWidth, y1: f.y + f.displayHeight, W: g.W, H: g.H, crop: !!f.isCropped }; });
  check(`${label}: special cut-in shows GONA's whole face on screen`, ci.x0 >= 0 && ci.y0 >= 0 && ci.x1 <= ci.W && ci.y1 <= ci.H && !ci.crop, JSON.stringify(ci));
  await page.screenshot({ path: `${S}/${label}-cutin.png` });
  // 3) 코 조준: 안내(전투 멈춤) → 보스 위 조준점이 머리↔코 왕복 → '발사!' 만 활성 → 누른 순간 조준점 자리로 판정 → 결과 안내(멈춤) → 복귀
  const AD = () => G(() => window.__gona.scene.getScene('Game').battle?.aimDebug?.() ?? null);
  const btnState = () => G(() => ({ atk: document.querySelector('.bt-attack').className, atkLabel: document.querySelector('.bt-attack .bt-label').textContent, sh: document.querySelector('.bt-shield').className, sp: document.querySelector('.bt-special:not(.bt-special2)').className, sp2: document.querySelector('.bt-special2').className, banner: document.querySelector('.battle-banner:not(.hidden)')?.innerText.replace(/\s+/g, ' ').trim() ?? '' }));
  const aimOpen = async () => { await page.goto(URL + '?test=sniff-aim'); await page.waitForFunction(() => window.__gona?.scene.getScene('Game').battle?.aimDebug?.(), null, { timeout: 30000 }); };
  // 조준점이 원하는 판정 자리에 오는 순간(매 프레임 확인) 실제 공격 버튼에 pointerdown/up — 누를 때의 조준점·코 화면 좌표도 기록
  const fireWhen = (want) => G((want) => new Promise((res) => {
    const btn = document.querySelector('.bt-attack');
    const t0 = performance.now();
    const loop = () => {
      const bt = window.__gona.scene.getScene('Game').battle;
      const d = bt?.aimDebug?.();
      if (d && d.phase === 'aim' && d.judge === want && (want !== 'miss' || d.u < 0.15)) {
        const shot = { reticle: d.reticle, nose: d.nose, fw: bt.fw, hp: bt.hp };
        const r = btn.getBoundingClientRect();
        const o = { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
        btn.dispatchEvent(new PointerEvent('pointerdown', o));
        btn.dispatchEvent(new PointerEvent('pointerup', o));
        return res(shot);
      }
      if (performance.now() - t0 > 9000) return res(null);
      requestAnimationFrame(loop);
    };
    loop();
  }), want);
  await aimOpen();
  const intro = { d: await AD(), b: await btnState(), frozen: await G(() => window.__gona.scene.getScene('Game').battle.frozen) };
  await page.screenshot({ path: `${S}/${label}-aim-intro.png` });
  check(`${label}: aim intro — battle paused, '🎯 킁카괴물의 약점은 코!' guide, all buttons locked`, intro.d.phase === 'intro' && intro.frozen && /킁카괴물의 약점은 코!/.test(intro.b.banner) && /움직이는 조준점을 코에 맞춰 공격해보세요!/.test(intro.b.banner) && / off/.test(intro.b.atk) && / off/.test(intro.b.sh) && / off/.test(intro.b.sp), JSON.stringify(intro));
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').battle.aimDebug()?.phase === 'aim', null, { timeout: 5000 });
  const a1 = await AD();
  await page.waitForTimeout(250);
  const a2 = await AD();
  const bs = await btnState();
  const onBoss = await G(() => { const bt = window.__gona.scene.getScene('Game').battle; const r = bt.bossRect(); const d = bt.aimDebug(); return d.reticle.x >= r.x0 - 2 && d.reticle.x <= r.x1 + 2 && d.reticle.y >= r.y0 - 2 && d.reticle.y <= r.y1 + 2; });
  await page.screenshot({ path: `${S}/${label}-aim.png` });
  check(`${label}: aim — reticle moves on the boss sprite (head↔nose), only '발사!' is active`, a1.reticle && a2.reticle && (a1.reticle.x !== a2.reticle.x || a1.reticle.y !== a2.reticle.y) && onBoss && bs.atkLabel === '발사!' && / aim/.test(bs.atk) && !/ off/.test(bs.atk) && / off/.test(bs.sh) && / off/.test(bs.sp), JSON.stringify({ a1, a2, bs, onBoss }));
  // 조준 중 방패를 눌러도 방패가 켜지지 않음
  const shBox = await page.locator('.bt-shield').boundingBox();
  await page.touchscreen.tap(shBox.x + shBox.width / 2, shBox.y + shBox.height / 2);
  await page.waitForTimeout(80);
  check(`${label}: shield does nothing during aiming`, !(await G(() => document.querySelector('.bt-shield').classList.contains('active'))));
  const pshot = await fireWhen('perfect');
  await page.waitForTimeout(80);
  const plog = await G(() => window.__gona.scene.getScene('Game').battle.aimLog.slice(-1)[0]);
  // 화면의 조준점(누른 순간)과 판정 거리가 같은지: 화면 거리 × 48 / 보스 폭 = 기록된 거리
  const scr = pshot ? (Math.hypot(pshot.reticle.x - pshot.nose.x, pshot.reticle.y - pshot.nose.y) * 48) / pshot.fw : -1;
  check(`${label}: the judged spot = the reticle shown on screen at the press`, plog && plog.judge === 'perfect' && Math.abs(scr - plog.dist) < 1.2, JSON.stringify({ scr, plog }));
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').battle.aimDebug()?.phase === 'result', null, { timeout: 4000 }).catch(() => {});
  const pres = { b: await btnState(), frozen: await G(() => window.__gona.scene.getScene('Game').battle.frozen), weak: await G(() => window.__gona.scene.getScene('Game').battle.weakHits) };
  await page.screenshot({ path: `${S}/${label}-aim-perfect.png` });
  check(`${label}: PERFECT → nose ×2, '🎯 완벽 명중!' popup, battle paused`, /완벽 명중!/.test(pres.b.banner) && /코를 정확히 맞혔어요!/.test(pres.b.banner) && pres.frozen && pres.weak >= 1, JSON.stringify(pres));
  await page.waitForFunction(() => !window.__gona.scene.getScene('Game').battle.aimDebug(), null, { timeout: 4000 }).catch(() => {});
  const after = { d: await AD(), b: await btnState(), frozen: await G(() => window.__gona.scene.getScene('Game').battle.frozen) };
  check(`${label}: after the result the battle resumes and buttons return`, !after.d && !after.frozen && after.b.atkLabel !== '발사!' && !/ aim/.test(after.b.atk), JSON.stringify(after));
  await aimOpen();
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').battle.aimDebug()?.phase === 'aim', null, { timeout: 5000 });
  await fireWhen('good');
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').battle.aimDebug()?.phase === 'result', null, { timeout: 4000 }).catch(() => {});
  const gd = { log: await G(() => window.__gona.scene.getScene('Game').battle.aimLog), b: await btnState() };
  check(`${label}: GOOD → normal hit, '✨ 공격 성공!' popup`, gd.log.some((a) => a.judge === 'good' && a.mul === 1) && /공격 성공!/.test(gd.b.banner) && /코를 스쳤어요!/.test(gd.b.banner), JSON.stringify(gd));
  await aimOpen();
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').battle.aimDebug()?.phase === 'aim', null, { timeout: 5000 });
  const mshot = await fireWhen('miss');
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').battle.aimDebug()?.phase === 'result', null, { timeout: 4000 }).catch(() => {});
  const ms = { log: await G(() => window.__gona.scene.getScene('Game').battle.aimLog), b: await btnState(), hp: await G(() => window.__gona.scene.getScene('Game').battle.hp), hp0: mshot?.hp };
  check(`${label}: MISS → boomerang misses (no damage), '💨 공격 실패!' popup`, ms.log.length === 1 && ms.log[0].judge === 'miss' && /공격 실패!/.test(ms.b.banner) && /코를 빗나갔어요!/.test(ms.b.banner) && ms.hp === ms.hp0, JSON.stringify(ms));
  await page.goto(URL + '?test=sniff-weakpoint');
  await page.waitForFunction(() => (window.__gona?.scene.getScene('Game').battle?.aimLog ?? []).some((a) => a.mul === 2), null, { timeout: 30000 }).catch(() => {});
  const wl = await G(() => { const bt = window.__gona.scene.getScene('Game').battle; return { log: bt.aimLog, weak: bt.weakHits }; });
  check(`${label}: auto test route lands PERFECT nose hits`, wl.log.some((a) => a.judge === 'perfect' && a.mul === 2), JSON.stringify(wl));
  // 4) 흡입 버티기: 화면 가운데 큰 '버티기!' 버튼 (방패 버튼은 그대로) · 연타로 성공 / 꾹 누르기는 1번만 / 안 누르면 실패(피해)
  await page.goto(URL + '?test=sniff-inhale');
  await page.waitForFunction(() => window.__gona?.scene.getScene('Game').battle?.resistActive, null, { timeout: 30000 });
  await page.waitForTimeout(150);
  const ql = await G(() => { const rb = document.querySelector('.bt-resist'); const r = rb.getBoundingClientRect(); const pad = [...document.querySelectorAll('.bt-attack, .bt-shield, .bt-special')].map((b) => b.getBoundingClientRect()); const top = document.querySelector('.battle-top').getBoundingClientRect(); const g = window.__gona.scene.getScene('Game'); const canvas = document.querySelector('canvas').getBoundingClientRect(); const k = canvas.height / g.H; const faceY = canvas.top + (g.groundY - 30) * k; return { shown: !rb.classList.contains('hidden'), text: rb.textContent, shLabel: document.querySelector('.bt-shield .bt-label')?.textContent, box: !document.querySelector('.resist-box')?.classList.contains('hidden'), big: r.width >= 180 && r.height >= 60, inView: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, clearOfPad: pad.every((p) => r.bottom <= p.top || r.top >= p.bottom || r.right <= p.left || r.left >= p.right), belowHud: r.top >= top.bottom, aboveFaces: r.bottom <= faceY + 2, faceY: Math.round(faceY), r: [r.left, r.top, r.width, r.height].map(Math.round) }; });
  await page.screenshot({ path: `${S}/${label}-resist.png` });
  const btn = page.locator('.bt-resist');
  const bb = await btn.boundingBox();
  // 꾹 누르기 (1.0초) → 1번만 셈
  const t0 = await G(() => window.__gona.scene.getScene('Game').battle.resist.taps);
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(1000); await page.mouse.up();
  const t1 = await G(() => window.__gona.scene.getScene('Game').battle.resist?.taps ?? -1);
  for (let i = 0; i < 40; i++) { if (!(await G(() => window.__gona.scene.getScene('Game').battle.resistActive))) break; await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.waitForTimeout(150); }
  await page.waitForTimeout(400);
  const rs = await G(() => { const g = window.__gona.scene.getScene('Game'); return { log: g.battle.resistLog, hidden: document.querySelector('.bt-resist').classList.contains('hidden') }; });
  check(`${label}: inhale → big '버티기!' button in the middle (not on the shield), with gauge, clear of HUD/buttons/faces`, ql.shown && ql.text === '버티기!' && ql.shLabel !== '버티기!' && ql.box && ql.big && ql.inView && ql.clearOfPad && ql.belowHud && ql.aboveFaces, JSON.stringify(ql));
  check(`${label}: holding the button counts once (no auto-repeat)`, t1 - t0 === 1, `${t0} → ${t1}`);
  check(`${label}: one-finger mashing wins the resist QTE, the button disappears afterwards`, rs.log[0] === 'success' && rs.hidden, JSON.stringify(rs));
  await page.goto(URL + '?test=resist-fail');
  await page.waitForFunction(() => (window.__gona?.scene.getScene('Game').battle?.resistLog ?? []).length > 0, null, { timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const rf = await G(() => { const g = window.__gona.scene.getScene('Game'); return { log: g.battle.resistLog, hp: g.hp, hearts: g.hearts, pull: Math.round(g.pull) }; });
  check(`${label}: no mashing → sucked in, takes damage, pushed back`, rf.log[0] === 'fail' && (rf.hp < 100 || rf.hearts < 3) && rf.pull < 30, JSON.stringify(rf));
  // 5) 두바이 똥냄새 공격: 킁카괴물전에서만 초록 버튼 · 같은 필살 게이지 · 배너 · 피해 = 기존 필살기 피해 · 전투 복귀
  await page.goto(URL + '?test=sniff-dubai');
  await page.waitForFunction(() => window.__gona?.scene.getScene('Game').battle?.specialReady, null, { timeout: 40000 });
  await page.waitForTimeout(200);
  const d0 = await G(() => { const bt = window.__gona.scene.getScene('Game').battle; const a = document.querySelector('.bt-special2').getBoundingClientRect(); const others = [...document.querySelectorAll('.bt-attack, .bt-shield, .bt-special:not(.bt-special2)')].map((b) => b.getBoundingClientRect()); return { hp: bt.hp, dmg: bt.def.specialDamage, cls: document.querySelector('.bt-special2').className, vis: a.width > 0, noOverlap: others.every((p) => a.right <= p.left + 1 || a.left >= p.right - 1 || a.bottom <= p.top + 1 || a.top >= p.bottom - 1), inView: a.left >= 0 && a.right <= innerWidth && a.bottom <= innerHeight }; });
  await page.screenshot({ path: `${S}/${label}-dubai-ready.png` });
  const db = await page.locator('.bt-special2').boundingBox();
  await page.touchscreen.tap(db.x + db.width / 2, db.y + db.height / 2);
  await page.waitForTimeout(250);
  const d1 = await btnState();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${S}/${label}-dubai.png` });
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').battle.mode === 'fight', null, { timeout: 8000 }).catch(() => {});
  const d2 = await G(() => { const bt = window.__gona.scene.getScene('Game').battle; return { hp: bt.hp, mode: bt.mode, special: bt.special, frozen: bt.frozen }; });
  check(`${label}: '두바이!' button shown only in the sniff battle, ready when the gauge is full, no overlap`, / ready/.test(d0.cls) && d0.vis && d0.noOverlap && d0.inView, JSON.stringify(d0));
  check(`${label}: 두바이 똥냄새 공격 — banner, damage = existing special damage, gauge used, back to the fight`, /두바이 똥냄새 공격!/.test(d1.banner) && d0.hp - d2.hp === d0.dmg && d2.special === 0 && d2.mode === 'fight' && !d2.frozen, JSON.stringify({ d0, d1: d1.banner, d2 }));
  await page.goto(URL + '?test=kiss-boss');
  await page.waitForFunction(() => window.__gona?.scene.getScene('Game').battle, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  check(`${label}: kiss battle has no 두바이 button`, (await G(() => document.querySelector('.bt-special2').getBoundingClientRect().width)) === 0);
  check(`${label}: no page errors (qte)`, errs.length === 0, errs.join(' | '));
  await b.close();
}

/** 터치할 때 배경음악이 늘어나는지 — 모든 HTMLMediaElement.play() 호출(음소거 준비 재생 포함)과 Web Audio 소스를 기록 */
async function touchAudioTests(label, device) {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ ...device, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.addInitScript(() => {
    const log = (window.__plays = []);
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (/bgm-/.test(this.src)) log.push({ t: Math.round(performance.now()), src: this.src.split('/').pop(), muted: this.muted, id: (this.__id ??= Math.random().toString(36).slice(2, 6)) });
      return play.call(this);
    };
    window.__bufs = 0;
    const all = (window.__allEls = new Set());
    const O = window.Audio;
    window.Audio = function (...a) { const e = new O(...a); all.add(e); return e; };
    window.Audio.prototype = O.prototype;
    const st = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a) { if (this.buffer && this.buffer.duration > 20) window.__bufs++; return st.apply(this, a); };
  });
  const G = (f, a) => page.evaluate(f, a);
  const tap = async (sel) => { const r = await page.locator(sel).first().boundingBox(); await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); };
  const vp = page.viewportSize();
  const tapEmpty = () => page.touchscreen.tap(vp.width / 2, Math.round(vp.height * 0.12));
  // 다음 ▶ 자리를 터치 (숨겨져 있을 때도 그 자리를 누름 — 장면이 끝나기 전엔 아무 일 없어야 함)
  const tapAt = async (sel) => { const r = await G((q) => document.querySelector(q).getBoundingClientRect().toJSON(), sel); await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); };
  const state = () => G(() => {
    const els = (window.__sound && Object.values(window.__sound.allBgmEls?.() ?? {})) || [];
    return { playing: [...document.querySelectorAll('audio')].length, plays: window.__plays.length, bufs: window.__bufs };
  });
  const steps = [];
  const record = async (name) => {
    await page.waitForTimeout(500);
    const r = await G(() => { const out = { plays: window.__plays.slice(), bufs: window.__bufs, dbg: window.__sound.bgmDebug(), audible: [...(window.__allEls || [])].filter((e) => /bgm-/.test(e.src) && !e.paused).length }; window.__plays.length = 0; window.__bufs = 0; return out; });
    steps.push({ name, plays: r.plays.length, srcs: [...new Set(r.plays.map((p) => p.src + (p.muted ? '(m)' : '')))].join(' '), bufs: r.bufs, active: r.dbg.active, playingEls: r.audible });
  };
  const round = async (tag) => {
    await G(() => { window.__plays.length = 0; window.__bufs = 0; });
    await page.waitForTimeout(10000); await record(`${tag} 10초 대기`);
    await tapEmpty(); await record(`${tag} 빈 곳 1회`);
    await tapAt('.pr-next'); await record(`${tag} 다음 1회`);
    for (let i = 0; i < 5; i++) { await tapEmpty(); await page.waitForTimeout(250); } await record(`${tag} 빈 곳 5회`);
    for (let i = 0; i < 5; i++) { await tapAt('.pr-next'); await page.waitForTimeout(250); } await record(`${tag} 다음 5회`);
    await page.waitForTimeout(10000); await tapEmpty(); await record(`${tag} 10초 뒤 터치`);
  };
  await page.goto(URL + '?test=family-ending');
  await page.waitForFunction(() => window.__gona?.scene.getScene('Game')?.ending?.t > 1, null, { timeout: 40000 });
  await round('1차');
  await G(() => { const e = window.__gona.scene.getScene('Game').ending; e.jumpTo(8); e.t = e.finaleAt + 29; });
  await page.waitForSelector('.ending-ui.with-btns', { timeout: 20000 });
  await page.waitForTimeout(800);
  await G(() => window.__bus.emit('endingReplay')); // 테스트용 다시보기 (화면 버튼은 2개)
  await page.waitForTimeout(1500);
  await round('다시보기');
  // 엔딩 곡은 Web Audio 버퍼로 나옴 → 엔딩 중 터치로 배경음악 <audio> 의 play() 가 불리면 안 됨 (음소거 준비 재생 포함)
  const bad = steps.filter((x) => x.plays > 0);
  check(`${label}: touches during the ending start no BGM <audio> play() (incl. muted 'priming')`, bad.length === 0, JSON.stringify(steps));
  check(`${label}: touches and next ▶ (1x, 5x) during the ending never restart or seek the ending track, at most one BGM element playing`, steps.every((x) => x.bufs === 0) && steps.every((x) => x.playingEls === 0 && x.active <= 1), JSON.stringify(steps.map((x) => [x.name, x.bufs, x.playingEls, x.active])));
  check(`${label}: no page errors (touch audio)`, errs.length === 0, errs.join(' | '));
  await b.close();
}

/** 오프닝·엔딩 배경음악 1개만 · 회상 카드 위치 고정 · 엔딩 '다음 ▶' 버튼 */
async function endingFixTests(label, device) {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ ...device, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  // 배경음악 세기: 소리 내는 bgm <audio> + 20초 넘는 Web Audio 버퍼 + 합성 음악 타이머 · 아이폰처럼 첫 play() 는 AbortError 로 거절(소리는 남)
  await page.addInitScript(() => {
    window.__bgm = { buf: new Set(), max: 0, at: '' };
    const st = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...a) {
      if (this.buffer && this.buffer.duration > 20) {
        const set = window.__bgm.buf; set.add(this);
        this.addEventListener('ended', () => set.delete(this));
        const sp = this.stop.bind(this); this.stop = (...x) => { set.delete(this); return sp(...x); };
      }
      return st.apply(this, a);
    };
    const els = (window.__els = []);
    const O = window.Audio;
    window.Audio = function (...a) { const e = new O(...a); els.push(e); return e; };
    window.Audio.prototype = O.prototype;
    const play = HTMLMediaElement.prototype.play;
    let aborted = false;
    HTMLMediaElement.prototype.play = function () {
      const p = play.call(this);
      if (!aborted && /bgm-/.test(this.src) && !this.muted) { aborted = true; return p.then(() => { throw new DOMException('interrupted', 'AbortError'); }); }
      return p;
    };
    setInterval(() => {
      const files = els.filter((e) => /bgm-/.test(e.src) && !e.paused && !e.muted).map((e) => e.src.split('/').pop());
      const synth = window.__sound && window.__sound.musicTimer != null ? 1 : 0;
      const n = files.length + window.__bgm.buf.size + synth;
      if (n > window.__bgm.max) { window.__bgm.max = n; window.__bgm.at = JSON.stringify({ files, buf: window.__bgm.buf.size, synth }); }
    }, 50);
  });
  const G = (f, a) => page.evaluate(f, a);
  const tap = async (sel) => { const r = await page.locator(sel).first().boundingBox(); await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); };
  // 오프닝 (첫 터치 → 이야기 → 건너뛰기 → 타이틀 → 게임 시작)
  await page.goto(URL + '?test');
  await page.waitForTimeout(1200);
  await page.touchscreen.tap(100, 400);
  await page.waitForTimeout(5000);
  await tap('.op-skip').catch(() => {});
  await page.waitForTimeout(3000);
  const op = await G(() => window.__bgm);
  check(`${label}: opening — at most one BGM at a time`, op.max <= 1, JSON.stringify(op));
  // 아이폰 경쟁 상황: 타이틀 곡 play() 가 대기 중에 게임 곡으로 바뀌면(사이에 pause) 늦게 AbortError 로 거절됨 → 예전엔 합성 음악이 켜져 두 곡이 겹침
  const race = await G(() => new Promise((res) => {
    const s = window.__sound;
    s.stopMusic();
    const el = window.__els.find((e) => /bgm-title/.test(e.src));
    const orig = el.play;
    el.play = function () { el.play = orig; return new Promise((_, rej) => setTimeout(() => rej(new DOMException('interrupted by pause', 'AbortError')), 150)); };
    s.startMusic('title');
    s.startMusic('game');
    setTimeout(() => {
      const files = window.__els.filter((e) => /bgm-/.test(e.src) && !e.paused && !e.muted).length;
      res({ files, synth: s.musicTimer != null ? 1 : 0 });
      s.stopMusic();
    }, 700);
  }));
  check(`${label}: iPhone AbortError race (title→game) — no second BGM (no synth fallback on top)`, race.files + race.synth <= 1, JSON.stringify(race));
  // 엔딩 + 다시보기 3회
  await page.goto(URL + '?test=family-ending');
  await page.waitForFunction(() => window.__gona?.scene.getScene('Game')?.ending, null, { timeout: 40000 });
  const tapAt = async (sel) => { const r = await G((q) => document.querySelector(q).getBoundingClientRect().toJSON(), sel); await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); };
  // 다음 ▶: 장면의 애니메이션·영상이 끝나기 전(타이핑 중 포함)엔 숨김 · 대사창 자리는 그대로
  const nb = () => G(() => { const n = document.querySelector('.pr-next'); const b = document.querySelector('.pr-box').getBoundingClientRect(); return { vis: getComputedStyle(n).visibility, i: document.querySelector('.pr-box').dataset.index, top: Math.round(b.top), h: Math.round(b.height), cur: window.__gona.scene.getScene('Game').ending.cur }; });
  await page.waitForFunction(() => (document.querySelector('.pr-shown')?.textContent?.length ?? 0) > 1, null, { timeout: 20000 });
  await page.waitForTimeout(700); // 대사창이 처음 들어오는 짧은 등장 애니메이션 뒤부터
  const n0 = await nb();
  await page.waitForTimeout(3000);
  const n1 = await nb();
  check(`${label}: ending next ▶ hidden while the scene animation / typing plays (dialog box does not move)`, n0.vis === 'hidden' && n1.vis === 'hidden' && n1.cur === 0 && n0.top === n1.top && n0.h === n1.h, JSON.stringify({ n0, n1 }));
  // 장면이 끝나면 나타남 → 누르면 바로 다음 장면 (연타해도 한 번만)
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.pr-next')).visibility === 'visible', null, { timeout: 20000 });
  const n2 = await nb();
  await tap('.pr-next'); await tapAt('.pr-next'); await tapAt('.pr-next');
  await page.waitForTimeout(300);
  const n3 = await nb();
  check(`${label}: next ▶ appears when the scene is done; a tap moves to the next scene immediately (mashing advances once)`, n2.vis === 'visible' && n2.cur === 0 && n3.cur === 1 && n3.i === '1' && n3.vis === 'hidden' && n2.top === n3.top, JSON.stringify({ n2, n3 }));
  // 아무것도 누르지 않으면 저절로 다음 장면 (장면 7 → 8: 킁카 영상 마지막 프레임 → 가족사진)
  await G(() => window.__gona.scene.getScene('Game').ending.jumpTo(6));
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').ending.cur === 7, null, { timeout: 15000 }).catch(() => {});
  const auto7 = await nb();
  check(`${label}: ending advances by itself (sniff last frame → family portrait) without pressing next`, auto7.cur === 7, JSON.stringify(auto7));
  // 마지막 가족사진 영상이 끝나면 저절로 피날레
  await page.waitForFunction(() => document.querySelector('.ending-ui')?.dataset.phase === 'finale', null, { timeout: 20000 }).catch(() => {});
  const ph = await G(() => document.querySelector('.ending-ui')?.dataset.phase);
  check(`${label}: after the last family-photo video the golden-frame finale starts by itself`, ph === 'finale', ph);
  for (let i = 0; i < 3; i++) {
    await G(() => { const e = window.__gona.scene.getScene('Game').ending; e.jumpTo(8); e.t = e.finaleAt + 29; });
    await page.waitForSelector('.ending-ui.with-btns', { timeout: 15000 });
    await page.waitForTimeout(800);
    await G(() => window.__bus.emit('endingReplay'));
    await page.waitForTimeout(3000);
  }
  const en = await G(() => ({ max: window.__bgm.max, at: window.__bgm.at, now: window.__bgm.buf.size, files: window.__els.filter((e) => /bgm-/.test(e.src) && !e.paused && !e.muted).length }));
  check(`${label}: ending + next ▶ + replay x3 — at most one BGM, exactly one playing now`, en.max <= 1 && en.now + en.files === 1, JSON.stringify(en));
  // 아이폰 상황 재현 — 오디오 관리자의 실제 '활성 배경음악 수'(소리 나는 <audio> + 엔딩 버퍼 + 합성)를 50ms 마다 기록
  const sample = (ms) => G((d) => new Promise((res) => { let mx = 0; const t0 = performance.now(); const id = setInterval(() => { mx = Math.max(mx, window.__sound.bgmDebug().active); if (performance.now() - t0 > d) { clearInterval(id); res(mx); } }, 50); }), ms);
  // ① play() 가 늦게 끝나는 사이 엔딩 곡으로 바뀜
  await G(() => { const s = window.__sound; const el = s.bgmEl; s.stopMusic(); const orig = el.play; el.play = function () { el.play = orig; const p = orig.call(el); p.catch(() => {}); return new Promise((r) => setTimeout(() => r(p), 900)); }; s.startMusic('title'); s.playEndingTrack(30); });
  const slow = await sample(1800);
  // ② 백그라운드 → 복귀
  await G(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(400);
  await G(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  const vis = await sample(1200);
  const visState = await G(() => window.__sound.bgmDebug());
  // ③ 합성 음악(파일 고장) → 실제 음원으로 복귀
  await G(() => { const s = window.__sound; s.stopMusic(); s.musicBroken.title = true; s.startMusic('title'); });
  await page.waitForTimeout(500);
  const synthOn = await G(() => window.__sound.bgmDebug().synth);
  await G(() => { const s = window.__sound; s.musicBroken.title = false; s.startMusic('game'); });
  const back = await sample(1200);
  const backState = await G(() => window.__sound.bgmDebug());
  // ④ 같은 곡 반복 요청 — 다시 시작하지 않음
  const same = await G(() => new Promise((res) => { const s = window.__sound; const g0 = s.bgmDebug().gen; for (let i = 0; i < 5; i++) s.startMusic('game'); setTimeout(() => res({ gen: s.bgmDebug().gen - g0, t: s.bgmEl.currentTime }), 300); }));
  check(`${label}: iPhone cases — late play(), background/return, synth→file, repeated requests: max one BGM`, slow <= 1 && vis <= 1 && visState.want.startsWith('ending') && synthOn && back <= 1 && !backState.synth && same.gen === 0, JSON.stringify({ slow, vis, visWant: visState.want, synthOn, back, backSynth: backState.synth, same }));
  await page.goto(URL + '?test=family-ending');
  await page.waitForFunction(() => window.__gona?.scene.getScene('Game')?.ending, null, { timeout: 40000 });
  // 액자: 장면 1~8 모두 같은 자리·크기 · 그림 전체가 보임(contain, 잘림 없음) · 화면 안 · 대사창·위 버튼과 안 겹침
  const frames = [];
  for (let i = 0; i < 8; i++) {
    await G((k) => { const e = window.__gona.scene.getScene('Game').ending; if (e.cur !== k) e.jumpTo(k); }, i);
    await page.waitForFunction((k) => document.querySelector('.end-frame')?.dataset.scene === String(k + 1), i, { timeout: 15000 });
    await page.waitForTimeout(700);
    await page.waitForTimeout(i >= 3 ? 900 : 0);
    if (i === 3) await page.waitForTimeout(3000); // 장면 4: 달리기 그림(3.6초) → 달려가 안기는 영상
    frames.push(await G(() => {
      const f = document.querySelector('.end-frame').getBoundingClientRect();
      const gc = document.querySelector('.ef-grow.on');
      if (gc) {
        const gr = gc.getBoundingClientRect();
        const box = document.querySelector('.pr-box:not(.hidden)')?.getBoundingClientRect();
        // 성장 회상 캔버스: 액자 안쪽을 채우고, 실제로 그려졌는지(가운데 픽셀이 비어 있지 않음)
        const px = gc.getContext('2d').getImageData(Math.floor(gc.width / 2), Math.floor(gc.height * 0.7), 1, 1).data;
        return { r: [f.left, f.top, f.width, f.height].map(Math.round).join(','), img: 'growth:' + window.__growState?.(), full: gr.width > 0 && Math.abs(gr.width / gr.height - 1.6) < 0.05 && px[3] === 255, inView: f.left >= 0 && f.top >= 0 && f.right <= innerWidth && f.bottom <= innerHeight, boxClear: !box || box.top >= f.bottom || box.bottom <= f.top };
      }
      const v = document.querySelector('.ef-vid.on');
      const im = v || document.querySelector('.ef-img.on');
      const ir = im.getBoundingClientRect();
      const nw = v ? v.videoWidth : im.naturalWidth;
      const nh = v ? v.videoHeight : im.naturalHeight;
      const s = Math.min(ir.width / nw, ir.height / nh);
      const box = document.querySelector('.pr-box:not(.hidden)')?.getBoundingClientRect();
      return { r: [f.left, f.top, f.width, f.height].map(Math.round).join(','), img: v ? v.dataset.name : im.src.split('/').pop(), full: nw > 0 && nw * s <= ir.width + 0.5 && nh * s <= ir.height + 0.5 && getComputedStyle(im).objectFit === 'contain', inView: f.left >= 0 && f.top >= 0 && f.right <= innerWidth && f.bottom <= innerHeight, boxClear: !box || box.top >= f.bottom || box.bottom <= f.top };
    }));
    if (i === 0 || i === 4 || i === 7) await page.screenshot({ path: `${S}/${label}-frame-s${i + 1}.png` });
  }
  check(`${label}: ending frame — scenes 1-8 (growth canvas, images, 4 videos, held last frames) same position & size, whole picture visible, on screen, clear of the dialog`, new Set(frames.map((f) => f.r)).size === 1 && frames.every((f) => f.full && f.inView && f.boxClear) && frames.map((f) => f.img).join(',') === 'growth:egg,growth:crawler,s1.png,ending_01_running_hug,ending_01_running_hug,ending_02_grandma_kiss,ending_03_uncle_sniff,ending_04_family_portrait', JSON.stringify(frames));
  await page.goto(URL + '?test=family-ending&debugAudio=1');
  await page.waitForSelector('.audio-debug', { timeout: 30000 });
  await page.waitForTimeout(1500);
  const panel = await G(() => document.querySelector('.audio-debug')?.textContent ?? '');
  check(`${label}: ?debugAudio=1 shows the audio panel (scene, wanted BGM, active count, HTML, WebAudio, synth, log, version)`, /장면/.test(panel) && /원하는 BGM/.test(panel) && /활성 BGM/.test(panel) && /WebAudio/.test(panel) && /버전/.test(panel), panel.slice(0, 120));
  await page.goto(URL + '?test=family-ending');
  await page.waitForTimeout(1500);
  check(`${label}: audio panel hidden without debugAudio`, (await page.locator('.audio-debug').count()) === 0);
  check(`${label}: no page errors (ending fixes)`, errs.length === 0, errs.join(' | '));
  await b.close();
}

(async () => {
  // ONLY=ctrl,boss 처럼 앞부분이 맞는 묶음만 실행
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const want = (n) => !only || only.some((o) => n.startsWith(o));
  if (want('touch-port')) await touchAudioTests('touch-port', devices['iPhone 13']);
  if (want('endfix-port')) await endingFixTests('endfix-port', devices['iPhone 13']);
  if (want('endfix-land')) await endingFixTests('endfix-land', devices['iPhone 13 landscape']);
  if (want('qte-port')) await qteTests('qte-port', devices['iPhone 13']);
  if (want('qte-land')) await qteTests('qte-land', devices['iPhone 13 landscape']);
  if (want('feat-se')) await featureTests('feat-se', devices['iPhone SE']);
  if (want('feat-land')) await featureTests('feat-land', devices['iPhone 13 landscape']);
  if (want('ctrl-port')) await controlTests('ctrl-port', devices['iPhone 13']);
  if (want('ctrl-land')) await controlTests('ctrl-land', devices['iPhone 13 landscape']);
  if (want('boss-port')) await bossTests('boss-port', devices['iPhone 13']);
  if (want('boss-land')) await bossTests('boss-land', devices['iPhone 13 landscape']);
  if (want('intro-land')) await introTests('intro-land', devices['iPhone 13 landscape']);
  if (want('intro-port')) await introTests('intro-port', devices['iPhone 13']);
  if (want('land')) await run('land', devices['iPhone 13 landscape']);
  if (want('land-walker')) await run('land-walker', devices['iPhone 13 landscape'], { stage: 2 });
  if (want('port-walker')) await run('port-walker', devices['iPhone 13'], { stage: 2 });
  if (want('port')) await run('port', devices['iPhone 13']);
  if (want('noimg')) await run('noimg', devices['iPhone 13 landscape'], { noImages: true });
  if (want('grow-land')) await growthTests('grow-land', devices['iPhone 13 landscape']);
  if (want('grow-port')) await growthTests('grow-port', devices['iPhone 13']);
  console.log(results.join('\n'));
  process.exitCode = results.some((r) => r.startsWith('FAIL')) ? 1 : 0;
})();
