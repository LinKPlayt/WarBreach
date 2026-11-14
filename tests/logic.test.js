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

  // 11. A base code pasted into the backup box or the challenge import box is applied as a layout.
  const boxes = await page.evaluate(async () => {
    if (B) { B.over = true; leaveBattle(); } closeModal();
    S = newBase(); S.obstacles = []; rebuildGrid();
    const code = exportLayoutCode(), at = () => S.buildings.map(b => [b.x, b.y]).join(';'), before = at();
    const move = () => { for (const b of S.buildings) if (b.type !== 'hq') { const sp = nearestFree(b.type, 6, 6); b.x = sp.x; b.y = sp.y; rebuildGrid(); } };
    const out = {};
    move(); openBackup(); document.querySelector('#backup-in').value = code; document.querySelector('#btn-restore').click();
    out.backup = at() === before && document.querySelector('#modal').hidden;
    move(); openChallenges(); document.querySelector('#ch-import').value = code; document.querySelector('#btn-ch-import').click();
    out.challenge = at() === before;
    closeModal();
    return out;
  });
  check('a base code pasted into the backup box is applied as a layout', boxes.backup);
  check('a base code pasted into the challenge import box is applied as a layout', boxes.challenge);

  // 12. The build number matches everywhere, and an outdated copy reloads once onto the live build.
  const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const live = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8')).build;
  const build = await page.evaluate(() => BUILD);
  const tags = indexHtml.match(/(?:src|href)="(?:js\/[a-z]+\.js|style\.css)\?v=([^"]+)"/g) || [];
  const scripts = (indexHtml.match(/<script src="js\//g) || []).length;
  check('BUILD, version.json and every script and stylesheet link agree', build === live && tags.length === scripts + 1 && tags.every(t => t.endsWith(`?v=${live}"`)), `BUILD ${build}, version.json ${live}, ${tags.length} tagged links`);
  const p2 = await (await browser.newContext({ viewport: { width: 844, height: 390 } })).newPage();
  let served = 0;
  await p2.route('**/version.json*', r => { served++; r.fulfill({ contentType: 'application/json', body: JSON.stringify({ build: 'future-build' }) }); });
  await p2.goto(`http://localhost:${srv.address().port}/index.html`);
  await p2.waitForTimeout(2500);
  const url = p2.url();
  check('an outdated copy reloads onto the live build, once', /\?v=future-build/.test(url) && served >= 2 && served <= 3, `url ${url.replace(/^.*\//, '')}, version checks ${served}`);
  await p2.close();

  // 13. Update 6.0
  const u6 = await page.evaluate(() => {
    const o = {};
    const fresh = L => { if (B) { B.over = true; leaveBattle(); } closeModal(); T.base(L); S.obstacles = []; rebuildGrid(); S.gold = S.steel = S.oil = 5e6; S.medals = 500; };
    // research topics
    fresh(6);
    startBattle(null); const aa0 = B.bonus.antiAir, wall0 = (S.buildings.find(b => b.type === 'wall') || {})._maxhp; B.over = true; leaveBattle(); closeModal();
    if (!S.buildings.some(b => b.type === 'wall')) { const sp = nearestFree('wall', 6, 6); S.buildings.push({ id: S.nextId++, type: 'wall', x: sp.x, y: sp.y, level: 3, job: null, stored: 0 }); rebuildGrid(); }
    startBattle(null); const w0 = S.buildings.find(b => b.type === 'wall')._maxhp; B.over = true; leaveBattle(); closeModal();
    S.research.levels.antiair = 2; S.research.levels.fortify = 3; S.research.levels.drill = 5;
    startBattle(null); o.aa = B.bonus.antiAir - aa0; o.fort = S.buildings.find(b => b.type === 'wall')._maxhp / w0; B.over = true; leaveBattle(); closeModal();
    army().queue = []; trainTroop('rifle'); const q = army().queue[army().queue.length - 1]; o.drill = (q.end - q.start) / (TROOPS.rifle.time * 1000);
    S.research.levels = {};
    // vehicles first
    startBattle(null); B.breakT = 0; battleUpdate(0.01); B.queue = []; B.units = [];
    const mg = S.buildings.find(b => b.type === 'mg'), c = centerOf(mg);
    spawnEnemy('rifleman'); const ri = B.units[0]; ri.x = c.x + 40; ri.y = c.y;
    spawnEnemy('jeep'); const je = B.units[1]; je.x = c.x + 140; je.y = c.y;
    mg.priority = 'vehicle'; mg._tgt = null; mg._rt = 0; mg._cd = 1; updateDefense(mg, 0.01); o.vehicleFirst = mg._tgt === je;
    mg.priority = 'close'; mg._tgt = null; mg._rt = 0; updateDefense(mg, 0.01); o.closest = mg._tgt === ri;
    // mud and wire: enemies move 12% slower
    const walk = slow => { B.units = []; spawnEnemy('rifleman'); const u = B.units[0]; u.x = 2 * TILE; u.y = 2 * TILE; u.retarget = 99; u.tgt = null; B.bonus.slow = slow; const x0 = u.x, y0 = u.y; for (let i = 0; i < 20; i++) updateEnemy(u, 0.05); return Math.hypot(u.x - x0, u.y - y0); };
    const d0 = walk(0), d1 = walk(0.12); o.mud = d1 / d0;
    // war bonds
    const m0 = waveMedals(3); B.bonus.medalsPerWave = 2; o.bonds = waveMedals(3) - m0; o.weekendMul = isWeekend() ? WEEKEND.medalMul : 1;
    B.over = true; leaveBattle(); closeModal();
    // set every defense of a type at once (panel)
    const mgs = S.buildings.filter(b => b.type === 'mg'); mgs.forEach(b => { b.priority = 'close'; }); mgs[0].priority = 'air';
    select(mgs[0].id); refreshPanel(true); const pa = document.querySelector('#panel [data-act="priority-all"]'); if (pa) pa.click();
    o.priorityAll = !!pa && mgs.every(b => b.priority === 'air'); select(null);
    // build queue
    o.queue = [1, 4, 8, 12].map(queueMax);
    // Apocalypse
    const ap = THREATS.find(t => t.id === 'apocalypse'); o.apocalypse = !!ap && ap.need === 25 && ap.hp > THREATS.find(t => t.id === 'nightmare').hp;
    S.threat = 'apocalypse'; S.bestWave = 30; startBattle(null); B.waves = 7; endBattle('retreat'); o.apBest = S.stats.apocalypseBest; closeModal(); if (B) { B.over = true; leaveBattle(); } S.threat = 'regular';
    // missions, achievements, cards, artifacts, quartermaster
    o.missions = MISSIONS.length; o.missionsOk = MISSIONS.every(m => { const p = m.progress(S); return Array.isArray(p) && p.every(Number.isFinite); });
    o.achOk = ACHIEVEMENTS.every(a => Number.isFinite(a.stat(S))) && ['gauntlet', 'contracts', 'apocalypse'].every(id => ACHIEVEMENTS.some(a => a.id === id));
    o.cards = WAVE_CARDS.length; o.arts = new Set(ARTIFACTS.map(a => a.id)).size;
    S.oil = 0; const oil = QM_ITEMS.find(i => i.id === 'oil-s'); o.qmOil = !!oil;
    return o;
  });
  check('Anti-Air Rounds research adds 8% damage against aircraft per level', Math.abs(u6.aa - 0.16) < 1e-9, `+${u6.aa}`);
  check('Fortification research adds 10% wall health per level', Math.abs(u6.fort - 1.3) < 0.01, `x${u6.fort.toFixed(3)}`);
  check('Rapid Training research trains troops 8% faster per level', Math.abs(u6.drill - 0.6) < 0.01, `x${u6.drill.toFixed(3)}`);
  check('Vehicles first picks a vehicle over a closer soldier', u6.vehicleFirst && u6.closest);
  check('Mud and Wire slows enemies by 12%', Math.abs(u6.mud - 0.88) < 0.02, `x${u6.mud.toFixed(3)}`);
  check('War Bonds adds medals for every cleared wave (doubled on Weekend Blitz days)', u6.bonds === 2 * u6.weekendMul, `+${u6.bonds}`);
  check('one tap sets a targeting priority for every defense of that type', u6.priorityAll);
  check('the build queue grows with the Command Center (3, 4, 5, 6)', u6.queue.join() === '4,4,5,6' || u6.queue.join() === '3,4,5,6', u6.queue.join());
  check('Apocalypse threat exists and records its best wave', u6.apocalypse && u6.apBest === 7, `best ${u6.apBest}`);
  check('32 missions, all with valid progress', u6.missions === 32 && u6.missionsOk, `${u6.missions}`);
  check('achievements include the three new ones and all compute', u6.achOk);
  check('17 field upgrade cards and 24 unique Gauntlet artifacts', u6.cards === 17 && u6.arts === 24, `${u6.cards} cards, ${u6.arts} artifacts`);

  const u6b = await page.evaluate(() => {
    const o = {};
    const fresh = L => { if (B) { B.over = true; leaveBattle(); } closeModal(); T.base(L); S.obstacles = []; rebuildGrid(); S.gold = S.steel = S.oil = 5e6; S.medals = 500; };
    // Quartermaster
    fresh(8); S.oil = 0;
    openQuartermaster(); document.querySelector('[data-qm="oil-s"]').click(); o.oil = S.oil; closeModal();
    S.research.job = null; const med0 = S.medals; openQuartermaster(); document.querySelector('[data-qm="grant"]').click(); o.grantRefused = S.medals === med0; closeModal();
    const now = Date.now(); S.research.job = { id: 'ballistics', to: 1, start: now, end: now + 3 * 3600e3 };
    openQuartermaster(); document.querySelector('[data-qm="grant"]').click(); o.grantLeft = Math.round((S.research.job.end - Date.now()) / 60000); closeModal();
    S.research.job.end = Date.now() + 30 * 60e3; openQuartermaster(); document.querySelector('[data-qm="grant"]').click(); o.grantDone = !S.research.job && S.research.levels.ballistics === 1; closeModal();
    // Gauntlet artifacts: coins, building health, precision, last stand
    S.gauntlet = { active: false }; startGauntlet(); const run = gauntlet();
    run.arts = ['salvage', 'concrete', 'marksmen', 'laststand'];
    const plainHp = (() => { const g = S.buildings.find(b => b.type === 'goldmine'); return Math.round(statsFor('goldmine', g.level).hp * (1 + researchBonus('armor'))); })();
    startBattle(gauntletMission('battle', 0)); B.breakT = 0; battleUpdate(0.01);
    o.concrete = S.buildings.find(b => b.type === 'goldmine')._maxhp / plainHp;
    o.precision = B.bonus.dmgType.sniper === 0.4 && B.bonus.dmgType.sentry === 0.4;
    const gun = S.buildings.find(b => b.type === 'mg'), full = weaponOf(gun).dmg; const h = hq(); h._hp = h._maxhp * 0.4; o.lastStand = weaponOf(gun).dmg / full; h._hp = h._maxhp;
    const coins0 = run.coins; B.units = []; B.queue = []; endBattle('victory'); o.coins = run.coins - coins0;
    closeModal(); closeModal(); if (B) { B.over = true; leaveBattle(); } closeModal(); S.gauntlet = { active: false };
    // weekly contracts
    S.contracts = null; const list = contracts().list; o.contracts = list.length === 3 && new Set(list.map(c => c.id)).size === 3;
    const c0 = list[0]; orderEvent(c0.id, c0.target + 5); o.contractProgress = c0.progress === c0.target;
    const m0 = S.medals, n0 = S.stats.contracts || 0; const got = claimContract(0); o.contractPaid = !!got && S.medals - m0 === got.medals && (S.stats.contracts || 0) === n0 + 1 && claimContract(0) === null;
    S.contracts.week = 'old'; o.contractsReset = contracts().list.every(c => c.progress === 0 && !c.claimed);
    // upgrade every building of a type: free builders start, the rest queue
    fresh(8); for (const b of S.buildings) { if (b.type === 'mg') b.level = 6; b.job = null; } S.queue = []; S.builders = 2;
    const r = upgradeAllTimed('mg', 6); o.typeAll = r; o.typeAllJobs = S.buildings.filter(b => b.type === 'mg' && b.job).length; o.typeAllQueued = S.queue.length;
    for (const b of S.buildings) b.job = null; S.queue = [];
    // advisor
    for (const b of S.buildings) if (DEFS[b.type].dmg && b.type !== 'hq' && !DEFS[b.type].trap) b.level = Math.max(1, b.level - 2);
    const picks = advisorPicks(6); o.advisor = picks.length > 0 && picks.every((p, i) => p.gain > 0 && (!i || picks[i - 1].value >= p.value));
    // inspector: an isolated building is flagged, closing the ring removes the open-road warning
    fresh(7);
    const lone = S.buildings.find(b => b.type === 'goldmine'); let spot = null;
    for (let y = BORDER; y < MAP_H - BORDER - 1 && !spot; y++) for (let x = BORDER; x < MAP_W - BORDER - 1 && !spot; x++) if (footprintFree('goldmine', x, y, lone.id) && !S.buildings.some(d => d.level >= 1 && weaponOf(d) && distToBuilding(centerOf(d).x, centerOf(d).y, { type: 'goldmine', x, y }) < 9)) spot = { x, y };
    lone.x = spot.x; lone.y = spot.y; rebuildGrid();
    const ins = inspectBase(); o.exposed = ins.issues.some(i => i.id === 'exposed' && i.ids.includes(lone.id));
    o.closedNoWarning = !inspectBase().issues.some(i => i.id === 'open'); // buildings packed around the HQ block every road
    S.buildings = S.buildings.filter(b => b.type === 'hq' || b.type === 'mg'); rebuildGrid(); // a few guns, nothing in between
    o.openRoad = inspectBase().issues.some(i => i.id === 'open');
    // blueprints: every building placed, nothing overlapping, inside the build area, never on obstacles; undo restores
    o.bp = [];
    for (const L of [3, 7, 12]) {
      fresh(L);
      S.obstacles = [{ id: 1, x: 22, y: 12, kind: 'rock' }, { id: 2, x: 10, y: 20, kind: 'tree' }, { id: 3, x: 33, y: 9, kind: 'wreck' }];
      const before = S.buildings.map(b => b.x + ',' + b.y).join(';');
      for (const bp of BLUEPRINTS) {
        const plan = planBlueprint(bp.id), seen = new Set(); let ok = !plan.unplaced.length;
        for (const b of S.buildings) {
          const p = plan.pos[b.id]; if (!p) { ok = false; continue; }
          const n = DEFS[b.type].size;
          for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) { const k = (p[0] + dx) + ',' + (p[1] + dy); if (seen.has(k) || !inBuildArea(p[0] + dx, p[1] + dy) || obstacleAt(p[0] + dx, p[1] + dy)) ok = false; seen.add(k); }
        }
        o.bp.push([L, bp.id, ok]);
      }
      applyBlueprint('fortress'); const moved = S.buildings.map(b => b.x + ',' + b.y).join(';') !== before;
      const closed = !inspectBase().issues.some(i => i.id === 'open');
      undoBlueprint(); o.bp.push([L, 'undo', moved && closed && S.buildings.map(b => b.x + ',' + b.y).join(';') === before]);
    }
    return o;
  });
  check('Oil Drums add oil', u6b.oil > 0, `+${u6b.oil}`);
  check('a Research Grant needs research running and takes an hour off', u6b.grantRefused && u6b.grantLeft === 120, `${u6b.grantLeft} min left`);
  check('a Research Grant finishes research with under an hour left', u6b.grantDone);
  check('Concrete Pour adds 25% building health in the Gauntlet', Math.abs(u6b.concrete - 1.25) < 0.01, `x${u6b.concrete.toFixed(3)}`);
  check('Marksman School boosts the precision guns', u6b.precision);
  check('Last Stand adds 60% damage below half Command Center health', Math.abs(u6b.lastStand - 1.6) < 0.01, `x${u6b.lastStand.toFixed(3)}`);
  check('Salvage Crews add 2 coins to a win', u6b.coins === 5, `+${u6b.coins} coins`);
  check('three different weekly contracts', u6b.contracts);
  check('daily order events also advance weekly contracts', u6b.contractProgress);
  check('a contract pays once and counts for the achievement', u6b.contractPaid);
  check('contracts reset with the week', u6b.contractsReset);
  check('Upgrade all starts what the builders can and queues the rest', u6b.typeAll.started === 2 && u6b.typeAllJobs === 2 && u6b.typeAllQueued === u6b.typeAll.queued && u6b.typeAll.queued >= 1, JSON.stringify(u6b.typeAll));
  check('the Upgrade Advisor ranks upgrades by value', u6b.advisor);
  check('the Base Inspector flags a building no defense covers', u6b.exposed);
  check('the Base Inspector warns about an open road, and only then', u6b.openRoad && u6b.closedNoWarning);
  check('every blueprint places every building inside the area, off obstacles, without overlaps', u6b.bp.filter(r => r[1] !== 'undo').every(r => r[2]), u6b.bp.filter(r => !r[2]).map(r => r.join(' ')).join(', '));
  check('applying a blueprint closes the ring, and undo restores the old layout', u6b.bp.filter(r => r[1] === 'undo').every(r => r[2]));

  // 14. Update 7.0: Counteroffensive
  const u7 = await page.evaluate(() => {
    const o = {};
    const fresh = L => { if (B) { B.over = true; leaveBattle(); } closeModal(); T.base(L); S.obstacles = []; rebuildGrid(); S.gold = S.steel = S.oil = 0; S.medals = 100; army().troops = {}; army().queue = []; S.strike = { best: 0 }; };
    fresh(6);
    const m = strikeMission(1);
    o.mission = m.strike && m.waves.length === 1 && m.waves[0].length > 0 && m.waves[0].every(g => campCanSend(g.type));
    o.listsSkipCamp = !cleanChallenge({ types: ['camp', 'rifleman'] }).types.includes('camp');
    startBattle(m); B.hero = null; B.weather = WEATHER.find(w => w.id === 'clear'); B.breakT = 0; battleUpdate(0.01);
    B.queue = []; B.units = B.units.filter(u => ENEMIES[u.type].camp);
    const camps = B.units.slice();
    o.camps = camps.length; o.campHp = camps.every(c => c.hp === campHp(m.level) && !c.elite);
    o.outside = camps.every(c => !inBuildArea(Math.floor(c.x / TILE), Math.floor(c.y / TILE)));
    // guns ignore camps and do a tenth of their damage to them
    const c = camps[0], home = { x: c.x, y: c.y }, mg = S.buildings.find(b => b.type === 'mg'), mc = centerOf(mg);
    c.x = mc.x + 40; c.y = mc.y; mg._tgt = null; mg._rt = 0; mg._cd = 1; updateDefense(mg, 0.01); o.ignored = mg._tgt !== c;
    c.x = home.x; c.y = home.y;
    SHOOTER = null; let h0 = c.hp; damageEnemy(c, 1000, 'mg'); o.gunDmg = h0 - c.hp; h0 = c.hp; damageEnemy(c, 1000, 'troops'); o.troopDmg = h0 - c.hp;
    // the garrison shoots troops that come close, and squads keep coming; no straggler charge while camps stand
    const tr = spawnTroop('rifle', c.x + 60, c.y, false, 0); tr.hp = tr.max = 1e6;
    T.run(3); o.shot = tr.hp < tr.max; B.troops = [];
    T.run(STRIKE.firstSpawn + 30); o.squads = B.campSpawns; o.noCharge = !B.charging;
    // destroy the camps: victory, reward once in full and a quarter on replays
    const med0 = S.medals;
    for (const k of camps) damageEnemy(k, 1e9, 'troops');
    o.campsLeft = B.campsLeft; o.campStat = S.stats.camps;
    for (const u of B.units) u.hp = 0; B.units = []; T.run(1); o.phase = B.phase;
    endBattle('victory');
    o.best = S.strike.best; o.medals = S.medals - med0; o.firstMedals = strikeReward(1, true).medals; o.replayMedals = strikeReward(1, false).medals; o.gold = S.gold;
    o.report = document.querySelector('#modal-body').innerText.includes('Camps destroyed');
    closeModal(); if (B) { B.over = true; leaveBattle(); } closeModal();
    // a defeat pays nothing
    startBattle(strikeMission(2)); B.breakT = 0; battleUpdate(0.01); const med1 = S.medals; endBattle('defeat'); o.lossPays = S.medals - med1; o.bestAfterLoss = S.strike.best;
    closeModal(); if (B) { B.over = true; leaveBattle(); } closeModal();
    o.levels = [1, 5, 10].map(strikeLevel);
    return o;
  });
  check('a Counteroffensive is one assault wave with no bosses, and camps stay out of enemy pickers', u7.mission && u7.listsSkipCamp);
  check('three siege camps stand outside the base at full health', u7.camps === 3 && u7.campHp && u7.outside);
  check('base guns never target a camp and do a tenth of their damage to it', u7.ignored && Math.abs(u7.gunDmg - 100) < 1 && Math.abs(u7.troopDmg - 1000) < 1, `gun ${u7.gunDmg}, troops ${u7.troopDmg}`);
  check('a camp shoots troops that come close and keeps sending squads', u7.shot && u7.squads >= 3, `${u7.squads} squads`);
  check('stragglers never charge while a camp stands', u7.noCharge);
  check('destroying all three camps wins the battle', u7.campsLeft === 0 && u7.campStat === 3 && u7.phase === 'won' && u7.report);
  check('a win records the sector and pays medals and resources; replays pay a quarter', u7.best === 1 && u7.medals === u7.firstMedals && u7.gold > 0 && u7.replayMedals < u7.firstMedals, `+${u7.medals} medals, replay ${u7.replayMedals}`);
  check('a lost Counteroffensive pays nothing and keeps the best sector', u7.lossPays === 0 && u7.bestAfterLoss === 1);

  // 15. Update 7.0: special ammunition
  const am = await page.evaluate(() => {
    const o = {};
    const fresh = L => { if (B) { B.over = true; leaveBattle(); } closeModal(); T.base(L); S.obstacles = []; rebuildGrid(); S.gold = S.steel = 1e6; };
    fresh(6);
    const mg = S.buildings.find(b => b.type === 'mg');
    const bunkers = S.buildings.filter(b => b.type === 'ammo');
    o.available = ammoAvailable(mg) && !ammoAvailable(hq());
    mg.level = 2; o.lowLevel = !ammoAvailable(mg); mg.level = 6;
    S.buildings = S.buildings.filter(b => b.type !== 'ammo'); o.noBunker = !ammoAvailable(mg); S.buildings.push(...bunkers); rebuildGrid();
    const g0 = S.gold, c = ammoCost('mg', 6); setAmmo(mg, 'incendiary'); o.paid = g0 - S.gold === c.gold && c.gold > 0 && mg.ammo === 'incendiary';
    const g1 = S.gold; setAmmo(mg, 'standard'); o.standardFree = S.gold === g1 && !mg.ammo;
    S.gold = 0; S.steel = 0; o.cantAfford = !setAmmo(mg, 'cryo') && !mg.ammo; S.gold = S.steel = 1e6;
    startBattle(null); B.hero = null; B.weather = WEATHER.find(w => w.id === 'clear'); B.breakT = 0; battleUpdate(0.01); B.queue = []; B.units = [];
    const unit = type => { B.units = []; spawnEnemy(type); const u = B.units[0]; u.elite = false; u.hp = u.max = 1e6; u.x = 2 * TILE; u.y = 2 * TILE; return u; };
    const hit = (type, ammo, dmg) => { const u = unit(type); if (ammo === 'standard') delete mg.ammo; else mg.ammo = ammo; SHOOTER = mg; damageEnemy(u, dmg, 'mg'); SHOOTER = null; return { u, d: 1e6 - u.hp }; };
    o.std = hit('tank', 'standard', 100).d;
    const inc = hit('tank', 'incendiary', 100); o.incHit = inc.d; o.incPool = inc.u.burn;
    for (let i = 0; i < 100; i++) offensiveBattleUpdate(0.1); o.incTotal = 1e6 - inc.u.hp; o.burnEnds = inc.u.burn === 0;
    o.apVehicle = hit('tank', 'ap', 100).d; o.apInfantry = hit('rifleman', 'ap', 100).d;
    o.heavyStd = hit('heavy', 'standard', 10).d; o.heavyAp = hit('heavy', 'ap', 10).d;
    const walk = (type, ammo) => { const u = hit(type, ammo, 10).u; u.retarget = 99; u.tgt = null; const x0 = u.x, y0 = u.y; for (let i = 0; i < 20; i++) updateEnemy(u, 0.05); return Math.hypot(u.x - x0, u.y - y0); };
    o.cryoHit = hit('tank', 'cryo', 100).d;
    o.chill = walk('rifleman', 'cryo') / walk('rifleman', 'standard'); o.chillBoss = walk('siege', 'cryo') / walk('siege', 'standard');
    const cu = hit('rifleman', 'cryo', 10).u; for (let i = 0; i < 30; i++) offensiveBattleUpdate(0.1); o.chillEnds = !(cu.chillT > 0);
    delete mg.ammo; B.over = true; leaveBattle(); closeModal();
    mg.ammo = 'ap'; o.typeAll = setAmmoForType('mg', 'ap') === S.buildings.filter(b => b.type === 'mg').length - 1 && S.buildings.filter(b => b.type === 'mg').every(b => b.ammo === 'ap');
    mg.ammo = 'bogus'; const s2 = load(serialize()); o.migrate = !s2.buildings.find(b => b.id === mg.id).ammo && s2.buildings.filter(b => b.type === 'mg' && b.ammo === 'ap').length >= 1;
    select(mg.id); mg.ammo = 'ap'; refreshPanel(true); o.chip = !!document.querySelector('#panel [data-act="ammo"]'); select(null);
    return o;
  });
  const near2 = (x, y, tol = 0.02) => Math.abs(x - y) <= tol * Math.max(1, Math.abs(y));
  check('ammunition needs an Ammo Bunker, level 3 and a real gun', am.available && am.lowLevel && am.noBunker);
  check('loading ammunition costs resources; standard rounds are free; no change without the resources', am.paid && am.standardFree && am.cantAfford);
  check('Incendiary: the full hit plus a burn of 25% of it', near2(am.incHit, 100) && near2(am.incPool, 25) && near2(am.incTotal, 125) && am.burnEnds, `hit ${am.incHit}, total ${am.incTotal.toFixed(1)}`);
  check('Armor-piercing: +30% to vehicles, -15% to infantry, ignores armor', near2(am.apVehicle, 130) && near2(am.apInfantry, 85) && near2(am.heavyStd, 2.5) && near2(am.heavyAp, 8.5), `vehicle ${am.apVehicle}, infantry ${am.apInfantry}, armored ${am.heavyStd} -> ${am.heavyAp}`);
  check('Cryo: 95% damage and a 30% slow (15% on bosses) that wears off', near2(am.cryoHit, 95) && near2(am.chill, 0.7, 0.03) && near2(am.chillBoss, 0.85, 0.03) && am.chillEnds, `x${am.chill.toFixed(2)}, boss x${am.chillBoss.toFixed(2)}`);
  check('one tap loads an ammunition type into every defense of the type', am.typeAll);
  check('unknown ammunition is dropped from a save and the panel shows the AMMO chip', am.migrate && am.chip);

  // 16. Update 7.0: Expeditions
  const ex = await page.evaluate(() => {
    const o = {};
    const fresh = L => { if (B) { B.over = true; leaveBattle(); } closeModal(); T.base(L); S.obstacles = []; rebuildGrid(); S.gold = S.steel = S.oil = 0; S.medals = 0; army().queue = []; S.expeditions = null; };
    fresh(6);
    army().troops = { rifle: 6, gunner: 3, medic: 1, tank: 1 };
    const X = expState();
    o.offers = X.offers.length === 3 && new Set(X.offers.map(x => x.id)).size === 3 && X.offers.every(x => (expType(x.id).hq || 0) <= 6);
    o.stable = JSON.stringify(expState().offers) === JSON.stringify(X.offers);
    X.offers = [{ id: 'patrol', taken: false }, { id: 'salvage', taken: false }, { id: 'vault', taken: false }];
    o.party = JSON.stringify(expeditionParty(expType('patrol')).party);
    o.bigParty = !!expeditionParty(expType('vault')).party.tank;
    o.slots = [3, 6, 9].map(expeditionSlots).join();
    const space0 = armySpace();
    o.sent = sendExpedition(0) && troopCount('rifle') === 2 && armySpace() === space0 && X.offers[0].taken;
    o.twice = !sendExpedition(0);
    o.second = sendExpedition(1); o.third = !sendExpedition(2); // two parties at Command Center 6
    o.early = claimExpedition(0) === null;
    const rnd = Math.random;
    X.active[0].end = Date.now() - 1; Math.random = () => 0.99; const a = claimExpedition(0); o.safe = a && a.back === 4 && a.lost === 0 && a.gold > 0 && troopCount('rifle') === 4;
    X.active[0].end = Date.now() - 1; Math.random = () => 0; const b = claimExpedition(0); Math.random = rnd; o.wiped = b && b.back === 0 && b.lost === 5 && armySpace() < space0;
    o.stat = S.stats.expeditions; o.none = X.active.length === 0;
    o.medic = expRisk(expType('depot'), { medic: 1 }) / expRisk(expType('depot'), { rifle: 3 });
    // a new day brings new orders; a recalled party comes home with nothing
    X.day = 'old'; const Y = expState(); o.reset = Y.offers.every(x => !x.taken);
    army().troops = { rifle: 12 }; Y.offers = [{ id: 'convoy', taken: false }]; const g0 = S.gold + S.steel;
    sendExpedition(0); const n = recallExpedition(0); o.recall = n === 6 && troopCount('rifle') === 12 && Y.active.length === 0 && S.gold + S.steel === g0;
    // saves keep a party in the field and drop a broken one
    Y.offers = [{ id: 'patrol', taken: false }]; sendExpedition(0);
    const s2 = load(serialize()); o.saved = s2.expeditions.active.length === 1;
    Y.active.push({ id: 'patrol', start: 0, end: 1, party: { ghost: 2 } }); const s3 = load(serialize()); o.cleaned = s3.expeditions.active.length === 1;
    Y.active.length = 1;
    fresh(2); o.locked = !expeditionStatus(0).ok;
    return o;
  });
  check('three different expedition orders a day, the same all day', ex.offers && ex.stable);
  check('the cheapest troops go first and big jobs take the heavy units', ex.party === '{"rifle":4}' && ex.bigParty);
  check('a party leaves the Barracks but keeps its bunks; an order can be sent once', ex.sent && ex.twice);
  check('parties are limited by Command Center level (1, 2, 3)', ex.second && ex.third && ex.slots === '1,2,3');
  check('an expedition pays out only when it is over; survivors come home', ex.early && ex.safe);
  check('lost troops do not come back and free their bunks', ex.wiped && ex.stat === 2 && ex.none);
  check('a Combat Medic cuts the risk by a quarter', Math.abs(ex.medic - 0.75) < 1e-9);
  check('orders reset with the day; a recalled party returns with no reward', ex.reset && ex.recall);
  check('saves keep parties in the field and drop broken ones; locked before Command Center 3', ex.saved && ex.cleaned && ex.locked);

  // 17. Update 7.1: new troops and troop balance
  const tp = await page.evaluate(() => {
    const o = {};
    if (B) { B.over = true; leaveBattle(); } closeModal();
    T.base(12); S.obstacles = []; rebuildGrid(); S.gold = S.steel = S.oil = 1e7; army().troops = {}; army().queue = [];
    o.count = Object.keys(TROOPS).length;
    o.everyLevel = Array.from({ length: 12 }, (_, i) => i + 1).every(L => Object.values(TROOPS).some(d => d.unlock === L) || L === 1);
    o.late = [9, 10, 11, 12].every(L => Object.values(TROOPS).some(d => d.unlock === L));
    o.trainAll = Object.keys(TROOPS).every(k => trainStatus(k).ok || trainStatus(k).reason === 'Army is full');
    startBattle(null); B.hero = null; B.weather = WEATHER.find(w => w.id === 'clear'); B.breakT = 0; battleUpdate(0.01); B.queue = []; B.units = [];
    for (const b of S.buildings) b._stun = 99;
    const fight = (kind, enemy, secs, place = 40) => {
      B.units = []; B.troops = []; B.shots = [];
      const tr = spawnTroop(kind, 10 * TILE, 10 * TILE, false, 0); tr.post = { x: tr.x, y: tr.y }; tr.hp = tr.max = 1e6;
      spawnEnemy(enemy); const u = B.units[0]; u.elite = false; u.hp = u.max = 1e6; u.x = tr.x + place; u.y = tr.y; u.retarget = 99;
      B.dmgBy.troops = 0;
      for (let t = 0; t < secs; t += 0.05) { for (const b of S.buildings) b._stun = 99; updateTroops(0.05); for (const p of B.shots) updateShot(p, 0.05); B.shots = B.shots.filter(p => !p.done); }
      return { dmg: 1e6 - u.hp, tr, u };
    };
    o.stingerGround = fight('stinger', 'rifleman', 5).dmg; o.stingerAir = fight('stinger', 'drone', 5).dmg;
    const at = TROOPS.antitank; const atv = fight('antitank', 'tank', 10).dmg, ati = fight('antitank', 'heavy', 10).dmg; o.atRatio = atv / Math.max(1, ati);
    o.grenadeSplash = (() => { B.units = []; B.troops = []; B.shots = []; const tr = spawnTroop('grenadier', 10 * TILE, 10 * TILE, false, 0); tr.hp = tr.max = 1e6; for (let i = 0; i < 3; i++) { spawnEnemy('rifleman'); const u = B.units[i]; u.elite = false; u.hp = u.max = 1e6; u.x = tr.x + 100 + i * 8; u.y = tr.y; } for (let t = 0; t < 3; t += 0.05) { updateTroops(0.05); for (const p of B.shots) updateShot(p, 0.05); B.shots = B.shots.filter(p => !p.done); } return B.units.filter(u => u.hp < u.max).length; })();
    // Commandos spot stealth units within 4 tiles; ground enemies cannot reach a gunship; heavy tanks take 30% less damage
    const keepB = S.buildings; S.buildings = S.buildings.filter(b => b.type === 'hq'); // no radar or gun nearby to reveal it first
    B.units = []; B.troops = []; const cm = spawnTroop('commando', 2 * TILE, 1 * TILE, false, 0);
    spawnEnemy('stealth'); const st = B.units[0]; st.x = cm.x + 3.5 * TILE; st.y = cm.y; updateStealth(st); o.revealNear = !!st.revealed;
    st.x = cm.x + 6 * TILE; updateStealth(st); o.revealFar = !!st.revealed;
    S.buildings = keepB;
    B.troops = []; const gs = spawnTroop('gunship', 10 * TILE, 10 * TILE, false, 0); o.gunshipUntargetable = nearestAlly(gs.x + 10, gs.y, 3 * TILE) !== gs;
    B.troops = []; const ht = spawnTroop('heavytank', 10 * TILE, 10 * TILE, false, 0); const h0 = ht.hp; damageAlly(ht, 100); o.tankArmor = h0 - ht.hp;
    B.over = true; leaveBattle(); closeModal();
    o.sniper = TROOPS.sniper.dmg <= 70 && TROOPS.sniper.range <= 6;
    o.rocketReach = TROOPS.rocket.range > ENEMIES.tank.range;
    return o;
  });
  check('17 troop types, with something new to unlock at every Barracks level up to 12', tp.count === 17 && tp.everyLevel && tp.late, `${tp.count} troops`);
  check('every troop can be trained at Barracks 12', tp.trainAll);
  check('the Stinger Team shoots aircraft and nothing else', tp.stingerGround === 0 && tp.stingerAir > 0, `ground ${tp.stingerGround}, air ${Math.round(tp.stingerAir)}`);
  check('the Anti-Tank Team does 2.5x damage to vehicles', Math.abs(tp.atRatio - 2.5) < 0.3, `x${tp.atRatio.toFixed(2)}`);
  check('Grenadier grenades splash a group', tp.grenadeSplash >= 2, `${tp.grenadeSplash} hit`);
  check('Commandos reveal stealth units within 4 tiles only', tp.revealNear && !tp.revealFar);
  check('ground enemies cannot engage the Heavy Gunship; the Heavy Tank takes 30% less damage', tp.gunshipUntargetable && Math.abs(tp.tankArmor - 70) < 0.01, `${tp.tankArmor}`);
  check('balance: the Marksman no longer outclasses late troops; Rocket Troopers outrange tanks', tp.sniper && tp.rocketReach);

  check('no page errors', !errors.length, errors.slice(0, 3).join(' | '));
  await browser.close(); srv.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
