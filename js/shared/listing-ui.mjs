// ============================================================
//  Shared browser render layer — the reusable "components" the
//  home SPA (js/app.js) and the generated pages (js/page.js) BOTH
//  use, so there is ONE copy of: the photo card, the Premium /
//  Standard rows, the v20 detail modal (gallery + live map), the
//  save heart, and time-of-day theming.
//
//  Browser-only (needs window / DOM / Leaflet) — NOT imported by
//  the Node generator. The generator emits the card *markup*
//  (components.mjs → appCardHTML); this hydrates it and builds the
//  interactive pieces. Created once per page via createListingUI(ctx):
//    ctx = { place, getUserLoc, saved, persistSaved, onSaveChange, track }
//  Pure-isomorphic primitives still live in js/shared/* and are
//  imported here.
// ============================================================
import { esc, initials, ratingScore, fmtMi, milesBetween } from './format.mjs';
import { colorFor, tintedBg } from './palette.mjs';
import { SPOT_SPRITE, spotUse } from './icons.mjs';
import { tileUrl, PIN_SVG } from './geo.mjs';
import { loadLeaflet, mapPin } from './maps.mjs';
import { appCardHTML, CLAIM_EMAIL } from './components.mjs';

const $  = (s, r = document) => r.querySelector(s);
const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
const nodeFrom = (html) => { const t = el('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

/* ---------- static helpers (no context needed) ------------- */
export const STAR = (sz = 12, color = '#F6B73C') =>
  `<svg class="star" width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="${color}"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.2 5.8 20.9l1.6-7L2 9.2l7.1-.6L12 2z"/></svg>`;
export const heartSVG = (on) =>
  `<svg width="15" height="15" viewBox="0 0 24 24" fill="${on ? '#B8862B' : 'none'}" stroke="${on ? '#B8862B' : '#fff'}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 10-7.8 7.8l8.8 8.9 8.8-8.9a5.5 5.5 0 000-7.8z"/></svg>`;
export const isWide = () => window.matchMedia('(min-width: 900px)').matches;

const _ic = (sz, inner, fill = 'none') => `<svg class="ic" width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
export const IC = {
  pin:     (s = 12) => _ic(s, '<path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/>'),
  search:  (s = 12) => _ic(s, '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  star:    (s = 12) => _ic(s, '<path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.2 5.8 20.9l1.6-7L2 9.2l7.1-.6z"/>', 'currentColor'),
  phone:   (s = 12) => _ic(s, '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L17 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>'),
  refresh: (s = 12) => _ic(s, '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 4v5h-5"/>'),
  snow:    (s = 12) => _ic(s, '<path d="M12 2v20M2.7 7l18.6 10M21.3 7L2.7 17"/>'),
  rain:    (s = 12) => _ic(s, '<path d="M17 13a4.5 4.5 0 0 0-2-8.5A6 6 0 0 0 4 8a4 4 0 0 0 .5 8"/><path d="M9 19l-1 2M13 19l-1 2M17 19l-1 2"/>'),
  wind:    (s = 12) => _ic(s, '<path d="M3 8h11a3 3 0 1 0-3-5"/><path d="M3 12h16a3 3 0 1 1-3 5"/><path d="M3 16h8a3 3 0 1 1-3 5"/>'),
  sun:     (s = 12) => _ic(s, '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>'),
  leaf:    (s = 12) => _ic(s, '<path d="M11 20A7 7 0 0 1 4 13C4 6 11 3 20 3c0 9-4 16-9 17Z"/><path d="M4 21c2.5-4 6-6.5 11-7.5"/>'),
  gift:    (s = 12) => _ic(s, '<rect x="3" y="8" width="18" height="13" rx="1"/><path d="M3 12h18M12 8v13M12 8a3 3 0 1 0-3-3 3 3 0 0 0 3 3 3 3 0 1 0 3-3"/>'),
  camera:  (s = 12) => _ic(s, '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l2-3h8l2 3h3a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="3.5"/>'),
};

export function ensureSpotSprite() {
  if (document.getElementById('spot-sprite')) return;
  const t = el('template'); t.innerHTML = SPOT_SPRITE;
  document.body.append(t.content.firstChild);
}

// wrap any matching search terms in <mark>
export function hlText(text, terms) {
  const t = String(text || '');
  if (!terms || !terms.length) return esc(t);
  const re = new RegExp('(' + terms.filter(Boolean).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'ig');
  return esc(t).replace(re, '<mark class="hl">$1</mark>');
}

const THEMES = {
  dawn:  { bg: '#FFFEFA', card: 'linear-gradient(180deg,#FFFFFF,#FDF8EE)', mood: '#B8862B', greet: 'Good morning, Georgia' },
  day:   { bg: '#FFFFFF', card: 'linear-gradient(180deg,#FFFFFF,#FBFAF6)', mood: '#0E7A5F', greet: 'Good afternoon, Georgia' },
  dusk:  { bg: '#FFFCF7', card: 'linear-gradient(180deg,#FFFFFF,#FBF4E8)', mood: '#A06B22', greet: 'Good evening, Georgia' },
  night: { bg: '#FAFAF9', card: 'linear-gradient(180deg,#FFFFFF,#F2F4F2)', mood: '#5E7A70', greet: 'Working late, Georgia?' },
};
const themeForHour = (h) => h >= 5 && h < 11 ? 'dawn' : h >= 11 && h < 17 ? 'day' : h >= 17 && h < 21 ? 'dusk' : 'night';
export function applyTheme() {
  const th = THEMES[themeForHour(new Date().getHours())];
  const s = document.body.style;
  s.setProperty('--bg', th.bg); s.setProperty('--card', th.card); s.setProperty('--mood', th.mood);
  const g = $('#hdGreet'); if (g) { const wd = new Date().getDay(); g.textContent = (wd === 0 || wd === 6) ? 'Weekend project mode' : th.greet; }
}

const PERK_MS = 3500;

/* ============================================================
   The context-bound UI. Both app.js and page.js create one of
   these and use the returned functions — one source of truth.
   ============================================================ */
export function createListingUI(ctx) {
  const place = ctx.place || 'Georgia';
  const saved = ctx.saved;
  const track = ctx.track || (() => {});
  const getUserLoc = ctx.getUserLoc || (() => null);
  const distMi = (c) => { const u = getUserLoc(); return (u && c.lat && c.lng) ? milesBetween(u, c) : null; };

  /* ---------- photo / placeholder ---------- */
  function photoEl(c, cls = '') {
    if (c._hasImg) {
      const im = el('img', cls); im.src = c._img; im.alt = c.name; im.loading = 'lazy'; im.referrerPolicy = 'no-referrer';
      im.addEventListener('error', () => im.replaceWith(phEl(c, cls)));
      return im;
    }
    return phEl(c, cls);
  }
  function phEl(c, cls = '') {
    const base = (cls + ' ph').trim();
    if (c.lat && c.lng) {
      const d = el('div', base + ' ph--map');
      d.style.backgroundImage = `linear-gradient(0deg, rgba(19,49,42,.20), rgba(19,49,42,.04)), url("${tileUrl(c.lat, c.lng, 12)}")`;
      d.innerHTML = `<span class="ph__pin">${PIN_SVG('#13312a')}</span><span class="ph__label">${IC.pin(11)} ${esc(c.cityName || 'Georgia')}</span>`;
      return d;
    }
    const d = el('div', base);
    d.style.backgroundImage = tintedBg(c.id, 'cc');
    d.style.backgroundSize = 'cover'; d.style.backgroundPosition = 'center';
    d.textContent = initials(c.name);
    return d;
  }

  /* ---------- save heart ---------- */
  function toggleSave(name) {
    if (saved.has(name)) saved.delete(name); else saved.add(name);
    ctx.persistSaved?.();
    renderMemory();
    ctx.onSaveChange?.();
    return saved.has(name);
  }
  function saveBtn(c, cls) {
    const b = el('button', cls); b.type = 'button'; b.setAttribute('aria-label', 'Save');
    b.innerHTML = heartSVG(saved.has(c.name));
    b.addEventListener('click', (e) => { e.stopPropagation(); const on = toggleSave(c.name); b.innerHTML = heartSVG(on); if (on) burst(e.clientX, e.clientY); });
    return b;
  }
  function burst(x, y) {
    const colors = ['#B8862B', '#0E7A5F', '#F6B73C', '#7EE2A8', '#13312A'];
    for (let i = 0; i < 12; i++) {
      const d = el('div'); const s = 5 + Math.random() * 4;
      Object.assign(d.style, { position: 'fixed', left: x + 'px', top: y + 'px', width: s + 'px', height: s + 'px',
        borderRadius: Math.random() > .5 ? '99px' : '2px', background: colors[i % colors.length], pointerEvents: 'none', zIndex: 9999 });
      document.body.append(d);
      const a = (Math.random() * 2 - 1) * Math.PI, v = 40 + Math.random() * 55;
      d.animate([{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${Math.cos(a) * v}px, ${Math.sin(a) * v - 30}px) rotate(${Math.random() * 360}deg)`, opacity: 0 }],
        { duration: 600 + Math.random() * 300, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => d.remove();
    }
  }

  /* ---------- saved & recent memory strip (#memory) ---------- */
  let RECENTS = [];
  function addRecent(name) {
    const i = RECENTS.indexOf(name); if (i > -1) RECENTS.splice(i, 1);
    RECENTS.unshift(name); RECENTS.length = Math.min(RECENTS.length, 6);
    renderMemory();
  }
  function renderMemory() {
    const host = $('#memory'); if (!host) return;
    const sv = [...saved], rc = RECENTS.filter(n => !saved.has(n));
    if (!sv.length && !rc.length) { host.hidden = true; host.innerHTML = ''; return; }
    host.hidden = false;
    const chips = [...sv.map(n => ['♥', n]), ...rc.map(n => ['▸', n])];
    host.innerHTML = `<div class="mem__h">${sv.length ? 'Saved &amp; recent' : 'Pick up where you left off'}</div><div class="mem__row"></div>`;
    const row = host.querySelector('.mem__row');
    chips.forEach(([t, n]) => {
      const ch = el('div', 'mem__chip'); ch.innerHTML = `<i>${t}</i> ${esc(n)}`;
      ch.addEventListener('click', () => { const c = ctx.resolve?.(n); if (c) openModal(c); else ctx.onMissing?.(n); });
      row.append(ch);
    });
  }

  function sectionHead(kicker, title, accent, action, onAction) {
    const h = el('div', 'sh');
    const t = accent && title.includes(accent) ? esc(title).replace(esc(accent), `<span>${esc(accent)}</span>`) : esc(title);
    h.innerHTML = `<div><div class="sh__k">${esc(kicker)}</div><div class="sh__t">${t}</div></div>`;
    if (action) { const b = el('button', 'sh__a'); b.innerHTML = action; b.onclick = onAction || (() => {}); h.append(b); }
    return h;
  }

  /* ---------- photo card (.pcard) ---------- */
  // Build a fresh card node from the shared SSR markup, then hydrate it.
  function buildCard(c, terms) {
    const card = nodeFrom(appCardHTML(c));
    if (terms && terms.length) {
      const n = card.querySelector('.pcard__n'), sub = card.querySelector('.pcard__sub');
      if (n) n.innerHTML = hlText(c.name, terms);
      if (sub) sub.innerHTML = `${hlText(c.type, terms)} · ${hlText(c.cityName, terms)}`;
    }
    hydrateCard(card, c);
    return card;
  }
  // Wire an existing .pcard node (server-rendered or freshly built): open modal,
  // working save heart, distance badge.
  function hydrateCard(node, c) {
    node.style.cursor = 'pointer';
    node.addEventListener('click', (e) => { if (!e.target.closest('.pcard__save')) openModal(c); });
    node.addEventListener('keydown', (e) => { if (e.key === 'Enter') openModal(c); });
    const old = node.querySelector('.pcard__save');
    if (old) old.replaceWith(saveBtn(c, 'pcard__save'));
    refreshCardDistance(node, c);
  }
  function refreshCardDistance(node, c) {
    const ph = node.querySelector('.pcard__ph'); if (!ph) return;
    ph.querySelector('.pcard__mi')?.remove();
    const mi = distMi(c); if (mi != null) { const m = el('span', 'pcard__mi'); m.innerHTML = `${IC.pin(10)} ${esc(fmtMi(mi))}`; ph.prepend(m); }
  }

  /* ---------- Premium row (carousel mobile / 4-grid wide) ---------- */
  function premiumCardEl(c) {
    const vacant = !!c.vacant;
    const card = el('div', 'psp__hero' + (vacant ? ' psp__hero--vacant' : ''));
    const ph = el('div', 'psp__ph' + (vacant ? ' psp__ph--bp' : ''));
    if (vacant) {
      ph.innerHTML = `<div class="vac__photo"><div class="vac__cam">${IC.camera(22)}</div><div class="vac__camh">Your project photos here</div><div class="vac__cams">Up to 4 photos</div></div><span class="vac__badge">Limited-time</span>`;
    } else {
      ph.append(photoEl(c));
      const open = (/^open/i.test(c.hoursText || ''));
      ph.insertAdjacentHTML('beforeend', `<div class="psp__scrim"></div>
        <div class="psp__top">
          <span class="psp__toprated${c.example ? ' psp__toprated--ex' : ''}">${c.example ? `Example · ${esc(place)}` : `${STAR(11, '#B8862B')} Top-rated in ${esc(c.cityName)}`}</span>
          <span class="psp__hours"><span class="psp__dot${open ? ' open' : ''}"></span>${esc(c.hoursText || '')}</span>
        </div>`);
    }
    card.append(ph);
    const perks = vacant
      ? ['Your offer rotates here, on auto', '"0% financing"? "Free quotes"?', 'Up to 3 perks, homeowners see all']
      : (c.perks || []).slice(0, 4);
    if (perks.length) {
      const pt = el('div', 'psp__perks');
      pt.innerHTML = `<div class="psp__perkrow"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg><span class="psp__perk"></span><span class="psp__perkdots"></span></div><i class="psp__perkbar"></i>`;
      card.append(pt);
      const label = pt.querySelector('.psp__perk'), dots = pt.querySelector('.psp__perkdots'), bar = pt.querySelector('.psp__perkbar');
      dots.innerHTML = perks.map(() => '<i></i>').join('');
      let pi = 0;
      const show = () => {
        label.textContent = perks[pi];
        [...dots.children].forEach((d, j) => d.classList.toggle('on', j === pi));
        bar.style.transition = 'none'; bar.style.width = '0';
        requestAnimationFrame(() => { bar.style.transition = 'width 3.5s linear'; bar.style.width = '100%'; });
        label.style.animation = 'none'; void label.offsetWidth; label.style.animation = 'perkIn .35s ease';
      };
      show();
      const id = setInterval(() => { if (!document.body.contains(card)) { clearInterval(id); return; } pi = (pi + 1) % perks.length; show(); }, PERK_MS);
    }
    const body = el('div', 'psp__body');
    if (vacant) {
      body.innerHTML = `<div class="psp__kick">Your trade · ${esc(place)}</div>
        <div class="vac__ghosts"><span class="gbar gbar--name"></span><span class="gline"><span class="gbar" style="width:54px"></span><span class="gbar" style="width:96px"></span><span class="gbar" style="width:40px"></span></span></div>
        <div class="psp__desc">Pinned above every free listing when homeowners search your trade in ${esc(place)}.</div>
        <div class="vac__price"><span class="vac__pl">Premium</span> <s>$149</s> <b>$20</b><span class="vac__pmo">/mo</span> <span class="vac__pn">· top of the page</span></div>
        <a class="psp__view vac__claim" href="mailto:${CLAIM_EMAIL}?subject=${encodeURIComponent('Premium placement in ' + place)}" target="_blank" rel="noopener">Claim this spot →</a>`;
      body.querySelector('a').addEventListener('click', (e) => e.stopPropagation());
    } else {
      body.innerHTML = `<div class="psp__kick">${esc(c.type)}</div>
        <div class="psp__name">${esc(c.name)}</div>
        <div class="psp__rowmeta"><span>${STAR()} ${c.rating} <span class="mut">(${c.reviews || 0})</span></span>
          ${c.licensed ? `<span class="sep">·</span><span class="lic">✓ Licensed &amp; insured</span>` : ''}
          ${(!c.example && distMi(c) != null) ? `<span class="sep">·</span><span class="mut">${fmtMi(distMi(c))}</span>` : ''}</div>
        <div class="psp__desc">${esc(c.description || '')}</div>
        <div class="psp__tags">${(c.services || []).map(t => `<span class="psp__tag">${esc(t)}</span>`).join('')}</div>
        <div class="psp__cta"><button class="psp__view" type="button">View details</button>
          <button class="psp__share" type="button" aria-label="Share"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"/></svg></button></div>`;
      body.querySelector('.psp__view').addEventListener('click', () => openModal(c));
      body.querySelector('.psp__share').addEventListener('click', () => shareListing(c));
    }
    card.append(body);
    if (!vacant) card.addEventListener('click', (e) => { if (!e.target.closest('button,a')) openModal(c); });
    return card;
  }
  let premiumTimer = null;
  function renderPremium(featByTier) {
    const host = $('#premium'); if (!host) return;
    host.innerHTML = ''; clearTimeout(premiumTimer);
    const pool = featByTier.premium || [];
    if (!pool.length) return;
    const slots = [pool[0], { vacant: true }, { vacant: true }, { vacant: true }];
    host.append(sectionHead('Sponsored · Premium', 'Featured contractors', 'Featured', 'See all', () => {}));
    if (isWide()) {
      const grid = el('div', 'psp-grid');
      slots.forEach(c => grid.append(premiumCardEl(c)));
      host.append(grid);
      return;
    }
    const wrap = el('div', 'psp');
    const heroBox = el('div', 'psp__main'), dotsBox = el('div', 'psp__dots'), mini = el('div', 'psp__mini');
    wrap.append(heroBox, dotsBox, mini); host.append(wrap);
    let idx = 0, auto = true;
    const renderMini = () => {
      mini.innerHTML = '';
      slots.map((p, i) => [p, i]).filter(([, i]) => i !== idx).forEach(([p, i]) => {
        if (p.vacant) {
          const b = el('button', 'psp__minicard psp__minicard--claim');
          b.innerHTML = `<span class="vac__plus">+</span><span class="vac__minilbl">Your spot<br><b>$20/mo</b></span>`;
          b.addEventListener('click', () => { idx = i; auto = false; clearTimeout(premiumTimer); renderHero(); });
          mini.append(b); return;
        }
        const b = el('button', 'psp__minicard');
        const ph = el('div', 'psp__miniph'); ph.append(photoEl(p));
        ph.insertAdjacentHTML('beforeend', `<span class="psp__minirt">${STAR(9)} ${p.rating}</span>`);
        const bd = el('div', 'psp__minib'); bd.innerHTML = `<div class="psp__minin">${esc(p.name)}</div><div class="psp__minic">${esc(p.cityName)}</div>`;
        b.append(ph, bd);
        b.addEventListener('click', () => { idx = i; auto = false; clearTimeout(premiumTimer); renderHero(); });
        mini.append(b);
      });
    };
    const renderHero = () => {
      if (!document.body.contains(heroBox)) return;
      heroBox.innerHTML = ''; heroBox.append(premiumCardEl(slots[idx]));
      dotsBox.innerHTML = '';
      slots.forEach((_, d) => { const b = el('button'); if (d === idx) b.className = 'on'; b.onclick = () => { idx = d; auto = false; clearTimeout(premiumTimer); renderHero(); renderMini(); }; dotsBox.append(b); });
      renderMini();
      clearTimeout(premiumTimer);
      if (auto) {
        const c = slots[idx], perkN = c.vacant ? 3 : ((c.perks || []).slice(0, 4).length || 1);
        premiumTimer = setTimeout(() => { idx = (idx + 1) % slots.length; renderHero(); }, perkN * PERK_MS + 3000);
      }
    };
    renderHero();
  }

  /* ---------- Standard row (one example + one open slot) ---------- */
  function renderStandard(featByTier) {
    const host = $('#standard'); if (!host) return;
    host.innerHTML = '';
    const list = (featByTier.standard || []).slice(0, 1); if (!list.length) return;
    host.append(sectionHead('Standard', 'Enhanced listings', 'Enhanced', 'See all', () => {}));
    const wrap = el('div', 'std');
    list.forEach(c => {
      const card = el('div', 'stdcard'); card.tabIndex = 0;
      const open = (/^open/i.test(c.hoursText || ''));
      const ph = el('div', 'stdcard__ph'); ph.append(photoEl(c));
      ph.insertAdjacentHTML('beforeend', `<span class="stdcard__rt">${STAR(11)} ${c.rating}</span>`);
      const col = el('div', 'stdcard__c');
      col.innerHTML = `<div class="stdcard__top"><span class="stdcard__kick">${esc(c.type)}</span>
          ${c.example ? `<span class="stdcard__ex">Example · ${esc(place)}</span>` : (c.licensed ? '<span class="stdcard__lic">✓ Licensed</span>' : '')}</div>
        <div class="stdcard__n">${esc(c.name)}</div>
        <div class="stdcard__meta">${c.example ? 'Sample of a Standard listing' : `${c.reviews || 0} reviews · <b>Top-rated in ${esc(c.cityName)}</b>`}</div>
        <div class="stdcard__desc">${esc(c.description || '')}</div>
        <div class="stdcard__tags">${(c.services || []).slice(0, 3).map(t => `<span class="stdcard__tag">${esc(t)}</span>`).join('')}</div>`;
      const row = el('div', 'stdcard__row'); row.append(ph, col);
      const bar = el('div', 'stdcard__bar');
      bar.innerHTML = `<span class="stdcard__hours"><span class="psp__dot${open ? ' open' : ''}"></span>${esc(c.hoursText || '')}</span>
        ${distMi(c) != null ? `<span class="stdcard__mi">${IC.pin(11)} ${fmtMi(distMi(c))}</span>` : ''}
        <span class="stdcard__view">View details <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg></span>`;
      card.append(row, bar);
      card.addEventListener('click', () => openModal(c));
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') openModal(c); });
      wrap.append(card);
    });
    const vac = el('div', 'stdcard stdcard--vacant');
    vac.innerHTML = `<div class="stdcard__row">
        <div class="stdcard__ph stdcard__ph--bp"><div class="vac__photo vac__photo--sm"><div class="vac__cam vac__cam--sm">${IC.camera(16)}</div><div class="vac__camh">Your photo</div></div></div>
        <div class="stdcard__c">
          <div class="stdcard__top"><span class="stdcard__kick">Your trade · ${esc(place)}</span><span class="vac__slot">Open slot</span></div>
          <div class="vac__ghosts"><span class="gbar gbar--name"></span><span class="gline"><span class="gbar" style="width:46px"></span><span class="gbar" style="width:78px"></span></span></div>
          <div class="stdcard__desc">Photos, links and your pitch — above every free listing in ${esc(place)}.</div>
        </div></div>
      <div class="stdcard__bar"><span class="vac__price vac__price--std"><span class="vac__pl">Standard</span> <s>$49</s> <b>$10</b><span class="vac__pmo">/mo</span></span>
        <a class="stdcard__claimbtn" href="mailto:${CLAIM_EMAIL}?subject=${encodeURIComponent('Standard placement in ' + place)}" target="_blank" rel="noopener">Claim this spot →</a></div>`;
    wrap.append(vac);
    host.append(wrap);
  }

  /* ---------- share ---------- */
  function shareListing(c) {
    const data = { title: c.name, text: `Check out ${c.name} on Georgia Contractors`, url: c.city ? location.origin + `/${c.city}/` : location.href };
    if (navigator.share) navigator.share(data).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(data.url);
  }

  /* ---------- detail sheet (modal) ---------- */
  let lastOpen = null;
  const cleanTel = (p) => (p || '').replace(/[^\d+]/g, '');
  const mapsUrl = (c) => (c.lat && c.lng)
    ? `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.name + ' ' + (c.address || c.cityName || ''))}`;
  function actionsHTML(c) {
    if (c.example) return `<a class="md__call" href="mailto:${CLAIM_EMAIL}?subject=${encodeURIComponent('Claim a featured placement')}" target="_blank" rel="noopener">${spotUse('si-check')} <span>Claim this listing</span></a>`;
    let h = '';
    if (c.phone) h += `<a class="md__call" href="tel:${cleanTel(c.phone)}">${spotUse('si-phone')} <span>Call now</span></a>`;
    if (c.website) h += `<a class="md__tile" href="${c.website}" target="_blank" rel="noopener noreferrer">${spotUse('si-globe')}<span>Website</span></a>`;
    h += `<a class="md__tile" href="${mapsUrl(c)}" target="_blank" rel="noopener noreferrer">${spotUse('si-compass')}<span>Directions</span></a>`;
    return h;
  }
  function detailsHTML(c) {
    const row = (k, v, cls) => v ? `<div class="md__row"><span class="md__dk">${esc(k)}</span><span class="md__dv ${cls || ''}">${v}</span></div>` : '';
    if (c.example) return row('Hours', c.hoursText ? esc(c.hoursText) : '') + row('Area', esc(place)) + row('Plan', c.tier === 'premium' ? 'Premium placement' : 'Standard placement');
    let h = '';
    h += row('Phone', c.phone ? `<a href="tel:${cleanTel(c.phone)}">${esc(c.phone)}</a>` : '');
    h += row('Address', esc(c.address || `${c.cityName}, GA ${c.zip || ''}`));
    h += row('Hours', c.hoursText ? esc(c.hoursText) : '');
    h += row('Website', c.website ? `<a href="${c.website}" target="_blank" rel="noopener noreferrer">${esc(c.website.replace(/^https?:\/\//, ''))}</a>` : '');
    const mi = distMi(c); if (mi != null) h += row('Distance', `${fmtMi(mi)} from ${esc(getUserLoc().label || 'you')}`);
    const socials = [['Facebook', c.facebook], ['Instagram', c.instagram], ['Twitter', c.twitter]]
      .filter(([, u]) => u).map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${n}</a>`).join(' · ');
    if (socials) h += row('Social', socials);
    return h;
  }
  function openModal(c) {
    lastOpen = c; addRecent(c.name); ctx.onOpen?.(c);
    track('view_listing', { listing_id: c.id, listing_name: c.name, city: c.cityName, item_category: c.type, tier: c.tier || 'free' });
    const m = $('#modal'); m.hidden = false; document.body.style.overflow = 'hidden';
    const sc = $('#mScroll'); if (sc) sc.scrollTop = 0;

    const heroEl = $('#mHero'); heroEl.className = 'modal__hero'; heroEl.style.backgroundImage = ''; heroEl.innerHTML = '';
    const paid = c.tier === 'premium' || c.tier === 'standard';
    if (paid && Array.isArray(c.images) && c.images.length) { buildCarousel(heroEl, c); }
    else if (c._img) { heroEl.classList.add('mphoto'); heroEl.append(photoLayers(c._img, c.name)); }
    else if (c.lat && c.lng) { mapView(heroEl, c); }
    else { heroEl.style.background = colorFor(c.id); heroEl.innerHTML = `<span class="ph">${initials(c.name)}</span>`; }
    const ctl = $('#mHeroCtl'); ctl.innerHTML = ''; ctl.append(saveBtn(c, 'mhero__heart'));
    const nImg = (paid && c.images) ? c.images.length : (c._img ? 1 : 0);
    if (nImg > 1) { const cnt = el('span', 'mhero__count'); cnt.innerHTML = `${IC.camera(13)} ${nImg}`; ctl.append(cnt); }

    const open = (/^open/i.test(c.hoursText || ''));
    const tags = (c.services && c.services.length ? c.services : [c.type]).filter(Boolean);
    const about = c.example
      ? `${esc(c.description || '')} This is an example of a ${c.tier === 'premium' ? 'Premium' : 'Standard'} listing — claim the spot to appear here.`
      : esc(c.description || `Serving ${c.cityName || 'Georgia'} and nearby communities. Call ahead to confirm availability and details.`);
    $('#mContent').innerHTML = `
      <div class="md__kick">${esc(c.type || 'Contractor')}${c.example ? ` · Example · ${esc(place)}` : ''}</div>
      <h2 class="md__name" id="mTitle">${esc(c.name)}</h2>
      <div class="md__rating">
        ${c.rating ? `<span class="md__rt">${STAR(13)} ${c.rating}${c.reviews ? ` <span class="mut">(${c.reviews})</span>` : ''}</span>` : ''}
        ${c.licensed ? `<span class="sep">·</span><span class="lic">✓ Licensed &amp; insured</span>` : ''}
        ${c.hoursText ? `<span class="sep">·</span><span class="md__hrs"><span class="psp__dot${open ? ' open' : ''}"></span>${esc(c.hoursText)}</span>` : ''}
      </div>
      <div class="md__actions">${actionsHTML(c)}</div>
      ${tags.length ? `<div class="md__tags">${tags.map(t => `<span class="md__tag">${esc(t)}</span>`).join('')}</div>` : ''}
      <p class="md__about">${about}</p>
      <div class="md__detailsh">Details</div>
      <div class="md__details">${detailsHTML(c)}</div>
      ${(c.lat && c.lng) ? `<div class="md__map" id="mDetailMap"></div>` : ''}`;

    const bar = $('#mCallbar');
    if (c.example) bar.innerHTML = `<div class="md__barL"><small>List your business</small><div class="md__barbig">${c.tier === 'premium' ? 'Premium · $20/mo' : 'Standard · $10/mo'}</div></div><a class="md__barbtn" href="mailto:${CLAIM_EMAIL}?subject=${encodeURIComponent('Claim a featured placement')}" target="_blank" rel="noopener">Claim this spot</a>`;
    else if (c.phone) bar.innerHTML = `<div class="md__barL"><div class="md__barbig">${esc(c.phone)}</div></div><a class="md__barbtn" href="tel:${cleanTel(c.phone)}">Call</a>`;
    else bar.innerHTML = `<div class="md__barL"><small>Find them on the map</small><div class="md__barbig">${esc(c.cityName || 'Georgia')}</div></div><a class="md__barbtn" href="${mapsUrl(c)}" target="_blank" rel="noopener noreferrer">Directions</a>`;

    if (c.lat && c.lng) initDetailMap(c);
  }
  function initDetailMap(c) {
    const elMap = $('#mDetailMap'); if (!elMap || !(c.lat && c.lng)) return;
    loadLeaflet().then(() => {
      const L = window.L;
      const map = L.map(elMap, { zoomControl: false, attributionControl: false, scrollWheelZoom: false }).setView([c.lat, c.lng], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
      L.marker([c.lat, c.lng], { icon: mapPin(L, '#13312a') }).addTo(map).bindPopup(esc(c.name));
      const u = getUserLoc();
      if (u) {
        L.marker([u.lat, u.lng], { icon: mapPin(L, '#0e7a5f') }).addTo(map).bindPopup('You');
        L.polyline([[u.lat, u.lng], [c.lat, c.lng]], { color: '#0e7a5f', weight: 3, dashArray: '6 6' }).addTo(map);
        const mid = [(u.lat + c.lat) / 2, (u.lng + c.lng) / 2];
        L.marker(mid, { interactive: false, zIndexOffset: 1000, icon: L.divIcon({ className: 'mcar__distpin', html: `<span>${fmtMi(milesBetween(u, c))} away</span>`, iconSize: [0, 0], iconAnchor: [0, 0] }) }).addTo(map);
        map.fitBounds(L.latLngBounds([[u.lat, u.lng], [c.lat, c.lng]]).pad(0.4));
      }
      setTimeout(() => map.invalidateSize(), 70);
    }).catch(() => { const e = $('#mDetailMap'); if (e) e.innerHTML = '<p class="mcar__maperr">Map unavailable.</p>'; });
  }
  function closeModal() { $('#modal').hidden = true; document.body.style.overflow = ''; }
  function mapView(host, c) {
    host.classList.add('mcarousel');
    const u = getUserLoc();
    const t = (u && c.lat && c.lng) ? `${fmtMi(milesBetween(u, c))} from your location` : 'Contractor location';
    host.innerHTML = `<div class="mcar__map" id="mMap"></div><span class="mcar__maptag">${spotUse('si-pin')} ${esc(t)}</span>`;
    initMiniMap(c);
  }
  function photoLayers(src, alt) {
    const frag = document.createDocumentFragment();
    const bg = el('div', 'mphoto__bg'); bg.style.backgroundImage = `url("${src}")`;
    const im = el('img', 'mphoto__img'); im.src = src; im.alt = alt || ''; im.loading = 'lazy'; im.referrerPolicy = 'no-referrer';
    frag.append(bg, im);
    return frag;
  }
  function buildCarousel(host, c) {
    host.classList.add('mcarousel');
    const imgs = (c.images || []).slice();
    const mapIdx = Math.floor((imgs.length + 1) / 2);
    const track = el('div', 'mcar__track');
    const addImg = (src) => { const s = el('div', 'mcar__slide'); s.append(photoLayers(src, c.name)); track.append(s); };
    const u = getUserLoc();
    const t = (u && c.lat && c.lng) ? `${fmtMi(milesBetween(u, c))} from your location` : 'Pin your location below for distance';
    const addMap = () => { const s = el('div', 'mcar__slide mcar__slide--map'); s.innerHTML = `<div class="mcar__map" id="mMap"></div><span class="mcar__maptag">${spotUse('si-pin')} ${esc(t)}</span>`; track.append(s); };
    imgs.forEach((src, i) => { if (i === mapIdx) addMap(); addImg(src); });
    if (mapIdx >= imgs.length) addMap();
    host.append(track);
    const total = track.children.length;
    const dots = el('div', 'mcar__dots'); let idx = 0;
    const go = (i) => { idx = (i + total) % total; track.style.transform = `translateX(${-idx * 100}%)`; [...dots.children].forEach((d, j) => d.classList.toggle('is-active', j === idx)); if (idx === mapIdx) initMiniMap(c); };
    for (let i = 0; i < total; i++) { const d = el('button'); if (i === 0) d.classList.add('is-active'); d.onclick = () => go(i); dots.append(d); }
    host.append(dots);
    const nav = (dir) => { const b = el('button', `mcar__nav mcar__nav--${dir}`); b.innerHTML = dir === 'prev' ? '‹' : '›'; b.onclick = () => go(idx + (dir === 'prev' ? -1 : 1)); return b; };
    host.append(nav('prev'), nav('next'));
  }
  function initMiniMap(c) {
    const mapEl = $('#mMap'); if (!mapEl || mapEl.dataset.init || !(c.lat && c.lng)) return;
    loadLeaflet().then(() => {
      mapEl.dataset.init = '1';
      const L = window.L;
      const map = L.map(mapEl, { zoomControl: false }).setView([c.lat, c.lng], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
      L.marker([c.lat, c.lng], { icon: mapPin(L, '#13312a') }).addTo(map).bindPopup(esc(c.name)).openPopup();
      const u = getUserLoc();
      if (u) {
        L.marker([u.lat, u.lng], { icon: mapPin(L, '#0e7a5f') }).addTo(map).bindPopup('You');
        L.polyline([[u.lat, u.lng], [c.lat, c.lng]], { color: '#0e7a5f', weight: 3, dashArray: '6 6' }).addTo(map);
        const mid = [(u.lat + c.lat) / 2, (u.lng + c.lng) / 2];
        L.marker(mid, { interactive: false, zIndexOffset: 1000, icon: L.divIcon({ className: 'mcar__distpin', html: `<span>${fmtMi(milesBetween(u, c))} away</span>`, iconSize: [0, 0], iconAnchor: [0, 0] }) }).addTo(map);
        map.fitBounds(L.latLngBounds([[u.lat, u.lng], [c.lat, c.lng]]).pad(0.35));
      }
      setTimeout(() => map.invalidateSize(), 60);
    }).catch(() => { mapEl.innerHTML = '<p class="mcar__maperr">Map unavailable.</p>'; });
  }

  /* ---------- Browse sheet — "Georgia, lit up" ---------------
     Map / Cities / Counties / ZIPs. Data comes from ctx.loadBrowse()
     ({cities,counties,zips}) — the home passes its in-memory index,
     the generated pages lazy-fetch /browse-index.json. */
  let browseData = null, BEACONS = [];
  let browseSeg = 'map', browseSel = null, browseQ = '';
  let browseMapObj = null, browseMarkers = {};
  const tileThumb = (lat, lng, z = 11, h = 56) => (lat && lng)
    ? `<div class="mtile" style="height:${h}px;background-image:linear-gradient(0deg,rgba(14,33,28,.32),rgba(14,33,28,.05)),url('${tileUrl(lat, lng, z)}')"></div>`
    : `<div class="mtile mtile--blank" style="height:${h}px"></div>`;
  function beaconIcon(b, on) {
    const d = Math.round((5 + Math.sqrt(b.count) * 0.35) * 2 * (on ? 1.5 : 1));
    return window.L.divIcon({ className: 'bmarker', iconSize: [0, 0], html:
      `<span class="bdot${on ? ' on' : ''}" style="width:${d}px;height:${d}px">${on ? '<i class="bdot__pulse"></i>' : ''}</span>${on ? `<span class="bdot__lbl">${esc(b.name)}</span>` : ''}` });
  }
  function initBrowseMap() {
    const elMap = $('#browseMap'); if (!elMap) return;
    loadLeaflet().then(() => {
      const L = window.L;
      if (browseMapObj) { try { browseMapObj.remove(); } catch { /* ignore */ } browseMapObj = null; }
      const map = L.map(elMap, { zoomControl: false, attributionControl: false, scrollWheelZoom: false }).setView([32.7, -83.3], 6);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
      browseMarkers = {};
      BEACONS.forEach(b => {
        const on = b.name === browseSel;
        const m = L.marker([b.lat, b.lng], { icon: beaconIcon(b, on), zIndexOffset: on ? 1000 : 0 }).addTo(map);
        m.on('click', () => { browseSel = b.name; updateBrowseSel(); });
        browseMarkers[b.name] = m;
      });
      if (BEACONS.length) map.fitBounds(L.latLngBounds(BEACONS.map(b => [b.lat, b.lng])).pad(0.25));
      setTimeout(() => map.invalidateSize(), 80);
      browseMapObj = map;
    }).catch(() => { const e = $('#browseMap'); if (e) e.innerHTML = '<p class="bsheet__empty">Map unavailable.</p>'; });
  }
  function updateBrowseSel() {
    Object.entries(browseMarkers).forEach(([name, m]) => { const b = BEACONS.find(x => x.name === name); const on = name === browseSel; m.setIcon(beaconIcon(b, on)); m.setZIndexOffset(on ? 1000 : 0); });
    const dw = $('#browseDockWrap'); if (dw) dw.innerHTML = browseDock();
    $('#browseChips')?.querySelectorAll('.bchip').forEach(ch => ch.classList.toggle('on', ch.dataset.city === browseSel));
    const b = BEACONS.find(x => x.name === browseSel); if (b && browseMapObj) browseMapObj.panTo([b.lat, b.lng], { animate: true });
  }
  function browseDock() {
    const b = BEACONS.find(x => x.name === browseSel); if (!b) return '';
    return `<div class="bdock"><div class="bdock__tile">${tileThumb(b.lat, b.lng, 11, 56)}</div>
      <div class="bdock__t"><div class="bdock__n">${esc(b.name)}</div><div class="bdock__s">${b.count.toLocaleString()} licensed pros</div></div>
      <a class="bdock__open" href="${b.href}">Open →</a></div>`;
  }
  function browseListHTML() {
    const data = browseSeg === 'cities' ? browseData.cities : browseSeg === 'counties' ? browseData.counties : browseData.zips;
    const q = browseQ.trim().toLowerCase();
    const items = data.filter(t => !q || t.name.toLowerCase().includes(q));
    if (!items.length) return '<p class="bsheet__empty">No matches — try another spelling.</p>';
    if (browseSeg === 'zips') {
      return `<div class="bzips">${items.slice(0, 120).map(z => { const code = esc(z.name.split(' ')[0]); return `<a class="bzip" href="${z.href}"><div class="bzip__c">${code}</div><div class="bzip__l">${z.count} pros</div></a>`; }).join('')}</div>`;
    }
    const z = browseSeg === 'cities' ? 11 : 9;
    return `<div class="blist">${items.slice(0, 240).map(c => `<a class="brow" href="${c.href}"><div class="brow__tile">${tileThumb(c.lat, c.lng, z, 54)}</div><div class="brow__t"><div class="brow__n">${esc(c.name)}</div><div class="brow__s">${c.count.toLocaleString()} licensed pros</div></div><span class="brow__chev">›</span></a>`).join('')}</div>`;
  }
  function renderBrowseBody() {
    const body = $('#browseBody'); if (!body) return;
    if (browseSeg === 'map') {
      body.innerHTML = `<div id="browseMap" class="bmap"></div><div id="browseDockWrap">${browseDock()}</div>
        <div class="bchips" id="browseChips">${BEACONS.map(b => `<button class="bchip${browseSel === b.name ? ' on' : ''}" data-city="${esc(b.name)}">${esc(b.name)} <span>${b.count}</span></button>`).join('')}</div>`;
      initBrowseMap();
    } else {
      if (browseMapObj) { try { browseMapObj.remove(); } catch { /* ignore */ } browseMapObj = null; }
      const ph = browseSeg === 'cities' ? 'Find a city…' : browseSeg === 'counties' ? 'Find a county…' : 'Find a ZIP…';
      body.innerHTML = `<label class="bsearch"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg><input id="browseSearch" type="search" placeholder="${ph}" autocomplete="off" value="${esc(browseQ)}"/></label><div id="blistWrap">${browseListHTML()}</div>`;
      $('#browseSearch').addEventListener('input', (e) => { browseQ = e.target.value; $('#blistWrap').innerHTML = browseListHTML(); });
    }
  }
  function moveSeg() { const idx = ['map', 'cities', 'counties', 'zips'].indexOf(browseSeg); const ind = $('#bsegInd'); if (ind) ind.style.left = `calc(${idx * 25}% + 3px)`; }
  async function ensureBrowse() {
    if (browseData) return;
    try { browseData = await (ctx.loadBrowse ? ctx.loadBrowse() : null); } catch { browseData = null; }
    browseData = browseData || { cities: [], counties: [], zips: [] };
    BEACONS = (browseData.cities || []).filter(c => c.lat && c.lng).slice(0, 9).map(c => ({ name: c.name, href: c.href, count: c.count, lat: c.lat, lng: c.lng }));
    if (!browseSel && BEACONS[0]) browseSel = BEACONS[0].name;
  }
  async function openBrowse() {
    const sheet = $('#browseSheet'); if (!sheet) return;
    sheet.hidden = false; document.body.style.overflow = 'hidden'; moveSeg();
    if (!browseData) { const b = $('#browseBody'); if (b) b.innerHTML = '<p class="bsheet__empty">Loading…</p>'; }
    await ensureBrowse();
    renderBrowseBody();
  }
  function closeBrowse() { const s = $('#browseSheet'); if (s) { s.hidden = true; document.body.style.overflow = ''; } }

  /* ---------- Saved sheet (hearted contractors) ------------- */
  function renderSavedSheet() {
    const body = $('#savedBody'); if (!body) return;
    const names = [...saved];
    const cnt = $('#savedCount'); if (cnt) cnt.textContent = `(${names.length})`;
    if (!names.length) {
      body.innerHTML = `<div class="ssheet__empty">
        <div class="ssheet__emptyic">${heartSVG(false).replace(/stroke="#fff"/, 'stroke="#0e7a5f"')}</div>
        <div class="ssheet__emptyh">No saves yet</div>
        <p class="ssheet__emptyp">Tap the heart on any contractor to build your shortlist — it makes comparing quotes much easier.</p>
        <button class="ssheet__browse" type="button" data-sclose>Browse contractors</button></div>`;
      return;
    }
    body.innerHTML = '';
    names.forEach(name => {
      const c = ctx.resolve?.(name) || { name };
      const row = el('div', 'srow');
      const ph = el('div', 'srow__ph'); ph.append(photoEl(c));
      const text = el('div', 'srow__t');
      text.innerHTML = `<div class="srow__n">${esc(c.name)}</div><div class="srow__s">${esc(c.type || 'Contractor')}${c.cityName ? ' · ' + esc(c.cityName) : ''}</div>${c.rating ? `<div class="srow__r">${STAR(11)} ${c.rating}${c.reviews ? ` <span>(${c.reviews})</span>` : ''}</div>` : ''}`;
      const view = el('button', 'srow__view'); view.textContent = 'View'; view.addEventListener('click', () => { closeSaved(); openModal(c); });
      row.append(ph, text, view, saveBtn(c, 'srow__heart'));
      body.append(row);
    });
  }
  function openSaved() { const s = $('#savedSheet'); if (!s) return; s.hidden = false; document.body.style.overflow = 'hidden'; renderSavedSheet(); }
  function closeSaved() { const s = $('#savedSheet'); if (s) { s.hidden = true; document.body.style.overflow = ''; } }

  // wire the sheet chrome once (segment switch, beacon/chip select, closers)
  let sheetsWired = false;
  function initSheets() {
    if (sheetsWired) return; sheetsWired = true;
    $('#browseSheet')?.addEventListener('click', (e) => { if (e.target.dataset.bclose !== undefined) closeBrowse(); });
    $('#browseSeg')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-seg]'); if (!b) return;
      browseSeg = b.dataset.seg; browseQ = '';
      $('#browseSeg').querySelectorAll('.bseg__btn').forEach(x => x.classList.toggle('is-active', x === b));
      moveSeg(); renderBrowseBody();
    });
    $('#browseBody')?.addEventListener('click', (e) => { const c = e.target.closest('[data-city]'); if (c) { browseSel = c.dataset.city; updateBrowseSel(); } });
    $('#savedSheet')?.addEventListener('click', (e) => { if (e.target.dataset.sclose !== undefined) closeSaved(); });
  }

  // keep an open saved sheet in sync when a heart is toggled
  const _onSave = ctx.onSaveChange;
  ctx.onSaveChange = () => { if ($('#savedSheet') && !$('#savedSheet').hidden) renderSavedSheet(); _onSave?.(); };

  return {
    distMi, photoEl, phEl, saveBtn, burst, toggleSave, sectionHead,
    buildCard, hydrateCard, refreshCardDistance,
    premiumCardEl, renderPremium, renderStandard,
    openModal, closeModal, shareListing,
    renderMemory, addRecent,
    openBrowse, closeBrowse, openSaved, closeSaved, renderSavedSheet, initSheets,
    getLastOpen: () => lastOpen,
  };
}
