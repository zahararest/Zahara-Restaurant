// POST /admin/price-visibility — Cloudflare Access gated.
// Body: JSON { off: ["cocktails", …] } — the menus this venue shows without
// prices. Saved to the venue's own KV record; the menu page leaves those
// prices out and drops the price column. See functions/data/price-visibility.ts.

import type { PagesFunction } from '@cloudflare/workers-types';
import { checkAccess, type AuthEnv } from './auth';
import { readPricesOff, writePricesOff, type PriceVisEnv } from '../data/price-visibility';
import { adminSite } from '../data/site';

type Env = AuthEnv & PriceVisEnv;

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return json({ ok: false, error: 'Unauthorized' }, 401);
  return json({ ok: true, off: await readPricesOff(env, adminSite(request)) });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return json({ ok: false, error: 'Unauthorized' }, 401);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'Expected JSON body' }, 400); }

  // Answer with what was STORED, so the editor's switches never claim more
  // than the menu page will do.
  const off = await writePricesOff(env, adminSite(request), (body as { off?: unknown })?.off);
  if (!off) return json({ ok: false, error: 'No KV namespace bound for this venue' }, 500);
  return json({ ok: true, off });
};
