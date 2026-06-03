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
              'Cache-Control': 'public, max-age=60, must-revalidate',
            },
          });
        }
      } catch (err) {
        console.warn('[photos-m] R2 get failed for', key, String(err));
      }
    }
  }

  // No R2 at all — fall through to a (likely absent) static asset.
  return next();
};
