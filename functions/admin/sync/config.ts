// GET  /admin/menu-sync/config — current sync config (schedule + per-menu sources).
// POST /admin/menu-sync/config — apply a config patch (schedule, links).
// Access-gated, like the rest of /admin/*.

import type { PagesFunction } from '@cloudflare/workers-types';
import { checkAccess, type AuthEnv } from '../auth';
import { readConfig, applyConfigPatch, type SyncEnv } from '../../data/menu-sync';

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

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return json({ ok: false, error: 'Unauthorized' }, 401);
  const config = await readConfig(env);
  return json({ ok: true, config });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return json({ ok: false, error: 'Unauthorized' }, 401);

  let patch: Parameters<typeof applyConfigPatch>[1];
  try {
    patch = await request.json() as typeof patch;
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const config = await applyConfigPatch(env, patch);
  return json({ ok: true, config });
};
