// GET /videos/[file] — the video a slot shows instead of its still.
//
// Mirrors /photos and /photos-m, with two differences that matter:
//
//   • There is no static fallback. A video only exists because someone
//     uploaded one, so a miss is a 404 rather than a fall-through to a
//     committed file — and the middleware only ever emits these URLs for
//     slots the media manifest says have a video, so a 404 here means the
//     manifest and the bucket have drifted.
//   • Range requests are honoured. Browsers request video in ranges (that is
//     how seeking works, and Safari refuses to play a source that answers a
//     range request with a 200), so the byte range is passed through to R2
//     and answered with a 206.
//
// Filenames are derived from the still's: `MOYAL-00009.mp4` is the desktop
// video for the slot whose photo is `MOYAL-00009.jpg`, and `--mobile.mp4` is
// its portrait cut. See functions/data/media.ts.

import type { PagesFunction, R2Bucket, R2ObjectBody } from '@cloudflare/workers-types';
import { FILENAME_TO_META, photoSite, canShowVideo } from '../data/photos-map';
import { siteFromRequest, siteScope, type SiteBindings } from '../data/site';
import { parseVideoFilename, videoObjectKey } from '../data/media';

/** Serve an R2 object as video, honouring a single byte range. */
function serveVideo(obj: R2ObjectBody, range: { offset: number; length: number } | null, total: number): Response {
  const type = obj.httpMetadata?.contentType ?? 'video/mp4';
  const headers: Record<string, string> = {
    'Content-Type':  type,
    'ETag':          `"${obj.etag}"`,
    'Accept-Ranges': 'bytes',
    // Same posture as /photos: long edge cache, freshness rides the ?v=
    // asset-version cache-buster the middleware stamps onto the URL.
    'Cache-Control': 'public, max-age=86400, stale-while-revalidate=2592000',
  };
  if (!range) {
    headers['Content-Length'] = String(total);
    return new Response(obj.body, { headers });
  }
  const end = range.offset + range.length - 1;
  headers['Content-Range']  = `bytes ${range.offset}-${end}/${total}`;
  headers['Content-Length'] = String(range.length);
  return new Response(obj.body, { status: 206, headers });
}

/** Parse a single `bytes=a-b` range against a known object size. Multi-range
 *  requests are rare and optional to support, so they fall back to the whole
 *  body rather than being answered wrongly. */
function parseRange(header: string | null, size: number): { offset: number; length: number } | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  if (rawStart === '' && rawEnd === '') return null;
  let start: number;
  let end: number;
  if (rawStart === '') {
    // Suffix range: the LAST n bytes.
    const n = Number(rawEnd);
    if (!Number.isFinite(n) || n <= 0) return null;
    start = Math.max(0, size - n);
    end   = size - 1;
  } else {
    start = Number(rawStart);
    end   = rawEnd === '' ? size - 1 : Number(rawEnd);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  end = Math.min(end, size - 1);
  return { offset: start, length: end - start + 1 };
}

export const onRequestGet: PagesFunction<SiteBindings> = async ({ params, env, request }) => {
  const raw  = (params.file as string) ?? '';
  const file = raw.split('?')[0];

  const parsed = parseVideoFilename(file);
  if (!parsed) return new Response('Not found', { status: 404 });

  // The video is keyed off the STILL's catalogue entry, so a slot's photo and
  // its video can never point at different things. Catalogue filenames are all
  // .jpg; the ?? covers a future entry that isn't.
  const meta = FILENAME_TO_META[`${parsed.filename}.jpg`] ?? FILENAME_TO_META[parsed.filename];
  if (!meta || !canShowVideo(meta)) return new Response('Not found', { status: 404 });

  const scope  = siteScope(env, photoSite(siteFromRequest(request), meta.key));
  const bucket = scope.images as R2Bucket | null;
  if (!bucket) return new Response('Not found', { status: 404 });

  // A phone asking for a phone video that was never uploaded falls back to the
  // desktop video — the same courtesy /photos-m gives a still. This is also how
  // a phone that FOLLOWS the desktop plays the desktop clip.
  const keys = parsed.variant === 'mobile'
    ? [videoObjectKey(meta.key, 'mobile'), videoObjectKey(meta.key, 'desktop')]
    : [videoObjectKey(meta.key, 'desktop')];

  for (const key of keys) {
    try {
      const head = await bucket.head(`images/${key}`);
      if (!head) continue;
      const size  = head.size;
      const range = parseRange(request.headers.get('Range'), size);
      if (request.headers.get('If-None-Match') === `"${head.etag}"`) {
        return new Response(null, { status: 304 });
      }
      const obj = await bucket.get(`images/${key}`, range ? { range } : undefined);
      if (!obj) continue;
      return serveVideo(obj as R2ObjectBody, range, size);
    } catch (err) {
      console.warn('[videos] R2 read failed for', key, String(err));
    }
  }

  return new Response('Not found', { status: 404 });
};
