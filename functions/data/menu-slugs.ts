// KV slug whitelist — the only strings accepted by /api/menu/[slug] and
// /admin/save. Mirrors `MENU_CATEGORIES` in src/data/menu-spec.ts.
// (Functions can't import from src/, so this is the canonical copy for the
// worker side. Keep in sync if you add a new menu category.)

export const VALID_SLUGS: ReadonlySet<string> = new Set([
  'he',       'en',
  'dessert',  'dessert_en',
  'wine',     'wine_en',
  'cocktails',
  'events',   'events_en',
]);
