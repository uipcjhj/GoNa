/**
 * 최종 보스 공격별 자동 회피 테스트 (개발 빌드 · ?test 경로 필요)
 *   공격마다 두 번: ① 봇이 예고만 보고 피함 → 피해 0 이어야 함 ② 가만히 서 있음 → 피해가 있어야 함 (예고 = 판정 확인)
 *   봇: battle.threatsAhead / telegraph 의 낮은 줄·고리 = 판정 직전 점프, 높은 줄 = 가만히, 바닥 장판·덩어리 = 가까이 오면 점프
 * 사용: node tools/witch-dodge-test.cjs [URL] [portrait|landscape]
 */
const { chromium, devices } = require('playwright');
const URL = process.argv[2] || 'http://localhost:4173/';
const orient = process.argv[3] || 'portrait';
const ATTACKS = [
  ['spoon', 0, 4200], ['combo', 1, 6200], ['triple', 1, 9000], ['bomb', 0, 6500], ['bounce', 0, 7500],
  ['swirl', 1, 8500], ['mash', 1, 6000], ['mash', 2, 7200], ['pot', 2, 9500], ['rain', 2, 7500], ['boomer', 2, 6500],
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
    const done = new Set();
    const tick = () => {
      const bt = g.battle;
      if (window.__botOn && bt) {
        const grounded = g.grounded;
        const now = bt.time;
        // 앞으로 고나 자리를 지나갈 위협 (낮은 줄만 점프)
        for (const t of bt.threatsAhead) {
          const key = `${t.kind}${t.at.toFixed(3)}`;
          if (done.has(key) || t.high) continue;
          const left = t.at - now;
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
  const run = async (atk, rage, wait, bot) => {
    await G(([a, r, on]) => {
      const g = window.__gona.scene.getScene('Game');
      const bt = g.battle;
      g.hearts = 3; g.hp = 100; g.invincibleUntil = 0;
      bt.rage = r; bt.applyTint(); bt.hp = bt.def.maxHp; bt.debugHold = true; bt.stunT = 0;
      window.__botOn = on;
      bt.debugAttack(a);
    }, [atk, rage, bot]);
    const h0 = 300 + 100;
    await page.waitForTimeout(wait);
    const h1 = await G(() => { const g = window.__gona.scene.getScene('Game'); return g.hearts * 100 + g.hp; });
    // 다음 공격 전 정리: 공격이 끝날 때까지 대기
    await page.waitForFunction(() => { const bt = window.__gona.scene.getScene('Game').battle; return !bt.busy && bt.hostiles.length === 0; }, null, { timeout: 15000 }).catch(() => {});
    return h0 - h1;
  };
  const res = {};
  for (const [atk, rage, wait] of ATTACKS) {
    const dodged = await run(atk, rage, wait, true);
    const stood = await run(atk, rage, wait, false);
    res[`${atk}@P${rage + 1}`] = { dodged, stood };
  }
  const bad = Object.entries(res).filter(([, v]) => v.dodged > 0 || v.stood <= 0);
  console.log(JSON.stringify(res));
  console.log(bad.length ? `FAIL ${bad.map(([k]) => k).join(',')}` : 'PASS all attacks: dodge-by-telegraph = 0 damage, standing = damage');
  console.log('errors', errs);
  process.exitCode = bad.length || errs.length ? 1 : 0;
  await b.close();
})();
