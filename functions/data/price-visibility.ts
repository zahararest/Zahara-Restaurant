// Which menus a venue shows WITHOUT prices.
//
// Some menus read better without numbers — a rooftop cocktail list, a wine list
// while prices are being revised, a set menu. Each venue stores the menus whose
// prices it hides, the same way it stores the menus it doesn't use at all:
//
//   KV `__prices_off__` → ["cocktails", "wine"]
//
// This is a DISPLAY choice. The prices stay in the menu data — the menu editor
// loads and saves them through /api/menu like always, so stripping them there
// would wipe them on the next save. The menu page leaves them out and lays the
// menu out as a list without a price column (see src/components/MenuEmbed.astro).
//
// Read by:
//   • functions/admin/index.ts   — the menu editor's Prices panel.
//   • functions/_middleware.ts   — injects the list into the menu page, inside
//                                  the same <script id="zahara-menus"> tag as the
//                                  menus a venue doesn't use.
//
// No cross-venue fallback: a venue with no record shows every price, which is
// what both venues did before this existed.

import type { KVNamespace } from '@cloudflare/workers-types';
import { MENU_IDS } from './menu-visibility';
import { siteScope, type Site, type SiteBindings } from './site';

export type PriceVisEnv = SiteBindings;

const KEY = '__prices_off__';
const VALID = new Set<string>(MENU_IDS);

/** Reduce arbitrary input to a clean list of menu ids, in menu order. */
export function sanitisePricesOff(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const ids = input.filter((x): x is string => typeof x === 'string' && VALID.has(x));
  return MENU_IDS.filter((id) => ids.includes(id));
}

async function readFrom(kv: KVNamespace | null): Promise<string[] | null> {
  if (!kv) return null;
  try {
    const raw = await kv.get(KEY);
    return raw ? sanitisePricesOff(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** The menus this venue shows without prices (empty = prices everywhere). */
export async function readPricesOff(env: PriceVisEnv, site: Site = 'zahara'): Promise<string[]> {
  return (await readFrom(siteScope(env, site).kv)) ?? [];
}

/** Store the list and return what was actually stored. */
export async function writePricesOff(env: PriceVisEnv, site: Site, input: unknown): Promise<string[] | null> {
  const kv = siteScope(env, site).kv;
  if (!kv) return null;
  const off = sanitisePricesOff(input);
  await kv.put(KEY, JSON.stringify(off));
  return off;
}
