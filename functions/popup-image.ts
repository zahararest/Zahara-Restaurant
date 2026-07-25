// GET /popup-image — serves the entry popup's photo from R2 (`images/popup`).
//
// The photo is uploaded/replaced via /admin/popup/image and shown by the
// AnnouncementPopup component when the popup is in a photo mode. The URL
// carries a ?v=<assetVersion> cache-buster (stamped by the middleware into the
// injected popup marker), so a replaced photo gets a fresh URL immediately.
//
// Venue scoping: rooftop's marker points here with `?site=rooftop`, so it is
// served from rooftop's own bucket first, then Zahara's as the fallback. A
// missing object → 404, which the popup script treats as "no photo" and falls
// back to the text card.

import type { PagesFunction } from '@cloudflare/workers-types';
import { siteFromRequest, siteScope, type SiteBindings } from './data/site';
import { serveR2Object, findOverride } from './data/photos-serve';

export const onRequestGet: PagesFunction<SiteBindings> = async ({ env, request }) => {
  const scope = siteScope(env, siteFromRequest(request));
  const obj   = await findOverride(scope, ['popup']);   // → images/popup
  if (!obj) return new Response('Not found', { status: 404 });
  return serveR2Object(obj, request);
};
