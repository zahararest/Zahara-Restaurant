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

export interface PaletteEnv {
  PALETTE_DATA?: KVNamespace;
  MENU_DATA?:    KVNamespace;
}

export type ThemeMap   = Record<string, string>;
export interface PalettePair { light: ThemeMap; dark: ThemeMap }

const KEY_DEDICATED = 'palette';
const KEY_FALLBACK  = '__palette__';

export function pickKv(env: PaletteEnv): { kv: KVNamespace; key: string } | null {
  if (env.PALETTE_DATA) return { kv: env.PALETTE_DATA, key: KEY_DEDICATED };
  if (env.MENU_DATA)    return { kv: env.MENU_DATA,    key: KEY_FALLBACK  };
  return null;
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
  '--gold',  '--c-green',    '--c-teal',     '--c-slate', '--c-mauve',
  '--ok',    '--err',
  '--shadow',
  '--cinema-eyebrow', '--cinema-num',       '--cinema-title',
  '--cinema-item-name', '--cinema-item-desc', '--cinema-item-price',
  '--cinema-divider', '--cinema-count',     '--cinema-cta',
]);

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Reduce arbitrary input to a clean `{ "--token": "#RRGGBB" }` record. */
export function sanitiseThemeMap(input: unknown): ThemeMap {
  const out: ThemeMap = {};
  if (!input || typeof input !== 'object') return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!ALLOWED_TOKENS.has(k))       continue;
    if (typeof v !== 'string')        continue;
    if (!HEX.test(v))                 continue;
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

export async function readPalette(env: PaletteEnv): Promise<PalettePair> {
  const target = pickKv(env);
  if (!target) return { light: {}, dark: {} };
  try {
    // cacheTtl=600: palette changes at most once per admin session; cache
    // at the Cloudflare edge for 10 minutes to avoid KV reads on every
    // HTML page request (the middleware calls this on every page load).
    const raw = await target.kv.get(target.key, { type: 'json', cacheTtl: 600 });
    return sanitisePalettePair(raw);
  } catch {
    return { light: {}, dark: {} };
  }
}

export async function writePalette(
  env: PaletteEnv,
  palette: unknown,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const target = pickKv(env);
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
