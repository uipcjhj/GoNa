/**
 * 최종 보스 '이유식 대탈출!' 미니게임 자동 테스트 (개발 빌드 · ?test 경로)
 *   ① 받아치기 퉤!: 딱 맞춤 → perfect(마녀 피해·고나 무사) · 조금 일찍 → good · 안 누름 → miss(고나 피해) · 너무 일찍 → whiff
 *   ③ 폭탄 반사: 도착 직전 방패 → perfect(반사·마녀 피해) · 일찍 방패 → block · 방패 없음 → miss
 *   ② 울음 리듬: 정확히(꾸욱은 길게) → 5/5 · 꾸욱을 톡으로 → 꾸욱 실패 · 안 누름 → 0/5 + 고나 피해
 *   입력 잠금: 리듬 중 화면 터치 점프 안 됨 · 방패 안 켜짐 / 일시정지: 날아오던 이유식이 멈춤
 *   버튼은 실제 화면 버튼에 포인터 이벤트(누름·뗌)로 — 실제 터치(touchscreen.tap)도 한 번 확인
 * 사용: node tools/witch-qte-test.cjs [URL] [portrait|landscape]
 */
const { chromium, devices } = require('playwright');
const URL = process.argv[2] || 'http://localhost:4173/';
const orient = process.argv[3] || 'portrait';
const out = [];
const check = (name, ok, info = '') => out.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`);
(async () => {
  const b = await chromium.launch();
  const page = await (await b.newContext({ ...(orient === 'portrait' ? devices['iPhone 13'] : devices['iPhone 13 landscape']) })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(URL + '?test=witch-p1');
  await page.waitForFunction(() => window.__gona?.scene.getScene('Game')?.battle?.mode === 'fight', null, { timeout: 40000 });
  const G = (f, a) => page.evaluate(f, a);
  // 페이지 안 도우미: 전투 시각 기준으로 버튼 누르기 (requestAnimationFrame)
  await G(() => {
    const g = window.__gona.scene.getScene('Game');
    window.__press = (sel, down = true) => {
      const el = document.querySelector(sel);
      el.dispatchEvent(new PointerEvent(down ? 'pointerdown' : 'pointerup', { bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true }));
      // 톡(누름만 보낸 경우)은 바로 뗌 — 버튼이 눌린 채로 남지 않게
      if (down && sel !== '.bt-cry') el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true }));
    };
    /** at(fn) 이 true 가 되는 순간 act() — 전투 시각으로 */
    window.__when = (cond, act) => new Promise((res) => { const loop = () => { const bt = g.battle; if (bt && cond(bt)) { act(bt); res(true); } else requestAnimationFrame(loop); }; loop(); });
  });
  const fresh = (rage) => G((r) => { const g = window.__gona.scene.getScene('Game'); const bt = g.battle; g.hearts = 3; g.hp = 100; g.invincibleUntil = 0; bt.rage = r; bt.hp = bt.def.maxHp; bt.debugHold = true; bt.stunT = 0; bt.seen.add('parry'); bt.seen.add('reflect'); bt.seen.add('rhythm'); }, rage);
  const idle = () => page.waitForFunction(() => { const bt = window.__gona.scene.getScene('Game').battle; return !bt.busy && bt.stunT <= 0 && !bt.rhythmS && !bt.parryS && !bt.reflectS; }, null, { timeout: 20000 }).catch(() => {});
  const snap = () => G(() => { const g = window.__gona.scene.getScene('Game'); const bt = g.battle; return { boss: bt.hp, gona: g.hearts * 100 + g.hp, log: bt.qteLog.slice(-1)[0] }; });

  // ① 받아치기
  for (const [mode, rage] of [['perfect', 0], ['good', 1], ['miss', 2], ['whiff', 0]]) {
    await fresh(rage);
    const s0 = await snap();
    await G(() => window.__gona.scene.getScene('Game').battle.debugAttack('parry'));
    await page.waitForFunction(() => !!window.__gona.scene.getScene('Game').battle.parryS, null, { timeout: 5000 });
    const off = { perfect: -0.02, good: -0.3, whiff: -0.7 }[mode];
    if (off !== undefined) {
      const vis = await G((o) => window.__when((bt) => bt.time >= bt.parryS.arrive + o, () => {}).then(() => !document.querySelector('.bt-spit').classList.contains('hidden')), off);
      await G(() => window.__press('.bt-spit'));
      if (mode === 'perfect') check(`${orient}: parry 퉤! button is visible while the goo approaches`, vis);
    }
    await idle();
    const s1 = await snap();
    const exp = { perfect: s1.boss < s0.boss - 10 && s1.gona === s0.gona, good: s1.boss < s0.boss && s1.boss > s0.boss - 10 && s1.gona === s0.gona, miss: s1.gona < s0.gona && s1.boss === s0.boss, whiff: s1.gona < s0.gona }[mode];
    check(`${orient}: parry ${mode}`, s1.log === `parry:${mode}` && exp, JSON.stringify({ s0, s1 }));
  }
  // 실제 터치로 퉤!
  await fresh(0);
  await G(() => window.__gona.scene.getScene('Game').battle.debugAttack('parry'));
  await page.waitForFunction(() => { const bt = window.__gona.scene.getScene('Game').battle; return bt.parryS && bt.time >= bt.parryS.arrive - 0.75; }, null, { timeout: 8000 });
  const bb = await page.locator('.bt-spit').boundingBox();
  await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await idle();
  check(`${orient}: parry with a real touch tap reaches the 퉤! button (headless touch lags ~0.5s)`, /parry:(perfect|good|whiff)/.test((await snap()).log), (await snap()).log);

  // ③ 반사
  for (const [mode, lead] of [['perfect', 0.15], ['block', 0.8], ['miss', null]]) {
    await fresh(1);
    await page.waitForTimeout(4200); // 방패 재사용 대기 (4초)
    const s0 = await snap();
    await G(() => window.__gona.scene.getScene('Game').battle.debugAttack('reflect'));
    await page.waitForFunction(() => !!window.__gona.scene.getScene('Game').battle.reflectS, null, { timeout: 5000 });
    if (lead !== null) await G((l) => window.__when((bt) => bt.time >= bt.reflectS.arrive - l, () => window.__press('.bt-shield')), lead);
    await idle();
    const s1 = await snap();
    const exp = { perfect: s1.boss < s0.boss && s1.gona === s0.gona, block: s1.boss === s0.boss && s1.gona === s0.gona, miss: s1.gona < s0.gona }[mode];
    check(`${orient}: reflect ${mode}`, s1.log === `reflect:${mode}` && exp, JSON.stringify({ s0, s1 }));
  }

  // ② 리듬
  for (const mode of ['perfect', 'tapHold', 'none']) {
    await fresh(1);
    const s0 = await snap();
    await G(() => window.__gona.scene.getScene('Game').battle.debugAttack('rhythm'));
    await page.waitForFunction(() => !!window.__gona.scene.getScene('Game').battle.rhythmS, null, { timeout: 5000 });
    if (mode === 'none') {
      // 입력 잠금 확인: 리듬 중 화면 터치·방패
      await page.waitForTimeout(600);
      const before = await G(() => { const g = window.__gona.scene.getScene('Game'); return { y: g.alt, shield: g.shieldOn }; });
      await page.touchscreen.tap(100, 300);
      await G(() => window.__press('.bt-shield'));
      await page.waitForTimeout(250);
      const after = await G(() => { const g = window.__gona.scene.getScene('Game'); return { alt: g.alt, shield: !!g.battle.host.shieldRect(), cryVisible: !document.querySelector('.bt-cry').classList.contains('hidden'), rhythmVisible: !document.querySelector('.rhythm-box').classList.contains('hidden'), atkOff: document.querySelector('.bt-attack').classList.contains('off') }; });
      check(`${orient}: rhythm locks jump/shield/attack, shows 으앙! + lane`, after.alt === 0 && !after.shield && after.cryVisible && after.rhythmVisible && after.atkOff, JSON.stringify({ before, after }));
    } else {
      await G((m) => {
        const bt = window.__gona.scene.getScene('Game').battle;
        const notes = bt.rhythmS.notes.map((n) => ({ t: n.t, hold: n.hold }));
        return Promise.all(notes.map((n) => window.__when((b) => b.time >= n.t - 0.02, () => {
          window.__press('.bt-cry', true);
          const holdFor = n.hold > 0 && m === 'perfect' ? n.hold + 0.05 : 0.06;
          const end = n.t + holdFor;
          window.__when((b) => b.time >= end, () => window.__press('.bt-cry', false));
        })));
      }, mode);
    }
    await idle();
    const s1 = await snap();
    const exp = { perfect: s1.log === 'rhythm:5/5' && s1.boss < s0.boss && s1.gona === s0.gona, tapHold: s1.log === 'rhythm:4/5' && s1.gona < s0.gona, none: s1.log === 'rhythm:0/5' && s1.gona < s0.gona }[mode];
    check(`${orient}: rhythm ${mode}`, exp, JSON.stringify({ s0, s1 }));
  }

  // 일시정지: 날아오던 이유식이 멈추고, 다시 시작하면 이어짐
  await fresh(0);
  await G(() => window.__gona.scene.getScene('Game').battle.debugAttack('parry'));
  await page.waitForFunction(() => !!window.__gona.scene.getScene('Game').battle.parryS, null, { timeout: 5000 });
  await page.waitForTimeout(200);
  const p0 = await G(() => { const g = window.__gona.scene.getScene('Game'); g.pauseGame(); return { t: g.battle.time, x: g.battle.parryS.s.x }; });
  await page.waitForTimeout(1500);
  const p1 = await G(() => { const g = window.__gona.scene.getScene('Game'); return { t: g.battle.time, x: g.battle.parryS?.s.x, state: g.state }; });
  await G(() => window.__gona.scene.getScene('Game').resumeGame());
  check(`${orient}: pause freezes the minigame (battle time and goo stop)`, p1.state === 'paused' && Math.abs(p1.t - p0.t) < 0.05 && p1.x === p0.x, JSON.stringify({ p0, p1 }));
  await idle();
  check(`${orient}: no page errors (QTE)`, errs.length === 0, errs.join(' | '));
  console.log(out.join('\n'));
  process.exitCode = out.some((l) => l.startsWith('FAIL')) ? 1 : 0;
  await b.close();
})();
