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

const RESIZE_ENABLED = false;

/** Return a Cloudflare-resized URL for an image in /photos/.
 *  Pass the original src exactly as it appears in PHOTOS — the helper
 *  takes care of the URL massaging. Width is a max-width hint; quality
 *  defaults to a sensible value for editorial photography. */
export function resized(src: string, width: number, quality = 78): string {
  if (!RESIZE_ENABLED) return src;
  const path = src.replace(/^\/+/, '');
  return `/cdn-cgi/image/width=${width},quality=${quality},format=auto,fit=cover/${path}`;
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
