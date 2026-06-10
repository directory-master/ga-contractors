// ============================================================
//  GA.Contractors — static page generator (streaming UI).
//  Emits one crawlable, server-rendered page per city / county /
//  ZIP, in the same Prime-Video × YouTube look as the homepage
//  SPA. Thin places (< MIN_LISTINGS) fold by radius into the
//  nearest qualifying city. Each place page mirrors the home
//  storefront: a Premium row, then a Standard row, then the full
//  "all contractors" grid (images-first). No per-trade rails.
//
//  Algorithms (centroid + haversine absorption, tier ordering,
//  county rollup, SEO head/JSON-LD) are ported from the sibling
//  ~/contractors/scripts/generate-pages.mjs and re-skinned.
//
//  Run: npm run build:pages   (node scripts/generate-pages.mjs)
//  Writes clean-URL folders at the repo root. Does NOT prune.
// ============================================================
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { IMPORTED } from '../js/data/contractors-imported.js';
import { FEATURED } from '../js/data/featured.js';
import { CITY_COUNTY, countySlug } from '../js/data/ga-counties.js';
// shared, reusable helpers — the single source of truth, also imported by
// js/app.js and js/page.js (no duplicated copies).
import { esc, slugify, hash, initials, ratingScore, telHref, openStatus, fmtClock } from '../js/shared/format.mjs';
import { PALETTE, colorFor, STOCK, stockFor, tintedBg } from '../js/shared/palette.mjs';
import { tileUrl, PIN_SVG } from '../js/shared/geo.mjs';
import { SPOT_SPRITE, spotUse, perkIcon } from '../js/shared/icons.mjs';
import { CLAIM_EMAIL, cardHTML, claimCardHTML, ownCardHTML, spotCardHTML, placetileHTML } from '../js/shared/components.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const ASSET_VER = encodeURIComponent(VERSION);
const BASE_URL = 'https://gac.artivicolab.com';
const SITE_NAME = 'GA.Contractors';
const GA_ID = 'G-9YDPWCQBVT';   // GA4 — also referenced by js/shared/analytics.mjs
const GTAG = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');</script>`;
const MIN_LISTINGS = 5;   // a place earns its own page at >= 5 listings
const MAX_ABSORB_MI = 40; // thin place folds into the nearest qualifying city within this radius

/* ---------- generator-only helpers ------------------------- */
const hasImg = (c) => typeof c.image === 'string' && /^https?:/.test(c.image);
const mapsHref = (c) => c.lat && c.lng
  ? `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`
  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.name + ' ' + (c.address || c.cityName))}`;

const TIER_ORDER = { premium: 0, standard: 1, free: 2 };
// rank: paid tier first, then real photo, then reviewer score
const byRank = (list) => [...list].sort((a, b) =>
  (TIER_ORDER[a.tier] ?? 2) - (TIER_ORDER[b.tier] ?? 2)
  || (hasImg(b) - hasImg(a))
  || (ratingScore(b) - ratingScore(a))
  || (b.reviews || 0) - (a.reviews || 0));

/* ---------- 1. data prep ----------------------------------- */
const ALL = IMPORTED.filter(c => c.name && c.type).map(c => ({ ...c, _hasImg: hasImg(c), _score: ratingScore(c) }));

// EXAMPLE paid listings (featured.js) — showcase demo of the paid product. Shown
// in every place page's Premium/Standard rows + openable in the modal (gallery
// carousel). Kept out of ALL/search and the real all-listings grids.
const FEAT_PREMIUM = FEATURED.filter(c => c.tier === 'premium');
const FEAT_STANDARD = FEATURED.filter(c => c.tier === 'standard');

// every city slug that has any listing
const cityReg = new Map();
for (const c of ALL) if (c.city) cityReg.set(c.city, c.cityName || c.city);
const allCities = [...cityReg].map(([slug, name]) => ({ slug, name, listings: byRank(ALL.filter(c => c.city === slug)) }));
const liveCities = allCities.filter(p => p.listings.length >= MIN_LISTINGS).sort((a, b) => b.listings.length - a.listings.length);
const liveSlugs = new Set(liveCities.map(p => p.slug));

// centroids for every city (incl. thin ones) for distance math
const centroid = {};
for (const p of allCities) {
  const pts = p.listings.filter(c => c.lat && c.lng);
  if (pts.length) centroid[p.slug] = {
    slug: p.slug, name: p.name, count: p.listings.length,
    lat: pts.reduce((a, c) => a + c.lat, 0) / pts.length,
    lng: pts.reduce((a, c) => a + c.lng, 0) / pts.length,
  };
}
const milesBetween = (a, b) => {
  const R = 3959, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};
const nearestLive = (slug, n = 4) => {
  const c = centroid[slug]; if (!c) return [];
  return Object.values(centroid).filter(o => o.slug !== slug && liveSlugs.has(o.slug))
    .map(o => ({ ...o, mi: milesBetween(c, o) })).sort((a, b) => a.mi - b.mi).slice(0, n);
};

// absorb thin towns into nearest qualifying city within MAX_ABSORB_MI
const absorbed = {};      // liveSlug -> [listings folded in]
let absorbCount = 0;
for (const p of allCities) {
  if (liveSlugs.has(p.slug)) continue;
  const from = centroid[p.slug]; if (!from) continue;
  let best = null, bestMi = Infinity;
  for (const o of Object.values(centroid)) {
    if (!liveSlugs.has(o.slug)) continue;
    const mi = milesBetween(from, o);
    if (mi < bestMi) { bestMi = mi; best = o; }
  }
  if (best && bestMi <= MAX_ABSORB_MI) { (absorbed[best.slug] ??= []).push(...p.listings.map(c => ({ ...c, _absorbedFrom: p.name }))); absorbCount += p.listings.length; }
}

// county rollup — every city (thin included) lands on its county page
const counties = new Map();
const unmapped = new Set();
for (const p of allCities) {
  const cn = CITY_COUNTY[p.slug];
  if (!cn) { unmapped.add(p.slug); continue; }
  const c = counties.get(cn) || { name: cn, slug: countySlug(cn), listings: [] };
  c.listings.push(...p.listings);
  counties.set(cn, c);
}
const liveCounties = [...counties.values()].filter(c => c.listings.length >= MIN_LISTINGS)
  .map(c => ({ ...c, listings: byRank(c.listings) })).sort((a, b) => b.listings.length - a.listings.length);

// ZIP rollup — same >=5 rule
const zipReg = new Map();
for (const c of ALL) { if (!/^\d{5}$/.test(String(c.zip || ''))) continue; const z = String(c.zip); (zipReg.get(z) || zipReg.set(z, []).get(z)).push(c); }
const liveZips = [...zipReg].filter(([, list]) => list.length >= MIN_LISTINGS)
  .map(([zip, list]) => ({ zip, listings: byRank(list), cityName: list[0].cityName })).sort((a, b) => b.listings.length - a.listings.length);

// ZIP → best landing page for the locbar "Go" button (works on every page).
// Prefer the contractor's own CITY page; fall back to the ZIP page if the city
// is too thin to have one. Embedded on every page so "Go" can navigate anywhere.
const liveZipSet = new Set(liveZips.map(z => z.zip));
const ZIP_INDEX = {};
for (const [zip, list] of zipReg) {
  const counts = {};
  for (const c of list) if (c.city) counts[c.city] = (counts[c.city] || 0) + 1;
  const domCity = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (domCity && liveSlugs.has(domCity)) ZIP_INDEX[zip] = `/${domCity}/`;
  else if (liveZipSet.has(zip)) ZIP_INDEX[zip] = `/zip/${zip}/`;
}

/* ---------- 2. shared chrome ------------------------------- */
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet"/>`;

const NAV = `<header class="topbar" id="topbar">
  <div class="topbar__left">
    <button class="iconbtn iconbtn--top" id="scrollTopBtn" aria-label="Back to top" title="Back to top">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/><path d="M6 10l6-6 6 6"/></svg>
    </button>
    <a class="brand" href="/"><img class="brand__logo" src="/apple-icon-120x120.png" alt="" width="28" height="28"/><span class="brand__name">${SITE_NAME}</span></a>
  </div>
  <form class="search" action="/" method="get" role="search">
    <input class="search__input" name="q" type="search" placeholder="Search builders, trades or cities…" autocomplete="off"/>
    <button class="search__btn" type="submit" aria-label="Search"><svg viewBox="0 0 24 24" width="20" height="20"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M21 21l-4.3-4.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
  </form>
  <div class="topbar__right">
    <a class="ghostbtn" href="mailto:${CLAIM_EMAIL}?subject=List%20my%20business%20on%20${encodeURIComponent(SITE_NAME)}" target="_blank" rel="noopener">List your business</a>
    <span class="avatar" aria-hidden="true">GA</span>
  </div>
</header>`;

const FOOTER = `<footer class="footer">
  <div class="footer__inner">
    <div class="footer__brand">
      <span class="brand brand--sm"><img class="brand__logo" src="/apple-icon-120x120.png" alt="" width="28" height="28"/><span class="brand__name">${SITE_NAME}</span></span>
      <p class="footer__blurb">Find licensed Georgia builders by trade, city, county or ZIP. Every listing is a real local business, so call ahead to confirm the details.</p>
      <a class="footer__cta" href="mailto:${CLAIM_EMAIL}?subject=List%20my%20business%20on%20${encodeURIComponent(SITE_NAME)}" target="_blank" rel="noopener">List your business →</a>
    </div>
    <nav class="footer__col" aria-label="Browse">
      <span class="footer__h">Browse</span>
      <a href="/">Home</a>
      <a href="/cities/">Cities</a>
      <a href="/counties/">Counties</a>
      <a href="/zips/">ZIP codes</a>
    </nav>
    <nav class="footer__col" aria-label="For contractors">
      <span class="footer__h">For contractors</span>
      <a href="mailto:${CLAIM_EMAIL}?subject=Claim%20my%20listing" target="_blank" rel="noopener">Claim your listing</a>
      <a href="mailto:${CLAIM_EMAIL}?subject=Featured%20placement" target="_blank" rel="noopener">Get featured</a>
      <a href="/pricing/">See pricing</a>
    </nav>
    <nav class="footer__col" aria-label="Legal">
      <span class="footer__h">Legal</span>
      <a href="/privacy/">Privacy Policy</a>
      <a href="/terms/">Terms of Service</a>
      <a href="/cookies/">Cookie Policy</a>
    </nav>
  </div>
  <div class="footer__bar">
    <small>© ${new Date().getFullYear()} ${SITE_NAME} · v${VERSION}</small>
    <small class="footer__made">Made in Georgia by <a href="https://artivicolab.com" rel="noopener">Artivicolab</a></small>
  </div>
</footer>`;

// Sticky "pin your location" bar — same as the home page; wired in page.js.
const LOCBAR = `<div class="locbar" id="locBar">
  <span class="locbar__badge" aria-hidden="true">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg>
  </span>
  <div class="locbar__text">
    <strong class="locbar__title" id="locTitle">See who's nearest you</strong>
    <span class="locbar__sub" id="locLabel">Pin your location for distances &amp; map directions</span>
  </div>
  <div class="locbar__actions">
    <button class="btn btn--primary" id="locBtn" type="button">Use my location</button>
    <form class="locbar__zip" id="zipWrap">
      <input id="zipInput" inputmode="numeric" maxlength="5" pattern="[0-9]{5}" placeholder="ZIP" aria-label="ZIP code" required/>
      <button class="btn btn--solid" type="submit">Go</button>
    </form>
  </div>
  <button class="locbar__close" id="locClose" type="button" aria-label="Dismiss">✕</button>
</div>`;

// Bottom tab bar (mobile) — links on static pages; "Nearby" is wired by page.js.
const TABBAR = `<nav class="tabbar" aria-label="Primary">
  <a class="tabbar__item" href="/"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg><span>Home</span></a>
  <a class="tabbar__item" href="/"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><span>Search</span></a>
  <a class="tabbar__item is-active" href="/cities/"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg><span>Browse</span></a>
  <button class="tabbar__item" id="tabNearby" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></svg><span>Nearby</span></button>
</nav>`;

function pageShell({ title, desc, canonical, jsonLd = '', body, noindex = false, geo = null, pageData = null }) {
  const geoMeta = `<meta name="geo.region" content="US-GA"/>
<meta name="geo.placename" content="${esc(geo?.place ? geo.place + ', Georgia' : 'Georgia')}"/>${geo?.lat ? `\n<meta name="geo.position" content="${geo.lat.toFixed(4)};${geo.lng.toFixed(4)}"/>\n<meta name="ICBM" content="${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)}"/>` : ''}`;
  const dataScript = pageData ? `<script type="application/json" id="page-data">${JSON.stringify(pageData).replace(/</g, '\\u003c')}</script>\n` : '';
  const zipScript = `<script type="application/json" id="zip-index">${JSON.stringify(ZIP_INDEX).replace(/</g, '\\u003c')}</script>\n`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
${GTAG}
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"/>${noindex ? '\n<meta name="robots" content="noindex,follow"/>' : ''}
<link rel="canonical" href="${BASE_URL}${canonical}"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(desc)}"/>
<meta property="og:type" content="website"/>
<meta property="og:url" content="${BASE_URL}${canonical}"/>
<meta property="og:site_name" content="${SITE_NAME}"/>
<meta property="og:image" content="${BASE_URL}/images/hero-1.jpg"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:image" content="${BASE_URL}/images/hero-1.jpg"/>
${geoMeta}
${FONTS}
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png"/>
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png"/>
<link rel="shortcut icon" href="/favicon.ico"/>
<link rel="apple-touch-icon" sizes="180x180" href="/apple-icon-180x180.png"/>
<link rel="manifest" href="/manifest.json"/>
<meta name="theme-color" content="#1750cc"/>
<meta name="apple-mobile-web-app-title" content="${SITE_NAME}"/>
<link rel="stylesheet" href="/css/app.css?v=${ASSET_VER}"/>
${jsonLd}
</head>
<body class="page">
<noscript><div class="noscript"><div class="noscript__card"><span class="noscript__brand">${SITE_NAME}</span><h1>JavaScript is required</h1><p>You need to enable JavaScript to run this app.</p></div></div></noscript>
${NAV}
<main id="app">
${body}
</main>
${FOOTER}
${LOCBAR}
${TABBAR}
${zipScript}${dataScript}<div class="modal" id="modal" hidden>
  <div class="modal__backdrop" data-close></div>
  <div class="modal__panel" role="dialog" aria-modal="true" aria-labelledby="mTitle">
    <div class="modal__grab" id="modalGrab" aria-hidden="true"></div>
    <button class="modal__close" data-close aria-label="Close">✕</button>
    <div class="modal__hero" id="mHero"></div>
    <div class="modal__content">
      <h2 class="modal__title" id="mTitle"></h2>
      <div class="modal__meta" id="mMeta"></div>
      <div class="modal__chips" id="mBadges"></div>
      <div class="modal__actions" id="mActions"></div>
      <dl class="modal__facts" id="mFacts"></dl>
    </div>
  </div>
</div>
<script type="module" src="/js/page.js?v=${ASSET_VER}"></script>
</body>
</html>
`;
}

/* ---------- 3. row rendering (streaming markup) -----------
   The card / claim / spotlight components now come from js/shared/components.mjs
   (the same functions the home page uses). Only the page-structure helpers
   (rails, grid, hero) stay here. */
function railHTML({ title, accent, sub, cardsHtml, label = '' }) {
  const titleHtml = accent && title.includes(accent)
    ? esc(title).replace(esc(accent), `<span class="accent">${esc(accent)}</span>`) : esc(title);
  return `<section class="rail">
    ${label ? `<div class="tier-row-label">${esc(label)}</div>` : ''}
    <div class="rail__head"><h2 class="rail__title">${titleHtml}</h2>${sub ? `<span class="rail__sub">${esc(sub)}</span>` : ''}</div>
    <div class="rail__viewport">
      <button class="rail__nav rail__nav--prev" aria-label="Scroll left"><span>‹</span></button>
      <div class="rail__track">${cardsHtml}</div>
      <button class="rail__nav rail__nav--next" aria-label="Scroll right"><span>›</span></button>
    </div>
  </section>`;
}

// mini-map city/county tile — the "Browse Georgia" look, reused by the nearby
// rail and the cities/counties hub grids.
function gridHTML(title, cardsHtml, sortable = false) {
  const sort = sortable ? `<label class="sortbar">Sort by
    <select class="sortbar__select" data-sort aria-label="Sort contractors">
      <option value="rank">Top picks</option>
      <option value="rating">Top rated</option>
      <option value="reviews">Most reviewed</option>
      <option value="distance">Nearest to me</option>
      <option value="name">Name (A–Z)</option>
    </select></label>` : '';
  return `<section class="results" style="display:block">
    <div class="results__bar"><h2 class="results__head">${esc(title)}</h2>${sort}</div>
    <div class="grid">${cardsHtml}</div>
  </section>`;
}

/* rotating "Featured today" billboard — same markup as the home hero, but the
   picks are this page's own top listings; page.js rotates through them. Slide 0
   is server-rendered so crawlers (and no-JS) get a real hero. */
const heroMetaHTML = (c) => {
  const pills = [];
  if (c.rating) pills.push(`<span class="pill pill--rate">★ ${c.rating}${c.reviews ? ` · ${c.reviews} reviews` : ''}</span>`);
  pills.push(`<span class="pill">${esc(c.type)}</span>`, `<span class="pill">${esc(c.cityName)}</span>`);
  if (c.licensed) pills.push(`<span class="pill">Licensed &amp; Insured</span>`);
  return pills.join('');
};
const heroDescOf = (c) => c.hoursText
  ? `${c.address || c.cityName + ', GA'} · ${c.hoursText}`
  : (c.address || `Serving ${c.cityName} and nearby Georgia communities.`);
const heroActionsHTML = (c) => `<button class="btn btn--primary" data-hero-view>▶ &nbsp;View details</button>${c.phone ? `<a class="btn btn--ghost" href="${telHref(c.phone)}">📞 ${esc(c.phone)}</a>` : ''}`;

function heroSection(place, picks, trail, total) {
  const c0 = picks[0];
  const bg = c0._hasImg ? `url(&quot;${esc(c0.image)}&quot;)` : (c0.lat && c0.lng ? `url(&quot;${tileUrl(c0.lat, c0.lng)}&quot;)` : tintedBg(c0.id, 'cc'));
  return `<section class="hero is-anim" id="hero" data-hero-ids="${esc(picks.map(c => c.id).join(','))}">
    <div class="hero__media" id="heroMedia" style="background-image:${bg}"></div>
    <div class="hero__map" id="heroMap" aria-hidden="true"></div>
    <div class="hero__scrim"></div>
    <div class="hero__poster" id="heroPoster" aria-hidden="true" style="background-image:${bg}"></div>
    <div class="hero__body">
      ${crumbs(trail)}
      <h1 class="hero__eyebrow hero__eyebrow--place">Featured contractors in ${esc(place)} · ${total.toLocaleString()} licensed pros</h1>
      <p class="hero__title" id="heroTitle">${esc(c0.name)}</p>
      <div class="hero__meta" id="heroMeta">${heroMetaHTML(c0)}</div>
      <p class="hero__desc" id="heroDesc">${esc(heroDescOf(c0))}</p>
      <div class="hero__actions" id="heroActions">${heroActionsHTML(c0)}</div>
    </div>
    <div class="hero__dots" id="heroDots">${picks.map((_, i) => `<button${i === 0 ? ' class="is-active"' : ''} aria-label="Slide ${i + 1}"></button>`).join('')}</div>
  </section>`;
}

/* ---------- 4. SEO bits ------------------------------------ */
function areaIntro(list, lead) {
  const n = list.length;
  if (!n) return '';
  if (n === 1) return `Need a contractor ${lead}? Compare the licensed pro here: ratings, reviews, services and direct contact.`;
  return `Need a contractor ${lead}? Compare ${n.toLocaleString('en-US')} licensed general contractors and remodelers here: ratings, reviews, services and direct contact, sorted to put the best-reviewed pros first.`;
}
function crumbs(trail) {
  return `<nav class="crumbs" aria-label="Breadcrumb">${trail.map((t, i) =>
    t.href && i < trail.length - 1 ? `<a href="${t.href}">${esc(t.name)}</a><span>›</span>` : `<span aria-current="page">${esc(t.name)}</span>`).join('')}</nav>`;
}
function business(c) {
  const o = {
    '@type': c.type === 'Kitchen & Bath Remodeling' ? 'HomeAndConstructionBusiness' : 'GeneralContractor',
    name: c.name, address: { '@type': 'PostalAddress', addressLocality: c.cityName, addressRegion: 'GA', postalCode: c.zip || undefined, streetAddress: c.address || undefined },
  };
  if (c.phone) o.telephone = c.phone;
  if (c.website) o.url = c.website;
  if (c.lat && c.lng) o.geo = { '@type': 'GeoCoordinates', latitude: c.lat, longitude: c.lng };
  if (c.rating && c.reviews) o.aggregateRating = { '@type': 'AggregateRating', ratingValue: c.rating, reviewCount: c.reviews };
  return o;
}
function jsonLd(list, { place, canonical }) {
  const graph = [{
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SITE_NAME, item: BASE_URL + '/' },
      { '@type': 'ListItem', position: 2, name: place, item: BASE_URL + canonical },
    ],
  }];
  if (list.length) {
    const seen = new Set();
    graph.push({
      '@type': 'ItemList',
      itemListElement: list.map((c, i) => {
        const b = business(c);
        if (b.url && seen.has(b.url)) b.url += '#' + (c.id || i);
        if (b.url) seen.add(b.url);
        return { '@type': 'ListItem', position: i + 1, item: b };
      }),
    });
  }
  return `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c')}</script>`;
}

// compact records the page modal needs (only this place's listings)
const compact = (list) => Object.fromEntries(list.map(c => [c.id, {
  name: c.name, type: c.type, cityName: c.cityName, address: c.address, zip: c.zip,
  phone: c.phone, website: c.website, lat: c.lat, lng: c.lng, hoursText: c.hoursText,
  image: c._hasImg ? c.image : null, licensed: !!c.licensed, rating: c.rating, reviews: c.reviews,
  facebook: c.facebook, instagram: c.instagram, twitter: c.twitter,
}]));

// the example paid listings the spotlight rows show — richer records so the modal
// opens their gallery carousel and page.js can refresh their live open/closed status.
const FEATURED_DATA = Object.fromEntries(FEATURED.map(c => [c.id, {
  name: c.name, type: c.type, cityName: c.cityName, address: c.address, zip: c.zip,
  phone: c.phone, website: c.website, lat: c.lat, lng: c.lng, hoursText: c.hoursText, hours: c.hours,
  images: c.images, tier: c.tier, licensed: !!c.licensed, rating: c.rating, reviews: c.reviews,
  description: c.description, services: c.services, perks: c.perks, offer: c.offer, example: true,
  facebook: c.facebook, instagram: c.instagram, twitter: c.twitter,
}]));

/* ---------- 5. place-page builder -------------------------- */
function placePage({ kind, slug, relPath, place, listings, extraListings = [], trail, geo, nearby = [] }) {
  const canonical = `/${relPath}/`;
  const pool = byRank(listings);

  // Premium / Standard rows showcase the paid product with the featured.js demo
  // billboards (same as the home page). `sub` gets esc()'d by railHTML, so pass a
  // plain "&" — not "&amp;" — or it double-escapes.
  const premiumRow = railHTML({
    label: 'Featured placement', title: `Featured contractors in ${place}`, accent: 'Featured',
    sub: `Pinned above every listing in ${place}`,
    cardsHtml: FEAT_PREMIUM.map(c => spotCardHTML(c, true)).join('') + claimCardHTML('premium', place),
  });
  const standardRow = railHTML({
    label: 'Standard listings', title: `Standard contractors in ${place}`, accent: 'Standard',
    sub: `Enhanced listings in ${place} with photos & links`,
    cardsHtml: FEAT_STANDARD.map(c => spotCardHTML(c, false)).join('') + claimCardHTML('standard', place),
  });

  // the full grid — Premium and Standard rows lead, then everything (images-first),
  // with a client-side Sort control.
  const allCards = pool.map(cardHTML).join('') + ownCardHTML(place);
  const grid = gridHTML(`All contractors in ${place} (${pool.length.toLocaleString()})`, allCards, true);

  const absorbSection = extraListings.length
    ? gridHTML(`Also serving just outside ${place}`, byRank(extraListings).map(cardHTML).join(''))
    : '';

  // mini-map city tiles, same look as the home "Browse Georgia" rail
  const nearbySection = nearby.length
    ? `<section class="rail nearby-rail">
    <div class="rail__head"><h2 class="rail__title">More cities near <span class="accent">${esc(place)}</span></h2><span class="rail__sub">Browse nearby Georgia cities</span></div>
    <div class="rail__viewport">
      <button class="rail__nav rail__nav--prev" aria-label="Scroll left"><span>‹</span></button>
      <div class="rail__track rail__track--places">${nearby.map(o => placetileHTML({ href: `/${o.slug}/`, name: o.name, count: o.count, lat: o.lat, lng: o.lng })).join('')}</div>
      <button class="rail__nav rail__nav--next" aria-label="Scroll right"><span>›</span></button>
    </div>
  </section>`
    : '';

  // overview map of every mapped contractor on the page (+ the user pin once a
  // location is pinned). page.js plots the markers from #page-data and fits bounds.
  const mapPts = [...pool, ...extraListings].filter(c => c.lat && c.lng);
  const placeMapSec = mapPts.length
    ? `<section class="placemap-sec">
    <div class="rail__head"><h2 class="rail__title">Contractors in <span class="accent">${esc(place)}</span> on the map</h2><span class="rail__sub">${mapPts.length.toLocaleString()} mapped · pin your location to see who's nearest</span></div>
    <div class="placemap" id="placeMap"></div>
  </section>`
    : '';

  const heroEl = heroSection(place, pool.slice(0, 6), trail, pool.length);

  const intro = areaIntro(pool, `in ${place}, GA`);
  const body = `${SPOT_SPRITE}
${heroEl}
${intro ? `<section class="intro-band"><p class="area-intro">${intro}</p></section>` : ''}
${placeMapSec}
${premiumRow}
${standardRow}
${grid}
${absorbSection}
${nearbySection}`;

  const allShown = [...pool, ...extraListings];
  return pageShell({
    title: `${place} Contractors, Licensed Builders & Remodelers | ${SITE_NAME}`,
    desc: `Find licensed general contractors and remodelers in ${place}, GA. Compare ${pool.length.toLocaleString()} local pros by rating, reviews and services. Call, visit a website or get directions.`,
    canonical, geo,
    jsonLd: jsonLd(allShown, { place, canonical }),
    pageData: { ...compact(allShown), ...FEATURED_DATA },
    body,
  });
}

/* ---------- 6. emit ---------------------------------------- */
function write(relPath, html) {
  const dir = join(ROOT, relPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
}
const urls = [];           // indexable canonical paths → sitemap

// city pages
for (const p of liveCities) {
  const county = CITY_COUNTY[p.slug];
  const trail = [{ name: 'Home', href: '/' }];
  if (county) trail.push({ name: `${county} County`, href: `/county/${countySlug(county)}/` });
  trail.push({ name: p.name });
  const geo = centroid[p.slug] ? { place: p.name, lat: centroid[p.slug].lat, lng: centroid[p.slug].lng } : { place: p.name };
  write(p.slug, placePage({
    kind: 'city', slug: p.slug, relPath: p.slug, place: p.name,
    listings: p.listings, extraListings: absorbed[p.slug] || [], trail, geo,
    nearby: nearestLive(p.slug, 6),
  }));
  urls.push(`/${p.slug}/`);
}

// county pages
for (const c of liveCounties) {
  const trail = [{ name: 'Home', href: '/' }, { name: 'Counties', href: '/counties/' }, { name: `${c.name} County` }];
  write(`county/${c.slug}`, placePage({
    kind: 'county', slug: c.slug, relPath: `county/${c.slug}`, place: `${c.name} County`,
    listings: c.listings, trail, geo: { place: `${c.name} County` },
  }));
  urls.push(`/county/${c.slug}/`);
}

// zip pages
for (const z of liveZips) {
  const trail = [{ name: 'Home', href: '/' }, { name: 'ZIP codes', href: '/zips/' }, { name: z.zip }];
  write(`zip/${z.zip}`, placePage({
    kind: 'zip', slug: z.zip, relPath: `zip/${z.zip}`, place: `${z.zip}${z.cityName ? ` (${z.cityName})` : ''}`,
    listings: z.listings, trail, geo: { place: z.cityName || z.zip },
  }));
  urls.push(`/zip/${z.zip}/`);
}

/* ---------- 7. directory hubs ------------------------------ */
function hubPage({ title, desc, canonical, heading, intro, groups, trail }) {
  const body = `<section class="hub">
    ${crumbs(trail)}
    <h1 class="hub__title">${esc(heading)}</h1>
    <p class="hub__intro">${esc(intro)}</p>
    ${groups.map(g => `<div class="hub__group">${g.label ? `<h2>${esc(g.label)}</h2>` : ''}<div class="${g.tiles ? 'placetile-grid' : 'hub__links'}">${g.links}</div></div>`).join('')}
  </section>`;
  return pageShell({ title, desc, canonical, body, jsonLd: jsonLd([], { place: heading, canonical }) });
}

write('cities', hubPage({
  title: `Contractors by City in Georgia | ${SITE_NAME}`,
  desc: `Browse licensed general contractors and remodelers by city across Georgia, ${liveCities.length} cities with local pros.`,
  canonical: '/cities/', heading: 'Contractors by City',
  intro: `Find licensed contractors in ${liveCities.length} Georgia cities. Pick your city to compare local general contractors and remodelers by rating and reviews.`,
  trail: [{ name: 'Home', href: '/' }, { name: 'Cities' }],
  groups: [{ tiles: true, links: liveCities.map(p => {
    const ct = centroid[p.slug] || {};
    return placetileHTML({ href: `/${p.slug}/`, name: p.name, count: p.listings.length, lat: ct.lat, lng: ct.lng });
  }).join('') }],
}));
urls.push('/cities/');

write('counties', hubPage({
  title: `Contractors by County in Georgia | ${SITE_NAME}`,
  desc: `Browse Georgia contractors by county, ${liveCounties.length} counties with licensed local pros.`,
  canonical: '/counties/', heading: 'Contractors by County',
  intro: `Explore licensed contractors across ${liveCounties.length} Georgia counties.`,
  trail: [{ name: 'Home', href: '/' }, { name: 'Counties' }],
  groups: [{ tiles: true, links: liveCounties.map(c => {
    const pts = c.listings.filter(x => x.lat && x.lng);
    const ct = pts.length ? { lat: pts.reduce((a, x) => a + x.lat, 0) / pts.length, lng: pts.reduce((a, x) => a + x.lng, 0) / pts.length } : {};
    return placetileHTML({ href: `/county/${c.slug}/`, name: `${c.name} County`, count: c.listings.length, lat: ct.lat, lng: ct.lng, z: 9 });
  }).join('') }],
}));
urls.push('/counties/');

write('zips', hubPage({
  title: `Contractors by ZIP Code in Georgia | ${SITE_NAME}`,
  desc: `Browse Georgia contractors by ZIP code, ${liveZips.length} ZIPs with licensed local pros.`,
  canonical: '/zips/', heading: 'Contractors by ZIP Code',
  intro: `Find licensed contractors by ZIP code across Georgia, ${liveZips.length} ZIP areas with local pros.`,
  trail: [{ name: 'Home', href: '/' }, { name: 'ZIP codes' }],
  groups: [{ tiles: true, links: liveZips.map(z => {
    const pts = z.listings.filter(x => x.lat && x.lng);
    const ct = pts.length ? { lat: pts.reduce((a, x) => a + x.lat, 0) / pts.length, lng: pts.reduce((a, x) => a + x.lng, 0) / pts.length } : {};
    return placetileHTML({ href: `/zip/${z.zip}/`, name: z.cityName ? `${z.zip} · ${z.cityName}` : z.zip, count: z.listings.length, lat: ct.lat, lng: ct.lng, z: 12 });
  }).join('') }],
}));
urls.push('/zips/');

/* ---------- pricing page ----------------------------------- */
function pricingTier({ name, was, now, per, tag, feats, cta, subject, cls = '', btn, badge = '' }) {
  return `<article class="ptier ${cls}">
    ${badge ? `<span class="ptier__badge">${esc(badge)}</span>` : ''}
    <h2 class="ptier__name">${esc(name)}</h2>
    <div class="ptier__price">${was ? `<s>$${was}</s> ` : ''}<b>$${now}</b>${per ? `<span>/${esc(per)}</span>` : ''}</div>
    <p class="ptier__tag">${esc(tag)}</p>
    <ul class="ptier__feats">${feats.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
    <a class="btn ${btn} btn--block" href="mailto:${CLAIM_EMAIL}?subject=${encodeURIComponent(subject)}" target="_blank" rel="noopener">${esc(cta)}</a>
  </article>`;
}
write('pricing', pageShell({
  title: `Pricing for contractors | ${SITE_NAME}`,
  desc: `Simple monthly pricing to feature your contracting business across Georgia. Free listings for every business, plus Standard and Featured upgrades. Cancel anytime.`,
  canonical: '/pricing/',
  jsonLd: jsonLd([], { place: 'Pricing', canonical: '/pricing/' }),
  body: `<section class="pricing">
    ${crumbs([{ name: 'Home', href: '/' }, { name: 'Pricing' }])}
    <div class="pricing__head">
      <span class="pricing__eyebrow">For contractors</span>
      <h1 class="pricing__title">Get found by homeowners searching your trade</h1>
      <p class="pricing__sub">Every real business is listed free. Upgrade to stand out in your city, county and ZIP. Cancel anytime.</p>
      <span class="pricing__sale">Limited-time launch pricing</span>
    </div>
    <div class="pricing__grid">
      ${pricingTier({ name: 'Free listing', now: '0', tag: 'Every real Georgia business is already here.', btn: 'btn--ghost', cta: 'Claim your listing', subject: 'Claim my listing',
        feats: ['Shown in city, county & ZIP results', 'Map pin, rating & reviews', 'Claim & verify for a Licensed badge'] })}
      ${pricingTier({ name: 'Standard', was: '49', now: '9', per: 'mo', tag: 'An enhanced listing with photos and links.', btn: 'btn--solid', cta: 'Get Standard', subject: 'Standard placement',
        feats: ['Photo gallery & service pills', 'Website + directions buttons', 'Placed in the Standard row'] })}
      ${pricingTier({ name: 'Featured', was: '149', now: '20', per: 'mo', cls: 'ptier--featured', badge: 'Most popular', btn: 'btn--primary', cta: 'Get Featured', subject: 'Featured placement',
        feats: ['Top-of-page billboard placement', 'Perk ticker, services & live open status', 'Everything in Standard, pinned first'] })}
    </div>
    <p class="pricing__foot">Questions? <a href="mailto:${CLAIM_EMAIL}?subject=Pricing%20question" target="_blank" rel="noopener">Get in touch</a> and we'll help you pick the right spot.</p>
  </section>`,
}));
urls.push('/pricing/');

/* ---------- legal / privacy pages -------------------------- */
const LEGAL_UPDATED = 'June 9, 2026';
function legalPage(slug, title, intro, sections) {
  const body = `<section class="legal">
    ${crumbs([{ name: 'Home', href: '/' }, { name: title }])}
    <h1 class="legal__title">${esc(title)}</h1>
    <p class="legal__meta">Last updated ${LEGAL_UPDATED}</p>
    <p class="legal__intro">${intro}</p>
    ${sections}
  </section>`;
  return pageShell({
    title: `${title} | ${SITE_NAME}`,
    desc: `${title} for ${SITE_NAME} — the Georgia contractor directory by Artivicolab.`,
    canonical: `/${slug}/`, body,
  });
}
const mail = (label) => `<a href="mailto:${CLAIM_EMAIL}">${label}</a>`;   // address never shown as text

write('privacy', legalPage('privacy', 'Privacy Policy',
  `${SITE_NAME} is a free, public directory of licensed general contractors and remodelers in Georgia, operated by Artivicolab ("we", "us"). This policy explains what we collect and how we use it.`,
  `<h2>Information we collect</h2>
   <p>You can browse the whole directory without an account, and we do not ask you to create one. We collect very little:</p>
   <ul>
     <li><strong>Location you choose to share.</strong> If you tap "Use my location" or enter a ZIP code, we use it only to show distances and nearby contractors. It is stored locally in your browser (not on our servers) and you can clear it at any time.</li>
     <li><strong>Basic usage analytics.</strong> Aggregate, non-identifying information such as which pages are popular, to improve the site.</li>
     <li><strong>Messages you send us.</strong> If you email us (for example, to claim or correct a listing), we keep that correspondence to respond to you.</li>
   </ul>
   <h2>Business listings</h2>
   <p>Contractor listings are compiled from publicly available sources and third-party business data. They may be incomplete or out of date. A business owner can claim, correct, or request removal of their listing by ${mail('emailing us')}.</p>
   <h2>Cookies &amp; local storage</h2>
   <p>We use your browser's local storage to remember your location preference. We do not use third-party advertising or tracking cookies. See our <a href="/cookies/">Cookie Policy</a> for details.</p>
   <h2>Third-party services</h2>
   <p>Maps are rendered with OpenStreetMap. Listing cards link out to contractors' own websites, phone numbers, and Google Maps. Those third parties have their own privacy practices, which we do not control.</p>
   <h2>How we share information</h2>
   <p>We do not sell your personal information. We only share information when required by law or to operate the basic functions of the site (for example, requesting map tiles).</p>
   <h2>Your choices</h2>
   <p>You can clear your saved location at any time by dismissing the location bar or clearing your browser storage. To correct or remove a business listing, ${mail('email us')}.</p>
   <h2>Children</h2>
   <p>This site is not directed to children under 13 and we do not knowingly collect information from them.</p>
   <h2>Changes</h2>
   <p>We may update this policy; the "last updated" date above reflects the latest version.</p>
   <h2>Contact</h2>
   <p>Questions about privacy? ${mail('Email us')} and we'll help.</p>`));
urls.push('/privacy/');

write('terms', legalPage('terms', 'Terms of Service',
  `By using ${SITE_NAME} (the "Service"), operated by Artivicolab, you agree to these terms. If you don't agree, please don't use the Service.`,
  `<h2>What the Service is</h2>
   <p>${SITE_NAME} is a free, informational directory that helps Georgia homeowners discover licensed general contractors and remodelers. We are a directory only — we are not a party to any agreement you make with a contractor, and we do not perform construction work.</p>
   <h2>No endorsement; verify for yourself</h2>
   <p>A listing on ${SITE_NAME} is not an endorsement, recommendation, or guarantee. Always verify a contractor's license, insurance, references, and pricing directly before hiring. Georgia license status can be checked with the Georgia Secretary of State.</p>
   <h2>Accuracy of listings</h2>
   <p>Listing data is gathered from public and third-party sources and may contain errors or be out of date. Call ahead to confirm details. A "Licensed &amp; Insured" badge appears only after a business verifies that information with us; its absence doesn't mean a contractor is unlicensed.</p>
   <h2>Paid placements</h2>
   <p>"Featured" (Premium) and "Standard" placements are paid advertising positions. They affect placement and presentation only — they are not an endorsement and do not change the verification standard for any badge.</p>
   <h2>Acceptable use</h2>
   <p>Don't scrape, copy, or republish the directory in bulk; don't misuse contact information (e.g., spam); and don't attempt to disrupt the Service.</p>
   <h2>Disclaimers &amp; limitation of liability</h2>
   <p>The Service is provided "as is," without warranties of any kind. To the fullest extent permitted by law, Artivicolab is not liable for any damages arising from your use of the Service, from any listing, or from any dealings with a contractor found here.</p>
   <h2>For contractors</h2>
   <p>Business owners may claim, correct, or remove their listing by ${mail('emailing us')}.</p>
   <h2>Governing law</h2>
   <p>These terms are governed by the laws of the State of Georgia, USA.</p>
   <h2>Changes &amp; contact</h2>
   <p>We may update these terms; continued use means you accept the changes. Questions? ${mail('Email us')}.</p>`));
urls.push('/terms/');

write('cookies', legalPage('cookies', 'Cookie Policy',
  `This page explains the cookies and local storage ${SITE_NAME} uses. The short version: we use the bare minimum, and no advertising trackers.`,
  `<h2>What we use</h2>
   <ul>
     <li><strong>Local storage (your location).</strong> When you share your location or enter a ZIP, we save it in your browser so distances persist between pages. It never leaves your device except as coordinates sent to the map provider to draw tiles.</li>
     <li><strong>Essential function only.</strong> We do not use third-party advertising or cross-site tracking cookies.</li>
   </ul>
   <h2>Third-party content</h2>
   <p>Map tiles are loaded from OpenStreetMap, and fonts from Google Fonts; those requests are subject to those providers' policies.</p>
   <h2>Managing it</h2>
   <p>Clear your saved location by dismissing the location bar, or clear your browser's site data to remove everything. See our <a href="/privacy/">Privacy Policy</a> for more.</p>
   <h2>Contact</h2>
   <p>Questions? ${mail('Email us')}.</p>`));
urls.push('/cookies/');

/* ---------- 8. sitemap / robots / 404 ---------------------- */
const indexable = ['/', ...urls];
writeFileSync(join(ROOT, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  indexable.map(u => `  <url><loc>${BASE_URL}${u}</loc></url>`).join('\n') + `\n</urlset>\n`);
writeFileSync(join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${BASE_URL}/sitemap.xml\n`);
writeFileSync(join(ROOT, '404.html'), pageShell({
  title: `Page not found | ${SITE_NAME}`, desc: 'That page moved or never existed.', canonical: '/404.html', noindex: true,
  body: `<section class="hub"><h1 class="hub__title">Page not found</h1><p class="hub__intro">Try the <a href="/">home page</a>, or browse <a href="/cities/">all Georgia cities</a>.</p></section>`,
}));

/* ---------- 9. report -------------------------------------- */
console.log(`GA.Contractors generator — v${VERSION}`);
console.log(`  listings:        ${ALL.length.toLocaleString()}`);
console.log(`  city pages:      ${liveCities.length}  (of ${allCities.length} cities with listings)`);
console.log(`  county pages:    ${liveCounties.length}`);
console.log(`  zip pages:       ${liveZips.length}`);
console.log(`  absorbed:        ${absorbCount} listings from ${allCities.length - liveCities.length} thin towns → nearest city`);
console.log(`  indexable URLs:  ${indexable.length} (sitemap.xml)`);
if (unmapped.size) console.log(`  ⚠ unmapped cities (no county): ${[...unmapped].slice(0, 20).join(', ')}${unmapped.size > 20 ? ` … +${unmapped.size - 20}` : ''}`);
