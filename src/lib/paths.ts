// Centralized path builders. Every page-to-page link in the site goes through
// this module — never hand-build a path like `/en${path}` in a component.
//
// HE is hosted at the root (`/menu/`); EN is mirrored under `/en/` (`/en/menu/`).

import type { Lang } from '../data/i18n';

export type RouteKey = 'menu' | 'events' | 'about';

const SEGMENTS: Record<RouteKey, string> = {
  menu:   'menu',
  events: 'events',
  about:  'about',
};

export function path(key: RouteKey, lang: Lang): string {
  const seg = SEGMENTS[key];
  const base = lang === 'he' ? '/' : '/en/';
  return seg ? `${base}${seg}/` : base;
}

/** Mirror of the current URL in the opposite language. */
export function altLangHref(currentPath: string, lang: Lang): string {
  if (lang === 'he') {
    return currentPath === '/' ? '/en/' : `/en${currentPath}`;
  }
  const stripped = currentPath.replace(/^\/en/, '') || '/';
  return stripped.endsWith('/') ? stripped : `${stripped}/`;
}

/** All site routes, in nav order — consumed by the header. */
export const NAV_ORDER: RouteKey[] = ['menu', 'events', 'about'];
