// Best-effort cache purge for /photos/{filename} after an admin
// upload/delete. caches.default.delete() only purges the current
// Cloudflare colo — combined with the short max-age on the /photos
// middleware, that means the admin sees their change immediately and
// every other visitor sees it within ~60s.

import { PHOTO_CATALOGUE } from '../../data/photos-map';

/** Purge a single filename from the colo cache (with + without ?t=). */
export async function purgePhotoCache(
  origin: string,
  filename: string,
): Promise<void> {
  const base = `${origin}/photos/${filename}`;
  try {
    await caches.default.delete(base);
  } catch (err) {
    console.warn('[admin/images] cache.delete failed', filename, String(err));
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
