// Editable site copy — the single source of truth for admin-editable text.
//
// Used by:
//   • functions/_middleware.ts       — injects the saved overrides as a
//                                       <script id="zahara-content"> JSON blob
//                                       into every HTML response (so the page
//                                       applies them on first paint with ZERO
//                                       extra browser fetches).
//   • functions/admin/content.ts      — GET, renders the editor form.
//   • functions/admin/content/save.ts — POST, merges + persists edits.
//   • functions/admin/images.ts       — per-photo gallery caption inputs.
//
// Storage: one JSON record in KV (MENU_DATA, falling back to PALETTE_DATA)
// under the reserved key `__content__`. Shape: { [fieldKey]: { he?, en? } }.
// Only non-empty overrides are stored; a blank field falls back to the
// built-in default that the page already server-renders.

import type { KVNamespace } from '@cloudflare/workers-types';

export interface ContentEnv {
  MENU_DATA?:    KVNamespace;
  PALETTE_DATA?: KVNamespace;
}

// `size` is a language-independent font-size multiplier (1 = default). It lets
// the owner bump a single piece of copy up/down without touching CSS — applied
// as an inline, viewport-recomputed font-size on the live site.
export type ContentValue = { he?: string; en?: string; size?: number };

/** Clamp a posted size multiplier to a sane range; null if it's effectively
 *  "default" (1) or not a usable number. */
function cleanSize(raw: unknown): number | null {
  if (typeof raw !== 'number' || !isFinite(raw) || raw <= 0) return null;
  if (raw === 1) return null;
  return Math.min(2.5, Math.max(0.6, raw));
}
export type ContentMap   = Record<string, ContentValue>;

const KEY = '__content__';
const MAX_LEN = 4000;

export interface ContentField {
  key:        string;
  label:      string;
  multiline?: boolean;
  /** Value may contain inline markup (<br>, <em>, <strong>). */
  html?:      boolean;
  /** The built-in default text (mirrors src/data/i18n.ts). Shown pre-filled
   *  in the editor so the owner edits the CURRENT copy, not a blank box.
   *  Keep these in sync with i18n.ts / restaurant.ts. */
  he?:        string;
  en?:        string;
}
export interface ContentGroup { title: string; note?: string; page: PageId; fields: ContentField[]; }

/** Which site page a group of copy belongs to. Drives the page tabs in the
 *  /admin/content editor (one button per page, like the Menu editor's tabs)
 *  so the owner edits one page's text at a time instead of one long scroll. */
export type PageId = 'home' | 'about' | 'events' | 'menu' | 'privacy' | 'accessibility';

export interface PageTab { id: PageId; label: string; }

/** Order + labels for the page tabs. */
export const CONTENT_PAGES: PageTab[] = [
  { id: 'home',          label: 'Home' },
  { id: 'about',         label: 'About' },
  { id: 'events',        label: 'Events' },
  { id: 'menu',          label: 'Menu' },
  { id: 'privacy',       label: 'Privacy' },
  { id: 'accessibility', label: 'Accessibility' },
];

/** Gallery photo keys that get an editable caption. Mirrors the gallery in
 *  src/components/pages/HomePage.astro (base 4 + optional 6). */
export const GALLERY_CAPTION_KEYS = [
  'interior', 'chef', 'bar', 'wine',
  'gallery5', 'gallery6', 'gallery7', 'gallery8', 'gallery9', 'gallery10',
] as const;

export const galleryCaptionKey = (photoKey: string): string => `gallery.caption.${photoKey}`;

/** Editor layout — groups of fields shown on /admin/content/. Field keys
 *  match the `data-content-key` attributes the components render. */
export const CONTENT_GROUPS: ContentGroup[] = [
  { title: 'Hero', page: 'home', fields: [
    { key: 'home.heroEyebrow',   label: 'Eyebrow',         he: 'מסעדת שף · ירושלים', en: 'Chef restaurant · Jerusalem' },
    { key: 'home.heroHeadline',  label: 'Headline',        he: 'הזרע המופלא של',      en: "Angelica's" },
    { key: 'home.heroTitleMark', label: 'Headline accent', he: 'זהרה Zahara',         en: 'younger sister.' },
  ] },
  { title: 'Story', page: 'home', fields: [
    { key: 'home.storyEyebrow', label: 'Eyebrow', he: 'הסיפור', en: 'The story' },
    { key: 'home.storyHeading', label: 'Heading', html: true, multiline: true,
      he: 'אחותה הצעירה<br />של אנג׳ליקה.', en: 'A new chapter,<br />one kitchen.' },
    { key: 'home.storyP1', label: 'Paragraph 1', html: true, multiline: true,
      he: 'אנג׳ליקה פעלה במשך 16 שנה כמוסד קולינרי בירושלים. זהרה היא הפרק הבא — מסעדה חדשה בקומת הכניסה של מלון נוצ׳ה (Nucha by Fattal Colors) ברחוב בן סירא, ליד גן העצמאות וכיכר ציון.',
      en: 'Angelica has been a Jerusalem culinary institution for sixteen years. Zahara is the next chapter — a new restaurant on the ground floor of Nucha Hotel (Nucha by Fattal Colors) on Ben Sira Street, steps from Independence Garden and Zion Square.' },
    { key: 'home.storyP2', label: 'Paragraph 2', html: true, multiline: true,
      he: 'השף <strong>רועי אחדות</strong>, ותיק במטבח של אנג׳ליקה, מציע כאן מטבח ים-תיכוני נדיב עם טכניקות צרפתיות קלאסיות והשפעות אסייתיות. מטבח כשר, עונתי, מבוסס על תוצרת מקומית טרייה — דגים, בשר, ירקות שמתחלפים עם השוק.',
      en: 'Chef <strong>Roi Achdut</strong>, a longtime Angelica veteran, offers a generous Mediterranean kitchen here, anchored by classical French technique with Asian influences. The kitchen is kosher, seasonal, and built on fresh local sourcing — fish, meat, and vegetables that change with the market.' },
    { key: 'home.storyP3', label: 'Paragraph 3', html: true, multiline: true,
      he: 'במקום הסדר השמרני של מנה ראשונה–עיקרית–קינוח, זהרה משחקת על הקונספט של <em>sharing is caring</em>. שולחן עליז, מנות עוברות, קצב דינמי, ובמרכז המסעדה — מטבח פתוח שכל סועד יכול לראות, ולהרגיש את החיבור בין הצלחת לאנשים שמכינים אותה.',
      en: 'Instead of the conventional starter–main–dessert order, Zahara plays on a <em>sharing is caring</em> concept. A joyful table, dishes moving between guests, dynamic rhythm — and at the heart of the room, an open kitchen visible to every diner, connecting the food to the people making it.' },
      
    { key: 'home.storyMoreEyebrow', label: 'Story box 2 — eyebrow', he: 'הגישה', en: 'Our approach' },
    { key: 'home.storyMoreTitle',   label: 'Story box 2 — title',  he: 'Sharing is caring', en: 'Sharing is caring' },
    { key: 'home.storyReadMore',    label: 'Story box 2 — "read more" label', he: 'קראו עוד', en: 'Read more' },
  ] },
  { title: 'Menu section', page: 'home', fields: [
    { key: 'home.menuSplitEyebrow', label: 'Eyebrow', he: 'התפריט', en: 'The menu' },
    { key: 'home.menuSplitHeading', label: 'Heading', html: true,
      he: 'שולחן אחד,<br />ארבעה חלקים.', en: 'One table,<br />four parts.' },
    { key: 'home.menuSplitLede', label: 'Lede', multiline: true,
      he: 'התפריט בנוי לשיתוף ונחלק לארבעה — אוכל מהמטבח, יין, קוקטיילים מהבר וקינוחים. הכול עובר בין כולם.',
      en: 'Built to share and split into four — food from the kitchen, wine, cocktails from the bar, and dessert. Everything moves around the table.' },
    { key: 'home.menuSplitCta', label: 'Button label', he: 'לתפריט המלא ↗', en: 'See the full menu ↗' },
  ] },
  { title: 'Gallery', page: 'home', note: 'Per-photo captions are edited on each photo in the Images tab.', fields: [
    { key: 'home.galleryEyebrow', label: 'Eyebrow', he: 'גלריה', en: 'Gallery' },
    { key: 'home.galleryHeading', label: 'Heading', he: 'הצצה לערב.', en: 'A glimpse of the evening.' },
  ] },
  { title: 'Private events', page: 'home', fields: [
    { key: 'home.eventsEyebrow', label: 'Eyebrow', he: 'אירועים פרטיים', en: 'Private events' },
    { key: 'home.eventsHeading', label: 'Heading', html: true,
      he: 'חלל פרטי,<br />ערב פרטי.', en: 'Private space,<br />private night.' },
    { key: 'home.eventsP1', label: 'Paragraph 1', multiline: true,
      he: 'המסעדה ניתנת לסגירה לאירועים פרטיים ועסקיים. חדר פרטי לקבוצות אינטימיות, החלל המורחב לאירועי חברה, או המסעדה כולה לארוחות סגורות.',
      en: 'The restaurant is available for private and corporate events — an intimate private room for small groups, an extended space for company gatherings, or the entire restaurant for closed seatings.' },
    { key: 'home.eventsP2', label: 'Paragraph 2', multiline: true,
      he: 'כל אירוע מתוכנן עם השף. נחזור אליכם תוך יום עסקים.',
      en: 'Each event is planned with the chef. We respond within one business day.' },
    { key: 'home.eventsCta',        label: 'Primary button label',   he: 'לפנייה לאירועים ↗', en: 'Inquire about events ↗' },
    { key: 'home.eventsContactCta', label: 'Secondary button label', he: 'צרו קשר',           en: 'Contact us' },
  ] },
  { title: 'Instagram', page: 'home', fields: [
    { key: 'home.igEyebrow', label: 'Eyebrow', he: 'אינסטגרם',      en: 'Instagram' },
    { key: 'home.igHeading', label: 'Heading', he: 'רגעים מהמטבח.', en: 'Moments from the kitchen.' },
  ] },
  { title: 'Info strip (the row under the hero)', page: 'home', fields: [
    { key: 'info.hoursLabel',   label: 'Hours — label',  he: 'שעות',                en: 'Hours' },
    { key: 'info.hoursValue',   label: 'Hours — value',  he: 'ב׳–ה׳ · 18:00–22:00', en: 'Mon–Thu · 18:00–22:00' },
    { key: 'info.addressLabel', label: 'Address — label', he: 'כתובת',              en: 'Address' },
    { key: 'info.addressValue', label: 'Address — value', he: '16 בן סירא, ירושלים',   en: 'Ben Sira 16 St, Jerusalem' },
    { key: 'info.reservLabel',  label: 'Reservations — label',  he: 'להזמנות',       en: 'Reservations' },
    { key: 'info.reservValue',  label: 'Reservations — phone',  he: '077-303-4180',  en: '+972 77 303 4180' },
    { key: 'info.reservTabit',  label: 'Reservations — Tabit link text', he: 'הזמנה בטאביט ↗', en: 'Book on Tabit ↗' },
    { key: 'info.kosherLabel',  label: 'Kosher — label', he: 'כשרות',          en: 'Kosher' },
    { key: 'info.kosherValue',  label: 'Kosher — value', he: 'רבנות ירושלים',  en: 'Rabbanut Yerushalayim' },
    { key: 'info.kosherView',   label: 'Kosher — certificate link text', he: 'הצגת התעודה ↗', en: 'View certificate ↗' },
  ] },

  // ── About page ────────────────────────────────────────────────────────────
  { title: 'About page · Intro', page: 'about', fields: [
    { key: 'about.eyebrow', label: 'Eyebrow', he: 'אודות', en: 'About' },
    { key: 'about.heading', label: 'Heading', html: true, multiline: true,
      he: 'זהרה,<br />והדרך אלינו.', en: 'Zahara,<br />and how to find us.' },
    { key: 'about.lede', label: 'Lede', multiline: true,
      he: 'מסעדת שף ים-תיכונית כשרה בקומת הכניסה של מלון נוצ׳ה ברחוב בן סירא, ירושלים. כאן תמצאו את כל הפרטים — איך מגיעים, ואיך ליצור איתנו קשר.',
      en: 'A kosher Mediterranean chef restaurant on the ground floor of Nucha Hotel, Ben Sira Street, Jerusalem. Everything you need is here — how to reach us, and how to get in touch.' },
  ] },
  { title: 'About page · Getting here', page: 'about', fields: [
    { key: 'about.locationEyebrow', label: 'Eyebrow', he: 'איך מגיעים', en: 'Getting here' },
    { key: 'about.locationHeading', label: 'Heading', he: 'לבוא אלינו.', en: 'Find us.' },
    { key: 'about.locationLede', label: 'Lede', multiline: true,
      he: "זהרה יושבת בקומת הכניסה של מלון נוצ׳ה (Nucha by Fattal Colors) ברחוב בן סירא — דקות הליכה מגן העצמאות, מדרחוב בן יהודה, כיכר ציון, ממילא והעיר העתיקה.",
      en: "Zahara sits on the ground floor of Nucha Hotel (Nucha by Fattal Colors) on Ben Sira Street — a few minutes' walk from Independence Garden, Ben Yehuda pedestrian mall, Zion Square, Mamilla and the Old City." },
    { key: 'about.mapLoad', label: 'Map — “show map” label', he: 'הצגת המפה', en: 'Show the map' },
    { key: 'about.mapPrivacy', label: 'Map — privacy note', multiline: true,
      he: 'המפה נטענת מ-Google. לחיצה תטען אותה ועשויה לרשום את כתובת ה-IP שלכם.',
      en: 'The map loads from Google. Tapping it loads the map and may log your IP address.' },
    { key: 'about.waze', label: 'Button — Waze', he: 'פתחו ב-Waze', en: 'Open in Waze' },
    { key: 'about.gmaps', label: 'Button — Google Maps', he: 'פתחו ב-Google Maps', en: 'Open in Google Maps' },
    { key: 'about.call', label: 'Button — Call', he: 'חייגו 077-303-4180', en: 'Call +972 77 303 4180' },
  ] },
  { title: 'About page · The space', page: 'about', fields: [
    { key: 'about.designEyebrow', label: 'Eyebrow', he: 'החלל', en: 'The space' },
    { key: 'about.designHeading', label: 'Heading', html: true, multiline: true,
      he: 'ארבע דרכים<br />לשבת.', en: 'Four ways<br />to sit.' },
    { key: 'about.designLede', label: 'Lede', multiline: true,
      he: 'תכננו את זהרה כך שלכל ערב יש פינה משלו — מהמטבח הפתוח בפנים ועד האוויר הפתוח בחוץ.',
      en: 'Zahara is laid out so every evening finds its own corner — from the open kitchen inside to the open air outside.' },
    { key: 'about.designInside', label: 'Indoor seating', html: true, multiline: true,
      he: '<strong>ישיבה בפנים:</strong> אולם המסעדה סביב המטבח הפתוח — לב הבית, שבו רואים את השף עובד והצלחות יוצאות.',
      en: '<strong>Indoor seating:</strong> the dining room wraps around the open kitchen — the heart of the house, where you watch the chef work and the plates leave the pass.' },
    { key: 'about.designBar', label: 'At the bar', html: true, multiline: true,
      he: '<strong>ישיבה בבר:</strong> כיסאות גבוהים מול הבר — המושב הראשון לקוקטייל או לכוס יין, לבד או בזוג.',
      en: '<strong>At the bar:</strong> high stools facing the bar — the front-row seat for a cocktail or a glass of wine, alone or as a pair.' },
    { key: 'about.designClosed', label: 'Enclosed terrace', html: true, multiline: true,
      he: '<strong>מרפסת סגורה:</strong> ישיבה בחוץ בחלל מקורה ומחומם, ללא עישון — נעים לאורך כל השנה, גם בערבי החורף של ירושלים.',
      en: "<strong>Enclosed terrace:</strong> covered, heated outdoor seating, non-smoking — comfortable year-round, even on Jerusalem's cooler evenings." },
    { key: 'about.designOpen', label: 'Open terrace', html: true, multiline: true,
      he: '<strong>מרפסת פתוחה:</strong> ישיבה בחוץ באוויר הפתוח, מתאימה לעישון — לערבים שבהם רוצים את השמיים מעל.',
      en: '<strong>Open terrace:</strong> open-air outdoor seating, smoking welcome — for the nights you want the sky overhead.' },
  ] },
  { title: 'About page · Kosher + contact', page: 'about', fields: [
    { key: 'about.kosherEyebrow', label: 'Kosher — eyebrow', he: 'כשרות', en: 'Kosher' },
    { key: 'about.kosherHeading', label: 'Kosher — heading', he: 'מטבח כשר.', en: 'A kosher kitchen.' },
    { key: 'about.kosherNote', label: 'Kosher — note', multiline: true,
      he: 'המטבח מפוקח בכשרות רבנות ירושלים. תוכלו לעיין בתעודת הכשרות המעודכנת בכל עת.',
      en: 'The kitchen is certified kosher by the Rabbanut Yerushalayim. The current certificate is available to view at any time.' },
    { key: 'about.kosherCertCta', label: 'Kosher — button', he: 'הצגת תעודת הכשרות ↗', en: 'View kosher certificate ↗' },
    { key: 'about.reachEyebrow', label: '“Reach us directly” eyebrow', he: 'פנו אלינו ישירות', en: 'Reach us directly' },
  ] },

  // ── Events page ───────────────────────────────────────────────────────────
  { title: 'Events page', page: 'events', fields: [
    { key: 'events.eyebrow', label: 'Eyebrow', he: 'אירועים פרטיים', en: 'Private events' },
    { key: 'events.heading', label: 'Heading', html: true, multiline: true,
      he: 'חלל פרטי,<br />ערב פרטי.', en: 'Private space,<br />private night.' },
    { key: 'events.lede', label: 'Lede', multiline: true,
      he: 'המסעדה ניתנת לסגירה לאירועים פרטיים ועסקיים — חדר אינטימי לקבוצות קטנות, החלל המורחב לאירועי חברה, או המסעדה כולה. השאירו פרטים ונחזור אליכם תוך יום עסקים.',
      en: 'The restaurant is available for private and corporate events — an intimate room for small groups, an extended space for company gatherings, or the entire room. Leave your details and we’ll get back to you within one business day.' },
    { key: 'events.benefit1', label: 'Benefit 1', he: 'חדר פרטי לקבוצות אינטימיות', en: 'Private room for intimate groups' },
    { key: 'events.benefit2', label: 'Benefit 2', he: 'התפריט נבנה אישית עם השף', en: 'Menu built personally with the chef' },
    { key: 'events.benefit3', label: 'Benefit 3', he: 'מטבח כשר · אופציות צמחוניות', en: 'Kosher kitchen · vegetarian options' },
    { key: 'events.benefit4', label: 'Benefit 4', he: 'אפשרות לסגירת המסעדה כולה', en: 'Full restaurant buyouts available' },
  ] },

  // ── Page headers (Menu / Privacy / Accessibility) ───────────────────────────
  { title: 'Menu page · Header', page: 'menu', note: 'Menu items themselves are edited in the Menu editor tab.', fields: [
    { key: 'menu.eyebrow', label: 'Eyebrow', he: 'תפריט · מתעדכן יומי', en: 'Menu · Updated daily' },
    { key: 'menu.heading', label: 'Heading', he: 'מה יש היום.', en: "What's on today." },
    { key: 'menu.lede', label: 'Lede', multiline: true,
      he: 'התפריט משתנה עם מה שהגיע מהשוק בבוקר. רעננו את הדף לגרסה העדכנית.',
      en: 'Changes with the morning market. Refresh the page for the latest.' },
  ] },
  { title: 'Privacy page · Header', page: 'privacy', fields: [
    { key: 'privacy.eyebrow', label: 'Eyebrow', he: 'פרטיות', en: 'Privacy' },
    { key: 'privacy.heading', label: 'Heading', he: 'מדיניות פרטיות', en: 'Privacy policy' },
  ] },
  { title: 'Accessibility page · Header', page: 'accessibility', fields: [
    { key: 'accessibility.eyebrow', label: 'Eyebrow', he: 'נגישות', en: 'Accessibility' },
    { key: 'accessibility.heading', label: 'Heading', he: 'הצהרת נגישות', en: 'Accessibility statement' },
  ] },
];

/** Every key the editor (and gallery captions) may write. Anything outside
 *  this set is dropped on read/write. */
export const ALL_CONTENT_KEYS: readonly string[] = [
  ...CONTENT_GROUPS.flatMap(g => g.fields.map(f => f.key)),
  ...GALLERY_CAPTION_KEYS.map(galleryCaptionKey),
];
const ALLOWED = new Set(ALL_CONTENT_KEYS);

/** Built-in default text per key (gallery captions have no default → ''). */
export const CONTENT_DEFAULTS: Record<string, ContentValue> = Object.fromEntries(
  CONTENT_GROUPS.flatMap(g => g.fields.map(f => [f.key, { he: f.he ?? '', en: f.en ?? '' }])),
);
const defaultFor = (key: string, lang: 'he' | 'en'): string => CONTENT_DEFAULTS[key]?.[lang] ?? '';

function pickKv(env: ContentEnv): KVNamespace | null {
  return env.MENU_DATA ?? env.PALETTE_DATA ?? null;
}

/** Reduce arbitrary input to a clean { key: { he?, en? } } map. Drops
 *  unknown keys and non-strings. Empty strings ARE kept — an explicit empty
 *  override means "hide this element on the site" (distinct from "no
 *  override", which falls back to the built-in default). */
export function sanitiseContent(input: unknown): ContentMap {
  const out: ContentMap = {};
  if (!input || typeof input !== 'object') return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!ALLOWED.has(k) || !v || typeof v !== 'object') continue;
    const val: ContentValue = {};
    for (const lang of ['he', 'en'] as const) {
      const s = (v as Record<string, unknown>)[lang];
      if (typeof s === 'string') val[lang] = s.slice(0, MAX_LEN);
    }
    const sz = cleanSize((v as Record<string, unknown>).size);
    if (sz !== null) val.size = sz;
    if (val.he !== undefined || val.en !== undefined || val.size !== undefined) out[k] = val;
  }
  return out;
}

/** Merge a posted (possibly partial) map into the existing one, comparing
 *  each value to its built-in default:
 *    • value === default  → no override stored (the page shows the default)
 *    • value === ''       → stored as an explicit empty (HIDES the element)
 *    • anything else      → stored as an override
 *  A missing lang property is left untouched. */
export function mergeContent(existing: ContentMap, posted: unknown): ContentMap {
  const merged: ContentMap = { ...existing };
  if (!posted || typeof posted !== 'object') return merged;
  for (const [k, v] of Object.entries(posted as Record<string, unknown>)) {
    if (!ALLOWED.has(k) || !v || typeof v !== 'object') continue;
    const cur: ContentValue = { ...(merged[k] ?? {}) };
    for (const lang of ['he', 'en'] as const) {
      const raw = (v as Record<string, unknown>)[lang];
      if (typeof raw !== 'string') continue;       // not provided → leave as-is
      const t = raw.slice(0, MAX_LEN);
      if (t === defaultFor(k, lang)) delete cur[lang];   // matches default → no override
      else cur[lang] = t;                                 // override (incl. '' = hide)
    }
    // Size: language-independent. Only present in the posted object when the
    // size control was rendered; 1/absent clears any stored multiplier.
    if ('size' in (v as Record<string, unknown>)) {
      const sz = cleanSize((v as Record<string, unknown>).size);
      if (sz === null) delete cur.size;
      else cur.size = sz;
    }
    if (cur.he !== undefined || cur.en !== undefined || cur.size !== undefined) merged[k] = cur;
    else delete merged[k];
  }
  return merged;
}

export async function readContent(env: ContentEnv): Promise<ContentMap> {
  const kv = pickKv(env);
  if (!kv) return {};
  try {
    const raw = await kv.get(KEY);
    return raw ? sanitiseContent(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export async function writeContent(env: ContentEnv, map: ContentMap): Promise<boolean> {
  const kv = pickKv(env);
  if (!kv) return false;
  await kv.put(KEY, JSON.stringify(sanitiseContent(map)));
  return true;
}

// ── Asset version ──────────────────────────────────────────────────────────
// A single counter, bumped on every admin image upload/delete. The root
// middleware stamps it onto every resized-image URL (replacing
// ASSET_VERSION_TOKEN) so a re-uploaded photo gets a brand-new URL → a fresh
// Cloudflare image transform, instead of the stale cached variant. This makes
// image changes appear instantly WITHOUT any cache purge.
const ASSET_VERSION_KEY = '__assets_version__';

export async function readAssetVersion(env: ContentEnv): Promise<string> {
  const kv = pickKv(env);
  if (!kv) return '0';
  try {
    return (await kv.get(ASSET_VERSION_KEY)) || '0';
  } catch {
    return '0';
  }
}

export async function bumpAssetVersion(env: ContentEnv): Promise<void> {
  const kv = pickKv(env);
  if (!kv) return;
  try {
    // base36 timestamp — short, monotonic, and unique per upload.
    await kv.put(ASSET_VERSION_KEY, Date.now().toString(36));
  } catch {
    /* non-fatal — worst case the URL keeps its previous version token */
  }
}

/** Serialise the override map for safe embedding inside a
 *  <script type="application/json"> tag (escapes `<` so a value can never
 *  contain `</script>`). */
export function contentToJson(map: ContentMap): string {
  return JSON.stringify(map).replace(/</g, '\\u003c');
}
