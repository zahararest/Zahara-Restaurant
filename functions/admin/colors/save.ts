// POST /admin/colors/save — writes the site palette to KV. Basic-auth
// gated using the same shared admin credentials as /admin/save and
// /admin/images/*.
//
// The request body is a JSON object of token → hex:
//   { "--accent": "#9C4621", "--ink": "#1A1410", ... }
// Anything not in the allow-list is dropped silently; anything that
// isn't a valid 6-digit hex is dropped silently. The whole document is
// REPLACED on each save (it's small — ~20 tokens — so this is cheaper
// than diffing).

import type { PagesFunction } from '@cloudflare/workers-types';
import { checkAuth, type AuthEnv } from '../auth';
import { writePalette, type PaletteEnv } from '../../data/palette';

type Env = AuthEnv & PaletteEnv;

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(status === 401 ? { 'WWW-Authenticate': 'Basic realm="Admin"' } : {}),
    },
  });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!checkAuth(request, env)) return json({ ok: false, error: 'Unauthorized' }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const result = await writePalette(env, body as Record<string, unknown>);
  return json(result, result.ok ? 200 : 500);
};
