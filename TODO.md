# TODO — GA.Contractors (streaming UI)

Status of the streaming front end. The core app is **built and working**: data +
images copied from `~/contractors`, hero billboard, rails, chips, search and the
detail modal all render from `js/data/contractors-imported.js`. Bump
`package.json` `version` with every change.

## Done

- [x] Copy the listings dataset (`contractors-imported.js`) from `~/contractors`.
- [x] Copy local images (`hero-*`, `pattern-*`, `card-grid.svg`, `noimageprovided.jpg`).
- [x] App shell: YouTube top bar + search, filter chips, Prime-style hero, rails,
      results grid, detail modal.
- [x] Data-driven rails: Top Rated, Fresh This Morning, per-trade, per-city.
- [x] Auto-rotating hero billboard with dots.
- [x] Card/hero/modal placeholders use sunrise-tinted jobsite photos + blueprint
      grid + initials, so "no photo" listings still look intentional.
- [x] Brand set to **GA.Contractors** across title, top bar, footer, mailto.
- [x] `CLAUDE.md` describing this app.
- [x] **Static multi-page SEO surface** (`scripts/generate-pages.mjs`): one crawlable,
      server-rendered page per **city / county / ZIP** in the streaming look — 181 city,
      118 county, 262 ZIP pages + `/cities/ /counties/ /zips/` hubs + `sitemap.xml` /
      `robots.txt` / `404.html`.
- [x] **Thin-place absorption** by radius — `MIN_LISTINGS=5`, `MAX_ABSORB_MI=40`, folds
      into the **nearest qualifying city** (464 listings from 242 thin towns).
- [x] **Tier-ordered rows** on every place page — Premium row, then Standard row, then
      per-trade rails + all-listings grid (paid → has-photo → rating order).
- [x] **Claim / "contact us" model** — claim cards + "own this business?" CTA (mailto,
      no prices, email never shown as text). Licensed & Insured badge hidden until claimed.
- [x] **Rotating "Featured today" hero** (home-style carousel) on every generated page,
      scoped to that page's own top picks (`js/page.js`).
- [x] **Home storefront**: numbered **Top 10 in Georgia**, **Featured** (premium) + **Standard**
      tier rows seeded with example paid listings (`js/data/featured.js`, `example:true`).
- [x] **Geolocation** — "Use my location" button → `📍 X mi` distance badges + "Nearest to You"
      rail; ZIP-centroid fallback when denied. Shared `localStorage` key with place-page maps.
- [x] **Paid detail modal** — gallery **carousel** + a **distance map** slide (lazy self-hosted
      Leaflet/OSM, no API key) showing the contractor, the user, and "X mi away".
- [x] **"View more" pagination** — 20 cards per click on the home results grid and the big
      static place grids.

## Next up

- [ ] **Real paid pipeline** — `featured.js` holds EXAMPLE seeds with local-photo galleries.
      Replace with real claimed listings (real `tier`/`paid`/`licensed`/`images[]`), and surface
      paid listings on the generated place pages too (currently free-only there).
- [ ] **Generator pruning** — it writes but does not prune; after a data refresh that
      drops a city/ZIP below 5, the stale `/<slug>/` folder lingers. Add a clean step
      (diff on-disk place folders vs freshly-built URLs, `rm -rf` orphans).
- [ ] **Deploy** — pick the subdomain, set `BASE_URL` in the generator + add a `CNAME`;
      wire GitHub Pages. (`BASE_URL` currently defaults to `ga.contractors.artivicolab.com`.)
- [ ] **Homepage ↔ pages parity** — the SPA homepage still renders client-side only; the
      `/cities/ /counties/ /zips/` hubs are reachable from its footer, but consider a
      server-rendered home for first paint / crawlability too.
- [ ] **Mobile pass** — verify rails, hero and modal on ≤480px; the hero `desc`
      is hidden under 720px, confirm that still reads well.
- [ ] **Image reliability** — many `image` URLs are Bing/Google hotlinks that may
      403 or hotlink-block; cards `onerror` to the placeholder, but spot-check the
      hero (no fallback flash) and consider a tiny on-load timeout.
- [ ] **Search polish** — debounced search exists; add zip + partial-trade
      matching and a result count chip; handle accented/punctuated names.
- [ ] **Chips overflow** — the chip strip can get long; add horizontal scroll /
      "more" affordance on narrow screens.
- [ ] **Empty/edge states** — confirm trades/cities with very few listings don't
      produce thin rails (already gated at ≥6 for city rails; revisit per-trade).
- [ ] **A11y** — modal focus trap + return focus to the opening card; `aria-live`
      on the results count; keyboard nav across rail items.
- [ ] **Perf** — dataset is large (~3MB JS). Measure first paint; consider
      lazy-hydrating rails below the fold and capping initial card count.

## Backlog / ideas

- [ ] "Liked"/watchlist rail using `localStorage` (mirror the `~/contractors`
      `liked/` concept, client-only).
- [ ] Share a listing (copy link / native share) — needs a deep-link scheme since
      there's currently no routing.
- [ ] Optional dark "evening" palette toggle alongside the morning theme.
- [ ] Refresh workflow: a one-liner / npm script to re-copy
      `contractors-imported.js` from `~/contractors` so the two stay in sync.
- [ ] Deploy target (GitHub Pages) + `CNAME`/meta once a subdomain is chosen.

## Won't do (by design)

- No per-contractor pages, no router, no backend — the card + modal **is** the
  product.
- No build step / generator — everything derives from the dataset at runtime.
  (The SEO/static-page surface lives in the sibling `~/contractors` project.)
</content>
