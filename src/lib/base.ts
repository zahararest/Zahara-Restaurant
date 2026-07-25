// Venue base helpers for the dual-base build.
//
// The site is built TWICE from the same source (see package.json `build`):
//   • Zahara  — base '/'         → import.meta.env.BASE_URL === '/'
//   • Rooftop — base '/rooftop'  → import.meta.env.BASE_URL === '/rooftop/'
//
// Astro automatically prefixes its OWN emitted asset URLs (the /_astro bundles)
// with the base, but NOT hand-built href/src strings. Everything the site
// constructs by hand — nav links, the /photos image URLs — goes through the
// helpers here so it lands under the correct venue.

const RAW = import.meta.env.BASE_URL || '/';

/** '' for Zahara, '/rooftop' for the rooftop build (no trailing slash). */
export const BASE: string = RAW.endsWith('/') ? RAW.slice(0, -1) : RAW;

export const IS_ROOFTOP: boolean = BASE === '/rooftop';

/** The venue id this build serves — matches the Site type in functions/data/site.ts. */
export const SITE_ID: 'zahara' | 'rooftop' = IS_ROOFTOP ? 'rooftop' : 'zahara';

/** Query fragment for the ROOT API/asset routes (which are NOT duplicated under
 *  /rooftop). `&site=rooftop` on the rooftop build, empty on Zahara. Meant to be
 *  appended AFTER an existing `?…` query (e.g. the image ?v= cache-buster). */
export const SITE_QUERY_AMP: string = IS_ROOFTOP ? '&site=rooftop' : '';

/** Same, as a standalone `?site=…` for URLs that have no query yet. */
export const SITE_QUERY: string = IS_ROOFTOP ? '?site=rooftop' : '';

/** Prefix an absolute in-app path with the venue base:
 *    Zahara  : '/menu/' → '/menu/'
 *    Rooftop : '/menu/' → '/rooftop/menu/'
 *  Leaves non-absolute paths (mailto:, https:, #…) untouched. */
export function withBase(path: string): string {
  if (!path.startsWith('/')) return path;
  return BASE + path;
}
