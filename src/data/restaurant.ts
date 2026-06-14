// Static restaurant facts — the single source of truth for all
// names, phone numbers, addresses, URLs, and hours.
// Non-text structural constants (hours as times, day codes, etc.) live here too.

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
    he:            'בן סירא, ירושלים',
    en:            'Ben Sira St, Jerusalem',
    maps:          'Nucha Hotel, Ben Sira Street, Jerusalem',
    streetAddress: 'Ben Sira Street',
    city:          'Jerusalem',
    country:       'IL',
  },

  // Approximate coordinates for Ben Sira St / Nucha Hotel (Zion Square area),
  // Jerusalem — used for the GeoCoordinates in schema.org (a local-SEO signal).
  // The map pin itself comes from Google Business Profile; confirm/refine these
  // against the verified GBP listing when available.
  geo: { lat: 31.7806, lng: 35.2177 },

  established: '2024',

  // Mon–Thu, 18:00–22:00
  hours: {
    he:     'ב׳–ה׳ · 18:00–22:00',
    en:     'Mon–Thu · 18:00–22:00',
    opens:  '18:00',
    closes: '22:00',
    days:   ['Monday', 'Tuesday', 'Wednesday', 'Thursday'] as const,
  },

  reservationUrl: 'https://tabitisrael.co.il/site/noocha-hotel-zahara',
  instagram:      'https://www.instagram.com/zahara.restaurant/',
  facebook:       'https://www.facebook.com/profile.php?id=61582628067264',

  // Rooftop bar — coming soon. Update this URL when the site is live.
  // Set to null to hide the header button entirely.
  rooftopUrl:     null as string | null,
} as const;

// Cloudflare Turnstile (free CAPTCHA) — spam protection on the contact form.
// This is the PUBLIC site key; it is meant to appear in the page HTML, so it
// is safe to commit. Paste the key from the Turnstile widget you create in the
// Cloudflare dashboard (Turnstile → Add widget). Leave it '' to disable the
// widget — the form keeps working, and server-side verification in
// functions/api/contact.ts is likewise skipped unless TURNSTILE_SECRET_KEY
// (a Pages SECRET, never committed) is set. Set BOTH to turn protection on.
export const TURNSTILE_SITEKEY = '0x4AAAAAADkqnGDFoQixq-k3';
