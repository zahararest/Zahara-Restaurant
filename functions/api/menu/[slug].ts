// GET /api/menu/[slug] — returns { date, sections } for a menu slug.
// Falls back to DEFAULT_SECTIONS when KV has no entry yet.

import type { PagesFunction, KVNamespace } from '@cloudflare/workers-types';
import { VALID_SLUGS }        from '../../data/menu-slugs';
import {
  DEFAULT_SECTIONS,
  type MenuSection,
} from '../../data/menu-defaults';
import { siteFromRequest, siteScope, type SiteBindings } from '../../data/site';

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

/** cacheTtl=60: Cloudflare caches the KV read for 60 s at the edge. */
async function readSlug(kv: KVNamespace | null, slug: string): Promise<unknown> {
  if (!kv) return null;
  try {
    return await kv.get(slug, { type: 'json', cacheTtl: 60 });
  } catch {
    return null;   // KV unavailable in local dev — caller falls back
  }
}

export const onRequestGet: PagesFunction<SiteBindings> = async ({ params, env, request }) => {
  const slug = (params.slug as string).toLowerCase();
  if (!VALID_SLUGS.has(slug)) return new Response('Not found', { status: 404 });

  const scope = siteScope(env, siteFromRequest(request));

  // This venue's own menu first.
  let payload = coerce(await readSlug(scope.kv, slug));
  // Rooftop hasn't published this menu yet → show Zahara's until it does.
  if (!payload.sections.length && scope.kvFb) {
    payload = coerce(await readSlug(scope.kvFb, slug));
  }
  // Neither venue has it → the built-in default.
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
