// Shared image-serving helpers for /photos and /photos-m.
//
// Both routes resolve an admin-uploaded override from R2 and, if none exists,
// fall through to the committed static default in /public/photos. The venue
// scoping + cross-venue fallback precedence lives HERE so both routes (and the
// separation guarantee) stay in sync.

import type { R2Bucket, R2ObjectBody } from '@cloudflare/workers-types';
import type { Scope } from './site';

/** Serve an R2 object with the long-cache image headers + conditional-request
 *  handling. The long TTL + stale-while-revalidate keeps the Cloudflare Image
 *  Resizing layer from re-deriving from the slow R2 origin on every hit;
 *  freshness rides the asset-version cache-buster, bumped on every upload. */
export function serveR2Object(obj: R2ObjectBody, request: Request): Response {
  const contentType = obj.httpMetadata?.contentType ?? 'image/jpeg';
  const etag        = `"${obj.etag}"`;
  if (request.headers.get('If-None-Match') === etag) {
    return new Response(null, { status: 304 });
  }
  return new Response(obj.body, {
    headers: {
      'Content-Type':  contentType,
      'ETag':          etag,
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=2592000',
    },
  });
}

/** Find an image override across a venue's buckets in precedence order:
 *
 *    1. this venue's OWN bucket — every key candidate (own key, then the key
 *       it splits from, e.g. contact → interior). So rooftop shows rooftop
 *       imagery — even a fallbackKey match — before it ever borrows Zahara.
 *    2. Zahara's bucket (rooftop only; `imagesFb` is null for Zahara) — the
 *       cross-venue "show Zahara until rooftop uploads its own" fallback.
 *
 *  Returns the first object found, or null (caller then serves the shared
 *  static default). */
export async function findOverride(
  scope: Pick<Scope, 'images' | 'imagesFb'>,
  keys: string[],
): Promise<R2ObjectBody | null> {
  const buckets = [scope.images, scope.imagesFb].filter(Boolean) as R2Bucket[];
  for (const bucket of buckets) {
    for (const key of keys) {
      try {
        const obj = await bucket.get(`images/${key}`);
        if (obj !== null) return obj;
      } catch (err) {
        console.warn('[photos] R2 get failed for', key, String(err));
      }
    }
  }
  return null;
}
