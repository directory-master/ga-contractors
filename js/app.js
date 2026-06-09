// ============================================================
//  Contractor — streaming-style discovery for GA builders.
//  Prime Video billboard + rails, YouTube top bar / chips /
//  thumbnail cards. Pure vanilla ES module, no deps.
//  The ONLY external input is the listings dataset.
// ============================================================
import { IMPORTED } from './data/contractors-imported.js';
import { FEATURED } from './data/featured.js';
import { CITY_COUNTY, countySlug } from './data/ga-counties.js';
// shared, reusable helpers — single source of truth (js/shared/), also imported
// by the generator and page.js.
import { esc, hash, initials, ratingScore, fmtMi, milesBetween } from './shared/format.mjs';
import { colorFor, tintedBg } from './shared/palette.mjs';
import { tileUrl } from './shared/geo.mjs';
import { SPOT_SPRITE, spotUse } from './shared/icons.mjs';
import { loadLeaflet, mapPin, observeCardMap } from './shared/maps.mjs';
import { cardHTML, spotCardHTML, claimCardHTML, placetileHTML, CLAIM_EMAIL } from './shared/components.mjs';
import { track, wireLinkTracking } from './shared/analytics.mjs';

/* ---------- 1. Prepare the data ---------------------------- */

const $  = (s, r = document) => r.querySelector(s);
const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
// parse a shared component's HTML string into a live DOM node (then hydrate it)
const nodeFrom = (html) => { const t = el('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

// (palette / colour / stock / pin / tile / initials / score helpers now come from
// js/shared/ — see the imports above.)
// hero/poster background: photo → its own static map tile → solid colour
const mediaBg = (c) => c._hasImg ? `url("${c._img}")` : (c.lat && c.lng ? `url("${tileUrl(c.lat, c.lng)}")` : tintedBg(c.id, 'cc'));

// Normalise + enrich every listing once. `_img` is the best usable image:
// a real http photo, or the first gallery image (paid example listings).
const imgOf = (c) => (typeof c.image === 'string' && /^https?:/.test(c.image)) ? c.image
  : (Array.isArray(c.images) && c.images[0]) || null;
const enrich = (c) => ({ ...c, _score: ratingScore(c), _img: imgOf(c), _hasImg: !!imgOf(c),
  _search: `${c.name} ${c.type} ${c.cityName} ${c.zip || ''}`.toLowerCase() });

const ALL  = IMPORTED.map(enrich);
const FEAT = FEATURED.map(enrich);    // showcase-only EXAMPLE paid listings (never in ALL/search)
// Randomise each paid tier's order once per load — most visitors never scroll the
// row sideways, so a random lead card gives every listing a turn at the front.
const shuffleOnce = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const FEAT_BY_TIER = { premium: shuffleOnce(FEAT.filter(c => c.tier === 'premium')), standard: shuffleOnce(FEAT.filter(c => c.tier === 'standard')) };

const byCount = (arr, key) => {
  const m = new Map();
  for (const c of arr) { const k = c[key]; if (!k) continue; (m.get(k) || m.set(k, []).get(k)).push(c); }
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
};

const TYPES  = byCount(ALL, 'type');
const CITIES = byCount(ALL, 'cityName');
const RATED  = ALL.filter(c => c.rating).sort((a, b) => b._score - a._score);
const WITHIMG = ALL.filter(c => c._hasImg);
const FRESH = shuffle(WITHIMG).slice(0, 24);   // stable per session

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

/* ---------- 2. Build the rail line-up ---------------------- */
// A "row" = { id, title, sub, items }. Mirrors Prime Video rails.

// A rail viewport (track + prev/next arrows) around any set of card nodes.
// `trackClass` lets callers swap the track layout (e.g. a 2-row grid for Browse).
function railViewport(nodes, trackClass) {
  const vp = el('div', 'rail__viewport');
  const track = el('div', 'rail__track' + (trackClass ? ' ' + trackClass : ''));
  nodes.forEach(n => track.append(n));
  const prev = el('button', 'rail__nav rail__nav--prev'); prev.innerHTML = '<span>‹</span>';
  const next = el('button', 'rail__nav rail__nav--next'); next.innerHTML = '<span>›</span>';
  prev.addEventListener('click', () => track.scrollBy({ left: -track.clientWidth * 0.85, behavior: 'smooth' }));
  next.addEventListener('click', () => track.scrollBy({ left:  track.clientWidth * 0.85, behavior: 'smooth' }));
  // hide the arrow you can't use: prev at the very start, next at the very end
  const update = () => {
    prev.classList.toggle('is-hidden', track.scrollLeft <= 2);
    next.classList.toggle('is-hidden', track.scrollLeft + track.clientWidth >= track.scrollWidth - 2);
  };
  track.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  requestAnimationFrame(update); setTimeout(update, 250);
  vp.append(prev, track, next);
  return vp;
}

// Netflix-style numbered "Top 10 in Georgia" — statewide by reviewer score.
function renderTop10() {
  const sec = el('section', 'rail top10');
  const head = el('div', 'rail__head');
  head.innerHTML = `<h2 class="rail__title">Top 10 in <span class="accent">Georgia</span></h2><span class="rail__sub">The highest-rated contractors statewide</span>`;
  sec.append(head);
  const items = RATED.slice(0, 10).map((c, i) => {
    const w = el('div', 'top10__item');
    const n = el('span', 'top10__num'); n.textContent = i + 1;
    w.append(n, renderCard(c));
    return w;
  });
  sec.append(railViewport(items));
  return sec;
}

// "Claim this spot" CTA — the LAST card in each tier row (shared component).
function claimCardEl(tier, place = 'Georgia') {
  const c = nodeFrom(claimCardHTML(tier, place));
  c.querySelector('.claim__btn').addEventListener('click', e => e.stopPropagation());
  return c;
}

/* ---------- Featured SPOTLIGHT (premium) ------------------- */
// One large billboard that pages through the premium listings (bottom-right dots,
// gentle auto-advance). Inside: a perk ticker with a progress bar + scrollable
// service pills. Replaces the old row of nested-carousel premium cards.
const SPOT_DWELL = 3800;   // per-perk dwell (ms)

// SVG icon sprite (injected once) — the shared sprite from js/shared/icons.mjs.
// `spotUse` and `perkIcon` are imported from there too.
function ensureSpotSprite() {
  if (document.getElementById('spot-sprite')) return;
  const t = el('template'); t.innerHTML = SPOT_SPRITE;
  document.body.append(t.content.firstChild);
}

// One Spotlight billboard for a SINGLE contractor. Markup = the SHARED spotCardHTML
// component (same as the generated pages); here we hydrate it: the distance chip,
// the perk ticker, the scrollable service pills, and the open-modal handlers.
function renderSpotlightCard(c, showPerks = true) {
  ensureSpotSprite();
  const spot = nodeFrom(spotCardHTML(c, showPerks));
  spot._c = c;

  // distance chip — omitted from the shared markup, added when a location is known
  const mi = distMi(c);
  if (mi != null) { const chip = el('span', 'spot-mi'); chip.innerHTML = `${spotUse('si-pin')} ${esc(fmtMi(mi))}`; spot.querySelector('.spot-bar-left').append(chip); }

  // inner perk ticker — auto-advances with a progress bar. Each card gets its own
  // dwell + a staggered start so the three never tick in lockstep.
  const track = spot.querySelector('.spot-track');
  if (track && track.children.length > 1) {
    const prog = spot.querySelector('.spot-prog i');
    const seed = hash(c.id);
    const dwell = SPOT_DWELL + (seed % 2200);   // 3.8–6.0s, varies per card
    let pi = 0, id = null;
    const alive = () => document.body.contains(spot);
    const startProg = () => { prog.classList.remove('run'); void prog.offsetWidth; prog.style.setProperty('--dwell', dwell + 'ms'); prog.classList.add('run'); };
    const advance = () => { if (!alive()) return clearInterval(id); pi = (pi + 1) % track.children.length; track.style.transform = `translateX(-${pi * 100}%)`; startProg(); };
    startProg();
    setTimeout(() => { advance(); id = setInterval(advance, dwell); }, seed % 1800);   // staggered first flip
  }

  // call + pills don't open the modal; the card does
  spot.querySelector('.spot-call')?.addEventListener('click', e => e.stopPropagation());
  const pills = spot.querySelector('.spot-pills');
  if (pills) {
    pills.addEventListener('click', e => e.stopPropagation());
    dragScroll(pills);
    // chevron hints: the next arrow shows while there's more to the right, the prev
    // arrow once you've scrolled; the edge fade follows the same state.
    const pillsWrap = spot.querySelector('.spot-pills-wrap');
    const nextA = spot.querySelector('.spot-pills-arrow--next');
    const prevA = spot.querySelector('.spot-pills-arrow--prev');
    const syncArrows = () => {
      const max = pills.scrollWidth - pills.clientWidth;
      const scrollable = max > 4, atStart = pills.scrollLeft <= 2, atEnd = pills.scrollLeft >= max - 2;
      nextA?.classList.toggle('is-hidden', !scrollable || atEnd);
      prevA?.classList.toggle('is-hidden', !scrollable || atStart);
      pillsWrap.classList.toggle('fade-right', scrollable && !atEnd);
      pillsWrap.classList.toggle('fade-left', scrollable && !atStart);
    };
    const nudge = (dir) => (e) => { e.stopPropagation(); pills.scrollBy({ left: dir * pills.clientWidth * 0.7, behavior: 'smooth' }); };
    nextA?.addEventListener('click', nudge(1)); prevA?.addEventListener('click', nudge(-1));
    pills.addEventListener('scroll', syncArrows, { passive: true });
    requestAnimationFrame(syncArrows); setTimeout(syncArrows, 350); window.addEventListener('resize', syncArrows);
  }
  const open = () => openModal(c);
  spot.addEventListener('click', open);
  spot.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
  return spot;
}

// drag-to-scroll for a horizontal strip (service pills)
function dragScroll(elm) {
  let down = false, x = 0, sl = 0;
  elm.addEventListener('pointerdown', e => { down = true; elm.classList.add('drag'); x = e.pageX; sl = elm.scrollLeft; elm.setPointerCapture(e.pointerId); });
  elm.addEventListener('pointermove', e => { if (down) elm.scrollLeft = sl - (e.pageX - x); });
  const up = () => { down = false; elm.classList.remove('drag'); };
  elm.addEventListener('pointerup', up); elm.addEventListener('pointercancel', up);
}

// Featured (premium) / Standard tier sections — example paid listings, claim card LAST.
// Premium cards are full SPOTLIGHT billboards; Standard are compact mini posters
// (same text-on-photo look, ~half the size, no perks/desc/pills). Both scroll.
function renderTierSection(tier) {
  const sec = el('section', 'rail rail--' + tier);
  const lab = el('div', 'tier-row-label'); lab.textContent = tier === 'premium' ? 'Featured placement' : 'Standard listings';
  sec.append(lab);
  const head = el('div', 'rail__head');
  head.innerHTML = `<h2 class="rail__title">${tier === 'premium' ? 'Featured' : 'Standard'} <span class="accent">contractors</span></h2>
    <span class="rail__sub">${tier === 'premium' ? 'Pinned above every listing in Georgia' : 'Enhanced listings with photos &amp; links'}</span>`;
  sec.append(head);
  const nodes = [...FEAT_BY_TIER[tier].map(c => renderSpotlightCard(c, tier === 'premium')), claimCardEl(tier)];
  sec.append(railViewport(nodes));
  return sec;
}

// Browse Georgia — a big statewide feature card on the left, then the top cities
// as mini-map tiles in TWO scrolling rows, then the city/county/ZIP index buttons.
function renderBrowse() {
  const sec = el('section', 'rail rail--browse');
  const head = el('div', 'rail__head');
  head.innerHTML = `<h2 class="rail__title">Browse <span class="accent">Georgia</span></h2><span class="rail__sub">Jump to a city, or explore by county &amp; ZIP</span>`;
  sec.append(head);

  // big feature card on the left — the statewide entry point
  const hero = el('a', 'browse__hero'); hero.href = '/cities/';
  hero.style.backgroundImage = `linear-gradient(0deg, rgba(13,19,34,.92) 6%, rgba(13,19,34,.38) 52%, rgba(13,19,34,.12)), url("${tileUrl(32.9, -83.45, 6)}")`;
  hero.innerHTML = `<span class="browse__hero-eyebrow">All of Georgia</span>
    <span class="browse__hero-name">${ALL.length.toLocaleString()} licensed contractors</span>
    <span class="browse__hero-cta">Explore every city →</span>`;

  // top cities → two rows of mini-map tiles that scroll horizontally (shared component)
  const tiles = CITIES.slice(0, 24).map(([name, list]) =>
    nodeFrom(placetileHTML({ href: `/${list[0].city}/`, name, count: list.length, ...coordOf(list), z: 11 })));

  const layout = el('div', 'browse__layout');
  layout.append(hero, railViewport(tiles, 'rail__track--grid2'));
  sec.append(layout);

  const explore = el('div', 'browse__explore');
  explore.innerHTML = `<a class="btn btn--solid" href="/cities/">All cities →</a>
    <a class="btn btn--ghost" href="/counties/">By county →</a>
    <a class="btn btn--ghost" href="/zips/">By ZIP code →</a>`;
  sec.append(explore);
  return sec;
}

/* ---------- Browse sheet (iOS-style: tabs + map tiles) ----- */
const browseTile = (t) => nodeFrom(placetileHTML(t));   // same shared component as the hubs + home rail
let browseSeg = 'cities', browseQ = '';
function renderBrowseGrid() {
  const grid = $('#browseGrid'); if (!grid) return;
  const q = browseQ.trim().toLowerCase();
  const items = BROWSE[browseSeg].filter(t => !q || t.name.toLowerCase().includes(q));
  grid.innerHTML = '';
  if (!items.length) { grid.innerHTML = '<p class="sheet__empty">No matches — try another spelling.</p>'; return; }
  const frag = document.createDocumentFragment();
  items.slice(0, 400).forEach(t => frag.append(browseTile(t)));
  grid.append(frag);
}
function openBrowse() { $('#browseSheet').hidden = false; document.body.style.overflow = 'hidden'; renderBrowseGrid(); }
function closeBrowse() { $('#browseSheet').hidden = true; document.body.style.overflow = ''; }

const pickBest = (list) => [...list].sort((a, b) =>
  (b._hasImg - a._hasImg) || (b._score - a._score) || (b.reviews || 0) - (a.reviews || 0));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (hash('s' + i) % (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ---------- 3. Card + rail rendering ----------------------- */

// Build a DOM node from the SHARED card component (same markup the generator
// emits), then hydrate it: the distance badge, the live-map upgrade for no-photo
// cards (centred marker, + user pin/line when located), and the open-modal handlers.
function renderCard(c) {
  const card = nodeFrom(cardHTML(c));
  const thumb = card.querySelector('.card__thumb');
  const mi = distMi(c);
  if (mi != null) { const d = el('span', 'card__dist'); d.textContent = `📍 ${fmtMi(mi)}`; thumb.append(d); }
  const ph = card.querySelector('.card__ph--map');
  if (ph && c.lat && c.lng) observeCardMap(ph, c, () => userLoc);
  const open = () => openModal(c);
  card.addEventListener('click', open);
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
  return card;
}

/* ---------- premium card carousel (before the modal) ------- */
// `openStatus` / `fmtClock` come from js/shared/format.mjs.

function renderRail(row) {
  const rail = el('section', 'rail' + (row.variant ? ' rail--' + row.variant : ''));
  const head = el('div', 'rail__head');
  head.innerHTML = `<h2 class="rail__title">${esc(row.title).replace(esc(row.accent), `<span class="accent">${esc(row.accent)}</span>`)}</h2>
                    <span class="rail__sub">${esc(row.sub)}</span>`;
  rail.append(head);
  rail.append(railViewport(row.items.map(renderCard)));
  return rail;
}

/* ---------- 4. Hero billboard (auto-rotating) -------------- */

const HERO_PICKS = RATED.filter(c => c._hasImg).slice(0, 6).length >= 3
  ? RATED.filter(c => c._hasImg).slice(0, 6)
  : pickBest(WITHIMG).slice(0, 6);
let heroIdx = 0, heroTimer = null;

function renderHero(i) {
  const c = HERO_PICKS[i]; if (!c) return;
  const hero = $('#hero'); hero.hidden = false;
  const bg = mediaBg(c);
  // ambient blurred fill (desktop) + mobile cover
  $('#heroMedia').style.backgroundImage = bg;
  // the sharp, properly-scaled "poster" that sits on top of the map (desktop)
  $('#heroPoster').style.backgroundImage = bg;
  // map backdrop centred on this contractor (desktop only; lazy Leaflet)
  updateHeroMap(c);
  hero.classList.remove('is-anim'); void hero.offsetWidth; hero.classList.add('is-anim');

  $('#heroTitle').textContent = c.name;
  const meta = $('#heroMeta'); meta.innerHTML = '';
  if (c.rating) meta.append(pill(`★ ${c.rating}${c.reviews ? ` · ${c.reviews} reviews` : ''}`, 'pill--rate'));
  meta.append(pill(c.type), pill(c.cityName, ''));
  if (c.licensed) meta.append(pill('Licensed & Insured'));

  $('#heroDesc').textContent = c.hoursText
    ? `${c.address || c.cityName + ', GA'} · ${c.hoursText}`
    : (c.address || `Serving ${c.cityName} and nearby Georgia communities.`);

  const acts = $('#heroActions'); acts.innerHTML = '';
  const view = el('button', 'btn btn--primary'); view.innerHTML = '▶ &nbsp;View details';
  view.onclick = () => openModal(c); acts.append(view);
  if (c.phone) { const call = el('a', 'btn btn--ghost'); call.href = 'tel:' + c.phone.replace(/[^\d+]/g, ''); call.textContent = '📞 ' + c.phone; acts.append(call); }

  renderDots();
}
const pill = (txt, cls = '') => { const s = el('span', 'pill ' + cls); s.textContent = txt; return s; };
function renderDots() {
  const dots = $('#heroDots'); dots.innerHTML = '';
  HERO_PICKS.forEach((_, i) => { const b = el('button'); if (i === heroIdx) b.className = 'is-active';
    b.onclick = () => { heroIdx = i; renderHero(i); restartHero(); }; dots.append(b); });
}
function restartHero() { clearInterval(heroTimer); heroTimer = setInterval(() => { heroIdx = (heroIdx + 1) % HERO_PICKS.length; renderHero(heroIdx); }, 6500); }

// Map backdrop for the hero (wide screens only): one Leaflet instance, panned
// to the current contractor on each rotation. Non-interactive — purely a
// backdrop behind the contained photo "poster". Lazy-loads Leaflet.
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
    // "you" pin — added/refreshed whenever a location is known, so the user
    // always appears on the map alongside the featured contractor.
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
// re-render the hero map when the user pins/updates their location
function refreshHeroUser() { if (heroMap) updateHeroMap(HERO_PICKS[heroIdx]); }

/* ---------- 5. Detail modal -------------------------------- */

let lastOpen = null;   // current modal listing — analytics context for call/website/lead
function openModal(c) {
  lastOpen = c;
  track('view_listing', { listing_id: c.id, listing_name: c.name, city: c.cityName, item_category: c.type, tier: c.tier || 'free' });
  const m = $('#modal'); m.hidden = false; document.body.style.overflow = 'hidden';
  const heroEl = $('#mHero'); heroEl.className = 'modal__hero'; heroEl.style.backgroundImage = ''; heroEl.innerHTML = '';

  // Paid listings get the gallery carousel + a distance map slide; a listing with
  // a photo shows it; a listing with NO photo shows a live map of its location
  // (with the user pin + distance when known) instead of a stock image.
  const paid = c.tier === 'premium' || c.tier === 'standard';
  if (paid && Array.isArray(c.images) && c.images.length) { buildCarousel(heroEl, c); }
  else if (c._img) { heroEl.classList.add('mphoto'); heroEl.append(photoLayers(c._img, c.name)); }
  else if (c.lat && c.lng) { mapView(heroEl, c); }
  else { heroEl.style.background = colorFor(c.id); heroEl.innerHTML = `<span class="ph">${initials(c.name)}</span>`; }

  $('#mTitle').textContent = c.name;
  $('#mMeta').textContent = `${c.type} · ${c.address || c.cityName + ', GA'}`;

  const badges = $('#mBadges'); badges.innerHTML = '';
  if (c.rating) { const rt = tag('', 'tag--rate'); rt.innerHTML = `${spotUse('si-star')} ${esc(String(c.rating))}${c.reviews ? ` (${c.reviews})` : ''}`; badges.append(rt); }
  badges.append(tag(c.type, 'tag--type'));
  if (c.licensed) badges.append(tag('Licensed & Insured', 'tag--lic'));
  if (c.hoursText) badges.append(tag(c.hoursText));

  const acts = $('#mActions'); acts.innerHTML = '';
  // Example/demo listings carry placeholder phone/website — show a claim CTA, never
  // a working call/website/directions to fake details.
  if (c.example) {
    acts.append(iconLink('si-check', 'Claim this listing', `mailto:${CLAIM_EMAIL}?subject=${encodeURIComponent('Claim a featured placement')}`, 'btn--primary btn--wide'));
  } else {
    if (c.phone)   acts.append(iconLink('si-phone', 'Call', 'tel:' + c.phone.replace(/[^\d+]/g, ''), 'btn--primary'));
    if (c.website) acts.append(iconLink('si-globe', 'Website', c.website, 'btn--solid'));
    const maps = c.lat && c.lng ? `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}` :
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.name + ' ' + (c.address || c.cityName))}`;
    acts.append(iconLink('si-compass', 'Directions', maps, 'btn--ghost btn--wide'));
  }

  const facts = $('#mFacts'); facts.innerHTML = '';
  const add = (k, v) => { if (!v) return; const dt = el('dt'); dt.textContent = k; const dd = el('dd'); dd.innerHTML = v; facts.append(dt, dd); };
  if (c.example) {
    if (c.description) add('About', esc(c.description));
    add('Hours', c.hoursText ? esc(c.hoursText) : '');
  } else {
    add('Phone', c.phone ? `<a href="tel:${c.phone.replace(/[^\d+]/g, '')}">${esc(c.phone)}</a>` : '');
    add('Address', esc(c.address || `${c.cityName}, GA ${c.zip || ''}`));
    const mi = distMi(c);
    add('Distance', mi != null ? `${fmtMi(mi)} from ${esc(userLoc.label || 'you')}` : '');
    add('Website', c.website ? `<a href="${c.website}" target="_blank" rel="noopener noreferrer">${esc(c.website.replace(/^https?:\/\//, ''))}</a>` : '');
    const socials = [['Facebook', c.facebook], ['Instagram', c.instagram], ['Twitter', c.twitter]]
      .filter(([, u]) => u).map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${n}</a>`).join(' · ');
    add('Social', socials);
    add('Hours', c.hoursText ? esc(c.hoursText) : '');
  }
}
function closeModal() { $('#modal').hidden = true; document.body.style.overflow = ''; }

// iOS sheet: drag the grabber down to dismiss (mobile); a tap closes; small drag snaps back.
function enableSheetSwipe(modalSel, closeFn) {
  const panel = document.querySelector(`${modalSel} .modal__panel`);
  const grab = panel?.querySelector('.modal__grab');
  if (!panel || !grab) return;
  let y0 = null, moved = 0;
  grab.style.touchAction = 'none';
  grab.addEventListener('pointerdown', (e) => { y0 = e.clientY; moved = 0; panel.style.transition = 'none'; try { grab.setPointerCapture(e.pointerId); } catch { /* ignore */ } });
  grab.addEventListener('pointermove', (e) => { if (y0 == null) return; moved = Math.max(0, e.clientY - y0); panel.style.transform = `translateY(${moved}px)`; });
  const end = () => {
    if (y0 == null) return; y0 = null; panel.style.transition = 'transform .25s ease';
    if (moved > 110) { panel.style.transform = 'translateY(110%)'; setTimeout(() => { closeFn(); panel.style.transform = ''; panel.style.transition = ''; }, 200); }
    else { panel.style.transform = ''; if (moved < 6) closeFn(); }
  };
  grab.addEventListener('pointerup', end); grab.addEventListener('pointercancel', end);
}

// A no-photo listing's modal media = a live map of its location (+ user pin /
// distance when known). Reuses initMiniMap.
function mapView(host, c) {
  host.classList.add('mcarousel');
  const tag = (userLoc && c.lat && c.lng) ? `${fmtMi(milesBetween(userLoc, c))} from your location` : 'Contractor location';
  host.innerHTML = `<div class="mcar__map" id="mMap"></div><span class="mcar__maptag">${spotUse('si-pin')} ${esc(tag)}</span>`;
  initMiniMap(c);
}

// Full image shown over an ambient blurred copy of itself (no cropping) — the
// premium "poster" treatment used by both the single-photo hero and the carousel.
function photoLayers(src, alt) {
  const frag = document.createDocumentFragment();
  const bg = el('div', 'mphoto__bg'); bg.style.backgroundImage = `url("${src}")`;
  const im = el('img', 'mphoto__img'); im.src = src; im.alt = alt || ''; im.loading = 'lazy'; im.referrerPolicy = 'no-referrer';
  frag.append(bg, im);
  return frag;
}

/* ---------- paid gallery carousel + distance map ----------- */
function buildCarousel(host, c) {
  host.classList.add('mcarousel');
  const imgs = (c.images || []).slice();
  const mapIdx = Math.floor((imgs.length + 1) / 2);   // map sits in the MIDDLE of the carousel
  const track = el('div', 'mcar__track');
  const addImg = (src) => { const s = el('div', 'mcar__slide'); s.append(photoLayers(src, c.name)); track.append(s); };
  const tag = (userLoc && c.lat && c.lng)
    ? `${fmtMi(milesBetween(userLoc, c))} from your location`
    : 'Pin your location below for distance';
  const addMap = () => { const s = el('div', 'mcar__slide mcar__slide--map');
    s.innerHTML = `<div class="mcar__map" id="mMap"></div><span class="mcar__maptag">${spotUse('si-pin')} ${esc(tag)}</span>`; track.append(s); };
  imgs.forEach((src, i) => { if (i === mapIdx) addMap(); addImg(src); });
  if (mapIdx >= imgs.length) addMap();                 // few images → map ends up last
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

// loadLeaflet + mapPin come from js/shared/maps.mjs.
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
const tag = (txt, cls = '') => { const s = el('span', 'tag ' + cls); s.textContent = txt; return s; };
const btnLink = (txt, href, cls) => { const a = el('a', 'btn ' + cls); a.href = href; a.textContent = txt;
  if (/^(https?|mailto):/.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } return a; };
// icon + label link button (SVG icon, no emoji)
const iconLink = (iconId, label, href, cls) => { const a = btnLink('', href, cls); a.innerHTML = `${spotUse(iconId)} <span>${esc(label)}</span>`; return a; };

/* ---------- 6. Chips + search ------------------------------ */

let activeChip = 'all';
function renderChips() {
  const chips = $('#chips'); chips.innerHTML = '';
  const defs = [['all', 'All'], ['top', 'Top Rated'],
    ...TYPES.map(([t]) => ['type:' + t, t])];
  for (const [key, label] of defs) {
    const b = el('button', 'chip' + (key === activeChip ? ' is-active' : ''));
    b.textContent = label; b.dataset.key = key;
    b.onclick = () => { activeChip = key; renderChips(); applyChip(key); };
    chips.append(b);
  }
}
function applyChip(key) {
  $('#searchInput').value = '';
  if (key === 'all') return showRows();
  if (key === 'top') return showResults('Top Rated in Georgia', RATED);
  if (key.startsWith('type:')) { const t = key.slice(5); return showResults(t, pickBest(ALL.filter(c => c.type === t))); }
}

function runSearch(q) {
  q = q.trim().toLowerCase();
  if (!q) { activeChip = 'all'; renderChips(); return showRows(); }
  const terms = q.split(/\s+/);
  const hits = pickBest(ALL.filter(c => terms.every(t => c._search.includes(t))));
  track('search', { search_term: q, results: hits.length });
  showResults(`Results for “${q}”`, hits);
}

/* ---------- 7. View switching ------------------------------ */

function showRows() {
  $('#hero').hidden = false; $('#rows').hidden = false; $('#results').hidden = true;
  redraw = () => showRows();
  const rows = $('#rows'); rows.innerHTML = '';
  const frag = document.createDocumentFragment();
  if (userLoc) frag.append(renderRail({ id: 'near', variant: 'near', title: 'Nearest to You', accent: 'Nearest',
    sub: 'Closest contractors to your location', items: nearestItems(24) }));
  frag.append(renderTop10());
  frag.append(renderTierSection('premium'));
  frag.append(renderTierSection('standard'));
  frag.append(renderRail({ id: 'fresh', variant: 'fresh', title: 'Fresh This Morning', accent: 'Fresh',
    sub: 'A handpicked mix to start your search', items: FRESH }));
  frag.append(renderBrowse());
  rows.append(frag);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Paginated results: 20 per page, "View more" appends the next 20.
const PAGE = 20;
function showResults(title, items) {
  $('#hero').hidden = true; $('#rows').hidden = true;
  const sec = $('#results'); sec.hidden = false;
  redraw = () => showResults(title, items);
  const grid = $('#resultsGrid'); grid.innerHTML = '';
  const head = $('#resultsHead'); const more = $('#viewMore');
  if (!items.length) {
    head.textContent = `${title} · 0`;
    grid.innerHTML = '<p class="empty">No builders match yet. Try another trade or city.</p>';
    if (more) more.hidden = true;
    window.scrollTo({ top: 0, behavior: 'smooth' }); return;
  }
  let shown = 0;
  const renderNext = () => {
    const frag = document.createDocumentFragment();
    items.slice(shown, shown + PAGE).forEach(c => frag.append(renderCard(c)));
    grid.append(frag); shown = Math.min(shown + PAGE, items.length);
    head.textContent = `${title} · showing ${shown.toLocaleString()} of ${items.length.toLocaleString()}`;
    if (more) more.hidden = shown >= items.length;
  };
  if (more) more.onclick = renderNext;
  renderNext();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- geolocation controls --------------------------- */
function reflectLoc() {
  const bar = $('#locBar'), t = $('#locTitle'), ll = $('#locLabel'), b = $('#locBtn');
  bar?.classList.toggle('is-located', !!userLoc);
  if (userLoc) {
    if (t)  t.textContent  = "You're all set";
    if (ll) ll.textContent = 'Distances from ' + (userLoc.label || 'your location');
    if (b)  b.textContent  = 'Change';
  } else {
    if (t)  t.textContent  = "See who's nearest you";
    if (ll) ll.textContent = 'Pin your location for distances & map directions';
    if (b)  b.textContent  = 'Use my location';
  }
}
function setUserLoc(loc) {
  userLoc = loc;
  try { localStorage.setItem('gacontractors:location', JSON.stringify(loc)); } catch { /* ignore */ }
  track('select_location', { method: String(loc.label || '').startsWith('ZIP') ? 'zip' : 'geo' });
  reflectLoc();
  redraw();
  refreshHeroUser();   // drop the "you" pin onto the hero map right away
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

/* ---------- 8. Wire up ------------------------------------- */

function init() {
  // restore a previously shared location (same key the place-page maps use)
  try { const s = JSON.parse(localStorage.getItem('gacontractors:location') || 'null'); if (s && s.lat && s.lng) userLoc = s; } catch { /* ignore */ }

  ensureSpotSprite();   // make the SVG icon set available everywhere (cards, modal)
  wireLinkTracking(() => lastOpen ? { listing_id: lastOpen.id, listing_name: lastOpen.name, city: lastOpen.cityName } : {});
  renderChips();
  renderHero(0); restartHero();
  showRows();

  reflectLoc();
  $('#locBtn')?.addEventListener('click', useMyLocation);
  // dismiss → collapse to the floating reopen button (don't vanish forever)
  $('#locClose')?.addEventListener('click', () => {
    $('#locBar').hidden = true; $('#locReopen').hidden = false;
    document.body.classList.add('locbar-dismissed');
  });
  $('#locReopen')?.addEventListener('click', () => {
    $('#locReopen').hidden = true; $('#locBar').hidden = false;
    document.body.classList.remove('locbar-dismissed');
  });
  // pre-fill the ZIP the user pinned last (shared with the place pages)
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

  $('#brandHome').addEventListener('click', (e) => { e.preventDefault(); activeChip = 'all'; renderChips(); showRows(); });
  $('#scrollTopBtn').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

  $('#modal').addEventListener('click', (e) => { if (e.target.dataset.close !== undefined) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeBrowse(); } });

  // Browse sheet: tab open, segmented switch, live filter, close
  $('#browseSheet')?.addEventListener('click', (e) => { if (e.target.dataset.bclose !== undefined) closeBrowse(); });
  $('#browseSeg')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-seg]'); if (!b) return;
    browseSeg = b.dataset.seg;
    $('#browseSeg').querySelectorAll('.seg__btn').forEach(x => x.classList.toggle('is-active', x === b));
    $('#browseSearch').value = ''; browseQ = ''; renderBrowseGrid();
    $('#browseGrid').scrollIntoView?.({ block: 'nearest' });
  });
  $('#browseSearch')?.addEventListener('input', (e) => { browseQ = e.target.value; renderBrowseGrid(); });

  enableSheetSwipe('#modal', closeModal);

  // bottom tab bar (mobile)
  const setTab = (id) => document.querySelectorAll('.tabbar__item').forEach(t => t.classList.toggle('is-active', t.id === id));
  $('#tabHome')?.addEventListener('click', () => { setTab('tabHome'); activeChip = 'all'; renderChips(); showRows(); });
  $('#tabSearch')?.addEventListener('click', () => { setTab('tabSearch'); window.scrollTo({ top: 0, behavior: 'smooth' }); setTimeout(() => $('#searchInput')?.focus(), 220); });
  $('#tabBrowse')?.addEventListener('click', () => { setTab('tabBrowse'); openBrowse(); });
  $('#tabNearby')?.addEventListener('click', () => {
    setTab('tabNearby');
    // phones: geolocate directly (the floating location bar is hidden on mobile);
    // desktop: also surface the bar so ZIP entry stays available.
    if (!window.matchMedia('(max-width: 720px)').matches && $('#locBar')?.hidden) {
      $('#locReopen').hidden = true; $('#locBar').hidden = false; document.body.classList.remove('locbar-dismissed');
    }
    useMyLocation();
  });

  $('#footMeta').textContent = `${ALL.length.toLocaleString()} listings · ${CITIES.length} Georgia cities · ${TYPES.length} trades`;
}

init();
