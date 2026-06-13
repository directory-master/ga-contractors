// ============================================================
//  Cookie-consent banner — Google Consent Mode gate over the GA4
//  tag. analytics_storage defaults to 'denied' in every page's
//  <head>; this only flips it to 'granted' once the visitor accepts.
//  Choice persists in localStorage; the bar is shown only until a
//  choice is made. Browser-only — imported + mounted by app.js and
//  page.js so it rides on every page without extra markup. [[analytics]]
// ============================================================

const KEY = 'gacontractors:consent';          // 'granted' | 'denied'

function setConsent(value) {
  try { localStorage.setItem(KEY, value); } catch { /* private mode */ }
  try {
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', { analytics_storage: value });
    }
  } catch { /* gtag blocked */ }
}

export function mountConsent() {
  if (typeof document === 'undefined') return;

  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* ignore */ }

  // Already chose — re-apply a prior "granted" (the <head> default is denied)
  // and never show the bar again.
  if (saved === 'granted') { setConsent('granted'); return; }
  if (saved === 'denied') return;

  const bar = document.createElement('div');
  bar.className = 'cookiebar';
  bar.setAttribute('role', 'dialog');
  bar.setAttribute('aria-label', 'Cookie consent');
  bar.innerHTML = `
    <p class="cookiebar__text">We use cookies to measure traffic and improve Georgia Contractors.
      You can accept or decline analytics cookies. See our
      <a href="/privacy/">Privacy Policy</a>.</p>
    <div class="cookiebar__actions">
      <button type="button" class="cookiebar__btn cookiebar__btn--ghost" data-consent="denied">Decline</button>
      <button type="button" class="cookiebar__btn cookiebar__btn--accept" data-consent="granted">Accept</button>
    </div>`;

  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-consent]');
    if (!btn) return;
    setConsent(btn.getAttribute('data-consent'));
    bar.classList.add('is-hiding');
    setTimeout(() => bar.remove(), 260);
  });

  document.body.appendChild(bar);
  requestAnimationFrame(() => bar.classList.add('is-in'));
}
