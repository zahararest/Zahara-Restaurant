// GET /photos-m/[file] — mobile (portrait) variant of a photo.
//
// Phones load full-bleed photos through this route instead of /photos/. It
// serves the admin-uploaded MOBILE override (R2 `images/{key}__mobile`) when
// present; otherwise it falls back to the regular desktop override
// (`images/{key}`), so a phone still shows the photo even before a dedicated
// portrait crop is uploaded.
//
// Venue scoping mirrors /photos: rooftop requests carry `?site=rooftop` and are
// resolved against rooftop's own bucket first, then Zahara's, then (via the
// /photos fall-through below, query preserved) the shared static default.

import type { PagesFunction } from '@cloudflare/workers-types';
import { FILENAME_TO_META } from '../data/photos-map';
import { siteFromRequest, siteScope, type SiteBindings } from '../data/site';
import { serveR2Object, findOverride } from '../data/photos-serve';

const MOBILE_SUFFIX = '__mobile';

export const onRequestGet: PagesFunction<SiteBindings> = async ({ params, env, request }) => {
  const raw  = (params.file as string) ?? '';
  const file = raw.split('?')[0];
  const meta = FILENAME_TO_META[file];

  if (meta) {
    const scope = siteScope(env, siteFromRequest(request));
    // Mobile override first, then the desktop override(s).
    const keys = [
      `${meta.key}${MOBILE_SUFFIX}`,
      meta.key,
      ...(meta.fallbackKey ? [meta.fallbackKey] : []),
    ];
    const obj = await findOverride(scope, keys);
    if (obj) return serveR2Object(obj, request);
  }

  // No mobile/desktop override available — fall back to the regular /photos/
  // route, preserving the query string (?v=… and ?site=… stay intact so the
  // desktop lookup resolves the same venue).
  const fallbackUrl = new URL(request.url);
  fallbackUrl.pathname = `/photos/${file}`;
  return fetch(fallbackUrl.href, request);
};
