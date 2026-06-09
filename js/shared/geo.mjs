// ============================================================
//  Shared geo helpers — static OSM tile math + the inline map pin.
//  Isomorphic; `mapPin` (needs a live Leaflet L) lives in the
//  browser-only maps.mjs instead.
// ============================================================
const tileXY = (lat, lng, z) => { const n = 2 ** z; return { x: Math.floor((lng + 180) / 360 * n), y: Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n) }; };
// a single no-API-key OSM raster tile for a lat/lng — the "static map" placeholder
export const tileUrl = (lat, lng, z = 12) => { const { x, y } = tileXY(lat, lng, z); return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`; };
// inline-SVG map pin (used as a Leaflet divIcon and as the static-tile pin)
export const PIN_SVG = (color) => `<svg width="28" height="38" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z" fill="${color}"/><circle cx="12" cy="12" r="4.5" fill="#fff"/></svg>`;
