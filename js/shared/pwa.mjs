// ============================================================
//  PWA — installable app. Registers the service worker and drives
//  the install button in the header bar (#installBtn). Browser-only;
//  imported + initialised by app.js and page.js so it works on every
//  page. The icon shows whenever the site runs in a browser tab (not
//  already installed): a real install prompt on Chrome/Edge/Android,
//  a short "add to home screen" hint elsewhere.
// ============================================================
let deferred = null;

function toast(msg) {
  let t = document.getElementById('pwaToast');
  if (!t) { t = document.createElement('div'); t.id = 'pwaToast'; t.className = 'pwa-toast'; document.body.appendChild(t); }
  t.textContent = msg;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 4200);
}
function manualHint() {
  const ua = navigator.userAgent || '';
  if (/iphone|ipad|ipod/i.test(ua)) return 'To install: tap the Share button, then “Add to Home Screen”.';
  return 'To install: open your browser menu and choose “Install app” / “Add to Home Screen”.';
}

export function initPWA() {
  if (typeof window === 'undefined') return;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* ignore */ }); });
  }

  const btn = document.getElementById('installBtn');
  if (!btn) return;

  const installed = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (installed) { btn.hidden = true; return; }
  btn.hidden = false;   // running in a browser tab → offer to install

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
  window.addEventListener('appinstalled', () => { deferred = null; btn.hidden = true; toast('Installed. Find Georgia Contractors on your home screen.'); });

  btn.addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch { /* ignore */ }
      deferred = null;
    } else {
      toast(manualHint());
    }
  });
}
