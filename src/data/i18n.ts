// All UI strings and page copy, keyed by language.
//
// Strings marked [HTML] contain inline markup (<strong>, <em>, <br />) and
// must be rendered with Astro's set:html directive instead of {expression}.
//
// Usage:
//   import { pick, header } from '../data/i18n';
//   const t = pick(header, lang);   // t.home → 'בית' or 'Home'

export type Lang = 'he' | 'en';

export function pick<T extends Record<string, { he: string; en: string }>>(
  section: T,
  lang: Lang,
): { [K in keyof T]: string } {
  return Object.fromEntries(
    Object.entries(section).map(([k, v]) => [k, v[lang]]),
  ) as { [K in keyof T]: string };
}

// ── Header ──────────────────────────────────────────────────────────────────

export const header = {
  home:       { he: 'בית',      en: 'Home'      },
  location:   { he: 'מיקום',    en: 'Location'  },
  menu:       { he: 'תפריט',    en: 'Menu'      },
  contact:    { he: 'צור קשר',  en: 'Contact'   },
  reserve:    { he: 'הזמנה',    en: 'Reserve'   },
  langToggle: { he: 'EN',       en: 'עברית'     },
};

// ── Footer ───────────────────────────────────────────────────────────────────

export const footer = {
  hours:         { he: 'שעות פעילות',           en: 'Hours'             },
  weekdays:      { he: 'ב׳–ה׳ · 18:00–22:00',    en: 'Mon–Thu · 18:00–22:00' },
  closedNote:    { he: 'סגור בשישי ובשבת',      en: 'Closed Fri & Sat'   },
  hotelNote:     { he: "במלון נוצ׳ה, רחוב בן סירא", en: 'Inside Nucha Hotel, Ben Sira Street' },
  contact:       { he: 'יצירת קשר',             en: 'Contact'           },
  follow:        { he: 'עקבו אחרינו',           en: 'Follow'            },
  reserve:       { he: 'הזמנת מקום',            en: 'Reserve'           },
  rights:        { he: 'כל הזכויות שמורות',     en: 'All rights reserved' },
  accessibility: { he: 'הצהרת נגישות',          en: 'Accessibility'     },
  privacy:       { he: 'מדיניות פרטיות',        en: 'Privacy'           },
  menuLink:      { he: 'תפריט מלא',              en: 'Full menu'         },
};

// ── Menu embed ───────────────────────────────────────────────────────────────

export const menuEmbed = {
  eyebrow:     { he: 'תפריט · מתעדכן יומי',                                en: 'Menu · Updated daily'    },
  title:       { he: 'הצלחת של היום',                                       en: "Today's plate"           },
  lede:        {
    he: 'התפריט שלנו משתנה לפי מה שיש בשוק היום בבוקר. ישבו, רעננו את הדף, וגלו מה רועי המציא היום.',
    en: "The menu shifts with whatever the morning market gave us. Settle in, refresh, and see what Roi cooked up today.",
  },
  openTab:     { he: 'פתח בכרטיסייה חדשה',                                 en: 'Open in new tab'         },
  download:    { he: 'הורד PDF',                                            en: 'Download PDF'            },
  mobileLabel: { he: 'תצוגת PDF לא נתמכת במכשיר זה',                       en: 'Inline PDF preview is not supported on this device' },
  mobileCta:   { he: 'פתח את התפריט',                                       en: 'Open the menu'           },
  ariaLabel:   { he: 'תפריט המסעדה',                                        en: 'Restaurant menu'         },
};

// ── Home page ─────────────────────────────────────────────────────────────────

export const home = {
  heroEyebrow:      { he: 'מסעדת שף · ירושלים',  en: 'Chef restaurant · Jerusalem' },
  heroHeadline:     { he: 'הזרע המופלא של',       en: "Angelica's"                  },
  heroTitleMark:    { he: 'זהרה Zahara',          en: 'younger sister.'             },

  // [HTML] contains <em>
  heroLede: {
    he: "במלון נוצ׳ה ברחוב בן סירא, השף רועי אחדות פותח שולחן — מטבח ים-תיכוני כשר עם טכניקה צרפתית והשפעות אסייתיות. בגישה של <em>\"sharing is caring\"</em>, מנות שעוברות בין כולם.",
    en: 'Inside Nucha Hotel on Ben Sira Street, chef Roi Achdut sets a table — kosher Mediterranean cooking, French technique, Asian accents. Built for <em>sharing is caring</em>: dishes that move around the table.',
  },

  heroCtaReserve: { he: 'הזמינו מקום',    en: 'Reserve a table' },
  heroCtaMenu:    { he: 'לתפריט',         en: 'See the menu'    },

  infoHoursLabel:   { he: 'שעות',              en: 'Hours'        },
  infoHoursValue:   { he: 'ב׳–ה׳ · 18:00–22:00', en: 'Mon–Thu · 18:00–22:00' },
  infoAddressLabel: { he: 'כתובת',             en: 'Address'      },
  infoAddressValue: { he: 'בן סירא, ירושלים', en: 'Ben Sira St, Jerusalem' },
  infoReservLabel:  { he: 'להזמנות',           en: 'Reservations' },
  infoTabit:        { he: 'הזמנה בטאביט ↗',     en: 'Book on Tabit ↗' },
  infoChefLabel:    { he: 'השף',               en: 'Chef'         },

  storyEyebrow: { he: 'הסיפור', en: 'The story' },

  // [HTML] contains <br />
  storyHeading: {
    he: 'אחותה הצעירה<br />של אנג׳ליקה.',
    en: 'A new chapter,<br />one kitchen.',
  },

  storyP1: {
    he: "אנג׳ליקה פעלה במשך 16 שנה כמוסד קולינרי בירושלים. זהרה היא הפרק הבא — מסעדה חדשה בקומת הכניסה של מלון נוצ׳ה (Nucha by Fattal Colors) ברחוב בן סירא, ליד גן העצמאות וכיכר ציון.",
    en: 'Angelica has been a Jerusalem culinary institution for sixteen years. Zahara is the next chapter — a new restaurant on the ground floor of Nucha Hotel (Nucha by Fattal Colors) on Ben Sira Street, steps from Independence Garden and Zion Square.',
  },

  // [HTML] contains <strong>
  storyP2: {
    he: 'השף <strong>רועי אחדות</strong>, ותיק במטבח של אנג׳ליקה, מציע כאן מטבח ים-תיכוני נדיב עם טכניקות צרפתיות קלאסיות והשפעות אסייתיות. מטבח כשר, עונתי, מבוסס על תוצרת מקומית טרייה — דגים, בשר, ירקות שמתחלפים עם השוק.',
    en: 'Chef <strong>Roi Achdut</strong>, a longtime Angelica veteran, offers a generous Mediterranean kitchen here, anchored by classical French technique with Asian influences. The kitchen is kosher, seasonal, and built on fresh local sourcing — fish, meat, and vegetables that change with the market.',
  },

  // [HTML] contains <em>
  storyP3: {
    he: 'במקום הסדר השמרני של מנה ראשונה–עיקרית–קינוח, זהרה משחקת על הקונספט של <em>sharing is caring</em>. שולחן עליז, מנות עוברות, קצב דינמי, ובמרכז המסעדה — מטבח פתוח שכל סועד יכול לראות, ולהרגיש את החיבור בין הצלחת לאנשים שמכינים אותה.',
    en: 'Instead of the conventional starter–main–dessert order, Zahara plays on a <em>sharing is caring</em> concept. A joyful table, dishes moving between guests, dynamic rhythm — and at the heart of the room, an open kitchen visible to every diner, connecting the food to the people making it.',
  },

  kitchenEyebrow: { he: 'המטבח',           en: 'The kitchen'     },
  kitchenHeading: { he: 'חומר גלם, לפני הכל.', en: 'Ingredients first.' },

  kitchenP1: {
    he: 'התפריט בנוי סביב מה שמגיע מהשוק בבוקר. דגים שעלו ביום, ירקות מהלילה הקודם, יין שיש לו שם. מנות מתחלפות, אבל ההיגיון נשאר — לכבד את החומר.',
    en: "The menu is built around what the morning market brought in. Fish landed today, vegetables picked last night, wine with a name. Dishes change; the logic doesn't — respect the raw material.",
  },

  kitchenP2: {
    he: 'המנות מיועדות לשיתוף. מומלץ להזמין בנדיבות, לתת לזה לזרום, ולסמוך על השף.',
    en: 'Plates are designed to be shared. Order generously, let it flow, and trust the chef.',
  },

  pullQuote: {
    he: '"אנחנו לא מבשלים מנות. אנחנו מבשלים את <em>הערב</em> של אנשים."',
    en: '"We don\'t cook dishes. We cook people\'s <em>evening</em>."',
  },
  pullQuoteAttr: {
    he: 'רועי אחדות · שף',
    en: 'Roi Achdut · Chef',
  },

  galleryEyebrow: { he: 'גלריה',         en: 'Gallery'                   },
  galleryHeading: { he: 'הצצה לערב.',    en: 'A glimpse of the evening.' },

  eventsEyebrow: { he: 'אירועים פרטיים', en: 'Private events' },

  // [HTML] contains <br />
  eventsHeading: {
    he: 'חלל פרטי,<br />ערב פרטי.',
    en: 'Private space,<br />private night.',
  },

  eventsP1: {
    he: 'המסעדה ניתנת לסגירה לאירועים פרטיים ועסקיים. חדר פרטי לקבוצות אינטימיות, החלל המורחב לאירועי חברה, או המסעדה כולה לארוחות סגורות.',
    en: 'The restaurant is available for private and corporate events — an intimate private room for small groups, an extended space for company gatherings, or the entire restaurant for closed seatings.',
  },

  eventsP2: {
    he: 'כל אירוע מתוכנן עם השף. נחזור אליכם תוך יום עסקים.',
    en: 'Each event is planned with the chef. We respond within one business day.',
  },

  eventsCta: { he: 'לפנייה לאירועים ↗', en: 'Inquire about events ↗' },

  menuSectionEyebrow: { he: 'תפריט · מתעדכן יומי', en: 'Menu · Updated daily' },
  menuSectionTitle:   { he: 'הצלחת של היום.',       en: "Today's plate."       },
  menuSectionLede: {
    he: 'התפריט משתנה עם מה שהגיע מהשוק בבוקר — מנות דגים, בשר וירקות שמתחלפות בכל יום.',
    en: 'The menu shifts with whatever the morning market gave us — fish, meat, vegetables, all changing daily.',
  },
  menuSectionCta: { he: 'לתפריט המלא', en: 'View the full menu' },

  // ── Editorial signature ─────────────────────────────────────────────────────
  // A single magazine-style "masthead" line that sits below the hero. Encodes
  // the project's editorial identity in one quiet typographic gesture.
  issueLine:   { he: 'מהדורה ראשונה · ירושלים · 2026', en: 'Volume I · Jerusalem · 2026' },
  issueChef:   { he: 'בשבט של רועי אחדות',             en: 'From the kitchen of Roi Achdut' },

  // ── In-page table of contents (above the menu chapters) ────────────────────
  tocEyebrow:  { he: 'בערב הזה',  en: 'On the menu tonight' },
  tocHeading:  { he: 'ארבעה פרקים.', en: 'Four chapters.'    },
};

// ── Location page ─────────────────────────────────────────────────────────────

export const location = {
  eyebrow:  { he: 'איך מגיעים', en: 'Getting here' },
  heading:  { he: 'לבוא אלינו.', en: 'Find us.'     },

  lede: {
    he: "זהרה יושבת בקומת הכניסה של מלון נוצ׳ה (Nucha by Fattal Colors) ברחוב בן סירא — דקות הליכה מגן העצמאות, מדרחוב בן יהודה, כיכר ציון, ממילא והעיר העתיקה.",
    en: "Zahara sits on the ground floor of Nucha Hotel (Nucha by Fattal Colors) on Ben Sira Street — a few minutes' walk from Independence Garden, Ben Yehuda pedestrian mall, Zion Square, Mamilla and the Old City.",
  },

  waze:    { he: 'פתחו ב-Waze',        en: 'Open in Waze'         },
  gmaps:   { he: 'פתחו ב-Google Maps', en: 'Open in Google Maps'  },
  call:    { he: 'חייגו 077-303-4180', en: 'Call +972 77 303 4180' },
  mapTitle:{ he: 'מפת הגעה לזהרה',    en: 'Map to Zahara'         },

  infoEyebrow: { he: 'חניה והגעה',          en: 'Parking & transit'    },

  // [HTML] contains <br />
  infoHeading: {
    he: 'המסלול<br />הקצר ביותר.',
    en: 'The shortest<br />way here.',
  },

  // [HTML] each paragraph opens with <strong>
  infoByCar: {
    he: '<strong>ברכב:</strong> חניוני ממילא ובנייני האומה במרחק של 5–7 דקות הליכה. בלילה החניה ברחוב בן סירא חופשית.',
    en: "<strong>By car:</strong> Mamilla and Binyenei HaUma parking structures are 5–7 minutes' walk away. Street parking on Ben Sira is free at night.",
  },

  infoByTransit: {
    he: '<strong>בתחבורה ציבורית:</strong> תחנת הרכבת הקלה "כיכר ציון" במרחק 4 דקות הליכה. אוטובוסים רבים עוצרים ברחוב יפו הסמוך.',
    en: '<strong>By public transit:</strong> The light rail "Zion Square" station is a 4-minute walk. Many bus lines stop on the adjacent Jaffa Street.',
  },

  infoAccessibility: {
    he: '<strong>נגישות:</strong> הכניסה למסעדה והשירותים נגישים לכיסא גלגלים. למידע מפורט אנא התקשרו אלינו לפני ההגעה.',
    en: '<strong>Accessibility:</strong> Both the entrance and restrooms are wheelchair accessible. For detailed information, please call before your visit.',
  },

  infoBooking: {
    he: '<strong>אירוח קטן:</strong> זהרה היא מסעדה אינטימית. אנו ממליצים בחום להזמין מקום מראש דרך טאביט.',
    en: '<strong>Booking:</strong> Zahara is an intimate room. We strongly recommend reserving via Tabit in advance.',
  },
};

// ── Menu page ─────────────────────────────────────────────────────────────────

export const menu = {
  eyebrow:     { he: 'תפריט · מתעדכן יומי',  en: 'Menu · Updated daily'  },
  heading:     { he: 'מה יש היום.',           en: "What's on today."      },
  lede: {
    he: 'התפריט משתנה עם מה שהגיע מהשוק בבוקר. רעננו את הדף לגרסה העדכנית.',
    en: 'Changes with the morning market. Refresh the page for the latest.',
  },
  tabFood:      { he: 'תפריט',         en: 'Food'      },
  tabDesserts:  { he: 'קינוחים',       en: 'Desserts'  },
  tabWine:      { he: 'יין',           en: 'Wine'      },
  tabCocktails: { he: 'קוקטיילים',     en: 'Cocktails' },
  tabEvents:    { he: 'אירועים',       en: 'Events'    },
  priceBottle:  { he: 'בקבוק',         en: 'Bottle'    },
  priceGlass:   { he: 'כוס',           en: 'Glass'     },
  openTab:      { he: 'פתח בכרטיסייה ↗', en: 'Open in tab ↗' },
  download:     { he: 'הורד PDF',       en: 'Download PDF' },
  notReady:     { he: 'התפריט עדיין לא הועלה', en: 'Menu coming soon' },
  mobileOpen:   { he: 'פתח תפריט',      en: 'Open menu' },
};

// ── Contact page ──────────────────────────────────────────────────────────────
// Single page, two modes: a general inquiry form, and an event inquiry form.
// The toggle at the top swaps between them using the same submission endpoint.

export const contact = {
  eyebrow: { he: 'יצירת קשר',  en: 'Get in touch' },

  // [HTML] contains <br />
  heading: {
    he: 'דברו<br />איתנו.',
    en: 'Say<br />hello.',
  },

  lede: {
    he: 'שאלות, בקשות מיוחדות, שיתופי פעולה — או אירוע שתרצו לסגור איתנו. בחרו את הטופס המתאים, ונחזור אליכם תוך יום עסקים.',
    en: "Questions, special requests, collaborations — or a private night you'd like to plan with us. Pick the form that fits, and we'll get back to you within one business day.",
  },

  // ── Mode toggle ─────────────────────────────────────────────────────────────
  modeGeneral:        { he: 'פנייה רגילה',  en: 'General inquiry'  },
  modeEvent:          { he: 'פנייה לאירוע',  en: 'Event inquiry'    },
  modeGeneralCaption: { he: 'שאלה, הזמנה, בקשה',          en: 'A question, a booking, a request' },
  modeEventCaption:   { he: 'אירוע פרטי, עסקי, יום הולדת', en: 'Private, corporate, birthday'    },

  formEyebrowGeneral: { he: 'טופס פנייה',          en: 'Inquiry form'              },
  formEyebrowEvent:   { he: 'טופס פנייה לאירוע',    en: 'Event inquiry form'        },
  formHeadingGeneral: { he: 'מה נוכל לעזור?',      en: "How can we help?"          },
  formHeadingEvent:   { he: 'ספרו לנו על הערב.',    en: 'Tell us about the night.'  },

  fieldName:    { he: 'שם מלא',         en: 'Full name'         },
  fieldPhone:   { he: 'טלפון',          en: 'Phone'             },
  fieldEmail:   { he: 'אימייל',         en: 'Email'             },
  fieldDate:    { he: 'תאריך משוער',    en: 'Estimated date'    },
  fieldType:    { he: 'סוג האירוע',     en: 'Event type'        },
  fieldGuests:  { he: 'מספר סועדים',    en: 'Guest count'       },
  fieldMessage: { he: 'פרטים נוספים',   en: 'Additional details' },

  typeChoose:   { he: 'בחרו...',        en: 'Choose...'         },
  typePrivate:  { he: 'אירוע פרטי',     en: 'Private event'     },
  typeBusiness: { he: 'אירוע עסקי',     en: 'Corporate event'   },
  typeBirthday: { he: 'יום הולדת',      en: 'Birthday'          },
  typeOther:    { he: 'אחר',            en: 'Other'             },

  submitGeneral: { he: 'שליחת פנייה',  en: 'Send message' },
  submitEvent:   { he: 'שליחת פנייה',  en: 'Send inquiry' },

  statusSending:    { he: 'שולח...',                                              en: 'Sending...'                                    },
  statusSuccess:    { he: 'הפנייה התקבלה. נחזור אליכם תוך יום עסקים.',           en: "Thanks. We'll get back to you within one business day." },
  statusErrNetwork: { he: 'שגיאת רשת. נסו שוב.',                                  en: 'Network error. Please try again.'              },
  statusErrGeneral: { he: 'שגיאה בשליחה. נסו שוב או חייגו אלינו.',               en: 'Something went wrong. Please try again or call us.' },

  benefitPrivate: { he: 'חדר פרטי לקבוצות אינטימיות',     en: 'Private room for intimate groups' },
  benefitChef:    { he: 'התפריט נבנה אישית עם השף',        en: 'Menu built personally with the chef' },
  benefitKosher:  { he: 'מטבח כשר · אופציות צמחוניות',     en: 'Kosher kitchen · vegetarian options' },
  benefitFull:    { he: 'אפשרות לסגירת המסעדה כולה',       en: 'Full restaurant buyouts available' },

  reachUsEyebrow: { he: 'דרכים נוספות', en: 'Other ways to reach us' },
  reachUsPhoneLabel: { he: 'טלפון',  en: 'Phone'   },
  reachUsEmailLabel: { he: 'אימייל', en: 'Email'   },
};
