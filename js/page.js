// ============================================================
//  page.js — interactivity for the STATIC place pages
//  (city / county / zip / hubs). Cards + hero are pre-rendered
//  as HTML for crawlers; this only wires the detail modal,
//  the rail scroll arrows, and modal close. The per-page
//  listing data lives inline in <script id="page-data">.
// ============================================================
// shared, reusable helpers — single source of truth (see js/shared/)
import { esc, hash, initials, fmtMi, fmtClock, openStatus, milesBetween } from './shared/format.mjs';
import { colorFor, tintedBg } from './shared/palette.mjs';
import { tileUrl } from './shared/geo.mjs';
import { spotUse } from './shared/icons.mjs';
import { loadLeaflet, mapPin, observeCardMap } from './shared/maps.mjs';
import { CLAIM_EMAIL } from './shared/components.mjs';
import { track, wireLinkTracking } from './shared/analytics.mjs';

const $ = (s, r = document) => r.querySelector(s);
const el = (t, c) => { const n = document.createElement(t); if (c) n.className = c; return n; };

const DATA = (() => { try { return JSON.parse($('#page-data')?.textContent || '{}'); } catch { return {}; } })();
const ZIP_INDEX = (() => { try { return JSON.parse($('#zip-index')?.textContent || '{}'); } catch { return {}; } })();

let userLoc = null;   // shared with the home page via localStorage
try { const s = JSON.parse(localStorage.getItem('gacontractors:location') || 'null'); if (s && s.lat && s.lng) userLoc = s; } catch { /* ignore */ }

/* ---------- modal mini-map (no-photo listings) ------------- */
function initMiniMap(c) {
  const mapEl = $('#mMap'); if (!mapEl || mapEl.dataset.init || !(c.lat && c.lng)) return;
  loadLeaflet().then(() => {
    mapEl.dataset.init = '1';
    const L = window.L;
    const map = L.map(mapEl, { zoomControl: false }).setView([c.lat, c.lng], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
    L.marker([c.lat, c.lng], { icon: mapPin(L, '#1b2536') }).addTo(map).bindPopup(esc(c.name)).openPopup();
    if (userLoc) {
      L.marker([userLoc.lat, userLoc.lng], { icon: mapPin(L, '#1750cc') }).addTo(map).bindPopup('You');
      L.polyline([[userLoc.lat, userLoc.lng], [c.lat, c.lng]], { color: '#1750cc', weight: 3, dashArray: '6 6' }).addTo(map);
      const mid = [(userLoc.lat + c.lat) / 2, (userLoc.lng + c.lng) / 2];
      L.marker(mid, { interactive: false, icon: L.divIcon({ className: 'mcar__distpin', html: `${fmtMi(milesBetween(userLoc, c))} away`, iconSize: [96, 24], iconAnchor: [48, 12] }) }).addTo(map);
      map.fitBounds(L.latLngBounds([[userLoc.lat, userLoc.lng], [c.lat, c.lng]]).pad(0.35));
    }
    setTimeout(() => map.invalidateSize(), 60);
  }).catch(() => { mapEl.innerHTML = '<p class="mcar__maperr">Map unavailable.</p>'; });
}
function mapView(host, c) {
  host.classList.add('mcarousel');
  const t = (userLoc && c.lat && c.lng) ? `📍 ${fmtMi(milesBetween(userLoc, c))} from your location` : 'Contractor location';
  host.innerHTML = `<div class="mcar__map" id="mMap"></div><span class="mcar__maptag">${esc(t)}</span>`;
  initMiniMap(c);
}

// Full image over an ambient blurred copy of itself (no cropping) — the paid
// "poster" treatment used by the gallery carousel slides.
function photoLayers(src, alt) {
  const frag = document.createDocumentFragment();
  const bg = el('div', 'mphoto__bg'); bg.style.backgroundImage = `url("${src}")`;
  const im = el('img', 'mphoto__img'); im.src = src; im.alt = alt || ''; im.loading = 'lazy'; im.referrerPolicy = 'no-referrer';
  frag.append(bg, im);
  return frag;
}

// Paid gallery carousel with the distance-map slide in the middle (mirrors app.js).
function buildCarousel(host, c) {
  host.classList.add('mcarousel');
  const imgs = (c.images || []).slice();
  const mapIdx = Math.floor((imgs.length + 1) / 2);
  const track = el('div', 'mcar__track');
  const addImg = (src) => { const s = el('div', 'mcar__slide'); s.append(photoLayers(src, c.name)); track.append(s); };
  const t = (userLoc && c.lat && c.lng) ? `📍 ${fmtMi(milesBetween(userLoc, c))} from your location` : 'Pin your location below for distance';
  const addMap = () => { const s = el('div', 'mcar__slide mcar__slide--map');
    s.innerHTML = `<div class="mcar__map" id="mMap"></div><span class="mcar__maptag">${esc(t)}</span>`; track.append(s); };
  imgs.forEach((src, i) => { if (i === mapIdx) addMap(); addImg(src); });
  if (mapIdx >= imgs.length) addMap();
  host.append(track);

  const total = track.children.length;
  const dots = el('div', 'mcar__dots');
  let idx = 0;
  const go = (i) => {
    idx = (i + total) % total;
    track.style.transform = `translateX(${-idx * 100}%)`;
    [...dots.children].forEach((d, j) => d.classList.toggle('is-active', j === idx));
    if (idx === mapIdx) initMiniMap(c);
  };
  for (let i = 0; i < total; i++) { const d = el('button'); if (i === 0) d.classList.add('is-active'); d.onclick = () => go(i); dots.append(d); }
  host.append(dots);
  const nav = (dir) => { const b = el('button', `mcar__nav mcar__nav--${dir}`); b.innerHTML = dir === 'prev' ? '‹' : '›'; b.onclick = () => go(idx + (dir === 'prev' ? -1 : 1)); return b; };
  host.append(nav('prev'), nav('next'));
}

/* ---------- detail modal ----------------------------------- */
const tag = (txt, cls = '') => { const s = el('span', 'tag ' + cls); s.textContent = txt; return s; };
const btnLink = (txt, href, cls) => { const a = el('a', 'btn ' + cls); a.href = href; a.textContent = txt; if (/^(https?|mailto):/.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } return a; };
// icon + label action button (SVG icon from the #spot-sprite, no emoji) — same as home
const iconLink = (iconId, label, href, cls) => { const a = btnLink('', href, cls); a.innerHTML = `${spotUse(iconId)} <span>${esc(label)}</span>`; return a; };

let lastOpen = null;   // current modal listing — analytics context for call/website/lead
function openModal(id) {
  const c = DATA[id]; if (!c) return;
  lastOpen = { id, ...c };
  track('view_listing', { listing_id: id, listing_name: c.name, city: c.cityName, item_category: c.type, tier: c.tier || 'free' });
  const m = $('#modal'); m.hidden = false; document.body.style.overflow = 'hidden';
  const hero = $('#mHero'); hero.className = 'modal__hero'; hero.style.backgroundImage = ''; hero.innerHTML = '';
  // paid demo listings → gallery carousel + distance-map slide; a photo → its image;
  // otherwise a live map of the location.
  const paid = c.tier === 'premium' || c.tier === 'standard';
  if (paid && Array.isArray(c.images) && c.images.length) { buildCarousel(hero, c); }
  else if (c.image) { hero.classList.add('mphoto'); hero.append(photoLayers(c.image, c.name)); }
  else if (c.lat && c.lng) { mapView(hero, c); }
  else { hero.style.background = colorFor(id); hero.innerHTML = `<span class="ph">${esc(initials(c.name))}</span>`; }

  $('#mTitle').textContent = c.name;
  $('#mMeta').textContent = `${c.type} · ${c.address || (c.cityName + ', GA')}`;

  const badges = $('#mBadges'); badges.innerHTML = '';
  if (c.rating) { const rt = tag('', 'tag--rate'); rt.innerHTML = `${spotUse('si-star')} ${esc(String(c.rating))}${c.reviews ? ` (${c.reviews})` : ''}`; badges.append(rt); }
  badges.append(tag(c.type, 'tag--type'));
  if (c.licensed) badges.append(tag('Licensed & Insured', 'tag--lic'));
  if (c.hoursText) badges.append(tag(c.hoursText));

  const acts = $('#mActions'); acts.innerHTML = '';
  // Example/demo listings have placeholder phone/website — never present them as
  // working contact actions. Show a claim CTA instead (mailto href, no visible email).
  if (c.example) {
    acts.append(iconLink('si-check', 'Claim this listing', `mailto:${CLAIM_EMAIL}?subject=${encodeURIComponent('Claim a featured placement')}`, 'btn--primary btn--wide'));
  } else {
    if (c.phone) acts.append(iconLink('si-phone', 'Call', 'tel:' + c.phone.replace(/[^\d+]/g, ''), 'btn--primary'));
    if (c.website) acts.append(iconLink('si-globe', 'Website', c.website, 'btn--solid'));
    const maps = c.lat && c.lng ? `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.name + ' ' + (c.address || c.cityName))}`;
    acts.append(iconLink('si-compass', 'Directions', maps, 'btn--ghost btn--wide'));
  }

  const facts = $('#mFacts'); facts.innerHTML = '';
  const add = (k, v) => { if (!v) return; const dt = el('dt'); dt.textContent = k; const dd = el('dd'); dd.innerHTML = v; facts.append(dt, dd); };
  if (c.example) {
    // demo card: show only the illustrative copy + hours, no fake contact details
    if (c.description) add('About', esc(c.description));
    add('Hours', c.hoursText ? esc(c.hoursText) : '');
  } else {
    add('Phone', c.phone ? `<a href="tel:${c.phone.replace(/[^\d+]/g, '')}">${esc(c.phone)}</a>` : '');
    add('Address', esc(c.address || `${c.cityName}, GA ${c.zip || ''}`));
    const mi = (userLoc && c.lat && c.lng) ? fmtMi(milesBetween(userLoc, c)) : '';
    add('Distance', mi ? `${mi} from your location` : '');
    add('Website', c.website ? `<a href="${c.website}" target="_blank" rel="noopener noreferrer">${esc(c.website.replace(/^https?:\/\//, ''))}</a>` : '');
    const socials = [['Facebook', c.facebook], ['Instagram', c.instagram], ['Twitter', c.twitter]]
      .filter(([, u]) => u).map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${n}</a>`).join(' · ');
    add('Social', socials);
    add('Hours', c.hoursText ? esc(c.hoursText) : '');
  }
}
function closeModal() { $('#modal').hidden = true; document.body.style.overflow = ''; }

/* ---------- wire up ---------------------------------------- */
document.addEventListener('click', (e) => {
  const card = e.target.closest('.card[data-id], .spot[data-id]');
  if (card && !e.target.closest('a')) { openModal(card.dataset.id); return; }
  if (e.target.dataset?.close !== undefined) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Enter') { const card = e.target.closest?.('.card[data-id], .spot[data-id]'); if (card) openModal(card.dataset.id); }
});
$('#scrollTopBtn')?.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

/* ---------- hero map backdrop (wide screens) --------------- */
// One Leaflet instance behind the contained poster, panned to the current
// contractor on each rotation. Non-interactive; lazy-loads Leaflet. Mirrors
// app.js — degrades gracefully to the blurred fill + poster if it can't load.
let heroMap = null, heroMarker = null, heroUserMarker = null, heroUserLine = null;
const heroMapWide = () => window.matchMedia && window.matchMedia('(min-width: 721px)').matches;
function updateHeroMap(c) {
  if (!heroMapWide() || !(c && c.lat && c.lng)) return;
  const elMap = $('#heroMap'); if (!elMap) return;
  loadLeaflet().then(() => {
    const L = window.L;
    if (!heroMap) {
      heroMap = L.map(elMap, { zoomControl: false, attributionControl: false, dragging: false,
        scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false }).setView([c.lat, c.lng], 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(heroMap);
      heroMarker = L.marker([c.lat, c.lng], { icon: mapPin(L, '#1b2536') }).addTo(heroMap);
      setTimeout(() => heroMap.invalidateSize(), 80);
    } else {
      heroMarker.setLatLng([c.lat, c.lng]);
    }
    if (userLoc) {
      if (!heroUserMarker) heroUserMarker = L.marker([userLoc.lat, userLoc.lng], { icon: mapPin(L, '#1750cc') }).addTo(heroMap).bindPopup('You');
      else heroUserMarker.setLatLng([userLoc.lat, userLoc.lng]);
      if (heroUserLine) heroUserLine.remove();
      heroUserLine = L.polyline([[userLoc.lat, userLoc.lng], [c.lat, c.lng]], { color: '#1750cc', weight: 2, dashArray: '5 6', opacity: .8 }).addTo(heroMap);
      heroMap.fitBounds(L.latLngBounds([[userLoc.lat, userLoc.lng], [c.lat, c.lng]]).pad(0.4));
    } else {
      heroMap.setView([c.lat, c.lng], 11, { animate: true, duration: 1.2 });
    }
  }).catch(() => { /* offline → blurred fill + poster still look fine */ });
}

/* ---------- rotating "Featured today" hero ----------------- */
let refreshHeroUser = () => {};   // drop/refresh the "you" pin when a location is set
(function heroCarousel() {
  const heroEl = $('#hero');
  if (!heroEl) return;
  const picks = (heroEl.dataset.heroIds || '').split(',').filter(Boolean)
    .map(id => ({ id, ...DATA[id] })).filter(p => p.name);
  if (!picks.length) return;
  let hi = 0, timer = null;
  refreshHeroUser = () => { if (heroMap) updateHeroMap(picks[hi]); };
  const pill = (txt, cls = '') => { const s = el('span', 'pill ' + cls); s.textContent = txt; return s; };
  // media/poster background: photo → static map tile → tinted stock
  const heroBg = (c) => c.image ? `url("${c.image}")` : (c.lat && c.lng ? `url("${tileUrl(c.lat, c.lng)}")` : tintedBg(c.id));

  function renderHero(i) {
    const c = picks[i]; if (!c) return;
    const bg = heroBg(c);
    $('#heroMedia').style.backgroundImage = bg;       // ambient blurred fill (desktop)
    $('#heroPoster').style.backgroundImage = bg;       // sharp contained poster (desktop)
    updateHeroMap(c);                                  // map backdrop centred on this contractor
    heroEl.classList.remove('is-anim'); void heroEl.offsetWidth; heroEl.classList.add('is-anim');
    $('#heroTitle').textContent = c.name;
    const meta = $('#heroMeta'); meta.innerHTML = '';
    if (c.rating) meta.append(pill(`★ ${c.rating}${c.reviews ? ` · ${c.reviews} reviews` : ''}`, 'pill--rate'));
    meta.append(pill(c.type), pill(c.cityName));
    if (c.licensed) meta.append(pill('Licensed & Insured'));
    $('#heroDesc').textContent = c.hoursText ? `${c.address || c.cityName + ', GA'} · ${c.hoursText}`
      : (c.address || `Serving ${c.cityName} and nearby Georgia communities.`);
    const acts = $('#heroActions'); acts.innerHTML = '';
    const view = el('button', 'btn btn--primary'); view.innerHTML = '▶ &nbsp;View details';
    view.onclick = () => openModal(c.id); acts.append(view);
    if (c.phone) { const a = el('a', 'btn btn--ghost'); a.href = 'tel:' + c.phone.replace(/[^\d+]/g, ''); a.textContent = '📞 ' + c.phone; acts.append(a); }
    renderDots(i);
  }
  function renderDots(active) {
    const d = $('#heroDots'); if (!d) return; d.innerHTML = '';
    picks.forEach((_, i) => { const b = el('button'); if (i === active) b.className = 'is-active';
      b.onclick = () => { hi = i; renderHero(i); restart(); }; d.append(b); });
  }
  function restart() { clearInterval(timer); if (picks.length > 1) timer = setInterval(() => { hi = (hi + 1) % picks.length; renderHero(hi); }, 6500); }
  renderHero(0); restart();
})();

// rail arrows — scroll + hide the arrow you can't use (start/end)
for (const vp of document.querySelectorAll('.rail__viewport')) {
  const track = vp.querySelector('.rail__track');
  const prev = vp.querySelector('.rail__nav--prev');
  const next = vp.querySelector('.rail__nav--next');
  if (!track) continue;
  prev?.addEventListener('click', () => track.scrollBy({ left: -track.clientWidth * 0.85, behavior: 'smooth' }));
  next?.addEventListener('click', () => track.scrollBy({ left:  track.clientWidth * 0.85, behavior: 'smooth' }));
  const update = () => {
    prev?.classList.toggle('is-hidden', track.scrollLeft <= 2);
    next?.classList.toggle('is-hidden', track.scrollLeft + track.clientWidth >= track.scrollWidth - 2);
  };
  track.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  requestAnimationFrame(update); setTimeout(update, 250);
}

// "View more" pagination for big grids (cards are all in the HTML for SEO;
// we just hide past 20 and reveal 20 more per click).
const PAGE = 20;
const gridReSorts = [];   // re-applied when a location is pinned (for "Nearest" sort)
const rankScore = (c) => (c.rating || 0) * Math.log10((c.reviews || 0) + 10);
for (const grid of document.querySelectorAll('.grid')) {
  const section = grid.closest('.results');
  const sel = section ? section.querySelector('[data-sort]') : null;
  const all = [...grid.children];
  const items = all.filter(n => n.dataset && n.dataset.id);          // sortable listing cards
  const tail = all.filter(n => !(n.dataset && n.dataset.id));         // claim/own card → pinned last
  if (items.length <= 1 && !sel) continue;
  const order0 = new Map(items.map((n, i) => [n, i]));               // server (byRank) order
  const rec = (n) => DATA[n.dataset.id] || {};
  const dist = (n) => { const c = rec(n); return (userLoc && c.lat && c.lng) ? milesBetween(userLoc, c) : Infinity; };
  const sorters = {
    rank: (a, b) => order0.get(a) - order0.get(b),
    rating: (a, b) => (rec(b).rating || 0) - (rec(a).rating || 0) || (rec(b).reviews || 0) - (rec(a).reviews || 0),
    reviews: (a, b) => (rec(b).reviews || 0) - (rec(a).reviews || 0) || rankScore(rec(b)) - rankScore(rec(a)),
    distance: (a, b) => dist(a) - dist(b),
    name: (a, b) => String(rec(a).name || '').localeCompare(String(rec(b).name || '')),
  };

  let shown = PAGE, btn = null;
  const render = () => {
    items.forEach((n, i) => { n.hidden = i >= shown; });
    tail.forEach(n => { n.hidden = shown < items.length; });          // claim card after the full list
    if (items.length <= PAGE) { if (btn) { btn.remove(); btn = null; } return; }
    if (shown >= items.length) { if (btn) { btn.remove(); btn = null; } return; }
    if (!btn) { btn = el('button', 'viewmore'); btn.type = 'button';
      btn.addEventListener('click', () => { shown = Math.min(shown + PAGE, items.length); render(); });
      grid.after(btn); }
    btn.textContent = `View more (${items.length - shown} left)`;
  };
  const applySort = () => {
    items.sort(sorters[sel && sorters[sel.value] ? sel.value : 'rank']);
    grid.append(...items, ...tail);    // reorder in the DOM (append moves existing nodes)
    shown = PAGE; render();
  };
  if (sel) { sel.addEventListener('change', () => { track('sort_change', { sort: sel.value }); applySort(); }); gridReSorts.push(() => { if (sel.value === 'distance') applySort(); }); }
  render();
}

/* ---------- overview map: every mapped contractor + the user -------------- */
let placeMap = null, placeUserMarker = null, placeBounds = null;
function refreshPlaceUser() {
  if (!placeMap || !window.L || !userLoc) return;
  const L = window.L;
  if (!placeUserMarker) placeUserMarker = L.marker([userLoc.lat, userLoc.lng], { icon: mapPin(L, '#1750cc') }).addTo(placeMap).bindPopup('You');
  else placeUserMarker.setLatLng([userLoc.lat, userLoc.lng]);
  if (placeBounds && placeBounds.length) placeMap.fitBounds(L.latLngBounds([...placeBounds, [userLoc.lat, userLoc.lng]]), { padding: [34, 34] });
}
(function initPlaceMap() {
  const elMap = $('#placeMap'); if (!elMap) return;
  const pts = Object.entries(DATA).filter(([, c]) => c.lat && c.lng && !c.example);   // real listings only
  if (!pts.length) { elMap.closest('.placemap-sec')?.remove(); return; }
  loadLeaflet().then(() => {
    const L = window.L;
    placeMap = L.map(elMap, { scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(placeMap);
    placeBounds = [];
    for (const [id, c] of pts) {
      L.marker([c.lat, c.lng], { icon: mapPin(L, '#1b2536') }).addTo(placeMap)
        .bindTooltip(c.name).on('click', () => openModal(id));
      placeBounds.push([c.lat, c.lng]);
    }
    placeMap.fitBounds(L.latLngBounds(placeBounds), { padding: [34, 34] });
    refreshPlaceUser();
    setTimeout(() => placeMap.invalidateSize(), 90);
  }).catch(() => { elMap.innerHTML = '<p class="mcar__maperr">Map unavailable.</p>'; });
})();

/* ---------- spotlight billboards (Featured / Standard rows) -------------
   The cards are server-rendered; here we bring them to life like the home page:
   a live open/closed status, the auto-advancing perk ticker, the scrollable
   service pills, and a distance chip once a location is pinned. */
const SPOT_DWELL = 3800;
function dragScroll(elm) {
  let down = false, x = 0, sl = 0;
  elm.addEventListener('pointerdown', e => { down = true; elm.classList.add('drag'); x = e.pageX; sl = elm.scrollLeft; elm.setPointerCapture(e.pointerId); });
  elm.addEventListener('pointermove', e => { if (down) elm.scrollLeft = sl - (e.pageX - x); });
  const up = () => { down = false; elm.classList.remove('drag'); };
  elm.addEventListener('pointerup', up); elm.addEventListener('pointercancel', up);
}
function spotDistance(spot) {        // add/refresh the "X mi" chip when located
  const c = DATA[spot.dataset.id]; if (!c) return;
  const left = spot.querySelector('.spot-bar-left'); if (!left) return;
  let chip = left.querySelector('.spot-mi');
  if (userLoc && c.lat && c.lng) {
    if (!chip) { chip = el('span', 'spot-mi'); left.append(chip); }
    chip.textContent = `📍 ${fmtMi(milesBetween(userLoc, c))}`;
  } else if (chip) { chip.remove(); }
}
// add/refresh the "📍 X mi" badge on every grid/all-contractors card once a
// location is pinned (the static cards carry only data-id; lat/lng live in DATA).
function refreshCardDistances() {
  for (const card of document.querySelectorAll('.card[data-id]')) {
    const c = DATA[card.dataset.id];
    const thumb = card.querySelector('.card__thumb'); if (!thumb) continue;
    let d = thumb.querySelector('.card__dist');
    const mi = (userLoc && c && c.lat && c.lng) ? milesBetween(userLoc, c) : null;
    if (mi != null) { if (!d) { d = el('span', 'card__dist'); thumb.append(d); } d.textContent = `📍 ${fmtMi(mi)}`; }
    else if (d) d.remove();
  }
}
// Upgrade the static-tile placeholders on no-photo cards to real, centred Leaflet
// maps (lazily, as they scroll in) so the pin matches the map — same as the home page.
function upgradeCardMaps() {
  for (const card of document.querySelectorAll('.card[data-id]')) {
    const ph = card.querySelector('.card__ph--map');
    const c = DATA[card.dataset.id];
    if (ph && !ph.dataset.init && c && c.lat && c.lng) observeCardMap(ph, c, () => userLoc);
  }
}
const spots = [...document.querySelectorAll('.spot[data-id]')];
for (const spot of spots) {
  const c = DATA[spot.dataset.id] || {};
  // live status (recomputed client-side so it's never stale)
  const stEl = spot.querySelector('.spot-status');
  const st = openStatus(c.hours);
  if (stEl && st) {
    stEl.classList.toggle('open', st.state === 'open' || st.state === 'closing');
    stEl.classList.toggle('closed', !(st.state === 'open' || st.state === 'closing'));
    stEl.innerHTML = `<span class="spot-dot"></span>${esc(st.label)}`;
  }
  spotDistance(spot);

  // perk ticker — auto-advance with a progress bar (staggered so cards don't sync)
  const track = spot.querySelector('.spot-track');
  if (track && track.children.length > 1) {
    const prog = spot.querySelector('.spot-prog i');
    const seed = hash(spot.dataset.id);
    const dwell = SPOT_DWELL + (seed % 2200);
    let pi = 0, id = null;
    const alive = () => document.body.contains(spot);
    const startProg = () => { if (!prog) return; prog.classList.remove('run'); void prog.offsetWidth; prog.style.setProperty('--dwell', dwell + 'ms'); prog.classList.add('run'); };
    const advance = () => { if (!alive()) return clearInterval(id); pi = (pi + 1) % track.children.length; track.style.transform = `translateX(-${pi * 100}%)`; startProg(); };
    startProg();
    setTimeout(() => { advance(); id = setInterval(advance, dwell); }, seed % 1800);
  }

  // service pills — drag-scroll + chevron arrows + edge fade
  const pills = spot.querySelector('.spot-pills');
  if (pills) {
    pills.addEventListener('click', e => e.stopPropagation());
    dragScroll(pills);
    const wrap = spot.querySelector('.spot-pills-wrap');
    const nextA = spot.querySelector('.spot-pills-arrow--next');
    const prevA = spot.querySelector('.spot-pills-arrow--prev');
    const sync = () => {
      const max = pills.scrollWidth - pills.clientWidth;
      const scrollable = max > 4, atStart = pills.scrollLeft <= 2, atEnd = pills.scrollLeft >= max - 2;
      nextA?.classList.toggle('is-hidden', !scrollable || atEnd);
      prevA?.classList.toggle('is-hidden', !scrollable || atStart);
      wrap?.classList.toggle('fade-right', scrollable && !atEnd);
      wrap?.classList.toggle('fade-left', scrollable && !atStart);
    };
    const nudge = (dir) => (e) => { e.stopPropagation(); pills.scrollBy({ left: dir * pills.clientWidth * 0.7, behavior: 'smooth' }); };
    nextA?.addEventListener('click', nudge(1)); prevA?.addEventListener('click', nudge(-1));
    pills.addEventListener('scroll', sync, { passive: true });
    requestAnimationFrame(sync); setTimeout(sync, 350); window.addEventListener('resize', sync);
  }
  // the Call link doesn't open the modal; the card itself does (handled globally)
  spot.querySelector('.spot-call')?.addEventListener('click', e => e.stopPropagation());
}

/* ---------- sticky "pin your location" bar ----------------- */
// ZIP centroid from THIS page's listings (the full dataset lives on the home page).
function zipCentroid(zip) {
  const pts = Object.values(DATA).filter(c => String(c.zip) === String(zip) && c.lat && c.lng);
  if (!pts.length) return null;
  return { lat: pts.reduce((a, c) => a + c.lat, 0) / pts.length, lng: pts.reduce((a, c) => a + c.lng, 0) / pts.length, label: 'ZIP ' + zip };
}
function reflectLoc() {
  const bar = $('#locBar'), t = $('#locTitle'), ll = $('#locLabel'), b = $('#locBtn');
  bar?.classList.toggle('is-located', !!userLoc);
  if (userLoc) {
    if (t) t.textContent = "You're all set";
    if (ll) ll.textContent = 'Distances from ' + (userLoc.label || 'your location');
    if (b) b.textContent = 'Change';
  } else {
    if (t) t.textContent = "See who's nearest you";
    if (ll) ll.textContent = 'Pin your location for distances & map directions';
    if (b) b.textContent = 'Use my location';
  }
}
function setUserLoc(loc) {
  userLoc = loc;
  try { localStorage.setItem('gacontractors:location', JSON.stringify(loc)); } catch { /* ignore */ }
  track('select_location', { method: String(loc.label || '').startsWith('ZIP') ? 'zip' : 'geo' });
  reflectLoc();
  refreshHeroUser();                 // drop the "you" pin on the hero map
  refreshPlaceUser();                // drop the "you" pin on the overview map
  spots.forEach(spotDistance);       // refresh the billboard distance chips
  refreshCardDistances();            // refresh the grid card distance badges
  gridReSorts.forEach(fn => fn());   // re-apply "Nearest" sort if active
}
function useMyLocation() {
  const b = $('#locBtn');
  if (!navigator.geolocation) { $('#zipInput')?.focus(); return; }
  if (b) b.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(
    pos => setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'your location' }),
    () => { const ll = $('#locLabel'); if (ll) ll.textContent = 'Location blocked. Enter your ZIP'; if (b) b.textContent = 'Use my location'; $('#zipInput')?.focus(); },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 6e5 });
}
// the user's ZIP follows them across pages: persisted, pre-filled, and "Go"
// navigates to that ZIP's place (their city page, or the ZIP page).
const ZIP_KEY = 'gacontractors:zip';
const savedZip = (() => { try { return localStorage.getItem(ZIP_KEY) || ''; } catch { return ''; } })();
if (savedZip && $('#zipInput')) $('#zipInput').value = savedZip;
// just arrived via "Go" on another page → pin the location to that ZIP's centroid
// (this destination page contains the ZIP's listings), so distances show on arrival.
(() => {
  let pending = ''; try { pending = sessionStorage.getItem('gacontractors:pendingzip') || ''; sessionStorage.removeItem('gacontractors:pendingzip'); } catch { /* ignore */ }
  if (pending) { const loc = zipCentroid(pending); if (loc) setUserLoc(loc); }
})();

reflectLoc();
// On phones the bottom tab bar is the single persistent bar — keep the floating
// location bar collapsed by default so they don't stack; "Nearby" opens it.
if (window.matchMedia('(max-width: 720px)').matches) { const lb = $('#locBar'); if (lb) lb.hidden = true; document.body.classList.add('locbar-dismissed'); }
refreshCardDistances();   // a location restored from localStorage → badge cards now
upgradeCardMaps();        // no-photo cards → live centred maps (lazy)
wireLinkTracking(() => lastOpen ? { listing_id: lastOpen.id, listing_name: lastOpen.name, city: lastOpen.cityName } : {});
$('#locBtn')?.addEventListener('click', useMyLocation);
$('#locClose')?.addEventListener('click', () => { $('#locBar').hidden = true; document.body.classList.add('locbar-dismissed'); });
$('#zipWrap')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const inp = $('#zipInput'); const zip = inp.value.trim();
  if (!/^\d{5}$/.test(zip)) { inp.setCustomValidity('Enter a 5-digit ZIP'); inp.reportValidity(); return; }
  try { localStorage.setItem(ZIP_KEY, zip); } catch { /* ignore */ }
  // If this page already covers the ZIP (its own ZIP page, or the ZIP's city),
  // pin the location HERE so the user shows on the map next to the contractors.
  const loc = zipCentroid(zip);
  if (loc) { setUserLoc(loc); return; }
  // Otherwise take them to that ZIP's place (their city page, or the ZIP page),
  // and re-pin on arrival.
  const dest = ZIP_INDEX[zip];
  if (dest && dest !== location.pathname) {
    try { sessionStorage.setItem('gacontractors:pendingzip', zip); } catch { /* ignore */ }
    track('zip_go', { zip, dest });
    location.href = dest; return;
  }
  inp.setCustomValidity('No contractors found for that ZIP'); inp.reportValidity();
});
$('#zipInput')?.addEventListener('input', () => $('#zipInput').setCustomValidity(''));

// bottom-tab "Nearby" — reveal the location bar (also acts as its reopen) + locate
$('#tabNearby')?.addEventListener('click', () => {
  const bar = $('#locBar'); if (bar) { bar.hidden = false; document.body.classList.remove('locbar-dismissed'); }
  useMyLocation();
});
