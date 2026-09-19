// Which venue this BUILD is — and everything about it that search engines and
// link previews need.
//
// The site is built twice from one source (see package.json `build`): once as
// Zahara at '/', once as Nucha Rooftop at '/rooftop'. Until now every build
// described itself as Zahara, so /rooftop shared Zahara's <title>, description,
// keywords, schema.org entity and link-preview photo — which is why the rooftop
// could not be found on its own name and its preview card showed the
// restaurant. Everything venue-specific about the page head lives here.
//
// Copy the OWNER edits (headings, paragraphs) is NOT here — that is per-venue
// KV content (functions/data/content.ts). This is only the build-time identity
// the head tags need before any of that loads.

import { IS_ROOFTOP, SITE_QUERY } from './base';
import { RESTAURANT } from '../data/restaurant';
import { PHOTOS, type PhotoEntry } from '../data/photos';
import type { Lang } from '../data/i18n';

export interface VenueIdentity {
  /** Brand name, used as the `… — {brand}` half of every page title. */
  name:        Record<Lang, string>;
  /** og:site_name — one name, not per-language. */
  siteName:    string;
  /** The home page's full <title>. Keyword-led, used verbatim. */
  seoTitle:    Record<Lang, string>;
  /** The home page's meta description. */
  description: Record<Lang, string>;
  /** Fallback description for every other page of this venue. */
  fallbackDescription: Record<Lang, string>;
  keywords:    Record<Lang, string>;
  /** Names people actually search for, for schema.org alternateName. */
  alternateNames: string[];
  /** schema.org type for the primary entity. */
  schemaType:  'Restaurant' | 'BarOrPub';
  /** The venue's own Tabit booking page. */
  reserveUrl:  string;
  /** The photo a shared link previews with. */
  ogPhoto:     PhotoEntry;
}

const ZAHARA: VenueIdentity = {
  name:     RESTAURANT.name,
  siteName: 'Zahara',
  // Zahara's own titles/descriptions stay in src/data/i18n.ts, per page — the
  // pages pass them to BaseLayout and nothing here overrides them. These two
  // are only the fallbacks for a page that passes none.
  seoTitle: {
    he: 'זהרה | מסעדת שף כשרה בירושלים ',
    en: 'Zahara | Kosher chef restaurant in Jerusalem',
  },
  description:         { he: '', en: '' },   // unused: pages supply their own
  fallbackDescription: { he: '', en: '' },   // unused: falls back to layout.defaultDescription
  keywords:            { he: '', en: '' },   // unused: falls back to layout.keywords
  alternateNames: ['זהרה', 'מסעדת זהרה', 'Zahara Jerusalem', 'Zahara Restaurant'],
  schemaType: 'Restaurant',
  reserveUrl: RESTAURANT.reservationUrl,
  ogPhoto:    PHOTOS.hero,
};

// Only facts that can be checked from the venue's own pages and address are
// asserted here — it is the hotel's rooftop bar at the Zahara address. No
// kosher claim, no cuisine, no opening hours: those are Zahara's, and putting
// them in the rooftop's structured data would be telling Google something
// nobody has confirmed.
const ROOFTOP: VenueIdentity = {
  name:     { he: 'Nucha Rooftop', en: 'Nucha Rooftop' },
  siteName: 'Nucha Rooftop',
  seoTitle: {
    he: 'Nucha Rooftop | בר גג בירושלים, מלון נוצ׳ה',
    en: 'Nucha Rooftop | Rooftop bar in Jerusalem, Nucha Hotel',
  },
  description: {
    he: 'Nucha Rooftop — בר הגג של מלון נוצ׳ה ברחוב בן סירא 16 בירושלים, דקות הליכה מכיכר ציון, מדרחוב בן יהודה וממילא. קוקטיילים ומנות לשיתוף מעל העיר. הזמינו מקום.',
    en: 'Nucha Rooftop — the rooftop bar at Nucha Hotel on Ben Sira 16 Street, Jerusalem, steps from Zion Square, the Ben Yehuda mall and Mamilla. Cocktails and plates to share above the city. Book your place.',
  },
  fallbackDescription: {
    he: 'Nucha Rooftop — בר הגג של מלון נוצ׳ה ברחוב בן סירא 16 בירושלים. קוקטיילים ומנות לשיתוף מעל העיר.',
    en: 'Nucha Rooftop — the rooftop bar at Nucha Hotel on Ben Sira 16 Street, Jerusalem. Cocktails and plates to share above the city.',
  },
  // Both spellings of נוצ׳ה (with and without the geresh) — people type both.
  keywords: {
    he: 'Nucha Rooftop, נוצ׳ה רופטופ, רופטופ נוצ׳ה, נוצה רופטופ, בר גג ירושלים, רופטופ ירושלים, בר גג מלון נוצ׳ה, מלון נוצ׳ה, מלון נוצה, רחוב בן סירא 16, כיכר ציון, מדרחוב בן יהודה, ממילא, קוקטיילים ירושלים, בר בירושלים, מסעדת זהרה',
    en: 'Nucha Rooftop, Nucha rooftop bar, rooftop bar Jerusalem, Jerusalem rooftop, Nucha Hotel rooftop, Nucha Hotel Jerusalem, Ben Sira 16 Street, Zion Square, Ben Yehuda, Mamilla, cocktails Jerusalem, bar Jerusalem, Zahara restaurant',
  },
  alternateNames: [
    'נוצ׳ה רופטופ', 'רופטופ נוצ׳ה', 'נוצה רופטופ',
    'Nucha Rooftop Jerusalem', 'Nucha Hotel Rooftop',
  ],
  schemaType: 'BarOrPub',
  reserveUrl: RESTAURANT.rooftopReservationUrl,
  // The hero slot has no rooftop upload yet, so it would serve Zahara's photo.
  // moodDining does have one — swap this (or upload a rooftop hero in
  // /admin/images with Rooftop selected) to change the preview card.
  ogPhoto:    PHOTOS.moodDining,
};

export const VENUE: VenueIdentity = IS_ROOFTOP ? ROOFTOP : ZAHARA;

/** The venue's own copy of a photo. The /photos route is NOT duplicated under
 *  /rooftop, so the rooftop asks for its bucket with ?site=rooftop — without
 *  which a rooftop link preview shows Zahara's photograph. */
export function venuePhotoUrl(photo: PhotoEntry, origin: string): string {
  return new URL(photo.src + SITE_QUERY, origin).href;
}
