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
          if (t.qte === 'spit') { if (t.at - now < 0.04 && t.at - now > -0.1) { done.add(k); window.__bus.emit('qteInput', { btn: 'spit', down: true }); } continue; }
          if (t.shield) { if (t.at - now < (t.kind === 'reflect' ? 0.18 : 0.45) && t.at - now > 0) { done.add(k); window.__bus.emit('shield'); } continue; }
          if (t.at - now < 0.2 && t.at - now > -0.05 && g.grounded) { done.add(k); g.pressJump(); }
        }
        // 울음 리듬: 음표가 판정선에 오면 누르고, 꾸욱은 길게
        const rs = bt.rhythmS;
        if (rs) {
          for (const nt of rs.notes) {
            if (nt.state === 'wait' && now >= nt.t - 0.02 && now <= nt.t + 0.1) {
              window.__bus.emit('qteInput', { btn: 'cry', down: true });
              if (!nt.hold) window.__bus.emit('qteInput', { btn: 'cry', down: false });
            }
          }
        }
        const tg = bt.telegraph;
        if (tg && tg.impactAt && !tg.high && g.grounded && ['spoon', 'combo', 'triple', 'pot'].includes(tg.kind) && tg.impactAt - now < 0.22 && tg.impactAt - now > 0) g.pressJump();
        for (const h of bt.hostiles) {
          if (h.dead || h.hitPlayer || h.vx > 0) continue;
          const key = h.sprite.texture.key;
          const dx = h.x - g.playerX;
          if (g.grounded && h.y > g.groundY - 16 && dx > 0 && dx < 32 && ((key === 'witch-puddle' && (h.onGround || h.vx < 0)) || (key === 'witch-goo' && !bt.bouncers?.some((x) => x.h === h)))) g.pressJump();
        }
        if (!bt.qteBusy) {
          window.__bus.emit('attack');
          if (bt.specialReady) window.__bus.emit('special');
        }
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
  const samples = [];
  const t0 = Date.now();
  let result = 'timeout';
  let lastLog = -1;
  const phaseAt = [];
  let lastRage = -1;
  let lastAt = 0;
  let lastLogAt = Date.now();
  while ((Date.now() - t0) / 1000 < MAX) {
    const nx = page.locator('.boss-talk:not(.hidden) .btk-next');
    if (await nx.isVisible().catch(() => false)) await nx.click({ timeout: 800 }).catch(() => {});
    const s = await page.evaluate(() => {
      const g = window.__gona.scene.getScene('Game');
      const bt = g.battle;
      const pf = window.__perf?.stats?.() ?? {};
      return { mode: bt?.mode ?? 'none', rage: bt?.rage, hp: bt?.hp, last: bt?.lastPhase, gona: g.hearts * 100 + g.hp, state: g.state, objs: g.children.list.length, hostiles: bt?.hostiles.length ?? 0, tweens: g.tweens.getTweens().length, fps: pf.fps, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null, log: bt?.attackLog.length ?? 0 };
    });
    if (s.rage !== lastRage) { phaseAt.push(`P${(s.rage ?? 0) + 1}@${Math.round((Date.now() - t0) / 1000)}s`); lastRage = s.rage; }
    if (s.last === 'swing' && !lastAt) { lastAt = Math.round((Date.now() - t0) / 1000); phaseAt.push(`FINAL@${lastAt}s`); }
    if (!samples.length || Date.now() - samples[samples.length - 1].at > 10000) samples.push({ at: Date.now(), sec: Math.round((Date.now() - t0) / 1000), ...s });
    if (s.state === 'dead' || s.state === 'ending' || s.mode === 'victory' || s.mode === 'none') { result = s.state === 'dead' ? 'LOSE' : 'WIN'; break; }
    // 멈춤 감지: 25초 동안 새 공격이 없으면 (보스전이 멈춘 것) 상태를 남기고 끝냄
    if (s.log !== lastLog) { lastLog = s.log; lastLogAt = Date.now(); }
    else if (Date.now() - lastLogAt > 25000) {
      result = 'STALL';
      await page.screenshot({ path: require('path').join(require('os').tmpdir(), 'witch-stall.png') });
      console.log('COVER', JSON.stringify(await page.evaluate(() => { const nx = document.querySelector('.boss-talk .btk-next'); if (!nx) return 'no next'; const r = nx.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { r: [r.x, r.y, r.width, r.height].map(Math.round), top: e ? e.className || e.tagName : null, nxVis: getComputedStyle(nx).visibility, nxDisp: getComputedStyle(nx).display, talkCls: document.querySelector('.boss-talk').className }; })));
      console.log('STALL', JSON.stringify(await page.evaluate(() => { const bt = window.__gona.scene.getScene('Game').battle; return { mode: bt.mode, rage: bt.rage, hp: bt.hp, busy: bt.busy, frozen: bt.frozen, cd: bt.cooldown, stunT: bt.stunT, ai: bt.ai.length, cine: bt.cine.length, rh: !!bt.rhythmS, parry: !!bt.parryS, reflect: !!bt.reflectS, last: bt.lastPhase, talk: !document.querySelector('.boss-talk')?.classList.contains('hidden'), state: window.__gona.scene.getScene('Game').state, tail: bt.attackLog.slice(-3) }; })));
      break;
    }
    await page.waitForTimeout(300);
  }
  const log = await page.evaluate(() => window.__gona.scene.getScene('Game').battle?.attackLog.join(',') ?? '');
  const qte = await page.evaluate(() => window.__gona.scene.getScene('Game').battle?.qteLog.join(',') ?? '');
  console.log('QTE', qte);
  const hist = await page.evaluate(() => { const m = {}; for (const o of window.__gona.scene.getScene('Game').children.list) { const k = `${o.type}:${o.texture?.key ?? ''}`; m[k] = (m[k] ?? 0) + 1; } return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8); });
  console.log('objects', JSON.stringify(hist));
  const first = samples[1] ?? samples[0];
  const lastS = samples[samples.length - 1];
  console.log(samples.map((x) => `${x.sec}s P${(x.rage ?? 0) + 1} hp${x.hp} gona${x.gona} objs${x.objs} host${x.hostiles} tw${x.tweens} fps${x.fps} heap${x.heap}MB`).join('\n'));
  console.log('PHASES', phaseAt.join(' '));
  console.log('RESULT', JSON.stringify({ result, sec: Math.round((Date.now() - t0) / 1000), orient, attacks: log, objsGrowth: lastS.objs - first.objs, heapGrowthMB: lastS.heap - first.heap, errors: errs }));
  await b.close();
})();
