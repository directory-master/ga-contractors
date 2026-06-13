// ============================================================
//  GA.Contractors — photo-forward native-app storefront (v0.14).
//  Pure vanilla ES module, no framework, no build step. The data,
//  geolocation, paid model, analytics and consent layers are the
//  same as before; only the render layer is the new app design.
//  The ONLY external input is the listings dataset.
// ============================================================
import { IMPORTED } from './data/contractors-imported.js';
import { FEATURED } from './data/featured.js';
import { CITY_COUNTY, countySlug } from './data/ga-counties.js';
// shared, reusable helpers — single source of truth (js/shared/).
import { esc, hash, ratingScore, fmtMi, milesBetween } from './shared/format.mjs';
import { tileUrl } from './shared/geo.mjs';
import { loadLeaflet } from './shared/maps.mjs';
import { track, wireLinkTracking } from './shared/analytics.mjs';
import { mountConsent } from './shared/consent.mjs';
import { initPWA } from './shared/pwa.mjs';
// the reusable render layer (cards, Premium/Standard rows, v20 modal, theming),
// shared with the generated pages (js/page.js) — ONE source of truth.
import { createListingUI, applyTheme, ensureSpotSprite, isWide, IC, STAR } from './shared/listing-ui.mjs';

/* ---------- tiny DOM helpers ------------------------------- */
const $  = (s, r = document) => r.querySelector(s);
const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
const nodeFrom = (html) => { const t = el('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

/* ---------- 1. Prepare the data ---------------------------- */
const imgOf = (c) => (typeof c.image === 'string' && /^https?:/.test(c.image)) ? c.image
  : (Array.isArray(c.images) && c.images[0]) || null;
const enrich = (c) => ({ ...c, _score: ratingScore(c), _img: imgOf(c), _hasImg: !!imgOf(c),
  _search: `${c.name} ${c.type} ${c.cityName} ${c.zip || ''}`.toLowerCase() });

const ALL  = IMPORTED.map(enrich);
const FEAT = FEATURED.map(enrich);    // showcase-only EXAMPLE paid listings (never in ALL/search)
const shuffleOnce = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const FEAT_BY_TIER = { premium: shuffleOnce(FEAT.filter(c => c.tier === 'premium')), standard: shuffleOnce(FEAT.filter(c => c.tier === 'standard')) };

const byCount = (arr, key) => {
  const m = new Map();
  for (const c of arr) { const k = c[key]; if (!k) continue; (m.get(k) || m.set(k, []).get(k)).push(c); }
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
};
const TYPES   = byCount(ALL, 'type');
const CITIES  = byCount(ALL, 'cityName');
const RATED   = ALL.filter(c => c.rating).sort((a, b) => b._score - a._score);
const WITHIMG = ALL.filter(c => c._hasImg);
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (hash('s' + i) % (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const FRESH = shuffle(WITHIMG);
const pickBest = (list) => [...list].sort((a, b) =>
  (b._hasImg - a._hasImg) || (b._score - a._score) || (b.reviews || 0) - (a.reviews || 0));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/* ---------- Browse-sheet data (cities / counties / ZIPs ≥5) ---------- */
const coordOf = (list) => { const p = list.find(c => c.lat && c.lng); return p ? { lat: p.lat, lng: p.lng } : {}; };
const groupBy = (key) => { const m = new Map(); for (const c of ALL) { const k = key(c); if (!k) continue; (m.get(k) || m.set(k, []).get(k)).push(c); } return m; };
const BROWSE = {
  cities: CITIES.filter(([, l]) => l.length >= 5).map(([name, l]) => ({ href: `/${l[0].city}/`, name, count: l.length, z: 11, ...coordOf(l) })),
  counties: [...groupBy(c => CITY_COUNTY[c.city])].filter(([, l]) => l.length >= 5)
    .map(([cn, l]) => ({ href: `/county/${countySlug(cn)}/`, name: `${cn} County`, count: l.length, z: 9, ...coordOf(l) }))
    .sort((a, b) => b.count - a.count),
  zips: [...groupBy(c => (/^\d{5}$/.test(String(c.zip || '')) ? String(c.zip) : null))].filter(([, l]) => l.length >= 5)
    .map(([z, l]) => ({ href: `/zip/${z}/`, name: `${z} · ${l[0].cityName}`, count: l.length, z: 12, ...coordOf(l) }))
    .sort((a, b) => b.count - a.count),
};

/* ---------- geolocation + distance ------------------------- */
let userLoc = null;                            // { lat, lng, label }
let redraw  = () => {};                         // re-renders the current home view
const distMi = (c) => (userLoc && c.lat && c.lng) ? milesBetween(userLoc, c) : null;
const nearestItems = (n) => userLoc
  ? ALL.filter(c => c.lat && c.lng).map(c => [milesBetween(userLoc, c), c]).sort((a, b) => a[0] - b[0]).slice(0, n).map(x => x[1])
  : [];
const zipCentroid = (zip) => {
  const pts = ALL.filter(c => String(c.zip) === String(zip) && c.lat && c.lng);
  if (!pts.length) return null;
  return { lat: pts.reduce((a, c) => a + c.lat, 0) / pts.length, lng: pts.reduce((a, c) => a + c.lng, 0) / pts.length, label: 'ZIP ' + zip };
};

/* ---------- shared render layer (single source of truth) ----
   photoEl, saveBtn, the Premium/Standard rows and the v20 modal all
   come from js/shared/listing-ui.mjs (same module the generated pages
   use). createListingUI(ctx) is instantiated below once SAVED + the
   geolocation accessors exist; STAR / heartSVG / IC / isWide / hlText /
   applyTheme / ensureSpotSprite are imported directly. */
const PLACE = 'Georgia';   // home page scope — generated pages pass their own

/* ---------- saved ♥ + recents (localStorage memory) -------- */
let SAVED = new Set();
try { SAVED = new Set(JSON.parse(localStorage.getItem('gacontractors:saved') || '[]')); } catch { /* ignore */ }
const persistSaved = () => { try { localStorage.setItem('gacontractors:saved', JSON.stringify([...SAVED])); } catch { /* ignore */ } };
// side effects when a heart is toggled (the shared module re-renders the memory
// strip and any open saved sheet itself; the home only owns the tab badge)
function onSaveChange() { updateSavedBadge(); }

/* one shared UI instance powers the whole home page — same module the generated
   city/county/ZIP pages use (js/page.js). The Browse sheet, Saved sheet, memory
   strip and v20 modal all live in that module. */
const ui = createListingUI({
  place: PLACE,
  getUserLoc: () => userLoc,
  saved: SAVED,
  persistSaved,
  onSaveChange,
  resolve: (n) => ALL.find(x => x.name === n) || FEAT.find(x => x.name === n) || null,
  onMissing: (n) => runSearch(n),
  loadBrowse: async () => BROWSE,                  // home has the full index in memory
  track,
});
const { photoEl, saveBtn, sectionHead, openModal, closeModal, renderMemory,
  openBrowse, closeBrowse, openSaved, closeSaved, renderSavedSheet, initSheets } = ui;
const appCard = (c, terms) => ui.buildCard(c, terms);
const renderPremium = () => ui.renderPremium(FEAT_BY_TIER);
const renderStandard = () => ui.renderStandard(FEAT_BY_TIER);
function updateSavedBadge() {
  const n = SAVED.size;
  const b = $('#savedBadge'); if (b) { b.textContent = n; b.hidden = n === 0; }
  const c = $('#savedCount'); if (c) c.textContent = `(${n})`;
}
/* ---------- header proof strip (count-up) ------------------ */
function countUp(node, to, suffix = '') {
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return; io.disconnect();
    const t0 = performance.now(), dur = 1100;
    const tick = (t) => { const p = Math.min(1, (t - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - p, 3)));
      node.textContent = v.toLocaleString() + suffix; if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }, { threshold: .6 });
  io.observe(node);
}
function renderHeader() {
  const reviews = ALL.reduce((a, c) => a + (c.reviews || 0), 0);
  const stats = [[ALL.length, '+', 'registered pros'], [CITIES.length, '', 'Georgia cities'], [reviews, '+', 'verified reviews']];
  const proof = $('#proof'); proof.innerHTML = '';
  stats.forEach(([n, suf, label]) => {
    const d = el('div', 'hd__stat'); const b = el('b'); b.textContent = '0'; const sp = el('span'); sp.textContent = label;
    d.append(b, sp); proof.append(d); countUp(b, n, suf);
  });
}

/* ---------- chips + search --------------------------------- */
let activeChip = 'all';
function renderChips() {
  const chips = $('#chips'); chips.innerHTML = '';
  const defs = [['all', 'All'], ['top', 'Top Rated'], ...TYPES.map(([t]) => ['type:' + t, t])];
  for (const [key, label] of defs) {
    const b = el('button', 'chip' + (key === activeChip ? ' is-active' : ''));
    b.textContent = label; b.dataset.key = key;
    b.onclick = () => { activeChip = key; renderChips(); applyChip(key); };
    chips.append(b);
  }
}
function applyChip(key) {
  $('#searchInput').value = '';
  if (key === 'all') return showHome();
  if (key === 'top') return showResults('Top Rated in Georgia', RATED);
  if (key.startsWith('type:')) { const t = key.slice(5); return showResults(t, pickBest(ALL.filter(c => c.type === t))); }
}
function runSearch(q) {
  q = q.trim().toLowerCase();
  if (!q) { activeChip = 'all'; renderChips(); return showHome(); }
  const terms = q.split(/\s+/);
  const hits = pickBest(ALL.filter(c => terms.every(t => c._search.includes(t))));
  track('search', { search_term: q, results: hits.length });
  showResults(`Results for “${q}”`, hits, terms);
}

/* ---------- Near you --------------------------------------- */
function topCityEntry() {
  if (userLoc) { const near = nearestItems(1)[0]; if (near) { const e = CITIES.find(([n]) => n === near.cityName); if (e) return e; } }
  return CITIES[0];
}
function renderNearYou() {
  const host = $('#nearYou'); host.innerHTML = '';
  const entry = topCityEntry(); if (!entry) return;
  const city = entry[0], list = entry[1];
  const cards = userLoc ? nearestItems(8) : pickBest(list).slice(0, 8);

  const head = el('div', 'sh');
  head.innerHTML = `<div><div class="sh__k">Near you</div><div class="sh__t">Around <span>${esc(city)}</span></div></div>`;
  const locBtn = el('button', 'locbtn2'); locBtn.setAttribute('aria-label', 'Use my location');
  locBtn.innerHTML = `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/></svg>`;
  locBtn.addEventListener('click', () => { locBtn.classList.add('is-locating'); useMyLocation(); setTimeout(() => locBtn.classList.remove('is-locating'), 1400); });
  head.append(locBtn);
  host.append(head);

  const rail = el('div', 'hrail');
  cards.forEach(c => rail.append(appCard(c)));
  // "More in {city}" door card → the city page
  const door = el('a', 'doorcard'); door.href = `/${list[0].city}/`;
  door.innerHTML = `<div class="doorcard__ic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></div>
    <div class="doorcard__t">More in ${esc(city)}</div><div class="doorcard__s">${list.length.toLocaleString()} licensed pros →</div>`;
  rail.append(door);
  host.append(rail);
}


/* ---------- Top 10 leaderboard ----------------------------- */
function renderLeaderboard() {
  const host = $('#leaderboard'); host.innerHTML = '';
  const list = RATED.slice(0, 10); if (list.length < 2) return;
  const champ = list[0], rest = list.slice(1);   // show all of the Top 10
  host.append(sectionHead('Statewide', 'Top 10 in Georgia', 'Georgia'));
  const lbWrap = el('div', 'lb');
  const panel = el('div', 'lb__panel');
  panel.innerHTML = `<div class="lb__head"><div class="lb__title">Georgia <span>Leaderboard</span></div><div class="lb__by">by reviewer score</div></div>`;
  const grid = el('div', 'lb__grid');

  const champEl = el('div', 'lb__champ');
  champEl.append(photoEl(champ));
  champEl.insertAdjacentHTML('beforeend', `<div class="lb__champ-scrim"></div><div class="lb__num1">1</div>
    <div class="lb__crown">★ No. 1 in Georgia</div>
    <div class="lb__champ-b"><div class="lb__champ-k">${esc(champ.type)} · ${esc(champ.cityName)}</div>
      <div class="lb__champ-n">${esc(champ.name)}</div>
      <div class="lb__champ-r">${STAR(14)} ${champ.rating || ''} <span>· ${champ.reviews || 0} reviews</span></div></div>`);
  champEl.addEventListener('click', () => openModal(champ));

  const rows = el('div', 'lb__rows');
  rest.forEach((c, i) => {
    const r = el('div', 'lb__row');
    const num = el('div', 'lb__rownum'); num.textContent = i + 2;
    const photo = photoEl(c, 'lb__rowph');
    const text = el('div', 'lb__rowtext'); text.innerHTML = `<div class="lb__rown">${esc(c.name)}</div><div class="lb__rowsub">${esc(c.type)} · ${esc(c.cityName)}</div>`;
    const rt = el('div', 'lb__rowr'); rt.innerHTML = `<b>${STAR(12)} ${c.rating || ''}</b><span>${c.reviews || 0} reviews</span>`;
    r.append(num, photo, text, rt);
    r.addEventListener('click', () => openModal(c));
    rows.append(r);
  });

  grid.append(champEl, rows);
  panel.append(grid);
  lbWrap.append(panel);
  host.append(lbWrap);
}

/* ---------- Top in {city} (photo rows) --------------------- */
function renderTopInCity() {
  const host = $('#topCity'); host.innerHTML = '';
  const entry = topCityEntry(); if (!entry) return;
  const city = entry[0], list = pickBest(entry[1]);
  host.append(sectionHead('Near you', `Top in ${city}`, city, 'Open', () => { location.href = `/${entry[1][0].city}/`; }));
  const panel = el('div', 'tic__panel');
  let expanded = false;
  const draw = () => {
    panel.innerHTML = '';
    (expanded ? list.slice(0, 8) : list.slice(0, 4)).forEach(c => {
      const row = el('div', 'tic__row');
      row.append(photoEl(c, 'tic__ph'));
      const text = el('div', 'tic__text'); text.innerHTML = `<div class="tic__n">${esc(c.name)}</div><div class="tic__sub">${esc(c.type)}</div>`;
      const rt = el('div', 'tic__r'); rt.innerHTML = `<b>${STAR()} ${c.rating || '—'}</b>${distMi(c) != null ? `<span>${fmtMi(distMi(c))}</span>` : ''}`;
      row.append(text, rt);
      row.addEventListener('click', () => openModal(c));
      panel.append(row);
    });
    if (list.length > 4) {
      const more = el('button', 'tic__more'); more.textContent = expanded ? 'Show less' : `Show ${Math.min(list.length, 8) - 4} more in ${city}`;
      more.onclick = () => { expanded = !expanded; draw(); };
      panel.append(more);
    }
  };
  draw();
  const ticWrap = el('div', 'tic'); ticWrap.append(panel);   // .tic provides the 20px side gutter
  host.append(ticWrap);
}

/* ---------- Highlights (shuffle) --------------------------- */
const HL_POOL = WITHIMG.length >= 8 ? WITHIMG : pickBest(ALL);
let hlPicks = FRESH.length ? FRESH.slice(0, 8) : HL_POOL.slice(0, 8);
function renderHighlights() {
  const host = $('#highlights'); host.innerHTML = '';
  host.append(sectionHead('Discover', "Today's highlights", 'highlights', `${IC.refresh(13)} Shuffle`, () => { hlPicks = shuffleOnce(HL_POOL).slice(0, 8); renderHighlights(); }));
  const rail = el('div', 'hrail');
  hlPicks.forEach(c => rail.append(appCard(c)));
  host.append(rail);
}

/* ---------- view switching --------------------------------- */
function showHome() {
  $('#home').hidden = false; $('#nearYou').hidden = false; $('#season').hidden = false;
  $('#results').hidden = true;
  redraw = showHome;
  renderNearYou();
  renderPremium();
  renderStandard();
  renderLeaderboard();
  renderTopInCity();
  renderHighlights();
  renderMemory();
}
const PAGE = 20;
function showResults(title, items, terms) {
  $('#home').hidden = true; $('#nearYou').hidden = true; $('#season').hidden = true;
  const sec = $('#results'); sec.hidden = false;
  redraw = () => showResults(title, items, terms);
  const grid = $('#resultsGrid'); grid.innerHTML = '';
  const head = $('#resultsHead'); const more = $('#viewMore');
  if (!items.length) { head.textContent = `${title} · 0`; grid.innerHTML = '<p class="empty">No builders match yet. Try another trade or city.</p>'; if (more) more.hidden = true; window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  let shown = 0;
  const renderNext = () => {
    const frag = document.createDocumentFragment();
    items.slice(shown, shown + PAGE).forEach(c => frag.append(appCard(c, terms)));
    grid.append(frag); shown = Math.min(shown + PAGE, items.length);
    head.textContent = `${title} · ${shown.toLocaleString()} of ${items.length.toLocaleString()}`;
    if (more) more.hidden = shown >= items.length;
  };
  if (more) more.onclick = renderNext;
  renderNext();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- seasonal banner (auto, current month) ---------- */
const SEASONS = [
  { months: [11, 0, 1], icon: 'snow', grad: 'linear-gradient(135deg,#2C3A55,#13312A)', accent: '#9FD8C4', title: 'Winter-proof your home', sub: 'HVAC, insulation and window pros are in season.', cta: 'Find heating pros', q: 'hvac' },
  { months: [2, 3], icon: 'rain', grad: 'linear-gradient(135deg,#3A4B6B,#1B2A45)', accent: '#8FD3FF', title: 'Spring storm season', sub: 'Free roof inspections before the hail does it for you.', cta: 'Find roofers', q: 'roof' },
  { months: [4, 5], icon: 'wind', grad: 'linear-gradient(135deg,#0E4D5C,#0B2B36)', accent: '#7EE2D8', title: 'Hurricane season starts June 1', sub: 'Storm-rated roofing, windows and generators — get ahead of it.', cta: 'Get storm-ready', q: 'roof' },
  { months: [6, 7], icon: 'sun', grad: 'linear-gradient(135deg,#B4541E,#7A3010)', accent: '#FFD9A8', title: 'Peak heat is here', sub: 'AC techs and pool builders book out fastest in July.', cta: 'Beat the rush', q: 'pool' },
  { months: [8, 9], icon: 'leaf', grad: 'linear-gradient(135deg,#7A4A1E,#4A2A10)', accent: '#FFC98A', title: 'Hosting the holidays?', sub: 'Kitchen and bath remodelers book out by October.', cta: 'Find remodelers', q: 'kitchen' },
  { months: [10], icon: 'gift', grad: 'linear-gradient(135deg,#54381E,#2E1F10)', accent: '#E8B87A', title: 'Year-end project window', sub: 'Lock in winter pricing before the January rush.', cta: 'Start a project', q: '' },
];
function renderSeason() {
  const host = $('#season'); const s = SEASONS.find(x => x.months.includes(new Date().getMonth())) || SEASONS[0];
  const monthName = new Date(2026, s.months[0], 1).toLocaleString('en-US', { month: 'long' });
  host.innerHTML = `<div class="season__card" style="background:${s.grad}">
    <div class="season__emoji">${IC[s.icon](120)}</div>
    <div class="season__ey" style="color:${s.accent}">${monthName} in Georgia</div>
    <div class="season__t">${esc(s.title)}</div>
    <div class="season__s">${esc(s.sub)}</div>
    <button class="season__cta" type="button">${esc(s.cta)} →</button></div>`;
  host.querySelector('.season__cta').addEventListener('click', () => {
    // run the themed search, but never dead-end: if our directory has no match
    // for that trade, fall back to the statewide Top Rated list so the click
    // always lands the user on real contractors.
    if (s.q) {
      const terms = s.q.toLowerCase().split(/\s+/);
      const hits = pickBest(ALL.filter(c => terms.every(t => c._search.includes(t))));
      if (hits.length) { $('#searchInput').value = s.q; activeChip = 'all'; renderChips(); showResults(`Results for “${s.q}”`, hits, terms); return; }
    }
    $('#searchInput').value = ''; activeChip = 'top'; renderChips(); showResults('Top Rated in Georgia', RATED);
  });
}


function enableSheetSwipe(modalSel, closeFn) {
  const panel = document.querySelector(`${modalSel} .modal__panel`);
  const grab = panel?.querySelector('.modal__grab');
  if (!panel || !grab) return;
  let y0 = null, moved = 0;
  grab.style.touchAction = 'none';
  grab.addEventListener('pointerdown', (e) => { y0 = e.clientY; moved = 0; panel.style.transition = 'none'; try { grab.setPointerCapture(e.pointerId); } catch { /* ignore */ } });
  grab.addEventListener('pointermove', (e) => { if (y0 == null) return; moved = Math.max(0, e.clientY - y0); panel.style.transform = `translateY(${moved}px)`; });
  const end = () => { if (y0 == null) return; y0 = null; panel.style.transition = 'transform .25s ease';
    if (moved > 110) { panel.style.transform = 'translateY(110%)'; setTimeout(() => { closeFn(); panel.style.transform = ''; panel.style.transition = ''; }, 200); }
    else { panel.style.transform = ''; if (moved < 6) closeFn(); } };
  grab.addEventListener('pointerup', end); grab.addEventListener('pointercancel', end);
}


/* ---------- geolocation controls --------------------------- */
function reflectLoc() {
  const bar = $('#locBar'), t = $('#locTitle'), ll = $('#locLabel'), b = $('#locBtn');
  bar?.classList.toggle('is-located', !!userLoc);
  if (userLoc) { if (t) t.textContent = "You're all set"; if (ll) ll.textContent = 'Distances from ' + (userLoc.label || 'your location'); if (b) b.textContent = 'Change'; }
  else { if (t) t.textContent = "See who's nearest you"; if (ll) ll.textContent = 'Pin your location for distances & map directions'; if (b) b.textContent = 'Use my location'; }
}
function setUserLoc(loc) {
  userLoc = loc;
  try { localStorage.setItem('gacontractors:location', JSON.stringify(loc)); } catch { /* ignore */ }
  track('select_location', { method: String(loc.label || '').startsWith('ZIP') ? 'zip' : 'geo' });
  reflectLoc();
  redraw();
}
function useMyLocation() {
  const b = $('#locBtn');
  if (!navigator.geolocation) { $('#zipInput')?.focus(); return; }
  if (b) b.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(
    pos => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'your location' }),
    ()  => { const ll = $('#locLabel'); if (ll) ll.textContent = 'Location blocked. Enter your ZIP'; if (b) b.textContent = 'Use my location'; $('#zipInput')?.focus(); },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 6e5 });
}

/* ---------- scroll progress + back-to-top ------------------ */
function wireScroll() {
  const bar = $('#sprogBar'), up = $('#scrollTopBtn');
  const fn = () => {
    const h = document.documentElement, max = h.scrollHeight - h.clientHeight;
    if (bar) bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
    up?.classList.toggle('show', h.scrollTop > 600);
  };
  window.addEventListener('scroll', fn, { passive: true });
  fn();
}

/* ---------- 8. Wire up ------------------------------------- */
function init() {
  try { const s = JSON.parse(localStorage.getItem('gacontractors:location') || 'null'); if (s && s.lat && s.lng) userLoc = s; } catch { /* ignore */ }

  ensureSpotSprite();
  mountConsent();
  initPWA();
  wireLinkTracking(() => { const c = ui.getLastOpen(); return c ? { listing_id: c.id, listing_name: c.name, city: c.cityName } : {}; });

  applyTheme();
  renderHeader();
  renderChips();
  renderSeason();
  showHome();
  reflectLoc();
  wireScroll();

  $('#locBtn')?.addEventListener('click', useMyLocation);
  $('#locClose')?.addEventListener('click', () => { $('#locBar').hidden = true; $('#locReopen').hidden = false; document.body.classList.add('locbar-dismissed'); });
  $('#locReopen')?.addEventListener('click', () => { $('#locReopen').hidden = true; $('#locBar').hidden = false; document.body.classList.remove('locbar-dismissed'); });
  try { const z = localStorage.getItem('gacontractors:zip'); if (z && $('#zipInput')) $('#zipInput').value = z; } catch { /* ignore */ }
  $('#zipWrap')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const zip = $('#zipInput').value.trim();
    const loc = zipCentroid(zip);
    if (loc) { try { localStorage.setItem('gacontractors:zip', zip); } catch { /* ignore */ } setUserLoc(loc); }
    else $('#zipInput').setCustomValidity('No contractors found for that ZIP');
  });
  $('#zipInput')?.addEventListener('input', () => $('#zipInput').setCustomValidity(''));

  $('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); runSearch($('#searchInput').value); });
  let t; $('#searchInput').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => runSearch(e.target.value), 220); });

  const goHome = (e) => { e?.preventDefault?.(); activeChip = 'all'; renderChips(); showHome(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  $('#brandHome')?.addEventListener('click', goHome);
  $('#scrollTopBtn').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  // desktop-nav links + footer "Top 10"
  document.querySelectorAll('[data-nav]').forEach(a => a.addEventListener('click', (e) => {
    const nav = a.dataset.nav;
    if (nav === 'browse') { e.preventDefault(); openBrowse(); }
    else if (nav === 'search') { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(() => $('#searchInput')?.focus(), 200); }
    else if (nav === 'top10') { e.preventDefault(); showResults('Top 10 in Georgia', RATED.slice(0, 10)); }
    else if (nav === 'saved') { e.preventDefault(); openSaved(); }
  }));

  $('#modal').addEventListener('click', (e) => { if (e.target.dataset.close !== undefined) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeBrowse(); closeSaved(); } });

  initSheets();                                    // Browse + Saved sheet chrome (shared module)
  if (location.hash === '#browse') openBrowse();   // deep-link to the Browse sheet
  if (location.hash === '#saved') openSaved();

  enableSheetSwipe('#modal', closeModal);

  const setTab = (id) => document.querySelectorAll('.tabbar__item').forEach(t => t.classList.toggle('is-active', t.id === id));
  $('#tabHome')?.addEventListener('click', () => { setTab('tabHome'); goHome(); });
  $('#tabSearch')?.addEventListener('click', () => { setTab('tabSearch'); window.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(() => $('#searchInput')?.focus(), 220); });
  $('#tabBrowse')?.addEventListener('click', () => { setTab('tabBrowse'); openBrowse(); });
  $('#tabSaved')?.addEventListener('click', () => { setTab('tabSaved'); openSaved(); });
  $('#tabNearby')?.addEventListener('click', () => {
    setTab('tabNearby');
    if (!window.matchMedia('(max-width: 720px)').matches && $('#locBar')?.hidden) { $('#locReopen').hidden = true; $('#locBar').hidden = false; document.body.classList.remove('locbar-dismissed'); }
    useMyLocation();
  });

  $('#footMascot')?.addEventListener('click', (e) => e.currentTarget.classList.toggle('pop'));
  enableSheetSwipe('#savedSheet', closeSaved);
  updateSavedBadge();
  // premium switches between carousel (small) and 4-card grid (wide) on resize
  let lastWide = isWide();
  window.addEventListener('resize', () => { const w = isWide(); if (w !== lastWide) { lastWide = w; if ($('#results').hidden) renderPremium(); } });

  $('#footMeta').textContent = `${ALL.length.toLocaleString()} listings · ${CITIES.length} cities · ${TYPES.length} trades`;
}

init();
