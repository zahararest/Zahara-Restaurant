// Local restaurant photography (shipped via /public/photos).
// All images are from the original MOYAL photo shoot — no stock, no external.
// To swap a photo: drop a new file into /public/photos and update `src` here.

import type { Lang } from './i18n';

export interface PhotoEntry {
  src: string;
  alt: Record<Lang, string>;
}

const base = '/photos';

export const PHOTOS = {
  hero: {
    src: `${base}/MOYAL-00009.jpg`,
    alt: { he: 'מנת השף של זהרה', en: 'A signature plate at Zahara' },
  },
  dish: {
    src: `${base}/MOYAL-00020.jpg`,
    alt: { he: 'מנה מהתפריט', en: "A dish from Zahara's menu" },
  },
  interior: {
    src: `${base}/MOYAL-09548.jpg`,
    alt: { he: 'פנים המסעדה', en: 'Restaurant interior' },
  },
  kitchen: {
    src: `${base}/MOYAL-09689.jpg`,
    alt: { he: 'המטבח הפתוח', en: 'The open kitchen' },
  },
  chef: {
    src: `${base}/MOYAL-09851.jpg`,
    alt: { he: 'השף בעבודה', en: 'The chef at work' },
  },
  wine: {
    src: `${base}/MOYAL-09832.jpg`,
    alt: { he: 'בר היין', en: 'The wine bar' },
  },
  bar: {
    src: `${base}/MOYAL-09574.jpg`,
    alt: { he: 'הבר', en: 'The bar' },
  },
  detail2: {
    src: `${base}/MOYAL-09885.jpg`,
    alt: { he: 'אווירה', en: 'Atmosphere' },
  },

  // Framed photo that reveals (gold curtain-wipe) beside the story text on
  // the home page. Its own key so the chef can swap it independently;
  // falls back to the `interior` override until a dedicated one is uploaded.
  storyFeature: {
    src: `${base}/story-feature.jpg`,
    alt: { he: 'רגע מתוך זהרה', en: 'A moment inside Zahara' },
  },

  // ── Moody / dark backgrounds — used behind editorial text sections
  // on the home page. Dramatic lighting + darkening overlay reads as
  // cinematic editorial backdrops.
  moodDining: {
    src: `${base}/MOYAL-09221.jpg`,
    alt: { he: 'אולם המסעדה',  en: 'The dining room' },
  },
  moodChef: {
    src: `${base}/MOYAL-09251.jpg`,
    alt: { he: 'השף עם דג',     en: 'The chef with a cut of fish' },
  },

  // Full-frame "menu split" background on the home page. Its own key (split
  // from moodDining, which still backs the story section) so the two
  // sections use different photos and each can be swapped independently in
  // /admin/images. Falls back to the `kitchen` override until a dedicated
  // image is uploaded (see functions/data/photos-map.ts).
  menuSplit: {
    src: `${base}/menu-split.jpg`,
    alt: { he: 'שולחן בזהרה', en: 'A table at Zahara' },
  },

  // ── Menu-page imagery — per-category hero photos. ─────────────────
  menuFood: {
    src: `${base}/MOYAL-00029.jpg`,
    alt: { he: 'מנת שף', en: 'A chef course' },
  },
  menuDessert: {
    src: `${base}/MOYAL-00084.jpg`,
    alt: { he: 'קינוח', en: 'Dessert' },
  },
  menuWine: {
    src: `${base}/MOYAL-09817.jpg`,
    alt: { he: 'יין על השולחן', en: 'Wine at the table' },
  },
  menuCocktails: {
    src: `${base}/MOYAL-09569.jpg`,
    alt: { he: 'קוקטייל בבר', en: 'A cocktail at the bar' },
  },
  menuEvents: {
    src: `${base}/MOYAL-09682.jpg`,
    alt: { he: 'אירוח באולם', en: 'Hosting in the dining room' },
  },

  // ── Intro photo at the top of the menu pages. Its own key (split from
  // `dish`) so the admin can adjust it separately from the home page.
  // Until a dedicated image is uploaded, the /photos middleware falls
  // back to the `dish` override (see functions/data/photos-map.ts).
  menuIntro: {
    src: `${base}/menu-intro.jpg`,
    alt: { he: 'מנה מהתפריט', en: "A dish from Zahara's menu" },
  },

  // ── Contact & Location page photos. Split from the gallery `interior`
  // shot so each page can be adjusted on its own; both fall back to the
  // `interior` override until a dedicated image is uploaded.
  contact: {
    src: `${base}/contact-page.jpg`,
    alt: { he: 'פנים המסעדה', en: 'Restaurant interior' },
  },
  location: {
    src: `${base}/location-page.jpg`,
    alt: { he: 'פנים המסעדה', en: 'Restaurant interior' },
  },

  // Kashrut certificate (Rabbanut Yerushalayim). Not shown inline anywhere —
  // it opens in a new tab when a visitor clicks the "Rabbanut Yerushalayim"
  // line in the home info-strip or the "View kosher certificate" link on the
  // About page. No shipped default: the links only appear once the owner
  // uploads the certificate via /admin/images. Swap it there at any time.
  kosherCert: {
    src: `${base}/kosher-certificate.jpg`,
    alt: { he: 'תעודת כשרות — רבנות ירושלים', en: 'Kosher certificate — Rabbanut Yerushalayim' },
  },

  // ── Extra home-gallery slots (5–10). These have NO shipped default file;
  // each only appears in the home-page gallery once an admin uploads an
  // image for it via /admin/images. The gallery hides any slot whose photo
  // doesn't load, so empty slots never show as blanks. (The first four
  // gallery shots are `interior`, `chef`, `bar`, `wine` above.)
  gallery5:  { src: `${base}/gallery-5.jpg`,  alt: { he: 'גלריה', en: 'Zahara gallery' } },
  gallery6:  { src: `${base}/gallery-6.jpg`,  alt: { he: 'גלריה', en: 'Zahara gallery' } },
  gallery7:  { src: `${base}/gallery-7.jpg`,  alt: { he: 'גלריה', en: 'Zahara gallery' } },
  gallery8:  { src: `${base}/gallery-8.jpg`,  alt: { he: 'גלריה', en: 'Zahara gallery' } },
  gallery9:  { src: `${base}/gallery-9.jpg`,  alt: { he: 'גלריה', en: 'Zahara gallery' } },
  gallery10: { src: `${base}/gallery-10.jpg`, alt: { he: 'גלריה', en: 'Zahara gallery' } },
} satisfies Record<string, PhotoEntry>;

/** Hero photo shown above each menu category's content. */
export const MENU_CATEGORY_PHOTOS: Record<
  'food' | 'dessert' | 'wine' | 'cocktails' | 'events',
  PhotoEntry
> = {
  food:      PHOTOS.menuFood,
  dessert:   PHOTOS.menuDessert,
  wine:      PHOTOS.menuWine,
  cocktails: PHOTOS.menuCocktails,
  events:    PHOTOS.menuEvents,
};
