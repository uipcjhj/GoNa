// 방글할매 스페셜 자동 테스트 (글자 쿠키 · HUD · 소환 버튼 · 등장~퇴장 · 음파 몬스터 처치 · 5초 무적 · 일시정지 · 보스 3종 피해 · 마녀 필수 이벤트 보호)
// 사용: node tools/bangeul-test.cjs [URL] [캡처 폴더] [portrait,landscape]
const { chromium, devices } = require('playwright');
const URL = process.argv[2] || 'http://localhost:4174/';
const OUT = process.argv[3];
const ORIENTS = (process.argv[4] || 'portrait,landscape').split(',');
const out = [];
const check = (n, ok, info = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${n} ${info}`);
(async () => {
  const b = await chromium.launch();
  for (const orient of ORIENTS) {
    const ctx = await b.newContext({ ...(orient === 'portrait' ? devices['iPhone 13'] : devices['iPhone 13 landscape']), deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    const G = (f, a) => page.evaluate(f, a);
    const st = () => G(() => window.__gona.scene.getScene('Game').debugBangeul());
const until = (fn, t = 20000) => page.waitForFunction(fn, null, { timeout: t }).catch(() => {});
    const LOG = (pat) => until(new Function(`return window.__gona?.scene.getScene('Game')?.debugBangeul?.().log.some((l) => ${pat})`));
    const shot = (n) => OUT && page.screenshot({ path: `${OUT}/${orient}-${n}.png` });
    // 1) 글자 쿠키 등장·획득 (빠르게)
    await page.goto(URL + '?test=bangeul-spawn');
    await page.waitForFunction(() => window.__gona?.scene.getScene('Game')?.state === 'playing', null, { timeout: 40000 });
    await page.waitForFunction(() => window.__gona.scene.getScene('Game').entities.some((e) => e.letter && !e.done), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(700);
    await shot('1-cookie');
    // 고나가 먹을 때까지 (땅·점프 높이 — 점프 자동)
    const t0 = Date.now();
    while (Date.now() - t0 < 25000) {
      await G(() => {
        const g = window.__gona.scene.getScene('Game');
        const e = g.entities.find((x) => x.letter && !x.done && x.alt > 10 && x.x - g.playerX < 40 && x.x - g.playerX > 10);
        if (e && g.grounded) g.pressJump();
      });
      if ((await st()).letters.length >= 2) break;
      await page.waitForTimeout(100);
    }
    const s1 = await st();
    const hud1 = await G(() => [...document.querySelectorAll('.gona-slot')].map((s) => s.classList.contains('on')));
    check(`${orient}: letter cookies spawn and are collected → HUD lights those letters`, s1.letters.length >= 2 && hud1.filter(Boolean).length === s1.letters.length, JSON.stringify({ s1, hud1 }));
    const spawns = s1.log.filter((l) => l.startsWith('spawn:'));
    await shot('2-hud');
    // 2) 완성 → 버튼 (누르기 전엔 소환 안 됨)
    await page.goto(URL + '?test=bangeul-ready');
    await page.waitForFunction(() => window.__gona?.scene.getScene('Game')?.state === 'playing', null, { timeout: 40000 });
    await page.waitForTimeout(1500);
    const r0 = await st();
    const btn = await G(() => { const e = document.querySelector('.summon-btn'); const r = e.getBoundingClientRect(); return { vis: !e.classList.contains('hidden') && r.width > 0, r: [r.left, r.top, r.right, r.bottom].map(Math.round) }; });
    // 다른 버튼과 겹침
    const over = await G(() => {
      const a = document.querySelector('.summon-btn').getBoundingClientRect();
      return [...document.querySelectorAll('.bt-attack, .bt-shield, .bt-special:not(.bt-special2), .battle-top, .hud-score')].filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e.closest('.bt-group') ?? e).visibility !== 'hidden').map((e) => [e.className.split(' ').slice(0, 2).join('.'), e.getBoundingClientRect()]).filter(([, r]) => a.left < r.right && r.left < a.right && a.top < r.bottom && r.top < a.bottom).map(([n]) => n);
    });
    await shot('3-ready');
    check(`${orient}: GONA complete → summon button shown (no overlap) · not summoned until pressed`, r0.ready && !r0.active && btn.vis && over.length === 0, JSON.stringify({ r0, btn, over }));
    // 실제 터치로 버튼
    const bb = await page.locator('.summon-btn').boundingBox();
    await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await until(() => window.__gona.scene.getScene('Game').debugBangeul().active, 40000);
    const r1 = await st();
    await shot('4-appear');
    await until(() => { const g = window.__gona.scene.getScene('Game'); return g.bangeul.run?.step === 'laugh'; });
    await shot('5-laugh');
    await LOG("l.startsWith('wave:1')");
    await shot('6-song');
    // 중복 입력: 연출 중 다시 눌러도 무시
    await G(() => window.__bus.emit('summonBangeul'));
    await LOG("l === 'exit'");
    await shot('7-after');
    const r2 = await st();
    check(`${orient}: tap → 방글할매 appears, letters reset, 5s invincible, no double summon, exits`, r1.active && r1.letters === '' && r1.inv > 4 && r2.log.filter((l) => l.startsWith('summon')).length === 1 && r2.log.includes('exit'), JSON.stringify({ r1, r2 }));
    await LOG("l === 'inv-end'");
    const r3 = await st();
    check(`${orient}: invincibility ends after ~5s`, r3.inv === 0 && r3.log.includes('inv-end'), JSON.stringify(r3));
    // 3) 몬스터 광역
    await page.goto(URL + '?test=bangeul-wave');
    await page.waitForFunction(() => window.__gona?.scene.getScene('Game')?.state === 'playing', null, { timeout: 40000 });
    await until(() => window.__gona.scene.getScene('Game').entities.filter((e) => e.type === 'monster' && !e.done).length >= 3);
    const m0 = await G(() => window.__gona.scene.getScene('Game').entities.filter((e) => e.type === 'monster' && !e.done).length);
    await LOG("l.startsWith('wave:1')");
    await shot('8-wave');
    await LOG("l.startsWith('wave:3')");
    await page.waitForTimeout(400);
    const m1 = await G(() => window.__gona.scene.getScene('Game').entities.filter((e) => e.type === 'monster' && !e.done).length);
    const w = await st();
    check(`${orient}: song waves defeat the monsters on screen`, m0 >= 3 && m1 === 0 && w.log.some((l) => /wave:\d:mon[1-9]/.test(l)), JSON.stringify({ m0, m1, log: w.log }));
    // 4) 무적: 바위에 부딪혀도 피해 없음 (무적 모드 아님)
    await page.goto(URL + '?test=bangeul-inv');
    await page.waitForFunction(() => window.__gona?.scene.getScene('Game')?.state === 'playing', null, { timeout: 40000 });
    await LOG("l.startsWith('summon')");
    const h0 = await G(() => { const g = window.__gona.scene.getScene('Game'); return g.hearts * 100 + g.hp; });
    await LOG("l === 'inv-end'");
    const h1 = await G(() => { const g = window.__gona.scene.getScene('Game'); return { hp: g.hearts * 100 + g.hp, log: g.damageLog.slice(-3) }; });
    check(`${orient}: no damage from rocks during the 5s invincibility`, h1.hp === h0, JSON.stringify({ h0, h1 }));
    // 5) 일시정지: 무적 시간 멈춤
    await page.goto(URL + '?test=bangeul-summon');
    await page.waitForFunction(() => window.__gona?.scene.getScene('Game')?.debugBangeul().active, null, { timeout: 40000 });
    await page.waitForTimeout(300);
    const p0 = await G(() => { const g = window.__gona.scene.getScene('Game'); g.pauseGame(); return g.debugBangeul().inv; });
    await page.waitForTimeout(1500);
    const p1 = await G(() => window.__gona.scene.getScene('Game').debugBangeul().inv);
    await G(() => window.__gona.scene.getScene('Game').resumeGame());
    check(`${orient}: pause freezes the summon and invincibility timer`, p0 === p1 && p0 > 0, JSON.stringify({ p0, p1 }));
    // 6) 보스 피해 (뽀뽀 · 킁카 · 마녀) + 마녀 필수 이벤트 보호
    for (const id of ['bangeul-kiss', 'bangeul-sniff', 'bangeul-witch', 'bangeul-guard']) {
      await page.goto(URL + `?test=${id}`);
      await until(() => window.__gona?.scene.getScene('Game')?.debugBangeul?.().log.some((l) => l.startsWith('summon')), 60000);
      const hpA = await G(() => window.__gona.scene.getScene('Game').battle?.hp);
      if (id === 'bangeul-witch') {
        await LOG("l.startsWith('wave:2')");
        await shot('9-witch');
      }
      await LOG("l.startsWith('wave:3')");
      await page.waitForTimeout(300);
      const res = await G(() => { const g = window.__gona.scene.getScene('Game'); const b = g.battle; return { hp: b?.hp, max: b?.def.maxHp, rage: b?.rage, log: g.debugBangeul().log.filter((l) => l.startsWith('wave')) }; });
      if (id === 'bangeul-guard') check(`${orient}: witch HP stops at the phase threshold (required events protected)`, res.hp === Math.floor(res.max * 0.7 + 1e-6) + 1 && res.rage === 0, JSON.stringify({ hpA, res }));
      else check(`${orient}: ${id.slice(8)} boss takes song damage`, hpA !== undefined && res.hp < hpA && res.log.filter((l) => l.endsWith(':boss')).length === 3, JSON.stringify({ hpA, res }));
    }
    check(`${orient}: no page errors`, errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  console.log(out.join('\n'));
  await b.close();
})();
