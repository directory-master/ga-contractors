// GA.Contractors importer (append mode): Bing Maps scraper CSV(s) →
// js/data/contractors-imported.js. The EXISTING dataset is the baseline; only
// genuinely NEW contractors (not already present by id or name+address) are
// appended, so re-running never disturbs or reorders the current listings.
//
//   node scripts/import-csv.mjs                 # all ~/Downloads/Bing_Maps_Scraper_*.csv
//   node scripts/import-csv.mjs a.csv b.csv     # specific files
//
// Only GA CONTRACTOR rows are kept; off-vertical scrapes (roofing, plumbing,
// HVAC, suppliers, …) are filtered out at ingest (isContractorRow). Imported
// rows are tier:'free', licensed:false (the badge is granted only on manual
// verification) and get `hoursText` (display) but no structured `hours`.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CATEGORIES } from '../js/data/categories.js';
import { IMPORTED } from '../js/data/contractors-imported.js';

const DOWNLOADS = `${process.env.HOME}/Downloads`;
const SRCS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : (existsSync(DOWNLOADS) ? readdirSync(DOWNLOADS) : [])
      .filter(f => /^Bing_Maps_Scraper_.*\.csv$/i.test(f)).sort().map(f => join(DOWNLOADS, f));

const kebab = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ─── the gate: GA address + a categories.js trade + name sanity ─────────── */
const SPECIFIC = CATEGORIES.filter(c => c.slug !== 'general-contractor')
  .map(c => ({ type: c.type, syns: [...c.synonyms].sort((a, b) => b.length - a.length) }));
const GENERIC = new Set([
  'building contractor', 'contractor', 'general contractor', 'construction services',
  'construction company', 'construction', 'home service', 'home services', 'handyman',
  'remodeling contractor', 'home improvement',
]);
const NAME_EXCLUDE = /\b(supply|supplies|depot|wholesale|distribut\w*|manufactur\w*|equipment|rentals?|hardware|warehouse)\b/i;
const SPECIALIZED = /\b(roof\w*|electric\w*|mechanical|hvac|heating|air[\s-]?condition\w*|furnace|a\/?c repair|plumb\w*|landscap\w*|lawn|tree (service|removal|trimming)|arborist|concrete|mason\w*|paving|asphalt|driveway|grading|excavat\w*|erosion|land develop\w*|floor(ing|s)?|hardwood|carpet|\btile\b|paint\w*|\bpool\b|solar|gutter\w*|garage door\w*|\bpest\b|exterminat\w*|termite|water damage|fire damage|\bmold\b|restoration|foundation|waterproof\w*|window\w*|fenc\w*|\bdeck\b|cleaning|janitorial|\bmaid\b|junk|hauling|septic|well drilling)\b/i;

function inferType(name, category) {
  const hay = `${name} ${category}`.toLowerCase();
  if (SPECIALIZED.test(hay)) return null;
  for (const t of SPECIFIC) if (t.syns.some(syn => hay.includes(syn))) return t.type;
  const ct = category.trim().toLowerCase();
  if (GENERIC.has(ct)) return 'General Contractor';
  if (/\b(contractor|construction|builders?|build|home improvement|handyman|custom home)\b/.test(hay)) return 'General Contractor';
  return null;
}
const stateOf = (addr) => (addr || '').split(',').pop().trim().split(/\s+/)[0];
const isGA = (addr) => { const s = stateOf(addr); return s === 'GA' || s === 'Georgia'; };
function isContractorRow(r) {
  const addr = r['Address'] || '';
  if (!isGA(addr)) return false;
  const nm = r['Name'] || '';
  if (!nm) return false;
  if (NAME_EXCLUDE.test(nm)) return false;
  return inferType(nm, r['Category'] || '') != null;
}
const JUNK_EMAIL = /(stripe|zoca|chargebee|yelp|vagaro|twilio|microsoft|mixpanel|uxcam|moengage|imagekit|styleseat|clarity|birdeye|wix\.|squarespace|godaddy|sentry|cloudflare)/i;
const JUNK_LOCAL = /^(privacy|unsubscribe|webmaster|legal|people|help|ir|support|dataprotection|quality|web|noreply|no-reply|admin)/i;
const cityNameFromAddr = (addr) => {
  const parts = (addr || '').split(',').map(s => s.trim());
  const raw = parts.length >= 2 ? parts[parts.length - 2] : '';
  return raw.replace(/^private address in\s*/i, '').replace(/^private address.*$/i, '').trim();
};

/* ─── minimal RFC-4180 CSV parser ────────────────────────────────────────── */
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function rowsOf(path) {
  const raw = parseCSV(readFileSync(path, 'utf8')).filter(r => r.length > 5);
  const header = raw.shift().map(h => h.trim());
  return raw.map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] || '').trim()])));
}

/* ─── map a scraped row → a listing record (matches the existing schema) ─── */
function toRecord(r) {
  const addr = r['Address'] || '';
  const nm = r['Name'] || '';
  const type = inferType(nm, r['Category'] || '');
  const cityName = cityNameFromAddr(addr);
  if (!type || !cityName) return null;
  const zip = (addr.match(/\b(\d{5})\b/) || [])[1] || null;
  const rating = parseFloat(r['Rating']) || null;
  const reviews = parseInt(((r['Rating Info'] || '').match(/\((\d+)\)/) || [])[1], 10) || null;
  let email = null;
  for (const e of (r['Emails'] || '').split(',').map(s => s.trim())) {
    if (!e || e.includes('###') || JUNK_EMAIL.test(e) || JUNK_LOCAL.test(e)) continue;
    email = e; break;
  }
  return {
    id: kebab(`${nm}-${cityName}`).slice(0, 60),
    name: nm, city: kebab(cityName), cityName, type,
    tier: 'free', paid: false, paidAt: null, paidDays: 30, licensed: false, licenseNo: null,
    rating, reviews, zip,
    lat: parseFloat(r['Latitude']) || null, lng: parseFloat(r['Longitude']) || null,
    address: addr, phone: r['Phone'] || null, website: r['Website'] || null, email,
    image: r['Featured image'] || null, hoursText: r['Open Hours'] || null,
    facebook: r['Facebook'] || null, instagram: r['Instagram'] || null, twitter: r['Twitter'] || null,
  };
}

/* ─── baseline = existing dataset; append only the missing ───────────────── */
const existingIds = new Set(IMPORTED.map(c => c.id));
const nk = (name, address) => `${name}|${address}`.toLowerCase();
const existingNK = new Set(IMPORTED.map(c => nk(c.name, c.address)));

const stats = { files: SRCS.length, rows: 0, offVertical: 0, dupExisting: 0, dupRun: 0, added: 0 };
const added = [];
const seenNK = new Set();

for (const r of SRCS.flatMap(rowsOf)) {
  stats.rows++;
  if (!isContractorRow(r)) { stats.offVertical++; continue; }
  const rec = toRecord(r);
  if (!rec) { stats.offVertical++; continue; }
  const key = nk(rec.name, rec.address);
  if (existingNK.has(key)) { stats.dupExisting++; continue; }
  if (seenNK.has(key)) { stats.dupRun++; continue; }
  seenNK.add(key);
  // stable, collision-free id
  let id = rec.id || kebab(rec.name).slice(0, 60), n = 2;
  while (existingIds.has(id)) id = `${rec.id}-${n++}`;
  rec.id = id; existingIds.add(id);
  added.push(rec);
  stats.added++;
}

const out = [...IMPORTED, ...added];
writeFileSync(
  new URL('../js/data/contractors-imported.js', import.meta.url),
  '// AUTO-GENERATED by scripts/import-csv.mjs — do not edit by hand.\n' +
  'export const IMPORTED = ' + JSON.stringify(out, null, 2) + ';\n'
);

/* ─── report ─────────────────────────────────────────────────────────────── */
const byCity = {}, byType = {};
for (const s of added) { byCity[s.cityName] = (byCity[s.cityName] || 0) + 1; byType[s.type] = (byType[s.type] || 0) + 1; }
console.log(`Read ${stats.files} CSV(s), ${stats.rows.toLocaleString()} rows.`);
console.log(`Baseline ${IMPORTED.length.toLocaleString()} → now ${out.length.toLocaleString()} contractors (+${stats.added} new).`);
console.log(`  skipped: ${stats.offVertical.toLocaleString()} off-vertical/non-GA, ${stats.dupExisting.toLocaleString()} already listed, ${stats.dupRun} dupes within CSVs`);
console.log(`  new by type:`, byType);
if (stats.added) {
  console.log(`  new top cities:`);
  for (const [c, n] of Object.entries(byCity).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`    ${String(n).padStart(3)}  ${c}`);
}
console.log('\nwrote js/data/contractors-imported.js');
