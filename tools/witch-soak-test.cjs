/**
 * 최종 보스 전체 전투 소크 테스트 (개발 빌드): 1페이즈부터 끝까지 봇이 예고를 보고 피하며 부메랑으로 공격 (무적 아님)
 *   10초마다 프레임·오브젝트 수·메모리 기록 → 처치 시간·받은 피해·공격 기록·메모리 증가 여부 출력
 * 사용: node tools/witch-soak-test.cjs [URL] [portrait|landscape] [최대초=420]
 */
const { chromium, devices } = require('playwright');
const URL = process.argv[2] || 'http://localhost:4173/';
const orient = process.argv[3] || 'portrait';
const MAX = Number(process.argv[4] || 420);
(async () => {
  const b = await chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const page = await (await b.newContext({ ...(orient === 'portrait' ? devices['iPhone 13'] : devices['iPhone 13 landscape']) })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(URL + '?test=witch-p1');
  await page.waitForFunction(() => window.__gona?.scene.getScene('Game')?.battle?.mode === 'fight', null, { timeout: 40000 });
  await page.evaluate(() => {
    document.querySelectorAll('.tm-info,.tm-back').forEach((n) => n.remove());
    const g = window.__gona.scene.getScene('Game');
    const done = new Set();
    const tick = () => {
      const bt = g.battle;
      if (bt && bt.mode === 'fight' && g.state === 'playing') {
        const now = bt.time;
        for (const t of bt.threatsAhead) {
          const k = `${t.kind}${t.at.toFixed(3)}`;
          if (done.has(k) || t.high) continue;
          if (t.at - now < 0.2 && t.at - now > -0.05 && g.grounded) { done.add(k); g.pressJump(); }
        }
        const tg = bt.telegraph;
        if (tg && tg.impactAt && !tg.high && g.grounded && ['spoon', 'combo', 'triple', 'pot'].includes(tg.kind) && tg.impactAt - now < 0.22 && tg.impactAt - now > 0) g.pressJump();
        for (const h of bt.hostiles) {
          if (h.dead || h.hitPlayer || h.vx > 0) continue;
          const key = h.sprite.texture.key;
          const dx = h.x - g.playerX;
          if (g.grounded && h.y > g.groundY - 16 && dx > 0 && dx < 32 && ((key === 'witch-puddle' && (h.onGround || h.vx < 0)) || (key === 'witch-goo' && !bt.bouncers?.some((x) => x.h === h)))) g.pressJump();
        }
        window.__bus.emit('attack');
        if (bt.specialReady) window.__bus.emit('special');
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
  const samples = [];
  const t0 = Date.now();
  let result = 'timeout';
  while ((Date.now() - t0) / 1000 < MAX) {
    const nx = page.locator('.boss-talk:not(.hidden) .btk-next');
    if (await nx.isVisible().catch(() => false)) await nx.click({ timeout: 800 }).catch(() => {});
    const s = await page.evaluate(() => {
      const g = window.__gona.scene.getScene('Game');
      const bt = g.battle;
      const pf = window.__perf?.stats?.() ?? {};
      return { mode: bt?.mode ?? 'none', rage: bt?.rage, hp: bt?.hp, last: bt?.lastPhase, gona: g.hearts * 100 + g.hp, state: g.state, objs: g.children.list.length, hostiles: bt?.hostiles.length ?? 0, tweens: g.tweens.getTweens().length, fps: pf.fps, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null, log: bt?.attackLog.length ?? 0 };
    });
    if (!samples.length || Date.now() - samples[samples.length - 1].at > 10000) samples.push({ at: Date.now(), sec: Math.round((Date.now() - t0) / 1000), ...s });
    if (s.state === 'dead' || s.state === 'ending' || s.mode === 'victory' || s.mode === 'none') { result = s.state === 'dead' ? 'LOSE' : 'WIN'; break; }
    await page.waitForTimeout(300);
  }
  const log = await page.evaluate(() => window.__gona.scene.getScene('Game').battle?.attackLog.join(',') ?? '');
  const hist = await page.evaluate(() => { const m = {}; for (const o of window.__gona.scene.getScene('Game').children.list) { const k = `${o.type}:${o.texture?.key ?? ''}`; m[k] = (m[k] ?? 0) + 1; } return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8); });
  console.log('objects', JSON.stringify(hist));
  const first = samples[1] ?? samples[0];
  const lastS = samples[samples.length - 1];
  console.log(samples.map((x) => `${x.sec}s P${(x.rage ?? 0) + 1} hp${x.hp} gona${x.gona} objs${x.objs} host${x.hostiles} tw${x.tweens} fps${x.fps} heap${x.heap}MB`).join('\n'));
  console.log('RESULT', JSON.stringify({ result, sec: Math.round((Date.now() - t0) / 1000), orient, attacks: log, objsGrowth: lastS.objs - first.objs, heapGrowthMB: lastS.heap - first.heap, errors: errs }));
  await b.close();
})();
