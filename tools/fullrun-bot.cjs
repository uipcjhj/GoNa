/**
 * 처음부터 엔딩까지 자동 플레이 (정상 난이도 · 치트 없음).
 *   - 새 게임: 프롤로그 건너뛰기 → 타이틀 '게임 시작' → 1단계 둥지부터
 *   - 입력은 모두 실제 터치 이벤트(CDP Input.dispatchTouchEvent): 화면 빈 곳 = 점프, 방패·공격·필살 버튼
 *   - 봇은 화면에 보이는 것(바위·몬스터·투사체·구름·간식·보스 공격의 위치와 속도)만 보고 REACT ms 마다 판단
 *   - 게임 오버가 나면 결과에 기록하고, 체크포인트가 있으면 '이어하기'로 계속 (없으면 처음부터)
 * 사용: (vite preview --port 4173 실행 중) node tools/fullrun-bot.cjs [반응ms=120] [portrait|landscape] [최대분=30]
 */
const { chromium, devices } = require('playwright');
const URL = process.env.GAME_URL || 'http://localhost:4173/';
const REACT = Number(process.argv[2] || 120);
const orient = process.argv[3] || 'portrait';
const MAX_MIN = Number(process.argv[4] || 30);

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...(orient === 'portrait' ? devices['iPhone 13'] : devices['iPhone 13 landscape']) });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  let tid = 1;
  const tapXY = async (x, y) => {
    const id = tid++;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const center = async (sel) => {
    const r = await page.locator(sel).boundingBox();
    return r ? [r.x + r.width / 2, r.y + r.height / 2] : null;
  };
  const tap = async (sel) => {
    const c = await center(sel);
    if (c) await tapXY(...c);
  };
  await page.goto(URL + '?test');
  await page.evaluate(() => localStorage.removeItem('gona.checkpoint'));
  await page.waitForSelector('.op-skip', { state: 'visible' });
  await tap('.op-skip');
  await page.waitForSelector('.cover.revealed');
  await page.waitForTimeout(2700);
  await tap('.cover-btn');
  await page.waitForFunction(() => window.__gona.scene.getScene('Game').state === 'playing', null, { timeout: 8000 });
  const vp = page.viewportSize();
  const jumpXY = [vp.width * 0.5, vp.height * 0.32];

  const t0 = Date.now();
  const log = [];
  const ev = (m) => {
    const line = `${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s ${m}`;
    log.push(line);
    console.log(line);
  };
  const st = { jumps: 0, shields: 0, attacks: 0, specials: 0, deaths: 0, continues: 0, hpLost: 0, heartsLost: 0 };
  let last = { stage: 0, battle: null, hearts: 3, hp: 100, kills: 0 };
  let lastJump = 0;
  let prevBx = null;
  let result = 'timeout';
  let btnCache = {};
  while (Date.now() - t0 < MAX_MIN * 60000) {
    const s = await page.evaluate(() => {
      const g = window.__gona.scene.getScene('Game');
      const bt = g.battle;
      const ov = document.querySelector('.over-screen');
      const threats = [];
      for (const e of g.entities) {
        if (e.done || e.type === 'snack' || e.hit) continue;
        const vx = -(g.speed + (e.vx ?? 0));
        threats.push({ x0: e.x - e.w / 2, x1: e.x + e.w / 2, yb: g.groundY - e.alt, yt: g.groundY - e.alt - e.h, vx, k: e.type });
      }
      if (bt)
        for (const h of bt.hostiles) {
          if (h.dead || h.hitPlayer) continue;
          const hw = h.shape === 'circle' ? h.r : h.w / 2;
          const hh = h.shape === 'circle' ? h.r : h.h / 2;
          threats.push({ x0: h.x - hw, x1: h.x + hw, yb: h.y + hh, yt: h.y - hh, vx: h.vx - (h.onGround ? g.speed : 0), vy: h.wave ? 0 : h.vy, ay: h.ay, k: 'boss' });
        }
      const snacks = g.entities.filter((e) => !e.done && e.type === 'snack').map((e) => ({ x: e.x, alt: e.alt }));
      const monsters = g.entities.filter((e) => !e.done && e.type === 'monster').map((e) => e.x);
      return {
        state: g.state, grounded: g.grounded, jumps: g.jumpsUsed, alt: g.alt, px: g.playerX, gy: g.groundY, speed: g.speed,
        hearts: g.hearts, hp: g.hp, out: g.boomerang.isOut, canThrow: g.canThrow, pull: g.pull, stage: g.growth.stageIndex,
        gauge: g.growth.gauge, need: g.growth.stage.gaugeToNext, score: g.score, kills: g.kills, shieldReady: g.time.now >= g.shieldReadyAt,
        over: ov && !ov.classList.contains('hidden'), cleared: !!ov?.classList.contains('cleared') || g.state === 'ending' || g.state === 'cleared',
        threats, snacks, monsters,
        b: bt && { id: bt.id, mode: bt.mode, hp: bt.hp, rage: bt.rage, frozen: bt.frozen, special: bt.special, bx: bt.bx, r: bt.bossRect(), stun: bt.stunT, tg: bt.telegraph?.impactAt ? bt.telegraph.impactAt - bt.time : null },
        talk: (() => { const n = document.querySelector('.boss-talk:not(.hidden) .btk-next'); return !!n && getComputedStyle(n).visibility !== 'hidden' && n.offsetParent !== null; })(),
        finale: g.finale ? g.finale.phase : null,
      };
    });
    // 기록
    if (s.stage !== last.stage) ev(`성장 ${s.stage + 1}단계 (점수 ${s.score}, 처치 ${s.kills})`);
    if (s.kills > last.kills) ev(`  몬스터 처치 (총 ${s.kills})`);
    if (s.b && !last.battle) ev(`⚔ 보스전 시작: ${s.b.id} (HP ${s.b.hp})`);
    if (!s.b && last.battle) ev(`보스전 끝: ${last.battle}`);
    if (s.b && last.rage !== undefined && s.b.rage > last.rage) ev(`  분노 ${s.b.rage}단계`);
    if (s.hearts < last.hearts) {
      st.heartsLost += last.hearts - s.hearts;
      st.hpLost += last.hp;
    } else if (s.hp < last.hp && s.hearts === last.hearts) st.hpLost += last.hp - s.hp;
    if (s.finale && s.finale !== last.finale) ev(`🌙 마지막 모험: ${s.finale}`);
    last = { stage: s.stage, battle: s.b?.id ?? null, hearts: s.hearts, hp: s.hp, rage: s.b?.rage, kills: s.kills, finale: s.finale };
    if (s.cleared) {
      result = 'ENDING';
      ev(`🎉 엔딩! 점수 ${s.score}`);
      break;
    }
    if (s.over || s.state === 'dead') {
      if (s.state === 'dead' && !s.over) {
        await page.waitForTimeout(300);
        continue;
      }
      st.deaths++;
      ev(`💀 게임 오버 (단계 ${s.stage + 1}${s.b ? `, ${s.b.id}전` : ''})`);
      await page.waitForTimeout(700);
      const cp = await page.locator('.cp-retry').isVisible();
      if (cp) {
        st.continues++;
        ev('  💾 체크포인트에서 이어하기');
        await tap('.cp-retry');
      } else {
        await tap('.over-screen .retry-btn');
      }
      btnCache = {};
      await page.waitForTimeout(800);
      last.hearts = 3;
      last.hp = 100;
      continue;
    }
    // 보스 대사 (등장 · 페이즈 전환): 다음 ▶
    if (s.talk) {
      await page.waitForTimeout(600);
      await tap('.boss-talk .btk-next').catch(() => {});
      await page.waitForTimeout(REACT);
      continue;
    }
    if (s.state !== 'playing' || (s.b && (s.b.frozen || s.b.mode !== 'fight'))) {
      prevBx = s.b ? s.b.bx : null;
      await page.waitForTimeout(REACT);
      continue;
    }
    const x0 = s.px - 5.5;
    const x1 = s.px + 5.5;
    const head = s.gy - 21;
    let threat = null;
    for (const h of s.threats) {
      if (h.vx >= -1) continue;
      const t = (h.x0 - x1) / -h.vx;
      if (t < -0.15 || t > 0.42) continue;
      const tt = Math.max(0, t);
      const dy = (h.vy || 0) * tt + 0.5 * (h.ay || 0) * tt * tt;
      const low = h.yb + dy > head && h.yt + dy < s.gy;
      if (low && (!threat || t < threat.t)) threat = { t };
    }
    if (s.b) {
      const bvx = prevBx === null ? 0 : (s.b.bx - prevBx) / (REACT / 1000);
      prevBx = s.b.bx;
      if (bvx < -90) {
        const t = (s.b.r.x0 - x1) / -bvx;
        if (t > -0.1 && t < 0.42 && (!threat || t < threat.t)) threat = { t };
      }
    }
    // 최종 보스: 숟가락·냄비 폭발 — 예고된 순간 직전에 점프 (예고 = 판정)
    if (s.b?.tg != null && s.b.tg > 0 && s.b.tg < 0.3 && (!threat || threat.t > s.b.tg)) threat = { t: 0 };
    let acted = false;
    if (threat) {
      if (s.grounded && threat.t < 0.3 && Date.now() - lastJump > 150) {
        await tapXY(...jumpXY);
        st.jumps++;
        lastJump = Date.now();
        acted = true;
      } else if (s.b && s.shieldReady && threat.t < 0.14 && (s.grounded || s.alt < 22)) {
        btnCache.shield = btnCache.shield || (await center('.bt-shield'));
        if (btnCache.shield) await tapXY(...btnCache.shield);
        st.shields++;
        acted = true;
      }
    }
    // 흡입: 땅에 있으면 끌려가므로 점프
    if (!acted && s.pull > 4 && s.grounded && Date.now() - lastJump > 200) {
      await tapXY(...jumpXY);
      st.jumps++;
      lastJump = Date.now();
      acted = true;
    }
    // 높은 간식 (위협이 없을 때만)
    if (!acted && !threat && s.grounded && Date.now() - lastJump > 300) {
      const want = s.snacks.find((n) => n.alt >= 14 && n.alt <= 60 && (n.x - x1) / s.speed > 0.15 && (n.x - x1) / s.speed < 0.3);
      if (want) {
        await tapXY(...jumpXY);
        st.jumps++;
        lastJump = Date.now();
      }
    }
    // 공격 · 필살
    if (s.b && s.b.special >= 1) {
      btnCache.special = btnCache.special || (await center('.bt-special'));
      if (btnCache.special) await tapXY(...btnCache.special);
      st.specials++;
    } else if (s.canThrow && !s.out && (s.b || s.monsters.some((mx) => mx > s.px + 15 && mx < s.px + 170))) {
      btnCache.attack = btnCache.attack || (await center('.bt-attack'));
      if (btnCache.attack) await tapXY(...btnCache.attack);
      st.attacks++;
    }
    await page.waitForTimeout(REACT);
  }
  const perf = await page.evaluate(() => window.__perf.stats());
  const fin = await page.evaluate(() => { const g = window.__gona.scene.getScene('Game'); return { score: g.score, kills: g.kills, monstersSpawned: g.spawned, snackRainEvents: g.eventCount, snacks: g.snacksEaten, damage: g.damageLog.join(' ') }; });
  console.log('\nRESULT', JSON.stringify({ result, minutes: +((Date.now() - t0) / 60000).toFixed(1), react: REACT, orient, ...st, ...fin, fps: perf.fps, p95: perf.p95, errors: errs.length }));
  await b.close();
})();
