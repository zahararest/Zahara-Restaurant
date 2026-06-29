// /api/menu-sync — endpoint the EXTERNAL scheduler calls (hourly).
//
// Cloudflare Pages has no native cron, so an external scheduler (GitHub
// Actions / cron-job.org) pings this hourly. It can't present a Cloudflare
// Access JWT, so it authenticates with a shared secret instead:
//   SYNC_TOKEN (Pages secret) — passed as ?token=… or `Authorization: Bearer …`.
//
// Behaviour:
//   • normal call → runScheduled(): syncs ALL menus only if the current
//     Israel hour is in the configured schedule (and not already done this
//     hour). Safe to call every hour / more than once an hour.
//   • ?force=1    → sync immediately regardless of the schedule (manual kick).
//
// GET and POST both work, since schedulers vary.

import type { PagesFunction } from '@cloudflare/workers-types';
import { runScheduled, syncMenus, type SyncEnv } from '../data/menu-sync';
import { refreshInstagramToken } from '../data/instagram-token';

interface Env extends SyncEnv {
  SYNC_TOKEN?:             string;
  INSTAGRAM_ACCESS_TOKEN?: string;
}

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** Constant-time-ish string compare to avoid leaking the token via timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function handle(request: Request, env: Env): Promise<Response> {
  if (!env.SYNC_TOKEN) return json({ ok: false, error: 'SYNC_TOKEN not configured' }, 503);

  const url      = new URL(request.url);
  const provided = url.searchParams.get('token')
    || (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!provided || !safeEqual(provided, env.SYNC_TOKEN)) {
    return json({ ok: false, error: 'Forbidden' }, 403);
  }

  if (url.searchParams.get('force') === '1') {
    const result = await syncMenus(env);
    return json({ forced: true, ...result });
  }

  const out = await runScheduled(env);
  // Piggyback the Instagram token rotation on the same hourly ping. It's cheap
  // (a KV read + date check) and only calls Meta when the token is near expiry,
  // so the feed's long-lived token never lapses. Never let it break the sync.
  let instagram: unknown;
  try {
    instagram = await refreshInstagramToken(env);
  } catch (err) {
    instagram = { ok: false, reason: 'threw', body: String(err) };
  }
  return json({ ok: true, ...out, instagram });
}

export const onRequestGet:  PagesFunction<Env> = ({ request, env }) => handle(request, env);
export const onRequestPost: PagesFunction<Env> = ({ request, env }) => handle(request, env);
