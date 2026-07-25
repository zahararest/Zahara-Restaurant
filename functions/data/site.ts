// ── Multi-site scope (Zahara + Nucha Rooftop) ───────────────────────────────
//
// The site runs TWO venues off one Pages project and one domain:
//   • zahara  — the restaurant, served at the root ( / , /en/ , /menu/ … ).
//   • rooftop — the rooftop bar, served under /rooftop ( /rooftop/ , /rooftop/en/ … ).
//
// Both render the EXACT same UI (same components, built twice — see
// package.json's `build`). Everything that differs between them is DATA, and
// every piece of data is isolated in its own binding:
//
//                    zahara (existing)          rooftop (new)
//   general KV       MENU_DATA / PALETTE_DATA   MENU_DATA_ROOFTOP / PALETTE_DATA_ROOFTOP
//   palette KV       PALETTE_DATA / MENU_DATA   PALETTE_DATA_ROOFTOP / MENU_DATA_ROOFTOP
//   image overrides  IMAGES (R2)                IMAGES_ROOFTOP (R2)
//   OneDrive creds   MENU_KV (SHARED — same OneDrive account, different links)
//
// Two rules keep the venues honest — this module is the single place they live:
//
//   1. SEPARATION. A write for a site NEVER touches the other site's store.
//      `scope.kv` / `scope.palette` / `scope.images` are the ONLY things a
//      write path may use. The `*Fb` (fallback) bindings are read-only.
//
//   2. FALLBACK ("show Zahara until Rooftop is edited"). A *display* read for
//      rooftop prefers the rooftop store and, per item, falls back to Zahara's
//      live value, then to the built-in code default. This is why a fresh
//      rooftop launches looking identical to Zahara and diverges one edit at a
//      time. The fallback is READ-ONLY and DISPLAY-ONLY: the admin editor reads
//      the site's OWN store (no fallback) so the save/diff logic can't bake
//      Zahara's current copy into Rooftop's store.

import type { KVNamespace, R2Bucket } from '@cloudflare/workers-types';

export type Site = 'zahara' | 'rooftop';
export const SITES: readonly Site[] = ['zahara', 'rooftop'] as const;
export const DEFAULT_SITE: Site = 'zahara';

/** URL path prefix under which the rooftop venue is served. */
export const ROOFTOP_PREFIX = '/rooftop';

/** Cookie the /admin panel uses to remember which venue is being edited. */
export const ADMIN_SITE_COOKIE = 'zahara_admin_site';

/** Every binding both venues might use. Any function's Env can widen to this;
 *  the rooftop bindings are optional so installs without them still build. */
export interface SiteBindings {
  // Zahara (existing)
  MENU_DATA?:    KVNamespace;
  PALETTE_DATA?: KVNamespace;
  IMAGES?:       R2Bucket;
  // Rooftop (new)
  MENU_DATA_ROOFTOP?:    KVNamespace;
  PALETTE_DATA_ROOFTOP?: KVNamespace;
  IMAGES_ROOFTOP?:       R2Bucket;
}

export function isSite(v: unknown): v is Site {
  return v === 'zahara' || v === 'rooftop';
}

/** Resolve the venue from a pathname. Rooftop pages live under /rooftop
 *  (dual-base build), so the prefix is authoritative for HTML requests. */
export function siteFromPath(pathname: string): Site {
  if (pathname === ROOFTOP_PREFIX || pathname.startsWith(ROOFTOP_PREFIX + '/')) return 'rooftop';
  return DEFAULT_SITE;
}

/** Resolve the venue for a request hitting a ROOT function (the API + asset
 *  routes are NOT duplicated under /rooftop — rooftop pages call them with an
 *  explicit `?site=rooftop`). Query wins; otherwise fall back to the path. */
export function siteFromRequest(request: Request): Site {
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get('site');
    if (isSite(q)) return q;
    return siteFromPath(url.pathname);
  } catch {
    return DEFAULT_SITE;
  }
}

/** Which venue the /admin panel is currently editing, from its cookie. */
export function adminSite(request: Request): Site {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${ADMIN_SITE_COOKIE}=(rooftop|zahara)`));
  return m ? (m[1] as Site) : DEFAULT_SITE;
}

/** Append `?site=rooftop` (or `&site=…`) to a root API/asset URL when needed.
 *  Zahara URLs are left untouched so nothing about the existing site changes. */
export function withSiteParam(url: string, site: Site): string {
  if (site === DEFAULT_SITE) return url;
  return url + (url.includes('?') ? '&' : '?') + 'site=' + site;
}

// ── Resolved bindings for one venue ─────────────────────────────────────────

export interface PaletteTarget { kv: KVNamespace; key: string }

const PALETTE_KEY_DEDICATED = 'palette';
const PALETTE_KEY_FALLBACK  = '__palette__';

/** The general-purpose KV for a venue (content, popup, asset-version, and the
 *  menu slugs all live here). Prefers the main namespace, falls back to the
 *  palette namespace on single-namespace installs. */
function generalKv(env: SiteBindings, site: Site): KVNamespace | null {
  return site === 'rooftop'
    ? (env.MENU_DATA_ROOFTOP ?? env.PALETTE_DATA_ROOFTOP ?? null)
    : (env.MENU_DATA ?? env.PALETTE_DATA ?? null);
}

/** The palette KV + key for a venue (dedicated namespace preferred). */
function paletteTarget(env: SiteBindings, site: Site): PaletteTarget | null {
  if (site === 'rooftop') {
    if (env.PALETTE_DATA_ROOFTOP) return { kv: env.PALETTE_DATA_ROOFTOP, key: PALETTE_KEY_DEDICATED };
    if (env.MENU_DATA_ROOFTOP)    return { kv: env.MENU_DATA_ROOFTOP,    key: PALETTE_KEY_FALLBACK  };
    return null;
  }
  if (env.PALETTE_DATA) return { kv: env.PALETTE_DATA, key: PALETTE_KEY_DEDICATED };
  if (env.MENU_DATA)    return { kv: env.MENU_DATA,    key: PALETTE_KEY_FALLBACK  };
  return null;
}

function imagesBucket(env: SiteBindings, site: Site): R2Bucket | null {
  return site === 'rooftop' ? (env.IMAGES_ROOFTOP ?? null) : (env.IMAGES ?? null);
}

/** Everything a request needs for one venue: its own stores (`kv`, `palette`,
 *  `images`) plus the read-only Zahara fallbacks (`*Fb`, null for Zahara).
 *  Writes MUST use only the non-Fb members. */
export interface Scope {
  site:      Site;
  kv:        KVNamespace | null;
  kvFb:      KVNamespace | null;
  palette:   PaletteTarget | null;
  paletteFb: PaletteTarget | null;
  images:    R2Bucket | null;
  imagesFb:  R2Bucket | null;
}

export function siteScope(env: SiteBindings, site: Site): Scope {
  const isRoof = site === 'rooftop';
  return {
    site,
    kv:        generalKv(env, site),
    kvFb:      isRoof ? generalKv(env, 'zahara') : null,
    palette:   paletteTarget(env, site),
    paletteFb: isRoof ? paletteTarget(env, 'zahara') : null,
    images:    imagesBucket(env, site),
    imagesFb:  isRoof ? imagesBucket(env, 'zahara') : null,
  };
}
