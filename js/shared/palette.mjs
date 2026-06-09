// ============================================================
//  Shared placeholder palette — the deterministic colour + tinted
//  jobsite-photo treatment for listings with no photo of their own.
//  Isomorphic (Node generator + browser). Single-quoted url() so the
//  same string is valid both inside an HTML style="" attribute and
//  when assigned to element.style.backgroundImage.
// ============================================================
import { hash } from './format.mjs';

// Muted, varied solid palette (warm + cool) — deterministic per listing id.
export const PALETTE = [
  '#3a6bb0', '#4f7a8a', '#5e7c8c', '#6b6f93', '#5b7d9c', '#4a6fa5', '#3f7d77',
  '#6a7d93', '#5b8190', '#7a8a99', '#4d6a86', '#566f8a', '#6f8a9c', '#5f6b86',
];
export const colorFor = (id) => PALETTE[hash(id) % PALETTE.length];

// Local jobsite photos behind any listing with no photo, tinted with the
// listing's palette colour (served from the site root → absolute path).
export const STOCK = ['hero-1', 'hero-2', 'hero-3', 'pattern-1', 'pattern-2'].map(n => `/images/${n}.jpg`);
export const stockFor = (id) => STOCK[hash(id + 'p') % STOCK.length];
export const tintedBg = (id, alpha = 'b3') => { const c = colorFor(id); return `linear-gradient(0deg, ${c}${alpha}, ${c}${alpha}), url('${stockFor(id)}')`; };
