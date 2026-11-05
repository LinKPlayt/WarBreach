// WarBreach logic checks for the balance and bug-fix pass.
// Run: node tests/logic.test.js   (needs Playwright with Chromium available)
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) { rsp.writeHead(404); rsp.end(); return; }
      const type = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml' }[path.extname(f)] || 'application/octet-stream';
      rsp.writeHead(200, { 'Content-Type': type });
      fs.createReadStream(f).pipe(rsp);
    }).listen(0, () => res(srv));
  });
}

// In-page helpers: a full base at a Command Center level, and a fixed-step battle runner.
const PAGE_HELPERS = `
window.T = {
  base(L) {
    S = newBase(); S.tut = 99; S.introSeen = true;
    S.buildings = S.buildings.filter(b => b.type === 'hq'); S.buildings[0].level = L; rebuildGrid();
    const h = S.buildings[0], order = Object.keys(LIMITS).filter(t => t !== 'hq' && t !== 'wall' && !DEFS[t].deco && !DEFS[t].decoy && LIMITS[t][L] > 0);
    order.sort((a, b) => (DEFS[b].cat === 'defense') - (DEFS[a].cat === 'defense'));
    for (const t of order) for (let i = 0; i < LIMITS[t][L]; i++) {
      const n = DEFS[t].size, sp = nearestFree(t, h.x + 1 - Math.floor(n / 2), h.y + 1 - Math.floor(n / 2));
      if (sp) { S.buildings.push({ id: S.nextId++, type: t, x: sp.x, y: sp.y, level: Math.min(L, DEFS[t].max), job: null, stored: 0, baseAngle: 0 }); rebuildGrid(); }
    }
  },
  run(secs, dt = 0.05) {
    let t = 0;
    while (t < secs && B && !B.over && B.phase !== 'lost' && B.phase !== 'won') {
      if (B.paused) { const c = document.querySelector('#cards [data-card]'); if (c) c.click(); else break; }
      battleUpdate(dt); t += dt;
      if (particles.length > 900) particles.length = 0;
    }
    return t;
  },
};
Sound.play = () => {}; window.buzz = () => {};
`;

const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); }

(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 844, height: 390 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://localhost:${srv.address().port}/index.html`);
  await page.waitForTimeout(800);
  await page.evaluate(PAGE_HELPERS);

  // 1. A wave held open by enemies out of every defense's reach still ends.
  const stall = await page.evaluate(() => {
    T.base(3); S.forecast = null; startBattle(null); B.hero = null;
    B.weather = WEATHER.find(w => w.id === 'clear'); // no lightning strikes
    B.breakT = 0; battleUpdate(0.01); // wave 1 starts
    B.dmgBy = {};
    B.queue = []; B.units = [];
    // two riflemen parked on the map edge, beside a building nothing can reach
    const far = S.buildings.filter(b => b.type !== 'hq' && !isPassive(b.type)).sort((a, b) => a.x - b.x)[0];
    for (let i = 0; i < 2; i++) { spawnEnemy('rifleman'); const u = B.units[B.units.length - 1]; u.x = 0.6 * TILE; u.y = (far.y + 0.5 + i * 0.3) * TILE; }
    // make the building unbreakable so nothing ever dies: the worst case
    for (const b of S.buildings) { b._maxhp = b._hp = 1e9; if (weaponOf(b)) b._stun = 1e9; if (DEFS[b.type].trap) b._dead = true; } // nothing dies, no gun or trap fires
    B.troops = [];
    const t0 = B.lastT || 0;
    T.run(STRAGGLER.charge - 1);
    const beforeCharge = B.units.some(u => u.charge);
    T.run(2);
    const charging = B.units.length === 0 || B.units.every(u => u.charge);
    const dbg = `lastT ${B.lastT && B.lastT.toFixed(1)}, wave ${B.wave}, phase ${B.phase}, units ${B.units.map(u => u.type + (u.charge ? '*' : '')).join(' ')}, queue ${B.queue.length}, pending ${stormPending()}, dmgBy ${JSON.stringify(B.dmgBy)}`;
    T.run(STRAGGLER.retreat + 5);
    return { dbg, t0, beforeCharge, charging, cleared: B.waves >= 1, phase: B.phase, units: B.units.length };
  });
  check('stragglers do not charge before the no-progress timer', !stall.beforeCharge);
  check('stragglers charge after STRAGGLER.charge seconds without progress', stall.charging, stall.charging ? '' : stall.dbg);
  check('a stalled wave always ends', stall.cleared, `waves cleared ${stall.cleared ? '1+' : 0}, phase ${stall.phase}`);

  // 2. Progress (a kill) resets the timer.
  const reset = await page.evaluate(() => {
    if (B) { B.over = true; leaveBattle(); } closeModal();
    T.base(4); S.forecast = null; startBattle(null); B.hero = null; B.breakT = 0; battleUpdate(0.01);
    B.queue = []; B.units = [];
    spawnEnemy('rifleman'); const u = B.units[0]; u.x = 0.6 * TILE; u.y = 2 * TILE;
    spawnEnemy('rifleman'); const v = B.units[1]; v.x = 0.6 * TILE; v.y = 3 * TILE;
    B.lastT = STRAGGLER.charge - 2;
    damageEnemy(v, 1e6, 'mg');
    const after = B.lastT;
    B.over = true; leaveBattle(); closeModal();
    return after;
  });
  check('killing an enemy resets the no-progress timer', reset === 0, `lastT ${reset}`);

  // 3. Waves at every Command Center level end without stalling for long (no enemy parks forever).
  const soak = await page.evaluate(() => {
    const out = [];
    for (const L of [3, 6, 9]) {
      T.base(L); S.forecast = null; startBattle(null);
      let longest = 0, waveT = 0, w = 0;
      for (let i = 0; i < 2400 && B.phase !== 'lost' && B.waves < 6; i++) {
        T.run(0.5);
        if (B.wave !== w) { w = B.wave; waveT = 0; } else if (B.phase === 'fight') { waveT += 0.5; longest = Math.max(longest, waveT); }
      }
      out.push({ L, waves: B.waves, longest });
      B.over = true; leaveBattle(); closeModal();
    }
    return out;
  });
  for (const r of soak) check(`HQ${r.L}: endless waves keep moving`, r.longest < 400, `${r.waves} waves, longest ${Math.round(r.longest)}s`);

  // 4. An Overtime Shift bought before leaving keeps working offline.
  const off = await page.evaluate(() => {
    T.base(3);
    const m = S.buildings.find(b => b.type === 'goldmine'); m.stored = 0;
    const st = statsFor('goldmine', m.level); const perSec = st.rate * (1 + researchBonus('logistics') + kBonus('prod')) / 60;
    // away 200 s (well under the mine's capacity)
    S.boosts = {}; applyOffline(200); const plain = m.stored;
    m.stored = 0; S.boosts = { prod: Date.now() - 100 * 1000 }; applyOffline(200); const ended = m.stored; // boost ran out 100 s ago: half the time boosted
    m.stored = 0; S.boosts = { prod: Date.now() + 3600 * 1000 }; applyOffline(200); const whole = m.stored;
    S.boosts = {};
    return { plain: plain / perSec, ended: ended / perSec, whole: whole / perSec, hold: st.hold / perSec };
  });
  const near = (a, b) => Math.abs(a - b) < 1;
  check('offline production without a boost', near(off.plain, 200) && off.hold > 400, off.plain.toFixed(1));
  check('offline boost counts only the boosted part of the time away', near(off.ended, 300), off.ended.toFixed(1));
  check('offline boost that outlasts the absence doubles all of it', near(off.whole, 400), off.whole.toFixed(1));

  // 5. Gauntlet scaling: the unlock level starts gently, later levels never start below Command Center 8's.
  const g = await page.evaluate(() => {
    const lv = [];
    for (const H of [5, 6, 7, 8, 12]) { T.base(H); lv.push([H, gauntletMission('battle', 0).level, gauntletMission('boss', 7).level]); }
    return { lv, len: GAUNTLET.start.length, max: MAX_HQ };
  });
  check('Gauntlet has a start level for every Command Center level', g.len === g.max + 1);
  check('Gauntlet starts gently at its unlock level', g.lv[0][1] <= 6, `HQ5 stage 1 level ${g.lv[0][1]}`);
  check('Gauntlet difficulty never drops as the Command Center grows', g.lv.every((r, i) => !i || (r[1] >= g.lv[i - 1][1] && r[2] >= g.lv[i - 1][2])), JSON.stringify(g.lv));

  // 6. Economy: no upgrade costs more than you can store; steel and oil are not far behind gold.
  const econ = await page.evaluate(() => {
    const over = [], pace = [];
    const cap = H => HQ_STORAGE[H] + LIMITS.depot[H] * statsFor('depot', H).storage;
    for (const t of Object.keys(DEFS)) {
      if (DEFS[t].deco || DEFS[t].decoy || !LIMITS[t]) continue;
      const u = unlockLevel(t);
      for (let L = 1; L <= DEFS[t].max; L++) {
        const H = t === 'hq' ? L - 1 : Math.max(L, u); if (H < 1 || H > MAX_HQ) continue;
        const c = costFor(t, L); if (Math.max(c.gold, c.steel, c.oil) > cap(H)) over.push(`${t} ${L}`);
      }
    }
    for (let H = 2; H <= MAX_HQ; H++) {
      const prod = { gold: 0, steel: 0, oil: 0 }, cost = { gold: 0, steel: 0, oil: 0 };
      for (const [t, k] of [['goldmine', 'gold'], ['steelworks', 'steel'], ['derrick', 'oil']]) prod[k] += LIMITS[t][H] * statsFor(t, H).rate;
      for (const t of Object.keys(LIMITS)) {
        if (DEFS[t].deco || DEFS[t].decoy || (t !== 'hq' && H > DEFS[t].max)) continue;
        const n = t === 'hq' ? 1 : LIMITS[t][H];
        for (let i = 0; i < n; i++) { const c = costFor(t, H); for (const k in cost) cost[k] += c[k] || 0; }
      }
      const gh = cost.gold / prod.gold, sh = cost.steel / prod.steel, oh = prod.oil ? cost.oil / prod.oil : 0;
      pace.push({ H, steel: sh / gh, oil: oh / gh });
    }
    return { over, pace };
  });
  check('no upgrade costs more than the storage you can have', !econ.over.length, econ.over.slice(0, 5).join(', '));
  const worstSteel = Math.max(...econ.pace.map(p => p.steel)), worstOil = Math.max(...econ.pace.map(p => p.oil));
  // before this pass: steel up to 2.4x and oil up to 2.2x (Command Center 3 has 3 mines and only 2 foundries)
  check('steel takes at most 1.9x as long as gold to earn', worstSteel <= 1.9, worstSteel.toFixed(2));
  check('oil takes at most 1.7x as long as gold to earn', worstOil <= 1.7, worstOil.toFixed(2));

  // 7. Campaign: Total War sits between the missions around it instead of jumping past both.
  const camp = await page.evaluate(() => Object.fromEntries(CAMPAIGN.map(m => [m.id, m.level])));
  check('Total War is between Long Guns and Last Stand', camp.m11 > camp.m10 && camp.m11 <= (camp.m10 + camp.m12) / 2 + 2, `m10 ${camp.m10}, m11 ${camp.m11}, m12 ${camp.m12}`);

  // 8. Every building and wall a Command Center may own fits in the build area, at every level.
  const fit = await page.evaluate(() => {
    const out = [];
    let area = 0;
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) if (inBuildArea(x, y)) area++;
    for (let L = 1; L <= MAX_HQ; L++) {
      S = newBase(); S.obstacles = []; S.buildings = S.buildings.filter(b => b.type === 'hq'); S.buildings[0].level = L; rebuildGrid();
      const h = S.buildings[0];
      const types = Object.keys(LIMITS).filter(t => t !== 'hq' && !DEFS[t].deco && !DEFS[t].decoy && LIMITS[t][L] > 0).sort((a, b) => DEFS[b].size - DEFS[a].size);
      let need = 9, missing = 0;
      for (const t of types) for (let i = 0; i < LIMITS[t][L]; i++) {
        const n = DEFS[t].size; need += n * n;
        const sp = nearestFree(t, h.x + 1 - Math.floor(n / 2), h.y + 1 - Math.floor(n / 2));
        if (!sp) { missing++; continue; }
        S.buildings.push({ id: S.nextId++, type: t, x: sp.x, y: sp.y, level: 1, job: null, stored: 0, baseAngle: 0 }); rebuildGrid();
      }
      out.push({ L, need, missing, room: Math.round((1 - need / area) * 100) });
    }
    return { area, out };
  });
  const worst = fit.out.reduce((a, r) => (r.room < a.room ? r : a));
  check('every building and wall fits at every Command Center level', fit.out.every(r => !r.missing), fit.out.filter(r => r.missing).map(r => `HQ${r.L}: ${r.missing} left over`).join(', ') || `${fit.area} tiles`);
  check('a full Command Center 12 base leaves at least 20% of the area free', worst.room >= 20, `HQ${worst.L} needs ${worst.need} of ${fit.area}, ${worst.room}% free`);

  // 9. Saves from the smaller map (and old share codes) move to the middle of the new one.
  const mig = await page.evaluate(() => {
    const old = { v: 1, name: 'Old', gold: 100, steel: 100, nextId: 4, bestWave: 3, saved: Date.now(),
      buildings: [{ id: 1, type: 'hq', x: 16, y: 12, level: 3, job: null, stored: 0 }, { id: 2, type: 'mg', x: 12, y: 15, level: 2, job: null, stored: 0 }, { id: 3, type: 'wall', x: 4, y: 4, level: 1, job: null, stored: 0 }],
      obstacles: [{ id: 1, x: 30, y: 20, kind: 'rock' }], drop: { x: 10, y: 10 }, layouts: [{ name: 'Layout 1', saved: 1, pos: { 1: [16, 12], 2: [12, 15] } }] };
    const s = load(JSON.stringify(old));
    const again = load(JSON.stringify(s)); // migrating twice must not move anything again
    const hqOld = s.buildings.find(b => b.type === 'hq');
    // an old share code: positions from the 36 x 26 map
    S = newBase(); S.obstacles = []; rebuildGrid();
    const oldCode = SHARE_PREFIX + btoa(JSON.stringify({ v: 1, b: S.buildings.map(b => [b.type, b.x - MAP_SHIFT_V1.x, b.y - MAP_SHIFT_V1.y]) }));
    const before = S.buildings.map(b => [b.x, b.y]).join(';');
    const r1 = importLayoutCode(oldCode);
    const after1 = S.buildings.map(b => [b.x, b.y]).join(';');
    const r2 = importLayoutCode(exportLayoutCode());
    const after2 = S.buildings.map(b => [b.x, b.y]).join(';');
    // codes pasted out of a chat: line breaks, invisible characters, quotes and text around them
    const v2old = SHARE_PREFIX + btoa(JSON.stringify({ v: MAP_V, b: S.buildings.map(b => [b.type, b.x, b.y]) }));
    const mess = c => `Here is the code:\n\u200B\u201C${c.replace(/(.{40})/g, '$1\n ')}\u201D\uFEFF thanks`;
    const shuffle = () => { for (const b of S.buildings) if (b.type !== 'hq') { const sp = nearestFree(b.type, 6, 6); if (sp) { b.x = sp.x; b.y = sp.y; rebuildGrid(); } } };
    shuffle(); const r3 = importLayoutCode(mess(v2old)); const after3 = S.buildings.map(b => [b.x, b.y]).join(';');
    const v5 = exportLayoutCode();
    shuffle(); const r4 = importLayoutCode(mess(v5)); const after4 = S.buildings.map(b => [b.x, b.y]).join(';');
    const junk = importLayoutCode('hello there');
    const fresh = newBase(), fh = fresh.buildings.find(b => b.type === 'hq');
    return {
      hq: [hqOld.x, hqOld.y], hqTwice: [again.buildings[0].x, again.buildings[0].y], mapV: s.mapV,
      wallIn: inBuildArea(s.buildings[2].x, s.buildings[2].y), obs: [s.obstacles[0].x, s.obstacles[0].y], drop: [s.drop.x, s.drop.y], layout: s.layouts[0].pos[1],
      codeOld: r1.ok && after1 === before, codeNew: r2.ok && after2 === before,
      messy4: r3.ok && after3 === before, messy5: r4.ok && after4 === before, junk: !junk.ok, len: [v2old.length, v5.length], v5: v5.startsWith('WB5:'),
      freshHq: [fh.x, fh.y], center: [(MAP_W - 3) / 2, (MAP_H - 3) / 2],
    };
  });
  check('an old save is moved to the middle of the new map', mig.hq[0] === 21 && mig.hq[1] === 16 && mig.mapV === 2, `HQ at ${mig.hq}`);
  check('loading a migrated save again does not move it twice', mig.hqTwice.join() === mig.hq.join());
  check('obstacles, the supply crate and saved layouts move with the base', mig.obs.join() === '35,24' && mig.drop.join() === '15,14' && mig.layout.join() === '21,16', `${mig.obs} / ${mig.drop} / ${mig.layout}`);
  check('buildings from an old save stay inside the build area', mig.wallIn);
  check('old share codes land where they did on the old map', mig.codeOld);
  check('new share codes round-trip', mig.codeNew);
  check('new base codes are compact WB5 codes', mig.v5 && mig.len[1] * 2 < mig.len[0], `WB4 ${mig.len[0]} chars, WB5 ${mig.len[1]} chars`);
  check('a WB4 code pasted with line breaks, quotes, invisible characters and text around it still imports', mig.messy4);
  check('a WB5 code pasted the same way still imports', mig.messy5);
  check('text that is not a code is refused', mig.junk);
  check('a new base starts in the middle of the map', Math.abs(mig.freshHq[0] - mig.center[0]) <= 1 && Math.abs(mig.freshHq[1] - mig.center[1]) <= 1, `HQ ${mig.freshHq}, middle ${mig.center}`);

  // 10. Gauntlet: late bases face harder enemies, and base damage carries over between battles.
  const gc = await page.evaluate(() => {
    if (B) { B.over = true; leaveBattle(); } closeModal();
    T.base(12); S.gauntlet = { active: false };
    const m12 = gauntletMission('battle', 0), boss = gauntletMission('boss', 7);
    T.base(5); const m5 = gauntletMission('battle', 0);
    T.base(8); S.gauntlet = { active: false }; startGauntlet();
    const run = gauntlet();
    startBattle(gauntletMission('battle', 0)); B.breakT = 0; battleUpdate(0.01);
    spawnEnemy('rifleman'); const dmgK = B.units[B.units.length - 1].dmgK; B.units = []; B.queue = [];
    const [a, b] = S.buildings.filter(x => x.type === 'goldmine');
    a._hp = a._maxhp * 0.4; b._hp = 0; b._dead = true;
    const h = hq(); h._hp = h._maxhp * 0.8;
    endBattle('victory');
    const rec = { a: run.hp[a.id], b: run.hp[b.id], hq: run.hq, base: gauntletBaseHealth(run) };
    closeModal(); closeModal(); if (B) { B.over = true; leaveBattle(); } closeModal();
    if (run.pick) pickArtifact(run.pick.find(id => id !== 'medics' && id !== 'bunker' && id !== 'glass') || run.pick[0]);
    startBattle(gauntletMission('battle', 1));
    const next = { a: a._hp / a._maxhp, b: b._hp / b._maxhp, bDead: !!b._dead, hq: hq()._hp / hq()._maxhp };
    B.over = true; leaveBattle(); closeModal();
    repairGauntletBase(run, GAUNTLET.campHeal);
    const camp = { a: run.hp[a.id], b: run.hp[b.id], hq: run.hq };
    S.gauntlet = { active: false };
    return { m12: m12.mods, boss: boss.mods, m5: m5.mods, might12: GAUNTLET.might[12], dmgK, might8: GAUNTLET.might[8], rec, next, camp, wreck: GAUNTLET.wreck, heal: GAUNTLET.campHeal };
  });
  const close2 = (x, y) => Math.abs(x - y) < 0.01;
  check('Gauntlet enemies hit harder and last longer at Command Center 12', gc.m12.hits === gc.might12 && gc.m12.armored === gc.might12 && close2(gc.boss.armored, gc.might12 * 1.3), JSON.stringify(gc.m12));
  check('Gauntlet strength is unchanged at its unlock level', !gc.m5.hits && !gc.m5.armored, JSON.stringify(gc.m5));
  check('Gauntlet enemies spawn with the damage multiplier', close2(gc.dmgK, gc.might8), `dmgK ${gc.dmgK}`);
  check('a won Gauntlet battle records damage to every building', close2(gc.rec.a, 0.4) && gc.rec.b === 0 && close2(gc.rec.hq, 0.8), JSON.stringify(gc.rec));
  check('damage carries into the next Gauntlet battle; wrecks come back patched up', close2(gc.next.a, 0.4) && close2(gc.next.b, gc.wreck) && !gc.next.bDead && close2(gc.next.hq, 0.8), JSON.stringify(gc.next));
  check('a Field camp repairs the whole base', close2(gc.camp.a, 0.4 + gc.heal) && close2(gc.camp.b, gc.heal) && close2(gc.camp.hq, Math.min(1, 0.8 + gc.heal)), JSON.stringify(gc.camp));

  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '));
  await browser.close(); srv.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
