// ============================================================
//  Shared analytics — thin wrapper over the GA4 gtag.js tag that
//  is loaded in every page's <head> (id G-9YDPWCQBVT). Safe no-ops
//  if gtag hasn't loaded / is blocked. Browser-only.
// ============================================================
export const GA_ID = 'G-9YDPWCQBVT';

// fire a GA4 event (no-op until gtag is ready / if blocked by an ad-blocker)
export function track(event, params = {}) {
  try { if (typeof window !== 'undefined' && typeof window.gtag === 'function') window.gtag('event', event, params); } catch { /* ignore */ }
}

// One delegated, capture-phase listener that turns the high-value link clicks
// into GA4 events: phone calls, email leads, and (inside the detail modal) the
// website + directions buttons. `getCtx` supplies the current listing context.
export function wireLinkTracking(getCtx = () => ({})) {
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    const ctx = getCtx() || {};
    if (href.startsWith('tel:')) track('click_call', ctx);
    else if (href.startsWith('mailto:')) track('generate_lead', { ...ctx, method: 'email' });
    else if (a.closest('#mActions')) {
      if (/[?&/]maps|google\.com\/maps/.test(href)) track('get_directions', ctx);
      else if (/^https?:/.test(href)) track('click_website', ctx);
    }
  }, true);
}
