// GET /photos/[file] — R2 override middleware.
//
// When an admin uploads a replacement photo via /admin/images/, it is stored
// in the IMAGES R2 bucket at `images/{key}` (e.g. `images/hero`). This
// function intercepts every request to /photos/{filename} and checks R2
// first. If an override exists it is served directly; otherwise the request
// falls through to the static file in /public/photos/.
//
// The admin panel cache-busts thumbnails via ?t={timestamp}, so visitors
// always see the latest upload within one CDN edge TTL.

import type { PagesFunction, R2Bucket } from '@cloudflare/workers-types';
import { FILENAME_TO_KEY } from '../data/photos-map';

interface Env {
  IMAGES?: R2Bucket;
}

export const onRequestGet: PagesFunction<Env> = async ({ params, env, next, request }) => {
  // Strip any query string from the filename (e.g. ?t=1234 cache-buster).
  const raw  = (params.file as string) ?? '';
  const file = raw.split('?')[0];

  if (env.IMAGES && FILENAME_TO_KEY[file]) {
    const key = FILENAME_TO_KEY[file];
    try {
      const obj = await env.IMAGES.get(`images/${key}`);
      if (obj !== null) {
        const contentType = obj.httpMetadata?.contentType ?? 'image/jpeg';
        const etag        = `"${obj.etag}"`;

        // Honour conditional requests so the browser doesn't re-download
        // an image it already has cached.
        const clientEtag = request.headers.get('If-None-Match');
        if (clientEtag && clientEtag === etag) {
          return new Response(null, { status: 304 });
        }

        return new Response(obj.body, {
          headers: {
            'Content-Type':  contentType,
            'ETag':          etag,
            // Cache aggressively — the admin UI cache-busts with ?t= after upload.
            'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
          },
        });
      }
    } catch (err) {
      console.warn('[photos] R2 get failed for', key, String(err));
      // Fall through to static asset on error.
    }
  }

  // No R2 override (or R2 not configured) — serve the default static file.
  return next();
};
