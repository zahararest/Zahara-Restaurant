// POST /admin/save — writes menu JSON to KV. Basic-auth gated.

import type { PagesFunction } from '@cloudflare/workers-types';
import { checkAccess, type AuthEnv } from './auth';
import { VALID_SLUGS }              from '../data/menu-slugs';
import type { MenuSection }         from '../data/menu-defaults';
import { adminSite, siteScope, type SiteBindings } from '../data/site';

type Env = AuthEnv & SiteBindings;

interface MenuPayload { date?: string | null; sections: MenuSection[] }

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(status === 401 ? { 'WWW-Authenticate': 'Basic realm="Admin"' } : {}),
    },
  });
}

/** Accept new shape `{date?, sections[]}` or legacy raw sections array. */
function normalize(raw: unknown): MenuPayload | null {
  if (Array.isArray(raw)) return { sections: raw as MenuSection[], date: null };
  if (raw && typeof raw === 'object' && Array.isArray((raw as MenuPayload).sections)) {
    const p = raw as MenuPayload;
    return { sections: p.sections, date: p.date ?? null };
  }
  return null;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return json({ ok: false, error: 'Unauthorized' }, 401);

  let body: { slug?: string; data?: unknown };
  try {
    body = await request.json() as { slug?: string; data?: unknown };
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const { slug, data } = body;
  if (!slug || !VALID_SLUGS.has(slug)) {
    return json({ ok: false, error: 'Invalid slug' }, 400);
  }

  const payload = normalize(data);
  if (!payload) {
    return json({ ok: false, error: 'data must be { sections: [] } or an array' }, 400);
  }

  // Write to the venue the admin is editing (its OWN menu KV — never the other
  // venue's). Rooftop is chosen via the admin site-switch cookie.
  const kv = siteScope(env, adminSite(request)).kv;
  if (!kv) return json({ ok: false, error: 'No menu KV bound for this venue' }, 500);

  await kv.put(slug, JSON.stringify(payload));
  return json({ ok: true });
};
