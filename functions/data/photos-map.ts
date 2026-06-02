// Photo key catalogue — mirrors src/data/photos.ts.
//
// Two views of the same data:
//   • PHOTO_CATALOGUE  : the ordered list the /admin/images UI renders.
//   • FILENAME_TO_META : filename → { key, fallbackKey } reverse lookup,
//                        used by the /photos/ middleware to find the R2
//                        override for a static asset request.
//
// Functions run on Cloudflare and can't import .ts from src/, so this is a
// deliberate duplication of src/data/photos.ts. If you add a photo there,
// add the matching row here so the admin can manage it.
//
// ── How overrides are keyed ───────────────────────────────────────────
// An override is stored in R2 at `images/{key}` and is looked up by the
// requested *filename* (the URL the page renders). That means each entry
// MUST have a UNIQUE filename, otherwise two placements would resolve to
// the same override. Where two spots on the site used to share one photo
// (e.g. contact + location both reused the gallery "interior" shot), they
// now get their own key + unique filename so the admin can adjust each one
// separately. To avoid breaking the live image before a fresh upload, a
// split key carries a `fallbackKey`: if `images/{key}` is missing, the
// middleware serves `images/{fallbackKey}` instead. No R2 migration needed.
//
// `group` + the array order are presentational — they control which page
// section each card appears under in /admin/images, and the order within
// it (kept the same as the photo's real scroll order on the page).

export type PhotoGroup = 'home' | 'menu' | 'about';

export interface PhotoMeta {
  key:          string;       // PHOTOS map key (e.g. 'hero')
  filename:     string;       // unique file in /public/photos (also the R2 lookup id)
  label:        string;       // what the photo is
  where:        string;       // where it appears on the live site
  group:        PhotoGroup;   // which page it belongs to
  fallbackKey?: string;       // serve this key's override if `key` has none
  reused?:      boolean;      // the same image shows in more than one spot
  reserved?:    boolean;      // defined but not currently shown on the site
}

export const PHOTO_CATALOGUE: PhotoMeta[] = [
  // ── HOME PAGE — top-to-bottom in scroll order ──────────────────────
  { key: 'hero',     filename: 'MOYAL-00009.jpg', group: 'home',
    label: 'Hero',                where: 'Top of the home page — also the social-share preview image' },
  { key: 'moodDining', filename: 'MOYAL-09221.jpg', group: 'home',
    label: 'Story / menu backdrop', where: 'Darkened photo behind the opening story text, and the full-frame “menu split” section' },
  { key: 'kitchen',  filename: 'MOYAL-09689.jpg', group: 'home', reused: true,
    label: 'Kitchen — full bleed', where: 'Full-width band after the story (also reused as the menu-preview “mains” chapter)' },
  { key: 'dish',     filename: 'MOYAL-00020.jpg', group: 'home',
    label: 'The kitchen — photo block', where: 'Beside the “open kitchen” text' },
  { key: 'moodChef', filename: 'MOYAL-09251.jpg', group: 'home',
    label: 'Pull-quote backdrop', where: 'Darkened photo behind the chef pull-quote' },
  { key: 'menuFood', filename: 'MOYAL-00029.jpg', group: 'home',
    label: 'Menu preview · Starters',  where: 'Chapter 01 of the home-page menu preview' },
  { key: 'menuCocktails', filename: 'MOYAL-09569.jpg', group: 'home',
    label: 'Menu preview · Cocktails', where: 'Chapter 03 of the home-page menu preview' },
  { key: 'menuDessert', filename: 'MOYAL-00084.jpg', group: 'home',
    label: 'Menu preview · Desserts',  where: 'Chapter 04 of the home-page menu preview' },
  { key: 'interior', filename: 'MOYAL-09548.jpg', group: 'home',
    label: 'Gallery 1 · Interior', where: 'First photo of the four-shot home gallery' },
  { key: 'chef',     filename: 'MOYAL-09851.jpg', group: 'home',
    label: 'Gallery 2 · Chef',     where: 'Second photo of the home gallery' },
  { key: 'bar',      filename: 'MOYAL-09574.jpg', group: 'home',
    label: 'Gallery 3 · Bar',      where: 'Third photo of the home gallery' },
  { key: 'wine',     filename: 'MOYAL-09832.jpg', group: 'home',
    label: 'Gallery 4 · Wine bar', where: 'Fourth photo of the home gallery' },
  { key: 'detail2',  filename: 'MOYAL-09885.jpg', group: 'home',
    label: 'Events — photo block', where: 'Beside the events text near the footer' },

  // ── MENU PAGES ─────────────────────────────────────────────────────
  { key: 'menuIntro', filename: 'menu-intro.jpg', group: 'menu', fallbackKey: 'dish',
    label: 'Menu intro', where: 'Large photo at the top of every menu page' },
  { key: 'menuWine', filename: 'MOYAL-09817.jpg', group: 'menu', reserved: true,
    label: 'Wine', where: 'Reserved menu image — not shown on the site yet' },
  { key: 'menuEvents', filename: 'MOYAL-09682.jpg', group: 'menu', reserved: true,
    label: 'Events', where: 'Reserved menu image — not shown on the site yet' },

  // ── ABOUT PAGE (formerly Contact + Location) ───────────────────────
  { key: 'contact', filename: 'contact-page.jpg', group: 'about', fallbackKey: 'interior',
    label: 'About — intro photo', where: 'Full-width band near the top of the About page' },
  { key: 'location', filename: 'location-page.jpg', group: 'about', fallbackKey: 'interior',
    label: 'About — location photo', where: 'Photo beside the directions on the About page' },
];

/** Map from /photos/{filename} back to its catalogue entry. Used by the
 *  middleware to find the R2 override (and fallback) for a static asset. */
export const FILENAME_TO_META: Record<string, PhotoMeta> =
  Object.fromEntries(PHOTO_CATALOGUE.map((p) => [p.filename, p]));

/** Back-compat alias: filename → key. */
export const FILENAME_TO_KEY: Record<string, string> =
  Object.fromEntries(PHOTO_CATALOGUE.map((p) => [p.filename, p.key]));

/** Friendly, page-based grouping for the admin UI (rendered in this order). */
export const PHOTO_GROUPS = {
  home:  'Home page',
  menu:  'Menu pages',
  about: 'About page',
} as const;
