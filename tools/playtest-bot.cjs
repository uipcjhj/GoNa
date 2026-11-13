/**
 * 보스전 실제 플레이 검증 봇 — 치트 없음 (무적·보스 체력 조작 없음, 정상 피해량).
 * 입력은 모두 실제 터치 이벤트(CDP Input.dispatchTouchEvent): 화면 빈 곳 터치 = 점프, 방패·공격·필살 버튼 터치.
 * 봇은 화면에 보이는 정보(투사체 위치·속도, 보스 위치)만 보고 판단하고, 반응 간격(REACT ms)마다 한 번씩 행동.
 *
 * 사용: (vite preview --port 4173 실행 중) node tools/playtest-bot.cjs kiss|sniff [반복 횟수] [반응ms] [portrait|landscape]
 */
const { chromium, devices } = require('playwright');
const URL = process.env.GAME_URL || 'http://localhost:4173/';
const boss = process.argv[2] || 'kiss';
const runs = Number(process.argv[3] || 3);
const REACT = Number(process.argv[4] || 80);
const orient = process.argv[5] || 'portrait';
/** 'normal' = 공격하며 클리어 / 'dodge' = 공격 안 하고 피하기만 60초 / 'dodge2' = 2페이즈까지 공격한 뒤 피하기만 60초 */
const MODE = process.env.MODE || 'normal';

async function play(run) {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...(orient === 'portrait' ? devices['iPhone 13'] : devices['iPhone 13 landscape']) });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  let nextId = 1;
  const tapXY = async (x, y) => {
    const id = nextId++;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const centers = {};
  const center = async (sel) => {
    if (!centers[sel]) {
      const r = await page.locator(sel).boundingBox();
      centers[sel] = [r.x + r.width / 2, r.y + r.height / 2];
    }
    return centers[sel];
  };
  await page.goto(URL + '?test');
  await page.waitForSelector('.op-skip', { state: 'visible' });
  await tapXY(...(await center('.op-skip')));
  await page.waitForSelector('.cover.revealed');
  await page.waitForTimeout(2700);
  // 타이틀 테스트 메뉴로 보스전 바로 (성장 과정만 건너뜀 — 전투는 정상)
  await tapXY(...(await center('.cover-dev-toggle')));
  await page.waitForTimeout(200);
  await tapXY(...(await center(`.cover-dev-btn >> nth=${boss === 'kiss' ? 0 : 1}`)));
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').debugBattle(), null, { timeout: 9000 });
  await page.waitForTimeout(300);
  const vp = page.viewportSize();
  const jumpXY = [vp.width * 0.5, vp.height * 0.32]; // 화면 빈 곳

  const stats = { jumps: 0, shields: 0, attacks: 0, specials: 0, hpLost: 0, heartsLost: 0, ms: 0 };
  const t0 = Date.now();
  let prevBx = null;
  let lastJump = 0;
  let last = { hearts: 3, hp: 100 };
  let result = 'timeout';
  let dodgeFrom = MODE === 'dodge' ? Date.now() : 0;
  while (Date.now() - t0 < 240000) {
    if (dodgeFrom && Date.now() - dodgeFrom > 60000) { result = 'SURVIVED-60s'; break; }
    const s = await page.evaluate(() => {
      const g = window.__gona.scene.getScene('Game');
      const bt = g.battle;
      const ov = document.querySelector('.over-screen');
      return {
        state: g.state, grounded: g.grounded, jumps: g.jumpsUsed, alt: g.alt, px: g.playerX, gy: g.groundY, speed: g.speed,
        hearts: g.hearts, hp: g.hp, out: g.boomerang.isOut, canThrow: g.canThrow, pull: g.pull, stage: g.growth.stageIndex,
        shieldReady: g.time.now >= g.shieldReadyAt, over: ov && !ov.classList.contains('hidden'), cleared: ov?.classList.contains('cleared') || g.state === 'ending' || g.state === 'cleared', fin: !!g.finale,
        b: bt && { qte: bt.resistActive ? 'resist' : bt.aimActive ? (bt.aim && bt.aim.pause <= 0 && Math.abs(bt.aim.pos - 0.5) < 0.05 ? 'nose' : 'aim') : null, mode: bt.mode, hp: bt.hp, frozen: bt.frozen, special: bt.special, bx: bt.bx, r: bt.bossRect(),
          hs: bt.hostiles.filter((h) => !h.dead && !h.hitPlayer).map((h) => ({ x: h.x, y: h.y, vx: h.vx, vy: h.vy, ay: h.ay, c: h.shape === 'circle', r: h.r, w: h.w, h: h.h, g: h.onGround, wave: !!h.wave })) },
      };
    });
    // 피해 기록
    if (s.hearts < last.hearts) { stats.heartsLost += last.hearts - s.hearts; stats.hpLost += last.hp; }
    else if (s.hp < last.hp) stats.hpLost += last.hp - s.hp;
    last = { hearts: s.hearts, hp: s.hp };
    if (s.state === 'dead' || (s.over && !s.cleared)) { result = 'LOSE'; break; }
    if (!s.b || s.b.mode === 'victory') stats.battleSec = stats.battleSec ?? Math.round((Date.now() - t0) / 1000);
    if (!s.b) {
      // 보스전 끝: 뽀뽀괴물이면 진화(3단계) 확인, 킁카괴물이면 엔딩 화면
      if (boss === 'kiss' && s.stage >= 2) { result = 'WIN'; break; }
      if (boss === 'sniff' && (s.cleared || s.fin)) { result = 'WIN'; break; } // 킁카괴물 다음은 마지막 모험
      await page.waitForTimeout(REACT);
      continue;
    }
    if (s.b.frozen || s.b.mode !== 'fight' || s.state !== 'playing') { prevBx = s.b.bx; await page.waitForTimeout(REACT); continue; }

    // 흡입 버티기: 한 손가락 연타 (반응 간격마다 한 번) / 움직이는 과녁: 코에 올 때만 조준
    if (s.b.qte === 'resist') { await tapXY(...(await center('.bt-shield'))); stats.mash = (stats.mash ?? 0) + 1; await page.waitForTimeout(Math.max(REACT, 120)); continue; }
    if (s.b.qte === 'nose' || s.b.qte === 'aim') {
      if (s.b.qte === 'nose') { await tapXY(...(await center('.bt-attack'))); stats.aims = (stats.aims ?? 0) + 1; }
      await page.waitForTimeout(REACT); continue;
    }
    const x0 = s.px - 5.5, x1 = s.px + 5.5, head = s.gy - 19 - 2, feet = s.gy;
    // 다가오는 위협: 이대로면 서 있는 고나와 부딪히는지 (반응 시간 동안 예측)
    let threat = null;
    for (const h of s.b.hs) {
      const vx = h.vx - (h.g ? s.speed : 0);
      if (vx >= -1) continue;
      const hw = h.c ? h.r : h.w / 2, hh = h.c ? h.r : h.h / 2;
      const t = (h.x - hw - x1) / -vx;
      if (t < -0.15 || t > 0.42) continue;
      const tt = Math.max(0, t);
      const y = h.y + (h.wave ? 0 : h.vy * tt + 0.5 * h.ay * tt * tt);
      const low = y + hh > head && y - hh < feet; // 서 있는 높이와 겹침
      if (low && (!threat || t < threat.t)) threat = { t, y, hh };
    }
    // 보스 돌진
    const bvx = prevBx === null ? 0 : (s.b.bx - prevBx) / (REACT / 1000);
    prevBx = s.b.bx;
    if (bvx < -90) {
      const t = (s.b.r.x0 - x1) / -bvx;
      if (t > -0.1 && t < 0.42 && (!threat || t < threat.t)) threat = { t, y: s.gy - 15, hh: 15 };
    }
    let acted = false;
    if (threat) {
      // 점프 타이밍: 0.12~0.32초 전에 뛰면 넘어감 (점프 체공 약 0.67초)
      if (s.grounded && threat.t < 0.32 && Date.now() - lastJump > 150) {
        await tapXY(...jumpXY); stats.jumps++; lastJump = Date.now(); acted = true;
      } else if (!s.grounded && threat.t < 0.16 && s.alt < 22 && s.shieldReady) {
        // 착지 중이라 못 넘을 것 같으면 방패
        await tapXY(...(await center('.bt-shield'))); stats.shields++; acted = true;
      } else if (s.grounded && threat.t < 0.08 && s.shieldReady) {
        await tapXY(...(await center('.bt-shield'))); stats.shields++; acted = true;
      }
    }
    // 흡입: 땅에 있으면 끌려가므로 계속 점프
    if (!acted && s.pull > 4 && s.grounded && Date.now() - lastJump > 200) { await tapXY(...jumpXY); stats.jumps++; lastJump = Date.now(); acted = true; }
    // 공격 · 필살 (피하기 모드에서는 안 함)
    if (MODE === 'dodge2' && !dodgeFrom && (await page.evaluate(() => window.__gona.scene.getScene('Game').battle?.phase2))) dodgeFrom = Date.now();
    if (dodgeFrom) { await page.waitForTimeout(REACT); continue; }
    if (s.b.special >= 1) { await tapXY(...(await center('.bt-special'))); stats.specials++; }
    else if (s.canThrow && !s.out) { await tapXY(...(await center('.bt-attack'))); stats.attacks++; }
    await page.waitForTimeout(REACT);
  }
  stats.ms = Date.now() - t0;
  const perf = await page.evaluate(() => window.__perf.stats());
  const logs = await page.evaluate(() => { const g = window.__gona.scene.getScene('Game'); return { dmg: g.damageLog.slice(), atk: (g.battle?.attackLog ?? g.lastAttackLog ?? []).slice() }; });
  stats.damage = logs.dmg.join(' ') || '없음';
  stats.attacksSeen = logs.atk.join(',');
  const q = await page.evaluate(() => { const bt = window.__gona.scene.getScene('Game').battle; return bt ? { resist: (bt.resistLog ?? []).join(','), aim: (bt.aimLog ?? []).map((a) => a.judge + 'x' + a.mul).join(',') } : null; });
  stats.qte = q;
  await b.close();
  return { run, result, sec: Math.round(stats.ms / 1000), heartsLeft: last.hearts, ...stats, fps: perf.fps, p95: perf.p95, errs: errs.length };
}

(async () => {
  const out = [];
  for (let i = 1; i <= runs; i++) {
    const r = await play(i);
    console.log(`${boss} ${orient} react${REACT}ms #${i}:`, JSON.stringify(r));
    out.push(r);
  }
  const wins = out.filter((r) => r.result === 'WIN').length;
  console.log(`${boss}: ${wins}/${runs} 승리`);
})();
