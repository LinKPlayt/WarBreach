// WarBreach — Update 4.0 "Warlords": new weather, morale and the Rally Cry, Sentry Gun, Drone Hangar,
// Stealth Bombers, Shield Drones, Flame Tanks, Maj. Kade, Shield Troopers, endless checkpoints,
// battle forecast, Vault, Trading Post, defense mastery, base power and leagues, gear upgrades,
// layout share codes, the Intel feed and undo-sell.
'use strict';

BULLET_SRC.add('sentry'); BULLET_SRC.add('hangar');

/* ================= Battle forecast ================= */
function weatherPool() {
  const tw = THEME_WEATHER[S.theme] || {};
  return WEATHER.map(w => ({ ...w, weight: w.weight * (tw[w.id] != null ? tw[w.id] : 1) })).filter(w => w.weight > 0);
}
function forecast() {
  const f = S.forecast;
  if (!f || !WEATHER.some(w => w.id === f.w) || !DAYTIME.some(d => d.id === f.d)) S.forecast = { w: pickWeighted(weatherPool()).id, d: pickWeighted(DAYTIME).id };
  return { weather: WEATHER.find(w => w.id === S.forecast.w), daytime: DAYTIME.find(d => d.id === S.forecast.d) };
}
function takeForecast() { const f = forecast(); S.forecast = null; return f; }
function rerollForecast() {
  if (S.medals < FORECAST_REROLL) { toast(`Rerolling the forecast costs ${FORECAST_REROLL} medals`, 'bad'); Sound.play('error'); return false; }
  forecast();
  const old = S.forecast;
  S.medals -= FORECAST_REROLL;
  for (let i = 0; i < 8; i++) { S.forecast = null; forecast(); if (S.forecast.w !== old.w || S.forecast.d !== old.d) break; }
  Sound.play('click'); save();
  return true;
}
function weatherEffect(w) {
  const bits = [];
  if (w.range < 1) bits.push(`ranges -${Math.round((1 - w.range) * 100)}%`);
  if (w.slow) bits.push(`enemies ${Math.round((1 - w.slow) * 100)}% slower`);
  if (w.fireRate) bits.push(`guns ${Math.round((1 - w.fireRate) * 100)}% slower`);
  if (w.lightning) bits.push('lightning strikes');
  return bits.join(', ') || 'no effect';
}

/* ================= Endless checkpoints ================= */
function checkpoints() { const out = [0]; for (let c = 10; c <= 50; c += 10) if ((S.bestWave || 0) >= c) out.push(c); return out; }

/* ================= Battle hooks ================= */
function warBattleStart() {
  Object.assign(B, { morale: 0, rallyT: 0, hangar: [], lightningT: 4 + Math.random() * 4, lightFlash: 0, bombs: [], shieldDrones: [], checkpoint: 0 });
  const cp = S.checkpoint || 0;
  if (!B.mission && !B.practice && cp > 0 && checkpoints().includes(cp)) {
    B.wave = cp; B.waves = cp; B.breakT = 5; B.checkpoint = cp;
    // the field upgrades you would have picked on the way up
    const pool = WAVE_CARDS.filter(c => c.apply);
    for (let i = 0; i < Math.floor(cp / 5); i++) { const c = pool[Math.floor(Math.random() * pool.length)]; B.cards.push(c.id); c.apply(B.bonus); }
    banner(`Checkpoint: wave ${cp + 1}`, `${Math.floor(cp / 5)} field upgrades already active`);
  }
  if (!B.practice && STORM_WEATHERS.includes(B.weather.id)) S.stats.storms = (S.stats.storms || 0) + 1;
  updateRallyButton(true);
}

function warBattleUpdate(dt) {
  if (B.rallyT > 0) B.rallyT -= dt;
  B.shieldDrones = B.units.filter(u => u.hp > 0 && ENEMIES[u.type].shieldAura);
  updateLightning(dt);
  updateHangars(dt);
  updateBombs(dt);
  updateRallyButton();
}

function warWeaponMod(b, w) {
  if (B) {
    if (B.rallyT > 0) w.fireRate *= 1 + MORALE.fireRate;
    if (B.weather && B.weather.fireRate) w.fireRate *= B.weather.fireRate;
    const H = B.hero, aura = HEROES.artillery.aura;
    if (H && !H.dead && H.id === 'artillery' && aura.types.includes(b.type)) {
      const c = centerOf(b);
      if (Math.hypot(c.x - H.x, c.y - H.y) <= aura.radius * TILE) w.dmg *= 1 + aura.bonus;
    }
  }
  const m = masteryTier((S.mastery || {})[b.type]);
  if (m) w.dmg *= 1 + MASTERY.bonus[m - 1];
  return legendWeaponMod(b, w);
}

function warDamageMod(u, ed, dmg, src) {
  if (B.rallyT > 0 && (src === 'troops' || src === 'hero')) dmg *= 1 + MORALE.troopDmg;
  if (B.shieldDrones.length && !ed.shieldAura) {
    const R = ENEMIES.shielddrone.shieldAura * TILE;
    for (const d of B.shieldDrones) if (d !== u && d.hp > 0 && Math.hypot(d.x - u.x, d.y - u.y) <= R) { dmg *= 0.5; d.pulse = 0.25; break; }
  }
  return dmg;
}

function warEnemyKilled(u, e) {
  if (B.practice) return;
  B.morale = Math.min(100, B.morale + (e.boss ? MORALE.perBoss : e.vehicle || e.air ? MORALE.perVehicle : MORALE.perKill));
  if (SHOOTER && !SHOOTER._dead && DEFS[SHOOTER.type] && DEFS[SHOOTER.type].dmg) addMastery(SHOOTER.type, 1);
}

/* ================= Morale and the Rally Cry ================= */
let rallyKey = '';
function updateRallyButton(force) {
  const btn = $('#btn-rally');
  if (!btn) return;
  const show = !!B && !B.over && !B.practice;
  if (btn.hidden === show) btn.hidden = !show;
  if (!show) return;
  const k = B.rallyT > 0 ? 'on' + Math.ceil(B.rallyT) : String(Math.floor(B.morale / 2));
  if (k === rallyKey && !force) return;
  rallyKey = k;
  btn.style.setProperty('--p', (100 - B.morale).toFixed(1) + '%');
  btn.classList.toggle('ready', B.morale >= 100 && !(B.rallyT > 0));
  btn.classList.toggle('active', B.rallyT > 0);
  btn.querySelector('.rl-cd').textContent = B.rallyT > 0 ? Math.ceil(B.rallyT) + 's' : B.morale >= 100 ? '' : Math.floor(B.morale) + '%';
}
function rallyCry() {
  if (!B || B.over) return false;
  if (B.morale < 100) { toast('Morale is still building. Keep the kills coming', 'info'); Sound.play('error'); return false; }
  B.morale = 0; B.rallyT = MORALE.rallyTime;
  S.stats.rallies = (S.stats.rallies || 0) + 1;
  const c = centerOf(hq());
  B.fx.push({ kind: 'ring', x: c.x, y: c.y, r: 9 * TILE, life: 1.2, max: 1.2, color: '242,182,50' });
  banner('Rally Cry!', `Defenses fire ${Math.round(MORALE.fireRate * 100)}% faster, troops hit ${Math.round(MORALE.troopDmg * 100)}% harder`);
  Sound.play('medal'); Sound.play('alarm'); buzz([40, 30, 80]);
  updateRallyButton(true);
  return true;
}

/* ================= Weather: lightning ================= */
function updateLightning(dt) {
  if (B.lightFlash > 0) B.lightFlash = Math.max(0, B.lightFlash - dt * 2.5);
  if (!B.weather || !B.weather.lightning) return;
  B.lightningT -= dt;
  if (B.lightningT > 0) return;
  B.lightningT = 4 + Math.random() * 5;
  let x, y, hit = null;
  const live = B.units.filter(u => u.hp > 0);
  if (live.length && Math.random() < 0.85) {
    hit = live[Math.floor(Math.random() * live.length)];
    x = hit.x; y = hit.y - (hit.air ? 18 : 0);
  } else {
    const bs = S.buildings.filter(b => !b._dead && !isPassive(b.type) && b.type !== 'hq' && b._maxhp);
    if (bs.length && Math.random() < 0.5) { const b = bs[Math.floor(Math.random() * bs.length)], c = centerOf(b); x = c.x; y = c.y; damageBuilding(b, b._maxhp * 0.04); }
    else { x = TILE * (2 + Math.random() * (MAP_W - 4)); y = TILE * (2 + Math.random() * (MAP_H - 4)); }
  }
  if (hit) { SHOOTER = null; damageEnemy(hit, 150 + Math.max(1, B.wave) * 20, 'lightning'); }
  const sx = x + (Math.random() - 0.5) * 80;
  B.fx.push({ kind: 'bolt', x1: sx, y1: y - 460, x2: x, y2: y, life: 0.28, seed: Math.random() * 999 });
  B.fx.push({ kind: 'bolt', x1: sx + 20, y1: y - 300, x2: x, y2: y, life: 0.18, seed: Math.random() * 999 });
  B.fx.push({ kind: 'light', x, y, r: 160, life: 0.35, max: 0.35 });
  addDecal({ kind: 'crater', x, y, r: 8, life: 20 });
  B.lightFlash = 1;
  addShake(3); Sound.play('zap'); Sound.play('boom');
}

/* ================= Drone Hangar ================= */
function updateHangars(dt) {
  for (const b of S.buildings) {
    if (b.type !== 'hangar' || b.level < 1 || b._dead) continue;
    const mine = B.hangar.filter(d => d.home === b).length;
    b._launchT = (b._launchT || 0) - dt;
    if (mine < hangarDroneCount(b.level) && b._launchT <= 0) {
      b._launchT = 1.2;
      const c = centerOf(b);
      B.hangar.push({ home: b, x: c.x, y: c.y - 6, a: Math.random() * 6, cd: 0.4, tgt: null, flash: 0 });
    }
  }
  for (const d of B.hangar) {
    const b = d.home;
    if (b._dead) { d.down = true; explosion(d.x, d.y, 10); continue; }
    const w = weaponOf(b);
    if (!w) { d.down = true; continue; }
    const c = centerOf(b), R = w.range * TILE;
    const valid = u => u && u.hp > 0 && !(ENEMIES[u.type].stealth && !u.revealed) && Math.hypot(u.x - c.x, u.y - c.y) <= R;
    if (!valid(d.tgt)) {
      d.tgt = null;
      let bd = R;
      for (const u of B.units) if (valid(u)) { const dd = Math.hypot(u.x - c.x, u.y - c.y); if (dd < bd) { bd = dd; d.tgt = u; } }
    }
    d.a += dt * 3; d.cd -= dt; if (d.flash > 0) d.flash -= dt;
    const goal = d.tgt ? { x: d.tgt.x + Math.cos(d.a) * 30, y: d.tgt.y - (d.tgt.air ? 18 : 0) - 26 + Math.sin(d.a) * 14 } : { x: c.x + Math.cos(d.a) * 24, y: c.y - 30 + Math.sin(d.a) * 10 };
    const dx = goal.x - d.x, dy = goal.y - d.y, dist = Math.hypot(dx, dy), step = Math.min(dist, 200 * dt);
    if (dist > 0.5) { d.x += dx / dist * step; d.y += dy / dist * step; }
    if (d.tgt && d.cd <= 0 && Math.hypot(d.tgt.x - d.x, d.tgt.y - d.y) < 100 && !(b._stun > 0)) {
      d.cd = 1 / w.fireRate; d.flash = 0.05;
      SHOOTER = b;
      damageEnemy(d.tgt, w.dmg, 'hangar');
      SHOOTER = null;
      B.fx.push({ kind: 'tracer', x1: d.x, y1: d.y, x2: d.tgt.x, y2: d.tgt.y - (d.tgt.air ? 18 : 2), life: 0.06, color: '#9fe0ff' });
      Sound.play('mg');
    }
  }
  B.hangar = B.hangar.filter(d => !d.down);
}

/* ================= New enemies ================= */
function warEnemyUpdate(u, e, dt) {
  if (e.bomber) { updateBomber(u, e, dt); return true; }
  if (e.shieldAura) { updateShieldDrone(u, e, dt); return true; }
  if (decoyPull(u, e, dt)) return true;
  // Shield Troopers pull nearby ground enemies onto themselves (only with a clear line to them)
  if (!u.air && !e.sapper && !e.heal && !e.boss && B.troops.length) {
    const tr = tauntAt(u);
    if (tr) {
      const d = Math.hypot(tr.x - u.x, tr.y - u.y);
      if (d > (e.range + 0.1) * TILE) {
        const sp = Math.min(d, e.speed * (B.mods.fast || 1) * u.slow * TILE * dt);
        u.x += (tr.x - u.x) / d * sp; u.y += (tr.y - u.y) / d * sp;
        u.angle = u.aim = Math.atan2(tr.y - u.y, tr.x - u.x); u.moving = true; u.walk += dt * e.speed * 9;
        return true;
      }
    }
  }
  return false;
}
// True when no live building stands between two points (`ignore` is the building being aimed at, if any).
function clearLine(x1, y1, x2, y2, ignore) {
  const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (TILE / 2));
  for (let i = 1; i < n; i++) {
    const x = x1 + (x2 - x1) * i / n, y = y1 + (y2 - y1) * i / n;
    const hit = liveBuildingAtTile(Math.floor(x / TILE), Math.floor(y / TILE));
    if (hit && hit !== ignore) return false;
  }
  return true;
}
function tauntAt(u) {
  for (const t of B.troops) {
    const d = TROOPS[t.kind];
    if (t.hp <= 0 || !d.taunt || t.drop > 0) continue;
    if (Math.hypot(t.x - u.x, t.y - u.y) <= d.taunt * TILE && clearLine(u.x, u.y, t.x, t.y)) return t;
  }
  return null;
}

function startBomberRun(u) {
  const h = centerOf(hq());
  const tx = h.x + (Math.random() - 0.5) * 8 * TILE, ty = h.y + (Math.random() - 0.5) * 6 * TILE;
  const a = Math.random() * Math.PI * 2;
  const sp = ENEMIES.bomber.speed * TILE * 1.4;
  // start just outside the map edge on the far side of the target
  const back = edgeDistance(tx, ty, -Math.cos(a), -Math.sin(a), BOMBER_PAD);
  u.x = tx - Math.cos(a) * back; u.y = ty - Math.sin(a) * back;
  u.run = { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, n: (u.run ? u.run.n : 0) + 1, dropT: 0 };
}
const BOMBER_PAD = 90;
// Distance from (x, y) along (dx, dy) until leaving the map grown by pad pixels.
function edgeDistance(x, y, dx, dy, pad) {
  const W = MAP_W * TILE, H = MAP_H * TILE;
  let t = Infinity;
  if (dx > 1e-6) t = Math.min(t, (W + pad - x) / dx); else if (dx < -1e-6) t = Math.min(t, (-pad - x) / dx);
  if (dy > 1e-6) t = Math.min(t, (H + pad - y) / dy); else if (dy < -1e-6) t = Math.min(t, (-pad - y) / dy);
  return Math.max(0, t);
}
function updateBomber(u, e, dt) {
  if (!u.run) startBomberRun(u);
  const r = u.run, k = (B.mods.fast || 1) * (B.faction && B.faction.airSpeed ? B.faction.airSpeed : 1);
  u.x += r.vx * dt * k; u.y += r.vy * dt * k;
  u.angle = u.aim = Math.atan2(r.vy, r.vx); u.moving = true; u.walk += dt * 10;
  r.dropT -= dt;
  if (r.dropT <= 0 && inBuildArea(Math.floor(u.x / TILE), Math.floor(u.y / TILE))) {
    r.dropT = 0.3;
    B.bombs.push({ x: u.x, y: u.y, t: 0, dur: 0.55, dmg: e.dmg * (u.elite ? ELITE.dmg : 1) * (1 + 0.04 * Math.max(0, B.wave - 18)), splash: e.splash });
    Sound.play('mortar');
  }
  const W = MAP_W * TILE, H = MAP_H * TILE, m = BOMBER_PAD + 10, out = u.x < -m || u.x > W + m || u.y < -m || u.y > H + m;
  if (out && r.away) { if (r.n >= 2) { u.hp = 0; u.escaped = true; } else startBomberRun(u); }
  if (!out) r.away = true;
}
function updateBombs(dt) {
  for (const p of B.bombs) {
    p.t += dt;
    if (p.t < p.dur) continue;
    p.done = true;
    const R = p.splash;
    for (const b of S.buildings) if (!b._dead && !isPassive(b.type) && distToBuilding(p.x, p.y, b) <= R) damageBuilding(b, p.dmg);
    for (const t of B.troops) if (t.hp > 0 && Math.hypot(t.x - p.x, t.y - p.y) <= R * TILE) damageAlly(t, p.dmg * 0.5);
    explosion(p.x, p.y, 22);
  }
  B.bombs = B.bombs.filter(p => !p.done);
}
function updateShieldDrone(u, e, dt) {
  if (u.pulse > 0) u.pulse -= dt;
  if (!u.escort || u.escort.hp <= 0 || !B.units.includes(u.escort)) {
    u.escort = null;
    let best = 0;
    for (const o of B.units) {
      if (o.hp <= 0 || o.air) continue;
      const s = o.max / (1 + Math.hypot(o.x - u.x, o.y - u.y) / 200);
      if (s > best) { best = s; u.escort = o; }
    }
  }
  if (!u.escort) {
    // nothing left to protect: it flies home once the wave has nothing more to send
    if (!B.queue.length) { u.hp = 0; u.escaped = true; }
    return;
  }
  u.a = (u.a || Math.random() * 6) + dt * 1.5;
  const gx = u.escort.x + Math.cos(u.a) * 20, gy = u.escort.y + Math.sin(u.a) * 14;
  const dx = gx - u.x, dy = gy - u.y, d = Math.hypot(dx, dy) || 1;
  const step = Math.min(d, e.speed * TILE * dt * 1.6);
  u.x += dx / d * step; u.y += dy / d * step;
  u.angle = Math.atan2(dy, dx); u.aim = u.angle; u.walk += dt * 6; u.moving = d > 2;
}

/* ================= Maj. Kade ================= */
function kadeBarrage(H, st, def) {
  const t = H.tgt || nearestEnemy(H.x, H.y, 9);
  const ang = t ? Math.atan2(t.y - H.y, t.x - H.x) : (H.aim || 0);
  for (let i = 0; i < 8; i++) {
    const d = (1.6 + i * 0.75) * TILE;
    const tx = H.x + Math.cos(ang) * d + (Math.random() - 0.5) * 20, ty = H.y + Math.sin(ang) * d + (Math.random() - 0.5) * 20;
    B.shots.push({ kind: 'mortar', x: H.x, y: H.y, sx: H.x, sy: H.y, tx, ty, t: -i * 0.18, dur: 0.9, arc: 120, dmg: st.abilityDmg, splash: def.ability.radius, air: false, src: 'hero', big: true });
  }
  Sound.play('mortar');
}

/* ================= Drawing ================= */
function drawWarGround(ctx) {
  if (!B) return;
  const H = B.hero;
  if (H && !H.dead && H.id === 'artillery') {
    ctx.strokeStyle = 'rgba(242,182,50,0.22)'; ctx.setLineDash([6, 8]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(H.x, H.y, HEROES.artillery.aura.radius * TILE, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  }
  if (B.rallyT > 0) {
    const k = 0.5 + Math.sin(tSec * 6) * 0.2;
    for (const b of S.buildings) {
      if (b._dead || !DEFS[b.type].dmg || DEFS[b.type].trap) continue;
      const c = centerOf(b);
      ctx.strokeStyle = `rgba(242,182,50,${k * 0.6})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(c.x, c.y + 4, DEFS[b.type].size * TILE * 0.5, DEFS[b.type].size * TILE * 0.32, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }
  for (const p of B.bombs) {
    const k = Math.min(1, p.t / p.dur);
    ctx.fillStyle = `rgba(0,0,0,${0.15 + k * 0.25})`; ctx.beginPath(); ctx.ellipse(p.x, p.y, 3 + k * 6, 2 + k * 3, 0, 0, Math.PI * 2); ctx.fill();
  }
}
function drawWarAir(ctx) {
  if (!B) return;
  for (const p of B.bombs) {
    const k = Math.min(1, p.t / p.dur), y = p.y - 34 * (1 - k);
    ctx.fillStyle = '#1e211c'; ctx.beginPath(); ctx.ellipse(p.x, y, 2.5, 4.5, 0, 0, Math.PI * 2); ctx.fill();
  }
  for (const d of B.hangar) {
    drawQuadDrone(ctx, d.x, d.y, '#6ec0ff', 24);
    if (d.flash > 0) { ctx.fillStyle = '#e8f7ff'; ctx.beginPath(); ctx.arc(d.x + 6, d.y + 2, 2.5, 0, Math.PI * 2); ctx.fill(); }
  }
  for (const u of B.shieldDrones) {
    const R = ENEMIES.shielddrone.shieldAura * TILE, k = u.pulse > 0 ? 1 : 0.5;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(200,120,255,${0.25 * k})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(u.x, u.y, R, R * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = `rgba(200,120,255,${0.05 * k})`; ctx.fill();
    ctx.restore();
  }
}
function warLights(L, C) {
  if (!B) return;
  for (const d of B.hangar) if (d.flash > 0) L.push({ x: d.x, y: d.y + 20, r: 40, i: 0.8, c: C.blue, hot: true });
  if (B.lightFlash > 0) L.push({ x: cam.x, y: cam.y, r: 3000, i: B.lightFlash * 0.45, c: C.white });
  if (B.rallyT > 0) { const c = centerOf(hq()); L.push({ x: c.x, y: c.y, r: 260, i: 0.5, c: C.warm }); }
}

STORM_ART.bomber = function (ctx, u, e, white) {
  const alt = 46;
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.save(); ctx.translate(alt * 0.4, alt * 0.55); ctx.rotate(u.angle);
  ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(-18, -34); ctx.lineTo(-10, 0); ctx.lineTo(-18, 34); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.translate(0, -alt); ctx.rotate(u.angle);
  const body = white ? '#fff' : '#26282b';
  ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(28, 0); ctx.lineTo(-16, -34); ctx.lineTo(-22, -30); ctx.lineTo(-12, -8); ctx.lineTo(-20, 0); ctx.lineTo(-12, 8); ctx.lineTo(-22, 30); ctx.lineTo(-16, 34); ctx.closePath(); ctx.fill();
  if (!white) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(-14, -30); ctx.lineTo(-8, -6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(160,210,230,0.5)'; rr(ctx, 8, -3, 10, 6, 3); ctx.fill();
    ctx.fillStyle = Math.sin(tSec * 9) > 0 ? '#ff3a2a' : '#5a1810'; ctx.beginPath(); ctx.arc(-16, -32, 1.6, 0, Math.PI * 2); ctx.arc(-16, 32, 1.6, 0, Math.PI * 2); ctx.fill();
  }
};
STORM_ART.shielddrone = function (ctx, u, e, white) {
  const alt = 22;
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(alt * 0.35, alt * 0.45, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(0, -alt + Math.sin(u.walk) * 1.5);
  ctx.fillStyle = white ? '#fff' : '#4a3d5c'; ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.lineTo(Math.cos(a) * 9, Math.sin(a) * 9); }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = `rgba(210,150,255,${0.6 + Math.sin(tSec * 6) * 0.3})`; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(220,220,210,0.35)'; ctx.lineWidth = 1;
  for (const a of [0.8, 2.4, 3.9, 5.5]) { ctx.beginPath(); ctx.ellipse(Math.cos(a) * 11, Math.sin(a) * 11, 4, 4 * Math.abs(Math.sin(tSec * 40 + a)), 0, 0, Math.PI * 2); ctx.stroke(); }
};
STORM_ART.flametank = function (ctx, u, e, white) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(4, 5, e.r + 3, e.r * 0.75, u.angle, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.rotate(u.angle);
  const L = 34, W = 22;
  ctx.fillStyle = '#211c19'; rr(ctx, -L / 2, -W / 2 - 2, L, 7, 2); ctx.fill(); rr(ctx, -L / 2, W / 2 - 5, L, 7, 2); ctx.fill();
  hullBox(ctx, L - 6, W - 6, white ? '#fff' : '#5a3a2a', white);
  if (!white) { for (const oy of [-5, 5]) { ctx.fillStyle = '#c8562a'; rr(ctx, -14, oy - 3, 12, 6, 3); ctx.fill(); } }
  ctx.restore();
  ctx.rotate(u.aim);
  ctx.fillStyle = '#2a2420'; ctx.fillRect(6, -2, 16, 4);
  ctx.fillStyle = white ? '#fff' : '#3e2a20'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
  if (u.flash > 0 || (u.tgt && !u.moving)) { ctx.fillStyle = '#ff9a3a'; ctx.beginPath(); ctx.arc(24, 0, 3 + Math.random() * 2, 0, Math.PI * 2); ctx.fill(); }
};

DRAW.sentry = function (ctx, b, t) {
  const x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  box(ctx, x + 4, y + 8, TILE - 8, TILE - 12, 8, L >= 6 ? '#9aa3ab' : '#8a8676', L >= 6 ? '#5e666e' : '#5d5a4e', 3);
  const cx = x + TILE / 2, cy = y + TILE / 2 - 6;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(b.angle || 0);
  ctx.fillStyle = '#17130f'; ctx.fillRect(4, -3.2, 12, 2.2); ctx.fillRect(4, 1, 12, 2.2);
  ctx.fillStyle = '#4b5639'; rr(ctx, -7, -7, 13, 14, 4); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; rr(ctx, -6, -6, 11, 5, 3); ctx.fill();
  ctx.fillStyle = '#ff5a3c'; ctx.beginPath(); ctx.arc(-2, 0, 1.6, 0, Math.PI * 2); ctx.fill();
  if (b._flash > 0) { ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.arc(17, 0, 3, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  levelChevrons(ctx, x + TILE - 7, y + TILE - 6, Math.min(3, Math.ceil(L / 4)));
};
DRAW.hangar = function (ctx, b, t) {
  const S2 = 2 * TILE, x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  pad(ctx, x, y, S2, '#4a4f55', 3);
  // arched hangar
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x + 42, y + 58, 34, 14, 0, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createLinearGradient(x, y + 20, x, y + 60); g.addColorStop(0, L >= 8 ? '#a9b2ba' : '#8d9399'); g.addColorStop(1, '#5a6066');
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x + 10, y + 60); ctx.lineTo(x + 10, y + 34); ctx.quadraticCurveTo(x + 40, y + 6, x + 70, y + 34); ctx.lineTo(x + 70, y + 60); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(x + 10 + i * 12, y + 60); ctx.lineTo(x + 10 + i * 12, y + 24 + Math.abs(i - 2.5) * 6); ctx.stroke(); }
  ctx.fillStyle = '#1b1e22'; rr(ctx, x + 26, y + 40, 28, 20, 3); ctx.fill();
  ctx.fillStyle = PAL.hazard; for (let i = 0; i < 4; i++) ctx.fillRect(x + 27 + i * 7, y + 58, 4, 2);
  ctx.fillStyle = `rgba(110,190,255,${0.5 + Math.sin(t * 4 + b.id) * 0.3})`; ctx.fillRect(x + 30, y + 44, 20, 2);
  if (typeof B === 'undefined' || !B) drawQuadDrone(ctx, x + 64, y + 18 + Math.sin(t * 2 + b.id) * 0.6, '#6ec0ff', 3);
};
DRAW.vault = function (ctx, b, t) {
  const S2 = 2 * TILE, x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  pad(ctx, x, y, S2, '#5c5f58', 3);
  box(ctx, x + 10, y + 30, 60, 38, 18, L >= 6 ? '#8d9399' : '#7d7a63', L >= 6 ? '#555b61' : '#545240', 6);
  const cx = x + 40, cy = y + 36;
  ctx.fillStyle = '#2b2e25'; ctx.beginPath(); ctx.arc(cx, cy, 12, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#c9a646'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.stroke();
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.3 + b.id);
  for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.fillStyle = '#c9a646'; ctx.fillRect(-1, 2, 2, 7); }
  ctx.restore();
  ctx.fillStyle = '#f2b632'; ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < Math.min(4, 1 + Math.floor(L / 3)); i++) { ctx.fillStyle = '#f5c542'; ctx.beginPath(); ctx.ellipse(x + 16 + i * 6, y + 62, 3, 2, 0, 0, Math.PI * 2); ctx.fill(); }
};
DRAW.tradepost = function (ctx, b, t) {
  const S2 = 2 * TILE, x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  pad(ctx, x, y, S2, '#7d7a63', 3);
  box(ctx, x + 8, y + 36, 40, 30, 14, '#a07a4a', '#6d5029', 3);
  ctx.fillStyle = '#c8402a'; ctx.beginPath(); ctx.moveTo(x + 6, y + 24); ctx.lineTo(x + 50, y + 24); ctx.lineTo(x + 46, y + 14); ctx.lineTo(x + 10, y + 14); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e9e4d4'; for (let i = 0; i < 5; i++) ctx.fillRect(x + 12 + i * 8, y + 14, 4, 10);
  // crates and a weighing scale
  box(ctx, x + 54, y + 52, 14, 12, 8, '#8a7a3c', '#5e5228', 2);
  box(ctx, x + 56, y + 40, 10, 9, 6, '#6b7443', '#4a522c', 2);
  const tilt = Math.sin(t * 1.4 + b.id) * 0.18;
  ctx.save(); ctx.translate(x + 62, y + 22); ctx.rotate(tilt);
  ctx.strokeStyle = '#3c4148'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.stroke();
  ctx.fillStyle = '#f5c542'; ctx.beginPath(); ctx.arc(-10, 4, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#a9b6c1'; ctx.beginPath(); ctx.arc(10, 4, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#3c4148'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 62, y + 22); ctx.lineTo(x + 62, y + 40); ctx.stroke();
  void L;
};

function warChips(b, L, nextL) {
  const chip = (label, v, nv) => `<span class="chip"><b>${label}</b>${v}${nv != null && nv !== v ? `<i>&rarr; ${nv}</i>` : ''}</span>`;
  let out = '';
  if (b.type === 'vault') out += chip('PROTECTS', fmt(vaultProtect(L)) + ' each', nextL && fmt(vaultProtect(nextL)) + ' each');
  if (b.type === 'tradepost') out += chip('RATE', Math.round(tradeRate(L) * 100) + '%', nextL && Math.round(tradeRate(nextL) * 100) + '%') + chip('DAILY', fmt(tradeLimit(L)), nextL && fmt(tradeLimit(nextL)));
  if (b.type === 'hangar') out += chip('DRONES', hangarDroneCount(L), nextL && hangarDroneCount(nextL));
  const m = masteryTier((S.mastery || {})[b.type]);
  if (DEFS[b.type].dmg && !DEFS[b.type].trap && m) out += `<span class="chip"><b>MASTERY</b>${MASTERY.names[m - 1]} <i class="vet">+${Math.round(MASTERY.bonus[m - 1] * 100)}%</i></span>`;
  return out;
}

/* ================= Shield Trooper look ================= */
function drawShieldOverlay(ctx, t) {
  if (t.kind !== 'shield') return;
  ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.aim || 0);
  ctx.fillStyle = t.hit > 0 ? '#fff' : '#3a4048'; rr(ctx, 6, -9, 4, 18, 2); ctx.fill();
  ctx.fillStyle = 'rgba(160,200,220,0.5)'; ctx.fillRect(7, -3, 2, 5);
  ctx.fillStyle = '#7fbf4d'; ctx.fillRect(6, -9, 4, 1.5);
  ctx.restore();
}

/* ================= Vault ================= */
function vaultProtection() { return S.buildings.filter(b => b.type === 'vault' && b.level >= 1).reduce((a, b) => a + vaultProtect(b.level), 0); }

/* ================= Trading Post ================= */
function tradePostLevel() { const b = S.buildings.find(x => x.type === 'tradepost' && x.level >= 1); return b ? b.level : 0; }
function tradeState() { const k = dayKey(); if (!S.trade || S.trade.day !== k) S.trade = { day: k, used: 0 }; return S.trade; }
function tradeAllowance() { const L = tradePostLevel(); return L ? Math.max(0, tradeLimit(L) - tradeState().used) : 0; }
function tradeQuote(from, to, amount) {
  const L = tradePostLevel();
  if (!L) return { ok: false, reason: 'Build a Trading Post first' };
  if (from === to || !TRADE_VALUE[from] || !TRADE_VALUE[to]) return { ok: false, reason: 'Pick two different resources' };
  amount = Math.floor(amount);
  if (!(amount > 0)) return { ok: false, reason: 'Nothing to trade' };
  if ((S[from] || 0) < amount) return { ok: false, reason: `Not enough ${from}` };
  const value = amount * TRADE_VALUE[from];
  if (value > tradeAllowance()) return { ok: false, reason: `Daily allowance left: ${fmt(tradeAllowance())} gold worth` };
  const out = Math.floor(value * tradeRate(L) / TRADE_VALUE[to]);
  if (out <= 0) return { ok: false, reason: 'Too small to trade' };
  if (storageCap() - (S[to] || 0) < out) return { ok: false, reason: `No room for ${fmt(out)} ${to}` };
  return { ok: true, from, to, amount, out, value };
}
function maxTrade(from, to) {
  const L = tradePostLevel();
  if (!L || from === to) return 0;
  const room = Math.max(0, storageCap() - (S[to] || 0));
  const byRoom = Math.floor((room + 0.999) * TRADE_VALUE[to] / tradeRate(L) / TRADE_VALUE[from]);
  let n = Math.max(0, Math.min(Math.floor(S[from] || 0), Math.floor(tradeAllowance() / TRADE_VALUE[from]), byRoom));
  while (n > 0 && !tradeQuote(from, to, n).ok) n--;
  return n;
}
function doTrade(from, to, amount) {
  const q = tradeQuote(from, to, amount);
  if (!q.ok) { toast(q.reason, 'bad'); Sound.play('error'); return q; }
  S[from] -= q.amount; S[to] += q.out;
  tradeState().used += q.value;
  S.stats.trades = (S.stats.trades || 0) + 1;
  logEvent('trade', `Traded ${fmt(q.amount)} ${from} for ${fmt(q.out)} ${to}`);
  pulseRes(to); Sound.play('collect'); save();
  return q;
}
let tradeSel = { from: 'gold', to: 'steel' };
function openTrading() {
  const L = tradePostLevel();
  if (!L) { toast('Build a Trading Post first (Economy tab, Command Center 5)', 'info'); return; }
  const kinds = ['gold', 'steel', 'oil'].filter(k => k !== 'oil' || (S.oil || 0) > 0 || hqLevel() >= 5);
  if (tradeSel.from === tradeSel.to) tradeSel.to = kinds.find(k => k !== tradeSel.from);
  const max = maxTrade(tradeSel.from, tradeSel.to);
  const amounts = [...new Set([0.1, 0.25, 0.5, 1].map(k => Math.floor(max * k)).filter(v => v > 0))];
  const seg = (side) => kinds.map(k => `<button class="seg-b ${tradeSel[side] === k ? 'on' : ''}" data-tr="${side}:${k}">${k}</button>`).join('');
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Trading Post</h2><span class="m-count">Level ${L} · rate ${Math.round(tradeRate(L) * 100)}%</span></div>
      <p class="lead">Daily allowance left: <b>${fmt(tradeAllowance())}</b> of ${fmt(tradeLimit(L))} gold worth (oil counts ${TRADE_VALUE.oil}x). Resets at midnight.</p>
      <div class="set-row"><div class="set-label"><b>Give</b></div><div class="seg">${seg('from')}</div></div>
      <div class="set-row"><div class="set-label"><b>Get</b></div><div class="seg">${seg('to')}</div></div>
      <div class="trade-amts">${amounts.length ? amounts.map(a => { const q = tradeQuote(tradeSel.from, tradeSel.to, a); return `<button class="btn ${q.ok ? '' : 'off'}" data-amt="${a}"><span class="btn-main">${fmt(a)} ${tradeSel.from}</span><span class="btn-sub">&rarr; ${q.ok ? fmt(q.out) : 0} ${tradeSel.to}</span></button>`; }).join('') : `<span class="lead">${tradeQuote(tradeSel.from, tradeSel.to, 1).reason || 'Nothing to trade right now'}</span>`}</div>
      <div class="settings-row"><button class="btn" data-close>Done</button></div>
    </div>`);
  const body = $('#modal-body');
  body.querySelectorAll('[data-tr]').forEach(b => b.addEventListener('click', () => {
    const [side, k] = b.dataset.tr.split(':'); tradeSel[side] = k;
    if (tradeSel.from === tradeSel.to) tradeSel[side === 'from' ? 'to' : 'from'] = kinds.find(x => x !== k);
    Sound.play('click'); openTrading();
  }));
  body.querySelectorAll('[data-amt]').forEach(b => b.addEventListener('click', () => { doTrade(tradeSel.from, tradeSel.to, +b.dataset.amt); openTrading(); }));
}

/* ================= Defense mastery ================= */
function addMastery(type, n) {
  if (!S.mastery) S.mastery = {};
  const before = masteryTier(S.mastery[type]);
  S.mastery[type] = (S.mastery[type] || 0) + n;
  const after = masteryTier(S.mastery[type]);
  if (after > before) {
    const msg = `${DEFS[type].name} mastery: ${MASTERY.names[after - 1]} (+${Math.round(MASTERY.bonus[after - 1] * 100)}% damage)`;
    toast(msg, 'good'); logEvent('mastery', msg);
  }
}
function masteryTypes() { return Object.keys(DEFS).filter(t => DEFS[t].dmg && !DEFS[t].trap && t !== 'hq'); }
function openMastery(back) {
  const rows = masteryTypes().map(t => {
    const k = (S.mastery || {})[t] || 0, tier = masteryTier(k), next = MASTERY.tiers[tier];
    const prev = tier ? MASTERY.tiers[tier - 1] : 0, pct = next ? Math.min(100, (k - prev) / (next - prev) * 100) : 100;
    return `<div class="ms-row"><span class="ms-name">${DEFS[t].name}</span><span class="ms-tier t${tier}">${tier ? MASTERY.names[tier - 1] : 'None'}</span>
      <div class="cap-bar"><div style="width:${pct.toFixed(1)}%"></div></div><span class="ms-n">${fmt(k)}${next ? ' / ' + fmt(next) : ''} kills${tier ? ` · +${Math.round(MASTERY.bonus[tier - 1] * 100)}%` : ''}</span></div>`;
  }).join('');
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Defense mastery</h2><span class="m-count">Kills by defense type</span></div>
      <p class="lead">Every kill a defense type lands counts toward its mastery. Bronze, Silver, Gold and Platinum give every defense of that type ${MASTERY.bonus.map(b => '+' + Math.round(b * 100) + '%').join(', ')} damage.</p>
      <div class="ms-list">${rows}</div>
      <div class="settings-row"><button class="btn" data-close>Done</button></div>
    </div>`, back || null);
}

/* ================= Base power and leagues ================= */
function basePower() {
  let p = 0;
  for (const b of S.buildings) {
    if (b.level < 1) continue;
    const d = DEFS[b.type];
    if (d.deco) continue;
    const st = statsFor(b.type, b.level);
    if (d.dmg && !d.trap) p += st.dps * (b.paragon ? PARAGON.dmg * PARAGON.rate : 1);
    p += st.hp / 40;
  }
  p += Object.keys(RESEARCH).reduce((a, k) => a + researchLevel(k), 0) * 60;
  for (const id of Object.keys(HEROES)) if (heroUnlocked(id)) p += heroState(id).level * 50;
  p += armySpace() * 8;
  return Math.round(p);
}
function leagueOf(p) { let i = 0; LEAGUES.forEach((l, k) => { if (p >= l.power) i = k; }); return i; }
function checkLeague() {
  const i = leagueOf(basePower()), best = S.leagueBest || 0;
  if (i <= best) return 0;
  let medals = 0;
  for (let k = best + 1; k <= i; k++) medals += LEAGUES[k].medals;
  S.medals += medals; S.leagueBest = i;
  const msg = `Promoted to the ${LEAGUES[i].name} League! +${medals} medals`;
  toast(msg, 'good'); logEvent('league', msg); Sound.play('medal'); save();
  return medals;
}
function openLeagues(back) {
  const p = basePower(), cur = leagueOf(p), next = LEAGUES[cur + 1];
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Base power</h2><span class="m-count">${fmt(p)}</span></div>
      <p class="lead">Power adds up your defenses, building strength, research, heroes and army. Climb the leagues for medals.${next ? ` <b>${fmt(next.power - p)}</b> more to reach ${next.name}.` : ' You are at the top.'}</p>
      <div class="lg-list">${LEAGUES.map((l, i) => `<div class="lg ${i === cur ? 'on' : ''} ${i <= (S.leagueBest || 0) ? 'got' : ''}" style="--lc:${l.color}"><b>${l.name}</b><span>${fmt(l.power)}+</span><i>${l.medals ? '+' + l.medals + ' medals' : ''}</i></div>`).join('')}</div>
      <div class="settings-row"><button class="btn" data-close>Done</button></div>
    </div>`, back || null);
}

/* ================= Gear upgrades ================= */
function upgradeGear(gid) {
  const g = gearItem(gid);
  if (!g) return false;
  const lvl = g.lvl || 1;
  if (lvl >= GEAR_MAX_LEVEL) { toast('That item is fully upgraded', 'info'); return false; }
  const c = gearUpgradeCost(lvl);
  if (S.medals < c.medals || S.steel < c.steel) { toast(`Needs ${c.medals} medals and ${fmt(c.steel)} steel`, 'bad'); Sound.play('error'); return false; }
  S.medals -= c.medals; S.steel -= c.steel; g.lvl = lvl + 1;
  Sound.play('done'); save();
  return true;
}
function decorateGear(id) {
  const eq = heroState(id).gear || {};
  $('#modal-body').querySelectorAll('.gear-slot').forEach((el, i) => {
    const slot = Object.keys(GEAR_SLOTS)[i], g = gearItem(eq[slot]);
    if (!g) return;
    const lvl = g.lvl || 1, c = gearUpgradeCost(lvl);
    const btn = document.createElement('button');
    btn.className = 'btn small gear-up' + (lvl >= GEAR_MAX_LEVEL ? ' off' : '');
    btn.innerHTML = lvl >= GEAR_MAX_LEVEL ? `Level ${lvl} (max)` : `Upgrade to level ${lvl + 1} · ${c.medals} medals, ${fmt(c.steel)} steel`;
    btn.addEventListener('click', () => { if (upgradeGear(g.id)) openHeroDetail(id); });
    el.appendChild(btn);
  });
}

/* ================= Layout share codes ================= */
// Compact codes (WB5, map version 2): "type-XYXY...", one block per building type, joined by dots;
// every tile coordinate is one character. About a sixth of the length of the older WB4 codes.
const SHARE_PREFIX5 = 'WB5:';
const SHARE_XY = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function exportLayoutCode() {
  const by = {};
  for (const b of S.buildings) (by[b.type] = by[b.type] || []).push(SHARE_XY[b.x] + SHARE_XY[b.y]);
  return SHARE_PREFIX5 + Object.entries(by).map(([t, p]) => `${t}-${p.join('')}`).join('.');
}
// Reads WB5 and WB4 codes into [[type, x, y], ...]. Forgiving about what comes along when a
// long code is copied out of a chat: spaces, line breaks, invisible characters, quotes, extra text.
function parseLayoutCode(raw) {
  // drop invisible characters, start at the code, stop at a closing quote, then drop line breaks and spaces
  let text = String(raw || '').replace(/[\u00AD\u180E\u200B-\u200F\u2028-\u202F\u2060-\u206F\uFEFF]/g, '');
  const start = Math.max(text.toUpperCase().indexOf(SHARE_PREFIX5), text.toUpperCase().indexOf(SHARE_PREFIX));
  if (start >= 0) { text = text.slice(start); const q = text.search(/[`'"\u201C\u201D\u2018\u2019]/); if (q >= 0) text = text.slice(0, q); }
  text = text.replace(/\s/g, '');
  const at5 = text.toUpperCase().indexOf(SHARE_PREFIX5), at4 = text.toUpperCase().indexOf(SHARE_PREFIX);
  if (at5 >= 0) {
    const list = [];
    for (const part of text.slice(at5 + SHARE_PREFIX5.length).split('.')) {
      const m = /^([a-z]+)-([A-Za-z0-9]*)/.exec(part);
      if (!m) continue;
      for (let i = 0; i + 1 < m[2].length; i += 2) list.push([m[1], SHARE_XY.indexOf(m[2][i]), SHARE_XY.indexOf(m[2][i + 1])]);
    }
    return list.length ? { ok: true, list } : { ok: false, reason: 'The code is damaged' };
  }
  if (at4 >= 0) {
    let data;
    try { data = JSON.parse(atob(text.slice(at4 + SHARE_PREFIX.length).replace(/[^A-Za-z0-9+/=]/g, ''))); } catch (e) { return { ok: false, reason: 'The code is damaged. Copy the whole code and try again' }; }
    if (!data || !Array.isArray(data.b)) return { ok: false, reason: 'The code is damaged' };
    // codes made before map version 2 come from the smaller map: move them to its middle
    const sh = data.v === MAP_V ? { x: 0, y: 0 } : MAP_SHIFT_V1;
    return { ok: true, list: data.b.filter(Array.isArray).map(e => [e[0], e[1] + sh.x, e[2] + sh.y]) };
  }
  return { ok: false, reason: 'That is not a WarBreach base code. Base codes start with WB5: or WB4:' };
}
// Any code box in the game hands base codes here, so a layout pasted into the wrong box still works.
// Returns true when the text was a base code (applied or refused with a message).
function applyBaseCodeAnywhere(text) {
  const t = String(text || '').toUpperCase();
  if (t.indexOf(SHARE_PREFIX5) < 0 && t.indexOf(SHARE_PREFIX) < 0) return false;
  if (typeof B !== 'undefined' && B) { toast('Finish the battle first, then apply the base code', 'bad'); return true; }
  const r = importLayoutCode(text);
  if (!r.ok) { toast(r.reason, 'bad'); Sound.play('error'); return true; }
  modalOnClose = null; closeModal();
  toast(`That was a base code: layout applied, ${r.matched} buildings placed`, 'good');
  logEvent('layout', `Imported a base layout (${r.matched} buildings matched)`);
  return true;
}
function importLayoutCode(code) {
  const parsed = parseLayoutCode(code);
  if (!parsed.ok) return parsed;
  const pool = {};
  for (const e of parsed.list) if (DEFS[e[0]] && Number.isInteger(e[1]) && Number.isInteger(e[2]) && e[1] >= 0 && e[2] >= 0) (pool[e[0]] = pool[e[0]] || []).push([e[1], e[2]]);
  if (!Object.keys(pool).length) return { ok: false, reason: 'The code is damaged' };
  // place buildings one by one on a fresh occupancy map, matching by type in code order
  const occ = new Int32Array(MAP_W * MAP_H);
  const free = (type, x, y) => {
    const n = DEFS[type].size;
    for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) {
      const tx = x + dx, ty = y + dy;
      if (!inBuildArea(tx, ty) || occ[ty * MAP_W + tx] || obstacleAt(tx, ty)) return false;
    }
    return true;
  };
  const mark = (b, x, y) => { const n = DEFS[b.type].size; for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) occ[(y + dy) * MAP_W + x + dx] = b.id; b.x = x; b.y = y; };
  const order = S.buildings.slice().sort((a, b) => (a.type === 'hq' ? -1 : 0) - (b.type === 'hq' ? -1 : 0));
  const later = [];
  let matched = 0;
  for (const b of order) {
    const q = pool[b.type];
    const p = q && q.length ? q.shift() : null;
    if (p && free(b.type, p[0], p[1])) { mark(b, p[0], p[1]); matched++; } else later.push(b);
  }
  for (const b of later) {
    if (free(b.type, b.x, b.y)) { mark(b, b.x, b.y); continue; }
    let done = false;
    for (let r = 1; r < 30 && !done; r++) for (let dy = -r; dy <= r && !done; dy++) for (let dx = -r; dx <= r && !done; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (free(b.type, b.x + dx, b.y + dy)) { mark(b, b.x + dx, b.y + dy); done = true; }
    }
    if (!done) return { ok: false, reason: 'Not enough room to fit every building' };
  }
  rebuildGrid(); save();
  return { ok: true, matched, total: parsed.list.length };
}
function openShareCode(back) {
  const code = exportLayoutCode();
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Share your base</h2></div>
      <p class="lead">Send this code to a friend. They can import it to copy your layout (only positions are shared, never levels or resources).</p>
      <textarea class="text-input code-box" rows="4" readonly>${code}</textarea>
      <div class="settings-row"><button class="btn" id="btn-copy-code">Copy code</button><button class="btn ghost" data-close>Back</button></div>
    </div>`, back || null);
  $('#btn-copy-code').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(code); toast('Code copied', 'good'); } catch (e) { const ta = $('#modal-body textarea'); ta.select(); toast('Select the text and copy it', 'info'); }
  });
}
function openImportCode(back) {
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Import a base code</h2></div>
      <p class="lead">Paste a WarBreach base code. Your buildings move to match it by type; anything left over is fitted around them.</p>
      <textarea class="text-input code-box" rows="4" id="import-code" placeholder="WB5:..."></textarea>
      <div class="settings-row"><button class="btn" id="btn-apply-code">Apply layout</button><button class="btn ghost" data-close>Back</button></div>
    </div>`, back || null);
  $('#btn-apply-code').addEventListener('click', () => {
    const r = importLayoutCode($('#import-code').value);
    if (!r.ok) { toast(r.reason, 'bad'); Sound.play('error'); return; }
    modalOnClose = null; closeModal();
    toast(`Layout imported: ${r.matched} buildings placed from the code`, 'good');
    logEvent('layout', `Imported a base layout (${r.matched} buildings matched)`);
  });
}

/* ================= Intel feed ================= */
const LOG_ICONS = { build: '🔧', research: '🔬', battle: '⚔️', mission: '🗺️', raid: '🏴', outpost: '📍', league: '🏆', mastery: '🎯', trade: '⚖️', layout: '📐', gear: '🎒' };
function logEvent(kind, text) {
  if (!S.log) S.log = [];
  S.log.unshift({ t: Date.now(), k: kind, x: String(text).slice(0, 140) });
  if (S.log.length > 60) S.log.length = 60;
  S.logUnread = Math.min(99, (S.logUnread || 0) + 1);
}
function timeAgo(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
function openIntel(back) {
  S.logUnread = 0; save();
  const rows = (S.log || []).map(e => `<li class="intel-row"><span class="il-i">${LOG_ICONS[e.k] || '•'}</span><span class="il-x">${e.x}</span><span class="il-t">${timeAgo(e.t)}</span></li>`).join('') || '<li class="intel-row"><span class="il-x">Nothing to report yet.</span></li>';
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Intel feed</h2><span class="m-count">Latest ${Math.min(60, (S.log || []).length)}</span></div>
      <ul class="intel-feed">${rows}</ul>
      <div class="settings-row"><button class="btn" data-close>Done</button></div>
    </div>`, back || null);
}

/* ================= Undo sell ================= */
let lastSale = null, undoTimer = 0;
function undoSell() {
  const L = lastSale;
  if (!L || performance.now() - L.t > 10000) { hideUndo(); return false; }
  if (countOf(L.b.type) >= limitOf(L.b.type) && L.b.type !== 'wall') { toast('You are at the limit for that building now', 'bad'); return false; }
  if (!footprintFree(L.b.type, L.b.x, L.b.y, 0)) { toast('That spot has been taken', 'bad'); Sound.play('error'); return false; }
  if (!canAfford(L.gain)) { toast('You already spent the refund', 'bad'); Sound.play('error'); return false; }
  pay(L.gain);
  S.buildings.push(L.b); rebuildGrid();
  lastSale = null; hideUndo();
  toast(`${displayName(L.b.type, Math.max(1, L.b.level))} is back`, 'good'); Sound.play('build'); save();
  return true;
}
function hideUndo() { const el = $('#btn-undo'); if (el) el.hidden = true; clearTimeout(undoTimer); }
function showUndo() {
  const el = $('#btn-undo'); if (!el) return;
  el.hidden = false; clearTimeout(undoTimer);
  undoTimer = setTimeout(() => { el.hidden = true; lastSale = null; }, 10000);
}

/* ================= What's new in 4.0 ================= */
const WHATS_NEW_4 = [
  ['Thunderstorms', 'Lightning strikes the battlefield, mostly hitting enemies'],
  ['Sandstorms', 'Ranges drop 20% and enemies slow down (common in the desert)'],
  ['Blizzards', 'Enemies crawl, guns fire a little slower (common in winter)'],
  ['Rally Cry', 'Kills build morale. Spend it for a burst of fire rate and troop damage'],
  ['Sentry Gun', 'A one-tile auto-turret that fits in wall lines (Command Center 3)'],
  ['Drone Hangar', 'Interceptor drones hunt enemies in range (Command Center 7)'],
  ['Stealth Bomber', 'Bombing runs straight over your base from wave 18'],
  ['Shield Drone', 'Halves the damage enemies around it take'],
  ['Flame Tank', 'Armored flamethrower that burns through buildings'],
  ['Maj. Kade', 'New hero: Creeping Barrage and an artillery damage aura (Command Center 8)'],
  ['Shield Trooper', 'New troop: tough, and pulls enemies onto himself (Barracks 5)'],
  ['Campaign chapter 2', 'Operation Warlord: six new missions'],
  ['Checkpoints', 'Start endless battles from wave 11, 21, 31 and up once you have reached them'],
  ['Battle forecast', 'See the weather and time of day before you fight, reroll for medals'],
  ['Vault', 'Protects your resources from surprise attacks (Command Center 4)'],
  ['Trading Post', 'Swap gold, steel and oil with a daily allowance (Command Center 5)'],
  ['Defense mastery', 'Every defense type earns permanent damage bonuses from kills'],
  ['Base power and leagues', 'Climb from Bronze to Legend for medals'],
  ['Gear upgrades', 'Level hero gear up to 5 for stronger bonuses'],
  ['Base codes', 'Share your layout as a code and import a friend\'s'],
  ['Intel feed', 'A log of everything that happened at your base'],
  ['Undo sell', 'Sold something by mistake? Undo it within 10 seconds'],
  ['New achievements', 'Weapons Master, League Climber and Storm Chaser'],
];
function maybeShowWhatsNew4() {
  if (S.seenUpdate4 === UPDATE4_VERSION) return false;
  const fresh = S.tut != null && S.tut < 99;
  Object.assign(S, { seenUpdate4: UPDATE4_VERSION, seenUpdate3: UPDATE3_VERSION, seenPatch: PATCH_VERSION, seenUpdate2: UPDATE2_VERSION, seenUpdate: UPDATE_VERSION });
  save();
  if (fresh) return false;
  openWhatsNew4();
  return true;
}
function openWhatsNew4(back) {
  openModal(`
    <div class="settings">
      <div class="m-head"><div><span class="stamp">Update ${UPDATE4_VERSION}</span><h2>Warlords</h2></div></div>
      <p class="lead">New screens live in the menu (top right) and the Operations hub: <b>Mastery</b>, <b>Base power</b>, <b>Intel feed</b> and <b>Trading Post</b>.</p>
      <ul class="whats-new">${WHATS_NEW_4.map(([a, b]) => `<li><b>${a}</b><span>${b}</span></li>`).join('')}</ul>
      <div class="settings-row"><button class="btn ghost" id="btn-older-notes">Older updates</button><button class="btn" data-close>To the front</button></div>
    </div>`, back || null);
  $('#btn-older-notes').addEventListener('click', () => openWhatsNew3(() => openWhatsNew4(back)));
}

/* ================= Brief extras: forecast and checkpoints ================= */
function warBriefHTML() {
  const f = forecast(), cps = checkpoints(), cur = cps.includes(S.checkpoint) ? S.checkpoint : 0;
  return `
    <h3 class="report-h">Battle forecast</h3>
    <div class="fc-row"><span class="fc"><b>${f.weather.name}</b> ${weatherEffect(f.weather)}</span><span class="fc"><b>${f.daytime.name}</b> loot x${f.daytime.loot}</span>
      <button class="btn ghost small" id="btn-reroll">Reroll · ${FORECAST_REROLL} medals</button></div>
    ${legendsBriefHTML()}
    ${cps.length > 1 ? `<h3 class="report-h">Start at</h3><div class="seg cp-row">${cps.map(c => `<button class="seg-b ${c === cur ? 'on' : ''}" data-cp="${c}">Wave ${c + 1}</button>`).join('')}</div>` : ''}`;
}
function warWireBrief(reopen) {
  const body = $('#modal-body');
  const r = body.querySelector('#btn-reroll');
  if (r) r.addEventListener('click', () => { if (rerollForecast()) reopen(); });
  body.querySelectorAll('[data-cp]').forEach(b => b.addEventListener('click', () => { S.checkpoint = +b.dataset.cp; save(); Sound.play('click'); reopen(); }));
}

/* ================= Base update ================= */
let leagueT = 2;
function warBaseUpdate(dt) {
  if (B) return;
  if ((leagueT -= dt) <= 0) { leagueT = 3; checkLeague(); }
}

/* ================= Wiring ================= */
function initWarlords() {
  $('#btn-rally').addEventListener('click', rallyCry);
  $('#btn-undo').addEventListener('click', undoSell);
  // wrap a few base functions to feed the Intel log and support undo-sell
  const _sell = sell;
  sell = function (b) {
    const snap = JSON.parse(JSON.stringify(b, (k, v) => (k[0] === '_' ? undefined : v)));
    const before = { gold: S.gold, steel: S.steel, oil: S.oil || 0 };
    _sell(b);
    if (!S.buildings.includes(b)) {
      lastSale = { b: snap, gain: { gold: S.gold - before.gold, steel: S.steel - before.steel, oil: (S.oil || 0) - before.oil }, t: performance.now() };
      showUndo();
    }
  };
  const _complete = completeJob;
  completeJob = function (b) { const to = b.job && b.job.to; _complete(b); if (to) logEvent('build', to === 1 ? `${displayName(b.type, 1)} built` : `${displayName(b.type, to)} upgraded to level ${to}`); };
  const _research = finishResearch;
  finishResearch = function () { const j = S.research.job; _research(); if (j) logEvent('research', `${RESEARCH[j.id].name} level ${j.to} researched`); };
  const _end = endBattle;
  endBattle = function (reason) {
    const was = B && !B.over && !B.mission ? { waves: B.waves, kills: B.kills, cp: B.checkpoint } : null;
    _end(reason);
    if (was && B && B.over) logEvent('battle', `Endless battle ${reason === 'retreat' ? 'ended by retreat' : 'lost'}: ${was.waves} waves, ${was.kills} kills${was.cp ? ` (from checkpoint ${was.cp})` : ''}`);
  };
  const _mission = endMission;
  endMission = function (reason) { const m = B && B.mission; _mission(reason); if (m && !m.practice) logEvent(m.raid ? 'raid' : 'mission', `${m.name}: ${reason === 'victory' ? 'victory' : 'failed'}`); };
  const _surprise = checkSurpriseAttack;
  checkSurpriseAttack = function (ms) { const had = S.pendingReport; _surprise(ms); const r = S.pendingReport; if (r && r !== had) logEvent('battle', r.won ? `Surprise attack repelled (+${fmt(r.gold)} gold)` : `Raiders stole ${fmt(-r.gold)} gold and ${fmt(-r.steel)} steel`); };
  const _hero = openHeroDetail;
  openHeroDetail = function (id) { _hero(id); decorateGear(id); };
  const _layouts = openLayouts;
  openLayouts = function () {
    _layouts();
    const row = document.createElement('div');
    row.className = 'settings-row';
    row.innerHTML = '<button class="btn ghost" id="btn-share-code">Share base code</button><button class="btn ghost" id="btn-import-code">Import base code</button>';
    $('#modal-body .settings').insertBefore(row, $('#modal-body .settings').lastElementChild);
    $('#btn-share-code').addEventListener('click', () => openShareCode(openLayouts));
    $('#btn-import-code').addEventListener('click', () => openImportCode(openLayouts));
  };
  const _drawTroop = drawTroopFigure;
  drawTroopFigure = function (ctx, t) { _drawTroop(ctx, t); drawShieldOverlay(ctx, t); };
}
