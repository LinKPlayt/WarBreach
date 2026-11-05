// WarBreach — Update 6.0 "Overhaul": Blueprints (one-tap layouts planned for your buildings),
// the Base Inspector, the Upgrade Advisor, Weekly Contracts, "upgrade all" for any building type,
// and the battle side of the 6.0 research topics, field upgrades and the Apocalypse threat.
'use strict';

/* ================= Battle hooks ================= */
function overhaulBattleStart() {
  B.bonus.antiAir += researchBonus('antiair');
  const f = researchBonus('fortify');
  if (f) {
    for (const b of S.buildings) {
      if ((b.type !== 'wall' && b.type !== 'gate') || !b._maxhp) continue;
      const k = b._hp / b._maxhp; // keep damage carried in from a Gauntlet battle
      b._maxhp = Math.round(b._maxhp * (1 + f));
      b._hp = Math.max(1, Math.round(b._maxhp * k));
    }
  }
}

/* ================= Weekly contracts ================= */
function hashSeed(str) { let h = 2166136261; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function contracts() {
  const wk = weekKey();
  if (!S.contracts || S.contracts.week !== wk || !Array.isArray(S.contracts.list)) {
    const r = mulberry(hashSeed(`${wk}:${S.name || ''}`) + 4242);
    const pool = CONTRACT_TYPES.slice(), list = [];
    while (list.length < 3 && pool.length) {
      const t = pool.splice(Math.floor(r() * pool.length), 1)[0];
      const tier = Math.min(2, Math.floor(r() * 3));
      list.push({ id: t.id, tier, target: t.n[tier], progress: 0, claimed: false });
    }
    S.contracts = { week: wk, list };
  }
  return S.contracts;
}
function contractEvent(id, n) {
  if (typeof S === 'undefined' || !S || (typeof B !== 'undefined' && B && B.practice)) return;
  for (const c of contracts().list) if (c.id === id && !c.claimed) c.progress = Math.min(c.target, c.progress + n);
}
function contractsClaimable() { return contracts().list.filter(c => !c.claimed && c.progress >= c.target).length; }
function contractReward(c) {
  const cap = storageCap(), share = CONTRACT_REWARD.storage[c.tier] || 0.12;
  return { medals: CONTRACT_REWARD.medals[c.tier] || 15, gold: Math.round(cap * share / 10) * 10, steel: Math.round(cap * share / 10) * 10 };
}
function claimContract(i) {
  const c = contracts().list[i];
  if (!c || c.claimed || c.progress < c.target) return null;
  const r = contractReward(c);
  c.claimed = true;
  S.medals += r.medals;
  const got = { medals: r.medals, gold: gainRes('gold', r.gold), steel: gainRes('steel', r.steel) };
  S.stats.contracts = (S.stats.contracts || 0) + 1;
  awardChestStars(6);
  logEvent('league', `Weekly contract complete: +${r.medals} medals`);
  Sound.play('medal'); save();
  return got;
}
function weekTimeLeft() {
  const n = new Date(), t = new Date(n);
  t.setHours(24, 0, 0, 0);
  while (t.getDay() !== 1) t.setDate(t.getDate() + 1); // ISO weeks start on Monday
  return fmtTime((t - n) / 1000);
}
function openContracts(back) {
  const rows = contracts().list.map((c, i) => {
    const t = CONTRACT_TYPES.find(x => x.id === c.id), done = c.progress >= c.target, r = contractReward(c);
    return `<li class="mission ${done && !c.claimed ? 'ready' : ''}">
      <div class="m-body"><div class="m-text">${t.text(c.target)}</div>
        <div class="m-bar"><div style="width:${(c.progress / c.target * 100).toFixed(1)}%"></div></div>
        <div class="m-prog">${fmt(c.progress)} / ${fmt(c.target)}</div></div>
      <div class="m-reward">${rewardText(r)}</div>
      ${c.claimed ? '<span class="road-tag">Done</span>' : done ? `<button class="btn" data-contract="${i}">Claim</button>` : ''}
    </li>`;
  }).join('');
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Weekly contracts</h2><span class="m-count">New contracts in ${weekTimeLeft()}</span></div>
      <p class="lead">Three big objectives every week. Each pays medals, gold and steel (more as your storage grows) and War Chest stars. Practice battles do not count.</p>
      <ul class="missions">${rows}</ul>
      <div class="settings-row"><button class="btn" data-close>Done</button></div>
    </div>`, back || null);
  $('#modal-body').querySelectorAll('[data-contract]').forEach(b => b.addEventListener('click', () => {
    const got = claimContract(+b.dataset.contract);
    if (got) toast(`Contract complete: +${got.medals} medals, +${fmt(got.gold)} gold, +${fmt(got.steel)} steel`, 'good');
    openContracts(back);
  }));
}

/* ================= Upgrade every building of a type ================= */
// Starts as many upgrades as there are free builders and resources, and queues the rest.
function upgradeAllTimed(type, level) {
  const list = S.buildings.filter(w => w.type === type && w.level === level && !w.job && queueIndex(w) < 0);
  let started = 0, queued = 0, short = 0;
  for (const w of list) {
    const st = upgradeStatus(w);
    if (st.ok) {
      pay(st.cost); startJob(w, st.to); started++;
    } else if (canQueue(w, st)) {
      S.queue = S.queue || []; S.queue.push({ id: w.id }); queued++;
    } else if (st.reason === 'Not enough resources') short++;
  }
  if (!started && !queued) { toast(short ? 'Not enough resources' : 'No builder or queue slot free', 'bad'); Sound.play('error'); return { started, queued }; }
  Sound.play('build');
  const name = DEFS[type].name + (started + queued > 1 ? 's' : '');
  toast(`${started ? `${started} ${name} upgrading` : ''}${started && queued ? ', ' : ''}${queued ? `${queued} queued` : ''} to level ${level + 1}`, 'good');
  save();
  return { started, queued };
}

/* ================= Upgrade Advisor ================= */
// Defense upgrades ranked by firepower gained per resource spent.
function advisorPicks(n = 6) {
  const out = [];
  const hqL = hqLevel();
  for (const b of S.buildings) {
    const d = DEFS[b.type];
    if (!d.dmg || d.trap || b.type === 'hq' || b.level < 1) continue;
    const to = b.level + 1;
    if (to > d.max || to > levelCap(b.type, hqL)) continue;
    let gain = statsFor(b.type, to).dps - statsFor(b.type, b.level).dps;
    if (b.paragon) gain *= PARAGON.dmg * PARAGON.rate;
    const c = costFor(b.type, to), price = (c.gold || 0) + (c.steel || 0) + (c.oil || 0) * 3;
    if (gain <= 0 || price <= 0) continue;
    out.push({ b, to, gain: Math.round(gain), cost: c, value: gain / price * 1000, busy: !!b.job });
  }
  out.sort((a, c) => c.value - a.value);
  return out.slice(0, n);
}
function openAdvisor(back) {
  const picks = advisorPicks();
  const allCapped = !picks.length;
  const rows = picks.map((p, i) => {
    const st = upgradeStatus(p.b), q = queueIndex(p.b) >= 0;
    const btn = p.busy ? '<span class="road-tag">Upgrading</span>' : q ? '<span class="road-tag">Queued</span>'
      : st.ok ? `<button class="btn" data-adv="${p.b.id}"><span class="btn-main">Upgrade</span><span class="btn-sub">${costHTML(p.cost)}</span></button>`
        : canQueue(p.b, st) ? `<button class="btn ghost" data-advq="${p.b.id}"><span class="btn-main">Queue</span><span class="btn-sub">${costHTML(p.cost)}</span></button>`
          : `<span class="road-tag">${st.reason}</span>`;
    return `<li class="mission"><div class="m-body"><div class="m-text">${i + 1}. ${DEFS[p.b.type].name} to level ${p.to}${p.b.paragon ? ' (Paragon)' : ''}</div>
      <div class="m-prog">+${fmt(p.gain)} damage per second · ${gridRef(p.b)}</div></div>${btn}</li>`;
  }).join('');
  const hqUp = upgradeStatus(hq());
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Upgrade Advisor</h2><span class="m-count">Most firepower for your resources</span></div>
      <p class="lead">${allCapped ? `Every defense is at the highest level your Command Center allows. ${hqUp.max ? 'Your base is maxed out.' : 'Upgrade the Command Center next.'}` : 'Defense upgrades ranked by damage per second gained for every resource spent (oil counts triple).'}</p>
      ${rows ? `<ul class="missions">${rows}</ul>` : ''}
      <div class="settings-row">${allCapped && !hqUp.max ? '<button class="btn" id="btn-adv-hq">Show the Command Center</button>' : ''}<button class="btn" data-close>Done</button></div>
    </div>`, back || null);
  const el = $('#modal-body');
  el.querySelectorAll('[data-adv]').forEach(b => b.addEventListener('click', () => { const t = byId(+b.dataset.adv); if (t) upgrade(t); openAdvisor(back); }));
  el.querySelectorAll('[data-advq]').forEach(b => b.addEventListener('click', () => { const t = byId(+b.dataset.advq); if (t) queueUpgrade(t); openAdvisor(back); }));
  const hb = $('#btn-adv-hq');
  if (hb) hb.addEventListener('click', () => { modalOnClose = null; closeModal(); showBuilding(hq()); });
}
function showBuilding(b) {
  if (!b) return;
  const c = centerOf(b);
  cam.x = c.x; cam.y = c.y; clampCam();
  select(b.id);
}

/* ================= Base Inspector ================= */
const ROAD_NAMES = { w: 'west', e: 'east', n: 'north' };
function isStructure(b) { const d = DEFS[b.type]; return !d.deco && !d.trap && !d.decoy && b.type !== 'wall' && b.type !== 'gate'; }
function coveredBy(target, standoff, air) {
  for (const d of S.buildings) {
    if (d.level < 1) continue;
    const w = weaponOf(d);
    if (!w || DEFS[d.type].trap) continue;
    if (air ? w.targets === 'ground' : w.targets === 'air') continue;
    const c = centerOf(d);
    if (distToBuilding(c.x, c.y, target) + standoff <= w.range) return true;
  }
  return false;
}
// Can an enemy walk from a road to the Command Center without breaking anything?
function openRoads() {
  const blocked = new Uint8Array(MAP_W * MAP_H), h = hq();
  for (const b of S.buildings) {
    if (b === h || isPassive(b.type) || DEFS[b.type].decoy) continue;
    const n = DEFS[b.type].size;
    for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) blocked[(b.y + dy) * MAP_W + b.x + dx] = 1;
  }
  const out = [];
  for (const g of Object.keys(GATES)) {
    const p = GATES[g](), seen = new Uint8Array(MAP_W * MAP_H), q = [[Math.floor(p.x / TILE), Math.floor(p.y / TILE)]];
    seen[q[0][1] * MAP_W + q[0][0]] = 1;
    let reached = false;
    while (q.length && !reached) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, i = ny * MAP_W + nx;
        if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H || seen[i] || blocked[i]) continue;
        if (nx >= h.x && nx < h.x + 3 && ny >= h.y && ny < h.y + 3) { reached = true; break; }
        seen[i] = 1; q.push([nx, ny]);
      }
    }
    if (reached) out.push(g);
  }
  return out;
}
function inspectBase() {
  const issues = [];
  const hqL = hqLevel();
  const structs = S.buildings.filter(b => isStructure(b) && b.level >= 1);
  const hasGuns = S.buildings.some(b => b.level >= 1 && weaponOf(b) && !DEFS[b.type].trap && b.type !== 'hq');
  const exposed = structs.filter(b => !coveredBy(b, 2.2, false));
  if (exposed.length) issues.push({ id: 'exposed', weight: 4, of: structs.length, ids: exposed.map(b => b.id), title: `${exposed.length} building${exposed.length > 1 ? 's' : ''} no defense can protect`, text: 'Attackers can stand next to these and shoot them where no gun reaches. They hold waves up and wear your base down. Move them closer to your defenses or add a defense nearby.' });
  if (hqL >= 6) {
    const shelled = structs.filter(b => !exposed.includes(b) && !coveredBy(b, 6.5, false));
    if (shelled.length) issues.push({ id: 'artillery', weight: 0.5, of: structs.length, ids: shelled.map(b => b.id), title: `${shelled.length} building${shelled.length > 1 ? 's' : ''} open to artillery`, text: 'Artillery Trucks fire from 6.5 tiles away. Long-range defenses (Mortar, Sniper Tower, Missile Battery and up) should reach that far past your outer buildings.' });
  }
  const airGuns = S.buildings.some(b => { const w = b.level >= 1 && weaponOf(b); return w && w.targets !== 'ground' && !DEFS[b.type].trap; });
  if (hqL >= 3) {
    const noAir = structs.filter(b => !coveredBy(b, 1.4, true));
    if (noAir.length) issues.push({ id: 'air', weight: airGuns ? 2 : 3, of: structs.length, ids: noAir.map(b => b.id), title: airGuns ? `${noAir.length} building${noAir.length > 1 ? 's' : ''} without air cover` : 'No anti-air defense', text: 'Drones and gunships fly over walls. Machine Gun Nests, Sniper Towers, Missile Batteries and the other anti-air guns should cover every building.' });
  }
  const idleAuras = S.buildings.filter(b => DEFS[b.type].aura && b.level >= 1 && S.buildings.filter(o => o !== b && o.level >= 1 && DEFS[o.type].dmg && !DEFS[o.type].trap && Math.hypot(centerOf(o).x - centerOf(b).x, centerOf(o).y - centerOf(b).y) <= DEFS[b.type].auraRange * TILE).length < 2);
  if (idleAuras.length) issues.push({ id: 'aura', weight: 2, of: S.buildings.filter(b => DEFS[b.type].aura && b.level >= 1).length, ids: idleAuras.map(b => b.id), title: `${idleAuras.length} support building${idleAuras.length > 1 ? 's' : ''} boosting fewer than two defenses`, text: 'Ammo Bunkers and Radar Stations only help defenses within a few tiles. Put them in the middle of your guns.' });
  const h = centerOf(hq());
  const lanes = Object.keys(GATES).map(g => { const p = GATES[g](); return [p.x, p.y, h.x, h.y]; });
  const idleTraps = S.buildings.filter(b => DEFS[b.type].trap && b.level >= 1 && !lanes.some(l => segDist(centerOf(b).x, centerOf(b).y, l[0], l[1], l[2], l[3]) <= 4 * TILE));
  if (idleTraps.length) issues.push({ id: 'traps', weight: 0.5, of: S.buildings.filter(b => DEFS[b.type].trap && b.level >= 1).length, ids: idleTraps.map(b => b.id), title: `${idleTraps.length} trap${idleTraps.length > 1 ? 's' : ''} away from the roads`, text: 'Enemies come in along the west, east and north roads. Mines and wire far from those lines may never be touched.' });
  const open = openRoads();
  if (open.length && hasGuns) issues.push({ id: 'open', weight: 4 * open.length, of: 1, ids: [], title: `Open path from the ${open.map(g => ROAD_NAMES[g]).join(' and ')} road${open.length > 1 ? 's' : ''}`, text: 'Enemies can walk to the Command Center without breaking a single wall. Close the ring with walls or gates.' });
  // each issue costs its weight times (2 + 10 x the share of buildings it affects)
  let score = 100;
  for (const i of issues) score -= i.weight * (2 + 10 * Math.min(1, (i.ids.length || 1) / Math.max(1, i.of)));
  issues.sort((a, b) => b.weight * (2 + 10 * Math.min(1, (b.ids.length || 1) / Math.max(1, b.of))) - a.weight * (2 + 10 * Math.min(1, (a.ids.length || 1) / Math.max(1, a.of))));
  return { score: Math.max(0, Math.round(score)), issues };
}
function inspectorGrade(score) { return score >= 90 ? 'Fortress' : score >= 75 ? 'Solid' : score >= 55 ? 'Exposed' : 'Wide open'; }
function openInspector(back) {
  const r = inspectBase();
  const list = r.issues.map(i => {
    const names = i.ids.slice(0, 5).map(id => { const b = byId(id); return b ? `<button class="chip chip-btn" data-show="${id}">${DEFS[b.type].name} · ${gridRef(b).replace('GRID ', '')}</button>` : ''; }).join('');
    return `<li class="mission"><div class="m-body"><div class="m-text">${i.title}</div><div class="m-prog">${i.text}</div>${names ? `<div class="insp-chips">${names}${i.ids.length > 5 ? `<span class="chip">+${i.ids.length - 5} more</span>` : ''}</div>` : ''}</div></li>`;
  }).join('');
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Base Inspector</h2><span class="m-count">Layout score ${r.score}/100 · ${inspectorGrade(r.score)}</span></div>
      <p class="lead">${r.issues.length ? 'What to fix in your layout, most important first. Tap a building to find it on the map.' : 'No weak spots found. Every building is covered and the ring is closed.'}</p>
      ${list ? `<ul class="missions">${list}</ul>` : ''}
      <div class="settings-row"><button class="btn ghost" id="btn-insp-bp">Try a blueprint</button><button class="btn" data-close>Done</button></div>
    </div>`, back || null);
  const el = $('#modal-body');
  el.querySelectorAll('[data-show]').forEach(b => b.addEventListener('click', () => { modalOnClose = null; closeModal(); showBuilding(byId(+b.dataset.show)); }));
  $('#btn-insp-bp').addEventListener('click', () => openBlueprints(back));
}

/* ================= Blueprints: plan a layout for the buildings you own ================= */
function blueprintClass(b) {
  const d = DEFS[b.type];
  if (b.type === 'hq') return 'hq';
  if (d.decoy) return 'skip';
  if (d.deco) return 'deco';
  if (d.trap) return 'trap';
  if (d.size === 1) return 'ring'; // walls, gates, sentries, watchtowers
  if (d.aura || b.type === 'repairbay' || b.type === 'shieldgen') return 'aura';
  if (d.dmg || d.hangar) return (d.range || 0) >= 6 || d.hangar ? 'long' : 'short';
  return 'econ';
}
function roundRobin(list) {
  const by = {};
  for (const b of list) (by[b.type] = by[b.type] || []).push(b);
  const out = [], types = Object.keys(by);
  for (let more = true; more;) { more = false; for (const t of types) if (by[t].length) { out.push(by[t].shift()); more = true; } }
  return out;
}
// Returns { pos: { id: [x, y] }, unplaced } without moving anything.
function planBlueprint(style) {
  const bp = BLUEPRINTS.find(x => x.id === style) || BLUEPRINTS[0];
  const occ = new Int32Array(MAP_W * MAP_H), pos = {};
  const free = (type, x, y) => {
    const n = DEFS[type].size;
    for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) {
      const tx = x + dx, ty = y + dy;
      if (!inBuildArea(tx, ty) || occ[ty * MAP_W + tx] || obstacleAt(tx, ty)) return false;
    }
    return true;
  };
  const mark = (b, x, y) => { const n = DEFS[b.type].size; for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) occ[(y + dy) * MAP_W + x + dx] = b.id; pos[b.id] = [x, y]; };
  const occAt = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && occ[y * MAP_W + x] !== 0;
  // the Command Center goes in the middle of the map when that ground is clear
  const h = hq(), mid = { x: Math.floor(MAP_W / 2) - 2, y: Math.floor(MAP_H / 2) - 1 };
  if (free('hq', mid.x, mid.y)) mark(h, mid.x, mid.y); else mark(h, h.x, h.y);
  const cx = pos[h.id][0] + 1, cy = pos[h.id][1] + 1;
  const nearestTo = (type, px, py) => {
    const n = DEFS[type].size; let best = null, bd = Infinity;
    for (let y = BORDER; y < MAP_H - BORDER; y++) for (let x = BORDER; x < MAP_W - BORDER; x++) {
      const d = Math.hypot(x + n / 2 - (px + 0.5), y + n / 2 - (py + 0.5));
      if (d < bd - 1e-9 && free(type, x, y)) { bd = d; best = { x, y }; }
    }
    return best;
  };
  const groups = { aura: [], long: [], short: [], econ: [], ring: [], trap: [], deco: [] };
  for (const b of S.buildings) { const k = blueprintClass(b); if (groups[k]) groups[k].push(b); }
  const unplaced = [];
  const place = (b, px = cx, py = cy) => { const sp = nearestTo(b.type, px, py); if (sp) mark(b, sp.x, sp.y); else unplaced.push(b); };
  // 1. the block of 2x2 and 3x3 buildings, ring by ring from the Command Center
  const order = bp.order[0] === 'mixed' ? [roundRobin([...groups.aura, ...groups.long, ...groups.econ, ...groups.short])] : bp.order.map(k => roundRobin(groups[k]));
  for (const list of order) for (const b of list) place(b);
  // 2. one-tile ring: gates facing the roads, sentries and watchtowers spread out, walls between
  const ringAround = () => {
    const outside = new Uint8Array(MAP_W * MAP_H), q = [];
    for (let x = 0; x < MAP_W; x++) for (const y of [0, MAP_H - 1]) { outside[y * MAP_W + x] = 1; q.push([x, y]); }
    for (let y = 0; y < MAP_H; y++) for (const x of [0, MAP_W - 1]) { outside[y * MAP_W + x] = 1; q.push([x, y]); }
    while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H || outside[ny * MAP_W + nx] || occAt(nx, ny)) continue; outside[ny * MAP_W + nx] = 1; q.push([nx, ny]); } }
    const out = [];
    for (let y = BORDER; y < MAP_H - BORDER; y++) for (let x = BORDER; x < MAP_W - BORDER; x++) {
      if (occAt(x, y) || !outside[y * MAP_W + x] || obstacleAt(x, y)) continue;
      let touch = false;
      for (let dy = -1; dy <= 1 && !touch; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && occAt(x + dx, y + dy)) { touch = true; break; }
      if (touch) out.push({ x, y, a: Math.atan2(y + 0.5 - (cy + 0.5), x + 0.5 - (cx + 0.5)) });
    }
    return out.sort((p, q2) => p.a - q2.a);
  };
  const angDist = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const ringItems = groups.ring.slice();
  const gates = ringItems.filter(b => b.type === 'gate'), towers = roundRobin(ringItems.filter(b => b.type !== 'gate' && b.type !== 'wall'));
  const walls = ringItems.filter(b => b.type === 'wall');
  const r1 = ringAround(), used = new Set();
  [Math.PI, 0, -Math.PI / 2, Math.PI / 2].forEach((a, i) => {
    const g = gates[i]; if (!g) return;
    let best = null, bd = 9;
    for (const p of r1) if (!used.has(p) && angDist(p.a, a) < bd) { bd = angDist(p.a, a); best = p; }
    if (best) { used.add(best); mark(g, best.x, best.y); }
  });
  const spare = r1.filter(p => !used.has(p));
  towers.forEach((t, i) => { const p = spare[Math.floor((i + 0.5) * spare.length / towers.length)]; if (p && !occAt(p.x, p.y)) { used.add(p); mark(t, p.x, p.y); } else place(t); });
  for (const b of gates) if (!pos[b.id]) place(b);
  let wi = 0;
  for (const p of r1) { if (wi >= walls.length) break; if (!occAt(p.x, p.y)) mark(walls[wi++], p.x, p.y); }
  // 3. a second ring on the road sides, then a third if walls are left
  const roadAng = [Math.PI, 0, -Math.PI / 2];
  for (let ring = 2; ring <= 3 && wi < walls.length; ring++) {
    const r = ringAround().sort((p, q2) => Math.min(...roadAng.map(a => angDist(p.a, a))) - Math.min(...roadAng.map(a => angDist(q2.a, a))));
    for (const p of r) { if (wi >= walls.length) break; if (!occAt(p.x, p.y)) mark(walls[wi++], p.x, p.y); }
  }
  // spare walls: the bottom corners, away from every road
  for (let y = MAP_H - BORDER - 1; y >= MAP_H - BORDER - 3 && wi < walls.length; y--) for (let k = 0; k < 12 && wi < walls.length; k++) for (const x of [BORDER + k, MAP_W - BORDER - 1 - k]) if (wi < walls.length && free('wall', x, y)) mark(walls[wi++], x, y);
  while (wi < walls.length) place(walls[wi++]);
  // 4. traps on the three approach roads, just outside the walls
  const traps = roundRobin(groups.trap);
  const trapTiles = [];
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1]]) {
    let x = cx, y = cy;
    while (inBuildArea(x, y) && occAt(x, y)) { x += dx; y += dy; }
    for (let k = 0; k < 10; k++) for (const w of [0, -1, 1, -2, 2]) {
      const tx = x + dx * k + (dy ? w : 0), ty = y + dy * k + (dx ? w : 0);
      trapTiles.push({ tx, ty, k: k + Math.abs(w) * 0.1 });
    }
  }
  trapTiles.sort((p, q2) => p.k - q2.k);
  let ti = 0;
  for (const p of trapTiles) { if (ti >= traps.length) break; if (free(traps[ti].type, p.tx, p.ty)) mark(traps[ti++], p.tx, p.ty); }
  while (ti < traps.length) place(traps[ti++]);
  // 5. decorations along the bottom edge
  for (const b of groups.deco) place(b, cx, MAP_H - BORDER - 1);
  return { pos, unplaced: unplaced.filter(b => !pos[b.id]).map(b => b.id) };
}
// Moves the base into the plan; the old positions are kept for one undo.
function applyBlueprint(style) {
  if (B) { toast('Finish the battle first', 'bad'); return false; }
  const plan = planBlueprint(style);
  if (plan.unplaced.length) { toast(`Not enough clear ground: ${plan.unplaced.length} building${plan.unplaced.length > 1 ? 's' : ''} would not fit. Clear some obstacles first`, 'bad'); Sound.play('error'); return false; }
  if (placing) cancelPlace();
  S.blueprintUndo = { style, pos: Object.fromEntries(S.buildings.map(b => [b.id, [b.x, b.y]])) };
  for (const b of S.buildings) if (plan.pos[b.id]) { b.x = plan.pos[b.id][0]; b.y = plan.pos[b.id][1]; }
  rebuildGrid(); save();
  logEvent('layout', `Applied the ${BLUEPRINTS.find(x => x.id === style).name} blueprint`);
  Sound.play('done');
  return true;
}
function undoBlueprint() {
  const u = S.blueprintUndo;
  if (!u || B) return false;
  const later = [];
  for (const b of S.buildings) { const p = u.pos[b.id]; if (p) { b.x = p[0]; b.y = p[1]; } else later.push(b); }
  rebuildGrid();
  for (const b of later) if (!footprintFree(b.type, b.x, b.y, b.id)) { const sp = nearestFree(b.type, b.x, b.y); if (sp) { b.x = sp.x; b.y = sp.y; rebuildGrid(); } }
  S.blueprintUndo = null; save();
  Sound.play('click');
  return true;
}
// Score a plan with the inspector by moving the base there for a moment.
function scorePlan(plan) {
  const keep = S.buildings.map(b => [b, b.x, b.y]);
  for (const b of S.buildings) if (plan.pos[b.id]) { b.x = plan.pos[b.id][0]; b.y = plan.pos[b.id][1]; }
  rebuildGrid();
  const r = inspectBase();
  for (const [b, x, y] of keep) { b.x = x; b.y = y; }
  rebuildGrid();
  return r.score;
}
const BP_COLORS = { hq: '#f2b632', aura: '#6ec0ff', long: '#e0563a', short: '#f08a4b', econ: '#7fbf5a', ring: '#8d8d84', trap: '#9a7a4a', deco: '#b48ad8' };
function drawPlan(cv, plan) {
  const g = cv.getContext('2d'), s = cv.width / (MAP_W - 2 * BORDER);
  g.fillStyle = '#26301d'; g.fillRect(0, 0, cv.width, cv.height);
  for (let y = BORDER; y < MAP_H - BORDER; y++) for (let x = BORDER; x < MAP_W - BORDER; x++) if (obstacleAt(x, y)) { g.fillStyle = '#4a4436'; g.fillRect((x - BORDER) * s, (y - BORDER) * s, s, s); }
  for (const b of S.buildings) {
    const p = plan ? plan.pos[b.id] : [b.x, b.y]; if (!p) continue;
    const n = DEFS[b.type].size;
    g.fillStyle = BP_COLORS[blueprintClass(b)] || '#888';
    g.fillRect((p[0] - BORDER) * s + 0.5, (p[1] - BORDER) * s + 0.5, n * s - 1, n * s - 1);
  }
}
let bpPick = 'fortress';
function openBlueprints(back) {
  const plan = planBlueprint(bpPick), bp = BLUEPRINTS.find(x => x.id === bpPick);
  const now = inspectBase().score, then = plan.unplaced.length ? null : scorePlan(plan);
  const legend = [['hq', 'Command Center'], ['aura', 'Support'], ['long', 'Long-range guns'], ['short', 'Short-range guns'], ['econ', 'Economy and army'], ['ring', 'Walls and towers'], ['trap', 'Traps']]
    .map(([k, n]) => `<span class="bp-key"><i style="background:${BP_COLORS[k]}"></i>${n}</span>`).join('');
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Blueprints</h2><div class="tabs">${BLUEPRINTS.map(x => `<button class="tab ${x.id === bpPick ? 'on' : ''}" data-bp="${x.id}">${x.name}</button>`).join('')}</div></div>
      <p class="lead">${bp.desc} Planned for the buildings you own now; anything you build later fits around it.</p>
      <div class="bp-wrap"><canvas class="bp-map" width="380" height="260"></canvas><div class="bp-legend">${legend}</div></div>
      <p class="lead">${then == null ? `${plan.unplaced.length} building${plan.unplaced.length > 1 ? 's do' : ' does'} not fit on the clear ground. Clear some obstacles first.` : `Layout score: ${now} now, <b>${then}</b> with this blueprint.`}</p>
      <div class="settings-row">${S.blueprintUndo ? '<button class="btn ghost" id="btn-bp-undo">Undo last blueprint</button>' : ''}<button class="btn ${then == null ? 'off' : ''}" id="btn-bp-apply">Apply ${bp.name}</button><button class="btn ghost" data-close>Close</button></div>
    </div>`, back || null);
  const el = $('#modal-body');
  drawPlan(el.querySelector('.bp-map'), plan);
  el.querySelectorAll('[data-bp]').forEach(b => b.addEventListener('click', () => { bpPick = b.dataset.bp; openBlueprints(back); }));
  $('#btn-bp-apply').addEventListener('click', () => { if (applyBlueprint(bpPick)) { toast(`${bp.name} blueprint applied. Undo it from this screen`, 'good'); modalOnClose = null; closeModal(); recenter(); } });
  const ub = $('#btn-bp-undo');
  if (ub) ub.addEventListener('click', () => { if (undoBlueprint()) toast('Your previous layout is back', 'good'); openBlueprints(back); });
}

/* ================= Operations hub tiles ================= */
function hubExtraTiles() {
  const insp = inspectBase();
  return [
    { id: 'contracts', name: 'Weekly contracts', sub: contractsClaimable() ? `${contractsClaimable()} ready to claim` : `New in ${weekTimeLeft()}`, dot: contractsClaimable() > 0, fn: () => openContracts(openHub) },
    { id: 'inspector', name: 'Base Inspector', sub: `Layout score ${insp.score}/100`, dot: insp.score < 55, fn: () => openInspector(openHub) },
    { id: 'blueprints', name: 'Blueprints', sub: 'Plan your base in one tap', fn: () => openBlueprints(openHub) },
    { id: 'advisor', name: 'Upgrade Advisor', sub: 'Best upgrades for your resources', fn: () => openAdvisor(openHub) },
  ];
}

/* ================= Wiring ================= */
(function wireOverhaul() {
  const _order = orderEvent;
  orderEvent = function (id, n) { _order(id, n); contractEvent(id, n); };
  const _medals = waveMedals;
  waveMedals = function (n) { return _medals(n) + ((B && B.bonus && B.bonus.medalsPerWave) || 0); };
  const _end = endBattle;
  endBattle = function (reason) {
    if (B && !B.over && !B.mission && B.threat && B.threat.id === 'apocalypse') S.stats.apocalypseBest = Math.max(S.stats.apocalypseBest || 0, B.waves || 0);
    _end(reason);
  };
})();
