// POST /admin/menu-visibility — Cloudflare Access gated.
// Body: JSON { off: ["dessert", …] } — the menu categories this venue does
// NOT use. Saved to the venue's own KV record; the menu editor greys them out
// and the middleware tells the public pages to drop those tabs.

import type { PagesFunction } from '@cloudflare/workers-types';
import { checkAccess, type AuthEnv } from './auth';
import { readMenusOff, writeMenusOff, sanitiseMenusOff, type MenuVisEnv } from '../data/menu-visibility';
import { adminSite } from '../data/site';

type Env = AuthEnv & MenuVisEnv;

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return json({ ok: false, error: 'Unauthorized' }, 401);
  return json({ ok: true, off: await readMenusOff(env, adminSite(request)) });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return json({ ok: false, error: 'Unauthorized' }, 401);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'Expected JSON body' }, 400); }

  const off = sanitiseMenusOff((body as { off?: unknown })?.off);
  const ok  = await writeMenusOff(env, adminSite(request), off);
  if (!ok) return json({ ok: false, error: 'No KV namespace bound for this venue' }, 500);
  return json({ ok: true, off });
};
