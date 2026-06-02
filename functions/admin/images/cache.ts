// Cache invalidation for /photos/{filename} after an admin upload/delete.
//
// Two layers, because a photo can be cached in two different places:
//
//   1. caches.default.delete()  — drops the entry from the CURRENT
//      Cloudflare colo only. Instant for the admin who just uploaded, but
//      every other colo (and the resized /cdn-cgi/image variants cached
//      there) keeps the stale photo until its short max-age expires.
//
//   2. Cloudflare API purge_cache — a GLOBAL, by-URL purge across every
//      colo, including the resized /cdn-cgi/image transform variants. This
//      is what makes an uploaded photo show everywhere within seconds
//      instead of "not until the next redeploy". It only runs when the
//      CF_ZONE_ID + CF_PURGE_TOKEN secrets are configured (see below);
//      without them we fall back to the colo-only purge.
//
//      To enable instant global updates, add two Pages secrets:
//        CF_ZONE_ID      — the zone id for the site's domain
//        CF_PURGE_TOKEN  — an API token with the "Cache Purge" permission
//
// IMPORTANT: the live pages request the Cloudflare-resized variants at
// /cdn-cgi/image/<opts>/photos/{file} (see src/lib/photo.ts). Those resized
// URLs have their OWN cache entries, so we purge every width/quality the
// site emits, not just the raw /photos/{file} entry.

import { PHOTO_CATALOGUE } from '../../data/photos-map';

/** Optional Cloudflare API purge credentials (Pages secrets). */
export interface CachePurgeEnv {
  CF_ZONE_ID?:     string;
  CF_PURGE_TOKEN?: string;
}

// Keep these in sync with src/lib/photo.ts (`resized`) and every callsite's
// width list. Quality is the helper default (78); format/fit are constant.
const RESIZE_WIDTHS = [800, 1200, 1600, 1800, 2400] as const;
const RESIZE_QUALITY = 78;

/** Every URL a visitor might have cached for this filename: the raw
 *  /photos/ asset plus each Cloudflare-resized variant. */
function variantUrls(origin: string, filename: string): string[] {
  const urls = [`${origin}/photos/${filename}`];
  for (const w of RESIZE_WIDTHS) {
    urls.push(
      `${origin}/cdn-cgi/image/width=${w},quality=${RESIZE_QUALITY},format=auto,fit=cover/photos/${filename}`,
    );
  }
  return urls;
}

/** Global, by-URL purge via the Cloudflare API. No-ops unless both
 *  CF_ZONE_ID and CF_PURGE_TOKEN are set. The API accepts up to 30 URLs
 *  per call, so we chunk. */
async function purgeViaApi(env: CachePurgeEnv | undefined, urls: string[]): Promise<void> {
  if (!env?.CF_ZONE_ID || !env?.CF_PURGE_TOKEN || urls.length === 0) return;
  for (let i = 0; i < urls.length; i += 30) {
    const chunk = urls.slice(i, i + 30);
    try {
      await fetch(`https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/purge_cache`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.CF_PURGE_TOKEN}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ files: chunk }),
      });
    } catch (err) {
      console.warn('[admin/images] API purge failed', String(err));
    }
  }
}

/** Drop a filename — and all of its resized variants — from the local colo
 *  cache, and (if configured) globally via the Cloudflare API. */
export async function purgePhotoCache(
  origin: string,
  filename: string,
  env?: CachePurgeEnv,
): Promise<void> {
  const urls = variantUrls(origin, filename);
  for (const url of urls) {
    try {
      await caches.default.delete(url);
    } catch (err) {
      console.warn('[admin/images] cache.delete failed', url, String(err));
    }
  }
  await purgeViaApi(env, urls);
}

/** Purge every catalogued photo from the colo cache (and globally if
 *  configured). */
export async function purgeAllPhotoCache(origin: string, env?: CachePurgeEnv): Promise<number> {
  const allUrls: string[] = [];
  for (const p of PHOTO_CATALOGUE) {
    const urls = variantUrls(origin, p.filename);
    allUrls.push(...urls);
    for (const url of urls) {
      try { await caches.default.delete(url); }
      catch (err) { console.warn('[admin/images] cache.delete failed', url, String(err)); }
    }
  }
  await purgeViaApi(env, allUrls);
  return PHOTO_CATALOGUE.length;
}
