// Canonical menu taxonomy. The public menu component, the admin sidebar,
// the API, and the KV slug whitelist are all derived from this single spec.

import type { Lang } from './i18n';

/** Rendering strategy for a public menu panel. */
export type MenuKind = 'list' | 'wine' | 'cocktails';

/** A menu category that may have separate KV records per language. */
export interface MenuCategory {
  /** Stable ID used for tab DOM IDs (`tab-${id}`, `panel-${id}`). */
  id:    'food' | 'dessert' | 'wine' | 'cocktails' ;
  kind:  MenuKind;
  /** i18n key in `menu` for the public tab label. */
  labelKey: 'tabFood' | 'tabDesserts' | 'tabWine' | 'tabCocktails' ;
  /** Map of language → KV/API slug. If a slug is the same in both
   *  languages (cocktails are intentionally bilingual), set both to it. */
  slugs: Record<Lang, string>;
}

export const MENU_CATEGORIES: readonly MenuCategory[] = [
  { id: 'food',      kind: 'list',      labelKey: 'tabFood',      slugs: { he: 'he',      en: 'en'         } },
  { id: 'dessert',   kind: 'list',      labelKey: 'tabDesserts',  slugs: { he: 'dessert', en: 'dessert_en' } },
  { id: 'wine',      kind: 'wine',      labelKey: 'tabWine',      slugs: { he: 'wine',    en: 'wine_en'    } },
  { id: 'cocktails', kind: 'cocktails', labelKey: 'tabCocktails', slugs: { he: 'cocktails', en: 'cocktails' } },
  // { id: 'events',    kind: 'list',      labelKey: 'tabEvents',    slugs: { he: 'events',  en: 'events_en'  } },
] as const;

/** All KV slug strings, derived from the categories above. */
export const ALL_SLUGS: readonly string[] = Array.from(new Set(
  MENU_CATEGORIES.flatMap(c => [c.slugs.he, c.slugs.en]),
));
