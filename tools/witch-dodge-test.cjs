/**
 * 최종 보스 공격별 자동 회피 테스트 (개발 빌드 · ?test 경로 필요)
 *   공격마다: ① 봇이 안내(▲점프 / ●가만히 / 🛡방패)대로 대응 → 피해 0 ② 가만히 서 있음 → (점프·방패 공격이면) 피해
 *            ③ 방패 공격에 점프로만 대응 → 피해 (점프로는 못 피함) ④ 가만히 공격에 점프 → 피해 (점프하면 맞음)
 *   봇: battle.threatsAhead — 낮은 것 = 판정 직전 점프 · 높은 것 = 가만히 · shield = 0.45초 전에 방패
 * 사용: node tools/witch-dodge-test.cjs [URL] [portrait|landscape]
 */
const { chromium, devices } = require('playwright');
const URL = process.argv[2] || 'http://localhost:4173/';
const orient = process.argv[3] || 'portrait';
// [공격, 페이즈(rage), 기다림ms, 대응 종류]
const ATTACKS = [
  ['spoon', 0, 4200, 'jump'], ['high', 0, 4200, 'stay'], ['bounce', 0, 7500, 'jump'], ['slam', 1, 4800, 'shield'], ['triple', 1, 9000, 'jump'],
  ['swirl', 1, 10000, 'mixed'], ['boomer', 2, 6500, 'mixed'], ['rain', 2, 7500, 'jump'], ['pot', 2, 9500, 'jump'], ['slam', 2, 4800, 'shield'],
  ['combo', 1, 6200, 'jump'], ['bomb', 0, 6500, 'jump'],
];
(async () => {
  const b = await chromium.launch();
  const page = await (await b.newContext({ ...(orient === 'portrait' ? devices['iPhone 13'] : devices['iPhone 13 landscape']) })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(URL + '?test=witch-p1');
  await page.waitForFunction(() => window.__gona?.scene.getScene('Game')?.battle?.mode === 'fight', null, { timeout: 40000 });
  await page.evaluate(() => {
    const g = window.__gona.scene.getScene('Game');
    window.__botOn = false;
    window.__botMode = 'smart'; // smart | jumpAll (가만히·방패 공격에도 점프만)
    const done = new Set();
    const tick = () => {
      const bt = g.battle;
      if (window.__botOn && bt) {
        const grounded = g.grounded;
        const now = bt.time;
        // 앞으로 고나 자리를 지나갈 위협 (낮은 줄만 점프)
        const jumpAll = window.__botMode === 'jumpAll';
        for (const t of bt.threatsAhead) {
          const key = `${t.kind}${t.at.toFixed(3)}`;
          if (done.has(key)) continue;
          const left = t.at - now;
          if (t.shield && !jumpAll) {
            if (left < 0.45 && left > 0) { done.add(key); window.__bus.emit('shield'); }
            continue;
          }
          if (t.high && !jumpAll) continue;
          if (left < 0.2 && left > -0.05 && grounded) {
            done.add(key);
            g.pressJump();
          }
        }
        const tg = bt.telegraph;
        if (tg && tg.impactAt && !tg.high && grounded && ['spoon', 'combo', 'triple', 'pot'].includes(tg.kind)) {
          const left = tg.impactAt - now;
          if (left < 0.22 && left > 0) g.pressJump();
        }
        const px = g.playerX;
        for (const h of bt.hostiles) {
          if (h.dead || h.hitPlayer || h.vx > 0) continue;
          const key = h.sprite.texture.key;
          const dx = h.x - px;
          const low = h.y > g.groundY - 16;
          if (grounded && low && dx > 0 && dx < 32 && ((key === 'witch-puddle' && (h.onGround || h.vx < 0)) || (key === 'witch-goo' && !bt.bouncers?.some((x) => x.h === h)))) g.pressJump();
        }
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
  const G = (f, a) => page.evaluate(f, a);
  const run = async (atk, rage, wait, bot, mode = 'smart') => {
    await G(([a, r, on, m]) => {
      window.__botMode = m;
      const g = window.__gona.scene.getScene('Game');
      const bt = g.battle;
      g.hearts = 3; g.hp = 100; g.invincibleUntil = 0;
      bt.rage = r; bt.applyTint(); bt.hp = bt.def.maxHp; bt.debugHold = true; bt.stunT = 0;
      window.__botOn = on;
      bt.debugAttack(a);
    }, [atk, rage, bot, mode]);
    const h0 = 300 + 100;
    await page.waitForTimeout(wait);
    const h1 = await G(() => { const g = window.__gona.scene.getScene('Game'); return g.hearts * 100 + g.hp; });
    // 다음 공격 전 정리: 공격이 끝날 때까지 대기
    await page.waitForFunction(() => { const bt = window.__gona.scene.getScene('Game').battle; return !bt.busy && bt.hostiles.length === 0; }, null, { timeout: 15000 }).catch(() => {});
    return h0 - h1;
  };
  const res = {};
  for (const [atk, rage, wait, kind] of ATTACKS) {
    const r = { kind, dodged: await run(atk, rage, wait, true) };
    if (kind !== 'stay') r.stood = await run(atk, rage, wait, false); // 가만히 공격은 서 있으면 안 맞는 게 정상
    if (kind === 'stay' || kind === 'shield') r.jumped = await run(atk, rage, wait, true, 'jumpAll');
    res[`${atk}@P${rage + 1}`] = r;
  }
  const bad = Object.entries(res).filter(([, v]) => v.dodged > 0 || (v.stood !== undefined && v.stood <= 0) || (v.jumped !== undefined && v.jumped <= 0));
  console.log(JSON.stringify(res));
  console.log(bad.length ? `FAIL ${bad.map(([k]) => k).join(',')}` : 'PASS all attacks: following the cue = 0 damage · standing still on jump/shield attacks = damage · jumping on stay/shield attacks = damage');
  console.log('errors', errs);
  process.exitCode = bad.length || errs.length ? 1 : 0;
  await b.close();
})();
