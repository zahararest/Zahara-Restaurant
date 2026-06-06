// GET /api/gallery — which OPTIONAL gallery slots actually have an image.
//
// The home gallery has up to six optional slots (gallery5–gallery10) that
// only exist once an admin uploads them to R2. They have no shipped static
// file, so rendering an <img src> for an empty slot 404s. To avoid that, the
// gallery renders optional slots WITHOUT a src and asks this endpoint which
// ones exist; only confirmed slots get their real src set client-side. An
// empty slot is therefore never fetched.
//
// Returns: { filenames: ["gallery-5.jpg", ...] } — the optional slots that
// have an override in R2 right now (desktop or mobile variant counts).

import type { PagesFunction, R2Bucket } from '@cloudflare/workers-types';
import { PHOTO_CATALOGUE } from '../data/photos-map';

interface Env { IMAGES?: R2Bucket; }

const MOBILE_SUFFIX = '__mobile';

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const optional = PHOTO_CATALOGUE.filter((p) => p.optional);
  let filenames: string[] = [];

  if (env.IMAGES) {
    try {
      // R2 list returns up to 1000 keys; the gallery set is tiny.
      const listing = await env.IMAGES.list({ prefix: 'images/' });
      const present = new Set(listing.objects.map((o) => o.key)); // e.g. images/gallery5
      filenames = optional
        .filter((p) =>
          present.has(`images/${p.key}`) ||
          present.has(`images/${p.key}${MOBILE_SUFFIX}`))
        .map((p) => p.filename);
    } catch (err) {
      console.warn('[api/gallery] R2 list failed', String(err));
    }
  }

  return new Response(JSON.stringify({ filenames }), {
    headers: {
      'Content-Type':  'application/json; charset=utf-8',
      // Gallery uploads are rare; cache at edge but let admin uploads show
      // within a short window (same posture as the photos route).
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=600',
      'X-Robots-Tag':  'noindex',
    },
  });
};
