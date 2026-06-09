# GA.Contractors

A **streaming-style** way to discover Georgia's licensed builders — think
**Amazon Prime Video** (a rotating hero billboard + horizontal rails) crossed
with **YouTube** (top search bar, filter chips, thumbnail cards), all wrapped in
a warm **morning / sunrise** color palette.

Click any card to "play" it — a detail sheet opens with call / website /
directions and the full contact card.

## Stack

Pure **HTML / CSS / vanilla JS (ES modules)** with a single Node build step. The only
input is the listings dataset in
[js/data/contractors-imported.js](js/data/contractors-imported.js) — real GA contractor
businesses. The homepage derives its taxonomy, rows, chips and hero from the data at
runtime; a generator pre-renders the per-place SEO pages from the same data.

## Run / build

ES modules + clean-URL folders need a real HTTP server (won't load over `file://`):

```bash
cd ~/contractor
npm run build:pages   # generate static city/county/ZIP pages at the repo root
npm run serve         # → http://localhost:8000
npm run dev           # build:pages + serve
```

## How it's organized

| Path | Role |
|------|------|
| [index.html](index.html) | Homepage SPA shell: top bar, chips, hero, rails, results grid, modal |
| [css/app.css](css/app.css) | Morning palette + Prime/YouTube layout, shared by the SPA and generated pages |
| [js/app.js](js/app.js) | Homepage app: data prep, rail line-up, card/hero/modal rendering, search |
| [scripts/generate-pages.mjs](scripts/generate-pages.mjs) | Static generator → one page per city / county / ZIP + hubs + sitemap |
| [js/page.js](js/page.js) | Runtime for the generated pages: modal, rotating hero, rail scroll |
| [js/data/contractors-imported.js](js/data/contractors-imported.js) | The listings dataset (the single source of truth) |
| [js/data/ga-counties.js](js/data/ga-counties.js) | City→county map for the county pages |

## Features

- **Hero billboard** auto-rotates through top-rated builders with real photos — on the
  homepage *and* on every generated page (scoped to that page's own featured pros).
- **Rails**: Top Rated, a fresh daily mix, one per trade, one per major city.
- **Cards** show photo (or a sunrise-tinted jobsite thumbnail), rating, trade and city,
  with a hover "play" affordance.
- **Search + chips** filter the whole dataset into a results grid.
- **Dedicated SEO pages** for every city, county and ZIP with ≥5 listings — thinner
  places fold by radius into the nearest qualifying city. Each leads with a **Premium**
  row, then a **Standard** row, then everything else (photos first).
- **Home storefront**: a numbered **Top 10 in Georgia**, plus **Featured** (premium) and
  **Standard** tier rows.
- **Use my location** → distance badges (`📍 X mi`), a "Nearest to You" rail, and — for paid
  listings — a detail-modal **carousel** with a **map showing the distance to you** (self-hosted
  Leaflet/OpenStreetMap, no API key). ZIP fallback if location is denied.
- **"View more"** pagination — 20 listings per click on big result sets.
- **Claim model**: businesses contact us to claim & verify their listing; the "Licensed
  & Insured" badge only shows once verified.
- Listings with no usable photo fall back to a deterministic sunrise gradient + blueprint
  texture + initials, so every card looks intentional.
