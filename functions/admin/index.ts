// GET /admin/ — serves the menu editor SPA. All UI logic lives in
// ./styles.ts, ./script.ts, ./menus.ts; this file just orchestrates.

import type { PagesFunction } from '@cloudflare/workers-types';
import { checkAccess, unauthorized, type AuthEnv } from './auth';
import { adminPage }                              from './page';

export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return unauthorized();

  return new Response(adminPage(), {
    headers: {
      'Content-Type':  'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag':  'noindex, nofollow',
    },
  });
};
