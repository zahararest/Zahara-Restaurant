// GET /photos-m/[file] — mobile (portrait) variant of a photo.
//
// Phones load full-bleed photos through this route instead of /photos/.
// It serves the admin-uploaded MOBILE override (R2 `images/{key}__mobile`)
// when present; otherwise it falls back to the regular desktop override
// (`images/{key}`), so a phone still shows the photo even before a dedicated
// portrait crop is uploaded. The Cloudflare image-resizing layer fetches
// this path and crops it to the phone aspect (see src/lib/photo.ts).

import type { PagesFunction, R2Bucket } from '@cloudflare/workers-types';
import { FILENAME_TO_META } from '../data/photos-map';

interface Env { IMAGES?: R2Bucket; }

const MOBILE_SUFFIX = '__mobile';

export const onRequestGet: PagesFunction<Env> = async ({ params, env, next, request }) => {
  const raw  = (params.file as string) ?? '';
  const file = raw.split('?')[0];
  const meta = FILENAME_TO_META[file];

  if (env.IMAGES && meta) {
    // Mobile override first, then the desktop override(s).
    const candidates = [
      `${meta.key}${MOBILE_SUFFIX}`,
      meta.key,
      ...(meta.fallbackKey ? [meta.fallbackKey] : []),
    ];
    for (const key of candidates) {
      try {
        const obj = await env.IMAGES.get(`images/${key}`);
        if (obj !== null) {
          const contentType = obj.httpMetadata?.contentType ?? 'image/jpeg';
          const etag        = `"${obj.etag}"`;
          const clientEtag  = request.headers.get('If-None-Match');
          if (clientEtag && clientEtag === etag) {
            return new Response(null, { status: 304 });
          }
          return new Response(obj.body, {
            headers: {
              'Content-Type':  contentType,
              'ETag':          etag,
              // Long + stale-while-revalidate so the Image Resizing layer keeps
              // the hero's mobile (portrait) variant warm and never blocks on a
              // cold ~5.6s re-derive from the slow R2 origin — the NO_LCP cause.
              // Freshness rides the asset-version token bump + purge on upload
              // (see functions/photos/[file].ts for the full rationale).
              'Cache-Control': 'public, max-age=86400, stale-while-revalidate=2592000',
            },
          });
        }
      } catch (err) {
        console.warn('[photos-m] R2 get failed for', key, String(err));
      }
    }
  }

  // No override available — fall back to the regular /photos/ route.
  const fallbackUrl = new URL(request.url);
  fallbackUrl.pathname = `/photos/${file}`;
  return fetch(fallbackUrl.href, request);
};
