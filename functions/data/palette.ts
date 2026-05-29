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

import type { KVNamespace } from '@cloudflare/workers-types';

export interface PaletteEnv {
  PALETTE_DATA?: KVNamespace;
  MENU_DATA?:    KVNamespace;
}

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
 *  custom properties site-wide. */
export const ALLOWED_TOKENS: ReadonlySet<string> = new Set([
  '--paper', '--paper-deep', '--paper-edge', '--paper-card', '--paper-on-photo',
  '--ink',   '--ink-soft',   '--ink-muted',  '--ink-faint',
  '--rule',  '--rule-soft',
  '--accent','--accent-deep','--accent-soft',
  '--gold',  '--c-green',    '--c-teal',     '--c-slate', '--c-mauve',
  '--ok',    '--err',
]);

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Reduce arbitrary input to a clean `{ "--token": "#RRGGBB" }` record. */
export function sanitisePalette(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!input || typeof input !== 'object') return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!ALLOWED_TOKENS.has(k))       continue;
    if (typeof v !== 'string')        continue;
    if (!HEX.test(v))                 continue;
    out[k] = v.toUpperCase();
  }
  return out;
}

export async function readPalette(env: PaletteEnv): Promise<Record<string, string>> {
  const target = pickKv(env);
  if (!target) return {};
  try {
    const raw = await target.kv.get(target.key, 'json');
    return sanitisePalette(raw);
  } catch {
    return {};
  }
}

export async function writePalette(
  env: PaletteEnv,
  palette: Record<string, string>,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const target = pickKv(env);
  if (!target) return { ok: false, error: 'No KV binding configured' };
  const clean = sanitisePalette(palette);
  await target.kv.put(target.key, JSON.stringify(clean));
  return { ok: true, count: Object.keys(clean).length };
}

/** Serialise the palette to inline CSS the middleware can drop into
 *  `<head>` — `:root{--paper:#FFF;--ink:#000;}`. Returns an empty
 *  string when there are no overrides, so the middleware can skip
 *  the injection entirely. */
export function paletteToCss(palette: Record<string, string>): string {
  const entries = Object.entries(palette);
  if (entries.length === 0) return '';
  const body = entries.map(([k, v]) => `${k}:${v}`).join(';');
  return `:root{${body}}`;
}
