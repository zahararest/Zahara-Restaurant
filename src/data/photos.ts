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
  // ── /reserve/ venue portal — one full-height panel each.
  // Their own keys (not the home page's) so the portal's photography can be
  // swapped in /admin/images without changing anything else on the site. Until
  // an image is uploaded, each falls back to the shot it stands in for — see
  // the `fallbackKey` rows in functions/data/photos-map.ts — so the portal is
  // never broken, just not yet customised.
  reserveZahara: {
    src: `${base}/reserve-zahara.jpg`,
    alt: { he: 'אולם המסעדה', en: 'The dining room' },
  },
  reserveRooftop: {
    src: `${base}/reserve-rooftop.jpg`,
    alt: { he: 'בר הגג', en: 'The rooftop bar' },
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

  // ── The longer Events section (hidden until switched on in /admin) ──────
  // No files ship for these; they exist once the owner uploads them, exactly
  // like the optional gallery slots above.
  eventsFilm:   { src: `${base}/events-film.jpg`,    alt: { he: 'אירוע בזהרה', en: 'An evening at Zahara' } },
  eventsExtra1: { src: `${base}/events-extra-1.jpg`, alt: { he: 'אירוע בזהרה', en: 'An evening at Zahara' } },
  eventsExtra2: { src: `${base}/events-extra-2.jpg`, alt: { he: 'אירוע בזהרה', en: 'An evening at Zahara' } },
  eventsExtra3: { src: `${base}/events-extra-3.jpg`, alt: { he: 'אירוע בזהרה', en: 'An evening at Zahara' } },

  // ── "Events we have hosted" — the gallery on the Events page ────────────
  // Eight optional slots, same contract as the home-gallery extras: no file
  // ships, each frame appears only once a photograph is uploaded for it, and
  // the whole band stays hidden while they are all empty. Each has its own
  // caption in /admin/content → Events, which is where the event itself gets
  // described.
  eventsPast1: { src: `${base}/events-past-1.jpg`, alt: { he: 'אירוע שהתארח בזהרה', en: 'An event hosted at Zahara' } },
  eventsPast2: { src: `${base}/events-past-2.jpg`, alt: { he: 'אירוע שהתארח בזהרה', en: 'An event hosted at Zahara' } },
  eventsPast3: { src: `${base}/events-past-3.jpg`, alt: { he: 'אירוע שהתארח בזהרה', en: 'An event hosted at Zahara' } },
  eventsPast4: { src: `${base}/events-past-4.jpg`, alt: { he: 'אירוע שהתארח בזהרה', en: 'An event hosted at Zahara' } },
  eventsPast5: { src: `${base}/events-past-5.jpg`, alt: { he: 'אירוע שהתארח בזהרה', en: 'An event hosted at Zahara' } },
  eventsPast6: { src: `${base}/events-past-6.jpg`, alt: { he: 'אירוע שהתארח בזהרה', en: 'An event hosted at Zahara' } },
  eventsPast7: { src: `${base}/events-past-7.jpg`, alt: { he: 'אירוע שהתארח בזהרה', en: 'An event hosted at Zahara' } },
  eventsPast8: { src: `${base}/events-past-8.jpg`, alt: { he: 'אירוע שהתארח בזהרה', en: 'An event hosted at Zahara' } },

  // ── The new two-venue Events page (/events2/) ──────────────────────────
  // Shared slots (one bucket for both venues, like /reserve/). Every one
  // stands in with a photograph the venue already has until its own is
  // uploaded — see the `events2*` rows in functions/data/photos-map.ts.
  ev2Zahara:      { src: `${base}/events2-zahara.jpg`,       alt: { he: 'אולם זהרה ערוך לאירוח', en: 'Zahara’s dining room, set for guests' } },
  ev2Rooftop:     { src: `${base}/events2-rooftop.jpg`,      alt: { he: 'בר הגג של מלון נוצ׳ה', en: 'The bar on the roof of Nucha Hotel' } },
  ev2ZaharaForm:  { src: `${base}/events2-zahara-form.jpg`,  alt: { he: 'אורחות מרימות כוסית בבר של זהרה', en: 'Guests raising a glass at Zahara’s bar' } },
  ev2RooftopForm: { src: `${base}/events2-rooftop-form.jpg`, alt: { he: 'קוקטייל בבר הגג', en: 'A cocktail at the rooftop bar' } },
  ev2ZaharaPast1: { src: `${base}/events2-zahara-past-1.jpg`, alt: { he: 'ערב בזהרה', en: 'An evening at Zahara' } },
  ev2ZaharaPast2: { src: `${base}/events2-zahara-past-2.jpg`, alt: { he: 'ערב בזהרה', en: 'An evening at Zahara' } },
  ev2ZaharaPast3: { src: `${base}/events2-zahara-past-3.jpg`, alt: { he: 'ערב בזהרה', en: 'An evening at Zahara' } },
  ev2ZaharaPast4: { src: `${base}/events2-zahara-past-4.jpg`, alt: { he: 'ערב בזהרה', en: 'An evening at Zahara' } },
  ev2ZaharaPast5: { src: `${base}/events2-zahara-past-5.jpg`, alt: { he: 'ערב בזהרה', en: 'An evening at Zahara' } },
  ev2ZaharaPast6: { src: `${base}/events2-zahara-past-6.jpg`, alt: { he: 'ערב בזהרה', en: 'An evening at Zahara' } },
  ev2ZaharaPast7: { src: `${base}/events2-zahara-past-7.jpg`, alt: { he: 'ערב בזהרה', en: 'An evening at Zahara' } },
  ev2ZaharaPast8: { src: `${base}/events2-zahara-past-8.jpg`, alt: { he: 'ערב בזהרה', en: 'An evening at Zahara' } },
  ev2RooftopPast1: { src: `${base}/events2-rooftop-past-1.jpg`, alt: { he: 'ערב על הגג', en: 'An evening on the roof' } },
  ev2RooftopPast2: { src: `${base}/events2-rooftop-past-2.jpg`, alt: { he: 'ערב על הגג', en: 'An evening on the roof' } },
  ev2RooftopPast3: { src: `${base}/events2-rooftop-past-3.jpg`, alt: { he: 'ערב על הגג', en: 'An evening on the roof' } },
  ev2RooftopPast4: { src: `${base}/events2-rooftop-past-4.jpg`, alt: { he: 'ערב על הגג', en: 'An evening on the roof' } },
  ev2RooftopPast5: { src: `${base}/events2-rooftop-past-5.jpg`, alt: { he: 'ערב על הגג', en: 'An evening on the roof' } },
  ev2RooftopPast6: { src: `${base}/events2-rooftop-past-6.jpg`, alt: { he: 'ערב על הגג', en: 'An evening on the roof' } },
  ev2RooftopPast7: { src: `${base}/events2-rooftop-past-7.jpg`, alt: { he: 'ערב על הגג', en: 'An evening on the roof' } },
  ev2RooftopPast8: { src: `${base}/events2-rooftop-past-8.jpg`, alt: { he: 'ערב על הגג', en: 'An evening on the roof' } },
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
