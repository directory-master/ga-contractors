# CLAUDE.md

Guidance for working in this repo. This is the **streaming-style front end** for
GA.Contractors — a reimagining of the sibling SEO directory at `~/contractors`
(`ga.contractors.artivicolab.com`). Same data, same vertical; the surface is a
streaming UI (Prime-Video rails × YouTube cards). It is **two things at once**:

1. **A client-rendered homepage SPA** (`index.html` + `js/app.js`) — loads the whole
   dataset and derives hero / rails / chips / search at runtime.
2. **A static multi-page SEO surface** — a Node generator (`scripts/generate-pages.mjs`)
   that emits one **crawlable, server-rendered page per city / county / ZIP**, in the
   same look, served by `js/page.js`. This is what makes the directory rank.

Made by **Artivicolab**.

## ⚠️ Versioning — bump it every change

**Always bump `version` in `package.json` for any change before committing.**
Semver: patch for fixes/tweaks, minor (`0.x` → `0.(x+1).0`) for features.

## What this is

**GA.Contractors** — a zero-backend, **client-rendered** way to discover
**licensed contractors across Georgia**. The whole UI is a mix of two familiar
patterns:

- **Amazon Prime Video** — a rotating **hero billboard** + horizontal **rails**
  ("Top Rated in Georgia", "Fresh This Morning", one rail per trade, one per
  major city).
- **YouTube** — a sticky **top bar** with a search box, a strip of **filter
  chips**, and **thumbnail cards** that open a detail sheet ("play" a listing).

All wrapped in a warm **morning / sunrise** palette. The product is **the card** —
no per-contractor detail pages, no routing. Click a card → an in-page modal opens
with call / website / directions and the full contact card. Each action links out
to the contractor's own phone / site / Google Maps.

## Stack & constraints

- **Pure HTML / CSS / vanilla JS (ES modules).** No framework, no runtime deps,
  **no build step.** The taxonomy, rails, chips and hero are all derived from the
  data **at runtime** — there is nothing to generate.
- **Shared "components" live in [js/shared/](js/shared/)** — the single source of
  truth, imported by **all three** consumers (`app.js`, `js/page.js`, and the Node
  generator). Don't re-inline these; add to / edit the shared module instead:
  - `format.mjs` — `esc`, `hash`, `slugify`, `initials`, `ratingScore`, `telHref`,
    `fmtMi`, `fmtClock`, `openStatus`, `milesBetween` (pure, isomorphic).
  - `palette.mjs` — `PALETTE`/`colorFor`/`STOCK`/`stockFor`/`tintedBg` (single-quoted
    `url()` so the same string works in an HTML attribute **and** `el.style`).
  - `geo.mjs` — `tileUrl` (static OSM tile), `PIN_SVG`.
  - `icons.mjs` — `SPOT_SPRITE`, `spotUse`, `perkIcon`.
  - `components.mjs` — **the render components**: `cardHTML`, `thumbInner`,
    `placeholderHTML`, `claimCardHTML`, `ownCardHTML`, `spotCardHTML`, plus
    `CLAIM_EMAIL`. Pure HTML-string functions = the **one** card/spotlight/claim
    markup. The generator emits the strings; `app.js` builds a node from the string
    (`nodeFrom`) then **hydrates** it (distance, live map, perk ticker, pills,
    open-modal). There is no second copy of this markup anywhere.
  - `maps.mjs` — **browser-only** (needs `window`/Leaflet): `loadLeaflet`, `mapPin`,
    `initCardMap`/`observeCardMap` (the live, centred card map that replaces the
    static-tile placeholder on no-photo cards). NOT imported by the generator.
- ES modules need a real HTTP server (won't load over `file://`).
- **The dataset is the only input.** Everything visible is computed from
  `js/data/contractors-imported.js`; don't hardcode trades, cities or counts.

## Run / build locally

```bash
cd ~/contractor
npm run build:pages   # generate the static city/county/ZIP pages at the repo root
npm run serve         # python3 -m http.server 8000  → http://localhost:8000
npm run dev           # build:pages + serve
```

ES modules + clean-URL folders need a real HTTP server (won't load over `file://`).
**Bump `package.json` `version` before committing** — it's the `?v=` cache-buster on
every CSS/JS link and the footer stamp.

## Layout

| Path | Role |
|------|------|
| [index.html](index.html) | Homepage SPA shell — top bar, chips, hero, rails container, results grid, modal. Content injected by `app.js`. The generator does **not** touch it. |
| [css/app.css](css/app.css) | Morning/sunrise palette (CSS vars at top) + Prime/YouTube layout. Shared by the SPA **and** the generated pages (place-page / hub classes live in the lower half). |
| [js/app.js](js/app.js) | The homepage app: data prep/enrich, **Top 10**, **Featured/Standard** tier rows, geolocation + distance, paid modal carousel + map, paginated results, chips + search. |
| [js/data/featured.js](js/data/featured.js) | **EXAMPLE paid listings** (`example:true`, with `images:[]` galleries) — showcase the paid product in the Featured/Standard rows + paid carousel/map demo on **both** the home page **and** the generated city/county/ZIP pages. Never in `ALL`/search or the real all-listings grids. |
| [vendor/leaflet/](vendor/leaflet/) | Self-hosted Leaflet (OSM, no API key) — **lazy-loaded** only when a paid detail modal's map slide opens. |
| [scripts/generate-pages.mjs](scripts/generate-pages.mjs) | **The static generator.** Emits `/<city>/`, `/county/<c>/`, `/zip/<code>/` + `/cities/ /counties/ /zips/` hubs + `sitemap.xml` / `robots.txt` / `404.html`. Server-renders cards (crawlable) and embeds a per-page `#page-data` JSON for the modal. **Writes but does not prune.** |
| [js/page.js](js/page.js) | Runtime for the **generated** pages only: opens the modal from `#page-data`, rotates the per-page "Featured today" hero, scrolls rails. |
| [js/data/contractors-imported.js](js/data/contractors-imported.js) | **The single source of truth.** `export const IMPORTED = [...]` — real GA businesses. Copied from `~/contractors`; refresh from there, never hand-edit. |
| [js/data/ga-counties.js](js/data/ga-counties.js) | `CITY_COUNTY` map + `countySlug` — drives the county rollup pages. Add a line per new city slug. |
| [images/](images/) | Local assets: `hero-1..3.jpg` / `pattern-1..2.jpg` (jobsite photos, sunrise-tinted, behind listings with no photo), `card-grid.svg` (blueprint texture), `noimageprovided.jpg`. |

## The static multi-page SEO surface (`generate-pages.mjs`)

One indexable page per place, all in the streaming look:

- **`/<city>/`**, **`/county/<county>/`**, **`/zip/<code>/`** — each: a rotating
  "Featured today" hero (the place's own top picks), then an **overview map**
  (`#placeMap`) of every mapped contractor on the page + the user pin, a **Premium**
  row, then a **Standard** row (both the `featured.js` demo billboards), then an
  "All contractors in <place>" grid with a client-side **Sort** control (Top picks /
  Top rated / Most reviewed / Nearest / Name) — default order **paid tier → has-photo
  → rating score** (`byRank`), mirroring the home storefront, no per-trade rails. City
  pages also get an "Also serving — just outside <place>" section from absorption (below).
- **Thresholds:** a place earns its own page at **`MIN_LISTINGS = 5`**. Thinner
  cities/ZIPs are **absorbed by radius** into the **nearest qualifying city** within
  **`MAX_ABSORB_MI = 40`** (haversine on per-city centroids) and rendered in that
  city's "just outside" section. Thin counties are skipped (their listings still show
  on the city pages). Only ≥5 pages go in `sitemap.xml`.
- **SEO per page:** `<title>` + meta desc + canonical + OG/Twitter + geo meta, an
  `areaIntro()` reader-facing paragraph, breadcrumbs, and JSON-LD
  (`BreadcrumbList` + `ItemList` of `GeneralContractor`/`HomeAndConstructionBusiness`,
  with unique `item.url` per entry). H1 is the **place** (the hero eyebrow); the
  rotating business name is a `<p>`, not an H1.

## Home page storefront + the paid experience

- **Hero** — on wide screens (`min-width: 721px`) the small contractor photo is **not**
  full-bleed-stretched: a Leaflet **map of the contractor's location** is the backdrop
  (`#heroMap`, panned per rotation), an ambient **blurred** copy fills behind it, and the
  sharp photo sits on top as a contained 16:10 **poster** (`#heroPoster`). On mobile it
  reverts to the full-cover photo. Map degrades gracefully (blurred fill + poster if Leaflet
  fails to load).
- **Top 10 in Georgia** — numbered 1–10 section (`renderTop10`), statewide by `_score`.
- **Featured** (premium) + **Standard** rows (`renderTierSection`) — a "contact us" claim
  card leading the example paid listings from `featured.js`. Below them: a "Fresh This
  Morning" rail and the "Browse Georgia" launchpad.
- **Geolocation** — a **sticky bottom "pin your location" bar** (`.locbar`, mobile-app
  style; dismissible via `#locClose`) holds the `#locBtn` (`getCurrentPosition`) and a
  `#zipWrap` ZIP input. Location persists to `localStorage 'gacontractors:location'` (shared
  key) and drives `📍 X mi` distance badges + a "Nearest to You" rail. ZIP falls back to a
  centroid derived from the data. `reflectLoc()` keeps the bar label in sync.
- **Paid detail modal** — for `tier: premium|standard` with an `images[]` gallery, `#mHero`
  becomes a **carousel** with the **Map slide in the middle** (`mapIdx`). The map slide
  lazy-loads Leaflet and plots the contractor (+ the user pin, a dashed line, and "X mi away"
  when located). Free listings keep the single image — no map, no Leaflet load.
- **Placeholder palette** — listings with no photo use a **muted, varied solid colour**
  (`PALETTE`/`colorFor`, warm + cool) as the avatar fill and a semi-transparent tint over the
  jobsite photo + blueprint grid (`tintedBg`) — replaced the old generic orange/yellow
  gradient. The palette (and every other shared primitive) now lives **once** in
  `js/shared/` — see below; `app.js`, `js/page.js` and the generator all import it.
- **Pagination** — results/search render **20 cards**, then a `#viewMore` button adds 20
  more (`PAGE = 20`). The big static place grids get the same reveal via `js/page.js`.
- **`_img`** is the card/hero image source: a real http photo, else the first gallery image.

## The claim / pricing model

- Businesses **contact us to claim & verify** their listing. Until then we do **not**
  show the **"Licensed & Insured"** badge — `renderCard` / the hero only show it when
  `licensed: true`, and all imported rows are `false`, so it stays hidden by default.
- The **"Your business here" claim card is the LAST card** in every Premium and Standard
  row (home + place pages). It shows the tier price (**Premium · $149/mo**,
  **Standard · $49/mo**), the "contractor searches" pitch, and a **"Claim this spot →"** CTA.
  (Prices are public — this reversed an earlier no-price choice.)
- A **"Premium" listing card is itself a 3-slide carousel** (`renderPremiumCard`) shown
  before the modal: slide 1 = open/closing-soon/opening-soon status (`openStatus`, 2-hour
  window) + promo `offer` + `services` pills + a Call button; slide 2 = a live map (you +
  distance when located); slides 3+ = the photo gallery. Driven by `hours`/`services`/`offer`
  on the example seeds in `js/data/featured.js`.
- All claim/lead links are `mailto:` to **`artivicolab@gmail.com`** — only ever in an
  `href`, **never rendered as visible text** (the dollar prices are fine to show; the email is not).

## Data contract (what `app.js` reads off each listing)

Each row in `IMPORTED` is consumed by `app.js`; the fields it actually uses:

- **Identity:** `id` (stable key — drives the deterministic gradient/photo/initials),
  `name`, `type` (the trade — becomes a rail + a chip), `cityName` (display city —
  becomes a rail + a chip), `zip`.
- **Signal:** `rating`, `reviews` (together → `_score`, which orders rails and the
  hero), `licensed` (→ the "Licensed" badge), `hoursText`.
- **Media:** `image` (only used when it's a real `http(s)` URL — `_hasImg`;
  otherwise the tinted-photo + initials placeholder kicks in).
- **Contact / links:** `phone`, `website`, `address`, `lat`/`lng` (Google Maps
  deep link), `facebook`, `instagram`, `twitter`.

Adding a field means teaching `app.js` to use it — nothing is auto-surfaced.

## How the UI is built (the flow in `app.js`)

1. **Enrich** every row once into `ALL` (`_score`, `_hasImg`, `_search`).
2. **Index** by trade (`TYPES`) and city (`CITIES`), plus `RATED` / `WITHIMG`.
3. **Rails** (`buildRows`) — Top Rated, Fresh This Morning (deterministic
   shuffle), one per trade, top ~10 cities with ≥6 listings.
4. **Hero** rotates the top-rated *with photos* (falls back to tinted stock).
5. **Chips + search** filter `ALL` into the results grid; empty search restores
   the rails view.

## Conventions

- **Site name is `GA.Contractors`** — keep it identical across the `<title>`, the
  brand wordmark in the top bar + footer, and any share/`mailto` copy. Don't
  reintroduce the bare "Contractor".
- `id` is a stable key — it seeds the placeholder gradient/photo/initials, so a
  given business always renders the same. Never rewrite existing ids.
- **Every "no photo" card must still look intentional** — that's the whole point
  of the sunrise-tinted stock photo + blueprint grid + initials fallback. Don't
  let a listing render as a blank or broken `<img>` (cards already `onerror` →
  placeholder).
- Site text stays **selectable/copyable** — don't block selection.
- Lead / "list your business" mail goes through Artivicolab; **never render a raw
  gmail address as visible text.** Footer credits **Artivicolab**
  (`artivicolab.com`).
- The data file is **copied from `~/contractors`** — to refresh listings, re-copy
  `js/data/contractors-imported.js` from there; don't diverge the two.
</content>
</invoke>
