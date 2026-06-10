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

export type ContentValue = { he?: string; en?: string };
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
export interface ContentGroup { title: string; note?: string; fields: ContentField[]; }

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
  { title: 'Hero', fields: [
    { key: 'home.heroEyebrow',   label: 'Eyebrow',         he: 'מסעדת שף · ירושלים', en: 'Chef restaurant · Jerusalem' },
    { key: 'home.heroHeadline',  label: 'Headline',        he: 'הזרע המופלא של',      en: "Angelica's" },
    { key: 'home.heroTitleMark', label: 'Headline accent', he: 'זהרה Zahara',         en: 'younger sister.' },
  ] },
  { title: 'Story', fields: [
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
  { title: 'Menu section', fields: [
    { key: 'home.menuSplitEyebrow', label: 'Eyebrow', he: 'התפריט', en: 'The menu' },
    { key: 'home.menuSplitHeading', label: 'Heading', html: true,
      he: 'שולחן אחד,<br />ארבעה חלקים.', en: 'One table,<br />four parts.' },
    { key: 'home.menuSplitLede', label: 'Lede', multiline: true,
      he: 'התפריט בנוי לשיתוף ונחלק לארבעה — אוכל מהמטבח, יין, קוקטיילים מהבר וקינוחים. הכול עובר בין כולם.',
      en: 'Built to share and split into four — food from the kitchen, wine, cocktails from the bar, and dessert. Everything moves around the table.' },
    { key: 'home.menuSplitCta', label: 'Button label', he: 'לתפריט המלא ↗', en: 'See the full menu ↗' },
  ] },
  { title: 'Gallery', note: 'Per-photo captions are edited on each photo in the Images tab.', fields: [
    { key: 'home.galleryEyebrow', label: 'Eyebrow', he: 'גלריה', en: 'Gallery' },
    { key: 'home.galleryHeading', label: 'Heading', he: 'הצצה לערב.', en: 'A glimpse of the evening.' },
  ] },
  { title: 'Private events', fields: [
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
  { title: 'Instagram', fields: [
    { key: 'home.igEyebrow', label: 'Eyebrow', he: 'אינסטגרם',      en: 'Instagram' },
    { key: 'home.igHeading', label: 'Heading', he: 'רגעים מהמטבח.', en: 'Moments from the kitchen.' },
  ] },
  { title: 'Info strip (the row under the hero)', fields: [
    { key: 'info.hoursLabel',   label: 'Hours — label',  he: 'שעות',                en: 'Hours' },
    { key: 'info.hoursValue',   label: 'Hours — value',  he: 'ב׳–ה׳ · 18:00–22:00', en: 'Mon–Thu · 18:00–22:00' },
    { key: 'info.addressLabel', label: 'Address — label', he: 'כתובת',              en: 'Address' },
    { key: 'info.addressValue', label: 'Address — value', he: 'בן סירא, ירושלים',   en: 'Ben Sira St, Jerusalem' },
    { key: 'info.reservLabel',  label: 'Reservations — label',  he: 'להזמנות',       en: 'Reservations' },
    { key: 'info.reservValue',  label: 'Reservations — phone',  he: '077-303-4180',  en: '+972 77 303 4180' },
    { key: 'info.reservTabit',  label: 'Reservations — Tabit link text', he: 'הזמנה בטאביט ↗', en: 'Book on Tabit ↗' },
    { key: 'info.kosherLabel',  label: 'Kosher — label', he: 'כשרות',          en: 'Kosher' },
    { key: 'info.kosherValue',  label: 'Kosher — value', he: 'רבנות ירושלים',  en: 'Rabbanut Yerushalayim' },
    { key: 'info.kosherView',   label: 'Kosher — certificate link text', he: 'הצגת התעודה ↗', en: 'View certificate ↗' },
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
    if (val.he !== undefined || val.en !== undefined) out[k] = val;
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
    if (cur.he !== undefined || cur.en !== undefined) merged[k] = cur;
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
