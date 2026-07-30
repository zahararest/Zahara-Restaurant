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
// under the reserved key `__content__`. Shape:
//   { [fieldKey]: { he?, en?, heStyle?, enStyle? } }
// where a style is { size?, align?, dash? } — Hebrew and English carry their
// OWN styling. Only differences from the built-in default are stored; a field
// with no record falls back to the copy the page already server-renders.

import type { KVNamespace } from '@cloudflare/workers-types';
import { siteScope, type Site, type SiteBindings } from './site';

// Widened to every binding (both venues) so the site-scope helpers can select
// the right store. Structurally a superset of the old single-namespace shape,
// so existing `AuthEnv & ContentEnv` callers are unaffected.
export type ContentEnv = SiteBindings;

// ── Per-piece styling ──────────────────────────────────────────────────────
// A ContentStyle is the presentation of ONE language's copy:
//   size  — font-size multiplier (1 = the page's own size). Applied as an
//           inline, viewport-recomputed font-size on the live site.
//   align — text alignment (logical, so it mirrors correctly in RTL).
//   dash  — a short accent rule (the eyebrow's "—" kicker) above the copy,
//           so a heading that drops its eyebrow isn't left bare.
//
// Hebrew and English are styled SEPARATELY (`heStyle` / `enStyle`) — the two
// languages have different word lengths and different display faces, so a size
// that fits the Hebrew headline rarely fits the English one. The flat
// `size`/`align`/`dash` fields are the pre-split format: still read (they apply
// to both languages) so older saved records keep working, but never written
// once a field is saved from the current editor.
export type ContentAlign = 'start' | 'center' | 'end';
export interface ContentStyle { size?: number; align?: ContentAlign; dash?: boolean }
/** The owner's own "original" for one language — the copy (and styling) they
 *  pinned with "Set as original" in the editor. When present it replaces the
 *  built-in default as the thing the Original button restores and the thing
 *  the "Edited" badge compares against. Nothing on the live site reads it. */
export interface ContentBase extends ContentStyle { text?: string }
export type ContentValue = {
  he?: string; en?: string;
  heStyle?: ContentStyle; enStyle?: ContentStyle;
  heBase?: ContentBase;   enBase?: ContentBase;
  /** Pre-split shared styling (applies to both languages) — read-only
   *  fallback, superseded by heStyle/enStyle on the next save. */
  size?: number; dash?: boolean; align?: ContentAlign;
};
const ALIGNS = new Set<ContentAlign>(['start', 'center', 'end']);
export const STYLE_KEY = { he: 'heStyle', en: 'enStyle' } as const;
export const BASE_KEY  = { he: 'heBase',  en: 'enBase'  } as const;

/** Clamp a posted size multiplier to a sane range; null if it's effectively
 *  "default" (1) or not a usable number. */
function cleanSize(raw: unknown): number | null {
  if (typeof raw !== 'number' || !isFinite(raw) || raw <= 0) return null;
  if (raw === 1) return null;
  return Math.min(2.5, Math.max(0.6, raw));
}

/** Reduce arbitrary input to a clean ContentStyle. `defAlign` is the alignment
 *  the page already uses for this field, so picking it back stores nothing.
 *  Returns null when nothing but defaults is left. */
function cleanStyle(raw: unknown, defAlign: ContentAlign = 'start'): ContentStyle | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const out: ContentStyle = {};
  const sz = cleanSize(o.size);
  if (sz !== null) out.size = sz;
  if (ALIGNS.has(o.align as ContentAlign) && o.align !== defAlign) out.align = o.align as ContentAlign;
  if (o.dash === true) out.dash = true;
  return (out.size !== undefined || out.align !== undefined || out.dash !== undefined) ? out : null;
}

/** Reduce arbitrary input to a clean ContentBase (the owner's pinned
 *  "original"). Unlike a style, an explicit empty text IS meaningful — it
 *  pins "this field shows nothing". */
function cleanBase(raw: unknown): ContentBase | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const out: ContentBase = {};
  if (typeof o.text === 'string') out.text = o.text.slice(0, MAX_LEN);
  const sz = cleanSize(o.size);
  if (sz !== null) out.size = sz;
  if (ALIGNS.has(o.align as ContentAlign)) out.align = o.align as ContentAlign;
  if (o.dash === true) out.dash = true;
  return out.text !== undefined ? out : null;
}

/** The styling that applies to one language — the per-language record when it
 *  exists, else the legacy shared fields. Mirrored by the inline applier in
 *  src/layouts/BaseLayout.astro; keep the two in sync. */
export function styleFor(v: ContentValue | undefined, lang: 'he' | 'en'): ContentStyle {
  if (!v) return {};
  const own = v[STYLE_KEY[lang]];
  if (own && typeof own === 'object') return own;
  return { size: v.size, align: v.align, dash: v.dash };
}

export type ContentMap   = Record<string, ContentValue>;

const KEY = '__content__';
const MAX_LEN = 4000;

/** How a piece of copy is typeset on the live site. The editor mirrors these
 *  in its preview boxes, so a headline is edited as a headline and an eyebrow
 *  as an eyebrow (see the `.pv--*` rules in functions/admin/content.ts).
 *    eyebrow    — tiny tracked small-caps kicker with the accent rule
 *    hero       — the full-bleed hero headline (biggest display type)
 *    heroMark   — the hero's italic second line
 *    display    — a section heading (serif display)
 *    title      — a smaller in-card heading (story boxes)
 *    lede       — the intro paragraph under a heading
 *    body       — normal paragraph copy
 *    button     — a button label (uppercase, tracked)
 *    link       — a small tracked accent link
 *    label      — an info-strip label (tiny tracked small-caps)
 *    value      — an info-strip value (serif)
 *    note       — small muted print
 *    popupTitle / popupBody — the entry popup card */
export type FieldRole =
  | 'eyebrow' | 'hero' | 'heroMark' | 'display' | 'title' | 'lede' | 'body'
  | 'button'  | 'link' | 'label'    | 'value'   | 'note'
  | 'popupTitle' | 'popupBody';

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
  /** How this copy is typeset on the site — drives the editor's preview. */
  role?:      FieldRole;
  /** True when this copy sits over a photograph (light text on a dark frame),
   *  so the editor previews it on a dark plate like the site does. */
  onPhoto?:   boolean;
  /** The alignment the page already gives this copy. The editor pre-selects
   *  it, and picking it back stores no override. Defaults to 'start'. */
  align?:     ContentAlign;
  /** One plain line about where this text shows up, for the editor. */
  hint?:      string;
  /** Kept for its saved value but no longer rendered anywhere on the site
   *  (a section was removed or commented out). The editor files these under
   *  "not shown on the site right now" instead of mixing them in. */
  retired?:   boolean;
}
export interface ContentGroup { title: string; note?: string; page: PageId; fields: ContentField[]; }

/** Which site page a group of copy belongs to. Drives the page tabs in the
 *  /admin/content editor (one button per page, like the Menu editor's tabs)
 *  so the owner edits one page's text at a time instead of one long scroll. */
export type PageId = 'home' | 'about' | 'events' | 'menu' | 'privacy' | 'accessibility' | 'popup';

export interface PageTab {
  id:     PageId;
  label:  string;
  /** One line describing the page, shown at the top of its panel. */
  note?:  string;
  /** Path on the live site (Hebrew), for the panel's "view page" link.
   *  Omitted for the popup, which isn't a page of its own. */
  path?:  string;
}

/** Order + labels for the page tabs. */
export const CONTENT_PAGES: PageTab[] = [
  { id: 'home',          label: 'Home',          path: '/',
    note: 'The front page — hero, story, gallery, private events and the info row.' },
  { id: 'about',         label: 'About',         path: '/about',
    note: 'Getting here, the four seating areas, kashrut and contact.' },
  { id: 'events',        label: 'Events',        path: '/events',
    note: 'The private-events page and the menu PDF behind its button.' },
  { id: 'menu',          label: 'Menu',          path: '/menu',
    note: 'The heading above the menu. Dishes and prices live in the Menu editor.' },
  { id: 'privacy',       label: 'Privacy',       path: '/privacy',
    note: 'The heading of the privacy policy page.' },
  { id: 'accessibility', label: 'Accessibility', path: '/accessibility',
    note: 'The heading of the accessibility statement page.' },
  { id: 'popup',         label: 'Entry popup',
    note: 'The announcement shown over every page when someone arrives.' },
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
  { title: 'Hero', page: 'home', note: 'The first screen — text over the full-bleed photograph.', fields: [
    { key: 'home.heroEyebrow',   label: 'Eyebrow', role: 'eyebrow', onPhoto: true,
      hint: 'The small tracked line above the headline.',
      he: 'מסעדת שף · ירושלים', en: 'Chef restaurant · Jerusalem' },
    // Empty in i18n.ts — the hero currently shows only the accent line below.
    // Type something here and it appears above it.
    { key: 'home.heroHeadline',  label: 'Headline', role: 'hero', onPhoto: true,
      hint: 'The biggest words on the site. Empty right now — the line below carries the hero.',
      he: '',                    en: '' },
    { key: 'home.heroTitleMark', label: 'Headline accent', role: 'heroMark', onPhoto: true,
      hint: 'The italic second line of the headline.',
      he: 'זהרה Zahara',         en: 'younger sister.' },
  ] },
  { title: 'Story', page: 'home', note: 'The two story boxes over the dining-room photo.', fields: [
    { key: 'home.storyEyebrow', label: 'Eyebrow', role: 'eyebrow', onPhoto: true, he: 'הסיפור', en: 'The story' },
    { key: 'home.storyHeading', label: 'Heading', role: 'title', onPhoto: true, html: true, multiline: true,
      he: 'אחותה הצעירה<br />של אנג׳ליקה.', en: 'A new chapter,<br />one kitchen.' },
    { key: 'home.storyP1', label: 'Paragraph 1', role: 'body', onPhoto: true, html: true, multiline: true,
      he: 'אנג׳ליקה פעלה במשך 16 שנה כמוסד קולינרי בירושלים. זהרה היא הפרק הבא — מסעדה חדשה בקומת הכניסה של מלון נוצ׳ה (Nucha by Fattal Colors) ברחוב בן סירא 16, ליד גן העצמאות וכיכר ציון.',
      en: 'Angelica has been a Jerusalem culinary institution for sixteen years. Zahara is the next chapter — a new restaurant on the ground floor of Nucha Hotel (Nucha by Fattal Colors) on Ben Sira 16 Street, steps from Independence Garden and Zion Square.' },
    { key: 'home.storyP2', label: 'Paragraph 2', role: 'body', onPhoto: true, html: true, multiline: true,
      he: 'השף <strong>רועי אחדות</strong>, ותיק במטבח של אנג׳ליקה, מציע כאן מטבח ים-תיכוני נדיב עם טכניקות צרפתיות קלאסיות והשפעות אסייתיות. מטבח כשר, עונתי, מבוסס על תוצרת מקומית טרייה — דגים, בשר, ירקות שמתחלפים עם השוק.',
      en: 'Chef <strong>Roi Achdut</strong>, a longtime Angelica veteran, offers a generous Mediterranean kitchen here, anchored by classical French technique with Asian influences. The kitchen is kosher, seasonal, and built on fresh local sourcing — fish, meat, and vegetables that change with the market.' },
    { key: 'home.storyP3', label: 'Paragraph 3', role: 'body', onPhoto: true, html: true, multiline: true,
      hint: 'Inside the second story box.',
      he: 'במקום הסדר השמרני של מנה ראשונה–עיקרית–קינוח, זהרה משחקת על הקונספט של <em>sharing is caring</em>. שולחן עליז, מנות עוברות, קצב דינמי, ובמרכז המסעדה — מטבח פתוח שכל סועד יכול לראות, ולהרגיש את החיבור בין הצלחת לאנשים שמכינים אותה.',
      en: 'Instead of the conventional starter–main–dessert order, Zahara plays on a <em>sharing is caring</em> concept. A joyful table, dishes moving between guests, dynamic rhythm — and at the heart of the room, an open kitchen visible to every diner, connecting the food to the people making it.' },

    { key: 'home.storyMoreEyebrow', label: 'Story box 2 — eyebrow', role: 'eyebrow', onPhoto: true,
      he: 'הגישה', en: 'Our approach' },
    { key: 'home.storyMoreTitle',   label: 'Story box 2 — title', role: 'title', onPhoto: true,
      he: 'Sharing is caring', en: 'Sharing is caring' },
    { key: 'home.storyReadMore',    label: 'Story box 2 — "read more" label', role: 'link', onPhoto: true,
      hint: 'The small label next to the open/close arrow.', he: 'קראו עוד', en: 'Read more' },
  ] },
  { title: 'Menu section', page: 'home',
    note: 'The photo band with the menu tiles. Only the tiles are on the page today — the copy below was part of the older layout.',
    fields: [
    { key: 'home.menuSplitEyebrow', label: 'Eyebrow', role: 'eyebrow', onPhoto: true, retired: true,
      he: 'התפריט', en: 'The menu' },
    { key: 'home.menuSplitHeading', label: 'Heading', role: 'display', onPhoto: true, retired: true, html: true,
      he: 'שולחן אחד,<br />ארבעה חלקים.', en: 'One table,<br />four parts.' },
    { key: 'home.menuSplitLede', label: 'Lede', role: 'lede', onPhoto: true, retired: true, multiline: true,
      he: 'התפריט בנוי לשיתוף ונחלק לארבעה — אוכל מהמטבח, יין, קוקטיילים מהבר וקינוחים. הכול עובר בין כולם.',
      en: 'Built to share and split into four — food from the kitchen, wine, cocktails from the bar, and dessert. Everything moves around the table.' },
    { key: 'home.menuSplitCta', label: 'Button label', role: 'button', onPhoto: true, retired: true,
      he: 'לתפריט המלא ↗', en: 'See the full menu ↗' },
  ] },
  { title: 'Gallery', page: 'home', note: 'Per-photo captions are edited on each photo in the Images tab.', fields: [
    { key: 'home.galleryEyebrow', label: 'Eyebrow', role: 'eyebrow', onPhoto: true, he: 'גלריה', en: 'Gallery' },
    { key: 'home.galleryHeading', label: 'Heading', role: 'display', onPhoto: true,
      he: 'הצצה לערב.', en: 'A glimpse of the evening.' },
  ] },
  { title: 'Private events', page: 'home', note: 'The photo-and-text block that links to the Events page.', fields: [
    { key: 'home.eventsEyebrow', label: 'Eyebrow', role: 'eyebrow', he: 'אירועים פרטיים', en: 'Private events' },
    { key: 'home.eventsHeading', label: 'Heading', role: 'display', html: true,
      he: 'חלל פרטי,<br />ערב פרטי.', en: 'Private space,<br />private night.' },
    { key: 'home.eventsP1', label: 'Paragraph 1', role: 'body', multiline: true,
      he: 'המסעדה ניתנת לסגירה לאירועים פרטיים ועסקיים. חדר פרטי לקבוצות אינטימיות, החלל המורחב לאירועי חברה, או המסעדה כולה לארוחות סגורות.',
      en: 'The restaurant is available for private and corporate events — an intimate private room for small groups, an extended space for company gatherings, or the entire restaurant for closed seatings.' },
    { key: 'home.eventsP2', label: 'Paragraph 2', role: 'body', multiline: true,
      he: 'כל אירוע מתוכנן עם השף. נחזור אליכם תוך יום עסקים.',
      en: 'Each event is planned with the chef. We respond within one business day.' },
    { key: 'home.eventsCta',        label: 'Primary button label',   role: 'button',
      he: 'לפנייה לאירועים ↗', en: 'Inquire about events ↗' },
    { key: 'home.eventsContactCta', label: 'Secondary button label', role: 'button',
      he: 'צרו קשר',           en: 'Contact us' },
  ] },
  { title: 'Instagram', page: 'home', fields: [
    { key: 'home.igEyebrow', label: 'Eyebrow', role: 'eyebrow', align: 'center', he: 'אינסטגרם',      en: 'Instagram' },
    { key: 'home.igHeading', label: 'Heading', role: 'display', align: 'center', he: 'רגעים מהמטבח.', en: 'Moments from the kitchen.' },
  ] },
  { title: 'Info strip (the row under the hero)', page: 'home',
    note: 'The four-column row of practical details, set over the dining-room photo.', fields: [
    { key: 'info.hoursLabel',   label: 'Hours — label', role: 'label', onPhoto: true, he: 'שעות',                en: 'Hours' },
    { key: 'info.hoursValue',   label: 'Hours — value', role: 'value', onPhoto: true, he: 'ב׳–ה׳ · 18:00–22:00', en: 'Mon–Thu · 18:00–22:00' },
    { key: 'info.addressLabel', label: 'Address — label', role: 'label', onPhoto: true, he: 'כתובת',              en: 'Address' },
    { key: 'info.addressValue', label: 'Address — value', role: 'value', onPhoto: true, he: '16 בן סירא, ירושלים',   en: 'Ben Sira 16 St, Jerusalem' },
    { key: 'info.reservLabel',  label: 'Reservations — label', role: 'label', onPhoto: true, he: 'להזמנות',       en: 'Reservations' },
    { key: 'info.reservValue',  label: 'Reservations — phone', role: 'value', onPhoto: true,
      hint: 'Tapping it dials the number.', he: '077-303-4180',  en: '+972 77 303 4180' },
    { key: 'info.reservTabit',  label: 'Reservations — Tabit link text', role: 'link', onPhoto: true,
      he: 'הזמנה בטאביט ↗', en: 'Book on Tabit ↗' },
    { key: 'info.kosherLabel',  label: 'Kosher — label', role: 'label', onPhoto: true, he: 'כשרות',          en: 'Kosher' },
    { key: 'info.kosherValue',  label: 'Kosher — value', role: 'value', onPhoto: true, he: 'רבנות ירושלים',  en: 'Rabbanut Yerushalayim' },
    { key: 'info.kosherView',   label: 'Kosher — certificate link text', role: 'link', onPhoto: true,
      hint: 'Opens the kosher certificate.', he: 'הצגת התעודה ↗', en: 'View certificate ↗' },
  ] },

  // ── About page ────────────────────────────────────────────────────────────
  { title: 'About page · Intro', page: 'about', fields: [
    { key: 'about.eyebrow', label: 'Eyebrow', role: 'eyebrow', he: 'אודות', en: 'About' },
    { key: 'about.heading', label: 'Heading', role: 'display', html: true, multiline: true,
      he: 'זהרה,<br />והדרך אלינו.', en: 'Zahara,<br />and how to find us.' },
    { key: 'about.lede', label: 'Lede', role: 'lede', multiline: true,
      he: 'מסעדת שף ים-תיכונית כשרה בקומת הכניסה של מלון נוצ׳ה ברחוב בן סירא 16, ירושלים. כאן תמצאו את כל הפרטים — איך מגיעים, ואיך ליצור איתנו קשר.',
      en: 'A kosher Mediterranean chef restaurant on the ground floor of Nucha Hotel, Ben Sira 16 Street, Jerusalem. Everything you need is here — how to reach us, and how to get in touch.' },
  ] },
  { title: 'About page · Getting here', page: 'about', fields: [
    { key: 'about.locationEyebrow', label: 'Eyebrow', role: 'eyebrow', he: 'איך מגיעים', en: 'Getting here' },
    { key: 'about.locationHeading', label: 'Heading', role: 'display', he: 'לבוא אלינו.', en: 'Find us.' },
    { key: 'about.locationLede', label: 'Lede', role: 'lede', multiline: true,
      he: "זהרה יושבת בקומת הכניסה של מלון נוצ׳ה (Nucha by Fattal Colors) ברחוב בן סירא 16 — דקות הליכה מגן העצמאות, מדרחוב בן יהודה, כיכר ציון, ממילא והעיר העתיקה.",
      en: "Zahara sits on the ground floor of Nucha Hotel (Nucha by Fattal Colors) on Ben Sira 16 Street — a few minutes' walk from Independence Garden, Ben Yehuda pedestrian mall, Zion Square, Mamilla and the Old City." },
    { key: 'about.mapLoad', label: 'Map — “show map” label', role: 'button', align: 'center',
      hint: 'On the map placeholder — tapping it loads the Google map.', he: 'הצגת המפה', en: 'Show the map' },
    { key: 'about.mapPrivacy', label: 'Map — privacy note', role: 'note', align: 'center', multiline: true,
      he: 'המפה נטענת מ-Google. לחיצה תטען אותה ועשויה לרשום את כתובת ה-IP שלכם.',
      en: 'The map loads from Google. Tapping it loads the map and may log your IP address.' },
    { key: 'about.waze', label: 'Button — Waze', role: 'button', he: 'פתחו ב-Waze', en: 'Open in Waze' },
    { key: 'about.gmaps', label: 'Button — Google Maps', role: 'button', he: 'פתחו ב-Google Maps', en: 'Open in Google Maps' },
    { key: 'about.call', label: 'Button — Call', role: 'button', he: 'חייגו 077-303-4180', en: 'Call +972 77 303 4180' },
  ] },
  { title: 'About page · The space', page: 'about', note: 'The photo block describing the four seating areas.', fields: [
    { key: 'about.designEyebrow', label: 'Eyebrow', role: 'eyebrow', he: 'החלל', en: 'The space' },
    { key: 'about.designHeading', label: 'Heading', role: 'display', html: true, multiline: true,
      he: 'ארבע דרכים<br />לשבת.', en: 'Four ways<br />to sit.' },
    { key: 'about.designLede', label: 'Lede', role: 'lede', multiline: true,
      he: 'תכננו את זהרה כך שלכל ערב יש פינה משלו — מהמטבח הפתוח בפנים ועד האוויר הפתוח בחוץ.',
      en: 'Zahara is laid out so every evening finds its own corner — from the open kitchen inside to the open air outside.' },
    { key: 'about.designInside', label: 'Indoor seating', role: 'body', html: true, multiline: true,
      he: '<strong>ישיבה בפנים:</strong> אולם המסעדה סביב המטבח הפתוח — לב הבית, שבו רואים את השף עובד והצלחות יוצאות.',
      en: '<strong>Indoor seating:</strong> the dining room wraps around the open kitchen — the heart of the house, where you watch the chef work and the plates leave the pass.' },
    { key: 'about.designBar', label: 'At the bar', role: 'body', html: true, multiline: true,
      he: '<strong>ישיבה בבר:</strong> כיסאות גבוהים מול הבר — המושב הראשון לקוקטייל או לכוס יין, לבד או בזוג.',
      en: '<strong>At the bar:</strong> high stools facing the bar — the front-row seat for a cocktail or a glass of wine, alone or as a pair.' },
    { key: 'about.designClosed', label: 'Enclosed terrace', role: 'body', html: true, multiline: true,
      he: '<strong>מרפסת סגורה:</strong> ישיבה בחוץ בחלל מקורה ומחומם, ללא עישון — נעים לאורך כל השנה, גם בערבי החורף של ירושלים.',
      en: "<strong>Enclosed terrace:</strong> covered, heated outdoor seating, non-smoking — comfortable year-round, even on Jerusalem's cooler evenings." },
    { key: 'about.designOpen', label: 'Open terrace', role: 'body', html: true, multiline: true,
      he: '<strong>מרפסת פתוחה:</strong> ישיבה בחוץ באוויר הפתוח, מתאימה לעישון — לערבים שבהם רוצים את השמיים מעל.',
      en: '<strong>Open terrace:</strong> open-air outdoor seating, smoking welcome — for the nights you want the sky overhead.' },
  ] },
  { title: 'About page · Kosher + contact', page: 'about', fields: [
    { key: 'about.kosherEyebrow', label: 'Kosher — eyebrow', role: 'eyebrow', he: 'כשרות', en: 'Kosher' },
    { key: 'about.kosherHeading', label: 'Kosher — heading', role: 'display', retired: true,
      he: 'מטבח כשר.', en: 'A kosher kitchen.' },
    { key: 'about.kosherNote', label: 'Kosher — note', role: 'body', multiline: true,
      he: 'המטבח מפוקח בכשרות רבנות ירושלים. תוכלו לעיין בתעודת הכשרות המעודכנת בכל עת.',
      en: 'The kitchen is certified kosher by the Rabbanut Yerushalayim. The current certificate is available to view at any time.' },
    { key: 'about.kosherCertCta', label: 'Kosher — button', role: 'button',
      he: 'הצגת תעודת הכשרות ↗', en: 'View kosher certificate ↗' },
    { key: 'about.reachEyebrow', label: '“Reach us directly” eyebrow', role: 'eyebrow',
      hint: 'Above the contact form at the bottom of the page.', he: 'פנו אלינו ישירות', en: 'Reach us directly' },
  ] },

  // ── Events page ───────────────────────────────────────────────────────────
  { title: 'Events page', page: 'events', note: 'The centred opening band above the enquiry form.', fields: [
    { key: 'events.eyebrow', label: 'Eyebrow', role: 'eyebrow', align: 'center', he: 'אירועים פרטיים', en: 'Private events' },
    { key: 'events.heading', label: 'Heading', role: 'display', align: 'center', html: true, multiline: true,
      he: 'חלל פרטי,<br />ערב פרטי.', en: 'Private space,<br />private night.' },
    { key: 'events.lede', label: 'Lede', role: 'lede', align: 'center', multiline: true,
      he: 'המסעדה ניתנת לסגירה לאירועים פרטיים ועסקיים — חדר אינטימי לקבוצות קטנות, החלל המורחב לאירועי חברה, או המסעדה כולה. השאירו פרטים ונחזור אליכם תוך יום עסקים.',
      en: 'The restaurant is available for private and corporate events — an intimate room for small groups, an extended space for company gatherings, or the entire room. Leave your details and we’ll get back to you within one business day.' },
    { key: 'events.benefit1', label: 'Benefit 1', role: 'body', align: 'center', retired: true,
      he: 'חדר פרטי לקבוצות אינטימיות', en: 'Private room for intimate groups' },
    { key: 'events.benefit2', label: 'Benefit 2', role: 'body', align: 'center', retired: true,
      he: 'התפריט נבנה אישית עם השף', en: 'Menu built personally with the chef' },
    { key: 'events.benefit3', label: 'Benefit 3', role: 'body', align: 'center', retired: true,
      he: 'מטבח כשר · אופציות צמחוניות', en: 'Kosher kitchen · vegetarian options' },
    { key: 'events.benefit4', label: 'Benefit 4', role: 'body', align: 'center', retired: true,
      he: 'אפשרות לסגירת המסעדה כולה', en: 'Full restaurant buyouts available' },
  ] },

  // ── Page headers (Menu / Privacy / Accessibility) ───────────────────────────
  { title: 'Menu page · Header', page: 'menu', note: 'Menu items themselves are edited in the Menu editor tab.', fields: [
    { key: 'menu.eyebrow', label: 'Eyebrow', role: 'eyebrow', he: 'תפריט · מתעדכן יומי', en: 'Menu · Updated daily' },
    { key: 'menu.heading', label: 'Heading', role: 'display', he: 'מה יש היום.', en: "What's on today." },
    { key: 'menu.lede', label: 'Lede', role: 'lede', multiline: true,
      he: 'התפריט משתנה עם מה שהגיע מהשוק בבוקר. רעננו את הדף לגרסה העדכנית.',
      en: 'Changes with the morning market. Refresh the page for the latest.' },
  ] },
  { title: 'Privacy page · Header', page: 'privacy', fields: [
    { key: 'privacy.eyebrow', label: 'Eyebrow', role: 'eyebrow', he: 'פרטיות', en: 'Privacy' },
    { key: 'privacy.heading', label: 'Heading', role: 'display', he: 'מדיניות פרטיות', en: 'Privacy policy' },
  ] },
  { title: 'Accessibility page · Header', page: 'accessibility', fields: [
    { key: 'accessibility.eyebrow', label: 'Eyebrow', role: 'eyebrow', he: 'נגישות', en: 'Accessibility' },
    { key: 'accessibility.heading', label: 'Heading', role: 'display', he: 'הצהרת נגישות', en: 'Accessibility statement' },
  ] },

  // ── Entry popup (site-wide announcement) ────────────────────────────────────
  // Defaults mirror `popup` in src/data/i18n.ts — keep the two in sync.
  // Whether the popup shows at all is a separate on/off + days setting stored
  // under __popup__ (see readPopupConfig below) and edited on the same tab.
  { title: 'Popup text', page: 'popup',
    note: 'The words on the card. They show in the “Text card” and “Photo + text” styles.', fields: [
    { key: 'popup.title', label: 'Title', role: 'popupTitle', align: 'center',
      he: 'עדכון לגבי תשעת הימים', en: 'Update regarding the Nine Days' },
    { key: 'popup.body', label: 'Text', role: 'popupBody', align: 'center', multiline: true,
      he: 'הכנו תפריט מיוחד לתשעת הימים — הוא יעלה לאתר בימים הקרובים.',
      en: 'We have prepared a special menu for the Nine Days — it will be published here in the coming days.' },
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

/** The built-in defaults written in the editor's own token format
 *  (**bold**, *italic*, __underline__, newlines) — the same shape the editor
 *  produces when it serialises a box. Some defaults are authored with raw
 *  tags (`<strong>`, `<br />`), which render identically; comparing against
 *  BOTH forms is what keeps an untouched field from being stored as an
 *  "override" the moment the page is saved. */
function tokenise(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, '**$2**')
    .replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, '*$2*')
    .replace(/<u>([\s\S]*?)<\/u>/gi, '__$1__')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}
export const defaultTokens = (key: string, lang: 'he' | 'en'): string => tokenise(defaultFor(key, lang));

/** Does this posted text mean "leave the built-in default alone"? True for the
 *  default itself and for its token-equivalent. */
const isDefaultText = (key: string, lang: 'he' | 'en', text: string): boolean =>
  text === defaultFor(key, lang) || text === defaultTokens(key, lang);

/** The alignment the page itself gives a field (most are 'start'). Picking it
 *  in the editor therefore stores no override. */
const FIELD_ALIGN: Record<string, ContentAlign> = Object.fromEntries(
  CONTENT_GROUPS.flatMap(g => g.fields.filter(f => f.align).map(f => [f.key, f.align as ContentAlign])),
);
export const defaultAlignFor = (key: string): ContentAlign => FIELD_ALIGN[key] ?? 'start';

/** Read + sanitise a content map from one KV namespace (null-safe). */
async function readMapFrom(kv: KVNamespace | null): Promise<ContentMap> {
  if (!kv) return {};
  try {
    const raw = await kv.get(KEY);
    return raw ? sanitiseContent(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

/** Deep-merge (key + language) content maps for the DISPLAY fallback: `over`
 *  (this venue's own edits) wins per key AND per language over `base`
 *  (Zahara's live copy). An explicit '' in `over` still hides the element. */
function mergeForDisplay(base: ContentMap, over: ContentMap): ContentMap {
  const out: ContentMap = {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(over)])) {
    out[k] = { ...base[k], ...over[k] };
  }
  return out;
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
    // Per-language styling + the owner's pinned "original" (current format).
    for (const lang of ['he', 'en'] as const) {
      const st = cleanStyle((v as Record<string, unknown>)[STYLE_KEY[lang]], defaultAlignFor(k));
      if (st) val[STYLE_KEY[lang]] = st;
      const bs = cleanBase((v as Record<string, unknown>)[BASE_KEY[lang]]);
      if (bs) val[BASE_KEY[lang]] = bs;
    }
    // Legacy shared styling — kept so records saved before the split keep
    // rendering; the next save from the editor replaces them.
    const sz = cleanSize((v as Record<string, unknown>).size);
    if (sz !== null) val.size = sz;
    if ((v as Record<string, unknown>).dash === true) val.dash = true;
    const al = (v as Record<string, unknown>).align;
    if (ALIGNS.has(al as ContentAlign) && al !== 'start') val.align = al as ContentAlign;
    if (val.he !== undefined || val.en !== undefined || val.size !== undefined
        || val.dash !== undefined || val.align !== undefined
        || val.heStyle !== undefined || val.enStyle !== undefined
        || val.heBase !== undefined || val.enBase !== undefined) out[k] = val;
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
      if (isDefaultText(k, lang, t)) delete cur[lang];   // matches default → no override
      else cur[lang] = t;                                // override (incl. '' = hide)
    }
    // Per-language styling (size / align / dash). Posting either language's
    // style retires the legacy shared style for this key — the editor always
    // sends both, so nothing is lost in the hand-over.
    const postedStyle = (STYLE_KEY.he in (v as object)) || (STYLE_KEY.en in (v as object));
    if (postedStyle) {
      for (const lang of ['he', 'en'] as const) {
        const slot = STYLE_KEY[lang];
        if (!(slot in (v as object))) continue;
        const st = cleanStyle((v as Record<string, unknown>)[slot], defaultAlignFor(k));
        if (st) cur[slot] = st;
        else delete cur[slot];
      }
      delete cur.size; delete cur.dash; delete cur.align;
      // The owner's pinned "original", saved alongside. Sending null (or an
      // object with no text) clears it and hands the field back to the
      // built-in default.
      for (const lang of ['he', 'en'] as const) {
        const slot = BASE_KEY[lang];
        if (!(slot in (v as object))) continue;
        const bs = cleanBase((v as Record<string, unknown>)[slot]);
        if (bs) cur[slot] = bs;
        else delete cur[slot];
      }
    } else {
      // Legacy shared controls (older clients). Same semantics as before:
      // 1 / false / 'start' / absent clears the stored value.
      if ('size' in (v as Record<string, unknown>)) {
        const sz = cleanSize((v as Record<string, unknown>).size);
        if (sz === null) delete cur.size;
        else cur.size = sz;
      }
      if ('dash' in (v as Record<string, unknown>)) {
        if ((v as Record<string, unknown>).dash === true) cur.dash = true;
        else delete cur.dash;
      }
      if ('align' in (v as Record<string, unknown>)) {
        const al = (v as Record<string, unknown>).align;
        if (al === 'center' || al === 'end') cur.align = al;
        else delete cur.align;
      }
    }
    if (cur.he !== undefined || cur.en !== undefined || cur.size !== undefined
        || cur.dash !== undefined || cur.align !== undefined
        || cur.heStyle !== undefined || cur.enStyle !== undefined
        || cur.heBase !== undefined || cur.enBase !== undefined) merged[k] = cur;
    else delete merged[k];
  }
  return merged;
}

/** This venue's OWN saved copy — NO cross-venue fallback. The admin editor
 *  uses this so its save/diff compares each field against the built-in default
 *  (not the other venue's live text), keeping the two stores independent. */
export async function readContentOwn(env: ContentEnv, site: Site = 'zahara'): Promise<ContentMap> {
  return readMapFrom(siteScope(env, site).kv);
}

/** DISPLAY read. Zahara returns its own copy. Rooftop returns its own copy with
 *  Zahara's live copy filling any field it hasn't edited yet. */
export async function readContent(env: ContentEnv, site: Site = 'zahara'): Promise<ContentMap> {
  const scope = siteScope(env, site);
  const own = await readMapFrom(scope.kv);
  if (!scope.kvFb) return own;                    // zahara — no fallback
  return mergeForDisplay(await readMapFrom(scope.kvFb), own);
}

/** Persist a venue's copy to its OWN store only (never the fallback). */
export async function writeContent(env: ContentEnv, site: Site, map: ContentMap): Promise<boolean> {
  const kv = siteScope(env, site).kv;
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

async function readVersionFrom(kv: KVNamespace | null): Promise<string | null> {
  if (!kv) return null;
  try { return (await kv.get(ASSET_VERSION_KEY)) || null; } catch { return null; }
}

export async function readAssetVersion(env: ContentEnv, site: Site = 'zahara'): Promise<string> {
  const scope = siteScope(env, site);
  const own = await readVersionFrom(scope.kv);
  if (own) return own;
  // A rooftop that hasn't uploaded any image yet is still showing Zahara's
  // photos as fallbacks, so it rides Zahara's version — that way a Zahara
  // re-upload cache-busts on rooftop too. The instant rooftop uploads its own
  // image (which bumps its own version), rooftop's version takes over.
  return (await readVersionFrom(scope.kvFb)) || '0';
}

export async function bumpAssetVersion(env: ContentEnv, site: Site = 'zahara'): Promise<void> {
  const kv = siteScope(env, site).kv;
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

// ── Entry popup visibility ─────────────────────────────────────────────────
// One small KV record (`__popup__`) deciding whether the site-wide entry
// popup is shown. The popup's TEXT lives in the normal content map above
// (popup.title / popup.body); this record is only the on/off switch and the
// optional auto-hide window:
//   enabled — the owner's switch.
//   days    — 0 = no time limit; N = hide automatically N days after the
//             save that turned the popup on (or changed N).
//   until   — the absolute hide timestamp (ms), computed at save time so
//             every request can check it with plain comparison.
// No record yet (fresh deploy) defaults to ENABLED with no time limit — the
// popup ships live; turning it off in /admin/content writes an explicit off.

const POPUP_KEY = '__popup__';

/** R2 object key for the optional popup photo (served at /popup-image). */
export const POPUP_IMAGE_OBJECT = 'images/popup';

/** R2 object key for the optional Events-page menu PDF (served at /events-menu).
 *  Stored under the `images/` prefix so it rides the same per-venue bucket +
 *  cross-venue fallback as everything else (see functions/data/photos-serve). */
export const EVENTS_MENU_OBJECT = 'images/events-menu';

/** How the entry popup is presented:
 *    text  — the classic paper card (title + body), the default.
 *    photo — the popup IS the photo (no card text).
 *    both  — the photo on top, with the card title + body beneath it. */
export type PopupMode = 'text' | 'photo' | 'both';
const POPUP_MODES = new Set<PopupMode>(['text', 'photo', 'both']);

export interface PopupConfig {
  enabled: boolean;
  days: number;
  until: number;
  /** Presentation style (see PopupMode). */
  mode: PopupMode;
  /** Whether a popup photo is currently stored in R2. Set by the popup-image
   *  upload/apply/delete endpoints, read by the middleware to decide whether
   *  to inject the image URL. */
  hasImage: boolean;
}

export const POPUP_DEFAULT: PopupConfig = { enabled: true, days: 0, until: 0, mode: 'text', hasImage: false };

export function sanitisePopupConfig(raw: unknown): PopupConfig {
  if (!raw || typeof raw !== 'object') return { ...POPUP_DEFAULT };
  const o = raw as Record<string, unknown>;
  const enabled = typeof o.enabled === 'boolean' ? o.enabled : POPUP_DEFAULT.enabled;
  const days = typeof o.days === 'number' && isFinite(o.days)
    ? Math.min(365, Math.max(0, Math.round(o.days))) : 0;
  const until = typeof o.until === 'number' && isFinite(o.until) && o.until > 0
    ? Math.round(o.until) : 0;
  const mode = POPUP_MODES.has(o.mode as PopupMode) ? (o.mode as PopupMode) : POPUP_DEFAULT.mode;
  const hasImage = typeof o.hasImage === 'boolean' ? o.hasImage : POPUP_DEFAULT.hasImage;
  return { enabled, days, until, mode, hasImage };
}

/** Is there a photo to show for the CURRENT presentation? True only when the
 *  popup is in a photo mode and a photo is actually stored. */
export function popupShowsImage(cfg: PopupConfig): boolean {
  return cfg.hasImage && (cfg.mode === 'photo' || cfg.mode === 'both');
}

/** Is the popup currently shown to visitors? */
export function popupActive(cfg: PopupConfig, now = Date.now()): boolean {
  return cfg.enabled && (cfg.days <= 0 || (cfg.until > 0 && now < cfg.until));
}

/** Read a popup record from one namespace; null when the key is absent. */
async function readPopupFrom(kv: KVNamespace | null): Promise<PopupConfig | null> {
  if (!kv) return null;
  try {
    const raw = await kv.get(POPUP_KEY);
    return raw ? sanitisePopupConfig(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** This venue's OWN popup config (or the default) — no fallback. Admin prefill
 *  + the save merge use this so a rooftop save can't persist Zahara's popup. */
export async function readPopupConfigOwn(env: ContentEnv, site: Site = 'zahara'): Promise<PopupConfig> {
  return (await readPopupFrom(siteScope(env, site).kv)) ?? { ...POPUP_DEFAULT };
}

/** DISPLAY read. Zahara: its own record (or default). Rooftop: its own record,
 *  else Zahara's live record, else the default — so rooftop mirrors Zahara's
 *  announcement until it saves its own. */
export async function readPopupConfig(env: ContentEnv, site: Site = 'zahara'): Promise<PopupConfig> {
  const scope = siteScope(env, site);
  const own = await readPopupFrom(scope.kv);
  if (own) return own;
  return (await readPopupFrom(scope.kvFb)) ?? { ...POPUP_DEFAULT };
}

export async function writePopupConfig(env: ContentEnv, site: Site, cfg: PopupConfig): Promise<boolean> {
  const kv = siteScope(env, site).kv;
  if (!kv) return false;
  await kv.put(POPUP_KEY, JSON.stringify(sanitisePopupConfig(cfg)));
  return true;
}
