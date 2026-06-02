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
import { FILENAME_TO_META } from '../data/photos-map';

interface Env {
  IMAGES?: R2Bucket;
}

export const onRequestGet: PagesFunction<Env> = async ({ params, env, next, request }) => {
  // Strip any query string from the filename (e.g. ?t=1234 cache-buster).
  const raw  = (params.file as string) ?? '';
  const file = raw.split('?')[0];
  const meta = FILENAME_TO_META[file];

  if (env.IMAGES && meta) {
    // Try the photo's own override first; if a split key has none yet,
    // fall back to the key it was split from (e.g. contact → interior)
    // so the live image keeps showing until a dedicated one is uploaded.
    const candidates = meta.fallbackKey ? [meta.key, meta.fallbackKey] : [meta.key];
    for (const key of candidates) {
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
              // Short, NON-stale TTL. Admin uploads have to take effect on
              // the live site quickly. This Cache-Control is what the
              // Cloudflare Image Resizing layer (/cdn-cgi/image/…, the URLs
              // the pages actually request) inherits for its own edge
              // cache — so a long `stale-while-revalidate` here meant the
              // RESIZED variants kept serving the old photo for up to a day,
              // even after an upload + purge. We drop SWR entirely: after
              // 60s the edge revalidates against R2 (cheap 304 via ETag) and
              // picks up the new image everywhere within ~a minute.
              'Cache-Control': 'public, max-age=60, must-revalidate',
            },
          });
        }
      } catch (err) {
        console.warn('[photos] R2 get failed for', key, String(err));
        // Try the next candidate / fall through to the static asset on error.
      }
    }
  }

  // No R2 override (or R2 not configured) — serve the default static file.
  return next();
};
