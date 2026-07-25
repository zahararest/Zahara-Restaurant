// Centralized path builders. Every page-to-page link in the site goes through
// this module — never hand-build a path like `/en${path}` in a component.
//
// HE is hosted at the root (`/menu/`); EN is mirrored under `/en/` (`/en/menu/`).

import type { Lang } from '../data/i18n';
import { BASE, withBase } from './base';

export type RouteKey = 'home' | 'menu' | 'events' | 'about' | 'accessibility' | 'privacy';
export type NavKey = 'menu' | 'events' | 'about';

const SEGMENTS: Record<RouteKey, string> = {
  home:          '',
  menu:          'menu',
  events:        'events',
  about:         'about',
  accessibility: 'accessibility',
  privacy:       'privacy',
};

export function path(key: RouteKey, lang: Lang): string {
  const seg      = SEGMENTS[key];
  const langBase = lang === 'he' ? '/' : '/en/';
  // withBase() prefixes the venue base (''=Zahara, '/rooftop'=rooftop) so nav
  // links keep the visitor inside the venue they're browsing.
  return withBase(seg ? `${langBase}${seg}/` : langBase);
}

/** Mirror of the current URL in the opposite language. `currentPath` is the
 *  live pathname, which INCLUDES the venue base on rooftop — so strip the base,
 *  flip the language, then re-apply the base. */
export function altLangHref(currentPath: string, lang: Lang): string {
  const rel = currentPath.startsWith(BASE) ? (currentPath.slice(BASE.length) || '/') : currentPath;
  let alt: string;
  if (lang === 'he') {
    alt = rel === '/' ? '/en/' : `/en${rel}`;
  } else {
    const stripped = rel.replace(/^\/en/, '') || '/';
    alt = stripped.endsWith('/') ? stripped : `${stripped}/`;
  }
  return withBase(alt);
}

/** All site routes, in nav order — consumed by the header. */
export const NAV_ORDER: NavKey[] = ['menu', 'events', 'about'];
