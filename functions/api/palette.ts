// GET /api/palette — returns the saved colour-token overrides as JSON.
//
// Public on purpose: the public site itself uses these to render. The
// middleware already injects them inline at SSR time; this endpoint is
// for the admin colour editor (to seed itself from the server on load)
// and for any future client that wants to read the current palette.

import type { PagesFunction } from '@cloudflare/workers-types';
import { readPaletteOwn, type PaletteEnv } from '../data/palette';
import { siteFromRequest } from '../data/site';

export const onRequestGet: PagesFunction<PaletteEnv> = async ({ env, request }) => {
  // The colour editor seeds itself from here. It needs the venue's OWN saved
  // tokens (via ?site=…), NOT the Zahara-merged display palette — otherwise a
  // rooftop save would bake Zahara's tokens into rooftop's store.
  const palette = await readPaletteOwn(env, siteFromRequest(request));
  return new Response(JSON.stringify(palette), {
    headers: {
      'Content-Type':  'application/json; charset=utf-8',
      // Palette changes rarely — cache for 10 minutes at edge.
      // Admin color saves broadcast via BroadcastChannel so open tabs
      // update immediately; other visitors see the new palette within
      // the TTL window (10 min max lag).
      'Cache-Control': 'public, max-age=600, stale-while-revalidate=3600',
      'X-Robots-Tag':  'noindex',
    },
  });
};
