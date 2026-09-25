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

import { IS_ROOFTOP, SITE_QUERY, SITE_QUERY_AMP } from './base';
import { RESTAURANT, ROOFTOP_CONTACT, type Hours, type Phone } from '../data/restaurant';
import { PHOTOS, type PhotoEntry } from '../data/photos';
import { ASSET_VERSION_TOKEN } from './photo';
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
  /** Source `ogPhoto` from the MOBILE (portrait) variant route rather than the
   *  desktop one. The phone hero is often a different, stronger frame than the
   *  desktop shot — see the note on ZAHARA.ogPhoto below. */
  ogFromMobile?: boolean;

  // ── What a visitor can contact, follow and read on THIS venue's pages ────
  //
  // These existed only as RESTAURANT.* constants, which meant every header,
  // footer, info strip and legal page on /rooftop published the restaurant's
  // Instagram, Facebook, inbox and opening hours. A visitor who followed the
  // rooftop's Instagram link landed on the restaurant. Everything a page
  // renders about "us" now comes from here, so a second venue is a second set
  // of facts rather than a copy of the first.

  /** Instagram profile. Always present — both venues have one. */
  instagram:  string;
  /** Facebook page, or null where the venue has none: the link is then not
   *  rendered at all rather than pointing at the other venue's. */
  facebook:   string | null;
  /** wa.me click-to-chat, derived from whichever phone this venue answers. */
  whatsapp:   string;
  email:      string;
  phone:      Phone;
  hours:      Hours;

  /** Kashrut is the restaurant's certification, not the bar's. Where false,
   *  the certificate links and lightbox are not rendered on this venue's
   *  pages at all. */
  kosher:     boolean;
  /** The home Instagram feed reads ONE account, through a single Meta token.
   *  Until the rooftop has a token of its own, showing the band on its pages
   *  would fill them with the restaurant's posts. */
  igFeed:     boolean;

  /** Whether the shared copy in src/data/i18n.ts describes THIS venue.
   *
   *  It describes Zahara: its hero names the restaurant, its story band is
   *  Angelica's younger sister, its chef, its kosher kitchen. That copy was
   *  shipping on the rooftop too, so the bar's own home page told visitors it
   *  was a chef restaurant founded by Angelica — not a rooftop bar.
   *
   *  Where this is false the venue-describing strings ship EMPTY instead, and
   *  the bands that hold them hide themselves (`data-empty-hide`). Nothing is
   *  lost: the owner writes that venue's own words in /admin/content and the
   *  band comes back, filled in — the same self-emptying contract the Events
   *  bands use. Empty is honest; wrong is not. */
  ownCopy:    boolean;

  /** The hero's kicker and wordmark, for a venue the shared copy does not
   *  describe. Omitted for Zahara, whose hero copy IS the shared copy in
   *  src/data/i18n.ts. The hero is the first thing on the page, so a venue
   *  gets its own name here rather than the blank `ownCopy: false` gives the
   *  narrative bands below it. */
  hero?: { eyebrow: Record<Lang, string>; mark: Record<Lang, string> };
}

/** wa.me wants the full international number with no '+', spaces or dashes. */
const waLink = (dialEn: string) => `https://wa.me/${dialEn.replace(/[^0-9]/g, '')}`;

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
  // The hero KEY, but sourced from its mobile variant: the portrait crop the
  // owner uploaded for the phone hero is a different, brighter frame than the
  // desktop shot, and it reads far better at link-card size. Swapping the
  // "Hero (mobile)" photo in /admin/images changes the preview card with it.
  ogPhoto:      PHOTOS.hero,
  ogFromMobile: true,

  instagram: RESTAURANT.instagram,
  facebook:  RESTAURANT.facebook,
  whatsapp:  RESTAURANT.whatsapp,
  email:     RESTAURANT.email,
  phone:     RESTAURANT.phone,
  hours:     RESTAURANT.hours,
  kosher:    true,
  igFeed:    true,
  ownCopy:   true,
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

  // Its own audience; the building's phone and inbox until it has its own.
  // Every null in ROOFTOP_CONTACT is a deliberate "shared with the
  // restaurant", not an oversight — see the note there.
  instagram: ROOFTOP_CONTACT.instagram,
  facebook:  ROOFTOP_CONTACT.facebook,
  whatsapp:  ROOFTOP_CONTACT.phone
    ? waLink(ROOFTOP_CONTACT.phone.dialEn)
    : RESTAURANT.whatsapp,
  email:     ROOFTOP_CONTACT.email ?? RESTAURANT.email,
  phone:     ROOFTOP_CONTACT.phone ?? RESTAURANT.phone,
  hours:     ROOFTOP_CONTACT.hours ?? RESTAURANT.hours,
  // The kashrut certificate is the restaurant's, issued to its kitchen.
  kosher:    false,
  // One Meta token, one account: the feed would be the restaurant's posts.
  igFeed:    false,
  // The shared copy is the restaurant's. The rooftop's own words go in
  // /admin/content; until then its narrative bands ship empty, not wrong.
  ownCopy:   false,
  // What the bar is, in its own words — the two strings the hero prints. Only
  // facts its address and its own pages establish, same rule as the schema
  // above. Editable per venue in /admin/content like any other copy.
  hero: {
    eyebrow: { he: 'בר גג · ירושלים',  en: 'Rooftop bar · Jerusalem' },
    mark:    { he: 'Nucha Rooftop',    en: 'Nucha Rooftop'           },
  },
  // The hero slot has no rooftop upload yet, so it would serve Zahara's photo.
  // moodDining does have one — swap this (or upload a rooftop hero in
  // /admin/images with Rooftop selected) to change the preview card.
  ogPhoto:    PHOTOS.moodDining,
};

export const VENUE: VenueIdentity = IS_ROOFTOP ? ROOFTOP : ZAHARA;

/** Shared copy that DESCRIBES the venue — a hero wordmark, a story paragraph,
 *  a chef's name. Returns it unchanged for the venue it was written about, and
 *  an empty string for any other, whose own words belong in /admin/content.
 *  Wrap every such string; leave structural labels ("Menu", "Reserve") alone,
 *  since those are true of any venue. */
export const venueCopy = (s: string): string => (VENUE.ownCopy ? s : '');

/** The venue's own copy of a photo, at full size. The /photos route is NOT
 *  duplicated under /rooftop, so the rooftop asks for its bucket with
 *  ?site=rooftop — without which a rooftop link preview shows Zahara's
 *  photograph. */
export function venuePhotoUrl(photo: PhotoEntry, origin: string): string {
  return new URL(photo.src + SITE_QUERY, origin).href;
}

/** The dimensions every link-card scraper crops to (Facebook, WhatsApp,
 *  LinkedIn, iMessage; Twitter's summary_large_image is close enough). Exported
 *  so the layout can declare them as og:image:width/height — scrapers that read
 *  them render the card on first paste instead of after they fetch the file. */
export const OG_IMAGE_W = 1200;
export const OG_IMAGE_H = 630;

/** The link-preview card image.
 *
 *  Three things this does that a bare photo URL did not:
 *
 *  1. CROPS to 1200x630. Scrapers crop to that ratio themselves, so handing
 *     them a full-frame photo (or, for Zahara, a 9:16 portrait) let them choose
 *     the crop. We choose it.
 *  2. Forces `format=jpeg`. `format=auto` negotiates on the Accept header, and
 *     scrapers send a wildcard — no reason to risk one of them being handed a
 *     webp or avif it will not decode.
 *  3. Carries the ?v= asset-version cache-buster, like every other image URL on
 *     the site. Without it the og:image URL never changes, so WhatsApp and
 *     Facebook keep serving the photo they cached the first time the link was
 *     shared — re-uploading the photo in /admin would never show up.
 *
 *  `ogFromMobile` reads the portrait variant route, which falls back to the
 *  desktop photo when no mobile crop has been uploaded (functions/photos-m),
 *  so this is safe even for a key with no portrait upload. */
export function venueOgImageUrl(venue: VenueIdentity, origin: string): string {
  const path = venue.ogPhoto.src.replace(/^\/+/, '')
    .replace(/^photos\//, venue.ogFromMobile ? 'photos-m/' : 'photos/');
  const opts = `width=${OG_IMAGE_W},height=${OG_IMAGE_H},quality=82,format=jpeg,fit=cover`;
  return new URL(
    `/cdn-cgi/image/${opts}/${path}?v=${ASSET_VERSION_TOKEN}${SITE_QUERY_AMP}`,
    origin,
  ).href;
}
