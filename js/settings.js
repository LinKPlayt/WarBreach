// WarBreach — the main menu and the tabbed Settings screen (Update 3.0).
'use strict';

const ONOFF = [[true, 'On'], [false, 'Off']];
const SET_TABS = [['graphics', 'Graphics'], ['audio', 'Audio'], ['gameplay', 'Gameplay'], ['controls', 'Controls'], ['access', 'Accessibility'], ['data', 'Data']];
let setTab = 'graphics';

const SETTINGS_SCHEMA = {
  graphics: [
    { k: 'quality', label: 'Graphics quality', desc: 'Ultra adds bloom and film grain. Low saves battery.', opts: [['ultra', 'Ultra'], ['high', 'High'], ['low', 'Low']],
      get: () => gfxQuality(), set: v => { S.settings.lowfx = v === 'low'; S.settings.gfx = v === 'low' ? 'high' : v; S.settings.gfxManual = true; } },
    { k: 'uiSize', label: 'Interface size', desc: 'Compact gives the battlefield more room on phones. Auto uses it on any phone-sized screen.', opts: [['auto', 'Auto'], ['compact', 'Compact'], ['standard', 'Standard']], def: 'auto', after: () => applyUiSize() },
    { k: 'res', label: 'Resolution', desc: 'Lower resolution runs faster and cooler on older phones.', opts: [[1, 'Sharp'], [0.75, 'Balanced'], [0.5, 'Saver']], def: 1, after: () => resize() },
    { k: 'fps', label: 'Frame rate', desc: '30 FPS saves battery.', opts: [[60, '60 FPS'], [30, '30 FPS']], def: 60 },
    { k: 'daycycle', label: 'Day and night', desc: 'Live follows the clock on your phone.', opts: [[true, 'Live'], [false, 'Always day'], ['night', 'Always night']], def: true },
    { k: 'weatherfx', label: 'Weather effects', desc: 'Rain, fog and snow on screen. Weather still affects battles.', opts: ONOFF, def: true },
    { k: 'postfx', label: 'Bloom and color grading', desc: 'Glow around fire and lasers, cinematic colors.', opts: ONOFF, def: true },
    { k: 'life', label: 'Living base', desc: 'Patrols, jeeps and helicopters around your base.', opts: ONOFF, def: true },
    { k: 'shake', label: 'Screen shake', opts: ONOFF, def: true },
    { k: 'dmgnums', label: 'Damage numbers', opts: ONOFF, def: true },
    { k: 'hpbars', label: 'Enemy health bars', opts: [['always', 'Always'], ['damaged', 'When hurt'], ['off', 'Off']], def: 'damaged' },
    { k: 'fpsmeter', label: 'Show FPS counter', opts: ONOFF, def: false, after: () => applyStormSettings() },
    { k: 'theme', label: 'Map theme', desc: 'New themes unlock with Command Center levels.', opts: Object.keys(THEMES).map(id => [id, THEMES[id].name]),
      get: () => S.theme, set: v => { if (hqLevel() < THEMES[v].need) { toast(`Unlocks at Command Center ${THEMES[v].need}`, 'bad'); return false; } setTheme(v); },
      lock: v => hqLevel() < THEMES[v].need ? `HQ ${THEMES[v].need}` : '' },
  ],
  audio: [
    { k: 'sound', label: 'Sound', opts: ONOFF, def: true, after: () => { applySettings(); if (S.settings.sound) Sound.unlock(); } },
    { k: 'music', label: 'Music volume', slider: true, def: 0.5, after: () => applySettings() },
    { k: 'sfx', label: 'Effects volume', slider: true, def: 1, after: () => { applySettings(); Sound.play('click'); } },
    { k: 'haptics', label: 'Vibration', opts: ONOFF, def: true, after: () => { applySettings(); buzz(30); } },
    { k: 'bgmute', label: 'Mute in background', desc: 'Silence the game when you switch to another app.', opts: ONOFF, def: true },
  ],
  gameplay: [
    { k: 'speed', label: 'Starting battle speed', opts: [[1, 'x1'], [2, 'x2'], [3, 'x3']], def: 1 },
    { k: 'minimap', label: 'Battle minimap', desc: 'Tap or drag on it to move the camera.', opts: ONOFF, def: true },
    { k: 'focusTap', label: 'Tap enemies to focus fire', desc: 'Your defenses and hero gang up on the enemy you tap.', opts: ONOFF, def: true },
    { k: 'nextwave', label: 'Next-wave preview', opts: ONOFF, def: true },
    { k: 'autopause', label: 'Pause when you leave', desc: 'Battles pause when you switch apps.', opts: ONOFF, def: true },
    { k: 'autocollect', label: 'Cargo drones', desc: `From Command Center ${CARGO_HQ}, drones collect from your mines on their own.`, opts: ONOFF, def: true },
  ],
  controls: [
    { k: 'zoomspeed', label: 'Zoom speed', opts: [[0.6, 'Slow'], [1, 'Normal'], [1.5, 'Fast']], def: 1 },
    { k: 'glide', label: 'Camera glide', desc: 'The view keeps moving a little after a flick.', opts: ONOFF, def: true },
    { k: 'dbltap', label: 'Double-tap to zoom', desc: 'Double-tap empty ground to zoom in or back out.', opts: ONOFF, def: true },
    { action: 'fullscreen', label: 'Fullscreen', desc: 'Hide the browser bars.', btn: 'Toggle' },
    { action: 'recenter', label: 'Recenter view', desc: 'Jump back to your Command Center.', btn: 'Recenter' },
  ],
  access: [
    { k: 'colorblind', label: 'Colorblind mode', desc: 'Enemies turn purple so they stand apart from green.', opts: ONOFF, def: false, after: () => applySettings() },
    { k: 'bigtext', label: 'Large text', opts: ONOFF, def: false, after: () => applySettings() },
    { k: 'lefty', label: 'Left-handed layout', desc: 'Swaps the Build and Battle sides.', opts: ONOFF, def: false, after: () => applySettings() },
    { k: 'reducemotion', label: 'Reduce motion', desc: 'No screen shake, camera glide, flashes or animated banners.', opts: ONOFF, def: false, after: () => applySettings() },
    { k: 'contrast', label: 'High-contrast HUD', desc: 'Solid panels and brighter text.', opts: ONOFF, def: false, after: () => applySettings() },
  ],
};

function settingValue(it) {
  if (it.get) return it.get();
  const v = S.settings[it.k];
  return v === undefined ? it.def : v;
}

function openSettings(back, tab) {
  if (tab) setTab = tab;
  openModal(`
    <div class="settings set-wrap">
      <div class="m-head set-head"><h2>Settings</h2><div class="tabs set-tabs">${SET_TABS.map(([id, name]) => `<button class="tab ${id === setTab ? 'on' : ''}" data-st="${id}">${name}</button>`).join('')}</div></div>
      <div class="set-body" id="set-body"></div>
      <div class="settings-row set-foot"><span class="set-ver">WarBreach ${UPDATE55_VERSION} · Legends</span><button class="btn" data-close>Done</button></div>
    </div>`, back || null);
  const body = $('#modal-body');
  body.querySelectorAll('[data-st]').forEach(t => t.addEventListener('click', () => {
    setTab = t.dataset.st; Sound.play('click');
    body.querySelectorAll('[data-st]').forEach(x => x.classList.toggle('on', x === t));
    renderSettingsTab(back);
  }));
  renderSettingsTab(back);
}

function renderSettingsTab(back) {
  const el = $('#set-body');
  if (!el) return;
  if (setTab === 'data') { renderDataTab(el, back); return; }
  const items = SETTINGS_SCHEMA[setTab];
  el.innerHTML = items.map((it, i) => {
    const head = `<div class="set-label"><b>${it.label}</b>${it.desc ? `<span>${it.desc}</span>` : ''}</div>`;
    if (it.action) return `<div class="set-row">${head}<button class="btn ghost" data-sa="${it.action}">${it.btn}</button></div>`;
    if (it.slider) { const v = settingValue(it); return `<div class="set-row">${head}<div class="set-slider"><input type="range" min="0" max="1" step="0.05" value="${v}" data-si="${i}"><span>${Math.round(v * 100)}%</span></div></div>`; }
    const cur = settingValue(it);
    return `<div class="set-row">${head}<div class="seg">${it.opts.map(([v, name], j) => { const lock = it.lock ? it.lock(v) : ''; return `<button class="seg-b ${v === cur ? 'on' : ''} ${lock ? 'locked' : ''}" data-si="${i}" data-sj="${j}">${name}${lock ? `<small>${lock}</small>` : ''}</button>`; }).join('')}</div></div>`;
  }).join('');
  el.querySelectorAll('.seg-b').forEach(b => b.addEventListener('click', () => {
    const it = items[+b.dataset.si], v = it.opts[+b.dataset.sj][0];
    let ok = true;
    if (it.set) ok = it.set(v) !== false; else S.settings[it.k] = v;
    if (!ok) { Sound.play('error'); return; }
    save(); Sound.play('click');
    if (it.after) it.after();
    b.parentElement.querySelectorAll('.seg-b').forEach(x => x.classList.toggle('on', x === b));
  }));
  el.querySelectorAll('input[type=range]').forEach(r => r.addEventListener('input', () => {
    const it = items[+r.dataset.si];
    S.settings[it.k] = +r.value; save();
    r.nextElementSibling.textContent = Math.round(+r.value * 100) + '%';
    if (it.after) it.after();
  }));
  el.querySelectorAll('[data-sa]').forEach(b => b.addEventListener('click', () => {
    Sound.play('click');
    if (b.dataset.sa === 'fullscreen') toggleFullscreen();
    else if (b.dataset.sa === 'recenter') { recenter(); toast('View recentered', 'info'); }
  }));
}

function renderDataTab(el, back) {
  let bytes = 0;
  try { bytes = (localStorage.getItem(SAVE_KEY) || '').length; } catch (e) { /* storage blocked */ }
  el.innerHTML = `
    <div class="set-row"><div class="set-label"><b>Backup and restore</b><span>Copy a save code to move your base to another device.</span></div><button class="btn ghost" data-sd="backup">Open</button></div>
    <div class="set-row"><div class="set-label"><b>Save file</b><span>Saved automatically on this device · ${(bytes / 1024).toFixed(1)} KB</span></div><button class="btn ghost" data-sd="save">Save now</button></div>
    <div class="set-row"><div class="set-label"><b>Tutorial</b><span>Show the first-time hints again.</span></div><button class="btn ghost" data-sd="tut">Replay</button></div>
    <div class="set-row"><div class="set-label"><b>What's new</b><span>Fixes in ${PATCH_VERSION} and everything from ${UPDATE3_VERSION}.</span></div><button class="btn ghost" data-sd="news">Show</button></div>
    <div class="set-row danger-row"><div class="set-label"><b>Reset base</b><span>Erases everything and starts over. This cannot be undone.</span></div><button class="btn danger-outline" data-sd="reset">Reset</button></div>`;
  el.querySelectorAll('[data-sd]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.sd;
    Sound.play('click');
    if (k === 'backup') { openBackup(); modalOnClose = () => openSettings(back, 'data'); }
    else if (k === 'save') { save(); toast('Game saved', 'good'); renderDataTab(el, back); }
    else if (k === 'tut') { if (B) { toast('Finish the battle first', 'bad'); return; } S.tut = 0; save(); toast('Tutorial hints are back', 'info'); }
    else if (k === 'news') { openWhatsNew5(() => openSettings(back, 'data')); }
    else if (k === 'reset') {
      if (B) { toast('Finish the battle first', 'bad'); return; }
      if (b.dataset.armed) {
        S = newBase(); applySettings(); rebuildGrid(); select(null); save(); recenter(); modalOnClose = null; closeModal();
        ground = buildGroundCanvas(1.5, S.theme);
        toast('New base established', 'good');
      } else { b.dataset.armed = '1'; b.textContent = 'Tap again to erase'; }
    }
  }));
}

/* ---------------- Main menu ---------------- */
function openMenu() {
  if (B) { openPause(); return; }
  const tiles = [
    { id: 'settings', name: 'Settings', sub: 'Graphics, audio, controls', fn: () => openSettings(openMenu) },
    { id: 'manual', name: 'Field manual', sub: 'How to play', fn: openManual },
    { id: 'hof', name: 'Hall of Fame', sub: (S.hof || []).length ? `Best run: wave ${S.hof[0].wave}` : 'Your best runs', fn: () => openHallOfFame(openMenu) },
    { id: 'photo', name: 'Photo mode', sub: 'Filters, time and weather', fn: startPhotoMode },
    { id: 'coverage', name: 'Coverage view', sub: 'Where your guns reach', fn: startCoverage },
    { id: 'gauntlet', name: 'The Gauntlet', sub: S.gauntlet && S.gauntlet.active ? `Run in progress · stage ${S.gauntlet.stage + 1}` : `Best: ${S.gauntletBest || 0}/${GAUNTLET.stages}`, fn: () => openGauntlet(openMenu) },
    { id: 'challenges', name: 'Challenge Editor', sub: `${(S.challenges || []).length} saved`, fn: () => openChallenges(openMenu) },
    { id: 'knowledge', name: 'Knowledge', sub: `${knowledgeFree()} point${knowledgeFree() === 1 ? '' : 's'} free`, dot: knowledgeFree() > 0, fn: () => openKnowledge(openMenu) },
    { id: 'album', name: 'Field Album', sub: albumClaimable() ? `${albumClaimable()} page reward${albumClaimable() > 1 ? 's' : ''} ready` : 'Collect them all', dot: albumClaimable() > 0, fn: () => openAlbum(openMenu) },
    { id: 'power', name: 'Base power', sub: `${fmt(basePower())} · ${LEAGUES[leagueOf(basePower())].name} League`, fn: () => openLeagues(openMenu) },
    { id: 'mastery', name: 'Mastery', sub: 'Defense kill bonuses', fn: () => openMastery(openMenu) },
    { id: 'intel', name: 'Intel feed', sub: S.logUnread ? `${S.logUnread} new` : 'Base activity', dot: !!S.logUnread, fn: () => openIntel(openMenu) },
    { id: 'doctrine', name: 'Doctrine', sub: doctrineUnlocked() ? doctrine().name : `Command Center ${DOCTRINE_HQ}`, fn: () => openDoctrines(openMenu) },
    { id: 'record', name: 'Service record', sub: 'Your career in numbers', fn: () => { openRecord(); modalOnClose = openMenu; } },
    { id: 'ach', name: 'Achievements', sub: `${achClaimable()} to claim`, dot: achClaimable() > 0, fn: () => { openAchievements(); modalOnClose = openMenu; } },
    { id: 'wardrobe', name: 'Wardrobe', sub: 'Skins, flags and camo', fn: openWardrobe },
    { id: 'layouts', name: 'Layouts', sub: 'Save and edit your base', fn: openLayouts },
    { id: 'news', name: "What's new", sub: `Update ${UPDATE55_VERSION}`, fn: () => openWhatsNew5(openMenu) },
    { id: 'fs', name: 'Fullscreen', sub: 'Hide the browser bars', fn: () => { closeModal(); toggleFullscreen(); } },
  ];
  openModal(`
    <div class="settings">
      <div class="m-head"><h2>Menu</h2><span class="m-count">${S.name}</span></div>
      <div class="hub-grid">${tiles.map(t => `<button class="hub ${t.dot ? 'has-dot' : ''}" data-mn="${t.id}"><b>${t.name}</b><span>${t.sub}</span></button>`).join('')}</div>
      <div class="settings-row"><button class="btn" data-close>Close</button></div>
    </div>`);
  $('#modal-body').querySelectorAll('[data-mn]').forEach(b => b.addEventListener('click', () => { Sound.play('click'); tiles.find(t => t.id === b.dataset.mn).fn(); }));
}

function openManual() {
  openModal(`
    <div class="settings">
      <h2>Field manual</h2>
      <ul class="manual">
        <li><b>Build</b> opens the shop. Drag the outline into place, then tap the check mark.</li>
        <li><b>Tap a building</b> to upgrade, move or sell it. When every builder is busy, tap <b>Queue</b> to line up the next upgrade.</li>
        <li><b>Drag</b> to look around, <b>pinch</b> or <b>double-tap</b> to zoom.</li>
        <li>Upgrade the <b>Command Center</b>: every level unlocks a new defense and lets your other buildings go one level higher.</li>
        <li>Build a <b>Barracks</b> to train troops. In battle, tap a troop card and then the map to deploy.</li>
        <li>In battle, <b>tap an enemy</b> to focus fire on it, tap a <b>supply crate</b> to open it, and use the <b>pause</b> button for settings and photo mode.</li>
        <li>The <b>Missile Silo</b> charges during battle. Tap Launch when it glows, then tap the target.</li>
        <li>Use the <b>Coverage view</b> in the menu to find gaps in your defenses before the next battle.</li>
        <li>Earn <b>medals</b> from battles, missions and promotions. Spend them to finish construction instantly or to hire more builders.</li>
        <li>Your base saves automatically on this device.</li>
      </ul>
      <div class="settings-row"><button class="btn" data-close>Done</button></div>
    </div>`, openMenu);
}

/* ---------------- Applying settings ---------------- */
let fpsEl = null, fpsN = 0, fpsT = 0;
// Compact HUD for phones: on when chosen, or on Auto whenever the screen's short side is phone-sized.
function uiCompact() {
  const v = (S && S.settings && S.settings.uiSize) || 'auto';
  return v === 'compact' || (v === 'auto' && Math.min(window.innerWidth, window.innerHeight) <= 500);
}
function applyUiSize() { document.body.classList.toggle('compact', uiCompact()); }
function applyStormSettings() {
  const st = S.settings;
  applyUiSize();
  document.body.classList.toggle('reduce-motion', !!st.reducemotion);
  document.body.classList.toggle('contrast', !!st.contrast);
  if (!fpsEl) fpsEl = document.getElementById('fps');
  if (fpsEl) fpsEl.hidden = !st.fpsmeter;
}
function fpsTick(now) {
  if (!fpsEl || fpsEl.hidden) return;
  fpsN++;
  if (now - fpsT >= 500) { fpsEl.textContent = `${Math.round(fpsN * 1000 / (now - fpsT))} FPS`; fpsN = 0; fpsT = now; }
}
function bgAudio(hidden) {
  if (S.settings.bgmute === false) return;
  const ac = Sound.ctx;
  if (!ac) return;
  try { if (hidden) ac.suspend(); else if (S.settings.sound) ac.resume(); } catch (e) { /* ignore */ }
}

function initSettingsUI() {
  document.addEventListener('visibilitychange', () => bgAudio(document.hidden));
  window.addEventListener('resize', applyUiSize);
  applyStormSettings();
}
