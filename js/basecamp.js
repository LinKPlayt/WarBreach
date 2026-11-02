// WarBreach — Update 3.0 "Storm Front", base side: photo mode, coverage view, build queue,
// cargo drones, a living base, art for the new buildings and the what's-new screen.
'use strict';

/* ================= New building art ================= */
DRAW.repairbay = function (ctx, b, t) {
  const S2 = 2 * TILE, x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  pad(ctx, x, y, S2, '#6f7468', 3);
  // helipad for the repair drones
  ctx.fillStyle = '#4a4f47'; ctx.beginPath(); ctx.arc(x + 57, y + 22, 15, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = PAL.hazard; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + 57, y + 22, 12, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#e9e4d4'; ctx.font = 'bold 11px "Chakra Petch", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', x + 57, y + 23);
  // hangar with a medical cross
  box(ctx, x + 6, y + 40, 46, 30, 16, L >= 6 ? '#9aa39a' : '#8a9182', '#5b6157', 4);
  ctx.fillStyle = '#e9e4d4'; rr(ctx, x + 20, y + 28, 18, 14, 3); ctx.fill();
  ctx.fillStyle = '#4f9a3c'; ctx.fillRect(x + 27, y + 30, 4, 10); ctx.fillRect(x + 24, y + 33, 10, 4);
  ctx.fillStyle = '#2b2e25'; rr(ctx, x + 14, y + 56, 30, 10, 2); ctx.fill();
  ctx.fillStyle = PAL.hazard; for (let i = 0; i < 4; i++) ctx.fillRect(x + 16 + i * 7, y + 64, 4, 2);
  // repair arm
  ctx.strokeStyle = '#3a3f45'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 62, y + 66); ctx.lineTo(x + 66, y + 44); ctx.lineTo(x + 58 + Math.sin(t * 1.5 + b.id) * 4, y + 38); ctx.stroke();
  ctx.fillStyle = '#7fbf4d'; ctx.beginPath(); ctx.arc(x + 58 + Math.sin(t * 1.5 + b.id) * 4, y + 38, 2.5, 0, Math.PI * 2); ctx.fill();
  if (typeof B === 'undefined' || !B) drawQuadDrone(ctx, x + 57, y + 18 + Math.sin(t * 2 + b.id) * 0.6, '#7fbf4d', 3);
};

DRAW.shieldgen = function (ctx, b, t) {
  const S2 = 2 * TILE, x = b.x * TILE, y = b.y * TILE, L = Math.max(1, b.level);
  pad(ctx, x, y, S2, '#3f454d', 3);
  ctx.strokeStyle = 'rgba(110,190,255,0.3)'; ctx.lineWidth = 2; rr(ctx, x + 8, y + 8, S2 - 16, S2 - 16, 8); ctx.stroke();
  // four emitter posts
  for (const [px, py] of [[10, 18], [S2 - 18, 18], [10, S2 - 12], [S2 - 18, S2 - 12]]) {
    box(ctx, x + px, y + py, 8, 8, 14, '#9aa3ab', '#5e666e', 2);
    const g = 0.5 + Math.sin(t * 4 + px + py) * 0.4;
    ctx.fillStyle = `rgba(140,210,255,${g})`; ctx.beginPath(); ctx.arc(x + px + 4, y + py - 12, 2.2, 0, Math.PI * 2); ctx.fill();
  }
  // central core
  box(ctx, x + 24, y + 48, 32, 22, 12, '#5a6068', '#3a4048', 5);
  const cx = x + S2 / 2, cy = y + 26 + Math.sin(t * 2 + b.id) * 2;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(glowSprite('#6ec0ff'), cx - 22, cy - 22, 44, 44);
  ctx.restore();
  const sh = typeof B !== 'undefined' && B && b._shMax ? b._sh / b._shMax : 1;
  ctx.fillStyle = sh > 0 ? '#bfe6ff' : '#3a4d5c'; ctx.beginPath(); ctx.arc(cx, cy, 7 + Math.min(3, L * 0.25), 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(160,220,255,0.75)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.ellipse(cx, cy, 15, 5, t * (i ? -1.2 : 1.5) + i, 0, Math.PI * 2); ctx.stroke(); }
};

DRAW.silo = function (ctx, b, t) {
  const S2 = 2 * TILE, x = b.x * TILE, y = b.y * TILE;
  pad(ctx, x, y, S2, '#5c5f58', 3);
  const cx = x + 46, cy = y + 44, R = 24;
  // hazard ring
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R + 6, 0, Math.PI * 2); ctx.arc(cx, cy, R, 0, Math.PI * 2, true); ctx.clip();
  for (let i = 0; i < 24; i++) { ctx.fillStyle = i % 2 ? PAL.hazard : PAL.black; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R + 7, i * Math.PI / 12, (i + 1) * Math.PI / 12); ctx.fill(); }
  ctx.restore();
  const open = typeof B !== 'undefined' && B && typeof siloReady === 'function' && siloReady();
  if (open) {
    ctx.fillStyle = '#121310'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e4e0d0'; ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c8402a'; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 + Math.sin(t * 6) * 0.3; ctx.drawImage(glowSprite('#ff5a3c'), cx - 26, cy - 26, 52, 52); ctx.restore();
  } else {
    for (const s of [-1, 1]) {
      ctx.fillStyle = s < 0 ? '#7d8389' : '#6f757b';
      ctx.beginPath(); ctx.arc(cx, cy, R, s < 0 ? Math.PI / 2 : -Math.PI / 2, s < 0 ? Math.PI * 1.5 : Math.PI / 2); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = '#2b2e25'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.arc(cx - 8, cy - 8, 8, 0, Math.PI * 2); ctx.fill();
  }
  // control bunker and antenna
  box(ctx, x + 4, y + 22, 16, 14, 10, '#7d7a63', '#545240', 3);
  ctx.strokeStyle = '#3c4148'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 66, y + 70); ctx.lineTo(x + 66, y + 32); ctx.stroke();
  ctx.fillStyle = Math.sin(t * 5 + b.id) > 0 ? '#ff5a3c' : '#5a2a20'; ctx.beginPath(); ctx.arc(x + 66, y + 31, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PAL.hazard; ctx.font = 'bold 7px "Chakra Petch", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('DANGER', x + 12, y + 30);
};

// Stat chips for the new buildings in the selection panel.
function stormChips(b, L, nextL) {
  const chip = (label, v, nv) => `<span class="chip"><b>${label}</b>${v}${nv != null && nv !== v ? `<i>&rarr; ${nv}</i>` : ''}</span>`;
  if (b.type === 'repairbay') return chip('REPAIR', repairRate(L) + '/s', nextL && repairRate(nextL) + '/s') + chip('DRONES', DEFS.repairbay.drones) + chip('REACH', DEFS.repairbay.healRange + ' tiles');
  if (b.type === 'shieldgen') return chip('SHIELD', fmt(shieldHp(L)), nextL && fmt(shieldHp(nextL))) + chip('DOME', DEFS.shieldgen.shieldRange + ' tiles') + chip('RECHARGE', DEFS.shieldgen.recharge + 's');
  if (b.type === 'silo') return chip('WARHEAD', fmt(nukeDamage(L)), nextL && fmt(nukeDamage(nextL))) + chip('FUELING', siloCharge(L) + 's', nextL && siloCharge(nextL) + 's') + chip('BLAST', DEFS.silo.radius + ' tiles');
  return '';
}

/* ================= Photo mode ================= */
const PHOTO = { on: false, filter: 'none', tod: 'auto', weather: 'auto', inBattle: false };
const PHOTO_TODS = [['auto', 'Live'], ['day', 'Day'], ['dusk', 'Dusk'], ['night', 'Night']];
const PHOTO_WEATHER = [['auto', 'Live'], ['clear', 'Clear'], ['rain', 'Rain'], ['fog', 'Fog'], ['snow', 'Snow']];

function startPhotoMode() {
  if (PHOTO.on) return;
  if (typeof COVER !== 'undefined' && COVER) stopCoverage();
  PHOTO.on = true; PHOTO.inBattle = !!B;
  if (B) B.paused = true;
  if (placing) cancelPlace();
  select(null); closeShop(); closeModal();
  document.body.classList.add('photo');
  renderPhotoUI();
  toast('Photo mode: drag to frame, pinch to zoom', 'info');
}
function exitPhotoMode() {
  if (!PHOTO.on) return;
  PHOTO.on = false;
  document.body.classList.remove('photo');
  canvas.style.filter = '';
  $('#photo-ui').hidden = true;
  if (B && PHOTO.inBattle) openPause();
}
function photoFilterCss() { return (PHOTO_FILTERS.find(f => f.id === PHOTO.filter) || PHOTO_FILTERS[0]).css; }
function renderPhotoUI() {
  const el = $('#photo-ui');
  const lab = (list, v) => (list.find(x => x[0] === v) || list[0])[1];
  el.innerHTML = `
    <button class="ph-btn" data-ph="filter"><span>Filter</span><b>${(PHOTO_FILTERS.find(f => f.id === PHOTO.filter) || PHOTO_FILTERS[0]).name}</b></button>
    <button class="ph-btn" data-ph="tod"><span>Time</span><b>${lab(PHOTO_TODS, PHOTO.tod)}</b></button>
    <button class="ph-btn" data-ph="weather"><span>Weather</span><b>${lab(PHOTO_WEATHER, PHOTO.weather)}</b></button>
    <button class="ph-shutter" data-ph="shot" aria-label="Take photo"><i></i></button>
    <button class="ph-btn" data-ph="exit"><span>Done</span><b>Exit</b></button>`;
  el.hidden = false;
  canvas.style.filter = photoFilterCss();
}
function cycle(list, v, key) { const i = list.findIndex(x => (key ? x[key] : x[0]) === v); const n = list[(i + 1) % list.length]; return key ? n[key] : n[0]; }
function onPhotoClick(e) {
  const btn = e.target.closest('[data-ph]');
  if (!btn) return;
  const k = btn.dataset.ph;
  Sound.play('click');
  if (k === 'filter') PHOTO.filter = cycle(PHOTO_FILTERS, PHOTO.filter, 'id');
  else if (k === 'tod') PHOTO.tod = cycle(PHOTO_TODS, PHOTO.tod);
  else if (k === 'weather') { PHOTO.weather = cycle(PHOTO_WEATHER, PHOTO.weather); GFX.snow.length = 0; }
  else if (k === 'shot') { takePhoto(); return; }
  else if (k === 'exit') { exitPhotoMode(); return; }
  renderPhotoUI();
}
function takePhoto() {
  const out = document.createElement('canvas');
  out.width = canvas.width; out.height = canvas.height;
  const g = out.getContext('2d');
  const css = photoFilterCss();
  if (css && 'filter' in g) g.filter = css;
  g.drawImage(canvas, 0, 0);
  g.filter = 'none';
  // small watermark
  const k = out.width / 900;
  g.font = `${Math.round(18 * k)}px "Black Ops One", Impact, sans-serif`;
  g.textAlign = 'right'; g.textBaseline = 'bottom';
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillText(`WARBREACH · ${S.name.toUpperCase()}`, out.width - 14 * k + 2, out.height - 12 * k + 2);
  g.fillStyle = 'rgba(242,182,50,0.9)'; g.fillText(`WARBREACH · ${S.name.toUpperCase()}`, out.width - 14 * k, out.height - 12 * k);
  // shutter flash
  const fl = document.createElement('div'); fl.className = 'shutter-flash'; document.getElementById('app').appendChild(fl); setTimeout(() => fl.remove(), 450);
  Sound.play('click'); buzz(15);
  S.stats.photos = (S.stats.photos || 0) + 1;
  const url = out.toDataURL('image/png');
  setTimeout(() => showPhoto(url, out), 350);
}
function showPhoto(url, cv) {
  openModal(`
    <div class="settings photo-preview">
      <div class="m-head"><h2>Photo saved to preview</h2></div>
      <img src="${url}" alt="Screenshot of your base">
      <p class="lead">Press and hold the picture to save or share it, or use the buttons below.</p>
      <div class="settings-row">
        <a class="btn" href="${url}" download="warbreach-${Date.now()}.png">Download</a>
        <button class="btn ghost" id="btn-photo-share">Share</button>
        <button class="btn ghost" data-close>Keep shooting</button>
      </div>
    </div>`);
  $('#btn-photo-share').addEventListener('click', () => {
    cv.toBlob(async blob => {
      try {
        const file = new File([blob], 'warbreach.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: 'WarBreach' });
        else toast('Sharing is not available here. Press and hold the picture instead', 'info');
      } catch (e) { /* cancelled */ }
    });
  });
}

/* ================= Coverage view ================= */
let COVER = null;
function startCoverage() {
  if (B) return;
  if (placing) cancelPlace();
  select(null); closeShop(); closeModal();
  COVER = { mode: 'ground', key: '', grid: null };
  document.body.classList.add('coverage');
  renderCoverBar();
}
function stopCoverage() {
  COVER = null;
  document.body.classList.remove('coverage');
  $('#cover-bar').hidden = true;
}
function coverageGrid() {
  const key = COVER.mode + '|' + S.buildings.map(b => `${b.id}:${b.x},${b.y},${b.level},${b.spec || ''}`).join('|');
  if (COVER.key === key) return COVER.grid;
  const grid = new Uint8Array(MAP_W * MAP_H);
  for (const b of S.buildings) {
    const w = weaponOf(b);
    if (!w || isPassive(b.type)) continue;
    const air = w.targets === 'air' || w.targets === 'both';
    if (COVER.mode === 'air' ? !air : w.targets === 'air') continue;
    const c = centerOf(b), r = w.range * TILE, mr = (w.minRange || 0) * TILE;
    const x0 = Math.max(0, Math.floor((c.x - r) / TILE)), x1 = Math.min(MAP_W - 1, Math.floor((c.x + r) / TILE));
    const y0 = Math.max(0, Math.floor((c.y - r) / TILE)), y1 = Math.min(MAP_H - 1, Math.floor((c.y + r) / TILE));
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const d = Math.hypot((tx + 0.5) * TILE - c.x, (ty + 0.5) * TILE - c.y);
      if (d <= r && d >= mr) grid[ty * MAP_W + tx] = Math.min(255, grid[ty * MAP_W + tx] + 1);
    }
  }
  let inside = 0, covered = 0;
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) if (inBuildArea(tx, ty)) { inside++; if (grid[ty * MAP_W + tx]) covered++; }
  COVER.key = key; COVER.grid = grid; COVER.pct = inside ? Math.round(covered / inside * 100) : 0;
  renderCoverBar();
  return grid;
}
const COVER_COLS = ['rgba(200,64,42,0.42)', 'rgba(240,130,50,0.36)', 'rgba(242,182,50,0.34)', 'rgba(150,200,80,0.34)', 'rgba(90,200,120,0.42)'];
function drawCoverage(ctx) {
  if (!COVER || B) return;
  const grid = coverageGrid();
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    const n = grid[ty * MAP_W + tx], inside = inBuildArea(tx, ty);
    if (!n && !inside) continue;
    ctx.fillStyle = COVER_COLS[Math.min(4, n)];
    if (!inside) ctx.globalAlpha = 0.55;
    ctx.fillRect(tx * TILE + 1, ty * TILE + 1, TILE - 2, TILE - 2);
    ctx.globalAlpha = 1;
  }
}
function renderCoverBar() {
  const el = $('#cover-bar');
  if (!COVER) { el.hidden = true; return; }
  el.innerHTML = `
    <div class="cv-modes"><button class="tab ${COVER.mode === 'ground' ? 'on' : ''}" data-cv="ground">Ground</button><button class="tab ${COVER.mode === 'air' ? 'on' : ''}" data-cv="air">Air</button></div>
    <div class="cv-legend">${['None', '1', '2', '3', '4+'].map((l, i) => `<span><i style="background:${COVER_COLS[i].replace(/[\d.]+\)$/, '0.9)')}"></i>${l}</span>`).join('')}</div>
    <span class="cv-pct">${COVER.pct != null ? `${COVER.pct}% of your base covered` : ''}</span>
    <button class="btn" data-cv="done">Done</button>`;
  el.hidden = false;
}
function onCoverClick(e) {
  const b = e.target.closest('[data-cv]');
  if (!b || !COVER) return;
  Sound.play('click');
  if (b.dataset.cv === 'done') { stopCoverage(); return; }
  COVER.mode = b.dataset.cv; COVER.key = '';
  renderCoverBar();
}

/* ================= Build queue ================= */
const QUEUE_MAX = 3;
function queueIndex(b) { return (S.queue || []).findIndex(q => q.id === b.id); }
function canQueue(b, up) {
  if (b.job || up.ok || up.max || queueIndex(b) >= 0 || (S.queue || []).length >= QUEUE_MAX) return false;
  const cap = storageCap();
  if (up.cost && (up.cost.gold > cap || up.cost.steel > cap || (up.cost.oil || 0) > cap)) return false; // could never be paid
  return up.reason === 'All builders are busy' || up.reason === 'Not enough resources';
}
function queueUpgrade(b) {
  if (!S.queue) S.queue = [];
  if (S.queue.length >= QUEUE_MAX) { toast(`The queue holds ${QUEUE_MAX} upgrades`, 'bad'); return; }
  S.queue.push({ id: b.id });
  Sound.play('build'); toast(`${displayName(b.type, Math.max(1, b.level))} queued. It starts when a builder and resources are free`, 'good');
  save();
}
function unqueue(b) { S.queue = (S.queue || []).filter(q => q.id !== b.id); Sound.play('click'); save(); }
let queueTick = 0;
function processQueue(dt) {
  if (B || !S.queue || !S.queue.length || (queueTick -= dt) > 0) return;
  queueTick = 1;
  for (const q of S.queue.slice()) {
    const b = byId(q.id);
    if (!b || b.level >= DEFS[b.type].max || b.level + 1 > levelCap(b.type, hqLevel())) { S.queue = S.queue.filter(x => x !== q); continue; }
    if (b.job) continue;
    const st = upgradeStatus(b);
    if (st.ok) {
      S.queue = S.queue.filter(x => x !== q);
      upgrade(b);
      toast(`Queued upgrade started: ${displayName(b.type, Math.max(1, b.level))}`, 'info');
      return;
    }
  }
}
function queueHTML() {
  const q = S.queue || [];
  if (!q.length) return `<p class="lead">Build queue: empty. When every builder is busy, tap Queue on a building to line up its next upgrade (up to ${QUEUE_MAX}).</p>`;
  return `<h3 class="report-h">Build queue</h3><ul class="units report">${q.map((x, i) => { const b = byId(x.id); if (!b) return ''; const st = upgradeStatus(b); return `<li><span>${i + 1}. ${displayName(b.type, Math.max(1, b.level))} &rarr; level ${b.level + 1}</span><b>${st.ok ? 'Starting' : st.reason === 'Not enough resources' ? 'Waiting for resources' : 'Waiting for a builder'}</b></li>`; }).join('')}</ul>`;
}
function drawQueueBadges(ctx) {
  if (B || !S.queue || !S.queue.length) return;
  S.queue.forEach((q, i) => {
    const b = byId(q.id);
    if (!b || b.job) return;
    const n = DEFS[b.type].size * TILE, x = b.x * TILE + n - 8, y = b.y * TILE + 8;
    ctx.fillStyle = 'rgba(16,18,12,0.85)'; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#f2b632'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#f2b632'; ctx.font = 'bold 9px "Chakra Petch", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Q' + (i + 1), x, y + 0.5);
  });
}

/* ================= Cargo drones: automatic collection ================= */
const CARGO_HQ = 4;
const CARGO = { t: 25, drones: [] };
function quietCollect(b) {
  const kind = DEFS[b.type].produces;
  const amt = Math.floor(Math.min(b.stored, storageCap() - S[kind]));
  if (amt <= 0) return 0;
  S[kind] += amt; b.stored -= amt;
  if (kind === 'gold') { S.stats.collectedGold += amt; orderEvent('collect', amt); }
  const c = centerOf(b);
  floaters.push({ x: c.x, y: c.y - 40, text: `+${fmt(amt)}`, color: kind === 'gold' ? '#f5c542' : kind === 'oil' ? '#9aa3b5' : '#c4d3e0', life: 1.1, max: 1.1, size: 15 });
  pulseRes(kind);
  return amt;
}
function updateCargo(dt) {
  const on = !B && S.settings.autocollect !== false && hqLevel() >= CARGO_HQ;
  const h = hq();
  if (!h) return;
  const home = centerOf(h);
  if (on) {
    CARGO.t -= dt;
    if (CARGO.t <= 0 && !CARGO.drones.length) {
      CARGO.t = 60;
      const list = S.buildings.filter(b => DEFS[b.type].produces && b.level >= 1 && !b.job && b.stored >= statsFor(b.type, b.level).hold * 0.3 && storageCap() - S[DEFS[b.type].produces] > 1)
        .sort((a, b) => b.stored / statsFor(b.type, b.level).hold - a.stored / statsFor(a.type, a.level).hold).slice(0, 4);
      if (list.length) CARGO.drones.push({ x: home.x, y: home.y - 40, path: list.map(b => b.id), load: 0 });
    }
  }
  for (const d of CARGO.drones) {
    const b = d.path.length ? byId(d.path[0]) : null;
    let gx, gy;
    if (b) { const c = centerOf(b); gx = c.x; gy = c.y - 44; } else { gx = home.x; gy = home.y - 40; }
    const dx = gx - d.x, dy = gy - d.y, dist = Math.hypot(dx, dy), step = 170 * dt;
    if (dist <= step) {
      d.x = gx; d.y = gy;
      if (b) { if (on) d.load += quietCollect(b); d.path.shift(); }
      else d.done = true;
    } else { d.x += dx / dist * step; d.y += dy / dist * step; }
  }
  CARGO.drones = CARGO.drones.filter(d => !d.done);
}
function drawCargo(ctx) {
  for (const d of CARGO.drones) {
    if (d.load > 0) { box(ctx, d.x - 5, d.y + 6, 10, 6, 5, '#8a7a3c', '#5e5228', 1); }
    drawQuadDrone(ctx, d.x, d.y, '#f2b632', 26);
  }
}

/* ================= Living base: patrols, a jeep and passing helicopters ================= */
const LIFE = { patrol: null, jeep: null, heli: null, heliT: 18 };
function lifeOn() { return !B && S.settings.life !== false && gfxQuality() !== 'low' && !!GFX.geo; }
function perimeterAt(s) {
  const g = GFX.geo, o = 20;
  const x0 = g.fx0 - o, y0 = g.fy0 - o, x1 = g.fx1 + o, y1 = g.fy1 + o;
  const w = x1 - x0, h = y1 - y0, P = 2 * (w + h);
  let d = ((s % 1) + 1) % 1 * P;
  if (d < w) return { x: x0 + d, y: y0, a: 0 }; d -= w;
  if (d < h) return { x: x1, y: y0 + d, a: Math.PI / 2 }; d -= h;
  if (d < w) return { x: x1 - d, y: y1, a: Math.PI }; d -= w;
  return { x: x0, y: y1 - d, a: -Math.PI / 2 };
}
function updateLife(dt) {
  if (!lifeOn()) return;
  if (!LIFE.patrol) LIFE.patrol = [0, 0.012, 0.024, 0.5, 0.512].map((s, i) => ({ s, sp: 0.0045, walk: i }));
  for (const p of LIFE.patrol) { p.s += p.sp * dt; p.walk += dt * 9; }
  // a jeep shuttles along one of the access roads
  if (!LIFE.jeep && GFX.roads) LIFE.jeep = { road: 0, t: 0, dir: 1, wait: 0 };
  const j = LIFE.jeep;
  if (j) {
    if (j.wait > 0) j.wait -= dt;
    else {
      j.t += j.dir * dt * 0.07;
      if (j.t >= 1) { j.t = 1; j.dir = -1; j.wait = 4; }
      if (j.t <= 0) { j.t = 0; j.dir = 1; j.wait = 2; j.road = (j.road + 1) % GFX.roads.length; }
    }
  }
  LIFE.heliT -= dt;
  if (!LIFE.heli && LIFE.heliT <= 0) {
    const W = MAP_W * TILE, H = MAP_H * TILE, fromLeft = Math.random() < 0.5;
    LIFE.heli = { x: fromLeft ? -120 : W + 120, y: H * (0.2 + Math.random() * 0.5), vx: fromLeft ? 150 : -150, vy: (Math.random() - 0.5) * 40, walk: 0 };
    LIFE.heliT = 45 + Math.random() * 40;
  }
  if (LIFE.heli) {
    const hl = LIFE.heli; hl.x += hl.vx * dt; hl.y += hl.vy * dt; hl.walk += dt * 4;
    if (hl.x < -200 || hl.x > MAP_W * TILE + 200) LIFE.heli = null;
  }
}
function drawLifeGround(ctx) {
  if (!lifeOn() || !LIFE.patrol) return;
  for (const p of LIFE.patrol) {
    const q = perimeterAt(p.s);
    drawTroopFigure(ctx, { kind: 'rifle', x: q.x, y: q.y, angle: q.a, aim: q.a, walk: p.walk, moving: true, hp: 1, max: 1, flash: 0, hit: 0, drop: 0 });
  }
  const j = LIFE.jeep;
  if (j && GFX.roads) {
    const rd = GFX.roads[j.road], p = bez(rd[0], rd[1], rd[2], rd[3], j.t), p2 = bez(rd[0], rd[1], rd[2], rd[3], Math.min(1, j.t + 0.01));
    const a = Math.atan2(p2.y - p.y, p2.x - p.x) + (j.dir < 0 ? Math.PI : 0);
    drawFriendlyJeep(ctx, p.x, p.y, j.wait > 0 && j.t >= 1 ? a : a);
  }
}
function drawLifeAir(ctx) {
  if (!lifeOn() || !LIFE.heli) return;
  const hl = LIFE.heli;
  drawTroopFigure(ctx, { kind: 'heli', x: hl.x, y: hl.y, angle: Math.atan2(hl.vy, hl.vx), aim: 0, walk: hl.walk, moving: true, hp: 1, max: 1, flash: 0, hit: 0, drop: 0 });
}
function drawFriendlyJeep(ctx, x, y, a) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(3, 4, 15, 10, a, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(a);
  for (const [wx, wy] of [[-8, -8], [7, -8], [-8, 8], [7, 8]]) wheel(ctx, wx, wy, 7, 4);
  hullBox(ctx, 24, 15, '#55703a', false);
  ctx.fillStyle = 'rgba(160,200,220,0.55)'; ctx.fillRect(4, -5.5, 3, 11);
  ctx.fillStyle = '#3f5229'; ctx.fillRect(-10, -5.5, 10, 11);
  ctx.fillStyle = '#e9e4d4'; ctx.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 1.2 : 2.8, an = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(-5 + Math.cos(an) * r, Math.sin(an) * r); } ctx.fill();
  ctx.fillStyle = '#ffe9a8'; ctx.fillRect(11, -6, 1.5, 3); ctx.fillRect(11, 3, 1.5, 3);
  ctx.restore();
}

/* ================= Smooth zoom (double-tap) ================= */
let zoomAnim = null;
let lastEmptyTap = null;
function emptyTap(sx, sy) {
  if (S.settings.dbltap === false) return;
  const now = performance.now();
  if (lastEmptyTap && now - lastEmptyTap.t < 320 && Math.hypot(sx - lastEmptyTap.x, sy - lastEmptyTap.y) < 30) {
    lastEmptyTap = null;
    const anchor = screenToWorld(sx, sy);
    const target = cam.z < defaultZoom() * 1.3 ? Math.min(maxZoom(), defaultZoom() * 1.8) : defaultZoom();
    zoomAnim = { z0: cam.z, z1: target, ax: anchor.x, ay: anchor.y, sx, sy, t: 0 };
    return;
  }
  lastEmptyTap = { t: now, x: sx, y: sy };
}
function updateZoomAnim(dt) {
  if (!zoomAnim) return;
  const z = zoomAnim;
  z.t = Math.min(1, z.t + dt / 0.25);
  const k = 1 - Math.pow(1 - z.t, 3);
  cam.z = clamp(z.z0 + (z.z1 - z.z0) * k, minZoom(), maxZoom());
  cam.x = z.ax - (z.sx - vw / 2) / cam.z; cam.y = z.ay - (z.sy - vh / 2) / cam.z;
  clampCam();
  if (z.t >= 1) zoomAnim = null;
}

/* ================= Per-frame base hooks ================= */
function stormUpdate(dt) {
  processQueue(dt);
  updateCargo(dt);
  updateLife(dt);
  updateZoomAnim(dt);
}

/* ================= What's new in 3.0 ================= */
const WHATS_NEW_3 = [
  ['Settings menu', 'Graphics, audio, gameplay, controls, accessibility and data in one place'],
  ['Pause menu', 'Pause any battle, change settings or take a photo'],
  ['Minimap', 'See the whole battlefield and tap to jump there'],
  ['Focus fire', 'Tap an enemy: your defenses and hero gang up on it'],
  ['Illumination Flare', 'New ability: light up the night and reveal stealth units'],
  ['Missile Silo', 'Charge and launch a strategic missile (Command Center 9)'],
  ['Repair Bay', 'Drones patch up your buildings mid-battle (Command Center 5)'],
  ['Shield Generator', 'An energy dome soaks up damage (Command Center 8)'],
  ['Riot Troopers', 'Ballistic shields shrug off bullets'],
  ['Hovercraft', 'Enemy boats come up the river and land behind your lines'],
  ['Kamikaze Drones', 'Fast suicide drones dive into your buildings'],
  ['EMP Troopers', 'Knock your defenses offline for a few seconds'],
  ['Assault Mechs', 'Armored walkers from wave 16'],
  ['Paratroopers', 'Transport planes drop soldiers inside your base'],
  ['Titan Mech', 'A new boss on every tenth wave'],
  ['Field Officers', 'Boost the troops around them. Big bounty'],
  ['Supply drops', 'Crates parachute into battle. Tap them for loot'],
  ['Doctrines', 'Pick a battle philosophy (Command Center 6)'],
  ['War Games', 'Stack optional modifiers for extra loot'],
  ['Hall of Fame', 'Your ten best runs and personal records'],
  ['After-action report', 'MVP defense, damage chart and kills by enemy type'],
  ['Photo mode', 'Filters, time of day, weather and a shutter button'],
  ['Coverage view', 'See exactly where your defenses reach, ground and air'],
  ['Build queue', 'Line up three upgrades for when builders free up'],
  ['Cargo drones', 'Automatic collection from Command Center 4'],
  ['Living base', 'Patrols, jeeps and passing helicopters'],
  ['Double-tap zoom', 'Plus zoom speed, resolution and frame rate settings'],
];
function maybeShowWhatsNew3() {
  if (S.seenUpdate3 === UPDATE3_VERSION) {
    if (S.seenPatch !== PATCH_VERSION) {
      S.seenPatch = PATCH_VERSION; save();
      if (S.tut >= 99) toast(`Update ${PATCH_VERSION} installed: ${PATCH_NOTES.length} fixes. Menu, then What's new`, 'info');
    }
    return false;
  }
  S.seenPatch = PATCH_VERSION;
  const fresh = S.tut != null && S.tut < 99;
  S.seenUpdate3 = UPDATE3_VERSION; S.seenUpdate2 = UPDATE2_VERSION; S.seenUpdate = UPDATE_VERSION; save();
  if (fresh) return false;
  openWhatsNew3();
  return true;
}
function openWhatsNew3(back) {
  openModal(`
    <div class="settings">
      <div class="m-head"><div><span class="stamp">Update ${PATCH_VERSION}</span><h2>Storm Front</h2></div></div>
      <p class="lead">The menu button (top right) now opens the new <b>Settings</b>, <b>Hall of Fame</b>, <b>Photo mode</b> and <b>Coverage view</b>.</p>
      <h3 class="report-h">Update ${PATCH_VERSION}: fixes</h3>
      <ul class="whats-new">${PATCH_NOTES.map(([a, b]) => `<li><b>${a}</b><span>${b}</span></li>`).join('')}</ul>
      <h3 class="report-h">Update ${UPDATE3_VERSION}: new features</h3>
      <ul class="whats-new">${WHATS_NEW_3.map(([a, b]) => `<li><b>${a}</b><span>${b}</span></li>`).join('')}</ul>
      <div class="settings-row"><button class="btn" data-close>To the front</button></div>
    </div>`, back || null);
}

function initBasecamp() {
  $('#photo-ui').addEventListener('click', onPhotoClick);
  $('#cover-bar').addEventListener('click', onCoverClick);
  $('#shop-coverage').addEventListener('click', () => { Sound.play('click'); startCoverage(); });
}
