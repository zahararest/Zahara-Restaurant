// Cron Worker entrypoint — see ../wrangler.toml for why this exists.
//
// Reuses the Pages functions' sync code directly (no HTTP, no duplication):
//   • runScheduled()          — pulls menus from OneDrive during the configured
//                               Israel hours, deduped per hour.
//   • refreshInstagramToken() — rotates the long-lived IG token before expiry.
//
// scheduled() runs both on the cron schedule. fetch() exposes the same run
// behind the shared SYNC_TOKEN for manual triggering / health checks — it lives
// on *.workers.dev, which is NOT behind the zone's Bot Fight Mode, so it's
// reachable from anywhere (unlike the Pages endpoint that was being challenged).

import { runScheduled, syncMenus, type SyncEnv } from '../../functions/data/menu-sync';
import { refreshInstagramToken } from '../../functions/data/instagram-token';

export interface Env extends SyncEnv {
  INSTAGRAM_ACCESS_TOKEN?: string;
  SYNC_TOKEN?:             string;
}

/** Run the scheduled menu sync + IG token rotation, swallowing errors so one
 *  failure never masks the other. Returns a small status object for logging. */
async function runAll(env: Env, opts: { force?: boolean } = {}): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  try {
    out.menu = opts.force ? await syncMenus(env) : await runScheduled(env);
  } catch (err) {
    out.menu = { ok: false, error: String(err) };
  }
  try {
    out.instagram = await refreshInstagramToken(env);
  } catch (err) {
    out.instagram = { ok: false, error: String(err) };
  }
  return out;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default {
  // Cloudflare invokes this on the cron schedule (../wrangler.toml [triggers]).
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runAll(env).then((r) => console.log('cron run:', JSON.stringify(r))),
    );
  },

  // Manual trigger / health check: GET ?token=SYNC_TOKEN[&force=1].
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.SYNC_TOKEN) {
      return Response.json({ ok: false, error: 'SYNC_TOKEN not configured' }, { status: 503 });
    }
    const url      = new URL(request.url);
    const provided = url.searchParams.get('token')
      || (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!provided || !safeEqual(provided, env.SYNC_TOKEN)) {
      return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 });
    }
    const result = await runAll(env, { force: url.searchParams.get('force') === '1' });
    return Response.json({ ok: true, ...result });
  },
};
