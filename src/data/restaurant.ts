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

  email: 'info@zahara-jerusalem.co.il',

  address: {
    he:            'בן סירא, ירושלים',
    en:            'Ben Sira St, Jerusalem',
    maps:          'Nucha Hotel, Ben Sira Street, Jerusalem',
    streetAddress: 'Ben Sira Street',
    city:          'Jerusalem',
    country:       'IL',
  },

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
  facebook:       'https://www.facebook.com/',
} as const;
