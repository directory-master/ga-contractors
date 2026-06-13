// ============================================================
//  Georgia Contractors — runtime for the GENERATED pages
//  (/<city>/, /county/<c>/, /zip/<z>/ and the hubs). The header,
//  listing cards and SEO are server-rendered by the generator; this
//  hydrates the SAME photo-forward app design the home uses by
//  reusing js/shared/listing-ui.mjs (one source of truth for the
//  cards, Premium/Standard rows and the v20 detail modal). Only the
//  page-specific glue lives here: parse the embedded #page-data,
//  hydrate the listings grid, sort + paginate, and the bottom tabs.
// ============================================================
import { ratingScore } from './shared/format.mjs';
import { createListingUI, applyTheme, ensureSpotSprite, isWide } from './shared/listing-ui.mjs';
import { track, wireLinkTracking } from './shared/analytics.mjs';
import { mountConsent } from './shared/consent.mjs';
import { initPWA } from './shared/pwa.mjs';

const $  = (s, r = document) => r.querySelector(s);

/* ---------- data (embedded by the generator) --------------- */
const PLACE = document.body.dataset.place || 'Georgia';
let pageData = {};
try { pageData = JSON.parse($('#page-data')?.textContent || '{}'); } catch { /* ignore */ }

const imgOf = (c) => (typeof c.image === 'string' && /^https?:/.test(c.image)) ? c.image
  : (Array.isArray(c.images) && c.images[0]) || null;
const enrich = (c) => ({ ...c, _score: ratingScore(c), _img: imgOf(c), _hasImg: !!imgOf(c),
  _search: `${c.name} ${c.type} ${c.cityName} ${c.zip || ''}`.toLowerCase() });

const RECORDS = Object.values(pageData).map(enrich);
const byId    = new Map(RECORDS.map(c => [String(c.id), c]));
const FEAT    = RECORDS.filter(c => c.example);
const shuffleOnce = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const FEAT_BY_TIER = { premium: shuffleOnce(FEAT.filter(c => c.tier === 'premium')), standard: shuffleOnce(FEAT.filter(c => c.tier === 'standard')) };

/* ---------- saved ♥ (shared localStorage key) -------------- */
let SAVED = new Set();
try { SAVED = new Set(JSON.parse(localStorage.getItem('gacontractors:saved') || '[]')); } catch { /* ignore */ }
const persistSaved = () => { try { localStorage.setItem('gacontractors:saved', JSON.stringify([...SAVED])); } catch { /* ignore */ } };
function updateSavedBadge() { const b = $('#savedBadge'); if (b) { b.textContent = SAVED.size; b.hidden = SAVED.size === 0; } }

/* ---------- geolocation ------------------------------------ */
let userLoc = null;
const getUserLoc = () => userLoc;

/* ---------- the shared, reusable UI ------------------------ */
const byName = new Map(RECORDS.map(c => [c.name, c]));
const ui = createListingUI({
  place: PLACE,
  getUserLoc,
  saved: SAVED,
  persistSaved,
  onSaveChange: updateSavedBadge,
  resolve: (n) => byName.get(n) || null,
  onMissing: () => ui.openSaved(),                 // saved item from another page → show the shortlist
  loadBrowse: async () => (await fetch('/browse-index.json')).json(),
  track,
});

/* ---------- listings grid (hydrate SSR cards + sort/page) -- */
const PAGE = 20;
let gridCards = [], gridSorted = [], gridShown = 0, searchQ = '';
const byRankScore = (a, b) => (b.rec._hasImg - a.rec._hasImg) || (b.rec._score - a.rec._score) || ((b.rec.reviews || 0) - (a.rec.reviews || 0));
function sortGrid(arr, mode) {
  const cmp = {
    rank: byRankScore,
    rating: (a, b) => (b.rec.rating || 0) - (a.rec.rating || 0) || byRankScore(a, b),
    reviews: (a, b) => (b.rec.reviews || 0) - (a.rec.reviews || 0) || byRankScore(a, b),
    name: (a, b) => String(a.rec.name).localeCompare(String(b.rec.name)),
    distance: (a, b) => { const da = ui.distMi(a.rec), db = ui.distMi(b.rec); if (da == null && db == null) return byRankScore(a, b); if (da == null) return 1; if (db == null) return -1; return da - db; },
  }[mode] || byRankScore;
  return arr.slice().sort(cmp);
}
function renderGrid() {
  const grid = $('#resultsGrid'); if (!grid) return;
  let list = gridCards;
  const q = searchQ.trim().toLowerCase();
  if (q) { const terms = q.split(/\s+/); list = list.filter(x => terms.every(t => x.rec._search.includes(t))); }
  gridSorted = sortGrid(list, $('#sortSelect')?.value || 'rank');
  grid.innerHTML = ''; gridShown = 0;
  if (!gridSorted.length) { grid.innerHTML = '<p class="empty">No contractors match yet. Try another trade or name.</p>'; const more = $('#viewMore'); if (more) more.hidden = true; return; }
  revealMore();
}
function revealMore() {
  const grid = $('#resultsGrid'); if (!grid) return;
  const frag = document.createDocumentFragment();
  gridSorted.slice(gridShown, gridShown + PAGE).forEach(x => frag.append(x.node));
  grid.append(frag); gridShown = Math.min(gridShown + PAGE, gridSorted.length);
  const more = $('#viewMore'); if (more) more.hidden = gridShown >= gridSorted.length;
}
function initGrid() {
  const grid = $('#resultsGrid'); if (!grid) return;
  gridCards = [...grid.querySelectorAll('.pcard')].map(n => ({ node: n, rec: byId.get(n.dataset.id) })).filter(x => x.rec);
  gridCards.forEach(x => ui.hydrateCard(x.node, x.rec));
  renderGrid();
}
// cards outside the main grid (the "just outside" absorb grid) — hydrate in place
function hydrateStaticCards() {
  document.querySelectorAll('#placeNearby .pcard').forEach(n => { const c = byId.get(n.dataset.id); if (c) ui.hydrateCard(n, c); });
}

/* ---------- geolocation (Nearby tab) ----------------------- */
function setUserLoc(loc) {
  userLoc = loc;
  try { localStorage.setItem('gacontractors:location', JSON.stringify(loc)); } catch { /* ignore */ }
  track('select_location', { method: String(loc.label || '').startsWith('ZIP') ? 'zip' : 'geo' });
  document.querySelectorAll('.pcard').forEach(node => { const c = byId.get(node.dataset.id); if (c) ui.refreshCardDistance(node, c); });
  ui.renderPremium(FEAT_BY_TIER); ui.renderStandard(FEAT_BY_TIER);
  if (($('#sortSelect')?.value) === 'distance') renderGrid();
}
function useMyLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    pos => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'your location' }),
    () => {},
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

/* ---------- wire up ---------------------------------------- */
function init() {
  try { const s = JSON.parse(localStorage.getItem('gacontractors:location') || 'null'); if (s && s.lat && s.lng) userLoc = s; } catch { /* ignore */ }

  ensureSpotSprite();
  mountConsent();
  initPWA();
  wireLinkTracking(() => { const c = ui.getLastOpen(); return c ? { listing_id: c.id, listing_name: c.name, city: c.cityName } : {}; });

  applyTheme();
  ui.renderPremium(FEAT_BY_TIER);
  ui.renderStandard(FEAT_BY_TIER);
  initGrid();
  hydrateStaticCards();
  updateSavedBadge();
  ui.renderMemory();
  ui.initSheets();
  wireScroll();

  $('#searchForm')?.addEventListener('submit', (e) => e.preventDefault());
  let t; $('#searchInput')?.addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { searchQ = e.target.value; renderGrid(); }, 200); });
  $('#sortSelect')?.addEventListener('change', renderGrid);
  $('#viewMore')?.addEventListener('click', revealMore);

  $('#modal')?.addEventListener('click', (e) => { if (e.target.dataset.close !== undefined) ui.closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { ui.closeModal(); ui.closeBrowse(); ui.closeSaved(); } });

  // bottom tabs behave exactly like the home (Browse + Saved open in-page sheets)
  const setTab = (id) => document.querySelectorAll('.tabbar__item').forEach(x => x.classList.toggle('is-active', x.id === id));
  $('#tabSearch')?.addEventListener('click', (e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(() => $('#searchInput')?.focus(), 220); });
  $('#tabBrowse')?.addEventListener('click', (e) => { e.preventDefault(); setTab('tabBrowse'); ui.openBrowse(); });
  $('#tabSaved')?.addEventListener('click', (e) => { e.preventDefault(); setTab('tabSaved'); ui.openSaved(); });
  $('#tabNearby')?.addEventListener('click', () => { setTab('tabNearby'); useMyLocation(); });
  $('#scrollTopBtn')?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  $('#footMascot')?.addEventListener('click', (e) => e.currentTarget.classList.toggle('pop'));
  if (location.hash === '#browse') ui.openBrowse();
  if (location.hash === '#saved') ui.openSaved();

  let lastWide = isWide();
  window.addEventListener('resize', () => { const w = isWide(); if (w !== lastWide) { lastWide = w; ui.renderPremium(FEAT_BY_TIER); } });
}

init();
