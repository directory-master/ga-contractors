// ============================================================
//  Shared browser-only Leaflet helpers (app.js + page.js).
//  Lazy-loads the self-hosted Leaflet, the inline divIcon pin, and
//  the live "card map" that replaces the static-tile placeholder on
//  no-photo cards so the marker is centred and accurate.
//  NOT imported by the Node generator (needs the DOM / window.L).
// ============================================================
import { PIN_SVG } from './geo.mjs';

let leafletLoading = null;
export function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (leafletLoading) return leafletLoading;
  leafletLoading = new Promise((res, rej) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/vendor/leaflet/leaflet.css'; document.head.append(css);
    const s = document.createElement('script'); s.src = '/vendor/leaflet/leaflet.js'; s.onload = res; s.onerror = rej; document.head.append(s);
  });
  return leafletLoading;
}

export const mapPin = (L, color) => L.divIcon({ className: 'map-pin', html: PIN_SVG(color), iconSize: [28, 38], iconAnchor: [14, 38], popupAnchor: [0, -34] });

// Turn a no-photo card's `.card__ph--map` div into a real Leaflet map centred on
// the contractor (with the user pin + distance line when a location is pinned),
// so the marker matches the map — replacing the off-centre static tile.
export function initCardMap(elm, c, userLoc) {
  if (!elm || elm.dataset.init || !(c && c.lat && c.lng)) return;
  loadLeaflet().then(() => {
    elm.dataset.init = '1'; elm.innerHTML = '';
    const L = window.L;
    const map = L.map(elm, { zoomControl: false, attributionControl: false, dragging: false,
      scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, tap: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    L.marker([c.lat, c.lng], { icon: mapPin(L, '#1b2536') }).addTo(map);
    if (userLoc) {
      L.marker([userLoc.lat, userLoc.lng], { icon: mapPin(L, '#1750cc') }).addTo(map);
      L.polyline([[userLoc.lat, userLoc.lng], [c.lat, c.lng]], { color: '#1750cc', weight: 2, dashArray: '5 6', opacity: .85 }).addTo(map);
      map.fitBounds(L.latLngBounds([[userLoc.lat, userLoc.lng], [c.lat, c.lng]]).pad(0.3));
    } else { map.setView([c.lat, c.lng], 12); }
    setTimeout(() => map.invalidateSize(), 60);
  }).catch(() => { /* offline → the static tile + pin already shown stays */ });
}

// Lazily initialise card maps as they scroll into view (cheap for long grids).
// `getUserLoc` is read at init time so a just-pinned location is reflected.
let cardMapObs = null;
export function observeCardMap(elm, c, getUserLoc) {
  if (!elm) return;
  elm._c = c; elm._getUser = getUserLoc;
  if (!('IntersectionObserver' in window)) { initCardMap(elm, c, getUserLoc()); return; }
  if (!cardMapObs) cardMapObs = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { cardMapObs.unobserve(e.target); initCardMap(e.target, e.target._c, e.target._getUser()); }
  }, { rootMargin: '150px' });
  cardMapObs.observe(elm);
}
