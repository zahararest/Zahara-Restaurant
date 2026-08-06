// Server-side palette helpers — shared by:
//   • functions/api/palette.ts       (GET, public)
//   • functions/admin/colors/save.ts (POST, auth-gated)
//   • functions/_middleware.ts       (injects into every HTML response)
//
// Storage:
//   Preferred binding is PALETTE_DATA (dedicated KV namespace). When that
//   binding is missing we fall back to MENU_DATA under the reserved key
//   `__palette__` so the feature still works on installs that only have a
//   single KV namespace configured.
//
// Shape:
//   The palette is a PAIR — separate token maps for light and dark themes,
//   so the colour editor can tune BOTH. On the page they layer as:
//     :root { …light… }                 (the default theme)
//     html[data-theme="dark"] { …dark… } (wins by specificity when dark)
//   Older installs stored a single flat `{ "--token": "#hex" }` record
//   (light only) — readPalette migrates that to `{ light: <flat>, dark: {} }`.

import type { KVNamespace } from '@cloudflare/workers-types';
import { siteScope, type Site, type SiteBindings, type PaletteTarget } from './site';

// Widened to every binding (both venues); a superset of the old shape, so
// existing callers keep working.
export type PaletteEnv = SiteBindings;

export type ThemeMap   = Record<string, string>;
export interface PalettePair { light: ThemeMap; dark: ThemeMap }

/** This venue's primary palette store (dedicated namespace preferred). */
export function pickKv(env: PaletteEnv, site: Site = 'zahara'): PaletteTarget | null {
  return siteScope(env, site).palette;
}

/** Whitelist of CSS custom properties the colour editor is allowed to
 *  persist. Anything outside this set is dropped on write — keeps the
 *  KV record tight and stops a curious request from injecting arbitrary
 *  custom properties site-wide. Same set applies to light and dark. */
export const ALLOWED_TOKENS: ReadonlySet<string> = new Set([
  '--paper', '--paper-deep', '--paper-edge', '--paper-card', '--paper-on-photo',
  '--ink',   '--ink-soft',   '--ink-muted',  '--ink-faint',
  '--rule',  '--rule-soft',
  '--accent','--accent-deep','--accent-soft',
  '--gold',
  '--ok',    '--err',
  '--shadow',
  '--events-band-from', '--events-band-to', '--events-band-text',
  '--events-band-num',  '--events-band-divider',
  '--tile-label', '--tile-num',
  '--bg-wash-from', '--bg-wash-to', '--bg-glow',
]);

/** Tokens stored as a bare NUMBER rather than a hex — the CSS that reads them
 *  supplies the unit (`calc(var(--bg-wash-angle) * 1deg)`). Kept separate so
 *  each one can be range-checked on write; out-of-range values are clamped
 *  rather than dropped, so a stale client can't wedge the page. Mirrors the
 *  `kind: 'scalar'` tokens in src/data/admin-colors.ts. */
export const SCALAR_TOKENS: Readonly<Record<string, { min: number; max: number }>> = {
  '--bg-wash-angle':     { min: 0, max: 360 },
  '--bg-glow-strength':  { min: 0, max: 40  },
  '--bg-grain-strength': { min: 0, max: 20  },
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Reduce arbitrary input to a clean record of `#RRGGBB` colours and
 *  in-range numeric scalars. Anything else is dropped. */
export function sanitiseThemeMap(input: unknown): ThemeMap {
  const out: ThemeMap = {};
  if (!input || typeof input !== 'object') return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (typeof v !== 'string' && typeof v !== 'number') continue;
    const range = SCALAR_TOKENS[k];
    if (range) {
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      out[k] = String(Math.round(Math.min(range.max, Math.max(range.min, n))));
      continue;
    }
    if (!ALLOWED_TOKENS.has(k))      continue;
    if (typeof v !== 'string')       continue;
    if (!HEX.test(v))                continue;
    out[k] = v.toUpperCase();
  }
  return out;
}

/** Backwards-compatible alias — older callers used `sanitisePalette`. */
export const sanitisePalette = sanitiseThemeMap;

/** Normalise any stored / posted value into a `{ light, dark }` pair.
 *  Accepts the new pair shape, or an old flat record (treated as light). */
export function sanitisePalettePair(input: unknown): PalettePair {
  if (input && typeof input === 'object') {
    const obj = input as Record<string, unknown>;
    const looksLikePair =
      ('light' in obj || 'dark' in obj) &&
      !Object.keys(obj).some((k) => k.startsWith('--'));
    if (looksLikePair) {
      return {
        light: sanitiseThemeMap(obj.light),
        dark:  sanitiseThemeMap(obj.dark),
      };
    }
  }
  // Old flat shape (or anything else) → light only.
  return { light: sanitiseThemeMap(input), dark: {} };
}

/** Read a palette pair from one target (null-safe). */
async function readPaletteFrom(target: PaletteTarget | null): Promise<PalettePair> {
  if (!target) return { light: {}, dark: {} };
  try {
    // cacheTtl=600: palette changes at most once per admin session; cache at
    // the Cloudflare edge for 10 minutes to avoid a KV read on every page load.
    const raw = await target.kv.get(target.key, { type: 'json', cacheTtl: 600 });
    return sanitisePalettePair(raw);
  } catch {
    return { light: {}, dark: {} };
  }
}

/** Per-token merge for the DISPLAY fallback: `over` (this venue's own tokens)
 *  wins per token over `base` (Zahara), so rooftop can restyle a single colour
 *  and inherit the rest of Zahara's palette. */
function mergePairForDisplay(base: PalettePair, over: PalettePair): PalettePair {
  return {
    light: { ...base.light, ...over.light },
    dark:  { ...base.dark,  ...over.dark  },
  };
}

/** This venue's OWN palette — no cross-venue fallback (admin colour editor). */
export async function readPaletteOwn(env: PaletteEnv, site: Site = 'zahara'): Promise<PalettePair> {
  return readPaletteFrom(siteScope(env, site).palette);
}

/** DISPLAY read. Zahara: its own palette. Rooftop: its own tokens layered over
 *  Zahara's palette, so an unstyled rooftop looks identical to Zahara. */
export async function readPalette(env: PaletteEnv, site: Site = 'zahara'): Promise<PalettePair> {
  const scope = siteScope(env, site);
  const own = await readPaletteFrom(scope.palette);
  if (!scope.paletteFb) return own;               // zahara — no fallback
  return mergePairForDisplay(await readPaletteFrom(scope.paletteFb), own);
}

export async function writePalette(
  env: PaletteEnv,
  site: Site,
  palette: unknown,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const target = siteScope(env, site).palette;    // OWN store only
  if (!target) return { ok: false, error: 'No KV binding configured' };
  const clean = sanitisePalettePair(palette);
  await target.kv.put(target.key, JSON.stringify(clean));
  return { ok: true, count: Object.keys(clean.light).length + Object.keys(clean.dark).length };
}

/** Serialise one token map to a CSS declaration body — `--paper:#FFF;--ink:#000`. */
function mapToBody(map: ThemeMap): string {
  return Object.entries(map).map(([k, v]) => `${k}:${v}`).join(';');
}

/** Serialise the palette pair to inline CSS the middleware drops into
 *  `<head>`:
 *    :root{…light…}html[data-theme="dark"]{…dark…}
 *  Empty blocks are skipped. Returns an empty string when there are no
 *  overrides at all, so the middleware can skip injection entirely. */
export function paletteToCss(palette: PalettePair): string {
  let css = '';
  const lightBody = mapToBody(palette.light || {});
  const darkBody  = mapToBody(palette.dark  || {});
  if (lightBody) css += `:root{${lightBody}}`;
  if (darkBody)  css += `html[data-theme="dark"]{${darkBody}}`;
  return css;
}
