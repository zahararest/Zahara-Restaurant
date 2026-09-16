// GET /admin/ — serves the menu editor SPA. All UI logic lives in
// ./styles.ts, ./script.ts, ./menus.ts; this file just orchestrates.

import type { PagesFunction } from '@cloudflare/workers-types';
import { checkAccess, unauthorized, type AuthEnv } from './auth';
import { adminPage }                              from './page';
import { readMenusOff, type MenuVisEnv }          from '../data/menu-visibility';
import { readPricesOff, type PriceVisEnv }        from '../data/price-visibility';
import { adminSite }                              from '../data/site';

type Env = AuthEnv & MenuVisEnv & PriceVisEnv;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return unauthorized();

  const site = adminSite(request);
  // Which menus this venue actually uses — the editor greys out the rest —
  // and which of them it shows without prices.
  const [menusOff, pricesOff] = await Promise.all([readMenusOff(env, site), readPricesOff(env, site)]);

  return new Response(adminPage(site, menusOff, pricesOff), {
    headers: {
      'Content-Type':  'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag':  'noindex, nofollow',
    },
  });
};
