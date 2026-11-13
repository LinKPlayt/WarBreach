// WarBreach — Update 7.0 "Counterstrike": the Counteroffensive mode (take your army out and
// destroy enemy siege camps), special ammunition for defenses, and timed Expeditions for troops.
'use strict';

/* ================= Counteroffensive ================= */
function strikeState() { if (!S.strike || typeof S.strike !== 'object') S.strike = { best: 0 }; return S.strike; }
const CAMP_POS = {
  w: () => ({ x: 2.2 * TILE, y: (MAP_H / 2) * TILE - 30 }),
  e: () => ({ x: (MAP_W - 2.2) * TILE, y: (MAP_H / 2) * TILE + 40 }),
  n: () => ({ x: (MAP_W / 2) * TILE + 30, y: 2.2 * TILE }),
};
const CAMP_NAMES = { w: 'west', e: 'east', n: 'north' };
function strikeMission(sector) {
  const level = strikeLevel(sector);
  const first = waveComposition(level).filter(g => g.count > 0 && campCanSend(g.type))
    .map(g => ({ type: g.type, count: Math.max(1, Math.round(g.count * STRIKE.waveScale)) }));
  return { id: 'strike', strike: true, sector, name: `Counteroffensive: Sector ${sector}`, hq: hqLevel(), level, gates: ['w', 'e', 'n'],
    mods: {}, waves: [first], reward: { medals: 0 }, brief: 'Destroy the three siege camps.' };
}
function campCanSend(type) { const e = ENEMIES[type]; return !e.boss && !e.raidBoss && !e.camp && !e.bomber && !e.hover; }
function campHp(level) { return Math.round(enemyHp('camp', level)); }
function campDamage(level) { return ENEMIES.camp.dmg * (1 + 0.05 * (level - 1)); }
function placeCamps() {
  const m = B.mission, idx = B.spawnIdx;
  let k = 0;
  for (const g of ['w', 'e', 'n']) {
    spawnEnemy('camp');
    const u = B.units[B.units.length - 1], p = CAMP_POS[g](), hp = campHp(m.level);
    Object.assign(u, { x: p.x, y: p.y, elite: false, hp, max: hp, gate: g, spawnT: STRIKE.firstSpawn + k++ * 6, moving: false, angle: 0, aim: 0, cd: 1 });
  }
  B.spawnIdx = idx;
  B.campsTotal = B.campsLeft = 3; B.campSpawns = 0;
  banner('Destroy the siege camps', 'One at the end of each road. Send your troops and hero: base guns barely scratch them');
}
function campSquad(u) {
  const m = B.mission, pool = [];
  for (const g of waveComposition(m.level)) if (g.count > 0 && campCanSend(g.type)) for (let i = 0; i < Math.min(6, g.count); i++) pool.push(g.type);
  if (!pool.length) pool.push('rifleman');
  // squads grow the longer the camps stand
  const n = Math.min(STRIKE.squadMax, STRIKE.squad + Math.floor(m.sector / 2) + Math.floor((B.campSpawns || 0) / 6));
  B.campSpawns = (B.campSpawns || 0) + 1;
  for (let i = 0; i < n; i++) {
    spawnEnemy(pool[Math.floor(Math.random() * pool.length)]);
    const nu = B.units[B.units.length - 1];
    nu.x = u.x + (Math.random() - 0.5) * 50; nu.y = u.y + (Math.random() - 0.5) * 50;
  }
  B.fx.push({ kind: 'ring', x: u.x, y: u.y, r: 40, life: 0.5, max: 0.5, color: '200,64,42' });
}
function updateCamp(u, e, dt) {
  u.moving = false;
  if (u.flash > 0) u.flash -= dt;
  u.cd -= dt;
  // the garrison shoots whoever comes close: the hero and every troop, helicopters included
  let best = null, bd = e.range * TILE;
  const H = B.hero;
  if (H && !H.dead) { const d = Math.hypot(H.x - u.x, H.y - u.y); if (d < bd) { bd = d; best = H; } }
  for (const t of B.troops) {
    if (t.hp <= 0 || t.drop > 0) continue;
    const d = Math.hypot(t.x - u.x, t.y - u.y);
    if (d < bd) { bd = d; best = t; }
  }
  if (best) {
    u.aim = Math.atan2(best.y - u.y, best.x - u.x);
    if (u.cd <= 0) {
      u.cd = 1 / e.rate; u.flash = 0.06;
      damageAlly(best, campDamage(B.mission ? B.mission.level : 1) * (u.dmgK || 1));
      B.fx.push({ kind: 'tracer', x1: u.x, y1: u.y - 10, x2: best.x, y2: best.y - 2, life: 0.07, color: '#ff9a6a' });
      Sound.play('mg');
    }
  }
  u.spawnT -= dt;
  if (u.spawnT <= 0) { u.spawnT = STRIKE.spawnEvery; campSquad(u); }
}
function campDestroyed(u) {
  B.campsLeft = B.units.filter(o => o !== u && o.hp > 0 && ENEMIES[o.type].camp).length;
  S.stats.camps = (S.stats.camps || 0) + 1;
  explosion(u.x, u.y, 70); buzz([80, 40, 120]);
  banner(`${CAMP_NAMES[u.gate] ? CAMP_NAMES[u.gate][0].toUpperCase() + CAMP_NAMES[u.gate].slice(1) : 'Siege'} camp destroyed`, B.campsLeft ? `${B.campsLeft} to go` : 'Mop up what is left');
}
function strikeOver(reason) {
  const m = B.mission, st = strikeState(), won = reason === 'victory';
  B.over = true;
  let got = null, first = false;
  if (won) {
    first = m.sector > st.best;
    const r = strikeReward(m.sector, first), cap = storageCap();
    S.medals += r.medals;
    got = { medals: r.medals, gold: gainRes('gold', Math.round(cap * r.share / 10) * 10), steel: gainRes('steel', Math.round(cap * r.share / 10) * 10) };
    st.best = Math.max(st.best, m.sector);
    S.stats.strikes = (S.stats.strikes || 0) + 1;
    B.battleStars += 4;
    orderEvent('mission', 1); eventTokens(10);
    addXP(40 + m.sector * 10);
    logEvent('mission', `Counteroffensive sector ${m.sector} won`);
    Sound.play('win'); buzz([60, 40, 60]);
  } else Sound.play('lose');
  save();
  const title = won ? 'Camps destroyed' : reason === 'retreat' ? 'Counteroffensive called off' : 'Base overrun';
  const line = won ? `Sector ${m.sector} is clear${first ? '' : ' (replay: a quarter of the reward)'}. Surviving troops are heading home.`
    : `${B.campsLeft != null ? B.campsLeft : 3} of 3 camps were still standing. Surviving troops are heading home; train more and try again.`;
  openModal(`
    <div class="brief">
      <div class="brief-head"><span class="stamp">Counteroffensive</span><h2>${title}</h2><p>${line}</p></div>
      <ul class="units">
        <li><span>Enemies destroyed</span><b>${B.kills}</b></li>
        <li><span>Troops lost</span><b>${B.lost || 0}</b></li>
        ${got ? `<li><span>Medals</span><b>+${got.medals}</b></li><li><span>Gold</span><b>+${fmt(got.gold)}</b></li><li><span>Steel</span><b>+${fmt(got.steel)}</b></li>` : ''}
        <li><span>Best sector</span><b>${st.best}</b></li>
      </ul>
      <div class="brief-foot">${won ? '<button class="btn ghost" id="btn-strike-next">Next sector</button>' : ''}<button class="btn" data-close>Return to base</button></div>
    </div>`, leaveBattle);
  const nb = $('#btn-strike-next');
  if (nb) nb.addEventListener('click', () => { closeModal(); strikePick = st.best + 1; openStrike(); });
}
let strikePick = 0;
function armyHeadcount() { return Object.keys(TROOPS).reduce((a, t) => a + troopCount(t), 0); }
function openStrike(back) {
  const st = strikeState(), max = st.best + 1;
  if (!strikePick || strikePick > max) strikePick = max;
  const sector = strikePick, level = strikeLevel(sector), first = sector > st.best;
  const r = strikeReward(sector, first), cap = storageCap(), res = Math.round(cap * r.share / 10) * 10;
  const open = hqLevel() >= STRIKE.hq, troops = armyHeadcount();
  const squads = strikeMission(sector).waves[0].map(g => `${g.count} ${ENEMIES[g.type].name}`).slice(0, 6).join(', ');
  openModal(`
    <div class="settings">
      <div class="m-head"><div><span class="stamp">Attack mode</span><h2>Counteroffensive</h2></div><span class="m-count">Best sector ${st.best}</span></div>
      <p class="lead">The enemy has dug in three <b>siege camps</b>, one at the end of each road, and they keep sending squads at your base. Your guns do a tenth of their damage to a camp, so take the fight to them: deploy troops beside a camp, walk your hero over, call airstrikes. Destroy all three to win. Squads get bigger the longer the camps stand.</p>
      <div class="settings-row sector-row"><button class="btn ghost small ${sector > 1 ? '' : 'off'}" id="btn-sec-prev">&lsaquo;</button><b class="sector-n">Sector ${sector}</b><button class="btn ghost small ${sector < max ? '' : 'off'}" id="btn-sec-next">&rsaquo;</button></div>
      <ul class="units">
        <li><span>Enemy level</span><b>${level}</b></li>
        <li><span>Each camp</span><b>${fmt(campHp(level))} health</b></li>
        <li><span>First assault</span><b>${squads}</b></li>
        <li><span>Reward${first ? '' : ' (replay)'}</span><b>${r.medals} medals, ${fmt(res)} gold and steel</b></li>
        <li><span>Your army</span><b>${troops ? `${troops} troop${troops > 1 ? 's' : ''} ready` : 'No troops trained'}</b></li>
      </ul>
      ${open && !troops ? '<p class="lead">You have no troops. Your hero and abilities can do it alone, but it will be slow: train an army at the Barracks first.</p>' : ''}
      <div class="settings-row"><button class="btn battle-go ${open ? '' : 'off'}" id="btn-strike-go">${open ? 'Launch' : `Command Center ${STRIKE.hq}`}</button><button class="btn ghost" data-close>Back</button></div>
    </div>`, back || null);
  $('#btn-sec-prev').addEventListener('click', () => { if (strikePick > 1) { strikePick--; openStrike(back); } });
  $('#btn-sec-next').addEventListener('click', () => { if (strikePick < max) { strikePick++; openStrike(back); } });
  $('#btn-strike-go').addEventListener('click', () => {
    if (!open) { toast(`The Counteroffensive opens at Command Center ${STRIKE.hq}`, 'info'); return; }
    if (B) return;
    modalOnClose = null; closeModal();
    startBattle(strikeMission(sector));
  });
}
// Camp art: sandbags, a command tent, a radio mast and a red objective ring.
STORM_ART.camp = function (ctx, u, e, white) {
  const pulse = 0.5 + Math.sin(tSec * 3) * 0.25;
  ctx.strokeStyle = `rgba(232,72,48,${pulse})`; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
  ctx.beginPath(); ctx.ellipse(0, 2, 36, 26, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(3, 8, 30, 18, 0, 0, Math.PI * 2); ctx.fill();
  // sandbag ring
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, x = Math.cos(a) * 26, y = Math.sin(a) * 17 + 3;
    ctx.fillStyle = white ? '#fff' : i % 2 ? '#8a7a55' : '#9b8a62';
    ctx.beginPath(); ctx.ellipse(x, y, 6.5, 4.2, a, 0, Math.PI * 2); ctx.fill();
  }
  // tent
  ctx.fillStyle = white ? '#fff' : ENEMY_COL.dark; ctx.beginPath(); ctx.moveTo(-16, 8); ctx.lineTo(0, -16); ctx.lineTo(16, 8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = white ? '#fff' : ENEMY_COL.body; ctx.beginPath(); ctx.moveTo(-16, 8); ctx.lineTo(0, -16); ctx.lineTo(3, 8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1c1512'; ctx.beginPath(); ctx.moveTo(-4, 8); ctx.lineTo(1, -2); ctx.lineTo(6, 8); ctx.closePath(); ctx.fill();
  // mast and flag
  ctx.strokeStyle = '#2a2622'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(15, 6); ctx.lineTo(15, -30); ctx.stroke();
  ctx.fillStyle = '#c8402a'; ctx.beginPath(); ctx.moveTo(15, -30); ctx.lineTo(27 + Math.sin(tSec * 5) * 1.5, -26); ctx.lineTo(15, -22); ctx.closePath(); ctx.fill();
  if (u.flash > 0) { ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(Math.cos(u.aim) * 24, Math.sin(u.aim) * 16, 5, 0, Math.PI * 2); ctx.fill(); }
  ctx.font = '10px "Black Ops One", Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#f2b632'; ctx.fillText('SIEGE CAMP', 0, -36);
};

/* ================= Special ammunition ================= */
function ammoBunkerBuilt() { return S.buildings.some(b => b.type === 'ammo' && b.level >= 1); }
function ammoEligible(b) { const d = DEFS[b.type]; return !!d.dmg && !d.trap && !d.hangar && !d.decoy && b.type !== 'hq'; }
function ammoAvailable(b) { return ammoEligible(b) && b.level >= AMMO_LEVEL && ammoBunkerBuilt(); }
// Called from damageEnemy for a hit by a defense carrying special ammunition.
function applyAmmo(u, ed, dmg, ammo, src) {
  if (ammo.hit) dmg *= ammo.hit;
  if (ammo.vehicle && (ed.vehicle || ed.boss)) dmg *= ammo.vehicle;
  else if (ammo.infantry && !ed.vehicle && !u.air && !ed.boss) dmg *= ammo.infantry;
  if (ammo.burn) { u.burn = (u.burn || 0) + dmg * ammo.burn; u.burnSrc = src; }
  if (ammo.chill) { u.chill = ed.boss ? ammo.chill / 2 : ammo.chill; u.chillT = ammo.chillTime; }
  return dmg;
}
function setAmmo(b, id) {
  if (!AMMO[id] || !ammoAvailable(b)) return false;
  if ((b.ammo || 'standard') === id) return false;
  const cost = id === 'standard' ? { gold: 0, steel: 0 } : ammoCost(b.type, b.level);
  if (!canAfford(cost)) { toast('Not enough resources', 'bad'); Sound.play('error'); return false; }
  pay(cost);
  if (id === 'standard') delete b.ammo; else b.ammo = id;
  return true;
}
function setAmmoForType(type, id) {
  let n = 0;
  for (const o of S.buildings) if (o.type === type && (o.ammo || 'standard') !== id && ammoAvailable(o) && canAfford(id === 'standard' ? {} : ammoCost(o.type, o.level)) && setAmmo(o, id)) n++;
  return n;
}
function openAmmo(b) {
  const cur = AMMO[b.ammo] ? b.ammo : 'standard', cost = ammoCost(b.type, b.level), name = DEFS[b.type].name;
  const others = S.buildings.filter(o => o !== b && o.type === b.type && ammoAvailable(o) && (o.ammo || 'standard') !== cur);
  const allCost = others.reduce((a, o) => { const c = cur === 'standard' ? { gold: 0, steel: 0 } : ammoCost(o.type, o.level); return { gold: a.gold + c.gold, steel: a.steel + c.steel }; }, { gold: 0, steel: 0 });
  const opts = Object.keys(AMMO).map(k => `
    <button class="spec-opt ${k === cur ? 'on' : ''}" data-ammo="${k}" style="--sc:${AMMO[k].color}">
      <span class="spec-gem"></span>
      <span class="spec-name">${AMMO[k].name}${k === cur ? ' (loaded)' : ''}</span>
      <span class="spec-desc">${AMMO[k].desc}</span>
    </button>`).join('');
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Ammunition: ${name}</h2><span class="m-count">${costHTML(cost)} to change</span></div>
      <p class="lead">Load one ammunition type into this ${name}. You can change it any time; going back to standard rounds is free.</p>
      <div class="spec-row ammo-row">${opts}</div>
      <div class="settings-row">${others.length ? `<button class="btn ghost" id="btn-ammo-all"><span class="btn-main">Load ${AMMO[cur].short} into all ${others.length + 1}</span>${cur === 'standard' ? '' : `<span class="btn-sub">${costHTML(allCost)}</span>`}</button>` : ''}<button class="btn" data-close>Done</button></div>
    </div>`);
  $('#modal-body').querySelectorAll('[data-ammo]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.ammo;
    if (id === cur) return;
    if (!setAmmo(b, id)) return;
    Sound.play('done'); toast(`${name}: ${AMMO[id].name}`, 'good');
    const c = centerOf(b); burst(c.x, c.y, AMMO[id].color, 14);
    save(); openAmmo(b); refreshPanel(true);
  }));
  const ab = $('#btn-ammo-all');
  if (ab) ab.addEventListener('click', () => {
    const n = setAmmoForType(b.type, cur);
    if (n) { Sound.play('done'); toast(`${n} more ${name}${n > 1 ? 's' : ''} loaded with ${AMMO[cur].short}`, 'good'); save(); }
    else { toast('Not enough resources', 'bad'); Sound.play('error'); }
    openAmmo(b); refreshPanel(true);
  });
}

/* ================= Battle update: burns and chills ================= */
function offensiveBattleUpdate(dt) {
  for (const u of B.units) {
    if (u.hp <= 0) continue;
    if (u.chillT > 0) {
      u.chillT -= dt;
      if (Math.random() < dt * 4) particles.push({ x: u.x + (Math.random() - 0.5) * 12, y: u.y - (u.air ? 18 : 4), vx: 0, vy: -10, g: 0, life: 0.5, max: 0.5, r: 2, color: '#bfeaff', glow: true });
    }
    if (u.burn > 0) {
      const d = Math.min(u.burn, Math.max(u.burn / AMMO_BURN_TIME, 6) * dt);
      u.burn -= d;
      damageEnemy(u, d, u.burnSrc); // no shooter is set here, so a burn never lights another burn
      if (Math.random() < dt * 7) particles.push({ x: u.x + (Math.random() - 0.5) * 10, y: u.y - (u.air ? 18 : 4), vx: (Math.random() - 0.5) * 10, vy: -34, g: 0, life: 0.4, max: 0.4, r: 3, grow: 6, color: Math.random() < 0.5 ? '#ffb347' : '#ff6a2a', glow: true });
    }
  }
}

/* ================= Expeditions ================= */
function expState() {
  if (!S.expeditions || typeof S.expeditions !== 'object') S.expeditions = { day: '', offers: [], active: [] };
  const X = S.expeditions, today = dayKey();
  if (!Array.isArray(X.active)) X.active = [];
  if (X.day !== today || !Array.isArray(X.offers)) {
    const r = mulberry(dailySeed() + 1717), L = hqLevel();
    const pool = EXPEDITION_TYPES.filter(t => (t.hq || EXPEDITIONS.hq) <= Math.max(L, EXPEDITIONS.hq)), pick = [];
    while (pick.length < EXPEDITIONS.offers && pool.length) pick.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    pick.sort((a, b) => a.hours - b.hours);
    X.day = today; X.offers = pick.map(t => ({ id: t.id, taken: false }));
  }
  return X;
}
function expType(id) { return EXPEDITION_TYPES.find(t => t.id === id); }
function expRisk(t, party) { return t.risk * (party && party.medic ? EXPEDITIONS.medicRisk : 1); }
// The cheapest troops go first, so tanks and helicopters stay home unless they are needed.
function expeditionParty(t) {
  const kinds = Object.keys(TROOPS).filter(k => troopCount(k) > 0).sort((a, b) => TROOPS[a].space - TROOPS[b].space || TROOPS[a].unlock - TROOPS[b].unlock);
  const party = {}; let space = 0;
  for (const k of kinds) for (let i = 0; i < troopCount(k) && space < t.space; i++) { party[k] = (party[k] || 0) + 1; space += TROOPS[k].space; }
  return space >= t.space ? { party, space } : null;
}
function partyText(party) { return Object.entries(party).map(([k, n]) => `${n} ${TROOPS[k].name}`).join(', '); }
function expeditionStatus(i) {
  const X = expState(), o = X.offers[i], t = o && expType(o.id);
  if (!t) return { ok: false, reason: 'No such expedition' };
  if (hqLevel() < EXPEDITIONS.hq) return { ok: false, reason: `Command Center ${EXPEDITIONS.hq}` };
  if (o.taken) return { ok: false, reason: 'Sent today' };
  if (X.active.length >= expeditionSlots(hqLevel())) return { ok: false, reason: 'Every party is out' };
  const p = expeditionParty(t);
  if (!p) return { ok: false, reason: `Needs ${t.space} army space of troops` };
  return { ok: true, t, party: p.party };
}
function sendExpedition(i) {
  if (B) return false;
  const st = expeditionStatus(i);
  if (!st.ok) { toast(st.reason, 'bad'); Sound.play('error'); return false; }
  const X = expState(), A = army(), now = Date.now();
  for (const k in st.party) { A.troops[k] -= st.party[k]; if (A.troops[k] <= 0) delete A.troops[k]; }
  X.offers[i].taken = true;
  X.active.push({ id: st.t.id, start: now, end: now + st.t.hours * 3600 * 1000, party: st.party });
  Sound.play('build'); logEvent('mission', `Expedition sent: ${st.t.name}`); save();
  return true;
}
function expeditionReward(t) {
  const cap = storageCap(), r = t.reward, out = { medals: r.medals || 0 };
  for (const k of ['gold', 'steel', 'oil']) out[k] = r[k] ? Math.round(cap * r[k] / 10) * 10 : 0;
  return out;
}
function claimExpedition(k) {
  const X = expState(), e = X.active[k], t = e && expType(e.id);
  if (!t || Date.now() < e.end) return null;
  const risk = expRisk(t, e.party), A = army();
  let back = 0, lost = 0;
  for (const kind in e.party) {
    let home = 0;
    for (let i = 0; i < e.party[kind]; i++) if (Math.random() < risk) lost++; else home++;
    if (home && TROOPS[kind]) { A.troops[kind] = (A.troops[kind] || 0) + home; back += home; }
  }
  const r = expeditionReward(t);
  const got = { medals: r.medals, gold: gainRes('gold', r.gold), steel: gainRes('steel', r.steel), oil: gainRes('oil', r.oil), back, lost, gear: null, name: t.name };
  S.medals += r.medals;
  if (t.reward.gear && Math.random() < t.reward.gear) got.gear = dropGear(1).name;
  X.active.splice(k, 1);
  S.stats.expeditions = (S.stats.expeditions || 0) + 1;
  awardChestStars(2);
  logEvent('mission', `Expedition back: ${t.name}${lost ? ` (${lost} lost)` : ''}`);
  Sound.play('medal'); save();
  return got;
}
// Call a party home early: the troops return, the reward is forfeited.
function recallExpedition(k) {
  const X = expState(), e = X.active[k];
  if (!e) return 0;
  let n = 0;
  for (const kind in e.party) if (TROOPS[kind]) { army().troops[kind] = (army().troops[kind] || 0) + e.party[kind]; n += e.party[kind]; }
  X.active.splice(k, 1);
  Sound.play('click'); save();
  return n;
}
function expeditionsReady() { return ((S.expeditions && S.expeditions.active) || []).filter(e => Date.now() >= e.end).length; }
let expTimer = 0, expRecallArmed = -1;
function openExpeditions(back) {
  const X = expState(), L = hqLevel(), slots = expeditionSlots(L), open = L >= EXPEDITIONS.hq;
  const rewardLine = t => { const r = expeditionReward(t); return rewardText(r) + (t.reward.gear ? ' <span class="cost">gear chance</span>' : ''); };
  const active = X.active.map((e, k) => {
    const t = expType(e.id), ready = Date.now() >= e.end;
    return `<li class="mission ${ready ? 'ready' : ''}"><div class="m-body"><div class="m-text">${t.name}</div>
      <div class="m-bar"><div style="width:${Math.min(100, (Date.now() - e.start) / (e.end - e.start) * 100).toFixed(1)}%"></div></div>
      <div class="m-prog">${partyText(e.party)} · <span data-exp-left="${k}">${ready ? 'Back at the gate' : fmtTime((e.end - Date.now()) / 1000) + ' left'}</span></div></div>
      <div class="m-reward">${rewardLine(t)}</div>
      ${ready ? `<button class="btn" data-exp-claim="${k}">Welcome home</button>` : `<button class="btn ghost small" data-exp-recall="${k}">${expRecallArmed === k ? 'Tap again: no reward' : 'Recall'}</button>`}</li>`;
  }).join('');
  const offers = X.offers.map((o, i) => {
    const t = expType(o.id), st = expeditionStatus(i), p = expeditionParty(t);
    return `<li class="mission"><div class="m-body"><div class="m-text">${t.name} · ${t.hours < 1 ? `${t.hours * 60} min` : `${t.hours} h`}</div>
      <div class="m-prog">${t.desc} Needs ${t.space} army space · ${Math.round(expRisk(t, p && p.party) * 100)}% risk per troop${p && !o.taken ? `<br>Goes: ${partyText(p.party)}` : ''}</div></div>
      <div class="m-reward">${rewardLine(t)}</div>
      ${o.taken ? '<span class="road-tag">Sent today</span>' : `<button class="btn ${st.ok ? '' : 'off'}" data-exp-send="${i}"><span class="btn-main">Send</span>${st.ok ? '' : `<span class="btn-sub reason">${st.reason}</span>`}</button>`}</li>`;
  }).join('');
  openModal(`
    <div class="settings" id="exp-ui">
      <div class="m-head"><h2>Expeditions</h2><span class="m-count">${X.active.length}/${slots} part${slots > 1 ? 'ies' : 'y'} out · new orders in ${timeToReset()}</span></div>
      <p class="lead">${open ? 'Send troops from your Barracks on missions away from the base. They are gone until the mission ends, keep their bunks, and most come home with loot. A Combat Medic in the party cuts the risk by a quarter. More parties at Command Center 6 and 9.' : `Expeditions open at Command Center ${EXPEDITIONS.hq}.`}</p>
      ${active ? `<h3 class="report-h">In the field</h3><ul class="missions">${active}</ul>` : ''}
      <h3 class="report-h">Today's orders</h3><ul class="missions">${offers}</ul>
      <div class="settings-row"><button class="btn" data-close>Done</button></div>
    </div>`, back || null);
  const el = $('#modal-body');
  el.querySelectorAll('[data-exp-send]').forEach(b => b.addEventListener('click', () => { if (sendExpedition(+b.dataset.expSend)) toast('The party has moved out', 'good'); expRecallArmed = -1; openExpeditions(back); }));
  el.querySelectorAll('[data-exp-claim]').forEach(b => b.addEventListener('click', () => {
    const g = claimExpedition(+b.dataset.expClaim);
    if (g) toast(`${g.name}: ${[g.gold && `+${fmt(g.gold)} gold`, g.steel && `+${fmt(g.steel)} steel`, g.oil && `+${fmt(g.oil)} oil`, g.medals && `+${g.medals} medals`, g.gear && `gear: ${g.gear}`].filter(Boolean).join(', ') || 'storage is full'}. ${g.back} home${g.lost ? `, ${g.lost} lost` : ''}`, g.lost ? 'info' : 'good');
    expRecallArmed = -1; openExpeditions(back);
  }));
  el.querySelectorAll('[data-exp-recall]').forEach(b => b.addEventListener('click', () => {
    const k = +b.dataset.expRecall;
    if (expRecallArmed === k) { const n = recallExpedition(k); expRecallArmed = -1; toast(`${n} troop${n > 1 ? 's' : ''} recalled. No reward`, 'info'); } else expRecallArmed = k;
    openExpeditions(back);
  }));
  clearInterval(expTimer);
  expTimer = setInterval(() => {
    if (modal.hidden || !$('#exp-ui')) { clearInterval(expTimer); return; }
    let flip = false;
    document.querySelectorAll('[data-exp-left]').forEach(s => {
      const e = expState().active[+s.dataset.expLeft]; if (!e) return;
      if (Date.now() >= e.end) { if (!s.textContent.startsWith('Back')) flip = true; } else s.textContent = fmtTime((e.end - Date.now()) / 1000) + ' left';
    });
    if (flip) openExpeditions(back);
  }, 1000);
}

/* ================= Wiring ================= */
(function wireOffensive() {
  const _startWave = startWave;
  startWave = function (n) { _startWave(n); if (B && B.mission && B.mission.strike && n === 1) placeCamps(); };
  const _enemyUpdate = stormEnemyUpdate;
  stormEnemyUpdate = function (u, e, dt) {
    if (u.chillT > 0) u.slow *= 1 - (u.chill || 0);
    if (e.camp) { updateCamp(u, e, dt); return true; }
    return _enemyUpdate(u, e, dt);
  };
  const _dmgMod = stormDamageMod;
  stormDamageMod = function (u, ed, dmg, src) {
    if (ed.camp && src && DEFS[src] && src !== 'silo') dmg *= STRIKE.defenseDmg;
    return _dmgMod(u, ed, dmg, src);
  };
  const _killed = stormEnemyKilled;
  stormEnemyKilled = function (u, ed) { _killed(u, ed); if (ed.camp) campDestroyed(u); };
  const _endMission = endMission;
  endMission = function (reason) { if (B && B.mission && B.mission.strike) { strikeOver(reason); return; } _endMission(reason); };
  const _tiles = hubExtraTiles;
  hubExtraTiles = function () {
    const st = strikeState(), ready = expeditionsReady(), X = S.expeditions;
    return [
      { id: 'strike', name: 'Counteroffensive', sub: hqLevel() >= STRIKE.hq ? `Sector ${st.best + 1} · destroy the camps` : `Command Center ${STRIKE.hq}`, fn: () => openStrike(openHub) },
      { id: 'expeditions', name: 'Expeditions', sub: hqLevel() < EXPEDITIONS.hq ? `Command Center ${EXPEDITIONS.hq}` : ready ? `${ready} part${ready > 1 ? 'ies' : 'y'} back` : X && X.active.length ? `${X.active.length} in the field` : 'Send troops for loot', dot: ready > 0, fn: () => openExpeditions(openHub) },
      ..._tiles(),
    ];
  };
})();
