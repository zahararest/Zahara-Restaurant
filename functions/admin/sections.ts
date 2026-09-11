// GET/POST /admin/sections — Cloudflare Access gated.
//
// GET  → { ok, on: ["eventsExtras", …] }
// POST   JSON { on: ["eventsExtras"] } — the optional sections this venue shows.
//
// Saved to the venue's own KV record; the middleware tells every page which
// sections to reveal. See functions/data/sections.ts for why this is a switch
// rather than a code flag.

import type { PagesFunction } from '@cloudflare/workers-types';
import { checkAccess, type AuthEnv } from './auth';
import { readSections, writeSections, sanitiseSections, type SectionEnv } from '../data/sections';
import { adminSite } from '../data/site';

type Env = AuthEnv & SectionEnv;

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return json({ ok: false, error: 'Unauthorized' }, 401);
  const on = await readSections(env, adminSite(request));
  return json({ ok: true, on: Object.keys(on) });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return json({ ok: false, error: 'Unauthorized' }, 401);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'Expected JSON body' }, 400); }

  const list = (body as { on?: unknown })?.on;
  const map: Record<string, boolean> = {};
  if (Array.isArray(list)) for (const id of list) if (typeof id === 'string') map[id] = true;

  const ok = await writeSections(env, adminSite(request), map);
  if (!ok) return json({ ok: false, error: 'No KV namespace bound for this venue' }, 500);
  // Answer with what was actually STORED, not what was posted. writeSections
  // drops ids that aren't real sections, so echoing the request back would
  // report a section as switched on that nothing will ever render.
  return json({ ok: true, on: Object.keys(sanitiseSections(map)) });
};
