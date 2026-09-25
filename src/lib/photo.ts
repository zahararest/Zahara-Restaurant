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

// On the rooftop build this is '&site=rooftop', appended after the ?v= token so
// (a) the Cloudflare image transform is cached under a rooftop-specific URL and
// (b) the /photos origin fetch resolves against rooftop's own R2 bucket (then
// the Zahara fallback, then the static default). Empty on the Zahara build, so
// its URLs are byte-for-byte unchanged.
import { SITE_QUERY_AMP } from './base';

// ── Shared frame parameters ────────────────────────────────────────────────
//
// The widths, phone crops and quality a full-bleed frame is served at. They
// live here because TWO places have to agree on them exactly: the component
// that renders the <picture>, and BaseLayout's `rel=preload` for the LCP
// image. A preload whose URL differs from the <img> by so much as a quality
// digit is not a preload — it is a second, wasted download of the largest
// image on the page. Keeping the numbers in one module makes that class of
// bug impossible rather than merely commented against.

/** The home hero (HeroBleed). */
export const HERO_WIDTHS       = [800, 1200, 1800, 2400] as const;
export const HERO_MOBILE_COVER = [[640, 1180], [820, 1500], [1080, 1980]] as const;
/** The hero is the LCP image — a slightly lower AVIF quality (78→70 ≈
 *  113KB→~80KB on mobile) buys a faster mobile LCP at no visible cost. */
export const HERO_QUALITY      = 70;

/** Any other full-bleed band (BleedPhoto). Finer width steps so a ~1400px
 *  band picks 1400 rather than the 1800 variant. */
export const BLEED_WIDTHS       = [800, 1100, 1400, 1700, 2100, 2560] as const;
/** Default phone crop for a FULL-SCREEN band — same shape as the hero. A
 *  short band passes its own wider pairs so it doesn't request a too-tall
 *  image (see the Events page). */
export const BLEED_MOBILE_COVER = HERO_MOBILE_COVER;

/** Return a Cloudflare-resized URL for an image in /photos/.
 *  Pass the original src exactly as it appears in PHOTOS — the helper
 *  takes care of the URL massaging. Width is a max-width hint; quality
 *  defaults to a sensible value for editorial photography. */
export function resized(src: string, width: number, quality = 78): string {
  if (!RESIZE_ENABLED) return src;
  const path = src.replace(/^\/+/, '');
  return `/cdn-cgi/image/width=${width},quality=${quality},format=auto,fit=cover/${path}?v=${ASSET_VERSION_TOKEN}${SITE_QUERY_AMP}`;
}

/** Build a srcset string for responsive serving. Pairs each width with
 *  the matching descriptor so the browser picks an appropriate size for
 *  the device's pixel density and viewport.
 *  When the resize layer is disabled, returns `undefined` so Astro omits
 *  the `srcset` attribute entirely and the browser falls back to `src`. */
export function resizedSrcset(src: string, widths: readonly number[], quality = 78): string | undefined {
  if (!RESIZE_ENABLED) return undefined;
  return widths
    .map((w) => `${resized(src, w, quality)} ${w}w`)
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
  return `/cdn-cgi/image/width=${width},height=${height},quality=${quality},format=auto,fit=cover,gravity=auto/${path}?v=${ASSET_VERSION_TOKEN}${SITE_QUERY_AMP}`;
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
  return `/cdn-cgi/image/width=${width},height=${height},quality=${quality},format=auto,fit=cover,gravity=auto/${path}?v=${ASSET_VERSION_TOKEN}${SITE_QUERY_AMP}`;
}

export function resizedMobileCoverSrcset(
  src: string,
  sizes: readonly (readonly [number, number])[],
  quality = 78,
): string | undefined {
  if (!RESIZE_ENABLED) return undefined;
  return sizes.map(([w, h]) => `${resizedMobileCover(src, w, h, quality)} ${w}w`).join(', ');
}


// ── Video slots ────────────────────────────────────────────────────────────
//
// Every photo slot on the site can show a VIDEO instead of its still, on the
// desktop frame, the phone frame, or both. The build always ships the still;
// the root middleware swaps in (or lays over it) a <video> for the slots the
// owner has uploaded one for, using the URLs these helpers put on the element.
// See functions/data/media.ts and src/components/MediaVideo.astro.
//
// These URLs deliberately do NOT go through /cdn-cgi/image: that layer
// transforms images, and handing it a video returns an error rather than a
// frame. They carry the same ?v= cache-buster as everything else, so removing
// or replacing a video shows up immediately.

/** The URL of a slot's video, derived from its still's src so the two can
 *  never point at different things. `variant` picks the portrait cut. */
export function videoSrc(src: string, variant: 'desktop' | 'mobile' = 'desktop'): string {
  const file = src.replace(/^\/+/, '').replace(/^photos\//, '').replace(/\.[^.]+$/, '');
  const name = variant === 'mobile' ? `${file}--mobile.mp4` : `${file}.mp4`;
  return `/videos/${name}?v=${ASSET_VERSION_TOKEN}${SITE_QUERY_AMP}`;
}

/** The attributes that mark an element as a swappable media slot. Spread onto
 *  the wrapper that holds the still; the middleware replaces its contents with
 *  a <video> when the manifest says both frames show one, or adds the video
 *  beside the still when only one frame does.
 *
 *  The wrapper must hold the still and NOTHING else (a caption beside it would
 *  be replaced along with it), and it must be a positioned box the size of the
 *  frame — or `display: contents` inside one — because a one-frame video is
 *  laid over the still with `position: absolute; inset: 0`.
 *
 *  `poster` is the still the video replaces — the frame is filled from an
 *  image the browser has usually already fetched while the video's first bytes
 *  arrive, so the swap never shows a black box. `mobile` is for slots with a
 *  separate phone frame (`mobile: true` in functions/data/photos-map.ts); it
 *  adds the URL of the phone video. */
export function mediaSlot(
  key: string, src: string,
  opts: { poster: string; className?: string; mobile?: boolean; eager?: boolean },
): Record<string, string> {
  return {
    'data-media-slot':  key,
    'data-media-video': videoSrc(src, 'desktop'),
    ...(opts.mobile ? { 'data-media-video-mobile': videoSrc(src, 'mobile') } : {}),
    'data-media-poster': opts.poster,
    'data-media-class':  opts.className ?? '',
    // Above the fold: this frame is the first thing on screen, so its video
    // gets preload="auto" and starts downloading during head parse instead of
    // waiting to be scrolled near. Everything else stays lazy.
    ...(opts.eager ? { 'data-media-eager': '' } : {}),
  };
}
