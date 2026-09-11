// Optional page sections the owner can switch on and off.
//
// Some work lands on the site before it is ready to be seen: a new band on the
// Events page with copy still being written, photographs still being chosen. It
// has to be built, deployed and previewable — but not by visitors.
//
// Feature-flagging that in the code would mean a redeploy to reveal it, and a
// second one to hide it again if it isn't right. So it is a switch, stored per
// venue in one tiny KV record, exactly like the menus a venue doesn't use:
//
//   `__sections__` → { "eventsExtras": true }
//
// Absent or false means hidden. The middleware injects the on-list into every
// page, and the section reveals itself before first paint — so a visitor never
// sees an unfinished band flash into view, and the owner sees the switch take
// effect on the next reload rather than the next deploy.

import type { KVNamespace } from '@cloudflare/workers-types';
import { siteScope, type Site, type SiteBindings } from './site';

export type SectionEnv = SiteBindings;

const KEY = '__sections__';

/** Every switchable section. A section not listed here cannot be turned on —
 *  the id is part of the code that renders it, so an unknown id in KV is a
 *  stale record, not a section. */
export const SECTIONS = [
  {
    id:    'eventsExtras',
    /** Which /admin/content page tab shows this switch — stated, not inferred
     *  from the id, so renaming one never quietly moves the other. */
    page:  'events',
    label: 'The longer events section',
    note:  'The vertical film, the three photographs and the "how an evening works" notes on the Events page. '
         + 'Off until you switch it on — visitors see the page exactly as it is today.',
  },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];
const VALID = new Set<string>(SECTIONS.map((s) => s.id));

export type SectionMap = Record<string, boolean>;

export function sanitiseSections(input: unknown): SectionMap {
  const out: SectionMap = {};
  if (!input || typeof input !== 'object') return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (VALID.has(k) && v === true) out[k] = true;
  }
  return out;
}

async function readFrom(kv: KVNamespace | null): Promise<SectionMap | null> {
  if (!kv) return null;
  try {
    const raw = await kv.get(KEY);
    return raw ? sanitiseSections(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Which optional sections this venue shows. No cross-venue fallback: a
 *  section Zahara has switched on is not thereby on at the rooftop, whose copy
 *  and photographs for it may not exist yet. */
export async function readSections(env: SectionEnv, site: Site = 'zahara'): Promise<SectionMap> {
  return (await readFrom(siteScope(env, site).kv)) ?? {};
}

export async function writeSections(env: SectionEnv, site: Site, input: unknown): Promise<boolean> {
  const kv = siteScope(env, site).kv;
  if (!kv) return false;
  await kv.put(KEY, JSON.stringify(sanitiseSections(input)));
  return true;
}

/** The ids that are on, for embedding in a <script type="application/json">. */
export function sectionsToJson(map: SectionMap): string {
  return JSON.stringify({ on: Object.keys(map) }).replace(/</g, '\\u003c');
}
