// GET /events-menu — serves the Events-page menu PDF from R2 (images/events-menu),
// inline so the browser's built-in viewer renders it (no forced download).
//
// Uploaded/replaced/removed via /admin/events-menu. Venue-scoped like the
// photos: rooftop's marker calls this with `?site=rooftop`, served from its own
// bucket first, then Zahara's as the fallback. Missing object → 404, which the
// events page treats as "no menu" and hides the button.

import type { R2Bucket } from '@cloudflare/workers-types';
import type { PagesFunction } from '@cloudflare/workers-types';
import { siteFromRequest, siteScope, type SiteBindings } from './data/site';
import { findOverride } from './data/photos-serve';
import { EVENTS_MENU_OBJECT } from './data/content';

// Cheap existence probe (no body) — the events page HEADs this to decide
// whether to show its "View events menu" button.
export const onRequestHead: PagesFunction<SiteBindings> = async ({ env, request }) => {
  const scope   = siteScope(env, siteFromRequest(request));
  const buckets = [scope.images, scope.imagesFb].filter(Boolean) as R2Bucket[];
  for (const b of buckets) {
    try { if (await b.head(EVENTS_MENU_OBJECT)) return new Response(null, { status: 200 }); }
    catch { /* try next bucket */ }
  }
  return new Response(null, { status: 404 });
};

export const onRequestGet: PagesFunction<SiteBindings> = async ({ env, request }) => {
  const scope = siteScope(env, siteFromRequest(request));
  const obj   = await findOverride(scope, ['events-menu']);   // → images/events-menu
  if (!obj) return new Response('Not found', { status: 404 });

  const etag = `"${obj.etag}"`;
  if (request.headers.get('If-None-Match') === etag) {
    return new Response(null, { status: 304 });
  }
  return new Response(obj.body, {
    headers: {
      'Content-Type':        obj.httpMetadata?.contentType ?? 'application/pdf',
      // inline → open in the browser's PDF viewer rather than downloading.
      'Content-Disposition': 'inline; filename="events-menu.pdf"',
      'ETag':                etag,
      'Cache-Control':       'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
};
