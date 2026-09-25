// Static restaurant facts — the single source of truth for all
// names, phone numbers, addresses, URLs, and hours.
// Non-text structural constants (hours as times, day codes, etc.) live here too.

/** A phone line, in the several shapes the page needs it. */
export interface Phone {
  display:     string;   // as printed in Hebrew  (077-303-4180)
  intlDisplay: string;   // as printed in English (+972 77 303 4180)
  dialHe:      string;   // tel: target for the Hebrew pages
  dialEn:      string;   // tel: target for the English pages
}

/** When a venue is open.
 *
 *  `spec` is a LIST, not a single opens/closes pair, because a venue may keep
 *  different hours on different days — the rooftop closes at ten early in the
 *  week and runs to midnight on Thursday. It is what Google reads
 *  (schema.org openingHoursSpecification); `he` / `en` are the human lines
 *  the info strip and footer print, and are also editable per venue in
 *  /admin/content.
 *
 *  Declared as an interface rather than inferred from RESTAURANT below: with
 *  `as const` the inferred type would pin `days` to the restaurant's exact
 *  four weekdays, so no other venue could state different ones. */
export interface Hours {
  he:   string;
  en:   string;
  spec: readonly {
    readonly days: readonly string[];
    readonly opens: string;
    readonly closes: string;
  }[];
}

export const RESTAURANT = {
  name:        { he: 'זהרה',        en: 'Zahara'      },
  sisterName:  { he: 'אנג׳ליקה',    en: 'Angelica'    },
  chef:        { he: 'רועי אחדות',  en: 'Roi Achdut'  },
  hotel:       { he: "מלון נוצ׳ה",  en: 'Nucha Hotel' },

  phone: {
    display: '077-303-4180',
    intlDisplay: '+972 77 303 4180',
    dialHe:  '0773034180',
    dialEn:  '+972773034180',
  },

  email: 'info@zahara.rest',

  address: {
    he:             'ירושלים, בן סירא 16',
    en:            'Ben Sira 16 St, Jerusalem',
    maps:          'Nucha Hotel, Ben Sira 16 Street, Jerusalem',
    streetAddress: 'Ben Sira 16',
    city:          'Jerusalem',
    country:       'IL',
  },

  // Approximate coordinates for Ben Sira St / Nucha Hotel (Zion Square area),
  // Jerusalem — used for the GeoCoordinates in schema.org (a local-SEO signal).
  // The map pin itself comes from Google Business Profile; confirm/refine these
  // against the verified GBP listing when available.
  geo: { lat: 31.7806, lng: 35.2177 },

  established: '2024',

  // Mon–Thu, 18:00–22:00. See the Hours interface above.
  hours: {
    he:   'ב׳–ה׳ · 18:00–22:00',
    en:   'Mon–Thu · 18:00–22:00',
    spec: [
      { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday'], opens: '18:00', closes: '22:00' },
    ],
  } satisfies Hours,

  reservationUrl: 'https://tbit.be/mlBFke',
  instagram:      'https://www.instagram.com/zahara.restaurant/',
  facebook:       'https://www.facebook.com/profile.php?id=61582628067264',
  // WhatsApp click-to-chat — wa.me wants the full international number with no
  // '+', spaces, or dashes. Derived from phone.dialEn (+972 77 303 4180).
  whatsapp:       'https://wa.me/972773034180',

  // Nucha Rooftop's own Tabit booking page — used by the rooftop build
  // (src/lib/venue.ts) and by the /reserve/ two-venue portal
  // (see src/pages/reserve.astro).
  rooftopReservationUrl: 'https://tbit.be/0SB3xP',
} as const;

// ── Nucha Rooftop's own details ────────────────────────────────────────────
//
// The rooftop is a SECOND VENUE, not a second page about the restaurant. It
// shares the building — same street, same hotel — and so far the same phone
// line and inbox. It does not share the things an audience follows: its
// Instagram is its own, and everything below is what the /rooftop build uses
// in place of Zahara's.
//
// Anything left out here deliberately falls through to Zahara's value above
// (see src/lib/venue.ts), because the two genuinely share it. Set a field here
// the moment that stops being true — one line, and every header, footer and
// contact block on the rooftop follows.
export const ROOFTOP_CONTACT = {
  instagram: 'https://www.instagram.com/nucha.rooftop/',
  /** No page of its own yet — the rooftop simply shows no Facebook link
   *  rather than pointing at the restaurant's. Paste a URL to add it back. */
  facebook:  null as string | null,
  /** Same hotel line as the restaurant until told otherwise. Give the bar its
   *  own number by putting a Phone here; the WhatsApp link follows it. */
  phone:     null as Phone | null,
  email:     null as string | null,
  /** A bar keeps different hours from a kitchen. Three nights, and Thursday
   *  runs six hours later than the other two — which is why `spec` is a list.
   *  The printed lines are also editable per venue in /admin/content
   *  (Footer · Hours, and the home info strip). */
  hours: {
    he:   'ג׳–ד׳ · 19:00–22:00 · ה׳ · 18:00–00:00',
    en:   'Tue–Wed · 7–10pm · Thu · 6pm–12am',
    spec: [
      { days: ['Tuesday', 'Wednesday'], opens: '19:00', closes: '22:00' },
      { days: ['Thursday'],             opens: '18:00', closes: '00:00' },
    ],
  } satisfies Hours,
} as const;

// Cloudflare Turnstile (free CAPTCHA) — spam protection on the contact form.
// This is the PUBLIC site key; it is meant to appear in the page HTML, so it
// is safe to commit. Paste the key from the Turnstile widget you create in the
// Cloudflare dashboard (Turnstile → Add widget). Leave it '' to disable the
// widget — the form keeps working, and server-side verification in
// functions/api/contact.ts is likewise skipped unless TURNSTILE_SECRET_KEY
// (a Pages SECRET, never committed) is set. Set BOTH to turn protection on.
export const TURNSTILE_SITEKEY = '0x4AAAAAADkqnGDFoQixq-k3';
