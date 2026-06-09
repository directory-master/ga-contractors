// ============================================================
//  Shared formatting / scoring helpers — pure + isomorphic.
//  Safe to import from the Node generator AND the browser
//  (app.js / page.js). No DOM, no Node-only APIs.
// ============================================================
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
export const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const hash = (str) => { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h); };
export const initials = (name) => String(name).replace(/[^a-zA-Z ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'GA';
export const ratingScore = (c) => (c.rating || 0) * Math.log10((c.reviews || 0) + 10);
export const telHref = (p) => 'tel:' + String(p).replace(/[^\d+]/g, '');
export const fmtMi = (mi) => mi == null ? '' : (mi < 10 ? mi.toFixed(1) : Math.round(mi)) + ' mi';

// great-circle distance in miles (haversine)
export const milesBetween = (a, b) => {
  const R = 3958.8, rad = d => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// 12-hour clock from minutes-since-midnight
export const fmtClock = (min) => { let h = Math.floor(min / 60), m = min % 60; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return m ? `${h}:${String(m).padStart(2, '0')} ${ap}` : `${h} ${ap}`; };

// open / closing-soon / opening-soon (2-hour window) / closed, from structured
// hours: [Sun…Sat], each [openMinute, closeMinute] or null.
export function openStatus(hours) {
  if (!Array.isArray(hours)) return null;
  const now = new Date(), mins = now.getHours() * 60 + now.getMinutes(), t = hours[now.getDay()], SOON = 120;
  if (t && mins >= t[0] && mins < t[1]) return (t[1] - mins <= SOON) ? { state: 'closing', label: `Closing soon · ${fmtClock(t[1])}` } : { state: 'open', label: `Open · closes ${fmtClock(t[1])}` };
  if (t && mins < t[0] && t[0] - mins <= SOON) return { state: 'opening', label: `Opening soon · ${fmtClock(t[0])}` };
  return { state: 'closed', label: t ? `Closed · opens ${fmtClock(t[0])}` : 'Closed today' };
}
