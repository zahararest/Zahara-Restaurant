// GET  /admin/events-menu/sync — the events-PDF source + whether a PDF is live.
// POST /admin/events-menu/sync — body { link?: string, run?: boolean }:
//        link  — save the OneDrive source (saved before any run, like the
//                menu-sync panel does),
//        run   — pull it now.
//
// Its own endpoint on purpose: /admin/sync/run drives the .docx menus from
// `sync_config`, and the events menu is deliberately NOT one of them, so
// "Sync all now" and the hourly cron leave it alone. Access-gated like the
// rest of /admin/*.

import type { PagesFunction, R2Bucket } from '@cloudflare/workers-types';
import { checkAccess, type AuthEnv } from '../auth';
import {
  readEventsMenuConfig, setEventsMenuLink, syncEventsMenu, type EventsMenuSyncEnv,
} from '../../data/events-menu-sync';
import { EVENTS_MENU_OBJECT } from '../../data/content';
import { adminSite, siteScope, type Site } from '../../data/site';

type Env = AuthEnv & EventsMenuSyncEnv;

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

/** Is a PDF stored for THIS venue right now? (head — no download.) */
async function hasPdfFor(env: Env, site: Site): Promise<boolean> {
  const bucket: R2Bucket | null = siteScope(env, site).images;
  if (!bucket) return false;
  try { return (await bucket.head(EVENTS_MENU_OBJECT)) !== null; }
  catch { return false; }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return json({ ok: false, error: 'Unauthorized' }, 401);
  const site = adminSite(request);
  const [config, hasPdf] = await Promise.all([
    readEventsMenuConfig(env, site),
    hasPdfFor(env, site),
  ]);
  return json({ ok: true, config, hasPdf });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return json({ ok: false, error: 'Unauthorized' }, 401);

  let body: { link?: string; run?: boolean } = {};
  try { body = await request.json() as typeof body; }
  catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }

  const site = adminSite(request);

  // Save the link first, so a "Sync now" always uses what's on screen.
  if (typeof body.link === 'string') await setEventsMenuLink(env, body.link, site);

  if (!body.run) {
    const config = await readEventsMenuConfig(env, site);
    return json({ ok: true, config, hasPdf: await hasPdfFor(env, site) });
  }

  const run    = await syncEventsMenu(env, site);
  const config = await readEventsMenuConfig(env, site);
  return json(
    { ok: run.ok, error: run.error, size: run.size, name: run.name, config, hasPdf: await hasPdfFor(env, site) },
    run.ok ? 200 : 207,
  );
};
