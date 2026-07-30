// POST /admin/reserve/reset — start the portal's counter again from zero.
//
// Cloudflare Access gated, like every other write in /admin. Answers with a
// redirect rather than JSON so the dashboard's plain <form> works without a
// line of JavaScript — the person reading these numbers should never meet a
// screen that needs a script to have loaded correctly.
//
// What "reset" means is documented in functions/data/reserve-track.ts: it
// stamps a marker, and every read from that instant on ignores anything older.
// The numbers go to zero immediately and stay there.

import type { PagesFunction } from '@cloudflare/workers-types';
import { checkAccess, unauthorized, type AuthEnv } from '../auth';
import { resetCounter, type ReserveTrackEnv } from '../../data/reserve-track';

type Env = AuthEnv & ReserveTrackEnv;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return unauthorized();

  const done = await resetCounter(env);

  // Back to the dashboard, with a flag so it can say what just happened.
  // 303 so the browser follows with GET and a refresh can't re-submit.
  const back = new URL('/admin/reserve/', request.url);
  back.searchParams.set(done ? 'reset' : 'error', '1');

  return new Response(null, { status: 303, headers: { Location: back.toString() } });
};
