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
const check = (name, ok, info = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`); };
async function run(label, device, { noImages = false } = {}) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...device, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to process file|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  if (noImages) await page.route(/assets\/(character|snacks)\/.*\.png$/, r => r.abort());
  await page.goto(URL + '?test'); await page.waitForTimeout(1500);
  await page.screenshot({ path: `${S}/t5-${label}-title.png` });
  const ev = (fn, arg) => page.evaluate(([f, a]) => { const sc = window.__gona.scene.getScene('Game'); return eval(f)(sc, a); }, [fn.toString(), arg]);
  const box = await page.locator('.start-btn').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(1300);
  const info = await ev((sc) => ({ custom: sc.char.custom, happy: sc.char.happyFrame, sur: sc.char.surprisedFrame, state: sc.state }));
  check(`${label}: game started`, info.state === 'playing', JSON.stringify(info));
  await ev((sc) => { sc.distToNext = 1e9; sc.entities.forEach(e => { e.sprite.destroy(); }); sc.entities = []; });
  const frame = () => ev((sc) => ({ f: sc.player.frame.name, y: sc.player.y, alt: sc.alt, score: sc.score, hearts: sc.hearts, inv: sc.invincibleUntil - sc.time.now, grounded: sc.grounded }));

  // 간식 획득 + 점수
  for (const [kind, pts] of [['strawberry', 10], ['banana', 20], ['cookie', 30]]) {
    const before = await frame();
    await ev((sc, k) => sc.addSnack(k, 52 + 22, 4), kind);
    let s; for (let i = 0; i < 40; i++) { s = await frame(); if (s.score !== before.score) break; await page.waitForTimeout(15); }
    check(`${label}: ${kind} +${pts}`, s.score - before.score === pts, `score ${before.score}->${s.score}`);
    await page.waitForTimeout(150);
    const mid = await frame();
    if (!info.custom) check(`${label}: no expression w/o image`, ['0', '1', 0, 1].includes(mid.f), `frame ${mid.f}`);
    else {
      check(`${label}: happy face during pickup`, mid.f === 7 || mid.f === '7', `frame ${mid.f}`);
      check(`${label}: position unchanged during expression`, Math.abs(mid.y - before.y) <= 1, `y ${before.y}->${mid.y}`);
      if (kind === 'strawberry') await page.screenshot({ path: `${S}/t5-${label}-happy.png` });
    }
    await page.waitForTimeout(400);
    const after = await frame();
    check(`${label}: back to run after happy`, [1, 2, 3, 4, '1', '2', '3', '4', 0, '0'].includes(after.f), `frame ${after.f}`);
  }

  // 기쁨 표정 중 점프 / 더블 점프
  await ev((sc) => sc.addSnack('banana', 52 + 22, 4));
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
  if (info.custom) check(`${label}: back to jump pose in air`, !j3.grounded ? (j3.f === 5 || j3.f === '5') : true, `frame ${j3.f} grounded ${j3.grounded}`);
  for (let i = 0; i < 60; i++) { if ((await frame()).grounded) break; await page.waitForTimeout(30); }
  await page.waitForTimeout(200);

  // 바위 충돌 + 무적 시간
  const h0 = (await frame()).hearts;
  await ev((sc) => sc.addRock(52 + 22));
  let r; for (let i = 0; i < 40; i++) { r = await frame(); if (r.hearts !== h0) break; await page.waitForTimeout(15); }
  check(`${label}: rock hit -1 heart`, r.hearts === h0 - 1, `hearts ${h0}->${r.hearts}`);
  check(`${label}: invincible after hit`, r.inv > 1100, `inv ${Math.round(r.inv)}ms`);
  await page.waitForTimeout(120);
  const sface = await frame();
  if (info.custom) { check(`${label}: surprised face on hit`, sface.f === 8 || sface.f === '8', `frame ${sface.f}`); await page.screenshot({ path: `${S}/t5-${label}-surprised.png` }); }
  // 무적 중 다시 충돌 → 하트 유지
  for (let i = 0; i < 60; i++) { if ((await frame()).grounded) break; await page.waitForTimeout(20); }
  await ev((sc) => sc.addRock(52 + 18));
  await page.waitForTimeout(450);
  const r2 = await frame();
  check(`${label}: no damage while invincible`, r2.hearts === h0 - 1, `hearts ${r2.hearts} inv ${Math.round(r2.inv)}`);
  await page.waitForTimeout(300);
  const r3 = await frame();
  check(`${label}: back to run after surprised`, [1, 2, 3, 4, '1', '2', '3', '4', 0, '0'].includes(r3.f) || !r3.grounded, `frame ${r3.f}`);

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
    await ev((sc) => sc.addRock(52 + 22));
    await page.waitForTimeout(450);
    const ha = await ev((sc) => sc.hearts);
    check(`${label}: hit after invincibility ends`, ha === hb - 1, `hearts ${hb}->${ha}`);
  }
  await page.waitForTimeout(1600);
  const over = await page.evaluate(() => !document.querySelector('.over-screen').classList.contains('hidden'));
  const scoreTxt = await page.locator('.score-big').textContent();
  check(`${label}: game over screen`, over, scoreTxt);
  await page.screenshot({ path: `${S}/t5-${label}-over.png` });
  await page.locator('.pixel-btn').click(); await page.waitForTimeout(800);
  const rs = await ev((sc) => ({ state: sc.state, hearts: sc.hearts, score: sc.score }));
  check(`${label}: retry`, rs.state === 'playing' && rs.hearts === 3 && rs.score === 0, JSON.stringify(rs));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${S}/t5-${label}-play.png` });
  check(`${label}: no page errors`, errs.length === 0, errs.join(' | '));
  await b.close();
}
(async () => {
  await run('land', devices['iPhone 13 landscape']);
  await run('port', devices['iPhone 13']);
  await run('noimg', devices['iPhone 13 landscape'], { noImages: true });
  console.log(results.join('\n'));
  process.exitCode = results.some((r) => r.startsWith('FAIL')) ? 1 : 0;
})();
