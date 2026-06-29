// POST /admin/menu-sync/run — "Sync now". Body { slug?: string }.
//   • no slug → sync every menu that has a OneDrive link
//   • slug    → sync just that menu
// Access-gated. Returns per-slug results and the refreshed config.

import type { PagesFunction } from '@cloudflare/workers-types';
import { checkAccess, type AuthEnv } from '../auth';
import { syncMenus, readConfig, type SyncEnv } from '../../data/menu-sync';
import { VALID_SLUGS } from '../../data/menu-slugs';

type Env = AuthEnv & SyncEnv;

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type':  'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(status === 401 ? { 'WWW-Authenticate': 'Basic realm="Admin"' } : {}),
    },
  });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return json({ ok: false, error: 'Unauthorized' }, 401);

  let body: { slug?: string } = {};
  try { body = await request.json() as { slug?: string }; } catch { /* allow empty body = sync all */ }

  const slug = body.slug?.trim();
  if (slug && !VALID_SLUGS.has(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);

  const run    = await syncMenus(env, slug ? [slug] : undefined);
  const config = await readConfig(env);
  return json({ ...run, config }, run.ok ? 200 : 207);
};
