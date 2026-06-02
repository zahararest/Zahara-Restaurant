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
    { key: 'home.heroEyebrow',   label: 'Eyebrow' },
    { key: 'home.heroHeadline',  label: 'Headline' },
    { key: 'home.heroTitleMark', label: 'Headline accent' },
  ] },
  { title: 'Story', fields: [
    { key: 'home.storyEyebrow', label: 'Eyebrow' },
    { key: 'home.storyHeading', label: 'Heading',     html: true, multiline: true },
    { key: 'home.storyP1',      label: 'Paragraph 1', html: true, multiline: true },
    { key: 'home.storyP2',      label: 'Paragraph 2', html: true, multiline: true },
    { key: 'home.storyP3',      label: 'Paragraph 3', html: true, multiline: true },
  ] },
  { title: 'Menu section', fields: [
    { key: 'home.menuSplitEyebrow', label: 'Eyebrow' },
    { key: 'home.menuSplitHeading', label: 'Heading', html: true },
    { key: 'home.menuSplitLede',    label: 'Lede',    multiline: true },
    { key: 'home.menuSplitCta',     label: 'Button label' },
  ] },
  { title: 'Gallery', note: 'Per-photo captions are edited on each photo in the Images tab.', fields: [
    { key: 'home.galleryEyebrow', label: 'Eyebrow' },
    { key: 'home.galleryHeading', label: 'Heading' },
  ] },
  { title: 'Private events', fields: [
    { key: 'home.eventsEyebrow',     label: 'Eyebrow' },
    { key: 'home.eventsHeading',     label: 'Heading', html: true },
    { key: 'home.eventsP1',          label: 'Paragraph 1', multiline: true },
    { key: 'home.eventsP2',          label: 'Paragraph 2', multiline: true },
    { key: 'home.eventsCta',         label: 'Primary button label' },
    { key: 'home.eventsContactCta',  label: 'Secondary button label' },
  ] },
  { title: 'Instagram', fields: [
    { key: 'home.igEyebrow', label: 'Eyebrow' },
    { key: 'home.igHeading', label: 'Heading' },
  ] },
  { title: 'Info strip (the row under the hero)', fields: [
    { key: 'info.hoursLabel',   label: 'Hours — label' },
    { key: 'info.hoursValue',   label: 'Hours — value' },
    { key: 'info.addressLabel', label: 'Address — label' },
    { key: 'info.addressValue', label: 'Address — value' },
    { key: 'info.reservLabel',  label: 'Reservations — label' },
    { key: 'info.reservValue',  label: 'Reservations — phone' },
    { key: 'info.reservTabit',  label: 'Reservations — Tabit link text' },
    { key: 'info.kosherLabel',  label: 'Kosher — label' },
    { key: 'info.kosherValue',  label: 'Kosher — value' },
  ] },
];

/** Every key the editor (and gallery captions) may write. Anything outside
 *  this set is dropped on read/write. */
export const ALL_CONTENT_KEYS: readonly string[] = [
  ...CONTENT_GROUPS.flatMap(g => g.fields.map(f => f.key)),
  ...GALLERY_CAPTION_KEYS.map(galleryCaptionKey),
];
const ALLOWED = new Set(ALL_CONTENT_KEYS);

function pickKv(env: ContentEnv): KVNamespace | null {
  return env.MENU_DATA ?? env.PALETTE_DATA ?? null;
}

/** Reduce arbitrary input to a clean { key: { he?, en? } } map. Drops
 *  unknown keys and empty strings. */
export function sanitiseContent(input: unknown): ContentMap {
  const out: ContentMap = {};
  if (!input || typeof input !== 'object') return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!ALLOWED.has(k) || !v || typeof v !== 'object') continue;
    const val: ContentValue = {};
    for (const lang of ['he', 'en'] as const) {
      const s = (v as Record<string, unknown>)[lang];
      if (typeof s === 'string' && s.trim() !== '') val[lang] = s.slice(0, MAX_LEN);
    }
    if (val.he !== undefined || val.en !== undefined) out[k] = val;
  }
  return out;
}

/** Merge a posted (possibly partial) map into the existing one. A posted
 *  lang value that is an empty string CLEARS that override; a missing lang
 *  property is left untouched. */
export function mergeContent(existing: ContentMap, posted: unknown): ContentMap {
  const merged: ContentMap = { ...existing };
  if (!posted || typeof posted !== 'object') return sanitiseContent(merged);
  for (const [k, v] of Object.entries(posted as Record<string, unknown>)) {
    if (!ALLOWED.has(k) || !v || typeof v !== 'object') continue;
    const cur: ContentValue = { ...(merged[k] ?? {}) };
    for (const lang of ['he', 'en'] as const) {
      const raw = (v as Record<string, unknown>)[lang];
      if (typeof raw !== 'string') continue;       // not provided → leave as-is
      const t = raw.slice(0, MAX_LEN);
      if (t.trim() === '') delete cur[lang];        // explicit clear
      else cur[lang] = t;
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

/** Serialise the override map for safe embedding inside a
 *  <script type="application/json"> tag (escapes `<` so a value can never
 *  contain `</script>`). */
export function contentToJson(map: ContentMap): string {
  return JSON.stringify(map).replace(/</g, '\\u003c');
}
