// ============================================================
//  Shared render "components" — pure functions returning HTML
//  strings. The single source of truth for a card / spotlight /
//  claim card, used by BOTH the Node generator (SSR for SEO) and
//  the browser (app.js builds nodes from these strings, then
//  hydrates them). Isomorphic: no DOM, no Node-only APIs.
// ============================================================
import { esc, initials, telHref, openStatus } from './format.mjs';
import { colorFor, stockFor } from './palette.mjs';
import { tileUrl, PIN_SVG } from './geo.mjs';
import { spotUse, perkIcon } from './icons.mjs';

export const CLAIM_EMAIL = 'artivicolab@gmail.com'; // only ever in a mailto href — never visible text

// best usable image: a real http photo, else the first gallery image (paid demos)
const hasImg = (c) => typeof c.image === 'string' && /^https?:/.test(c.image);
const imgOf = (c) => hasImg(c) ? c.image : (Array.isArray(c.images) && c.images[0]) || null;

/* ---------- listing card ----------------------------------- */
export function placeholderHTML(c) {
  if (c.lat && c.lng) return `<div class="card__ph card__ph--map" style="background-image:url(&quot;${tileUrl(c.lat, c.lng)}&quot;)"><span class="card__ph-pin">${PIN_SVG('#1b2536')}</span></div>`;
  return `<div class="card__ph" style="background:${colorFor(c.id)}">${esc(initials(c.name))}</div>`;
}
export function thumbInner(c) {
  const img = imgOf(c);
  if (img) {
    const fb = (c.lat && c.lng) ? `this.onerror=null;this.src='${tileUrl(c.lat, c.lng)}';this.classList.add('card__img--map')` : `this.style.display='none'`;
    return `<img class="card__img" loading="lazy" referrerpolicy="no-referrer" alt="${esc(c.name)}" src="${esc(img)}" onerror="${fb}"/>`;
  }
  return placeholderHTML(c);
}
export function cardHTML(c) {
  return `<article class="card" tabindex="0" data-id="${esc(c.id)}">
    <div class="card__thumb">
      ${thumbInner(c)}
      ${c.rating ? `<span class="card__rate">★ ${c.rating}${c.reviews ? ` <span style="opacity:.7;font-weight:600">(${c.reviews})</span>` : ''}</span>` : ''}
      ${c.licensed ? `<span class="card__lic">Licensed</span>` : ''}
      <div class="card__play"><span>▶</span></div>
    </div>
    <div class="card__body">
      <div class="card__avatar" style="background:${colorFor(c.id)}">${esc(initials(c.name))}</div>
      <div class="card__text">
        <div class="card__name">${esc(c.name)}</div>
        <div class="card__sub">${esc(c.type)} · ${esc(c.cityName)}</div>
      </div>
    </div>
  </article>`;
}

/* ---------- claim cards ------------------------------------ */
// "contact us" claim card — the LAST card of each tier row (mailto only).
export function claimCardHTML(tier, place = 'Georgia') {
  const head = tier === 'premium' ? `Top of ${esc(place)}<br>contractor searches` : `Stand out across<br>${esc(place)}`;
  const sub = tier === 'premium'
    ? `Be the contractor pinned above every free listing when homeowners search your trade.`
    : `Add your photo, services, hours and website link on every relevant page.`;
  const price = tier === 'premium'
    ? 'Premium · <s>$149</s> <b>$20</b>/mo · top of the page'
    : 'Standard · <s>$49</s> <b>$9</b>/mo · enhanced placement';
  const subject = encodeURIComponent(`${tier === 'premium' ? 'Premium' : 'Standard'} placement in ${place}`);
  return `<article class="card claim claim--${tier}">
    <div class="claim__eyebrow">Your business here <span class="claim__sale">Limited-time</span></div>
    <div class="claim__h">${head}</div>
    <div class="claim__p">${sub}</div>
    <div class="claim__price">${price}</div>
    <a class="claim__btn" href="mailto:${CLAIM_EMAIL}?subject=${subject}" target="_blank" rel="noopener">Claim this spot →</a>
  </article>`;
}
// "own this business?" strip — the last card of the all-listings grid.
export function ownCardHTML(place) {
  const subject = encodeURIComponent(`Claim my listing in ${place}`);
  return `<article class="card claim claim--own">
    <div class="claim__eyebrow">Own a business here?</div>
    <div class="claim__h">Claim &amp;<br>verify it</div>
    <div class="claim__p">Update your details and get your Licensed &amp; Insured badge. Free to verify.</div>
    <a class="claim__btn" href="mailto:${CLAIM_EMAIL}?subject=${subject}" target="_blank" rel="noopener">Contact us →</a>
  </article>`;
}

/* ---------- spotlight billboard (Featured / Standard) ------ */
// Premium shows the perk ticker; Standard is the same card without it. The live
// status / perk auto-advance / pills scroll / distance chip are wired by the
// client (hydrateSpot). Example/demo listings show a claim CTA, not "Call now".
export function spotCardHTML(c, premium) {
  const st = openStatus(c.hours);
  const isOpen = st && (st.state === 'open' || st.state === 'closing');
  const perks = premium ? ((c.perks && c.perks.length) ? c.perks : (c.offer ? [c.offer] : [])) : [];
  const fallback = c.lat && c.lng ? tileUrl(c.lat, c.lng) : stockFor(c.id);
  const imgSrc = (Array.isArray(c.images) && c.images[0]) || (hasImg(c) ? c.image : '') || fallback;
  const statusHtml = (st || c.hoursText) ? `<span class="spot-status ${isOpen ? 'open' : 'closed'}"><span class="spot-dot"></span>${esc(st ? st.label : c.hoursText)}</span>` : '';
  const perksHtml = perks.length
    ? `<div class="spot-perks"><div class="spot-perks-view"><div class="spot-track">${perks.map(p => `<div class="spot-perk"><span class="spot-perk-ic">${spotUse(perkIcon(p))}</span><span>${esc(p)}</span></div>`).join('')}</div></div><div class="spot-prog"><i></i></div></div>`
    : '';
  const pillsHtml = (c.services && c.services.length)
    ? `<div class="spot-pills-wrap"><div class="spot-pills">${c.services.map(s => `<span class="spot-pill">${esc(s)}</span>`).join('')}</div>
        <button class="spot-pills-arrow spot-pills-arrow--prev is-hidden" aria-label="Previous services">${spotUse('si-chev')}</button>
        <button class="spot-pills-arrow spot-pills-arrow--next" aria-label="More services">${spotUse('si-chev')}</button>
      </div>`
    : '';
  return `<article class="spot${premium ? '' : ' spot--std'}" tabindex="0" data-id="${esc(c.id)}">
    <div class="spot-bg"><img class="spot-img" alt="" referrerpolicy="no-referrer" src="${esc(imgSrc)}" onerror="this.onerror=null;this.src='${fallback}'"></div>
    <div class="spot-grain" aria-hidden="true"></div>
    <div class="spot-top">
      <div class="spot-rating">${spotUse('si-star')}
        <div>
          <div class="spot-score">${(Number(c.rating) || 0).toFixed(1)}</div>
          <div class="spot-reviews">${c.reviews ? `${c.reviews} reviews` : 'New'}</div>
          <div class="spot-rank">Top-rated in ${esc(c.cityName)}</div>
        </div>
      </div>
      <div class="spot-seals">${c.licensed ? `<span class="spot-verified">${spotUse('si-check')} Licensed &amp; insured</span>` : ''}</div>
    </div>
    <div class="spot-content">
      ${statusHtml}
      <div class="spot-kicker">${esc(c.type)}</div>
      <h3 class="spot-name">${esc(c.name)}</h3>
      <p class="spot-desc">${esc(c.description || '')}</p>
      ${perksHtml}
      ${pillsHtml}
    </div>
    <div class="spot-bar">
      <div class="spot-bar-left">
        ${c.example
          ? `<a class="spot-call" href="mailto:${CLAIM_EMAIL}?subject=${encodeURIComponent('Claim a featured placement')}" target="_blank" rel="noopener">${spotUse('si-check')} Claim this spot</a>`
          : `<a class="spot-call" href="${c.phone ? telHref(c.phone) : '#'}">${spotUse('si-phone')} Call now</a>`}
      </div>
    </div>
  </article>`;
}
