// POST /admin/content/save — Basic-auth gated.
// Body: JSON { map: { [key]: { he?, en? } } } (full or partial).
//
// Merges the posted map into the single KV content record. A posted lang
// value that is an empty string clears that override; a missing lang is
// left untouched. Used by both the Content editor and the per-photo gallery
// caption inputs in /admin/images.

import type { PagesFunction } from '@cloudflare/workers-types';
import { checkAccess, type AuthEnv } from '../auth';
import { readContent, writeContent, mergeContent, type ContentEnv } from '../../data/content';

type Env = AuthEnv & ContentEnv;

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(status === 401 ? { 'WWW-Authenticate': 'Basic realm="Admin"' } : {}),
    },
  });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return json({ ok: false, error: 'Unauthorized' }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Expected JSON body' }, 400);
  }

  const posted = (body && typeof body === 'object' && 'map' in body)
    ? (body as { map: unknown }).map
    : body;

  const existing = await readContent(env);
  const merged   = mergeContent(existing, posted);

  const ok = await writeContent(env, merged);
  if (!ok) return json({ ok: false, error: 'No KV namespace bound (MENU_DATA / PALETTE_DATA)' }, 500);

  return json({ ok: true, count: Object.keys(merged).length });
};
