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
  menu:        { he: 'תפריט',          en: 'Menu'      },
  events:      { he: 'אירועים',        en: 'Events'    },
  about:       { he: 'אודות',          en: 'About'     },
  reserve:     { he: 'הזמנה',          en: 'Reserve'   },
  rooftop:     { he: 'Nucha Rooftop', en: 'Nucha Rooftop' },
  rooftopSoon: { he: 'בקרוב',         en: 'Soon'         },
  brandText:   { he: 'זהרה',            en: 'Zahara'     },
  langToggle:  { he: 'EN',             en: 'עברית'     },
  themeToggle: { he: 'שינוי ערכת נושא', en: 'Toggle theme' },
  themeLight:  { he: 'בהיר',           en: 'Light'        },
  themeDark:   { he: 'כהה',            en: 'Dark'         },
  burgerAria:  { he: 'תפריט ניווט',   en: 'Navigation menu' },
  navAria:     { he: 'ניווט ראשי',     en: 'Primary'          },
  brandAria:   { he: 'זהרה — עמוד הבית', en: 'Zahara — Home' },
  langToggleAria: { he: 'English',      en: 'עברית'           },
  instagramAria: { he: 'אינסטגרם',      en: 'Instagram'       },
  facebookAria:  { he: 'פייסבוק',       en: 'Facebook'        },
};

// ── Footer ───────────────────────────────────────────────────────────────────

export const footer = {
  hours:         { he: 'שעות פעילות',           en: 'Hours'             },
  weekdays:      { he: 'ב׳–ה׳ · 18:00–22:00',    en: 'Mon–Thu · 18:00–22:00' },
  closedNote:    { he: 'סגור בשישי ובשבת',      en: 'Closed Fri & Sat'   },
  hotelNote:     { he: "במלון נוצ׳ה, רחוב בן סירא", en: 'Inside Nucha Hotel, Ben Sira Street' },
  contact:       { he: 'יצירת קשר',             en: 'Contact'           },
  follow:        { he: 'עקבו אחרינו',           en: 'Follow'            },
  instagram:     { he: 'Instagram',               en: 'Instagram'         },
  facebook:      { he: 'Facebook',                en: 'Facebook'          },
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

export const layout = {
  defaultDescription: {
    he: "זהרה — מסעדת שף כשרה במלון נוצ׳ה, ירושלים. מטבח ים-תיכוני עכשווי, טכניקה צרפתית והשפעות אסייתיות. שף רועי אחדות.",
    en: "Zahara — a kosher chef's restaurant inside Nucha Hotel, Jerusalem. Contemporary Mediterranean kitchen with French technique and Asian influences. Chef Roi Achdut.",
  },
  skipToContent: { he: 'דלג לתוכן', en: 'Skip to content' },
};

export const global = {
  pageNavigation: { he: 'ניווט בעמוד', en: 'Page navigation' },
  scrollToTop:    { he: 'גלילה למעלה', en: 'Scroll to top' },
  scrollToNext:   { he: 'גלול לקטע הבא', en: 'Scroll to next section' },
  previousPhoto:  { he: 'תמונה קודמת', en: 'Previous photo' },
  nextPhoto:      { he: 'תמונה הבאה',  en: 'Next photo' },
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
  pageTitle:      { he: 'בית',             en: 'Home'            },
  pageDescription:{ he: 'זהרה — מסעדת שף כשרה במלון נוצ׳ה, ירושלים. מטבח ים-תיכוני עכשווי עם השפעות צרפתיות ואסייתיות.',
                    en: 'Zahara — a kosher chef restaurant inside Nucha Hotel, Jerusalem. Contemporary Mediterranean dishes with French and Asian influences.' },
  kitchenCaption: { he: 'המטבח של זהרה',   en: 'The Zahara kitchen' },
  secHero:        { he: 'בית',             en: 'Open'            },
  secStory:       { he: 'סיפור',           en: 'Story'           },
  secKitchen:     { he: 'מטבח',            en: 'Kitchen'         },
  secMenu:        { he: 'תפריט',           en: 'Menu'            },
  secGallery:     { he: 'גלריה',           en: 'Gallery'         },
  secInstagram:   { he: 'אינסטגרם',       en: 'Instagram'       },
  secEvents:      { he: 'אירועים',         en: 'Events'          },
  menuIntroEyebrow:{ he: 'התפריט',         en: 'The menu'       },
  chapterCountLabel:{ he: 'פרקים',        en: 'Chapters'       },
  fullMenuLabelFood: { he: 'לתפריט המלא ↗', en: 'See the full menu ↗' },
  fullMenuLabelCocktails: { he: 'לקוקטיילים המלאים ↗', en: 'See all cocktails ↗' },
  fullMenuLabelDessert:  { he: 'לקינוחים המלאים ↗', en: 'See all desserts ↗' },
  emptyLabel:     { he: 'נטען…',          en: 'Loading…'        },
  updatesComingSoon:{ he: 'יתעדכן בקרוב', en: 'Updates coming soon' },

  homeChapterStartEyebrow: { he: 'פתיחה',       en: 'First course'   },
  homeChapterStartTitle:   { he: 'משהו להתחלה', en: 'Beginnings'     },
  homeChapterStartTocLine: { he: 'מנות שמשנות את הערב.', en: 'Dishes that set the tone.' },
  homeChapterMainEyebrow:  { he: 'עיקריות',     en: 'Mains'          },
  homeChapterMainTitle:    { he: 'כמעט הגענו',  en: 'Almost there'   },
  homeChapterMainTocLine:  { he: 'המסע ממשיך עם טעמים עמוקים.', en: 'The journey continues with deeper flavours.' },
  homeChapterCocktailsEyebrow: { he: 'בר',     en: 'Bar'            },
  homeChapterCocktailsTitle:   { he: 'קוקטיילים', en: 'Cocktails'      },
  homeChapterCocktailsTocLine: { he: 'הכנה טרייה, תנועה קלה.', en: 'Freshly mixed, easy-going.' },
  homeChapterDessertEyebrow:   { he: 'קינוח',   en: 'Dessert'        },
  homeChapterDessertTitle:     { he: 'סוף מתוק',  en: 'Sweet finish'   },
  homeChapterDessertTocLine:   { he: 'הסיום הקשה ביותר של הערב.', en: 'The sweetest end of the night.' },

  infoHoursLabel:   { he: 'שעות',              en: 'Hours'        },
  infoHoursValue:   { he: 'ב׳–ה׳ · 18:00–22:00', en: 'Mon–Thu · 18:00–22:00' },
  infoAddressLabel: { he: 'כתובת',             en: 'Address'      },
  infoAddressValue: { he: 'בן סירא, ירושלים', en: 'Ben Sira St, Jerusalem' },
  infoReservLabel:  { he: 'להזמנות',           en: 'Reservations' },
  infoTabit:        { he: 'הזמנה בטאביט ↗',     en: 'Book on Tabit ↗' },
  infoChefLabel:    { he: 'השף',               en: 'Chef'         },
  infoKosherLabel:  { he: 'כשרות',             en: 'Kosher'       },
  infoKosherValue:  { he: 'רבנות ירושלים',     en: 'Rabbanut Yerushalayim' },

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
  storyReadMore: { he: 'קראו את הסיפור', en: 'Read our story' },

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
  igEyebrow:      { he: 'אינסטגרם',      en: 'Instagram'                 },
  igHeading:      { he: 'רגעים מהמטבח.',  en: 'Moments from the kitchen.' },
  igFollow:       { he: 'עקבו אחרינו',    en: 'Follow us'                 },
  igLoading:      { he: 'טוען...',         en: 'Loading…'                  },
  igEmpty:        { he: 'עקבו אחרינו באינסטגרם', en: 'Follow us on Instagram' },
  igAriaStrip:    { he: 'פיד אינסטגרם של זהרה', en: 'Zahara Instagram feed' },
  igHandle:       { he: '@zahara.restaurant', en: '@zahara.restaurant' },

  // ── Menu split — the full-frame "how the table is built" section that
  // replaced the in-page menu preview. One photo, the four parts of the
  // menu, and a single link through to the full menu page.
  menuSplitEyebrow: { he: 'התפריט',           en: 'The menu'              },
  menuSplitHeading: { he: 'שולחן אחד,<br />ארבעה חלקים.', en: 'One table,<br />four parts.' },
  menuSplitLede: {
    he: 'התפריט בנוי לשיתוף ונחלק לארבעה — אוכל מהמטבח, יין, קוקטיילים מהבר וקינוחים. הכול עובר בין כולם.',
    en: 'Built to share and split into four — food from the kitchen, wine, cocktails from the bar, and dessert. Everything moves around the table.',
  },
  menuSplitFood:      { he: 'אוכל',      en: 'Food'      },
  menuSplitWine:      { he: 'יין',       en: 'Wine'      },
  menuSplitCocktails: { he: 'קוקטיילים', en: 'Cocktails' },
  menuSplitDessert:   { he: 'קינוחים',   en: 'Dessert'   },
  menuSplitCta:       { he: 'לתפריט המלא ↗', en: 'See the full menu ↗' },

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
  eventsContactCta: { he: 'צרו קשר', en: 'Contact us' },

  // ── Editorial signature ─────────────────────────────────────────────────────
  // A single magazine-style "masthead" line that sits below the hero. Encodes
  // the project's editorial identity in one quiet typographic gesture.
  issueLine:   { he: 'מהדורה ראשונה · ירושלים · 2026', en: 'Volume I · Jerusalem · 2026' },
  issueChef:   { he: 'בשבט של רועי אחדות',             en: 'From the kitchen of Roi Achdut' },

  // ── In-page table of contents (above the menu chapters) ────────────────────
  tocEyebrow:  { he: 'בערב הזה',  en: 'On the menu tonight' },
  tocHeading:  { he: 'ארבעה פרקים.', en: 'Four chapters.'    },
};
export const menuPage = {
  pageTitle: { he: 'תפריט',            en: 'Menu' },
  pageDescription: {
    he: 'התפריט של זהרה במלון נוצ׳ה — מטבח ים-תיכוני מודרני, מנות שף כשרות, קוקטיילים וקינוחים.',
    en: 'Zahara menu at Nucha Hotel — modern kosher Mediterranean cuisine, chef-driven dishes, cocktails, and desserts.',
  },
};

export const aboutPage = {
  pageTitle: { he: 'אודות', en: 'About' },
  pageDescription: {
    he: 'מידע על זהרה: כתובת, שעות פתיחה, נגישות, קשר ומסלול הגעה ממלון נוצ׳ה, ירושלים.',
    en: 'Learn about Zahara: location, opening hours, accessibility, contact details, and directions from Nucha Hotel in Jerusalem.',
  },
};

export const eventsPage = {
  pageTitle: { he: 'אירועים', en: 'Events' },
  pageDescription: {
    he: 'אירועים פרטיים ועסקיים בזהרה — קונספט כשר, תפריטים אישיים ושירות אירועים במלון נוצ׳ה, ירושלים.',
    en: 'Private and corporate events at Zahara — kosher chef menus, bespoke catering, and event service at Nucha Hotel, Jerusalem.',
  },
};

export const accessibilityPage = {
  pageTitle: { he: 'הצהרת נגישות', en: 'Accessibility statement' },
  pageDescription: {
    he: 'הצהרת נגישות של הזהרה — מידע על התאמות האתר והנגישות לטובת אנשים עם מוגבלות.',
    en: 'Zahara accessibility statement — details about website and venue accessibility for people with disabilities.',
  },
  pageEyebrow: { he: 'נגישות', en: 'Accessibility' },
  updatedLabel: { he: 'עודכן לאחרונה', en: 'Last updated' },
  standardHeading: { he: 'תקן הנגישות', en: 'Accessibility standard' },
  standardText: {
    he: 'האתר נבנה לפי הנחיות תקן ישראלי 5568 ברמת AA, התואם להנחיות ה־WCAG 2.0 של ארגון ה־W3C.',
    en: 'The site is built to Israeli Standard 5568 Level AA, which mirrors the W3C’s WCAG 2.0 Level AA recommendations.',
  },
  availabilityHeading: { he: 'אמצעי נגישות באתר', en: 'What’s available on this site' },
  availabilityItem1: { he: 'תפריט התאמות נגישות הזמין באייקון ♿ בפינה התחתונה של כל עמוד.', en: 'An on-page adjustments panel accessible via the ♿ button in the bottom corner of every page.' },
  availabilityItem2: { he: 'הגדלה והקטנה של גופן ללא פגיעה בפריסת התוכן.', en: 'Font-size increase / decrease without breaking the layout.' },
  availabilityItem3: { he: 'מצב ניגודיות גבוהה — שחור על לבן עם תוספת דגש על קישורים וגבולות.', en: 'High-contrast mode — black on white with strong link + border emphasis.' },
  availabilityItem4: { he: 'הדגשת קישורים בקו תחתון בכל מקום באתר.', en: 'Underline-every-link mode.' },
  availabilityItem5: { he: 'עצירת אנימציות ומעברי מסך לבעלי רגישות לתנועה.', en: 'Stop-animations mode for visitors with motion sensitivity.' },
  availabilityItem6: { he: 'הדגשת כותרות במסגרת ויזואלית.', en: 'Heading-outline mode.' },
  availabilityItem7: { he: 'תמיכה מלאה בניווט באמצעות מקלדת (Tab / Shift+Tab / Enter / Esc).', en: 'Full keyboard navigation (Tab / Shift+Tab / Enter / Esc).' },
  availabilityItem8: { he: 'טקסט חלופי (alt) לכל התמונות.', en: 'Alt text on every image.' },
  availabilityItem9: { he: 'קישור דילוג לתוכן (Skip to content) בראש העמוד.', en: 'Skip-to-content link at the top of every page.' },
  availabilityItem10: { he: 'שמירה אוטומטית של ההעדפות בדפדפן.', en: 'Your preferences are stored locally in your browser between visits.' },
  navigationHeading: { he: 'אופן הניווט באתר', en: 'How the site is structured' },
  navigationText: { he: 'האתר תוכנן לתמוך בניווט באמצעות מקלדת בלבד וקורא מסך. כותרות העמוד מסודרות בהיררכיה לוגית, אזורי הניווט מסומנים בתפקידים מתאימים (role="navigation", role="main"), וכל הטפסים מקושרים לתוויות מתאימות.', en: 'Pages use semantic HTML headings in a logical hierarchy. Landmark regions (nav, main, contentinfo) are explicitly tagged so screen readers can jump between them. All form fields have associated labels.' },
  limitationsHeading: { he: 'סייגים והגבלות ידועות', en: 'Known limitations' },
  limitationsText: { he: 'אנו פועלים באופן רציף לשיפור הנגישות. עם זאת, ייתכן וחלק מהפריטים באתר אינם נגישים במלואם, בעיקר תוכן צד שלישי המוטמע באתר (כגון מפת Google, מערכת ההזמנות החיצונית).', en: 'We work continuously to improve accessibility. Some embedded third-party content (Google Maps, the external reservation system) may not be fully accessible.' },
  contactHeading: { he: 'פנייה בנושאי נגישות', en: 'Contact us about accessibility' },
  contactText: { he: 'אם נתקלתם בקושי או יש לכם הצעה לשיפור הנגישות, נשמח לדעת. ניתן ליצור קשר עם רכז הנגישות:', en: 'If you’ve run into a barrier or have a suggestion, please let us know. You can reach our accessibility coordinator at:' },
  responseText: { he: 'אנו נשתדל לחזור לכל פנייה תוך 14 ימי עבודה.', en: 'We will respond within 14 working days.' },
  contactPhoneLabel: { he: 'טלפון', en: 'Phone' },
  contactEmailLabel: { he: 'אימייל', en: 'Email' },
  contactAddressLabel: { he: 'כתובת', en: 'Address' },
};

export const privacyPage = {
  pageTitle: { he: 'מדיניות פרטיות', en: 'Privacy policy' },
  pageDescription: {
    he: 'מדיניות פרטיות של זהרה — איך אנו משתמשים במידע שנאסף דרך טופס יצירת קשר באתר.',
    en: 'Zahara privacy policy — how we collect and use personal information submitted through the website contact form.',
  },
  pageEyebrow: { he: 'פרטיות', en: 'Privacy' },
  updatedLabel: { he: 'עודכן לאחרונה', en: 'Last updated' },
  dataHeading: { he: 'המידע שאנו אוספים', en: 'What data we collect' },
  dataIntro: { he: 'אנו אוספים מידע אישי רק כאשר אתם שולחים לנו פנייה דרך טופס יצירת הקשר באתר. המידע כולל:', en: 'We only collect personal data when you submit an inquiry through the contact form on this website. This includes:' },
  dataItem1: { he: 'שם מלא', en: 'Full name' },
  dataItem2: { he: 'מספר טלפון', en: 'Phone number' },
  dataItem3: { he: 'כתובת דואר אלקטרוני', en: 'Email address' },
  dataItem4: { he: 'פרטי הפנייה (תאריך אירוע, סוג, מספר סועדים, הודעה חופשית)', en: 'Inquiry details (event date, type, guest count, free-text message)' },
  dataPrivacyNote: { he: 'אנו לא מפעילים עוגיות (cookies) ייעודיות, ולא משתמשים בכלי מעקב שיווקי. העדפות אישיות (ערכת נושא, נגישות) נשמרות באופן מקומי בדפדפן בלבד ואינן מועברות לשרתינו.', en: 'We do not use tracking or marketing cookies. Personal preferences (theme, accessibility settings) are stored locally in your browser only and are never transmitted to our servers.' },
  usageHeading: { he: 'השימוש במידע', en: 'How we use the data' },
  usageIntro: { he: 'המידע שנאסף משמש אך ורק למטרות הבאות:', en: 'Data collected is used solely to:' },
  usageItem1: { he: 'מענה לפנייתכם ויצירת קשר חוזר', en: 'Respond to your inquiry and follow up' },
  usageItem2: { he: 'תיאום אירועים ומפגשים', en: 'Coordinate events and bookings' },
  usageNote: { he: 'אנו לא משתמשים במידע לצורכי שיווק ולא מוכרים אותו לצדדים שלישיים.', en: 'We do not use this data for marketing and do not sell it to third parties.' },
  thirdPartyHeading: { he: 'העברת מידע לצדדים שלישיים', en: 'Third-party services' },
  thirdPartyParagraph1: { he: 'לצורך משלוח הפנייה שלכם אלינו, אנו משתמשים בשירות <strong>Resend</strong> (חברה אמריקאית) לשליחת דואר אלקטרוני. המידע שמועבר לשירות זה כולל את שמכם, טלפונכם, כתובת האימייל ותוכן הפנייה. Resend כפוף לתקנות GDPR ו-SOC 2 Type II.', en: 'To deliver your inquiry to us, we use <strong>Resend</strong> (a US-based company) for email delivery. Your name, phone, email address, and inquiry content are passed to this service. Resend is GDPR-compliant and SOC 2 Type II certified.' },
  thirdPartyParagraph2: { he: 'אתר המסעדה כולל מפה מוטמעת של Google Maps בדף המיקום. טעינת המפה עשויה לגרום ל-Google לרשום את כתובת ה-IP שלכם בהתאם למדיניות הפרטיות שלה.', en: 'The location page of this site includes an embedded Google Maps map. Loading the map may cause Google to log your IP address in accordance with its own privacy policy.' },
  retentionHeading: { he: 'שמירת המידע', en: 'Data retention' },
  retentionText: { he: 'הפניות שנשלחות אלינו נשמרות בתיבת הדואר של המסעדה לצורך מתן מענה. אנו שומרים מידע זה לא יותר מ-24 חודשים, אלא אם קיימת סיבה עסקית או חוקית לשמירה ממושכת יותר.', en: 'Inquiries sent to us are stored in the restaurant’s inbox to allow us to respond. We retain this data for no longer than 24 months unless a business or legal reason requires longer retention.' },
  rightsHeading: { he: 'זכויותיכם', en: 'Your rights' },
  rightsText: { he: 'בהתאם לחוק הגנת הפרטיות, יש לכם זכות לעיין במידע האישי שאנו מחזיקים עליכם, לתקן אותו או לבקש את מחיקתו. לממש זכויות אלו, פנו אלינו:', en: 'Under the Israeli Privacy Protection Law, you have the right to access, correct, or request deletion of any personal data we hold about you. To exercise these rights, please contact us:' },
  rightsResponse: { he: 'אנו נשתדל לחזור לכל בקשה תוך 30 ימים.', en: 'We will respond to all requests within 30 days.' },
  changesHeading: { he: 'שינויים במדיניות', en: 'Changes to this policy' },
  changesText: { he: 'אנו עשויים לעדכן מדיניות זו מעת לעת. השינויים ייכנסו לתוקף עם פרסומם בדף זה. אנו ממליצים לבדוק עמוד זה מדי פעם.', en: 'We may update this policy from time to time. Changes take effect when published on this page. We recommend checking this page periodically.' },
  contactHeading: { he: 'יצירת קשר', en: 'Contact' },
  contactText: { he: 'לשאלות בנוגע למדיניות פרטיות זו, ניתן לפנות אלינו:', en: 'For questions about this privacy policy, please reach us at:' },
  contactRestaurant: { he: 'מסעדת', en: 'Zahara Restaurant' },
  contactAddressLabel: { he: 'כתובת', en: 'Address' },
  contactPhoneLabel: { he: 'טלפון', en: 'Phone' },
  contactEmailLabel: { he: 'אימייל', en: 'Email' },
};

export const a11y = {
  toggle:     { he: 'נגישות',          en: 'Accessibility' },
  panelLabel: { he: 'לוח התאמות נגישות', en: 'Accessibility adjustments' },
  fontInc:    { he: 'הגדלת טקסט',      en: 'Larger text' },
  fontDec:    { he: 'הקטנת טקסט',      en: 'Smaller text' },
  contrast:   { he: 'ניגודיות גבוהה',  en: 'High contrast' },
  links:      { he: 'הדגשת קישורים',    en: 'Underline links' },
  stopAnim:   { he: 'עצירת אנימציות',   en: 'Stop animations' },
  headings:   { he: 'הדגשת כותרות',     en: 'Highlight headings' },
  reset:      { he: 'איפוס',           en: 'Reset' },
  statement:  { he: 'הצהרת נגישות',    en: 'Accessibility statement' },
  close:      { he: 'סגירה',           en: 'Close' },
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
  updatedLabel: { he: 'עודכן',         en: 'Updated'   },
  noCocktails:  { he: 'אין קוקטיילים זמינים כעת', en: 'No cocktails available' },
  categoryNavigation: { he: 'ניווט קטגוריות', en: 'Category navigation' },
  menuCategories: { he: 'קטגוריות תפריט', en: 'Menu categories' },
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

  // ── About page identity (the renamed Contact page) ──────────────────────────
  aboutEyebrow: { he: 'אודות',          en: 'About'      },
  // [HTML] contains <br />
  aboutHeading: {
    he: 'זהרה,<br />והדרך אלינו.',
    en: 'Zahara,<br />and how to find us.',
  },
  aboutLede: {
    he: "מסעדת שף ים-תיכונית כשרה בקומת הכניסה של מלון נוצ׳ה ברחוב בן סירא, ירושלים. כאן תמצאו את כל הפרטים — איך מגיעים, ואיך ליצור איתנו קשר.",
    en: 'A kosher Mediterranean chef restaurant on the ground floor of Nucha Hotel, Ben Sira Street, Jerusalem. Everything you need is here — how to reach us, and how to get in touch.',
  },

  // ── About page: how the space is designed (four seating areas) ──────────────
  designEyebrow: { he: 'החלל', en: 'The space' },
  // [HTML] contains <br />
  designHeading: {
    he: 'ארבע דרכים<br />לשבת.',
    en: 'Four ways<br />to sit.',
  },
  designLede: {
    he: 'תכננו את זהרה כך שלכל ערב יש פינה משלו — מהמטבח הפתוח בפנים ועד האוויר הפתוח בחוץ.',
    en: 'Zahara is laid out so every evening finds its own corner — from the open kitchen inside to the open air outside.',
  },
  // [HTML] each paragraph opens with <strong>
  designInside: {
    he: '<strong>ישיבה בפנים:</strong> אולם המסעדה סביב המטבח הפתוח — לב הבית, שבו רואים את השף עובד והצלחות יוצאות.',
    en: '<strong>Indoor seating:</strong> the dining room wraps around the open kitchen — the heart of the house, where you watch the chef work and the plates leave the pass.',
  },
  designBar: {
    he: '<strong>ישיבה בבר:</strong> כיסאות גבוהים מול הבר — המושב הראשון לקוקטייל או לכוס יין, לבד או בזוג.',
    en: '<strong>At the bar:</strong> high stools facing the bar — the front-row seat for a cocktail or a glass of wine, alone or as a pair.',
  },
  designClosed: {
    he: '<strong>מרפסת סגורה:</strong> ישיבה בחוץ בחלל מקורה ומחומם, ללא עישון — נעים לאורך כל השנה, גם בערבי החורף של ירושלים.',
    en: "<strong>Enclosed terrace:</strong> covered, heated outdoor seating, non-smoking — comfortable year-round, even on Jerusalem's cooler evenings.",
  },
  designOpen: {
    he: '<strong>מרפסת פתוחה:</strong> ישיבה בחוץ באוויר הפתוח, מתאימה לעישון — לערבים שבהם רוצים את השמיים מעל.',
    en: '<strong>Open terrace:</strong> open-air outdoor seating, smoking welcome — for the nights you want the sky overhead.',
  },

  // ── Events page identity (dedicated event-inquiry page) ─────────────────────
  eventsPageEyebrow: { he: 'אירועים פרטיים', en: 'Private events' },
  // [HTML] contains <br />
  eventsPageHeading: {
    he: 'חלל פרטי,<br />ערב פרטי.',
    en: 'Private space,<br />private night.',
  },
  eventsPageLede: {
    he: 'המסעדה ניתנת לסגירה לאירועים פרטיים ועסקיים — חדר אינטימי לקבוצות קטנות, החלל המורחב לאירועי חברה, או המסעדה כולה. השאירו פרטים ונחזור אליכם תוך יום עסקים.',
    en: 'The restaurant is available for private and corporate events — an intimate room for small groups, an extended space for company gatherings, or the entire room. Leave your details and we’ll get back to you within one business day.',
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
