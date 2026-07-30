// Which menu categories a venue actually uses.
//
// The rooftop bar doesn't serve the same menus as the restaurant — it might
// want cocktails and wine and nothing else. Rather than fork the menu spec per
// venue, each venue stores the list of categories it has switched OFF:
//
//   KV `__menus_off__` → ["dessert", "events"]
//
// Read by:
//   • functions/admin/index.ts   — the menu editor greys those out.
//   • functions/_middleware.ts   — injects the list into every page, and the
//                                  menu embed / home tiles drop those tabs.
//
// There is deliberately NO cross-venue fallback: a rooftop that has never
// touched this setting uses every menu, exactly like Zahara. Falling back to
// Zahara's list would be backwards (rooftop turns menus OFF, not on).

import type { KVNamespace } from '@cloudflare/workers-types';
import { siteScope, type Site, type SiteBindings } from './site';

export type MenuVisEnv = SiteBindings;

const KEY = '__menus_off__';

/** Every category id that can be switched off. Mirrors the ids in
 *  functions/admin/menus.ts (admin) and src/data/menu-spec.ts (public). */
export const MENU_IDS = ['food', 'dessert', 'wine', 'cocktails', 'events'] as const;
export type MenuId = (typeof MENU_IDS)[number];
const VALID = new Set<string>(MENU_IDS);

/** Reduce arbitrary input to a clean list of switched-off category ids.
 *  Everything switched off would leave the menu page empty, so the last one
 *  standing is always kept. */
export function sanitiseMenusOff(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const off = Array.from(new Set(input.filter((x): x is string => typeof x === 'string' && VALID.has(x))));
  const publicIds = MENU_IDS.filter((id) => id !== 'events');
  if (publicIds.every((id) => off.includes(id))) off.splice(off.indexOf(publicIds[0]), 1);
  return off;
}

async function readFrom(kv: KVNamespace | null): Promise<string[] | null> {
  if (!kv) return null;
  try {
    const raw = await kv.get(KEY);
    return raw ? sanitiseMenusOff(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** The categories this venue has switched off (empty = it uses them all). */
export async function readMenusOff(env: MenuVisEnv, site: Site = 'zahara'): Promise<string[]> {
  return (await readFrom(siteScope(env, site).kv)) ?? [];
}

export async function writeMenusOff(env: MenuVisEnv, site: Site, off: unknown): Promise<boolean> {
  const kv = siteScope(env, site).kv;
  if (!kv) return false;
  await kv.put(KEY, JSON.stringify(sanitiseMenusOff(off)));
  return true;
}
