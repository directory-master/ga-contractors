// ============================================================
//  Shared SVG icon sprite + helpers. The sprite is injected once
//  per page (server-rendered into the generated pages; injected by
//  app.js on the home page). `spotUse(id)` references a symbol.
// ============================================================
export const SPOT_SPRITE = `<svg id="spot-sprite" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden"><defs>
  <symbol id="si-star" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.8 6.1 20.8l1.2-6.6L2.5 9l6.6-.9z"/></symbol>
  <symbol id="si-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4.5"/></symbol>
  <symbol id="si-award" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="6"/><path d="M9 14.5L7.5 22l4.5-2.5L16.5 22 15 14.5"/></symbol>
  <symbol id="si-clock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></symbol>
  <symbol id="si-card" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/></symbol>
  <symbol id="si-phone" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 2.5c.5 0 1 .3 1.2.8l1.4 3.3c.2.5.1 1-.3 1.4L7.5 9.5c1 2.1 2.8 3.9 5 5l1.5-1.4c.4-.4.9-.5 1.4-.3l3.3 1.4c.5.2.8.7.8 1.2v3.2c0 .8-.7 1.5-1.5 1.4C9.3 19.7 4.3 14.7 3.4 5.4 3.3 4.6 4 3.9 4.8 3.9z"/></symbol>
  <symbol id="si-pin" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></symbol>
  <symbol id="si-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5 11-11"/></symbol>
  <symbol id="si-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></symbol>
  <symbol id="si-globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 16 0 18M12 3c-2.5 2.5-2.5 16 0 18"/></symbol>
  <symbol id="si-compass" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M16.2 7.8l-2 5.4-5.4 2 2-5.4z" fill="currentColor" stroke="none"/></symbol>
</defs></svg>`;

export const spotUse = (id) => `<svg class="spot-ic"><use href="#${id}"/></svg>`;

// pick an icon that suits a perk's wording
export function perkIcon(text) {
  const t = text.toLowerCase();
  if (/financ|0%|payment|month/.test(t)) return 'si-card';
  if (/warrant|guarantee|insured|bonded|licens/.test(t)) return 'si-shield';
  if (/fixed|no surprise|contract|estimate|quote/.test(t)) return 'si-check';
  if (/year|award|best|top|experience|project/.test(t)) return 'si-award';
  if (/same-?week|time|fast|on time|schedule/.test(t)) return 'si-clock';
  return 'si-star';
}
