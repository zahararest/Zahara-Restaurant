// /api/instagram-refresh — rotate the long-lived Instagram token.
//
// Same shared-secret auth as /api/menu-sync (Cloudflare Pages has no native
// cron, so an external scheduler pings it). You usually DON'T need to schedule
// this separately: the hourly /api/menu-sync call already rotates the token.
// This endpoint exists for a manual kick and for checking status.
//
//   • normal call → rotate only if the token is missing from KV or near expiry.
//   • ?force=1    → rotate immediately (Meta rejects tokens < 24h old).
//
// Auth: SYNC_TOKEN as ?token=… or `Authorization: Bearer …`.

import type { PagesFunction, KVNamespace } from '@cloudflare/workers-types';
import { refreshInstagramToken } from '../data/instagram-token';

interface Env {
  MENU_KV?:                KVNamespace;
  INSTAGRAM_ACCESS_TOKEN?: string;
  SYNC_TOKEN?:             string;
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

  const result = await refreshInstagramToken(env, { force: url.searchParams.get('force') === '1' });
  return json(result, result.ok ? 200 : 502);
}

export const onRequestGet:  PagesFunction<Env> = ({ request, env }) => handle(request, env);
export const onRequestPost: PagesFunction<Env> = ({ request, env }) => handle(request, env);
