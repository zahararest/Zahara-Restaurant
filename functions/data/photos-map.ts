// Photo key catalogue — mirrors src/data/photos.ts.
//
// Two views of the same data:
//   • PHOTO_DEFAULTS : key (e.g. 'hero') → default filename in /public/photos/
//   • FILENAME_TO_KEY: filename → key (reverse lookup, used by the
//                      /photos/ middleware to find R2 overrides).
//
// Functions run on Cloudflare and can't import .ts from src/, so this
// is a deliberate duplication. If you add a photo to src/data/photos.ts,
// add the matching row here so the admin can manage it.
//
// `group` is presentational only — it controls which section the photo
// appears under in the /admin/images UI.

export interface PhotoMeta {
  key:      string;     // PHOTOS map key (e.g. 'hero')
  filename: string;     // file in /public/photos (e.g. 'MOYAL-00009.jpg')
  label:    string;     // human-readable label for the admin UI
  group:    'home' | 'gallery' | 'menu' | 'mood';
}

export const PHOTO_CATALOGUE: PhotoMeta[] = [
  // ── Home page ──────────────────────────────────────────────
  { key: 'hero',     filename: 'MOYAL-00009.jpg', label: 'Hero (home top)',     group: 'home' },
  { key: 'kitchen',  filename: 'MOYAL-09689.jpg', label: 'Kitchen bleed',       group: 'home' },
  { key: 'dish',     filename: 'MOYAL-00020.jpg', label: 'Kitchen photo-block', group: 'home' },
  { key: 'detail2',  filename: 'MOYAL-09885.jpg', label: 'Events photo-block',  group: 'home' },

  // ── Gallery (four-shot edit on the home page) ──────────────
  { key: 'interior', filename: 'MOYAL-09548.jpg', label: 'Interior',  group: 'gallery' },
  { key: 'chef',     filename: 'MOYAL-09851.jpg', label: 'Chef',      group: 'gallery' },
  { key: 'bar',      filename: 'MOYAL-09574.jpg', label: 'Bar',       group: 'gallery' },
  { key: 'wine',     filename: 'MOYAL-09832.jpg', label: 'Wine bar',  group: 'gallery' },

  // ── Menu page (per-category hero) ──────────────────────────
  { key: 'menuFood',      filename: 'MOYAL-00029.jpg', label: 'Menu · Food',      group: 'menu' },
  { key: 'menuDessert',   filename: 'MOYAL-00084.jpg', label: 'Menu · Dessert',   group: 'menu' },
  { key: 'menuWine',      filename: 'MOYAL-09817.jpg', label: 'Menu · Wine',      group: 'menu' },
  { key: 'menuCocktails', filename: 'MOYAL-09569.jpg', label: 'Menu · Cocktails', group: 'menu' },
  { key: 'menuEvents',    filename: 'MOYAL-09682.jpg', label: 'Menu · Events',    group: 'menu' },

  // ── Moody photos used as on-photo editorial backdrops. ────
  { key: 'moodDining', filename: 'MOYAL-09221.jpg', label: 'Story backdrop · Dining room', group: 'mood' },
  { key: 'moodChef',   filename: 'MOYAL-09251.jpg', label: 'Pull-quote backdrop · Chef',   group: 'mood' },
];

/** Map from /photos/{filename}.jpg back to the PHOTOS key. Used by the
 *  middleware to find the R2 override for a static asset request. */
export const FILENAME_TO_KEY: Record<string, string> =
  Object.fromEntries(PHOTO_CATALOGUE.map((p) => [p.filename, p.key]));

/** Friendly grouping for the admin UI. */
export const PHOTO_GROUPS = {
  home:    'Home page',
  gallery: 'Gallery',
  menu:    'Menu page (per category)',
  mood:    'Editorial backdrops',
} as const;
