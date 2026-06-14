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
              // Long, stale-while-revalidate TTL. This Cache-Control is what
              // the Cloudflare Image Resizing layer (/cdn-cgi/image/…, the
              // URLs the pages actually request) inherits for its own edge
              // cache. A short `must-revalidate` TTL here meant resized
              // variants were constantly re-derived from the slow R2 origin
              // (~2.2s for a 663KB source) — so a cold colo took up to ~5.6s
              // to deliver the hero, slipping past Lighthouse's window and
              // producing intermittent NO_LCP on mobile.
              //
              // Freshness no longer relies on a short TTL: every admin upload
              // (a) bumps the asset-version token so EVERY resized URL in the
              // HTML changes (functions/admin/images/upload.ts → bumpAssetVersion),
              // and (b) purges the edge (purgePhotoCache). So old variants are
              // simply never requested again. We can therefore cache long and
              // serve stale-while-revalidate — a "stale" colo serves the warm
              // bytes instantly (~0.3s) and refreshes in the background, which
              // is exactly what keeps the LCP image fast and the metric stable.
              'Cache-Control': 'public, max-age=86400, stale-while-revalidate=2592000',
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
