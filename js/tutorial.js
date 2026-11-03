// WarBreach — the first-launch intro and the guided tutorial for new commanders.
'use strict';

/* ================= Field advisor ================= */
const ADVISOR = 'Sgt. Vance';
const ADVISOR_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true">
  <circle cx="32" cy="32" r="32" fill="#34421f"/>
  <path d="M8 64c2-13 11-19 24-19s22 6 24 19z" fill="#5b6e3c"/>
  <path d="M22 50l10 6 10-6v-4H22z" fill="#4a5a30"/>
  <path d="M27 44h10v7H27z" fill="#a8744c"/>
  <ellipse cx="32" cy="35" rx="11.5" ry="13" fill="#c48f62"/>
  <path d="M20.5 37c0 6 5 10.5 11.5 10.5S43.5 43 43.5 37c-3 4.5-7 6-11.5 6s-8.5-1.5-11.5-6z" fill="#b07c52"/>
  <path d="M16 32c0-11.5 7-19 16-19s16 7.5 16 19c-4.5-2.2-10-3.3-16-3.3S20.5 29.8 16 32z" fill="#4f6133"/>
  <path d="M14 32.5c5-3.2 11.2-4.6 18-4.6s13 1.4 18 4.6v3.2c-5.2-2.6-11.2-3.8-18-3.8s-12.8 1.2-18 3.8z" fill="#3a4824"/>
  <path d="M22 20c3-3 6.2-4.2 10-4.2" stroke="#6f8448" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M25 35.5h4.5M34.5 35.5H39" stroke="#3a2a1c" stroke-width="2" stroke-linecap="round"/>
  <circle cx="27.4" cy="38.6" r="1.6" fill="#1d1a14"/><circle cx="36.6" cy="38.6" r="1.6" fill="#1d1a14"/>
  <path d="M28.5 44.2q3.5 1.6 7 0" stroke="#7a4b30" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  <path d="M19.6 37v5.5a5 5 0 0 0 5 5h1.6" stroke="#1d1a14" stroke-width="1.7" fill="none" stroke-linecap="round"/>
  <rect x="17.2" y="34" width="4.4" height="7" rx="2" fill="#262b1c"/>
  <path d="M26 56.5l6 3.5 6-3.5M26 60.5l6 3.5 6-3.5" stroke="#f2b632" stroke-width="2" fill="none" stroke-linejoin="round"/>
</svg>`;

/* ================= Intro cinematic ================= */
// Plays once for a new player: a flyover from the west road to the base, captions, the title,
// a short briefing, and naming the outpost. Every part can be skipped.
const INTRO_LINES = [
  'Commander! Good to have you. I\'m Sergeant Vance, your field advisor.',
  'This is the outpost: a Command Center, two mines and a single machine gun. It won\'t stop what\'s coming.',
  'Enemy columns are already on the roads. We build fast, and we hold the line.',
];
let introRun = null;

function playIntro(opts = {}) {
  if (introRun || B) return false;
  const el = $('#intro');
  if (!el) return false;
  closeModal(); if (typeof closeShop === 'function') closeShop(); select(null);
  const quick = !!(S.settings.reducemotion || reduceMotion);
  const h = centerOf(hq());
  const run = introRun = { timers: [], t0: performance.now(), replay: !!opts.replay, line: 0, raf: 0,
    from: { x: 4 * TILE, y: h.y + TILE, z: 1.55 }, to: { x: h.x, y: h.y + 20, z: defaultZoom() }, dur: quick ? 0 : 8200 };
  document.body.classList.add('intro-on');
  el.innerHTML = `
    <div class="in-shade"></div>
    <div class="in-bar in-top"></div><div class="in-bar in-bottom"></div>
    <div class="in-caption" id="in-cap"></div>
    <div class="in-title" id="in-title" hidden><div class="in-logo">WarBreach</div><div class="in-tag">Build. Defend. Hold the line.</div></div>
    <div class="in-brief" id="in-brief" hidden>
      <div class="in-face">${ADVISOR_SVG}</div>
      <div class="in-talk">
        <div class="in-who">${ADVISOR}<span>Field advisor</span></div>
        <p class="in-line" id="in-line"></p>
        <form class="in-name" id="in-name" hidden>
          <label for="in-name-input">Name your outpost</label>
          <div class="in-name-row"><input id="in-name-input" class="text-input" maxlength="20" autocomplete="off" value="${S.name.replace(/"/g, '&quot;')}"><button class="btn" type="submit">Take command</button></div>
        </form>
        <div class="in-next-row" id="in-next-row"><button class="btn" id="in-next" type="button">Next</button></div>
      </div>
    </div>
    <button class="in-skip" id="in-skip" type="button">Skip intro</button>`;
  el.hidden = false;
  el.classList.add('black');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('black')));
  // the camera flyover
  Object.assign(cam, run.from); clampCam();
  const fly = () => {
    if (introRun !== run) return;
    const k = run.dur ? Math.min(1, (performance.now() - run.t0) / run.dur) : 1;
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    cam.x = run.from.x + (run.to.x - run.from.x) * e; cam.y = run.from.y + (run.to.y - run.from.y) * e; cam.z = run.from.z + (run.to.z - run.from.z) * e;
    clampCam();
    if (k < 1) run.raf = requestAnimationFrame(fly);
  };
  run.raf = requestAnimationFrame(fly);
  const at = (ms, fn) => run.timers.push(setTimeout(() => { if (introRun === run) fn(); }, quick ? Math.min(ms, 300) : ms));
  const cap = (text) => { const c = $('#in-cap'); c.classList.remove('show'); void c.offsetWidth; c.textContent = text; c.classList.add('show'); };
  at(500, () => cap('The frontier. 0600 hours.'));
  at(3300, () => cap('Enemy armies are closing in on the last outpost in the valley.'));
  at(6700, () => {
    $('#in-cap').classList.remove('show');
    const t = $('#in-title'); t.hidden = false; t.classList.add('slam');
    Sound.play('bigboom'); buzz([60, 40, 120]);
    for (let i = 0; i < 3; i++) { const x = (2 + Math.random() * 3) * TILE, y = (8 + Math.random() * 10) * TILE; burst(x, y, '#ffb347', 16); }
  });
  at(9900, () => { $('#in-title').classList.add('out'); showBriefing(); });
  $('#in-skip').addEventListener('click', () => { Sound.play('click'); finishIntro(true); });
  $('#in-next').addEventListener('click', () => { Sound.play('click'); nextBriefLine(); });
  $('#in-name').addEventListener('submit', e => { e.preventDefault(); finishIntro(false); });
  return true;
}

function showBriefing() {
  const run = introRun; if (!run || run.briefing) return;
  run.briefing = true;
  $('#in-title').hidden = true;
  const br = $('#in-brief'); br.hidden = false;
  run.line = -1; nextBriefLine();
}
function nextBriefLine() {
  const run = introRun; if (!run) return;
  if (!run.briefing) { showBriefing(); return; }
  run.line++;
  const p = $('#in-line');
  if (run.line < INTRO_LINES.length) {
    p.classList.remove('show'); void p.offsetWidth; p.textContent = INTRO_LINES[run.line]; p.classList.add('show');
    return;
  }
  // last card: name the outpost (a replay just ends here)
  if (run.replay) { finishIntro(false); return; }
  p.textContent = 'One more thing. What do we call this place?';
  $('#in-next-row').hidden = true;
  $('#in-name').hidden = false;
  const input = $('#in-name-input');
  setTimeout(() => { try { input.focus(); input.select(); } catch (e) { /* ignore */ } }, 60);
}

function finishIntro(skipped) {
  const run = introRun; if (!run) return;
  const input = $('#in-name-input');
  if (!run.replay && input && !skipped) {
    const v = input.value.replace(/[<>]/g, '').trim().slice(0, 20);
    if (v) S.name = v;
  }
  for (const t of run.timers) clearTimeout(t);
  cancelAnimationFrame(run.raf);
  introRun = null;
  if (!run.replay) S.introSeen = true;
  save();
  const el = $('#intro');
  el.classList.add('leaving');
  setTimeout(() => { el.hidden = true; el.classList.remove('leaving'); el.innerHTML = ''; }, 450);
  document.body.classList.remove('intro-on');
  recenter();
  if (!run.replay && S.tut < 99) tutGo(0);
}
function introPlaying() { return !!introRun; }

/* ================= Guided tutorial ================= */
// S.tut is the index of the current step (99 when finished or skipped). Each step finishes on a game
// event (`on`), a condition (`check`) or the Next button. Base steps that are overtaken by a battle jump to
// the battle steps; battle steps left unfinished when the battle ends jump to the after-battle steps.
const TUT_STEPS = [
  { id: 'hello', where: 'base', say: () => `Welcome to ${S.name}, Commander. I'll show you the ropes. Skip any time.`, next: 'Let\'s go' },
  { id: 'look', where: 'base', say: 'Drag the map to look around. Pinch, or double-tap, to zoom.', check: () => tutCamMoved(), next: 'Got it', nextAfter: 5 },
  { id: 'collect', where: 'base', say: 'Your Gold Mine has been digging. Tap the gold bubble to collect it.', enter: () => tutSeedMine(), target: () => tutBubbleRect(tutBubble()), focus: () => tutBubble() && bubblePos(tutBubble()), skip: () => !tutBubble(), on: 'collect' },
  { id: 'build', where: 'base', say: 'One gun won\'t hold them. Tap Build.', clear: true, enter: () => tutFund(costFor('mg', 1)), target: '#btn-build', skip: () => !tutCanBuildMg(), on: 'shop' },
  { id: 'pick', where: 'base', say: 'Pick the Machine Gun Nest.', target: () => $('#shop-list .card[data-type="mg"]') || $('#shop-tabs [data-tab="defense"]'), alive: () => !shop.hidden, back: 'build', skip: () => !tutCanBuildMg(), on: 'place' },
  { id: 'place', where: 'base', say: 'Drag it into place near the road, then tap the check mark.', target: '#place-ok', alive: () => !!placing && !placing.moveId, back: 'build', skip: () => !placing && !tutCanBuildMg(), on: 'built' },
  { id: 'hq', where: 'base', say: 'Upgrading the Command Center unlocks new buildings and higher levels. Tap your Command Center.', enter: () => tutFund(upgradeCostOf(hq())), target: () => tutWorldRect(hq()), focus: () => hq(), skip: () => tutHqStarted(), check: () => selectedId === hq().id },
  { id: 'upgrade', where: 'base', say: 'Now tap Upgrade.', target: '#panel [data-act="upgrade"]', alive: () => selectedId === hq().id, back: 'hq', skip: () => tutHqStarted(), on: 'upgrade:hq' },
  { id: 'builders', where: 'base', say: 'Builders work in the background. You have two, so two jobs can run at once.', target: '#builders', next: 'Next' },
  { id: 'battle', where: 'base', say: 'Let\'s see what this outpost can do. Tap Battle.', clear: true, target: '#btn-battle', check: () => tutBriefOpen() },
  { id: 'brief', where: 'base', say: 'The briefing shows what\'s coming and how strong your defenses are. Start the battle!', target: '#btn-deploy', alive: () => tutBriefOpen(), back: 'battle' },
  { id: 'guns', where: 'battle', say: 'Enemies march down the roads toward your Command Center. Your guns fire on their own.', next: 'Next' },
  { id: 'hero', where: 'battle', say: 'This is your hero. Tap the map to send them into the fight.', target: () => tutHeroRect(), focus: () => B && B.hero, skip: () => !B.hero || B.hero.dead, on: 'hero' },
  { id: 'strike', where: 'battle', say: () => (B.ab.airstrike || 0) > 0 ? 'Your Airstrike is warming up. When it\'s ready, tap it, then tap the enemies.' : 'Call an Airstrike: tap the button, then tap the enemies.', target: '#abilities [data-ab="airstrike"]', skip: () => !(B.abKeys || []).includes('airstrike') || !!abilityBlocked('airstrike'), on: 'ability' },
  { id: 'wave', where: 'battle', say: 'Hold the line until the wave is cleared!', on: 'wave' },
  { id: 'retreat', where: 'battle', say: 'Waves keep coming, each one tougher. Fight on, or Retreat any time and keep everything you earned.', target: '#btn-retreat', next: 'Next' },
  { id: 'loot', where: 'base', say: 'Good work out there. Spend your loot on upgrades. Campaign missions pay even more.', clear: true, target: '#btn-campaign', next: 'Next', on: 'campaign' },
  { id: 'done', where: 'base', say: 'That\'s the basics. The outpost is yours, Commander. Here\'s something to get you started.', next: 'Finish', finish: true },
];
const TUT_REWARD = { gold: 600, steel: 400, medals: 20 };
const tutIndex = id => TUT_STEPS.findIndex(s => s.id === id);

let tutState = null; // runtime only: entered step, timers, camera reference
let tutEl = null, tutSpot = null;

function tutActive() { return S && S.tut != null && S.tut < TUT_STEPS.length && !!S.introSeen && !introRun; }
function tutStep() { return tutActive() ? TUT_STEPS[S.tut] : null; }

function tutGo(i) {
  S.tut = i;
  if (i >= TUT_STEPS.length) S.tut = 99;
  tutState = null;
  save();
}
function tutAdvance() { tutGo(S.tut + 1); }
function tutFinish(rewarded) {
  tutGo(99);
  if (rewarded) {
    gainRes('gold', TUT_REWARD.gold); gainRes('steel', TUT_REWARD.steel); S.medals += TUT_REWARD.medals;
    toast(`Training complete: +${fmt(TUT_REWARD.gold)} gold, +${fmt(TUT_REWARD.steel)} steel, +${TUT_REWARD.medals} medals`, 'good');
    Sound.play('medal');
  }
  save();
  if (!B && loginClaimable()) setTimeout(() => { if (S.tut >= 99 && !B && !introRun && modal.hidden && shop.hidden && !placing) openLogin(); }, 1400);
}
function tutSkip() { tutFinish(false); toast('Tutorial skipped. Replay it any time from Settings, Data', 'info'); }

// Called from the game when something happens (collect, shop, place, built, upgrade:<type>, battle, hero, ability, wave, campaign).
function tutorialEvent(ev) {
  const st = tutStep();
  if (st && st.on === ev) tutAdvance();
}

// helpers the steps use
function tutBubble() { return S.buildings.find(b => DEFS[b.type].produces === 'gold' && hasBubble(b)) || S.buildings.find(b => hasBubble(b)) || null; }
function tutSeedMine() {
  if (tutBubble()) return;
  const m = S.buildings.find(b => b.type === 'goldmine' && b.level >= 1 && !b.job);
  if (m && storageCap() - S.gold > 200) m.stored = Math.max(m.stored, 150);
}
function tutCanBuildMg() { const st = buildStatus('mg'); return st.ok || (!st.locked && countOf('mg') < limitOf('mg')); }
function tutHqStarted() { const h = hq(); return !h || !!h.job || h.level >= 2; }
function upgradeCostOf(b) { return b && b.level < DEFS[b.type].max ? costFor(b.type, b.level + 1) : {}; }
// Command sends what is missing so the step can always be done.
function tutFund(cost) {
  const need = {};
  for (const k of ['gold', 'steel', 'oil']) if ((cost[k] || 0) > (S[k] || 0)) need[k] = cost[k] - (S[k] || 0);
  if (!Object.keys(need).length) return;
  for (const k in need) S[k] = (S[k] || 0) + need[k];
  toast(`Supply drop from Command: ${Object.keys(need).map(k => `+${fmt(need[k])} ${k}`).join(', ')}`, 'good');
  save();
}
function tutBriefOpen() { return !modal.hidden && !!$('#btn-deploy'); }
function tutCamMoved() {
  if (!tutState || !tutState.cam) return false;
  const c = tutState.cam;
  return pointers.size === 0 && (Math.hypot(cam.x - c.x, cam.y - c.y) > 1.5 * TILE || Math.abs(cam.z / c.z - 1) > 0.12);
}
function tutWorldRect(b) {
  if (!b) return null;
  const n = DEFS[b.type].size * TILE, a = worldToScreen(b.x * TILE, b.y * TILE), z = worldToScreen(b.x * TILE + n, b.y * TILE + n);
  return { left: a.x, top: a.y - (hasBubble(b) ? 26 * cam.z : 0), right: z.x, bottom: z.y, round: true };
}
function tutBubbleRect(b) {
  if (!b) return null;
  const q = bubblePos(b), p = worldToScreen(q.x, q.y), r = Math.max(16, 20 * cam.z);
  return { left: p.x - r, top: p.y - r, right: p.x + r, bottom: p.y + r, round: true };
}
function tutHeroRect() {
  const h = B && B.hero; if (!h || h.dead) return null;
  const p = worldToScreen(h.x, h.y), r = 26 * Math.max(0.8, cam.z);
  return { left: p.x - r, top: p.y - r - 6, right: p.x + r, bottom: p.y + r - 6, round: true };
}
function tutTargetRect(st) {
  let t = typeof st.target === 'function' ? st.target() : st.target ? $(st.target) : null;
  if (!t) return null;
  if (t instanceof Element) {
    if (!t.getClientRects().length) return null;
    const r = t.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, el: t };
  }
  return t;
}
// overlays that cover the game: the tutorial only shows over them when its target is inside
function tutOverlay() {
  if (!modal.hidden) return modal;
  if (!shop.hidden) return shop;
  const cards = $('#cards'); if (cards && !cards.hidden) return cards;
  return null;
}

// Runs every frame (from updateHUD).
function updateTutorial() {
  if (!tutEl) { tutEl = $('#coach'); tutSpot = $('#tut-spot'); if (!tutEl) return; }
  const st = tutStep();
  if (!st) { tutHide(); return; }
  const inBattle = !!B && !B.over;
  // keep the flow in step with where the player is
  if (st.where === 'base' && inBattle) {
    if (S.tut < tutIndex('guns')) { tutGo(tutIndex('guns')); return; } // a battle started early: on to the battle steps
    tutHide(); return; // the after-battle steps wait for the base
  }
  if (st.where === 'battle' && !B) { tutGo(tutIndex('loot')); return; }
  if (st.where === 'battle' && B && B.over) { tutHide(); return; }
  // entering a step
  if (!tutState || tutState.i !== S.tut) {
    tutState = { i: S.tut, t: performance.now(), cam: { x: cam.x, y: cam.y, z: cam.z }, lost: 0, focused: false };
    if (st.clear && selectedId) select(null);
    if (st.enter) st.enter();
    if (st.skip && st.skip()) { tutAdvance(); return; }
    tutRender(st);
  }
  if (st.skip && st.skip()) { tutAdvance(); return; }
  if (st.check && st.check()) { tutAdvance(); return; }
  // a step whose screen was closed goes back to the step that opens it
  if (st.alive && !st.alive()) {
    if (!tutState.lost) tutState.lost = performance.now();
    else if (performance.now() - tutState.lost > 350) { tutGo(tutIndex(st.back)); return; }
  } else tutState.lost = 0;
  // bring map targets into view once
  if (st.focus && !tutState.focused && pointers.size === 0) {
    tutState.focused = true;
    const f = st.focus();
    if (f) {
      const c = f.type ? centerOf(f) : { x: f.x, y: f.y }, p = worldToScreen(c.x, c.y);
      if (p.x < vw * 0.2 || p.x > vw * 0.8 || p.y < vh * 0.28 || p.y > vh * 0.72) tutState.glide = { x0: cam.x, y0: cam.y, x1: c.x, y1: c.y, t0: performance.now() };
    }
  }
  if (tutState.glide) {
    const g = tutState.glide, k = Math.min(1, (performance.now() - g.t0) / 600), e = 1 - Math.pow(1 - k, 3);
    if (pointers.size) tutState.glide = null; // the player took over
    else { cam.x = g.x0 + (g.x1 - g.x0) * e; cam.y = g.y0 + (g.y1 - g.y0) * e; clampCam(); if (k >= 1) tutState.glide = null; }
  }
  // the Next button can appear after a delay
  const nb = tutEl.querySelector('.co-next');
  if (nb && st.next) { const show = !st.nextAfter || performance.now() - tutState.t > st.nextAfter * 1000; if (nb.hidden === show) nb.hidden = !show; }
  // hide behind dialogs unless the target is inside them, and while placing (except the placement step)
  const ov = tutOverlay(), r = tutTargetRect(st);
  const txt = (typeof st.say === 'function' ? st.say() : st.say) + (st.clear && selectedId && !r ? ' Close the building panel first.' : '');
  const pEl = tutEl.querySelector('.co-text'); if (pEl && pEl.textContent !== txt) pEl.textContent = txt;
  if (ov && !(r && r.el && ov.contains(r.el))) { tutHide(); return; }
  if (placing && st.id !== 'place') { tutHide(); return; }
  // a target inside a scrolling dialog or the shop list is scrolled into view once
  if (r && r.el && !tutState.scrolled) { tutState.scrolled = true; try { r.el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); } catch (e) { /* old browsers */ } }
  tutEl.hidden = false;
  tutPlace(r, inBattle);
}

function tutRender(st) {
  const n = S.tut + 1, total = TUT_STEPS.length;
  tutEl.innerHTML = `
    <div class="co-face">${ADVISOR_SVG}</div>
    <div class="co-body">
      <div class="co-who">${ADVISOR}<span>${n} / ${total}</span></div>
      <p class="co-text">${typeof st.say === 'function' ? st.say() : st.say}</p>
      <div class="co-row">
        ${st.finish ? '' : '<button class="co-skip" type="button">Skip tutorial</button>'}
        ${st.next ? `<button class="btn co-next" type="button"${st.nextAfter ? ' hidden' : ''}>${st.next}</button>` : ''}
      </div>
      <div class="co-dots">${TUT_STEPS.map((s, i) => `<i class="${i < S.tut ? 'done' : i === S.tut ? 'on' : ''}"></i>`).join('')}</div>
    </div>`;
  tutEl.classList.remove('pop'); void tutEl.offsetWidth; tutEl.classList.add('pop');
  const nb = tutEl.querySelector('.co-next');
  if (nb) nb.addEventListener('click', () => { Sound.play('click'); if (st.finish) tutFinish(true); else tutAdvance(); });
  const sk = tutEl.querySelector('.co-skip');
  if (sk) sk.addEventListener('click', () => {
    Sound.play('click');
    if (sk.dataset.armed) tutSkip();
    else { sk.dataset.armed = '1'; sk.textContent = 'Tap again to skip'; setTimeout(() => { if (sk.isConnected) { delete sk.dataset.armed; sk.textContent = 'Skip tutorial'; } }, 2500); }
  });
}

function tutHide() {
  if (document.body.classList.contains('coach-top')) document.body.classList.remove('coach-top');
  if (tutEl && !tutEl.hidden) tutEl.hidden = true;
  if (tutSpot && !tutSpot.hidden) tutSpot.hidden = true;
}

// Spotlight on the target, advisor card where it does not cover it.
function tutPlace(r, inBattle) {
  const pad = 7, inset = n => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n)) || 0;
  const sl = Math.max(10, inset('--safe-l')), sr = Math.max(10, inset('--safe-r')), sb = inset('--safe-b');
  if (r && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh) {
    const x = Math.round(r.left - pad), y = Math.round(r.top - pad), w = Math.round(r.right - r.left + pad * 2), h = Math.round(r.bottom - r.top + pad * 2);
    tutSpot.hidden = false;
    tutSpot.style.transform = `translate(${x}px, ${y}px)`;
    tutSpot.style.width = w + 'px'; tutSpot.style.height = h + 'px';
    tutSpot.classList.toggle('round', !!r.round);
    tutSpot.classList.toggle('light', inBattle);
    tutSpot.classList.toggle('arrow-up', y < 70);
  } else tutSpot.hidden = true;
  const fit = width => { tutEl.style.width = width + 'px'; return tutEl.offsetHeight || 90; };
  const top = (($('#hud-top') && $('#hud-top').getBoundingClientRect().bottom) || 46) + 8;
  const over = (x, y, w, h) => !r ? 0 : Math.max(0, Math.min(r.right + 10, x + w) - Math.max(r.left - 10, x)) * Math.max(0, Math.min(r.bottom + 10, y + h) - Math.max(r.top - 10, y));
  // 1) a full-width card above, below or across the middle
  let w = Math.min(430, vw - sl - sr), hh = fit(w), x = Math.round((vw - w) / 2);
  const ys = [top, vh - hh - sb - (inBattle ? 112 : 84), Math.round((vh - hh) / 2)];
  let y = ys.find(yy => !over(x, yy, w, hh));
  // 2) a narrower card beside the target
  if (y == null) {
    const left = r.left - sl - 14, right = vw - sr - r.right - 14, space = Math.max(left, right);
    if (space >= 190) {
      w = Math.min(340, space); hh = fit(w);
      x = right >= left ? Math.round(r.right + 14) : Math.round(r.left - 14 - w);
      y = clamp(Math.round((r.top + r.bottom) / 2 - hh / 2), top, Math.max(top, vh - hh - sb - 8));
    } else y = ys.reduce((a, b) => (over(x, b, w, hh) < over(x, a, w, hh) ? b : a)); // 3) least overlap
  }
  tutEl.style.transform = `translate(${x}px, ${Math.round(Math.max(4, y))}px)`;
  // toasts move below the card while it sits at the top
  const atTop = y < vh * 0.3;
  if (atTop) document.body.style.setProperty('--coach-bottom', Math.round(y + hh + 6) + 'px');
  if (document.body.classList.contains('coach-top') !== atTop) document.body.classList.toggle('coach-top', atTop);
}
