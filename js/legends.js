// WarBreach — Update 5.0 "Legends": the Gauntlet roguelite mode, Paragons, the Challenge Editor,
// Commander Knowledge, the Vengeance Tower, the Decoy Beacon, army presets, the Field Album,
// win streaks, the Weekend Blitz, the welcome-back report and "Air first" targeting.
'use strict';

/* ================= Commander Knowledge ================= */
function knowledge() { if (!S.knowledge || typeof S.knowledge !== 'object') S.knowledge = {}; return S.knowledge; }
function kLevel(id) { return knowledge()[id] || 0; }
function kBonus(id) { const k = KNOWLEDGE.find(x => x.id === id); return k ? kLevel(id) * k.per : 0; }
function knowledgePoints() { return hqLevel() + rankIndex(S.xp || 0) + Math.floor(Math.max(0, (S.xp || 0) - 7500) / 6000) + (S.stats.gauntletWins || 0); }
function knowledgeSpent() { return KNOWLEDGE.reduce((a, k) => a + kLevel(k.id), 0); }
function knowledgeFree() { return knowledgePoints() - knowledgeSpent(); }
function learn(id) {
  const k = KNOWLEDGE.find(x => x.id === id);
  if (!k) return false;
  if (kLevel(id) >= k.max) { toast('That perk is maxed', 'info'); return false; }
  if (knowledgeFree() <= 0) { toast('No Knowledge points left. Earn more from Command Center levels, ranks and Gauntlet wins', 'bad'); Sound.play('error'); return false; }
  knowledge()[id] = kLevel(id) + 1; Sound.play('medal'); save();
  return true;
}
function resetKnowledge() { S.knowledge = {}; save(); }
function wargamesMax() { return WARGAMES_MAX + kLevel('tactics'); }
function openKnowledge(back) {
  const free = knowledgeFree();
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Commander Knowledge</h2><span class="m-count">${free} point${free === 1 ? '' : 's'} free · ${knowledgePoints()} earned</span></div>
      <p class="lead">Points come from Command Center levels, your commander rank (and every 6,000 experience past General) and Gauntlet victories. Respec any time for free.</p>
      <div class="kn-grid">${KNOWLEDGE.map(k => { const L = kLevel(k.id); return `<div class="kn ${L ? 'on' : ''}"><b>${k.name}</b><span>${k.desc}</span>
        <div class="sk-pips">${Array.from({ length: k.max }, (_, i) => `<i class="${i < L ? 'on' : ''}"></i>`).join('')}</div>
        <button class="btn small ${free > 0 && L < k.max ? '' : 'off'}" data-learn="${k.id}">${L >= k.max ? 'Maxed' : '+1'}</button></div>`; }).join('')}</div>
      <div class="settings-row"><button class="btn ghost" id="btn-kn-reset">Respec</button><button class="btn" data-close>Done</button></div>
    </div>`, back || null);
  const body = $('#modal-body');
  body.querySelectorAll('[data-learn]').forEach(b => b.addEventListener('click', () => { learn(b.dataset.learn); openKnowledge(back); }));
  $('#btn-kn-reset').addEventListener('click', () => { resetKnowledge(); toast('Knowledge points refunded', 'good'); openKnowledge(back); });
}

/* ================= Paragons ================= */
function paragonStatus(b) {
  const d = DEFS[b.type];
  if (!d.dmg || d.trap || NO_PARAGON.includes(b.type) || b.paragon) return { ok: false, hidden: true };
  if (hqLevel() < PARAGON.hq) return { ok: false, reason: `Command Center ${PARAGON.hq}` };
  if (S.buildings.some(x => x.type === b.type && x.paragon)) return { ok: false, reason: 'One Paragon per defense type' };
  if (b.job) return { ok: false, reason: 'Under construction' };
  if (b.level < PARAGON.level) return { ok: false, reason: `Needs level ${PARAGON.level}` };
  const others = S.buildings.filter(x => x !== b && x.type === b.type && x.level >= PARAGON.level && !x.job && !x.paragon);
  if (others.length < PARAGON.copies - 1) return { ok: false, reason: `Needs ${PARAGON.copies} at level ${PARAGON.level}+ (you have ${others.length + 1})` };
  const cost = paragonCost(b.type);
  if (!canAfford(cost) || S.medals < cost.medals) return { ok: false, reason: 'Not enough resources', cost };
  // sacrifice the lowest-level copies
  others.sort((a, c) => a.level - c.level);
  return { ok: true, cost, others: others.slice(0, PARAGON.copies - 1) };
}
function makeParagon(b) {
  const st = paragonStatus(b);
  if (!st.ok) { if (st.reason) toast(st.reason, 'bad'); Sound.play('error'); return false; }
  pay(st.cost); S.medals -= st.cost.medals;
  for (const o of st.others) b.kills = (b.kills || 0) + (o.kills || 0);
  S.buildings = S.buildings.filter(x => !st.others.includes(x));
  if (S.queue) S.queue = S.queue.filter(q => !st.others.some(o => o.id === q.id));
  b.paragon = true;
  rebuildGrid();
  const c = centerOf(b); burst(c.x, c.y - 10, '#f2b632', 40);
  Sound.play('done'); Sound.play('medal');
  logEvent('build', `${DEFS[b.type].name} ascended to a Paragon`);
  toast(`${DEFS[b.type].name} Paragon forged`, 'good'); save();
  return true;
}
function drawParagons(ctx) {
  for (const b of S.buildings) {
    if (!b.paragon || b._dead) continue;
    const n = DEFS[b.type].size * TILE, cx = b.x * TILE + n / 2, cy = b.y * TILE + n / 2;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(242,182,50,${0.45 + Math.sin(tSec * 3 + b.id) * 0.2})`; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(cx, cy + 4, n * 0.56, n * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    // crown
    const y = b.y * TILE - 10 + Math.sin(tSec * 2 + b.id) * 2;
    ctx.fillStyle = '#f2b632'; ctx.strokeStyle = '#5a3f0a'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(cx - 9, y + 5); ctx.lineTo(cx - 9, y - 3); ctx.lineTo(cx - 4, y + 1); ctx.lineTo(cx, y - 6); ctx.lineTo(cx + 4, y + 1); ctx.lineTo(cx + 9, y - 3); ctx.lineTo(cx + 9, y + 5); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}

/* ================= Weapon and battle modifiers ================= */
function legendWeaponMod(b, w) {
  if (b.paragon) { w.dmg *= PARAGON.dmg; w.fireRate *= PARAGON.rate; w.range *= PARAGON.range; }
  if (b.type === 'vengeance' && B) w.dmg *= 1 + Math.min(DEFS.vengeance.vengeanceMax, (B.fallen || 0) * DEFS.vengeance.vengeance);
  w.dmg *= 1 + kBonus('guns');
  return w;
}
function isWeekend(d = new Date(Date.now())) { const k = d.getDay(); return k === 0 || k === 6; }
function streakBonus() { return Math.min(STREAK.max, ((S.winStreak && S.winStreak.n) || 0) * STREAK.perWin); }

function legendsBattleStart() {
  Object.assign(B, { fallen: 0, fallenT: 0, decoys: [] });
  const m = B.mission;
  if (!B.practice && !(m && m.challenge)) {
    B.lootMul *= (1 + kBonus('loot')) * (1 + streakBonus()) * (isWeekend() ? 1 + WEEKEND.loot : 1);
    if (isWeekend()) { const b0 = B; setTimeout(() => { if (B === b0 && !B.over) banner('Weekend Blitz', '+25% loot and double wave medals'); }, 2800); }
  }
  B.morale = Math.min(100, (B.morale || 0) + kLevel('morale') * KNOWLEDGE.find(k => k.id === 'morale').per);
  if (B.crateT) B.crateT *= 1 - kBonus('crates');
  const armor = kBonus('armor');
  if (armor) for (const b of S.buildings) if (b._maxhp) { b._maxhp = Math.round(b._maxhp * (1 + armor)); b._hp = b._maxhp; }
  for (const b of S.buildings) if (b.paragon && b._maxhp) { b._maxhp *= PARAGON.hp; b._hp = b._maxhp; }
  if (!B.practice) {
    S.stats.weathers = S.stats.weathers || {}; S.stats.weathers[B.weather.id] = true;
    S.stats.daytimes = S.stats.daytimes || {}; S.stats.daytimes[B.daytime.id] = true;
  }
  if (m && m.gauntlet) applyArtifacts();
  if (m && m.challenge) applyChallengeRules(m);
}
function legendsBattleUpdate(dt) {
  B.fallenT -= dt;
  if (B.fallenT <= 0) { B.fallenT = 0.5; B.fallen = S.buildings.filter(b => b._dead && !isPassive(b.type) && b.type !== 'wall' && b.type !== 'gate' && !DEFS[b.type].decoy).length; }
  updateDecoys(dt);
}
function legendsEnemyKilled(u, e) {
  const k = S.stats.killsBy || (S.stats.killsBy = {});
  k[u.type] = (k[u.type] || 0) + 1;
}

/* ================= Decoy Beacon ================= */
function dropDecoy(w) {
  const tx = clamp(Math.floor(w.x / TILE), 1, MAP_W - 2), ty = clamp(Math.floor(w.y / TILE), 1, MAP_H - 2);
  let x = tx, y = ty;
  if (buildingAtTile(x, y)) {
    // crowded spot: use the closest open ground within 5 tiles
    let best = null, bd = Infinity;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      const nx = tx + dx, ny = ty + dy, d = dx * dx + dy * dy;
      if (d >= bd || nx < 1 || ny < 1 || nx > MAP_W - 2 || ny > MAP_H - 2 || buildingAtTile(nx, ny)) continue;
      best = { x: nx, y: ny }; bd = d;
    }
    if (!best) { toast('No room for the decoy there', 'bad'); B.ab.decoy = 0; return false; }
    x = best.x; y = best.y;
  }
  const hp = DECOY.hp + Math.max(1, B.wave) * DECOY.hpPerWave;
  const d = { id: S.nextId++, type: 'decoy', x, y, level: 1, job: null, stored: 0, baseAngle: 0, _hp: hp, _maxhp: hp, _dead: false, _life: DECOY.life };
  S.buildings.push(d); B.decoys.push(d);
  rebuildGrid(); B.flowDirty = true;
  const c = centerOf(d);
  for (let i = 0; i < 12; i++) particles.push({ x: c.x + (Math.random() - 0.5) * 30, y: c.y, vx: (Math.random() - 0.5) * 40, vy: -30, g: 0, life: 0.8, max: 0.8, r: 6, grow: 8, color: 'smoke' });
  B.fx.push({ kind: 'ring', x: c.x, y: c.y, r: DECOY.pull * TILE, life: 0.8, max: 0.8, color: '200,64,42' });
  Sound.play('plane');
  return true;
}
function updateDecoys(dt) {
  for (const d of B.decoys) {
    d._life -= dt;
    if (!d._dead && d._life <= 0) { d._dead = true; const c = centerOf(d); explosion(c.x, c.y, 12); }
  }
  const gone = B.decoys.filter(d => d._dead);
  if (gone.length) {
    S.buildings = S.buildings.filter(b => !gone.includes(b));
    B.decoys = B.decoys.filter(d => !d._dead);
    for (const u of B.units) if (gone.includes(u.tgt)) u.tgt = null;
    rebuildGrid(); B.flowDirty = true;
  }
}
// Enemies near a decoy go for it (ground units need a clear line).
function decoyPull(u, e, dt) {
  if (!B.decoys || !B.decoys.length || e.sapper || e.heal || e.boss || e.bomber || e.shieldAura) return false;
  for (const d of B.decoys) {
    if (d._dead) continue;
    const c = centerOf(d), dist = Math.hypot(c.x - u.x, c.y - u.y);
    if (dist > DECOY.pull * TILE) continue;
    if (!u.air && !clearLine(u.x, u.y, c.x, c.y, d)) continue;
    // in range: shoot it normally, and hold the target so the regular retarget cannot pull them off it
    if (distToBuilding(u.x, u.y, d) <= e.range) { u.tgt = d; u.retarget = 0.35; return false; }
    const sp = Math.min(dist, e.speed * (B.mods.fast || 1) * u.slow * TILE * dt);
    u.x += (c.x - u.x) / dist * sp; u.y += (c.y - u.y) / dist * sp;
    u.angle = u.aim = Math.atan2(c.y - u.y, c.x - u.x); u.moving = true; u.walk += dt * e.speed * 9;
    return true;
  }
  return false;
}
DRAW.decoy = function (ctx, b, t) {
  const x = b.x * TILE + TILE / 2, y = b.y * TILE + TILE / 2, wob = Math.sin(t * 3 + b.id) * 1.2;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x + 3, y + 6, 18, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(x, y); ctx.scale(1 + wob * 0.02, 1 - wob * 0.02);
  ctx.fillStyle = '#5d7040'; rr(ctx, -17, -11, 34, 22, 9); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; rr(ctx, -14, -9, 28, 7, 4); ctx.fill();
  ctx.fillStyle = '#4a5a32'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3e4d2a'; rr(ctx, 4, -2.5, 18, 5, 2.5); ctx.fill();
  ctx.fillStyle = '#c8402a'; ctx.beginPath(); ctx.arc(-11, 0, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (typeof B !== 'undefined' && B && b._maxhp) {
    const k = Math.max(0, b._life || 0) / DECOY.life;
    ctx.strokeStyle = 'rgba(255,200,120,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
  }
};
AB_ICONS.decoy = '<rect x="3" y="7" width="14" height="9" rx="4" fill="currentColor"/><circle cx="10" cy="9" r="3.4" fill="currentColor"/><path d="M12 9h6" stroke="currentColor" stroke-width="2"/><path d="M10 2v3M6 3l1.4 2.4M14 3l-1.4 2.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>';

/* ================= Vengeance Tower ================= */
function fireVengeance(b, t, w, c) {
  Sound.play('laser'); Sound.play('sniper');
  damageEnemy(t, w.dmg, 'vengeance');
  splashDamage(t.x, t.y, DEFS.vengeance.splash, w.dmg * 0.4, true, 'vengeance');
  const rage = Math.min(1, (B.fallen || 0) * DEFS.vengeance.vengeance / DEFS.vengeance.vengeanceMax);
  B.fx.push({ kind: 'beam', x1: c.x, y1: c.y - 24, x2: t.x, y2: t.y - (t.air ? 18 : 3), life: 0.2, max: 0.2, heat: 0.4 + rage * 0.6 }); // from the obelisk's glowing tip
  B.fx.push({ kind: 'light', x: t.x, y: t.y, r: 40, life: 0.2, max: 0.2 });
}
DRAW.vengeance = function (ctx, b, t) {
  const S2 = 2 * TILE, x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  const rage = typeof B !== 'undefined' && B ? Math.min(1, (B.fallen || 0) * DEFS.vengeance.vengeance / DEFS.vengeance.vengeanceMax) : 0;
  pad(ctx, x, y, S2, '#3b2f2f', 2);
  ctx.strokeStyle = `rgba(255,70,50,${0.25 + rage * 0.5})`; ctx.lineWidth = 2; rr(ctx, x + 6, y + 6, S2 - 12, S2 - 12, 6); ctx.stroke();
  // obelisk
  box(ctx, x + 26, y + 58, 28, 16, 30, '#5a3434', '#3a2020', 4);
  const cx = x + S2 / 2, top = y + 20;
  ctx.fillStyle = '#2a1a1a'; ctx.beginPath(); ctx.moveTo(cx - 9, y + 30); ctx.lineTo(cx, top - 14); ctx.lineTo(cx + 9, y + 30); ctx.closePath(); ctx.fill();
  const glow = 0.5 + Math.sin(t * (3 + rage * 6) + b.id) * 0.3 + rage * 0.4;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, glow);
  ctx.drawImage(glowSprite('#ff3a2a'), cx - 18, top - 22, 36, 36); ctx.restore();
  ctx.fillStyle = '#ff6a4a'; ctx.beginPath(); ctx.arc(cx, top - 4, 3 + rage * 2, 0, Math.PI * 2); ctx.fill();
  if (b._flash > 0) { ctx.fillStyle = '#ffe0d0'; ctx.beginPath(); ctx.arc(cx, top - 4, 6, 0, Math.PI * 2); ctx.fill(); }
  void L;
};

/* ================= Army presets ================= */
function armyPresets() { if (!Array.isArray(S.armyPresets)) S.armyPresets = []; return S.armyPresets; }
function saveArmyPreset(i) {
  const troops = {};
  for (const t of Object.keys(TROOPS)) { const n = troopCount(t) + army().queue.filter(q => q.type === t).length; if (n > 0) troops[t] = n; }
  if (!Object.keys(troops).length) { toast('Train some troops first, then save them as a preset', 'info'); return false; }
  armyPresets()[i] = { troops, saved: Date.now() };
  Sound.play('click'); save(); toast(`Preset ${i + 1} saved`, 'good');
  return true;
}
function trainPreset(i) {
  const p = armyPresets()[i];
  if (!p) return 0;
  let n = 0, blocked = '';
  for (const t of Object.keys(p.troops)) {
    if (!TROOPS[t]) continue;
    let need = p.troops[t] - troopCount(t) - army().queue.filter(q => q.type === t).length;
    while (need > 0) {
      const st = trainStatus(t);
      if (!st.ok) { blocked = st.reason; break; }
      if (!trainTroop(t)) break;
      need--; n++;
    }
  }
  if (n) toast(`${n} troop${n > 1 ? 's' : ''} queued from preset ${i + 1}`, 'good');
  else toast(blocked || 'Your army already matches this preset', blocked ? 'bad' : 'info');
  return n;
}
function decorateBarracks() {
  const root = $('#modal-body .settings') || $('#modal-body > div');
  if (!root || !$('#barracks-ui')) return;
  const row = document.createElement('div');
  row.className = 'preset-row';
  row.innerHTML = `<span class="field-label">Army presets</span>` + [0, 1, 2].map(i => {
    const p = armyPresets()[i];
    const label = p ? Object.entries(p.troops).map(([t, n]) => `${n} ${TROOPS[t] ? TROOPS[t].name.split(' ')[0] : t}`).join(', ') : 'Empty';
    return `<div class="preset"><b>Preset ${i + 1}</b><span>${label}</span><div class="settings-row"><button class="btn ghost small" data-psave="${i}">Save current</button>${p ? `<button class="btn small" data-ptrain="${i}">Train</button>` : ''}</div></div>`;
  }).join('');
  const last = root.lastElementChild;
  root.insertBefore(row, last);
  row.querySelectorAll('[data-psave]').forEach(b => b.addEventListener('click', () => { saveArmyPreset(+b.dataset.psave); openBarracks(); }));
  row.querySelectorAll('[data-ptrain]').forEach(b => b.addEventListener('click', () => { trainPreset(+b.dataset.ptrain); openBarracks(); }));
}

/* ================= Gauntlet ================= */
function gauntlet() { return S.gauntlet && S.gauntlet.active ? S.gauntlet : null; }
function rollNodes(stage) {
  if (stage >= GAUNTLET.stages - 1) return ['boss'];
  const pool = Object.keys(GAUNTLET_NODES).filter(k => GAUNTLET_NODES[k].weight > 0 && !(stage === 0 && (k === 'camp' || k === 'merchant')));
  const pick = () => { const tot = pool.reduce((a, k) => a + GAUNTLET_NODES[k].weight, 0); let r = Math.random() * tot; for (const k of pool) { r -= GAUNTLET_NODES[k].weight; if (r <= 0) return k; } return pool[0]; };
  const a = pick(); let b = pick(), tries = 0;
  while (b === a && tries++ < 10) b = pick();
  return [a, b];
}
function rollArtifacts(n, bias, owned) {
  const avail = ARTIFACTS.filter(a => !owned.includes(a.id));
  const out = [];
  while (out.length < n && avail.length) {
    const w = avail.map(a => ART_RARITY[a.rarity].weight * (a.rarity === 'common' ? 1 : 1 + bias));
    let r = Math.random() * w.reduce((x, y) => x + y, 0), i = 0;
    for (; i < avail.length; i++) { r -= w[i]; if (r <= 0) break; }
    out.push(avail.splice(Math.min(i, avail.length - 1), 1)[0].id);
  }
  return out;
}
function startGauntlet() {
  if (hqLevel() < GAUNTLET.hq) { toast(`The Gauntlet opens at Command Center ${GAUNTLET.hq}`, 'info'); return false; }
  if (gauntlet()) return false;
  S.gauntlet = { active: true, stage: 0, hq: 1, coins: GAUNTLET.startCoins + kLevel('loot'), arts: [], nodes: rollNodes(0), pick: null, shop: null, cleared: 0 };
  S.stats.gauntletRuns = (S.stats.gauntletRuns || 0) + 1;
  save();
  return true;
}
function gauntletMission(node, stage) {
  const H = hqLevel();
  const base = Math.round(GAUNTLET.start[Math.min(H, MAX_HQ)] + stage * GAUNTLET.perStage) + (node === 'elite' ? 3 : 0) + (node === 'boss' ? 4 : 0);
  const nW = node === 'battle' ? 3 : 4, waves = [];
  for (let i = 0; i < nW; i++) {
    const comp = waveComposition(base + i).filter(g => !ENEMIES[g.type].boss && g.count > 0).map(g => ({ type: g.type, count: Math.max(1, Math.round(g.count * GAUNTLET.waveScale)) }));
    waves.push(comp);
  }
  if (node === 'elite') waves[nW - 1].push({ type: 'siege', count: 1 });
  if (node === 'boss') waves[nW - 1].push({ type: H >= 9 ? 'titan' : 'siege', count: H >= 11 ? 2 : 1 });
  return { id: 'gauntlet', gauntlet: true, node, stage, name: `Gauntlet ${stage + 1}/${GAUNTLET.stages}: ${GAUNTLET_NODES[node].name}`, hq: H, level: base, gates: ['w', 'e', 'n'],
    mods: node === 'elite' ? { armored: 1.2 } : node === 'boss' ? { armored: 1.3 } : {}, waves, reward: { medals: 0 }, brief: GAUNTLET_NODES[node].desc };
}
function artifactFx() {
  const fx = {};
  for (const id of (gauntlet() || {}).arts || []) { const a = ARTIFACTS.find(x => x.id === id); if (a) for (const k in a.fx) fx[k] = (fx[k] || 0) + a.fx[k]; }
  return fx;
}
function applyArtifacts() {
  const run = gauntlet(); if (!run) return;
  const fx = artifactFx(), bo = B.bonus;
  bo.dmgAll += fx.dmg || 0; bo.rate += fx.rate || 0; bo.range += fx.range || 0; bo.troops += fx.troops || 0; bo.hero += fx.hero || 0;
  bo.loot += fx.loot || 0; bo.antiAir += fx.antiAir || 0; bo.splash = (bo.splash || 0) + (fx.splash || 0);
  if (fx.cd) bo.cd *= Math.max(0.3, 1 - fx.cd);
  if (fx.morale) B.morale = Math.max(B.morale || 0, Math.min(100, fx.morale));
  if (fx.enemyHp) B.mods.armored = (B.mods.armored || 1) * (1 + fx.enemyHp);
  if (fx.enemySpeed) B.mods.fast = (B.mods.fast || 1) * (1 + fx.enemySpeed);
  for (const b of S.buildings) {
    if (!b._maxhp) continue;
    if (fx.wallHp && (b.type === 'wall' || b.type === 'gate')) { b._maxhp = Math.round(b._maxhp * (1 + fx.wallHp)); b._hp = b._maxhp; }
  }
  const h = hq();
  if (h && h._maxhp) { h._maxhp = Math.max(1, Math.round(h._maxhp * (1 + (fx.hqHp || 0)))); h._hp = Math.max(1, Math.round(h._maxhp * run.hq)); }
}
function chooseNode(i) {
  const run = gauntlet(); if (!run || run.pick || run.shop) return false;
  const node = run.nodes[i]; if (!node) return false;
  if (node === 'camp') {
    run.hq = Math.min(1, run.hq + GAUNTLET.campHeal);
    advanceGauntlet(); Sound.play('heal'); toast('The engineers patched up the Command Center', 'good');
    return 'camp';
  }
  if (node === 'merchant') {
    run.shop = rollArtifacts(3, 0.5, run.arts);
    save(); return 'merchant';
  }
  startBattle(gauntletMission(node, run.stage));
  return 'battle';
}
function artifactPrice(id) { const a = ARTIFACTS.find(x => x.id === id); return ART_RARITY[a.rarity].price; }
function buyArtifact(id) {
  const run = gauntlet(); if (!run || !run.shop || !run.shop.includes(id)) return false;
  const price = artifactPrice(id);
  if (run.coins < price) { toast(`You need ${price} coins`, 'bad'); Sound.play('error'); return false; }
  run.coins -= price; run.arts.push(id); run.shop = run.shop.filter(x => x !== id);
  Sound.play('collect'); save();
  return true;
}
function leaveMerchant() { const run = gauntlet(); if (!run || !run.shop) return false; run.shop = null; advanceGauntlet(); return true; }
function pickArtifact(id) {
  const run = gauntlet(); if (!run || !run.pick || !run.pick.includes(id)) return false;
  run.arts.push(id); run.pick = null; save();
  return true;
}
function advanceGauntlet() {
  const run = gauntlet(); if (!run) return;
  run.stage++; run.cleared = Math.max(run.cleared, run.stage);
  run.nodes = rollNodes(run.stage);
  save();
}
// Called when a Gauntlet battle ends.
function gauntletBattleOver(reason) {
  const run = gauntlet(), m = B.mission;
  const h = hq(), frac = h && h._maxhp ? Math.max(0, h._hp / h._maxhp) : 0;
  B.over = true;
  if (reason === 'victory' && run) {
    const fx = artifactFx();
    run.hq = Math.min(1, frac + (fx.heal || 0));
    run.coins += m.node === 'elite' ? 5 : 3;
    if (m.node === 'boss') { run.stage = GAUNTLET.stages; run.cleared = GAUNTLET.stages; return finishGauntlet(true); }
    advanceGauntlet();
    run.pick = rollArtifacts(3, m.node === 'elite' ? 2 : 0.3, run.arts);
    save();
    openModal(`<div class="brief"><div class="brief-head"><span class="stamp">Gauntlet ${m.stage + 1}/${GAUNTLET.stages}</span><h2>Battle won</h2>
      <p>Command Center at ${Math.round(run.hq * 100)}%. +${m.node === 'elite' ? 5 : 3} coins. Choose an artifact for the rest of the run.</p></div>
      <div class="brief-foot"><button class="btn" data-close>Choose artifact</button></div></div>`, () => { leaveBattle(); openGauntlet(); });
    logEvent('mission', `Gauntlet stage ${m.stage + 1} won`);
    return null;
  }
  return finishGauntlet(false);
}
function finishGauntlet(won) {
  const run = gauntlet(); if (!run) return null;
  const stages = won ? GAUNTLET.stages : run.stage;
  const medals = stages * 2 + (won ? 15 : 0);
  const gold = gainRes('gold', Math.round(storageCap() * 0.04 * stages)), steel = gainRes('steel', Math.round(storageCap() * 0.04 * stages));
  S.medals += medals;
  S.gauntletBest = Math.max(S.gauntletBest || 0, stages);
  if (won) S.stats.gauntletWins = (S.stats.gauntletWins || 0) + 1;
  S.gauntlet = { active: false, last: { stages, won, medals, gold, steel, arts: run.arts.slice() } };
  logEvent('mission', won ? `Gauntlet conquered! +${medals} medals and a Knowledge point` : `Gauntlet run over at stage ${stages + 1}`);
  save();
  const html = `<div class="brief"><div class="brief-head"><span class="stamp">Gauntlet</span><h2>${won ? 'Gauntlet conquered' : 'Run over'}</h2>
    <p>${won ? 'The Warlord has fallen. You earned a Commander Knowledge point.' : `You cleared ${stages} of ${GAUNTLET.stages} stages.`}</p></div>
    <ul class="units"><li><span>Medals</span><b>+${medals}</b></li><li><span>Gold</span><b>+${fmt(gold)}</b></li><li><span>Steel</span><b>+${fmt(steel)}</b></li><li><span>Best run</span><b>${S.gauntletBest} / ${GAUNTLET.stages}</b></li></ul>
    <div class="brief-foot"><button class="btn" data-close>Return to base</button></div></div>`;
  if (B) openModal(html, () => leaveBattle()); else openModal(html);
  Sound.play(won ? 'win' : 'lose');
  return { won, stages, medals };
}
function abandonGauntlet() { if (!gauntlet()) return null; return finishGauntlet(false); }
function artChip(id) { const a = ARTIFACTS.find(x => x.id === id); return `<span class="art" style="--ac:${ART_RARITY[a.rarity].color}" title="${a.desc}"><b>${a.name}</b><small>${a.desc}</small></span>`; }
function openGauntlet(back) {
  const run = gauntlet();
  let body;
  if (!run) {
    const last = S.gauntlet && S.gauntlet.last;
    body = `<p class="lead">A roguelite run of ${GAUNTLET.stages} battles with your own base. Pick your path at every stage, collect artifacts, and beat the Warlord at the end. Command Center damage carries over between battles; one defeat ends the run.</p>
      ${last ? `<p class="lead">Last run: ${last.won ? 'conquered' : `${last.stages} stages`} · +${last.medals} medals.</p>` : ''}
      <ul class="units"><li><span>Best run</span><b>${S.gauntletBest || 0} / ${GAUNTLET.stages}</b></li><li><span>Victories</span><b>${S.stats.gauntletWins || 0}</b></li></ul>
      <div class="settings-row"><button class="btn battle-go ${hqLevel() >= GAUNTLET.hq ? '' : 'off'}" id="btn-g-start">${hqLevel() >= GAUNTLET.hq ? 'Start a run' : `Command Center ${GAUNTLET.hq}`}</button><button class="btn ghost" data-close>Back</button></div>`;
  } else if (run.pick) {
    body = `<p class="lead">Choose one artifact. It lasts for the rest of the run.</p><div class="art-pick">${run.pick.map(id => `<button class="art-opt" data-art="${id}">${artChip(id)}</button>`).join('')}</div>`;
  } else if (run.shop) {
    body = `<p class="lead">Black market. You have <b>${run.coins}</b> coins.</p><div class="art-pick">${run.shop.map(id => `<button class="art-opt ${run.coins >= artifactPrice(id) ? '' : 'off'}" data-buy="${id}">${artChip(id)}<i>${artifactPrice(id)} coins</i></button>`).join('') || '<span class="lead">Sold out.</span>'}</div>
      <div class="settings-row"><button class="btn" id="btn-g-leave">Move on</button></div>`;
  } else {
    body = `<div class="g-track">${Array.from({ length: GAUNTLET.stages }, (_, i) => `<i class="${i < run.stage ? 'done' : i === run.stage ? 'now' : ''}">${i + 1}</i>`).join('')}</div>
      <ul class="units g-stats"><li><span>Command Center</span><b>${Math.round(run.hq * 100)}%</b></li><li><span>Coins</span><b>${run.coins}</b></li></ul>
      <div class="art-row">${run.arts.map(artChip).join('') || '<span class="lead">No artifacts yet.</span>'}</div>
      <h3 class="report-h">Choose your path</h3>
      <div class="g-nodes">${run.nodes.map((n, i) => `<button class="g-node n-${n}" data-node="${i}"><b>${GAUNTLET_NODES[n].name}</b><span>${GAUNTLET_NODES[n].desc}</span></button>`).join('')}</div>
      <div class="settings-row"><button class="btn danger-outline" id="btn-g-quit">Abandon run</button><button class="btn ghost" data-close>Back</button></div>`;
  }
  openModal(`<div class="settings"><div class="m-head"><div><span class="stamp">Roguelite mode</span><h2>The Gauntlet</h2></div>${run ? `<span class="m-count">Stage ${Math.min(run.stage + 1, GAUNTLET.stages)} of ${GAUNTLET.stages}</span>` : ''}</div>${body}</div>`, back || null);
  const el = $('#modal-body');
  const on = (sel, fn) => { const x = el.querySelector(sel); if (x) x.addEventListener('click', fn); };
  on('#btn-g-start', () => { if (startGauntlet()) openGauntlet(back); });
  on('#btn-g-leave', () => { leaveMerchant(); openGauntlet(back); });
  on('#btn-g-quit', () => { const q = el.querySelector('#btn-g-quit'); if (q.dataset.armed) { modalOnClose = null; abandonGauntlet(); } else { q.dataset.armed = 1; q.textContent = 'Tap again to end the run'; } });
  el.querySelectorAll('[data-art]').forEach(b => b.addEventListener('click', () => { pickArtifact(b.dataset.art); openGauntlet(back); }));
  el.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => { buyArtifact(b.dataset.buy); openGauntlet(back); }));
  el.querySelectorAll('[data-node]').forEach(b => b.addEventListener('click', () => { const r = chooseNode(+b.dataset.node); if (r !== 'battle') openGauntlet(back); }));
}

/* ================= Challenge Editor ================= */
const CH_PREFIX = 'WBC:';
const CH_RULES = [['fast', 'Blitz'], ['armored', 'Hardened'], ['noair', 'No airstrikes'], ['norepair', 'No repair'], ['nohero', 'No hero'], ['glass', 'Glass walls'], ['darkness', 'Blackout']];
function challenges() { if (!Array.isArray(S.challenges)) S.challenges = []; return S.challenges; }
function cleanChallenge(c) {
  if (!c || typeof c !== 'object') return null;
  const types = (Array.isArray(c.types) ? c.types : []).filter(t => ENEMIES[t] && !ENEMIES[t].raidBoss).slice(0, 12);
  if (!types.length) return null;
  return {
    name: String(c.name || 'Custom challenge').replace(/[<>]/g, '').slice(0, 28) || 'Custom challenge',
    waves: clamp(Math.round(+c.waves || 4), 3, 8), level: clamp(Math.round(+c.level || 10), 1, 60), types,
    rules: (Array.isArray(c.rules) ? c.rules : []).filter(r => CH_RULES.some(x => x[0] === r)),
    weather: WEATHER.some(w => w.id === c.weather) ? c.weather : 'clear', daytime: DAYTIME.some(d => d.id === c.daytime) ? c.daytime : 'day',
  };
}
function challengeCode(c) { return CH_PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, ...cleanChallenge(c) })))); }
function parseChallenge(code) {
  code = String(code || '').trim();
  if (!code.startsWith(CH_PREFIX)) return null;
  try { return cleanChallenge(JSON.parse(decodeURIComponent(escape(atob(code.slice(CH_PREFIX.length)))))); } catch (e) { return null; }
}
function challengeMission(c) {
  c = cleanChallenge(c);
  const waves = [];
  for (let i = 0; i < c.waves; i++) {
    const budget = (5 + c.level * 0.9) * (0.6 + i * 0.25);
    waves.push(c.types.map(t => ({ type: t, count: Math.max(1, Math.round(budget / c.types.length / (ENEMIES[t].hp >= 1500 ? 6 : ENEMIES[t].hp >= 400 ? 3 : 1))) })));
  }
  const mods = {};
  if (c.rules.includes('fast')) mods.fast = 1.35;
  if (c.rules.includes('armored')) mods.armored = 1.5;
  if (c.rules.includes('noair')) mods.noAirstrike = true;
  if (c.rules.includes('norepair')) mods.noRepair = true;
  if (c.rules.includes('nohero')) mods.noHero = true;
  return { id: 'challenge', challenge: c, name: c.name, hq: 1, level: c.level, gates: ['w', 'e', 'n'], mods, waves, reward: { medals: 0 }, brief: 'Custom challenge' };
}
function applyChallengeRules(m) {
  const c = m.challenge;
  B.weather = WEATHER.find(w => w.id === c.weather) || B.weather;
  B.daytime = c.rules.includes('darkness') ? DAYTIME.find(d => d.id === 'night') : DAYTIME.find(d => d.id === c.daytime) || B.daytime;
  if (c.rules.includes('glass')) for (const b of S.buildings) if ((b.type === 'wall' || b.type === 'gate') && b._maxhp) { b._maxhp = Math.max(1, Math.round(b._maxhp / 2)); b._hp = b._maxhp; }
  B.lootMul = 0; // challenges are for fun: no loot
}
function challengeOver(reason) {
  const m = B.mission, c = m.challenge, won = reason === 'victory';
  B.over = true;
  const saved = challenges().find(x => JSON.stringify(cleanChallenge(x)) === JSON.stringify(c));
  if (saved) { saved.plays = (saved.plays || 0) + 1; if (won) saved.wins = (saved.wins || 0) + 1; }
  logEvent('mission', `Challenge "${c.name}": ${won ? 'beaten' : 'failed'}`);
  save();
  openModal(`<div class="brief"><div class="brief-head"><span class="stamp">Custom challenge</span><h2>${won ? 'Challenge beaten' : 'Challenge failed'}</h2><p>${c.name} · ${B.kills} enemies destroyed.</p></div>
    <div class="brief-foot"><button class="btn ghost" id="btn-ch-again">Try again</button><button class="btn" data-close>Return to base</button></div></div>`, () => leaveBattle());
  $('#btn-ch-again').addEventListener('click', () => { modalOnClose = null; closeModal(); leaveBattle(); startBattle(challengeMission(c)); });
}
let chDraft = null;
function openChallenges(back) {
  const list = challenges();
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Challenge Editor</h2><span class="m-count">${list.length} / 10 saved</span></div>
      <p class="lead">Build your own battle: pick the enemies, waves, strength, rules and weather. Share it as a code. Challenges are for fun and give no loot.</p>
      <div class="ch-list">${list.map((c, i) => `<div class="ch"><b>${c.name}</b><span>${c.waves} waves · strength ${c.level} · ${c.types.length} enemy types${c.wins ? ` · beaten ${c.wins}x` : ''}</span>
        <div class="settings-row"><button class="btn small" data-chplay="${i}">Play</button><button class="btn ghost small" data-chedit="${i}">Edit</button><button class="btn ghost small" data-chshare="${i}">Share</button><button class="btn ghost small" data-chdel="${i}">Delete</button></div></div>`).join('') || '<p class="lead">No challenges yet.</p>'}</div>
      <textarea class="text-input code-box" rows="2" id="ch-import" placeholder="Paste a WBC: challenge code"></textarea>
      <div class="settings-row"><button class="btn" id="btn-ch-new">New challenge</button><button class="btn ghost" id="btn-ch-import">Import code</button><button class="btn ghost" data-close>Back</button></div>
    </div>`, back || null);
  const el = $('#modal-body');
  el.querySelectorAll('[data-chplay]').forEach(b => b.addEventListener('click', () => { startBattle(challengeMission(list[+b.dataset.chplay])); }));
  el.querySelectorAll('[data-chedit]').forEach(b => b.addEventListener('click', () => { chDraft = { ...list[+b.dataset.chedit], idx: +b.dataset.chedit }; openChallengeEditor(back); }));
  el.querySelectorAll('[data-chdel]').forEach(b => b.addEventListener('click', () => { list.splice(+b.dataset.chdel, 1); save(); openChallenges(back); }));
  el.querySelectorAll('[data-chshare]').forEach(b => b.addEventListener('click', async () => {
    const code = challengeCode(list[+b.dataset.chshare]); $('#ch-import').value = code;
    try { await navigator.clipboard.writeText(code); toast('Challenge code copied', 'good'); } catch (e) { toast('Code is in the box below. Copy it from there', 'info'); }
  }));
  $('#btn-ch-new').addEventListener('click', () => { chDraft = { name: 'My challenge', waves: 4, level: Math.max(5, (S.bestWave || 5)), types: ['rifleman', 'tank', 'drone'], rules: [], weather: 'clear', daytime: 'day' }; openChallengeEditor(back); });
  $('#btn-ch-import').addEventListener('click', () => {
    const c = parseChallenge($('#ch-import').value);
    if (!c) { toast('That is not a valid challenge code', 'bad'); Sound.play('error'); return; }
    if (list.length >= 10) { toast('Delete a challenge first (10 max)', 'bad'); return; }
    list.push(c); save(); toast(`Imported "${c.name}"`, 'good'); openChallenges(back);
  });
}
function openChallengeEditor(back) {
  const c = chDraft;
  const types = Object.keys(ENEMIES).filter(t => !ENEMIES[t].raidBoss);
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Edit challenge</h2></div>
      <input class="text-input" id="ch-name" maxlength="28" value="${String(c.name).replace(/"/g, '&quot;')}">
      <div class="set-row"><div class="set-label"><b>Waves</b></div><div class="seg">${[3, 4, 5, 6, 8].map(n => `<button class="seg-b ${c.waves === n ? 'on' : ''}" data-chw="${n}">${n}</button>`).join('')}</div></div>
      <div class="set-row"><div class="set-label"><b>Strength</b><span>Like an endless wave number</span></div><div class="seg">${[5, 10, 20, 30, 45, 60].map(n => `<button class="seg-b ${c.level === n ? 'on' : ''}" data-chl="${n}">${n}</button>`).join('')}</div></div>
      <h3 class="report-h">Enemies <small>${c.types.length} chosen</small></h3>
      <div class="ch-types">${types.map(t => `<button class="ch-t ${c.types.includes(t) ? 'on' : ''}" data-cht="${t}">${ENEMIES[t].name}</button>`).join('')}</div>
      <h3 class="report-h">Rules</h3>
      <div class="ch-types">${CH_RULES.map(([id, n]) => `<button class="ch-t ${c.rules.includes(id) ? 'on' : ''}" data-chr="${id}">${n}</button>`).join('')}</div>
      <div class="set-row"><div class="set-label"><b>Weather</b></div><div class="seg">${WEATHER.map(w => `<button class="seg-b ${c.weather === w.id ? 'on' : ''}" data-chwx="${w.id}">${w.name.split(' ').pop()}</button>`).join('')}</div></div>
      <div class="set-row"><div class="set-label"><b>Time</b></div><div class="seg">${DAYTIME.map(d => `<button class="seg-b ${c.daytime === d.id ? 'on' : ''}" data-chd="${d.id}">${d.name}</button>`).join('')}</div></div>
      <div class="settings-row"><button class="btn" id="btn-ch-save">Save</button><button class="btn battle-go" id="btn-ch-play">Save and play</button><button class="btn ghost" id="btn-ch-back">Cancel</button></div>
    </div>`, back || null);
  const el = $('#modal-body');
  const keep = () => { c.name = $('#ch-name').value; };
  const re = () => { keep(); openChallengeEditor(back); };
  el.querySelectorAll('[data-chw]').forEach(b => b.addEventListener('click', () => { c.waves = +b.dataset.chw; re(); }));
  el.querySelectorAll('[data-chl]').forEach(b => b.addEventListener('click', () => { c.level = +b.dataset.chl; re(); }));
  el.querySelectorAll('[data-cht]').forEach(b => b.addEventListener('click', () => { const t = b.dataset.cht; c.types = c.types.includes(t) ? c.types.filter(x => x !== t) : c.types.concat(t).slice(0, 12); re(); }));
  el.querySelectorAll('[data-chr]').forEach(b => b.addEventListener('click', () => { const r = b.dataset.chr; c.rules = c.rules.includes(r) ? c.rules.filter(x => x !== r) : c.rules.concat(r); re(); }));
  el.querySelectorAll('[data-chwx]').forEach(b => b.addEventListener('click', () => { c.weather = b.dataset.chwx; re(); }));
  el.querySelectorAll('[data-chd]').forEach(b => b.addEventListener('click', () => { c.daytime = b.dataset.chd; re(); }));
  const commit = () => {
    keep();
    const clean = cleanChallenge(c);
    if (!clean) { toast('Pick at least one enemy', 'bad'); Sound.play('error'); return null; }
    const list = challenges();
    if (c.idx != null && list[c.idx]) list[c.idx] = { ...clean, wins: list[c.idx].wins, plays: list[c.idx].plays };
    else { if (list.length >= 10) { toast('Delete a challenge first (10 max)', 'bad'); return null; } list.push(clean); c.idx = list.length - 1; }
    save(); return clean;
  };
  $('#btn-ch-save').addEventListener('click', () => { if (commit()) openChallenges(back); });
  $('#btn-ch-play').addEventListener('click', () => { const m = commit(); if (m) startBattle(challengeMission(m)); });
  $('#btn-ch-back').addEventListener('click', () => openChallenges(back));
}

/* ================= Field Album ================= */
function albumPages() {
  const kills = S.stats.killsBy || {};
  const enemyTypes = Object.keys(ENEMIES).filter(t => !ENEMIES[t].raidBoss && !ENEMIES[t].boss);
  const defTypes = Object.keys(DEFS).filter(t => DEFS[t].dmg && !DEFS[t].trap && t !== 'hq');
  const best = t => S.buildings.filter(b => b.type === t).reduce((m, b) => Math.max(m, b.level), 0);
  const weathers = S.stats.weathers || {}, times = S.stats.daytimes || {};
  return [
    { id: 'enemies', name: 'Enemy dossiers', cards: enemyTypes.map(t => ({ id: t, name: ENEMIES[t].name, art: 'enemy', got: (kills[t] || 0) >= ALBUM.killsPerCard, note: `${Math.min(kills[t] || 0, ALBUM.killsPerCard)}/${ALBUM.killsPerCard} kills` })) },
    { id: 'arsenal', name: 'Arsenal', cards: defTypes.map(t => ({ id: t, name: DEFS[t].name, art: 'building', got: best(t) >= ALBUM.defenseLevel, note: `level ${best(t)}/${ALBUM.defenseLevel}` })) },
    { id: 'commanders', name: 'Commanders', cards: Object.keys(HEROES).map(id => ({ id, name: HEROES[id].name, art: 'hero', got: heroUnlocked(id) && heroState(id).level >= ALBUM.heroLevel, note: heroUnlocked(id) ? `level ${heroState(id).level}/${ALBUM.heroLevel}` : 'locked' })) },
    { id: 'battlefields', name: 'Battlefields', cards: WEATHER.map(w => ({ id: w.id, name: w.name, art: 'text', got: !!weathers[w.id], note: weathers[w.id] ? 'fought' : 'not yet' })).concat(DAYTIME.map(d => ({ id: 'd-' + d.id, name: `${d.name} battle`, art: 'text', got: !!times[d.id], note: times[d.id] ? 'fought' : 'not yet' }))) },
    { id: 'bosses', name: 'Bosses', cards: ['siege', 'titan', 'behemoth', 'skyfortress'].map(t => ({ id: t, name: ENEMIES[t].name, art: 'enemy', got: (kills[t] || 0) >= 1, note: (kills[t] || 0) >= 1 ? `destroyed ${kills[t]}x` : 'not yet' })) },
  ];
}
function albumClaimable() { const cl = S.albumClaimed || {}; return albumPages().filter(p => p.cards.every(c => c.got) && !cl[p.id]).length; }
function claimAlbum(id) {
  const p = albumPages().find(x => x.id === id);
  S.albumClaimed = S.albumClaimed || {};
  if (!p || S.albumClaimed[id] || !p.cards.every(c => c.got)) return 0;
  S.albumClaimed[id] = true;
  const m = ALBUM.rewards[id] || 10;
  S.medals += m; Sound.play('medal'); logEvent('league', `Album page "${p.name}" complete: +${m} medals`); save();
  return m;
}
let albumTab = 'enemies';
function openAlbum(back) {
  const pages = albumPages(), page = pages.find(p => p.id === albumTab) || pages[0];
  const got = page.cards.filter(c => c.got).length, done = got === page.cards.length, claimed = (S.albumClaimed || {})[page.id];
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Field Album</h2><div class="tabs">${pages.map(p => `<button class="tab ${p.id === page.id ? 'on' : ''}" data-alb="${p.id}">${p.name}</button>`).join('')}</div></div>
      <p class="lead">${got} of ${page.cards.length} cards. Finish the page for <b>${ALBUM.rewards[page.id]} medals</b>.</p>
      <div class="alb-grid">${page.cards.map(c => `<div class="alb ${c.got ? 'got' : ''}" data-art="${c.art}" data-id="${c.id}"><i></i><b>${c.name}</b><span>${c.note}</span></div>`).join('')}</div>
      <div class="settings-row">${done && !claimed ? `<button class="btn medal-btn" id="btn-alb-claim">Claim ${ALBUM.rewards[page.id]} medals</button>` : claimed ? '<span class="lead">Page reward claimed.</span>' : ''}<button class="btn" data-close>Done</button></div>
    </div>`, back || null);
  const el = $('#modal-body');
  el.querySelectorAll('[data-alb]').forEach(b => b.addEventListener('click', () => { albumTab = b.dataset.alb; openAlbum(back); }));
  el.querySelectorAll('.alb').forEach(card => {
    const holder = card.querySelector('i'), id = card.dataset.id;
    try {
      if (card.dataset.art === 'enemy') holder.appendChild(renderEnemyPreview(id, 40));
      else if (card.dataset.art === 'building') holder.appendChild(renderPreview(id, Math.max(1, ALBUM.defenseLevel), 40));
      else if (card.dataset.art === 'hero' && typeof renderHeroPreview === 'function') holder.appendChild(renderHeroPreview(id, 40));
    } catch (e) { /* art is optional */ }
  });
  const cb = $('#btn-alb-claim');
  if (cb) cb.addEventListener('click', () => { claimAlbum(page.id); openAlbum(back); });
}

/* ================= Win streaks ================= */
function recordStreak(won) {
  const st = S.winStreak || (S.winStreak = { n: 0, best: 0 });
  if (won) { st.n++; st.best = Math.max(st.best, st.n); } else st.n = 0;
  save();
  return st.n;
}

/* ================= Welcome-back report ================= */
let welcome = null;
function buildWelcome(awayMs, gains) {
  if (awayMs < WELCOME_MIN) return null;
  const now = Date.now();
  const jobs = S.buildings.filter(b => b.job && b.job.end <= now).map(b => `${displayName(b.type, b.job.to)} level ${b.job.to}`);
  const research = S.research && S.research.job && S.research.job.end <= now ? `${RESEARCH[S.research.job.id].name} level ${S.research.job.to}` : null;
  const troops = army().queue.filter(q => q.end <= now).length;
  return { awayMs, gains, jobs, research, troops };
}
function showWelcomeBack() {
  const w = welcome; welcome = null;
  if (!w || B) return false;
  const h = Math.floor(w.awayMs / 3600000), mins = Math.floor(w.awayMs / 60000) % 60;
  const rows = [];
  for (const k of ['gold', 'steel', 'oil']) if (w.gains[k] >= 1) rows.push(`<li><span>${k[0].toUpperCase() + k.slice(1)} mined (ready to collect)</span><b>+${fmt(w.gains[k])}</b></li>`);
  for (const j of w.jobs) rows.push(`<li><span>Finished</span><b>${j}</b></li>`);
  if (w.research) rows.push(`<li><span>Research done</span><b>${w.research}</b></li>`);
  if (w.troops) rows.push(`<li><span>Troops trained</span><b>${w.troops}</b></li>`);
  if (!rows.length) return false;
  openModal(`<div class="brief"><div class="brief-head"><span class="stamp">Welcome back</span><h2>While you were away</h2><p>You were gone ${h ? `${h}h ` : ''}${mins}m. Here is what happened at ${S.name}.</p></div>
    <ul class="units">${rows.join('')}</ul><div class="brief-foot"><button class="btn" data-close>Back to work</button></div></div>`);
  return true;
}

/* ================= What's new in 5.0 ================= */
const WHATS_NEW_5 = [
  ['The Gauntlet', 'A roguelite run: 8 battles, branching paths, 16 artifacts and a Warlord boss (Command Center 5)'],
  ['Paragons', 'Merge three level 10+ defenses of a type into one super tower (Command Center 10)'],
  ['Challenge Editor', 'Build battles from any enemies, rules and weather. Share them as codes'],
  ['Commander Knowledge', 'Ten permanent perks. Points from Command Center levels, ranks and Gauntlet wins'],
  ['Vengeance Tower', 'Grows stronger with every building the enemy destroys (Command Center 11)'],
  ['Decoy Beacon', 'New ability: an inflatable tank that pulls enemies away (Command Center 7)'],
  ['Army presets', 'Save three army mixes and refill them with one tap at the Barracks'],
  ['Field Album', 'Collect enemy dossiers, defenses, heroes, battlefields and bosses for medals'],
  ['Win streaks', 'Every win adds +10% loot, up to +50%'],
  ['Weekend Blitz', 'Saturdays and Sundays: +25% loot and double wave medals'],
  ['Welcome-back report', 'See what your base did while you were away'],
  ['Air first targeting', 'A new targeting priority for your anti-air'],
];
const WHATS_NEW_55 = [
  ['Intro and tutorial', 'New commanders get an opening briefing and a guided tutorial from Sgt. Vance. Replay either from Settings > Data'],
  ['Compact interface', 'Smaller bars and buttons on phones, clear of the notch, so you see more of the battlefield. Settings > Graphics > Interface size'],
  ['Rally button', 'No longer stays on screen after a battle ends'],
  ['Battle endings', 'A countdown from a battle you already left can no longer end your next one'],
  ['Battle buttons', 'Speed, Launch, Rally, the minimap, abilities and the troop bar no longer overlap'],
  ['Building panel', 'Costs wrap instead of being cut off, and the panel no longer covers the Campaign button'],
  ['Boss Raid', 'The time-up message names the right boss'],
];
// Shows once per update: for 5.0 itself, and again for 5.5 to players who already saw 5.0.
function maybeShowWhatsNew5() {
  if (S.seenUpdate5 === UPDATE5_VERSION && S.seenUpdate55 === UPDATE55_VERSION) return false;
  const fresh = S.tut != null && S.tut < 99;
  Object.assign(S, { seenUpdate55: UPDATE55_VERSION, seenUpdate5: UPDATE5_VERSION, seenUpdate4: UPDATE4_VERSION, seenUpdate3: UPDATE3_VERSION, seenPatch: PATCH_VERSION, seenUpdate2: UPDATE2_VERSION, seenUpdate: UPDATE_VERSION });
  save();
  if (fresh) return false;
  openWhatsNew5();
  return true;
}
function openWhatsNew5(back) {
  openModal(`
    <div class="settings">
      <div class="m-head"><div><span class="stamp">Update ${UPDATE55_VERSION}</span><h2>Legends</h2></div></div>
      <p class="lead">Find the Gauntlet, Challenge Editor, Knowledge and Field Album in the Operations hub (compass) and the menu.</p>
      <div class="chap">${UPDATE55_VERSION}: phone interface and fixes</div>
      <ul class="whats-new">${WHATS_NEW_55.map(([a, b]) => `<li><b>${a}</b><span>${b}</span></li>`).join('')}</ul>
      <div class="chap">${UPDATE5_VERSION}: Legends</div>
      <ul class="whats-new">${WHATS_NEW_5.map(([a, b]) => `<li><b>${a}</b><span>${b}</span></li>`).join('')}</ul>
      <div class="settings-row"><button class="btn ghost" id="btn-older5">Older updates</button><button class="btn" data-close>To the front</button></div>
    </div>`, back || null);
  $('#btn-older5').addEventListener('click', () => openWhatsNew4(() => openWhatsNew5(back)));
}

/* ================= Wiring ================= */
function initLegends() {
  // mission endings for the new modes
  const _endMission = endMission;
  endMission = function (reason) {
    const m = B && B.mission;
    if (m && m.gauntlet) { gauntletBattleOver(reason); return; }
    if (m && m.challenge) { challengeOver(reason); return; }
    const won = reason === 'victory';
    _endMission(reason);
    if (m && !m.practice && !m.raid) recordStreak(won);
  };
  const _endBattle = endBattle;
  endBattle = function (reason) {
    const info = B && !B.over && !B.mission ? { waves: B.waves - (B.checkpoint || 0) } : null;
    _endBattle(reason);
    if (info) recordStreak(info.waves >= STREAK.winWaves);
  };
  const _leave = leaveBattle;
  leaveBattle = function () {
    if (S.buildings.some(b => DEFS[b.type] && DEFS[b.type].decoy)) { S.buildings = S.buildings.filter(b => !DEFS[b.type].decoy); rebuildGrid(); }
    _leave();
  };
  const _xp = addHeroXP;
  addHeroXP = function (id, n) { _xp(id, n * (1 + kBonus('hero'))); };
  const _medals = waveMedals;
  waveMedals = function (n) { return _medals(n) * (isWeekend() ? WEEKEND.medalMul : 1); };
  const _offline = applyOffline;
  applyOffline = function (sec) {
    const before = {};
    for (const b of S.buildings) before[b.id] = b.stored || 0;
    _offline(sec);
    const gains = { gold: 0, steel: 0, oil: 0 };
    for (const b of S.buildings) { const k = DEFS[b.type].produces; if (k) gains[k] += (b.stored || 0) - (before[b.id] || 0); }
    welcome = buildWelcome(sec * 1000, gains);
  };
  const _barracks = openBarracks;
  openBarracks = function () { _barracks(); decorateBarracks(); };
}

// Battle brief line: win streak and weekend event.
function legendsBriefHTML() {
  const st = S.winStreak || { n: 0 }, sb = Math.round(streakBonus() * 100);
  const bits = [];
  if (st.n) bits.push(`<span class="fc"><b>Win streak ${st.n}</b> +${sb}% loot</span>`);
  if (isWeekend()) bits.push('<span class="fc"><b>Weekend Blitz</b> +25% loot, double wave medals</span>');
  return bits.length ? `<div class="fc-row">${bits.join('')}</div>` : '';
}
