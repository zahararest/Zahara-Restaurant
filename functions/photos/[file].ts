// GET /photos/[file] — R2 override middleware.
//
// When an admin uploads a replacement photo via /admin/images/, it is stored
// in the venue's IMAGES bucket at `images/{key}` (e.g. `images/hero`). This
// function intercepts every request to /photos/{filename} and checks R2 first;
// if an override exists it is served, otherwise the request falls through to
// the static file in /public/photos/.
//
// Venue scoping: rooftop pages request this route with `?site=rooftop` (baked
// into the image URLs by src/lib/photo.ts). Rooftop is served from its own
// bucket, falling back to Zahara's bucket, then the shared static default —
// see findOverride() for the precedence. Zahara requests are unchanged.

import type { PagesFunction } from '@cloudflare/workers-types';
import { FILENAME_TO_META, photoSite } from '../data/photos-map';
import { siteFromRequest, siteScope, type SiteBindings } from '../data/site';
import { serveR2Object, findOverride } from '../data/photos-serve';

export const onRequestGet: PagesFunction<SiteBindings> = async ({ params, env, next, request }) => {
  // Strip any query string from the filename (?v= cache-buster, ?site=…).
  const raw  = (params.file as string) ?? '';
  const file = raw.split('?')[0];
  const meta = FILENAME_TO_META[file];

  if (meta) {
    // A `shared` photo (the /reserve/ portal) resolves against the shared
    // bucket whatever venue asked for it, so both venues see the same image
    // and neither can shadow it with its own copy.
    const scope = siteScope(env, photoSite(siteFromRequest(request), meta.key));
    // The photo's own override first; if a split key has none yet, the key it
    // was split from (e.g. contact → interior).
    const keys = meta.fallbackKey ? [meta.key, meta.fallbackKey] : [meta.key];
    const obj  = await findOverride(scope, keys);
    if (obj) return serveR2Object(obj, request);
  }

  // No override (or R2 not configured) — serve the shared static default.
  return next();
};
