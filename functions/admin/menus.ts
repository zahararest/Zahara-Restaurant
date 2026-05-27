// Admin sidebar configuration — the single source of truth for which menus
// the admin can edit and how their HE/EN sub-tabs are organized.

export interface MenuVariant {
  key:   'he' | 'en';
  slug:  string;
  label: string;
  dir:   'rtl' | 'ltr';
}

export interface MenuTypeWithVariants {
  id:        string;
  label:     string;
  variants:  MenuVariant[];
}

export interface MenuTypeSingle {
  id:        string;
  label:     string;
  slug:      string;
  dir:       'rtl' | 'ltr';
}

export type MenuType = MenuTypeWithVariants | MenuTypeSingle;

/**
 * All menus follow the "variants" pattern (HE/EN sub-tabs).
 * Cocktails is the one exception — by design, each card shows both
 * languages, so it has a single slug instead of variants.
 *
 * Labels are English (admin chrome is English LTR); the variant labels
 * tell the editor which language file they're currently looking at. The
 * data inside each variant stays in its native language — the Hebrew
 * tab holds Hebrew copy, the English tab holds English copy.
 */
export const MENU_TYPES: MenuType[] = [
  { id: 'food',    label: 'Food',      variants: [
    { key: 'he', slug: 'he',         label: 'Hebrew',  dir: 'rtl' },
    { key: 'en', slug: 'en',         label: 'English', dir: 'ltr' },
  ]},
  { id: 'dessert', label: 'Desserts',  variants: [
    { key: 'he', slug: 'dessert',    label: 'Hebrew',  dir: 'rtl' },
    { key: 'en', slug: 'dessert_en', label: 'English', dir: 'ltr' },
  ]},
  { id: 'wine',    label: 'Wine',      variants: [
    { key: 'he', slug: 'wine',       label: 'Hebrew',  dir: 'rtl' },
    { key: 'en', slug: 'wine_en',    label: 'English', dir: 'ltr' },
  ]},
  { id: 'cocktails', label: 'Cocktails', slug: 'cocktails', dir: 'ltr' },
  { id: 'events',  label: 'Events',    variants: [
    { key: 'he', slug: 'events',     label: 'Hebrew',  dir: 'rtl' },
    { key: 'en', slug: 'events_en',  label: 'English', dir: 'ltr' },
  ]},
];
