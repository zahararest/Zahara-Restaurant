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
    raw = await env.MENU_DATA.get(slug, 'json');
  } catch {
    /* KV unavailable in local dev — fall through to defaults */
  }

  let payload = coerce(raw);
  if (!payload.sections.length) {
    payload = { sections: DEFAULT_SECTIONS[slug] ?? [], date: null };
  }

  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type':  'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
};
