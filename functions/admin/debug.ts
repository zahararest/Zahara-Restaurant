// TEMPORARY — delete after diagnosing auth.
// GET /admin/debug — shows what env vars the worker actually sees.
// No auth required (it's the point — we need to see why auth fails).
import type { PagesFunction } from '@cloudflare/workers-types';

export const onRequestGet: PagesFunction<Record<string, string>> = async ({ request, env }) => {
  const auth  = request.headers.get('Authorization') ?? '(none)';
  const user  = env.ADMIN_USER     ? `set (${env.ADMIN_USER.length} chars)`     : 'MISSING';
  const pass  = env.ADMIN_PASSWORD ? `set (${env.ADMIN_PASSWORD.length} chars)` : 'MISSING';

  let decoded = '(no auth header)';
  if (auth.startsWith('Basic ')) {
    try { decoded = atob(auth.slice(6)); } catch { decoded = '(bad base64)'; }
  }

  return new Response(JSON.stringify({ user, pass, authHeader: auth, decoded }, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
