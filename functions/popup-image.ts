// GET /popup-image — serves the entry popup's photo from R2 (`images/popup`).
//
// The photo is uploaded/replaced via /admin/popup/image and shown by the
// AnnouncementPopup component when the popup is in a photo mode. The URL
// carries a ?v=<assetVersion> cache-buster (stamped by the middleware into the
// injected popup marker), so a replaced photo gets a fresh URL immediately.
// Missing object → 404, which the popup script treats as "no photo" and falls
// back to the text card.

import type { PagesFunction, R2Bucket } from '@cloudflare/workers-types';
import { POPUP_IMAGE_OBJECT } from './data/content';

interface Env { IMAGES?: R2Bucket; }

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  if (!env.IMAGES) return new Response('Not found', { status: 404 });

  try {
    const obj = await env.IMAGES.get(POPUP_IMAGE_OBJECT);
    if (obj === null) return new Response('Not found', { status: 404 });

    const contentType = obj.httpMetadata?.contentType ?? 'image/jpeg';
    const etag        = `"${obj.etag}"`;
    if (request.headers.get('If-None-Match') === etag) {
      return new Response(null, { status: 304 });
    }

    return new Response(obj.body, {
      headers: {
        'Content-Type':  contentType,
        'ETag':          etag,
        // Freshness rides the ?v= cache-buster (bumped on every upload), so we
        // can cache long and serve stale-while-revalidate for speed.
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=2592000',
      },
    });
  } catch (err) {
    console.warn('[popup-image] R2 get failed', String(err));
    return new Response('Not found', { status: 404 });
  }
};
