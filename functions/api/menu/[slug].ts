// GET /api/menu/[slug] — returns { date, sections } for a menu slug.
// Falls back to DEFAULT_SECTIONS when KV has no entry yet.

import type { PagesFunction } from '@cloudflare/workers-types';
import { VALID_SLUGS }        from '../../data/menu-slugs';
import {
  DEFAULT_SECTIONS,
  type MenuSection,
} from '../../data/menu-defaults';

interface Env {
  MENU_DATA: KVNamespace;
}

interface MenuPayload {
  date?:    string | null;
  sections: MenuSection[];
}

/** Read-side coercion: support legacy raw-array data and new `{date,sections}`. */
function coerce(raw: unknown): MenuPayload {
  if (Array.isArray(raw)) return { sections: raw as MenuSection[] };
  if (raw && typeof raw === 'object' && Array.isArray((raw as MenuPayload).sections)) {
    return raw as MenuPayload;
  }
  return { sections: [] };
}

export const onRequestGet: PagesFunction<Env> = async ({ params, env }) => {
  const slug = (params.slug as string).toLowerCase();
  if (!VALID_SLUGS.has(slug)) return new Response('Not found', { status: 404 });

  let raw: unknown = null;
  try {
    // cacheTtl=60: Cloudflare caches this KV read for 60 s at the edge,
    // avoiding a round-trip to KV storage on every request.
    raw = await env.MENU_DATA.get(slug, { type: 'json', cacheTtl: 60 });
  } catch {
    /* KV unavailable in local dev — fall through to defaults */
  }

  let payload = coerce(raw);
  if (!payload.sections.length) {
    payload = { sections: DEFAULT_SECTIONS[slug] ?? [], date: null };
  }

  // Cache at Cloudflare edge for 60 s; browsers revalidate in background
  // (stale-while-revalidate) so subsequent loads are instant. Admin writes
  // will take up to 60 s to propagate to uncached visitors — acceptable
  // for a menu that changes at most once per service period.
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type':  'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    },
  });
};
