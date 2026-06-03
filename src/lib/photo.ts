// Photo URL helpers.
//
// We ship hi-res JPGs in /public/photos/ — most are 3–6 MB each. The
// browser can't keep four 6 MB chapter photos decoded in RAM at once
// (a decoded 6 MB JPG is ~96 MB of raw bitmap), so it evicts off-screen
// ones under memory pressure and the user sees the "photos go black on
// scroll-back" bug.
//
// Production fix: serve resized versions through Cloudflare's URL-based
// Image Resizing layer. The URL pattern is
//
//   /cdn-cgi/image/<options>/<source-path>
//
// Cloudflare returns a resized + format-optimised (WebP / AVIF where
// supported) version of the source. R2 overrides still work — the
// resize layer fetches the source via our /photos/* middleware, which
// already handles the override fallback.
//
// ┌─ HOW TO TURN THIS ON ───────────────────────────────────────────────┐
// │                                                                     │
// │  1. In the Cloudflare dashboard, go to                              │
// │       Speed → Optimization → Image Resizing                         │
// │     and toggle it ON for your zone. Free on Pages projects.         │
// │                                                                     │
// │  2. Set RESIZE_ENABLED below to `true`.                             │
// │                                                                     │
// │  3. Redeploy.                                                       │
// │                                                                     │
// └─────────────────────────────────────────────────────────────────────┘
//
// While the flag is `false` (default), the helpers return the original
// photo URL unchanged. The site works everywhere — local dev, `wrangler
// pages dev`, and production — at the cost of serving the full-res
// originals. Photos may still get evicted on memory-constrained mobile
// devices until you turn the resize layer on; that's the trade-off.

const RESIZE_ENABLED = true;

// Cache-busting token. Cloudflare caches each resized variant under its
// /cdn-cgi/image/… URL, in a store separate from R2 — so re-uploading a
// photo (same URL) keeps serving the OLD transform. We append `?v=<token>`
// to every resized URL; the root middleware (functions/_middleware.ts)
// replaces this token with a counter that bumps on every admin upload, so a
// new upload yields a NEW url → a fresh transform, with no cache purge.
// If the middleware never runs (e.g. local dev), the literal token is a
// harmless constant query — the /photos/[file] function strips the query
// before resolving the image, so the picture still loads either way.
export const ASSET_VERSION_TOKEN = '__ZASSETV__';

/** Return a Cloudflare-resized URL for an image in /photos/.
 *  Pass the original src exactly as it appears in PHOTOS — the helper
 *  takes care of the URL massaging. Width is a max-width hint; quality
 *  defaults to a sensible value for editorial photography. */
export function resized(src: string, width: number, quality = 78): string {
  if (!RESIZE_ENABLED) return src;
  const path = src.replace(/^\/+/, '');
  return `/cdn-cgi/image/width=${width},quality=${quality},format=auto,fit=cover/${path}?v=${ASSET_VERSION_TOKEN}`;
}

/** Build a srcset string for responsive serving. Pairs each width with
 *  the matching descriptor so the browser picks an appropriate size for
 *  the device's pixel density and viewport.
 *  When the resize layer is disabled, returns `undefined` so Astro omits
 *  the `srcset` attribute entirely and the browser falls back to `src`. */
export function resizedSrcset(src: string, widths: readonly number[]): string | undefined {
  if (!RESIZE_ENABLED) return undefined;
  return widths
    .map((w) => `${resized(src, w)} ${w}w`)
    .join(', ');
}

/** A PORTRAIT crop for phones. Our photography is landscape; in a tall phone
 *  viewport `object-fit: cover` scales a wide image up to fill the height,
 *  which reads as "zoomed in". Asking Cloudflare for a portrait crop sized to
 *  the phone (with `gravity=auto` so it keeps the subject) means the image
 *  fills the screen near 1:1 — full composition, no upscaling. No second set
 *  of uploads needed; the crop is generated on the fly from the same R2
 *  source. `gravity=auto` degrades to a centre crop if a zone doesn't support
 *  saliency detection. */
export function resizedCover(src: string, width: number, height: number, quality = 78): string {
  if (!RESIZE_ENABLED) return src;
  const path = src.replace(/^\/+/, '');
  return `/cdn-cgi/image/width=${width},height=${height},quality=${quality},format=auto,fit=cover,gravity=auto/${path}?v=${ASSET_VERSION_TOKEN}`;
}

/** srcset of portrait crops. `sizes` is a list of [width, height] pixel
 *  pairs; the width descriptor lets the browser pick by DPR. */
export function resizedCoverSrcset(
  src: string,
  sizes: readonly (readonly [number, number])[],
): string | undefined {
  if (!RESIZE_ENABLED) return undefined;
  return sizes.map(([w, h]) => `${resizedCover(src, w, h)} ${w}w`).join(', ');
}

/** Like resizedCover, but sourced from the MOBILE variant route
 *  (/photos-m/…). That route serves the admin-uploaded portrait crop when
 *  one exists, else falls back to the desktop image — so the owner can give
 *  any full-bleed photo a proper phone composition from /admin/images. */
export function resizedMobileCover(src: string, width: number, height: number, quality = 78): string {
  if (!RESIZE_ENABLED) return src;
  const path = src.replace(/^\/+/, '').replace(/^photos\//, 'photos-m/');
  return `/cdn-cgi/image/width=${width},height=${height},quality=${quality},format=auto,fit=cover,gravity=auto/${path}?v=${ASSET_VERSION_TOKEN}`;
}

export function resizedMobileCoverSrcset(
  src: string,
  sizes: readonly (readonly [number, number])[],
): string | undefined {
  if (!RESIZE_ENABLED) return undefined;
  return sizes.map(([w, h]) => `${resizedMobileCover(src, w, h)} ${w}w`).join(', ');
}
