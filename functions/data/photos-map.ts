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

export type PhotoGroup = 'home' | 'menu' | 'events' | 'about';

export interface PhotoMeta {
  key:          string;       // PHOTOS map key (e.g. 'hero')
  filename:     string;       // unique file in /public/photos (also the R2 lookup id)
  label:        string;       // what the photo is
  where:        string;       // where it appears on the live site
  group:        PhotoGroup;   // which page it belongs to
  fallbackKey?: string;       // serve this key's override if `key` has none
  reused?:      boolean;      // the same image shows in more than one spot
  reserved?:    boolean;      // defined but not currently shown on the site
  optional?:    boolean;      // optional slot — only appears once an image is
                              // uploaded; an empty slot is hidden, not broken
  mobile?:      boolean;      // full-screen photo that supports a separate
                              // portrait crop for phones (served via /photos-m)
}

export const PHOTO_CATALOGUE: PhotoMeta[] = [
  // ── HOME PAGE — top-to-bottom in scroll order ──────────────────────
  { key: 'hero',     filename: 'MOYAL-00009.jpg', group: 'home', mobile: true,
    label: 'Hero',                where: 'Top of the home page — also the social-share preview image' },
  { key: 'moodDining', filename: 'MOYAL-09221.jpg', group: 'home',
    label: 'Story backdrop', where: 'Darkened photo behind the opening story text' },
  { key: 'kitchen',  filename: 'MOYAL-09689.jpg', group: 'home',
    label: 'Kitchen — full bleed', where: 'Full-width band after the story' },
  { key: 'menuSplit', filename: 'menu-split.jpg', group: 'home', fallbackKey: 'kitchen', mobile: true,
    label: 'Menu-split background', where: 'Full-frame “the menu” section (food · wine · cocktails · dessert)' },
  { key: 'interior', filename: 'MOYAL-09548.jpg', group: 'home', mobile: true,
    label: 'Gallery 1 · Interior', where: 'First photo of the home gallery' },
  { key: 'chef',     filename: 'MOYAL-09851.jpg', group: 'home', mobile: true,
    label: 'Gallery 2 · Chef',     where: 'Second photo of the home gallery' },
  { key: 'bar',      filename: 'MOYAL-09574.jpg', group: 'home', mobile: true,
    label: 'Gallery 3 · Bar',      where: 'Third photo of the home gallery' },
  { key: 'wine',     filename: 'MOYAL-09832.jpg', group: 'home', mobile: true,
    label: 'Gallery 4 · Wine bar', where: 'Fourth photo of the home gallery' },
  // Optional gallery slots 5–10. Empty by default; upload one to add it to
  // the home-page gallery (max 10 photos). Empty slots are hidden on the
  // site, never shown as blanks.
  { key: 'gallery5',  filename: 'gallery-5.jpg',  group: 'home', optional: true, mobile: true,
    label: 'Gallery 5 · Extra', where: 'Optional 5th home-gallery photo — shows only if uploaded' },
  { key: 'gallery6',  filename: 'gallery-6.jpg',  group: 'home', optional: true, mobile: true,
    label: 'Gallery 6 · Extra', where: 'Optional 6th home-gallery photo — shows only if uploaded' },
  { key: 'gallery7',  filename: 'gallery-7.jpg',  group: 'home', optional: true, mobile: true,
    label: 'Gallery 7 · Extra', where: 'Optional 7th home-gallery photo — shows only if uploaded' },
  { key: 'gallery8',  filename: 'gallery-8.jpg',  group: 'home', optional: true, mobile: true,
    label: 'Gallery 8 · Extra', where: 'Optional 8th home-gallery photo — shows only if uploaded' },
  { key: 'gallery9',  filename: 'gallery-9.jpg',  group: 'home', optional: true, mobile: true,
    label: 'Gallery 9 · Extra', where: 'Optional 9th home-gallery photo — shows only if uploaded' },
  { key: 'gallery10', filename: 'gallery-10.jpg', group: 'home', optional: true, mobile: true,
    label: 'Gallery 10 · Extra', where: 'Optional 10th home-gallery photo — shows only if uploaded' },
  { key: 'storyFeature', filename: 'story-feature.jpg', group: 'home', fallbackKey: 'interior',
    label: 'Story — feature image', where: 'Framed photo that reveals (curtain wipe) beside the story text' },
  { key: 'detail2',  filename: 'MOYAL-09885.jpg', group: 'home',
    label: 'Events — photo block', where: 'Beside the events text near the footer' },

  // ── MENU PAGES ─────────────────────────────────────────────────────
  { key: 'menuIntro', filename: 'menu-intro.jpg', group: 'menu', fallbackKey: 'kitchen',
    label: 'Menu intro', where: 'Large photo at the top of every menu page' },

  // ── EVENTS PAGE ────────────────────────────────────────────────────
  { key: 'menuEvents', filename: 'MOYAL-09682.jpg', group: 'events', fallbackKey: 'detail2',
    label: 'Events page photo', where: 'Full-width band near the top of the Events page' },

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
  home:   'Home page',
  menu:   'Menu pages',
  events: 'Events page',
  about:  'About page',
} as const;
