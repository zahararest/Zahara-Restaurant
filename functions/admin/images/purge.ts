// POST /admin/images/purge — Basic-auth gated.
// Iterates every catalogued filename and drops it from the colo cache.
// Useful when a visitor reports a stale photo: the admin can force the
// local edge to refetch from R2 without waiting for max-age.

import type { PagesFunction } from '@cloudflare/workers-types';
import { checkAuth, type AuthEnv } from '../auth';
import { purgeAllPhotoCache } from './cache';

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(status === 401 ? { 'WWW-Authenticate': 'Basic realm="Admin"' } : {}),
    },
  });
}

export const onRequestPost: PagesFunction<AuthEnv> = async ({ request, env }) => {
  if (!checkAuth(request, env)) return json({ ok: false, error: 'Unauthorized' }, 401);
  const origin = new URL(request.url).origin;
  const count = await purgeAllPhotoCache(origin);
  return json({ ok: true, count });
};
