// GA.Contractors taxonomy — a GENERAL-CONTRACTOR directory. We list general /
// building contractors and the remodeling work they do; specialized service
// trades (roofing, plumbing, electrical, HVAC, landscaping, etc.) are NOT listed
// and are filtered out at ingest (see scripts/import-csv.mjs → SPECIALIZED).
//
// `slug` is the stable URL key (NEVER change an existing one — it's a live URL).
// `type` is the human label shown on cards and in headings.
// `group` clusters trades on hub pages. `synonyms` feed the import classifier
// (which trade does a scraped name/category map onto?).

export const GROUPS = [
  'General contracting',
];

export const CATEGORIES = [
  { slug: 'general-contractor', type: 'General Contractor', group: 'General contracting',
    synonyms: ['general contractor', 'building contractor', 'construction company', 'construction services',
      'construction', 'contractor', 'builders', 'builder', 'home improvement', 'handyman',
      'custom home', 'home builder', 'new construction', 'design build', 'design-build'] },
  { slug: 'remodeling', type: 'Kitchen & Bath Remodeling', group: 'General contracting',
    synonyms: ['remodel', 'remodeling', 'renovation', 'renovations', 'kitchen remodel',
      'bathroom remodel', 'kitchen and bath', 'home addition', 'additions', 'basement finishing'] },
];

// Convenience lookups
export const TYPE_BY_SLUG = Object.fromEntries(CATEGORIES.map(c => [c.slug, c.type]));
export const CATEGORIES_BY_GROUP = GROUPS.map(g => ({
  group: g,
  items: CATEGORIES.filter(c => c.group === g),
}));
