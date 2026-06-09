// ============================================================
//  EXAMPLE paid listings — showcase only. Every entry is
//  `example: true` and is used ONLY in the home-page Featured /
//  Standard sections and to demo the paid card carousel + modal.
//  These are NOT real businesses and must never be mixed into
//  the real all-listings grids, the search index, or the
//  generated city/county/ZIP pages.
//
//  Galleries use the local jobsite photos so they always render.
//  `hours` is [Sun…Sat], each [openMinute, closeMinute] or null —
//  drives the card's Open / Closing-soon / Opening-soon status.
//  `services` → the offer pills; `offer` → the promo line.
// ============================================================
const WK = (o, c) => [null, [o, c], [o, c], [o, c], [o, c], [o, c], [540, 840]]; // Mon–Fri o–c, Sat 9–2, Sun closed
const GC = ['Renovations', 'Home Additions', 'Custom Homes', 'Design-Build', 'Decks & Patios', 'Basements'];
const KB = ['Kitchen Remodels', 'Bathroom Remodels', 'Cabinets', 'Countertops', 'Tile & Flooring', 'Lighting'];
// rotating promotional perks (the slide-1 carousel)
const PERKS_GC = ['Free design consultation on renovations', '0% financing for 18 months (OAC)', 'Fixed-price contracts, no surprises', 'Workmanship warranty included'];
const PERKS_KB = ['Free 3D design with any full remodel', 'Lifetime craftsmanship guarantee', 'Flexible financing available', 'Free in-home measure & quote'];

export const FEATURED = [
  {
    id: 'example-premium-summit-atlanta',
    description: 'Atlanta\'s five-star general contractor for whole-home renovations, additions, and custom builds, managed end to end with one accountable team.',
    name: 'Summit Ridge Construction',
    city: 'atlanta', cityName: 'Atlanta', type: 'General Contractor',
    tier: 'premium', paid: true, licensed: true, licenseNo: 'GA-RBQA-000000',
    rating: 5, reviews: 187, zip: '30305', lat: 33.749, lng: -84.388,
    address: '1100 Peachtree St NE, Atlanta, GA 30309',
    phone: '(404) 555-0142', website: 'https://example.com',
    hoursText: 'Open · Closes 6 PM', hours: WK(480, 1080),
    services: GC, perks: PERKS_GC, offer: 'Free design consultation on full renovations',
    images: ['/images/hero-1.jpg', '/images/hero-2.jpg', '/images/hero-3.jpg'],
    facebook: null, instagram: null, twitter: null, example: true,
  },
  {
    id: 'example-premium-magnolia-macon',
    description: 'Macon\'s kitchen & bath specialists in cabinets, countertops, tile and full layout redesigns, finished on schedule with zero surprises.',
    name: 'Magnolia Kitchen & Bath',
    city: 'macon', cityName: 'Macon', type: 'Kitchen & Bath Remodeling',
    tier: 'premium', paid: true, licensed: true, licenseNo: 'GA-RBCO-000000',
    rating: 5, reviews: 96, zip: '31201', lat: 32.8407, lng: -83.6324,
    address: '544 Mulberry St, Macon, GA 31201',
    phone: '(478) 555-0188', website: 'https://example.com',
    hoursText: 'Open · Closes 5 PM', hours: WK(510, 1020),
    services: KB, perks: PERKS_KB, offer: 'Free 3D design with any full remodel',
    images: ['/images/hero-3.jpg', '/images/hero-2.jpg', '/images/hero-1.jpg'],
    facebook: null, instagram: null, twitter: null, example: true,
  },
  {
    id: 'example-premium-coastal-savannah',
    description: 'Savannah custom-home and renovation builders with coastal-grade craftsmanship, transparent pricing, one team accountable start to finish.',
    name: 'Coastal Craft Builders',
    city: 'savannah', cityName: 'Savannah', type: 'General Contractor',
    tier: 'premium', paid: true, licensed: true, licenseNo: 'GA-RBCO-000001',
    rating: 4.9, reviews: 142, zip: '31401', lat: 32.0809, lng: -81.0912,
    address: '101 Bull St, Savannah, GA 31401',
    phone: '(912) 555-0170', website: 'https://example.com',
    hoursText: 'Open · Closes 7 PM', hours: WK(420, 1140),
    services: GC, perks: PERKS_GC, offer: '0% financing for 18 months (OAC)',
    images: ['/images/hero-2.jpg', '/images/hero-1.jpg', '/images/hero-3.jpg'],
    facebook: null, instagram: null, twitter: null, example: true,
  },
  {
    id: 'example-standard-peachtree-alpharetta',
    description: 'North-metro additions, renovations and new custom homes with clear timelines, honest budgets, and clean, on-time job sites every time.',
    name: 'Peachtree Home Builders',
    city: 'alpharetta', cityName: 'Alpharetta', type: 'General Contractor',
    tier: 'standard', paid: true, licensed: true, licenseNo: null,
    rating: 4.8, reviews: 74, zip: '30009', lat: 34.0754, lng: -84.2941,
    address: '2 S Main St, Alpharetta, GA 30009',
    phone: '(770) 555-0119', website: 'https://example.com',
    hoursText: 'Open · Closes 5:30 PM', hours: WK(480, 1050),
    services: GC, perks: PERKS_GC, offer: 'Free in-home consultation & estimate',
    images: ['/images/hero-1.jpg', '/images/hero-2.jpg'],
    facebook: null, instagram: null, twitter: null, example: true,
  },
  {
    id: 'example-standard-stonework-marietta',
    description: 'Marietta kitchen & bath remodelers installing cabinets, tile and countertops with in-house crews and a lifetime craftsmanship guarantee.',
    name: 'Stonework Renovations',
    city: 'marietta', cityName: 'Marietta', type: 'Kitchen & Bath Remodeling',
    tier: 'standard', paid: true, licensed: true, licenseNo: null,
    rating: 4.7, reviews: 58, zip: '30060', lat: 33.9526, lng: -84.5499,
    address: '145 Church St NE, Marietta, GA 30060',
    phone: '(678) 555-0133', website: 'https://example.com',
    hoursText: 'Open · Closes 6 PM', hours: WK(480, 1080),
    services: KB, perks: PERKS_KB, offer: 'Lifetime craftsmanship guarantee',
    images: ['/images/hero-3.jpg', '/images/hero-1.jpg'],
    facebook: null, instagram: null, twitter: null, example: true,
  },
  {
    id: 'example-standard-rivertown-augusta',
    description: 'Augusta-area general contractor for additions and full renovations with fixed-price contracts, licensed crews, and dependable communication.',
    name: 'Rivertown Contracting',
    city: 'augusta', cityName: 'Augusta', type: 'General Contractor',
    tier: 'standard', paid: true, licensed: true, licenseNo: null,
    rating: 4.7, reviews: 49, zip: '30901', lat: 33.4735, lng: -81.9748,
    address: '1450 Greene St, Augusta, GA 30901',
    phone: '(706) 555-0156', website: 'https://example.com',
    hoursText: 'Open · Closes 4:30 PM', hours: WK(450, 990),
    services: GC, perks: PERKS_GC, offer: 'Fixed-price contracts, no surprises',
    images: ['/images/hero-2.jpg', '/images/hero-3.jpg'],
    facebook: null, instagram: null, twitter: null, example: true,
  },
];
