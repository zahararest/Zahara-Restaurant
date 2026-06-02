// Best-effort cache purge for /photos/{filename} after an admin
// upload/delete. caches.default.delete() only purges the current
// Cloudflare colo — combined with the short max-age on the /photos
// middleware, that means the admin sees their change immediately and
// every other visitor sees it within ~60s.
//
// IMPORTANT: the live pages don't request /photos/{file} directly — they
// request the Cloudflare-resized variants at /cdn-cgi/image/<opts>/photos/
// {file} (see src/lib/photo.ts). Those resized URLs have their OWN edge
// cache entries, so purging only the raw /photos/{file} entry left the
// site showing the stale photo. We now purge the resized variants too, for
// every width/quality the site emits.

import { PHOTO_CATALOGUE } from '../../data/photos-map';

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

/** Purge a filename — and all of its resized variants — from the colo cache. */
export async function purgePhotoCache(
  origin: string,
  filename: string,
): Promise<void> {
  for (const url of variantUrls(origin, filename)) {
    try {
      await caches.default.delete(url);
    } catch (err) {
      console.warn('[admin/images] cache.delete failed', url, String(err));
    }
  }
}

/** Purge every catalogued photo from the colo cache. */
export async function purgeAllPhotoCache(origin: string): Promise<number> {
  let n = 0;
  for (const p of PHOTO_CATALOGUE) {
    await purgePhotoCache(origin, p.filename);
    n++;
  }
  return n;
}
