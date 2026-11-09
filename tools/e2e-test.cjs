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
    music: window.__sound.status().musicMode, vol: window.__sound.music.title.volume }));
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
    vol: window.__sound.music.title.volume }));
  check(`${label}: skip button → title immediately`, sk.cover.includes('revealed') && !sk.op && sk.btn === '1', JSON.stringify(sk));
  await page.waitForTimeout(1200);
  const vol = await page.evaluate(() => window.__sound.music.title.volume);
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
  check(`${label}: 3 buttons shown from battle start, attack locked before awakening`, !c0.canThrow && (await page.locator('.bt-shield').isVisible()) && (await page.locator('.bt-attack').isVisible()) && (await page.locator('.bt-special').isVisible()) && (await page.locator('.bt-attack').getAttribute('class')).includes('locked'));
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
  check(`${label}: special button ready when gauge full`, (await page.locator('.bt-special').getAttribute('class')).includes('ready'));
  const hp1 = (await battle()).hp;
  await tapEl('.bt-special');
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
  check(`${label}: boss UI hidden after battle (boss bar · shield · special gone, attack stays)`, !(await page.locator('.boss-bar').isVisible()) && !(await page.locator('.bt-shield').isVisible()) && !(await page.locator('.bt-special').isVisible()) && (await page.locator('.bt-attack').isVisible()));
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
  const en = await G(() => { const sc = window.__gona.scene.getScene('EndingCine'); const ids = ['imo', 'samchon', 'mom', 'dad', 'halmeoni', 'halabeoji']; return { e: window.__gona.scene.getScene('Game').debugEnding(), fam: sc.children.list.filter((o) => /^fam-/.test(o.texture?.key || '')).map((o) => o.texture.key).sort().join(','), famOk: ids.every((id) => sc.textures.exists('fam-' + id)), gameHidden: !window.__gona.scene.getScene('Game').sys.settings.visible, bg: sc.children.list.some((o) => /^end-bgB-/.test(o.texture?.key || '')), gona: sc.children.list.some((o) => /^dino-stage-newborn$/.test(o.texture?.key || '')) }; });
  check(`${label}: final boss win → ending (own bg, 6 original family cutouts loaded, baby GONA sprite, game hidden)`, en.e?.state === 'ending' && en.famOk && en.fam === 'fam-dad,fam-halabeoji,fam-halmeoni,fam-imo,fam-mom,fam-samchon' && en.bg && en.gameHidden && en.gona, JSON.stringify(en));
  await page.waitForTimeout(2500);
  const music = await G(() => ({ mode: window.__sound.endingMode, want: window.__sound.wantMusic }));
  check(`${label}: ending music started (one track, buffer or file fallback)`, music.mode === 'buffer' || (music.mode === 'file' && music.want === 'ending'), JSON.stringify(music));
  const sub1 = await G(() => document.querySelector('.pr-shown')?.textContent ?? '');
  check(`${label}: ending narration line 1 types by itself`, '처음 세상에 왔을 땐, 모든 것이 낯설고 커다랬던 고나.'.startsWith(sub1) && sub1.length > 3, sub1);
  // SCENE 06 뽀뽀와 킁카 (할머니 볼뽀뽀)
  await G(() => { window.__gona.scene.getScene('Game').ending.t = 48.6; });
  await page.waitForTimeout(1500);
  const s6 = await G(() => { const e = window.__gona.scene.getScene('Game').ending; const h = e.family.find((f) => f.id === 'halmeoni'); return { scene: e.sceneNo, visible: e.family.filter((f) => f.s.visible && f.s.alpha > 0.5).length, halmeoniNearGona: Math.abs(h.x - e.gx) < 40, line: document.querySelector('.pr-shown')?.textContent?.slice(0, 10) }; });
  check(`${label}: ending scene 6 (grandma kiss) — 6 family on screen, grandma beside GONA`, s6.scene === 6 && s6.visible === 6 && s6.halmeoniNearGona, JSON.stringify(s6));
  // 타이틀 → 크레딧 → 마지막 문구 → 검은 화면 + 버튼
  await G(() => { window.__gona.scene.getScene('Game').ending.t = 79.5; });
  await page.waitForTimeout(800);
  const title = await G(() => ({ phase: document.querySelector('.ending-ui')?.dataset.phase, txt: document.querySelector('.end-title-card')?.textContent }));
  check(`${label}: ending title card (no big THE END)`, title.phase === 'title' && title.txt.includes('GONA’s Food Adventure') && title.txt.includes('고나의 첫 번째 모험') && title.txt.includes('2026.04.10') && !title.txt.includes('THE END'), JSON.stringify(title));
  await G(() => { window.__gona.scene.getScene('Game').ending.t = 108; });
  await page.waitForTimeout(600);
  const fin = await G(() => ({ phase: document.querySelector('.ending-ui')?.dataset.phase, txt: document.querySelector('.end-final')?.textContent }));
  check(`${label}: ending final message after credits`, fin.phase === 'final' && fin.txt === '현이의 모든 모험을 응원하며…', JSON.stringify(fin));
  await G(() => { window.__gona.scene.getScene('Game').ending.t = 119.9; });
  await page.waitForSelector('.ending-ui.with-btns', { timeout: 5000 }).catch(() => {});
  const endTxt = await page.locator('.ending-ui').textContent().catch(() => '');
  check(`${label}: black screen + 3 small buttons`, (await G(() => document.querySelector('.ending-ui')?.dataset.phase)) === 'black' && endTxt.includes('2026.04.10') && (await page.locator('.ending-ui .end-btn').count()) === 3, endTxt.slice(0, 80));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${S}/boss-${label}-ending.png` });
  await page.waitForTimeout(700);
  await page.locator('.end-restart').click(); await page.waitForTimeout(800);
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
  check(`${label}: buttons: shield (left), big attack + special (right), no dodge button`, (await page.locator('.bt-shield').isVisible()) && (await page.locator('.bt-attack').isVisible()) && (await page.locator('.bt-special').isVisible()) && (await page.locator('.bt-dodge').count()) === 0);

  // 버튼 위치·크기: 고나·보스를 가리지 않음, 터치 영역 64px 이상, 공격 버튼은 크게
  const geo = await G(() => {
    const g = window.__gona.scene.getScene('Game'); const cv = g.game.canvas.getBoundingClientRect();
    const k = cv.width / g.W; const p = g.player.getBounds(); const br = g.battle.bossRect();
    const S = (x, y) => [cv.left + x * k, cv.top + y * k];
    return { player: [...S(p.x, p.y), ...S(p.right, p.bottom)], boss: [...S(br.x0, br.y0), ...S(br.x1, br.y1)] };
  });
  const rects = [];
  for (const sel of ['.bt-shield .bt-face', '.bt-attack .bt-face', '.bt-special .bt-face']) rects.push(await page.locator(sel).boundingBox());
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
  const spSt = await G(() => ({ cls: document.querySelector('.bt-special').className, g: window.__gona.scene.getScene('Game').battle.special }));
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
  // 3) 움직이는 과녁: 여러 부위를 옮겨 다니고, 코에서 누르면 ×2 · 다른 부위면 보통
  await page.goto(URL + '?test=sniff-aim');
  await page.waitForFunction(() => window.__gona?.scene.getScene('Game').battle?.aimActive, null, { timeout: 30000 });
  const label0 = await G(() => document.querySelector('.bt-attack .bt-label')?.textContent);
  const seen = new Set(); let hitOther = false;
  for (let i = 0; i < 160 && !hitOther; i++) {
    const s = await G(() => { const bt = window.__gona.scene.getScene('Game').battle; const a = bt.aim; return a ? { cur: a.cur, phase: a.phase, locked: a.locked } : null; });
    if (s && s.phase === 'dwell') seen.add(s.cur);
    if (s && !s.locked && s.phase === 'dwell' && s.cur !== 'nose' && seen.size >= 3) { hitOther = true; await page.keyboard.press('KeyX'); }
    await page.waitForTimeout(90);
  }
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').battle.aimLog.length > 0, null, { timeout: 5000 }).catch(() => {});
  const ol = await G(() => window.__gona.scene.getScene('Game').battle.aimLog);
  await page.goto(URL + '?test=sniff-weakpoint');
  await page.waitForFunction(() => (window.__gona?.scene.getScene('Game').battle?.aimLog ?? []).some((a) => a.spot === 'nose'), null, { timeout: 30000 }).catch(() => {});
  const wl = await G(() => { const bt = window.__gona.scene.getScene('Game').battle; return { log: bt.aimLog, weak: bt.weakHits }; });
  check(`${label}: moving target hops between body spots, attack button reads 조준!`, seen.size >= 3 && label0 === '조준!', JSON.stringify({ seen: [...seen], label0 }));
  check(`${label}: target on another spot → normal damage (×1)`, ol.length > 0 && ol[0].spot !== 'nose' && ol[0].mul === 1, JSON.stringify(ol));
  check(`${label}: target on nose → boomerang weak-point hit ×2`, wl.log.some((a) => a.spot === 'nose' && a.mul === 2) && wl.weak >= 1, JSON.stringify(wl));
  // 4) 흡입 버티기: 진짜 버튼 연타로 성공 / 꾹 누르기는 1번만 / 안 누르면 실패(피해)
  await page.goto(URL + '?test=sniff-inhale');
  await page.waitForFunction(() => window.__gona?.scene.getScene('Game').battle?.resistActive, null, { timeout: 30000 });
  const ql = await G(() => ({ label: document.querySelector('.bt-shield .bt-label')?.textContent, box: !document.querySelector('.resist-box')?.classList.contains('hidden') }));
  const btn = page.locator('.bt-shield');
  const bb = await btn.boundingBox();
  // 꾹 누르기 (1.0초) → 1번만 셈
  const t0 = await G(() => window.__gona.scene.getScene('Game').battle.resist.taps);
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(1000); await page.mouse.up();
  const t1 = await G(() => window.__gona.scene.getScene('Game').battle.resist?.taps ?? -1);
  for (let i = 0; i < 40; i++) { if (!(await G(() => window.__gona.scene.getScene('Game').battle.resistActive))) break; await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.waitForTimeout(150); }
  await page.waitForTimeout(400);
  const rs = await G(() => { const g = window.__gona.scene.getScene('Game'); return { log: g.battle.resistLog, label: document.querySelector('.bt-shield .bt-label')?.textContent }; });
  check(`${label}: inhale → shield becomes 버티기! with gauge`, ql.label === '버티기!' && ql.box, JSON.stringify(ql));
  check(`${label}: holding the button counts once (no auto-repeat)`, t1 - t0 === 1, `${t0} → ${t1}`);
  check(`${label}: one-finger mashing wins the resist QTE, button restored`, rs.log[0] === 'success' && rs.label !== '버티기!', JSON.stringify(rs));
  await page.goto(URL + '?test=resist-fail');
  await page.waitForFunction(() => (window.__gona?.scene.getScene('Game').battle?.resistLog ?? []).length > 0, null, { timeout: 40000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const rf = await G(() => { const g = window.__gona.scene.getScene('Game'); return { log: g.battle.resistLog, hp: g.hp, hearts: g.hearts, pull: Math.round(g.pull) }; });
  check(`${label}: no mashing → sucked in, takes damage, pushed back`, rf.log[0] === 'fail' && (rf.hp < 100 || rf.hearts < 3) && rf.pull < 30, JSON.stringify(rf));
  check(`${label}: no page errors (qte)`, errs.length === 0, errs.join(' | '));
  await b.close();
}

/** 엔딩 그림: 가족 도트 그림(반 도트 · 균일 배율) · 고나 비율 · 단체 장면에서 여섯 명 모두 화면 안 · 얼굴끼리 겹치지 않음 */
async function endingArtTests(label, device) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...device, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  const G = (f, a) => page.evaluate(f, a);
  await page.goto(URL + '?test=family-ending');
  await page.waitForFunction(() => window.__gona?.scene.getScene('Game')?.ending, null, { timeout: 40000 });
  const SC = [0, 9.47, 22.1, 31.58, 37.9, 47.37, 60.0, 66.3];
  const snap = () => G(() => {
    const e = window.__gona.scene.getScene('Game').ending; const v = e.cameras.main.worldView;
    const fam = e.family.map((f) => { const bb = f.s.getBounds(); return { id: f.id, key: f.s.texture.key, tw: f.s.frame.width, sx: f.s.scaleX, sy: f.s.scaleY, x0: bb.x, x1: bb.right, y0: bb.y, y1: bb.bottom, vis: f.s.visible && f.s.alpha > 0.5 }; });
    const inView = (o) => o.x0 >= v.x - 0.5 && o.x1 <= v.right + 0.5 && o.y0 >= v.y - 0.5 && o.y1 <= v.bottom + 0.5;
    // 얼굴 = 그림 위쪽 머리 부분(머리카락 아래 ~ 턱), 양옆 20% 안쪽
    const face = (o) => ({ x0: o.x0 + (o.x1 - o.x0) * 0.2, x1: o.x1 - (o.x1 - o.x0) * 0.2, y0: o.y0 + 6, y1: o.y0 + 27 });
    let worst = 0; let pair = '';
    for (let i = 0; i < fam.length; i++) for (let j = i + 1; j < fam.length; j++) {
      const a = face(fam[i]), c = face(fam[j]);
      const ov = Math.max(0, Math.min(a.x1, c.x1) - Math.max(a.x0, c.x0)) * Math.max(0, Math.min(a.y1, c.y1) - Math.max(a.y0, c.y0));
      const r = ov / ((a.x1 - a.x0) * (a.y1 - a.y0));
      if (r > worst) { worst = r; pair = fam[i].id + '/' + fam[j].id; }
    }
    const g = e.gona;
    return { t: +e.t.toFixed(1), zoom: e.cameras.main.zoom, allIn: fam.every((o) => o.vis && inView(o)), out: fam.filter((o) => !inView(o)).map((o) => o.id), faceOverlap: +worst.toFixed(2), pair, fam, gsx: g.scaleX, gsy: g.scaleY, gonaIn: inView(g.getBounds() && { x0: g.getBounds().x, x1: g.getBounds().right, y0: g.getBounds().y, y1: g.getBounds().bottom }) };
  });
  const goto = async (sc, at) => {
    await G((t) => { const e = window.__gona.scene.getScene('Game').ending; if (e.t < t - 0.05) e.t = t - 0.05; }, SC[sc]);
    await page.waitForFunction((t) => window.__gona.scene.getScene('Game').ending.t >= t, at, { timeout: 30000 });
  };
  await goto(2, 30.0);
  const a = await snap();
  check(`${label}: ending family drawn as pixel sprites (half-dot, uniform 0.5 scale)`, a.fam.every((f) => f.key.startsWith('fam-') && f.tw < 100 && f.sx === 0.5 && f.sy === 0.5), JSON.stringify(a.fam.map((f) => [f.id, f.tw, f.sx, f.sy])));
  check(`${label}: ending scene 3 — all six family members fully on screen, faces apart`, a.allIn && a.faceOverlap < 0.12, JSON.stringify({ out: a.out, faceOverlap: a.faceOverlap, pair: a.pair, zoom: a.zoom }));
  await page.screenshot({ path: `${S}/${label}-s3.png` });
  await goto(3, 36.8);
  const c = await snap();
  check(`${label}: ending scene 4 (GONA runs) — family all visible, GONA in frame, GONA not stretched`, c.allIn && c.gonaIn && c.gsx === c.gsy, JSON.stringify({ out: c.out, gona: c.gonaIn, gs: [c.gsx, c.gsy] }));
  await goto(4, 45.5);
  const d = await snap();
  check(`${label}: ending scene 5 (family hug) — everyone in the closer group shot`, d.allIn && Number.isInteger(d.zoom), JSON.stringify({ out: d.out, zoom: d.zoom }));
  await page.screenshot({ path: `${S}/${label}-s5.png` });
  await goto(7, 77.5);
  const f = await snap();
  check(`${label}: ending scene 8 (last family photo) — all six on screen, faces apart`, f.allIn && f.gonaIn && f.faceOverlap < 0.12, JSON.stringify({ out: f.out, faceOverlap: f.faceOverlap, pair: f.pair }));
  await page.screenshot({ path: `${S}/${label}-s8.png` });
  check(`${label}: no page errors (ending art)`, errs.length === 0, errs.join(' | '));
  await b.close();
}

(async () => {
  // ONLY=ctrl,boss 처럼 앞부분이 맞는 묶음만 실행
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const want = (n) => !only || only.some((o) => n.startsWith(o));
  if (want('endart-port')) await endingArtTests('endart-port', devices['iPhone 13']);
  if (want('endart-land')) await endingArtTests('endart-land', devices['iPhone 13 landscape']);
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
