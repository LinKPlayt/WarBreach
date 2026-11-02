// WarBreach — Update 3.0 "Storm Front", battle side: new enemies and their art, Repair Bay,
// Shield Generator, Missile Silo, flares, supply drops, focus fire, minimap, pause menu,
// doctrines, War Games and the richer after-action report.
'use strict';

const BULLET_SRC = new Set(['mg', 'hq', 'watchtower', 'sniper', 'troops', 'hero', 'guardpost']);

/* ================= Doctrines and War Games ================= */
function doctrineUnlocked() { return hqLevel() >= DOCTRINE_HQ; }
function doctrine() { return (doctrineUnlocked() && DOCTRINES.find(d => d.id === S.doctrine)) || DOCTRINES[0]; }
function activeWargames() { return (S.wargames || []).filter(id => WARGAMES.some(w => w.id === id)).slice(0, WARGAMES_MAX); }
function wargamesLoot() { return activeWargames().reduce((a, id) => a + WARGAMES.find(w => w.id === id).loot, 0); }

/* ================= Battle lifecycle hooks ================= */
function stormBattleStart() {
  Object.assign(B, {
    focus: null, focusT: 0, crates: [], crateT: 30 + Math.random() * 15, flares: [], transports: [], paraDrops: [],
    repairDrones: [], missiles: [], siloCharge: 0, dmgByB: {}, killsBy: {}, bestHit: 0, wg: [], nukeFlash: 0, cmdT: 0,
  });
  B.speed = [1, 2, 3].includes(S.settings.speed) ? S.settings.speed : 1;
  const doc = B.practice ? DOCTRINES[0] : doctrine();
  B.doctrine = doc;
  const m = doc.mods;
  if (m.troopDmg) B.bonus.troops += m.troopDmg;
  if (m.cd) B.bonus.cd *= m.cd;
  if (m.antiAir) B.bonus.antiAir += m.antiAir;
  if (m.rate) B.bonus.rate += m.rate;
  B.bonus.splash = (B.bonus.splash || 0) + (m.splash || 0);
  B.troopSpeed = 1 + (m.troopSpeed || 0);
  if (!B.mission) {
    B.wg = activeWargames();
    for (const id of B.wg) {
      if (id === 'fast') B.mods.fast = 1.35;
      if (id === 'armored') B.mods.armored = 1.5;
      if (id === 'noair') B.mods.noAirstrike = true;
      if (id === 'norepair') B.mods.noRepair = true;
      if (id === 'darkness') B.daytime = DAYTIME.find(d => d.id === 'night');
    }
    B.lootMul = B.practice ? 0 : B.threat.loot * B.daytime.loot * (1 + wargamesLoot());
  }
  const hpK = 1 + (m.bldHp || 0);
  for (const b of S.buildings) {
    let k = hpK;
    if (B.wg.includes('glass') && (b.type === 'wall' || b.type === 'gate')) k *= 0.5;
    if (k !== 1) { b._maxhp = Math.max(1, Math.round(b._maxhp * k)); b._hp = b._maxhp; }
    b._stun = 0; b._shBy = null; b._shGen = null;
    if (b.type === 'shieldgen' && b.level >= 1) { b._shMax = shieldHp(b.level); b._sh = b._shMax; b._shT = 0; b._shHit = 0; }
  }
  // which dome protects each building
  const gens = S.buildings.filter(g => g.type === 'shieldgen' && g.level >= 1);
  if (gens.length) for (const b of S.buildings) {
    if (isPassive(b.type)) continue;
    const c = centerOf(b);
    let best = null, bd = Infinity;
    for (const g of gens) { const gc = centerOf(g), d = Math.hypot(gc.x - c.x, gc.y - c.y); if (d <= DEFS.shieldgen.shieldRange * TILE && d < bd) { bd = d; best = g; } }
    b._shBy = best ? best.id : null; b._shGen = best;
  }
  for (const b of S.buildings) {
    if (b.type !== 'repairbay' || b.level < 1) continue;
    const c = centerOf(b);
    for (let i = 0; i < DEFS.repairbay.drones; i++) B.repairDrones.push({ home: b, x: c.x + (i ? 12 : -12), y: c.y - 24, tgt: null, a: i * Math.PI, beam: 0 });
  }
  if (typeof CARGO !== 'undefined') CARGO.drones.length = 0; // cargo drones stay home during battles
  updateNukeButton(true);
}

function stormWaveStart(n) {
  if (B.mission || B.practice) return;
  if (n >= 12 && n % 3 === 0) {
    const g = GFX.geo, fromLeft = Math.random() < 0.5;
    B.transports.push({ t: -5 - Math.random() * 4, fromLeft, y: g.by + g.bh * (0.25 + Math.random() * 0.5), x: fromLeft ? -200 : MAP_W * TILE + 200, count: 4 + Math.floor(n / 6), dropped: 0 });
  }
}

// Something still on its way in (paratroopers in the air) keeps the wave open.
function stormPending() { return B.transports.length > 0 || B.paraDrops.length > 0; }

function stormSpawned(u, e) {
  if (e.hover && GFX.river) {
    const pts = GFX.river.pts, fromLeft = Math.random() < 0.5;
    const g = GFX.geo, landX = g.bx + g.bw * (0.25 + Math.random() * 0.5);
    let land = 0, bd = Infinity;
    pts.forEach((p, i) => { const d = Math.abs(p.x - landX); if (d < bd) { bd = d; land = i; } });
    const i0 = fromLeft ? 1 : pts.length - 2;
    u.x = pts[i0].x; u.y = pts[i0].y;
    u.river = { i: i0, dir: fromLeft ? 1 : -1, land };
  }
  if (e.officer) u.elite = false;
  if (u.type === 'titan') u.stompT = 3;
}

/* ================= Enemy behaviour ================= */
// Runs inside updateEnemy. Returning true means the unit was fully handled this frame.
function stormEnemyUpdate(u, e, dt) {
  if (u.cmdT > 0) { u.cmdT -= dt; u.slow *= 1.2; }
  if (warEnemyUpdate(u, e, dt)) return true;
  if (u.river) {
    const pts = GFX.river.pts, p = pts[u.river.i];
    const dx = p.x - u.x, dy = p.y - u.y, d = Math.hypot(dx, dy) || 1;
    const step = e.speed * 1.5 * TILE * dt * (B.mods.fast || 1);
    u.x += dx / d * Math.min(d, step); u.y += dy / d * Math.min(d, step);
    u.angle = Math.atan2(dy, dx); u.aim = u.angle; u.moving = true; u.walk += dt * 6;
    if (d < 8) {
      if (u.river.i === u.river.land) { u.river = null; banner('Hovercraft landing', 'Enemy boats are coming ashore'); }
      else u.river.i += u.river.dir;
    }
    if (Math.random() < dt * 14) particles.push({ x: u.x - Math.cos(u.angle) * 16 + (Math.random() - 0.5) * 10, y: u.y + (Math.random() - 0.5) * 10, vx: -Math.cos(u.angle) * 30, vy: -20, g: 60, life: 0.5, max: 0.5, r: 2.5, color: 'rgba(230,245,255,0.8)' });
    return true;
  }
  if (e.kamikaze) {
    if (!u.tgt || u.tgt._dead) u.tgt = nearestBuilding(u.x, u.y, 999, true);
    if (!u.tgt) return true;
    const c = centerOf(u.tgt), dx = c.x - u.x, dy = c.y - u.y, d = Math.hypot(dx, dy) || 1;
    const sp = e.speed * TILE * u.slow * (B.mods.fast || 1) * dt;
    u.x += dx / d * sp; u.y += dy / d * sp;
    u.angle = Math.atan2(dy, dx); u.aim = u.angle; u.moving = true; u.walk += dt * 12;
    if (distToBuilding(u.x, u.y, u.tgt) <= e.range) {
      u.hp = 0;
      const dmg = e.dmg * (u.elite ? ELITE.dmg : 1) * (1 + 0.04 * Math.max(0, B.wave - 11));
      damageBuilding(u.tgt, dmg);
      for (const b of S.buildings) if (!b._dead && b !== u.tgt && !isPassive(b.type) && distToBuilding(u.x, u.y, b) <= e.splash) damageBuilding(b, dmg * 0.5);
      explosion(u.x, u.y, 30); Sound.play('bigboom'); buzz(30);
    }
    return true;
  }
  if (e.emp && u.tgt && !u.tgt._dead && u.cd <= 0 && distToBuilding(u.x, u.y, u.tgt) <= e.range) {
    u.cd = 1 / e.rate; u.flash = 0.1;
    const c = centerOf(u.tgt);
    B.fx.push({ kind: 'bolt', x1: u.x, y1: u.y - 4, x2: c.x, y2: c.y - 10, life: 0.25, seed: Math.random() * 999 });
    B.fx.push({ kind: 'ring', x: c.x, y: c.y, r: 1.4 * TILE, life: 0.5, max: 0.5, color: '110,190,255' });
    let n = 0;
    for (const b of S.buildings) if (!b._dead && !isPassive(b.type) && DEFS[b.type].dmg && distToBuilding(c.x, c.y, b) <= 1.4) { b._stun = Math.max(b._stun || 0, e.emp); n++; }
    damageBuilding(u.tgt, e.dmg * 3);
    Sound.play('zap');
    if (n && !B.empTip) { B.empTip = true; toast('EMP Troopers knock your defenses offline. Take them out first', 'info'); }
  }
  if (u.type === 'titan') {
    u.stompT -= dt;
    if (u.stompT <= 0) {
      u.stompT = 4;
      for (const b of S.buildings) if (!b._dead && !isPassive(b.type) && distToBuilding(u.x, u.y, b) <= 1.8) damageBuilding(b, e.dmg * 0.6);
      for (const t of B.troops) if (t.hp > 0 && Math.hypot(t.x - u.x, t.y - u.y) <= 1.8 * TILE) damageAlly(t, e.dmg * 0.5);
      B.fx.push({ kind: 'shock', x: u.x, y: u.y, r: 1.8 * TILE * 1.4, life: 0.5, max: 0.5 });
      addDecal({ kind: 'crater', x: u.x, y: u.y, r: 22, life: 25 });
      addShake(5); Sound.play('boom');
    }
  }
  return false;
}

function stormDamageMod(u, ed, dmg, src) {
  dmg = warDamageMod(u, ed, dmg, src);
  if (ed.shield && BULLET_SRC.has(src)) {
    dmg *= 1 - ed.shield;
    if (Math.random() < 0.25) particles.push({ x: u.x + Math.cos(u.aim) * 8, y: u.y + Math.sin(u.aim) * 8, vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 40, g: 200, life: 0.25, max: 0.25, r: 1.4, color: '#ffe8a0', glow: true });
  }
  if (B.flares.length && DEFS[src] && DEFS[src].dmg && inFlare(u.x, u.y)) dmg *= 1.25;
  if (B.focus === u && DEFS[src]) dmg *= 1.1;
  if (SHOOTER && !SHOOTER._dead) B.dmgByB[SHOOTER.id] = (B.dmgByB[SHOOTER.id] || 0) + Math.min(dmg, Math.max(0, u.hp));
  if (dmg > B.bestHit) B.bestHit = dmg;
  return dmg;
}

function stormEnemyKilled(u, e) {
  B.killsBy[u.type] = (B.killsBy[u.type] || 0) + 1;
  if (B.focus === u) B.focus = null;
  if (e.officer) {
    S.stats.officers = (S.stats.officers || 0) + 1;
    const got = addLoot('gold', e.bounty * 3);
    S.medals += 1; B.medals += 1;
    floaters.push({ x: u.x, y: u.y - 34, text: `Officer down +${got} +1 medal`, color: '#f2b632', life: 1.6, max: 1.6, size: 15 });
    Sound.play('medal');
  }
  if (u.type === 'titan') S.stats.titans = (S.stats.titans || 0) + 1;
  warEnemyKilled(u, e);
}

/* ================= Shield Generator ================= */
function shieldAbsorb(b, dmg) {
  const g = b._shGen;
  if (!g || g._dead || !(g._sh > 0)) return dmg;
  const take = Math.min(dmg, g._sh);
  g._sh -= take; g._shHit = 0.18;
  if (g._sh <= 0) {
    g._sh = 0; g._shT = DEFS.shieldgen.recharge;
    const c = centerOf(g);
    B.fx.push({ kind: 'shock', x: c.x, y: c.y, r: DEFS.shieldgen.shieldRange * TILE, life: 0.5, max: 0.5 });
    Sound.play('zap');
  }
  return dmg - take;
}

/* ================= Flares ================= */
function dropFlare(w) {
  B.flares.push({ x: w.x, y: w.y, r: 3.2 * TILE, life: 12, max: 12, h: 160 });
  Sound.play('rocket');
}
function inFlare(x, y) {
  if (!B || !B.flares) return false;
  for (const f of B.flares) if (Math.hypot(x - f.x, y - f.y) <= f.r) return true;
  return false;
}

/* ================= Missile Silo ================= */
function siloBuilding() { return S.buildings.find(b => b.type === 'silo' && b.level >= 1 && !b._dead) || null; }
function siloReady() { const s = siloBuilding(); return !!(B && s && B.siloCharge >= siloCharge(s.level)); }
let nukeKey = '';
function updateNukeButton(force) {
  const btn = $('#btn-nuke');
  if (!btn) return;
  const s = B && !B.practice ? siloBuilding() : null;
  const show = !!s && !B.over;
  if (btn.hidden === show) btn.hidden = !show;
  if (!show) return;
  const max = siloCharge(s.level), k = Math.min(1, B.siloCharge / max);
  const key = Math.round(k * 50) + (B.targeting === 'nuke' ? 'a' : '');
  if (key === nukeKey && !force) return;
  nukeKey = key;
  btn.style.setProperty('--p', ((1 - k) * 100).toFixed(1) + '%');
  btn.classList.toggle('ready', k >= 1);
  btn.classList.toggle('armed', B.targeting === 'nuke');
  btn.querySelector('.nk-cd').textContent = k >= 1 ? '' : Math.round(k * 100) + '%';
}
function onNukeClick() {
  if (!B || B.over) return;
  if (!siloReady()) { toast('The missile is still being fueled', 'info'); Sound.play('error'); return; }
  clearDeployPick();
  B.targeting = B.targeting === 'nuke' ? null : 'nuke';
  document.body.classList.toggle('targeting', !!B.targeting);
  Sound.play('click');
  if (B.targeting) banner('Strategic missile', 'Tap the map to choose ground zero');
  updateNukeButton(true);
}
function launchNuke(w) {
  const s = siloBuilding();
  B.targeting = null; document.body.classList.remove('targeting'); $('#banner').hidden = true;
  if (!s) return;
  if (jammedAt(w.x, w.y)) { toast('Signal jammed. Destroy the Jammer Truck first', 'bad'); Sound.play('error'); return; }
  const c = centerOf(s);
  B.siloCharge = 0;
  B.missiles.push({ sx: c.x, sy: c.y - 20, tx: w.x, ty: w.y, t: 0, dur: 2.4, dmg: nukeDamage(s.level), r: DEFS.silo.radius * TILE, x: c.x, y: c.y });
  B.fx.push({ kind: 'ring', x: w.x, y: w.y, r: DEFS.silo.radius * TILE, life: 2.4, max: 2.4, color: '255,90,60' });
  for (let i = 0; i < 20; i++) particles.push({ x: c.x + (Math.random() - 0.5) * 30, y: c.y, vx: (Math.random() - 0.5) * 80, vy: -10 - Math.random() * 30, g: 0, life: 2, max: 2, r: 8, grow: 10, color: 'smoke' });
  S.stats.nukes = (S.stats.nukes || 0) + 1;
  Sound.play('rocket'); Sound.play('alarm'); buzz([60, 40, 60]);
  banner('Missile away', 'Impact in 2 seconds');
  updateNukeButton(true);
}
function updateMissiles(dt) {
  for (const m of B.missiles) {
    m.t += dt;
    const k = Math.min(1, m.t / m.dur), ox = m.x, oy = m.y - (m.h || 0);
    m.x = m.sx + (m.tx - m.sx) * k; m.y = m.sy + (m.ty - m.sy) * k; m.h = Math.sin(k * Math.PI) * 420;
    m.ang = Math.atan2(m.y - m.h - oy, m.x - ox);
    if (Math.random() < 0.8) particles.push({ x: m.x, y: m.y - m.h, vx: (Math.random() - 0.5) * 10, vy: 0, g: 0, life: 1.2, max: 1.2, r: 4, grow: 7, color: 'smoke' });
    if (k >= 1 && !m.done) { m.done = true; nukeImpact(m); }
  }
  B.missiles = B.missiles.filter(m => !m.done);
}
function nukeImpact(m) {
  let n = 0;
  for (const u of B.units) {
    if (u.hp <= 0) continue;
    const d = Math.hypot(u.x - m.tx, u.y - m.ty);
    if (d > m.r) continue;
    SHOOTER = null;
    damageEnemy(u, m.dmg * (d < m.r * 0.5 ? 1 : 0.55), 'silo'); n++;
  }
  B.dmgBy.silo = B.dmgBy.silo || 0;
  explosion(m.tx, m.ty, 90);
  gfxExplosion(m.tx, m.ty, 140);
  B.fx.push({ kind: 'shock', x: m.tx, y: m.ty, r: m.r * 2.2, life: 0.9, max: 0.9 });
  B.fx.push({ kind: 'light', x: m.tx, y: m.ty, r: m.r * 3, life: 1.4, max: 1.4 });
  addDecal({ kind: 'crater', x: m.tx, y: m.ty, r: m.r * 0.55, life: 60 });
  // mushroom cloud
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, s = Math.random();
    particles.push({ x: m.tx + Math.cos(a) * s * 40, y: m.ty - 30 - Math.random() * 30, vx: Math.cos(a) * 30, vy: -60 - Math.random() * 50, g: 0, life: 3 + Math.random(), max: 4, r: 14, grow: 18, color: i % 3 ? 'smoke-dark' : 'smoke' });
  }
  for (let i = 0; i < 14; i++) particles.push({ x: m.tx + (Math.random() - 0.5) * 20, y: m.ty - Math.random() * 80, vx: (Math.random() - 0.5) * 30, vy: -80, g: 0, life: 1.2, max: 1.2, r: 10, grow: 14, color: '#ff9a3a', glow: true });
  B.nukeFlash = 1;
  addShake(10); Sound.play('bigboom'); Sound.play('boom'); buzz([200, 60, 200]);
  banner('Direct hit', `${n} target${n === 1 ? '' : 's'} in the blast`);
}

/* ================= Supply drops ================= */
function spawnBattleCrate() {
  const h = hq(), c = centerOf(h);
  for (let tries = 0; tries < 30; tries++) {
    const a = Math.random() * Math.PI * 2, r = (2.5 + Math.random() * 4) * TILE;
    const x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r;
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (!inBuildArea(tx, ty) || buildingAtTile(tx, ty)) continue;
    B.crates.push({ x, y, h: 260, life: 20, sway: Math.random() * 6 });
    Sound.play('plane');
    toast('Supply drop incoming. Tap the crate to open it', 'info');
    return;
  }
}
function openCrate(c) {
  B.crates = B.crates.filter(x => x !== c);
  const loot = pickWeighted(SUPPLY_LOOT);
  S.stats.crates = (S.stats.crates || 0) + 1;
  let text = loot.name;
  const w = Math.max(1, B.wave);
  if (loot.id === 'gold') text = `+${fmt(addLoot('gold', 250 + w * 60))} gold`;
  else if (loot.id === 'steel') text = `+${fmt(addLoot('steel', 180 + w * 45))} steel`;
  else if (loot.id === 'recharge') { for (const k in B.ab) B.ab[k] = 0; text = 'Abilities recharged'; }
  else if (loot.id === 'repair') { for (const b of S.buildings) if (!b._dead && !isPassive(b.type)) { b._hp = Math.min(b._maxhp, b._hp + b._maxhp * 0.25); b._heal = 1; } text = 'Base repaired 25%'; }
  else if (loot.id === 'squad') { for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; spawnTroop('rifle', c.x + Math.cos(a) * 14, c.y + Math.sin(a) * 14, false, 0.3); } text = 'Four rifle squads join you'; }
  else if (loot.id === 'medal') { S.medals += 2; B.medals += 2; text = '+2 medals'; }
  floaters.push({ x: c.x, y: c.y - 30, text, color: '#ffcf5a', life: 1.8, max: 1.8, size: 16 });
  burst(c.x, c.y - 10, '#f2b632', 16);
  Sound.play('medal'); buzz(20);
}

/* ================= Focus fire ================= */
function enemyAt(w) {
  let best = null, bd = 30 / Math.min(1, cam.z);
  for (const u of B.units) {
    if (u.hp <= 0 || (ENEMIES[u.type].stealth && !u.revealed)) continue;
    const d = Math.min(Math.hypot(u.x - w.x, u.y - w.y), u.air ? Math.hypot(u.x - w.x, u.y - 22 - w.y) : Infinity);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}
function setFocus(u) {
  B.focus = u; B.focusT = 12;
  const H = B.hero;
  if (H && !H.dead) {
    const st = heroStats(H.id), d = Math.hypot(u.x - H.x, u.y - H.y);
    if (d <= st.range * TILE) H.tgt = u;
    else { const k = (d - st.range * TILE * 0.8) / d; H.dest = { x: H.x + (u.x - H.x) * k, y: H.y + (u.y - H.y) * k }; }
  }
  Sound.play('click'); buzz(10);
  floaters.push({ x: u.x, y: u.y - 30, text: 'Focus fire', color: '#ff8a73', life: 1, max: 1, size: 13 });
}

// Taps on the battlefield. Returns true when handled here.
function stormTap(w) {
  if (B.targeting === 'nuke') { launchNuke(w); return true; }
  if (B.targeting || B.deployPick || B.rallyMode) return false;
  for (const c of B.crates) if (Math.hypot(w.x - c.x, w.y - (c.y - c.h)) < 34) { openCrate(c); return true; }
  if (S.settings.focusTap !== false) { const u = enemyAt(w); if (u) { setFocus(u); return true; } }
  return false;
}

/* ================= Per-frame battle update ================= */
function stormBattleUpdate(dt) {
  // officers rally the troops around them
  B.cmdT -= dt;
  if (B.cmdT <= 0) {
    B.cmdT = 0.5;
    for (const o of B.units) {
      if (o.hp <= 0 || !ENEMIES[o.type].officer) continue;
      const r = ENEMIES.officer.auraRange * TILE;
      for (const u of B.units) if (u !== o && u.hp > 0 && Math.hypot(u.x - o.x, u.y - o.y) <= r) u.cmdT = 0.7;
    }
  }
  if (B.focus && (B.focus.hp <= 0 || (B.focusT -= dt) <= 0)) B.focus = null;
  // EMP stuns wear off even on defenses that are not firing
  for (const b of S.buildings) if (b._stun > 0) b._stun -= dt;
  // shields recharge
  for (const g of S.buildings) {
    if (g.type !== 'shieldgen' || g._dead || !g._shMax) continue;
    if (g._shHit > 0) g._shHit -= dt;
    if (g._sh <= 0) { g._shT -= dt; if (g._shT <= 0) { g._sh = g._shMax; const c = centerOf(g); B.fx.push({ kind: 'ring', x: c.x, y: c.y, r: DEFS.shieldgen.shieldRange * TILE, life: 0.6, max: 0.6, color: '110,190,255' }); } }
    else g._sh = Math.min(g._shMax, g._sh + g._shMax * 0.02 * dt);
  }
  updateRepairDrones(dt);
  // flares drift down
  for (const f of B.flares) { f.life -= dt; f.h = Math.max(20, f.h - 14 * dt); if (Math.random() < dt * 20) particles.push({ x: f.x + (Math.random() - 0.5) * 4, y: f.y - f.h, vx: (Math.random() - 0.5) * 8, vy: 10, g: 10, life: 0.8, max: 0.8, r: 2, color: '#fff6d0', glow: true }); }
  B.flares = B.flares.filter(f => f.life > 0);
  // silo charges while the fight is on
  const silo = siloBuilding();
  if (silo && B.phase === 'fight') B.siloCharge = Math.min(siloCharge(silo.level), B.siloCharge + dt);
  if (silo && B.siloCharge >= siloCharge(silo.level) && !B.siloTold) { B.siloTold = true; toast('Strategic missile ready to launch', 'good'); Sound.play('medal'); }
  if (B.siloCharge < 1) B.siloTold = false;
  updateMissiles(dt);
  if (B.nukeFlash > 0) B.nukeFlash = Math.max(0, B.nukeFlash - dt * 0.8);
  // supply drops
  if (!B.practice && !B.raid && B.phase === 'fight') {
    B.crateT -= dt;
    if (B.crateT <= 0) { B.crateT = 45 + Math.random() * 20; spawnBattleCrate(); }
  }
  for (const c of B.crates) { if (c.h > 0) c.h = Math.max(0, c.h - 70 * dt); else c.life -= dt; }
  B.crates = B.crates.filter(c => c.life > 0);
  // transport planes and paratroopers
  for (const tp of B.transports) {
    tp.t += dt;
    if (tp.t < 0) continue;
    if (!tp.warned) { tp.warned = true; banner('Enemy transport', 'Paratroopers dropping into your base'); Sound.play('plane'); }
    tp.x += (tp.fromLeft ? 1 : -1) * 260 * dt;
    const g = GFX.geo, x0 = g.bx + g.bw * 0.2, x1 = g.bx + g.bw * 0.8;
    const span = (x1 - x0) / Math.max(1, tp.count - 1);
    while (tp.dropped < tp.count) {
      const dx = tp.fromLeft ? x0 + tp.dropped * span : x1 - tp.dropped * span;
      if (tp.fromLeft ? tp.x < dx : tp.x > dx) break;
      B.paraDrops.push({ x: dx + (Math.random() - 0.5) * 20, y: tp.y + (Math.random() - 0.5) * 60, t: 1.8, max: 1.8 });
      tp.dropped++;
    }
    if (tp.fromLeft ? tp.x > MAP_W * TILE + 220 : tp.x < -220) tp.done = true;
  }
  B.transports = B.transports.filter(tp => !tp.done);
  for (const p of B.paraDrops) {
    p.t -= dt;
    if (p.t <= 0) { spawnEnemy('para'); const u = B.units[B.units.length - 1]; u.x = p.x; u.y = p.y; p.done = true; }
  }
  B.paraDrops = B.paraDrops.filter(p => !p.done);
  updateNukeButton();
}

/* ================= Repair drones ================= */
function updateRepairDrones(dt) {
  for (const d of B.repairDrones) {
    const home = d.home;
    if (home._dead) { if (!d.down) { d.down = true; explosion(d.x, d.y, 10); } continue; }
    const hc = centerOf(home), range = DEFS.repairbay.healRange * TILE;
    d.a += dt * 2;
    if (!d.tgt || d.tgt._dead || d.tgt._hp >= d.tgt._maxhp) {
      d.tgt = null; let worst = 0.97;
      for (const b of S.buildings) {
        if (b._dead || isPassive(b.type) || !b._maxhp) continue;
        const c = centerOf(b);
        if (Math.hypot(c.x - hc.x, c.y - hc.y) > range) continue;
        const k = b._hp / b._maxhp;
        if (k < worst && !B.repairDrones.some(o => o !== d && o.tgt === b && k > 0.5)) { worst = k; d.tgt = b; }
      }
    }
    const goal = d.tgt ? (() => { const c = centerOf(d.tgt); return { x: c.x + Math.cos(d.a) * 14, y: c.y - 34 + Math.sin(d.a) * 6 }; })() : { x: hc.x + Math.cos(d.a) * 18, y: hc.y - 30 + Math.sin(d.a) * 8 };
    const dx = goal.x - d.x, dy = goal.y - d.y, dist = Math.hypot(dx, dy);
    const step = Math.min(dist, 140 * dt);
    if (dist > 0.5) { d.x += dx / dist * step; d.y += dy / dist * step; }
    d.beam = 0;
    if (d.tgt && dist < 24) {
      d.tgt._hp = Math.min(d.tgt._maxhp, d.tgt._hp + repairRate(home.level) * dt);
      d.beam = 1;
      if (Math.random() < dt * 6) { const c = centerOf(d.tgt); particles.push({ x: c.x + (Math.random() - 0.5) * 24, y: c.y - 6, vx: 0, vy: -30, g: 0, life: 0.6, max: 0.6, r: 2, color: '#8fe07a', glow: true }); }
    }
  }
  B.repairDrones = B.repairDrones.filter(d => !d.down);
}

/* ================= Drawing ================= */
function drawStormGround(ctx) {
  if (!B) return;
  // shield domes
  for (const g of S.buildings) {
    if (g.type !== 'shieldgen' || g._dead || !(g._sh > 0)) continue;
    const c = centerOf(g), R = DEFS.shieldgen.shieldRange * TILE, k = g._sh / g._shMax, hit = Math.max(0, g._shHit || 0) / 0.18;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grd = ctx.createRadialGradient(c.x, c.y - R * 0.15, R * 0.2, c.x, c.y, R);
    grd.addColorStop(0, `rgba(110,190,255,${0.02 + hit * 0.06})`); grd.addColorStop(0.85, `rgba(110,190,255,${0.07 + k * 0.05 + hit * 0.15})`); grd.addColorStop(1, `rgba(150,215,255,${0.25 + hit * 0.3})`);
    ctx.fillStyle = grd; ctx.beginPath(); ctx.ellipse(c.x, c.y, R, R * 0.82, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(170,225,255,${0.35 + hit * 0.5})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, R, R * 0.82, 0, 0, Math.PI * 2); ctx.stroke();
    // a shimmer band sweeping across the dome
    const sweep = ((tSec * 0.4 + g.id * 0.3) % 1) * 2 - 1;
    ctx.strokeStyle = 'rgba(200,235,255,0.12)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.ellipse(c.x, c.y + sweep * R * 0.5, R * Math.sqrt(1 - sweep * sweep * 0.25), R * 0.2, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  // EMP-stunned defenses spark
  for (const b of S.buildings) {
    if (!(b._stun > 0) || b._dead) continue;
    const c = centerOf(b);
    ctx.fillStyle = 'rgba(110,190,255,0.22)'; ctx.beginPath(); ctx.arc(c.x, c.y - 8, DEFS[b.type].size * TILE * 0.45, 0, Math.PI * 2); ctx.fill();
    if (Math.random() < 0.3) B.fx.push({ kind: 'bolt', x1: c.x - 10, y1: c.y - 14, x2: c.x + 10, y2: c.y - 2, life: 0.08, seed: Math.random() * 999 });
  }
  // crates on the ground (or still falling)
  for (const c of B.crates) {
    if (c.h > 0) {
      // shadow grows as it falls
      const k = 1 - c.h / 260;
      ctx.fillStyle = `rgba(0,0,0,${0.1 + k * 0.2})`; ctx.beginPath(); ctx.ellipse(c.x, c.y + 10, 6 + k * 10, 3 + k * 4, 0, 0, Math.PI * 2); ctx.fill();
    } else drawSupplyCrate(ctx, c.x, c.y, tSec);
  }
  // flares' light pool on the ground
  for (const f of B.flares) {
    const k = Math.min(1, f.life / 2) * (0.85 + Math.sin(tSec * 30 + f.x) * 0.15);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.14 * k;
    ctx.drawImage(glowSprite('#fff4d0'), f.x - f.r, f.y - f.r * 0.8, f.r * 2, f.r * 1.6);
    ctx.restore();
  }
  drawWarGround(ctx);
}

function drawStormAir(ctx) {
  if (!B) return;
  // falling crates with parachutes
  for (const c of B.crates) {
    if (c.h <= 0) continue;
    const x = c.x + Math.sin(tSec * 2 + c.sway) * 8, y = c.y - c.h;
    ctx.strokeStyle = 'rgba(30,30,30,0.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 7, y - 4); ctx.lineTo(x - 16, y - 30); ctx.moveTo(x + 7, y - 4); ctx.lineTo(x + 16, y - 30); ctx.stroke();
    ctx.fillStyle = '#e9e4d4'; ctx.beginPath(); ctx.ellipse(x, y - 32, 20, 10, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#c8402a'; ctx.beginPath(); ctx.ellipse(x, y - 32, 20, 10, 0, Math.PI, Math.PI * 1.33); ctx.lineTo(x, y - 32); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y - 32, 20, 10, 0, Math.PI * 1.66, 0); ctx.lineTo(x, y - 32); ctx.fill();
    box(ctx, x - 9, y - 4, 18, 12, 10, '#8a7a3c', '#5e5228', 2);
  }
  // paratroopers on the way down
  for (const p of B.paraDrops) {
    const k = p.t / p.max, y = p.y - k * 200, x = p.x + Math.sin(tSec * 2 + p.x) * 6 * k;
    ctx.fillStyle = `rgba(0,0,0,${0.15 + (1 - k) * 0.15})`; ctx.beginPath(); ctx.ellipse(p.x, p.y + 4, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(40,30,25,0.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 4, y - 2); ctx.lineTo(x - 12, y - 22); ctx.moveTo(x + 4, y - 2); ctx.lineTo(x + 12, y - 22); ctx.stroke();
    ctx.fillStyle = '#6b4a3a'; ctx.beginPath(); ctx.ellipse(x, y - 24, 15, 8, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = ENEMY_COL.body; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
  }
  // transport planes
  for (const tp of B.transports) if (tp.t >= 0) drawTransport(ctx, tp.x, tp.y - 60, tp.fromLeft ? 0 : Math.PI);
  // repair drones
  for (const d of B.repairDrones) {
    if (d.beam && d.tgt) {
      const c = centerOf(d.tgt);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(140,240,120,0.5)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(c.x, c.y - 6); ctx.stroke();
      ctx.strokeStyle = '#e6ffd8'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(c.x, c.y - 6); ctx.stroke();
      ctx.restore();
    }
    drawQuadDrone(ctx, d.x, d.y, '#7fbf4d', 20);
  }
  // missiles in flight
  for (const m of B.missiles) {
    const ang = m.ang || -Math.PI / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(m.x, m.y, 8, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(m.x, m.y - m.h); ctx.rotate(ang);
    ctx.fillStyle = '#e4e0d0'; rr(ctx, -14, -3.5, 26, 7, 3.5); ctx.fill();
    ctx.fillStyle = '#c8402a'; ctx.beginPath(); ctx.moveTo(12, -3.5); ctx.lineTo(18, 0); ctx.lineTo(12, 3.5); ctx.fill();
    ctx.fillStyle = '#3a3f45'; ctx.fillRect(-14, -6, 5, 12);
    ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glowSprite('#ffb347'), -30, -9, 18, 18);
    ctx.restore();
  }
  // flares hanging under their parachutes
  for (const f of B.flares) {
    const x = f.x + Math.sin(tSec * 1.5 + f.x) * 5, y = f.y - f.h;
    ctx.fillStyle = 'rgba(230,230,220,0.85)'; ctx.beginPath(); ctx.ellipse(x, y - 12, 8, 4, 0, Math.PI, 0); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.75; ctx.drawImage(glowSprite('#fff4d0'), x - 15, y - 15, 30, 30); ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // focus marker
  if (B.focus && B.focus.hp > 0) {
    const u = B.focus, y = u.y - (u.air ? 22 : 0), r = ENEMIES[u.type].r + 9;
    ctx.save(); ctx.translate(u.x, y); ctx.rotate(tSec * 2);
    ctx.strokeStyle = 'rgba(255,90,60,0.95)'; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.arc(0, 0, r, -0.45, 0.45); ctx.stroke(); ctx.beginPath(); ctx.moveTo(r - 4, 0); ctx.lineTo(r + 5, 0); ctx.stroke(); }
    ctx.restore();
  }
  drawWarAir(ctx);
}

function drawTransport(ctx, x, y, a) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.translate(x + 50, y + 90); ctx.rotate(a);
  ctx.beginPath(); ctx.ellipse(0, 0, 44, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-6, -48, 16, 96);
  ctx.restore();
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = '#5a4a3c'; rr(ctx, -10, -50, 20, 100, 6); ctx.fill();           // wings
  ctx.fillStyle = '#6b5a48'; rr(ctx, -46, -9, 92, 18, 9); ctx.fill();             // fuselage
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; rr(ctx, -44, -8, 88, 6, 3); ctx.fill();
  ctx.fillStyle = '#4a3c30'; rr(ctx, -46, -20, 12, 40, 4); ctx.fill();            // tail
  for (const oy of [-30, -16, 16, 30]) {
    ctx.fillStyle = '#3a2f26'; rr(ctx, 4, oy - 4, 12, 8, 3); ctx.fill();
    ctx.save(); ctx.translate(17, oy); ctx.rotate(tSec * 40); ctx.fillStyle = 'rgba(30,26,22,0.55)'; ctx.fillRect(-1, -7, 2, 14); ctx.restore();
  }
  ctx.fillStyle = 'rgba(160,210,230,0.65)'; rr(ctx, 36, -5, 8, 10, 4); ctx.fill();
  ctx.fillStyle = ENEMY_COL.body; ctx.beginPath(); ctx.arc(-20, 0, 4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawQuadDrone(ctx, x, y, accent, alt) {
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(x + alt * 0.3, y + alt, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2b2e25'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - 7, y - 5); ctx.lineTo(x + 7, y + 5); ctx.moveTo(x + 7, y - 5); ctx.lineTo(x - 7, y + 5); ctx.stroke();
  for (const [rx, ry] of [[-7, -5], [7, 5], [7, -5], [-7, 5]]) { ctx.fillStyle = 'rgba(220,220,210,0.35)'; ctx.beginPath(); ctx.ellipse(x + rx, y + ry, 5, 5 * Math.abs(Math.sin(tSec * 40 + rx + ry)), 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#d9d6c6'; rr(ctx, x - 5, y - 4, 10, 8, 3); ctx.fill();
  ctx.fillStyle = accent; ctx.fillRect(x - 5, y - 1, 10, 2);
  ctx.fillStyle = Math.sin(tSec * 8 + x) > 0 ? accent : '#2b2e25'; ctx.beginPath(); ctx.arc(x + 4, y - 3, 1.3, 0, Math.PI * 2); ctx.fill();
}

// Extra light sources for the night renderer.
function stormLights(L, C) {
  if (!B) return;
  for (const f of B.flares) L.push({ x: f.x, y: f.y, r: f.r * 1.3, i: Math.min(1, f.life / 2) * (0.8 + Math.sin(tSec * 30 + f.x) * 0.08), c: C.white });
  for (const g of S.buildings) if (g.type === 'shieldgen' && !g._dead && g._sh > 0) { const c = centerOf(g); L.push({ x: c.x, y: c.y, r: DEFS.shieldgen.shieldRange * TILE * 1.1, i: 0.45 + (g._shHit > 0 ? 0.4 : 0), c: C.blue }); }
  for (const d of B.repairDrones) if (d.beam) L.push({ x: d.x, y: d.y + 20, r: 50, i: 0.7, c: C.green, hot: true });
  for (const m of B.missiles) L.push({ x: m.x, y: m.y - m.h * 0.3, r: 70, i: 0.9, c: C.fire, hot: true });
  for (const c of B.crates) if (c.h <= 0) L.push({ x: c.x, y: c.y - 20, r: 30, i: 0.5 + Math.sin(tSec * 6) * 0.4, c: C.red });
  if (B.nukeFlash > 0) L.push({ x: cam.x, y: cam.y, r: 4000, i: B.nukeFlash, c: C.white, hot: true });
  warLights(L, C);
}

/* ================= Enemy art ================= */
INFANTRY_LOOK.riot = { body: '#5e4a3c', helmet: '#2a201a', gun: 6 };
INFANTRY_LOOK.para = { body: '#7a3424', helmet: '#3a1610', gun: 10, pack: '#4a3a2a' };
INFANTRY_LOOK.officer = { body: '#5a2a1e', helmet: '#2a120c', gun: 6 };
INFANTRY_LOOK.emptrooper = { body: '#3a3f52', helmet: '#1e2230', gun: 12, pack: '#2a2e3a' };

// Extra details drawn on top of a foot soldier (already rotated to its aim).
const STORM_INF = {
  riot(ctx, u, e, white) {
    const r = e.r;
    ctx.fillStyle = white ? '#fff' : '#2b2f33'; rr(ctx, r * 0.55, -r * 1.1, 4, r * 2.2, 2); ctx.fill();
    if (!white) { ctx.fillStyle = 'rgba(160,200,220,0.55)'; ctx.fillRect(r * 0.55 + 1, -r * 0.5, 2, r * 0.6); ctx.fillStyle = '#f2b632'; ctx.fillRect(r * 0.55, -r * 1.1, 4, 1.5); }
  },
  officer(ctx, u, e, white) {
    ctx.fillStyle = white ? '#fff' : '#3a1a12'; ctx.beginPath(); ctx.ellipse(0, 0, e.r * 0.75, e.r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2b632'; ctx.beginPath(); ctx.arc(e.r * 0.25, 0, 1.6, 0, Math.PI * 2); ctx.fill();
  },
  emptrooper(ctx, u, e, white) {
    const glow = 0.5 + Math.sin(tSec * 10 + u.walk) * 0.4;
    ctx.fillStyle = `rgba(110,190,255,${glow})`; ctx.beginPath(); ctx.arc(-e.r * 0.8, 0, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6ec0ff'; ctx.fillRect(e.r * 0.2 + 9, 0, 3, 2.4);
  },
};

const STORM_ART = {
  hover(ctx, u, e, white) {
    const onWater = !!u.river;
    ctx.fillStyle = onWater ? 'rgba(220,240,255,0.25)' : 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(3, 5, e.r + 6, e.r * 0.8, u.angle, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.rotate(u.angle);
    // inflated skirt and deck
    ctx.fillStyle = '#1c1a18'; rr(ctx, -e.r - 2, -e.r * 0.72, e.r * 2 + 4, e.r * 1.44, e.r * 0.6); ctx.fill();
    hullBox(ctx, e.r * 1.7, e.r * 1.05, white ? '#fff' : '#5d4a3c', white);
    if (!white) {
      ctx.fillStyle = '#4a3a2f'; rr(ctx, 2, -5, 10, 10, 2); ctx.fill();
      ctx.fillStyle = 'rgba(160,200,220,0.5)'; ctx.fillRect(9, -4, 2, 8);
      // twin rear fans
      for (const oy of [-6, 6]) {
        ctx.fillStyle = '#2b2522'; ctx.beginPath(); ctx.arc(-e.r + 2, oy, 5, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.translate(-e.r + 2, oy); ctx.rotate(tSec * 30); ctx.fillStyle = 'rgba(200,200,190,0.5)'; ctx.fillRect(-0.8, -4.5, 1.6, 9); ctx.restore();
      }
    }
    ctx.restore();
    ctx.rotate(u.aim);
    ctx.fillStyle = '#2a2420'; ctx.fillRect(8, -1.3, 12, 2.6);
    ctx.fillStyle = white ? '#fff' : ENEMY_COL.hullDark; ctx.beginPath(); ctx.arc(6, 0, 4, 0, Math.PI * 2); ctx.fill();
    if (u.flash > 0) { ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.arc(22, 0, 3, 0, Math.PI * 2); ctx.fill(); }
  },
  walker(ctx, u, e, white) { drawMech(ctx, u, e, white, false); },
  titan(ctx, u, e, white) { drawMech(ctx, u, e, white, true); },
  kamikaze(ctx, u, e, white) {
    const alt = 16;
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(alt * 0.35, alt * 0.45, 9, 4, u.angle, 0, Math.PI * 2); ctx.fill();
    ctx.translate(0, -alt + Math.sin(u.walk) * 1.5);
    ctx.rotate(u.angle);
    ctx.fillStyle = white ? '#fff' : '#3a332c';
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -9); ctx.lineTo(-3, 0); ctx.lineTo(-6, 9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = white ? '#fff' : '#c8402a'; ctx.beginPath(); ctx.ellipse(6, 0, 4, 2.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(-5, 0, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = Math.sin(tSec * 18 + u.walk) > 0 ? '#ff3a2a' : '#5a1810'; ctx.beginPath(); ctx.arc(2, 0, 1.4, 0, Math.PI * 2); ctx.fill();
  },
};

function drawMech(ctx, u, e, white, titan) {
  const s = titan ? 1.75 : 1, step = u.moving ? Math.sin(u.walk * 0.9) : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(5 * s, 7 * s, 18 * s, 13 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.rotate(u.angle);
  // legs stride
  for (const side of [-1, 1]) {
    const o = step * side * 7 * s;
    ctx.fillStyle = '#2a2420'; rr(ctx, -5 * s + o, side * 9 * s - 3 * s, 14 * s, 6 * s, 2 * s); ctx.fill();
    ctx.fillStyle = '#3e342c'; rr(ctx, 4 * s + o, side * 9 * s - 4 * s, 7 * s, 8 * s, 2 * s); ctx.fill();
  }
  ctx.restore();
  ctx.save(); ctx.rotate(u.aim);
  const body = white ? '#fff' : titan ? '#4a3a32' : ENEMY_COL.hull;
  // torso
  ctx.fillStyle = body; rr(ctx, -10 * s, -10 * s, 20 * s, 20 * s, 5 * s); ctx.fill();
  if (!white) {
    ctx.fillStyle = 'rgba(255,255,255,0.13)'; rr(ctx, -9 * s, -9 * s, 18 * s, 7 * s, 4 * s); ctx.fill();
    ctx.fillStyle = ENEMY_COL.hullDark; rr(ctx, -6 * s, -6 * s, 10 * s, 12 * s, 3 * s); ctx.fill();
  }
  // arm guns
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#2a2420'; rr(ctx, 2 * s, side * 12 * s - 3 * s, 16 * s, 6 * s, 2 * s); ctx.fill();
    ctx.fillStyle = '#17130f'; ctx.fillRect(16 * s, side * 12 * s - 1.5 * s, 6 * s, 3 * s);
    if (u.flash > 0) { ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.arc(24 * s, side * 12 * s, 3.5 * s, 0, Math.PI * 2); ctx.fill(); }
  }
  if (titan) {
    // shoulder missile pods
    for (const side of [-1, 1]) { ctx.fillStyle = '#3a2c25'; rr(ctx, -9 * s, side * 6 * s - 4, 9 * s, 8, 2); ctx.fill(); ctx.fillStyle = '#c8402a'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-7 * s + i * 3 * s, side * 6 * s, 1.5, 0, Math.PI * 2); ctx.fill(); } }
  }
  // glowing eye
  ctx.fillStyle = `rgba(255,${titan ? 60 : 120},40,${0.7 + Math.sin(tSec * 6) * 0.3})`; ctx.beginPath(); ctx.arc(7 * s, 0, 2.2 * s, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// Markers drawn above enemies: officer star, command aura glints.
function stormEnemyOverlay(ctx, u, e) {
  if (e.officer) {
    const y = u.y - e.r - 16 + Math.sin(tSec * 4) * 1.5;
    ctx.fillStyle = '#f2b632'; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.4 : 5.5; ctx.lineTo(u.x + Math.cos(a) * r, y + Math.sin(a) * r); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(242,182,50,0.16)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(u.x, u.y, e.auraRange * TILE, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  } else if (u.cmdT > 0 && !u.air) {
    ctx.fillStyle = 'rgba(242,182,50,0.8)'; ctx.fillRect(u.x - 1, u.y - e.r - 9, 2, 3);
  }
}

/* ================= Minimap ================= */
let mmFrame = 0, mmBg = null;
function updateMinimap() {
  const box = $('#minimap');
  if (!box) return;
  const show = !!B && S.settings.minimap !== false && !document.body.classList.contains('photo');
  if (box.hidden === show) box.hidden = !show;
  if (!show || (mmFrame++ % 3)) return;
  const cv = box.querySelector('canvas');
  const w = box.clientWidth, h = box.clientHeight, k = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(w * k)) { cv.width = Math.round(w * k); cv.height = Math.round(h * k); }
  const g = cv.getContext('2d');
  const sx = cv.width / (MAP_W * TILE), sy = cv.height / (MAP_H * TILE);
  g.setTransform(1, 0, 0, 1, 0, 0);
  // the terrain backdrop is shrunk once and reused (scaling the full ground every frame is slow)
  if (ground && (!mmBg || mmBg.src !== ground || mmBg.cv.width !== cv.width)) {
    const bg = document.createElement('canvas'); bg.width = cv.width; bg.height = cv.height;
    const bgc = bg.getContext('2d'); bgc.globalAlpha = 0.85; bgc.drawImage(ground, 0, 0, bg.width, bg.height);
    bgc.globalAlpha = 1; bgc.fillStyle = 'rgba(10,14,8,0.35)'; bgc.fillRect(0, 0, bg.width, bg.height);
    mmBg = { src: ground, cv: bg };
  }
  if (mmBg) g.drawImage(mmBg.cv, 0, 0); else { g.fillStyle = '#2c3a20'; g.fillRect(0, 0, cv.width, cv.height); }
  g.setTransform(sx, 0, 0, sy, 0, 0);
  for (const b of S.buildings) {
    if (isPassive(b.type) && b.type !== 'mine') continue;
    const n = DEFS[b.type].size * TILE;
    g.fillStyle = b._dead ? '#3a2a22' : b.type === 'hq' ? '#f2b632' : b.type === 'wall' || b.type === 'gate' ? '#9aa3a8' : DEFS[b.type].dmg ? '#7fbf4d' : '#c9c2ae';
    g.fillRect(b.x * TILE + 2, b.y * TILE + 2, n - 4, n - 4);
  }
  const dot = (x, y, r, col) => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, r / sx * 0.6, r / sy * 0.6, 0, 0, Math.PI * 2); g.fill(); };
  for (const t of B.troops) if (t.hp > 0) dot(t.x, t.y, 2.2 * k, '#9fe07a');
  for (const u of B.units) {
    if (u.hp <= 0 || (ENEMIES[u.type].stealth && !u.revealed)) continue;
    const e = ENEMIES[u.type];
    dot(u.x, u.y, (e.boss ? 5 : e.vehicle ? 3 : 2.2) * k, e.boss ? '#ffcf5a' : u.air ? '#ff9a6a' : '#ff4a2a');
  }
  for (const c of B.crates) dot(c.x, c.y, 3.5 * k, Math.sin(tSec * 8) > 0 ? '#ffe08a' : '#f2b632');
  if (B.hero && !B.hero.dead) dot(B.hero.x, B.hero.y, 3.4 * k, '#ffffff');
  // camera view
  const hw = vw / 2 / cam.z, hh = vh / 2 / cam.z;
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.5 / sx;
  g.strokeRect(cam.x - hw, cam.y - hh, hw * 2, hh * 2);
}
function minimapPointer(e) {
  if (!B) return;
  const r = e.currentTarget.getBoundingClientRect();
  cam.x = (e.clientX - r.left) / r.width * MAP_W * TILE;
  cam.y = (e.clientY - r.top) / r.height * MAP_H * TILE;
  camVel.x = camVel.y = 0;
  clampCam();
}

/* ================= Pause menu ================= */
function openPause() {
  if (!B || B.over) return;
  B.paused = true;
  const h = hq(), hpPct = h && h._maxhp ? Math.round(h._hp / h._maxhp * 100) : 100;
  openModal(`
    <div class="settings pause">
      <div class="m-head"><div><span class="stamp">Paused</span><h2>${B.mission ? B.mission.name : `Wave ${Math.max(1, B.wave)}`}</h2></div></div>
      <ul class="units report pause-stats">
        <li><span>Enemies destroyed</span><b>${B.kills}</b></li>
        <li><span>Command Center</span><b>${hpPct}%</b></li>
        <li><span>Gold earned</span><b>+${fmt(B.loot.gold)}</b></li>
        <li><span>Doctrine</span><b>${B.doctrine ? B.doctrine.name : 'Standard Issue'}</b></li>
      </ul>
      <div class="hub-grid pause-grid">
        <button class="hub" data-pz="resume"><b>Resume</b><span>Back to the fight</span></button>
        <button class="hub" data-pz="settings"><b>Settings</b><span>Graphics, sound, controls</span></button>
        <button class="hub" data-pz="photo"><b>Photo mode</b><span>Frame the perfect shot</span></button>
        <button class="hub" data-pz="guide"><b>Enemy guide</b><span>Know your enemy</span></button>
        <button class="hub danger-hub" data-pz="retreat"><b>Retreat</b><span>Keep your loot and pull out</span></button>
      </div>
    </div>`, () => { if (B) B.paused = !$('#cards').hidden; }); // an open upgrade choice keeps the battle on hold
  $('#modal-body').querySelectorAll('[data-pz]').forEach(btn => btn.addEventListener('click', () => {
    Sound.play('click');
    const k = btn.dataset.pz;
    if (k === 'resume') closeModal();
    else if (k === 'settings') openSettings(openPause);
    else if (k === 'photo') { modalOnClose = null; closeModal(); startPhotoMode(); }
    else if (k === 'guide') { modalOnClose = null; openFieldGuide(false); modalOnClose = () => openPause(); }
    else if (k === 'retreat') { modalOnClose = null; closeModal(); B.paused = false; endBattle('retreat'); }
  }));
}

/* ================= After-action report ================= */
function stormReportHTML() {
  const names = { hq: 'Command Center gun', airstrike: 'Airstrikes', artillery: 'Artillery barrage', troops: 'Your troops', silo: 'Strategic missile', lightning: 'Lightning', mine: 'Land mines', wire: 'Barbed wire', hero: B.hero ? HEROES[B.hero.id].name : 'Hero' };
  const rows = Object.entries(B.dmgBy).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const top = rows.length ? rows[0][1] : 1;
  const bars = rows.length ? rows.map(([k, v]) => `<li class="bar-row"><span>${names[k] || (DEFS[k] ? DEFS[k].name : k)}</span><i style="--w:${(v / top * 100).toFixed(1)}%"></i><b>${fmt(v)}</b></li>`).join('') : '<li class="bar-row"><span>No damage dealt</span><i style="--w:0%"></i><b>0</b></li>';
  let mvp = null, mv = 0;
  for (const [id, v] of Object.entries(B.dmgByB)) if (v > mv) { mv = v; mvp = byId(+id); }
  const mvpHTML = mvp ? `<div class="mvp"><div class="mvp-art"></div><div><span class="stamp">MVP</span><b>${displayName(mvp.type, mvp.level)} · level ${mvp.level}</b><span>${fmt(mv)} damage · ${gridRef(mvp)}${vetRank(mvp.kills) ? ` · ${'★'.repeat(vetRank(mvp.kills))}` : ''}</span></div></div>` : '';
  const kills = Object.entries(B.killsBy).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<span class="kill-chip" data-type="${t}" title="${ENEMIES[t].name}"><i></i>&times;${n}</span>`).join('');
  return `${mvpHTML}<h3 class="report-h">Damage dealt</h3><ul class="units report bars">${bars}</ul>${kills ? `<h3 class="report-h">Enemies destroyed</h3><div class="kill-row">${kills}</div>` : ''}`;
}
function decorateReport() {
  const body = $('#modal-body');
  body.querySelectorAll('.kill-chip').forEach(el => el.querySelector('i').appendChild(renderEnemyPreview(el.dataset.type, 22)));
  const art = body.querySelector('.mvp-art');
  if (art && B) {
    let mvp = null, mv = 0;
    for (const [id, v] of Object.entries(B.dmgByB)) if (v > mv) { mv = v; mvp = byId(+id); }
    if (mvp) art.appendChild(renderPreview(mvp.type, Math.max(1, mvp.level), 64));
  }
}

/* ================= Hall of Fame ================= */
function recordRun() {
  if (!B || B.mission || B.practice || B.waves < 1 || (B.checkpoint && B.waves <= B.checkpoint)) return 0;
  if (!S.hof) S.hof = [];
  const run = { wave: B.waves, kills: B.kills, threat: B.threat.name, date: Date.now(), hero: B.hero ? HEROES[B.hero.id].name : '', streak: B.bestStreak, wg: B.wg.length, gold: B.loot.gold };
  S.hof.push(run);
  S.hof.sort((a, b) => b.wave - a.wave || b.kills - a.kills);
  S.hof = S.hof.slice(0, 10);
  const R = S.records || (S.records = {});
  const fresh = [];
  const up = (k, v, label) => { if (v > (R[k] || 0)) { if (R[k]) fresh.push(label); R[k] = v; } };
  up('bestHit', Math.round(B.bestHit), 'Hardest hit');
  up('bestStreak', B.bestStreak, 'Best kill streak');
  up('mostKills', B.kills, 'Most kills in a battle');
  up('mostGold', B.loot.gold, 'Most gold in a battle');
  B.freshRecords = fresh;
  const rank = S.hof.indexOf(run) + 1;
  return rank;
}
function openHallOfFame(back) {
  const hof = S.hof || [], R = S.records || {};
  const rows = hof.length ? hof.map((r, i) => `<li class="hof-row ${i === 0 ? 'gold' : i < 3 ? 'top' : ''}"><span class="hof-n">${i + 1}</span><span class="hof-w">Wave ${r.wave}</span><span class="hof-d">${fmt(r.kills)} kills · ${r.threat}${r.wg ? ` · ${r.wg} War Games` : ''}${r.hero ? ` · ${r.hero}` : ''}</span><span class="hof-date">${new Date(r.date).toLocaleDateString()}</span></li>`).join('')
    : '<li class="hof-row"><span class="hof-d">No endless battles recorded yet. Start a battle to set your first record.</span></li>';
  const recs = [['Best wave', S.bestWave || 0], ['Hardest single hit', fmt(R.bestHit || 0)], ['Best kill streak', R.bestStreak || 0], ['Most kills in a battle', fmt(R.mostKills || 0)], ['Most gold in a battle', fmt(R.mostGold || 0)], ['Titan Mechs destroyed', S.stats.titans || 0]];
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Hall of Fame</h2><span class="m-count">${S.name}</span></div>
      <p class="lead">Your ten best endless battles on this device.</p>
      <ol class="hof">${rows}</ol>
      <h3 class="report-h">Personal records</h3>
      <ul class="units report record">${recs.map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join('')}</ul>
      <div class="settings-row"><button class="btn" data-close>Done</button></div>
    </div>`, back || null);
}

/* ================= Doctrine and War Games screens ================= */
function openDoctrines(back) {
  if (!doctrineUnlocked()) { toast(`Doctrines unlock at Command Center ${DOCTRINE_HQ}`, 'info'); return; }
  const cur = doctrine().id;
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Doctrine</h2><span class="m-count">One at a time</span></div>
      <p class="lead">Your doctrine shapes every battle. Switch any time between battles.</p>
      <div class="doc-grid">${DOCTRINES.map(d => `<button class="doc ${d.id === cur ? 'on' : ''}" data-doc="${d.id}"><b>${d.name}</b><span>${d.desc}</span></button>`).join('')}</div>
      <div class="settings-row"><button class="btn" data-close>Done</button></div>
    </div>`, back || null);
  $('#modal-body').querySelectorAll('[data-doc]').forEach(el => el.addEventListener('click', () => {
    S.doctrine = el.dataset.doc; save(); Sound.play('click');
    $('#modal-body').querySelectorAll('[data-doc]').forEach(x => x.classList.toggle('on', x === el));
  }));
}

// Extra rows for the endless battle briefing: doctrine and War Games toggles.
function briefExtrasHTML() {
  const wg = activeWargames(), bonus = Math.round(wargamesLoot() * 100);
  return `
    <h3 class="report-h">War Games <small>${wg.length}/${WARGAMES_MAX} · ${bonus ? `+${bonus}% loot` : 'optional, extra loot'}</small></h3>
    <div class="wg-row">${WARGAMES.map(w => `<button class="wg ${wg.includes(w.id) ? 'on' : ''}" data-wg="${w.id}"><b>${w.name}</b><span>${w.desc}</span><i>+${Math.round(w.loot * 100)}%</i></button>`).join('')}</div>
    ${warBriefHTML()}
    <div class="doc-line">${doctrineUnlocked() ? `Doctrine: <b>${doctrine().name}</b> · ${doctrine().desc} <button class="btn ghost small" id="btn-doctrine">Change</button>` : `Doctrines unlock at Command Center ${DOCTRINE_HQ}`}</div>`;
}
function wireBriefExtras(reopen) {
  const body = $('#modal-body');
  body.querySelectorAll('[data-wg]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.wg;
    S.wargames = activeWargames();
    if (S.wargames.includes(id)) S.wargames = S.wargames.filter(x => x !== id);
    else if (S.wargames.length >= WARGAMES_MAX) { toast(`Pick up to ${WARGAMES_MAX} War Games`, 'bad'); Sound.play('error'); return; }
    else S.wargames.push(id);
    save(); Sound.play('click'); reopen();
  }));
  const d = body.querySelector('#btn-doctrine');
  if (d) d.addEventListener('click', () => openDoctrines(reopen));
  warWireBrief(reopen);
}

/* ================= Battle UI wiring ================= */
function initStormBattleUI() {
  $('#btn-pause').addEventListener('click', () => { Sound.play('click'); openPause(); });
  $('#btn-nuke').addEventListener('click', onNukeClick);
  const mm = $('#minimap');
  mm.addEventListener('pointerdown', e => { e.stopPropagation(); mm.setPointerCapture(e.pointerId); mm.dataset.drag = '1'; minimapPointer(e); });
  mm.addEventListener('pointermove', e => { if (mm.dataset.drag) minimapPointer(e); });
  const up = () => { delete mm.dataset.drag; };
  mm.addEventListener('pointerup', up); mm.addEventListener('pointercancel', up);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && B && !B.over && !B.paused && S.settings.autopause !== false && modal.hidden) openPause();
  });
}
