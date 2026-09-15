// POST /admin/images/video — the video a slot can show instead of its still.
//
// Body: multipart/form-data
//   key      — the catalogue key (e.g. 'hero')
//   variant  — 'desktop' (default) | 'mobile'
//   action   — what to do:
//                (omitted) upload the `file` field and show it
//                'show'    show the video that is already in the bucket
//                'hide'    go back to the photograph, KEEPING the video
//                'delete'  remove the video file for good
//                'options' save fit / position / speed (desktop record)
//   file     — video/mp4 or video/webm, ≤ MAX_BYTES (upload only)
//
// GET /admin/images/video?key=… — what this slot has: whether a video file
// exists for each frame, whether it is being shown, and its framing options.
//
// Deliberately a SEPARATE route from images/upload. That route runs every
// upload through a canvas crop editor and re-encodes it as a JPEG; a video has
// no business going anywhere near that path, and folding the two would mean a
// dozen `if (isVideo)` branches through code whose whole job is stills.
//
// The still is never touched, and neither is the video unless 'delete' says
// so: showing and hiding are flags in the media manifest, so the owner can go
// back and forth without re-uploading. See functions/data/media.ts.

import type { PagesFunction, R2Bucket } from '@cloudflare/workers-types';
import { checkAccess, type AuthEnv } from '../auth';
import { PHOTO_CATALOGUE, photoSite } from '../../data/photos-map';
import { bumpAssetVersion, type ContentEnv } from '../../data/content';
import {
  readMediaMap, setMediaSlot, setMediaOptions, clearMediaSlot,
  videoObjectKey, isPosition, isRate, DEFAULT_POSITION,
  type MediaEnv, type MediaVariant,
} from '../../data/media';
import { adminSite, siteScope } from '../../data/site';

interface Env extends AuthEnv, ContentEnv, MediaEnv { IMAGES?: R2Bucket; }

/** 40 MB. Big enough for the 10–20s loops these slots are for, small enough
 *  that a phone on hotel wifi can still upload one — and that nobody
 *  accidentally puts a 4K master on the home page. */
const MAX_BYTES = 40 * 1024 * 1024;

const VALID_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...(status === 401 ? { 'WWW-Authenticate': 'Basic realm="Admin"' } : {}),
    },
  });
}

/** Read a four-character box/brand code at an offset. */
function fourcc(bytes: Uint8Array, at: number): string {
  if (at + 4 > bytes.length) return '';
  return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
}

/** Magic-byte check, so a renamed .mov or a mislabelled upload is caught here
 *  rather than by a browser that silently refuses to play it.
 *   MP4 / MOV — an ISO-BMFF 'ftyp' box at offset 4.
 *   WebM      — the EBML header 1A 45 DF A3. */
function detectVideoType(bytes: Uint8Array): string | null {
  if (bytes.length < 16) return null;
  if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) return 'video/webm';
  if (fourcc(bytes, 4) === 'ftyp') {
    // 'qt  ' brand is a QuickTime .mov. Browsers play the common H.264 ones,
    // but not reliably — served as mp4 it works wherever it is going to work.
    return 'video/mp4';
  }
  return null;
}

/** True when the file's ISO-BMFF brands say HEVC / H.265.
 *
 *  This is the format an iPhone records in by default, and it is the single
 *  most likely reason a video that uploaded perfectly plays nowhere: Safari
 *  decodes it, Chrome and Firefox do not, so the owner sees it on their phone,
 *  the site looks broken to everyone else, and nothing anywhere reports an
 *  error. Cheaper to refuse it here with an explanation than to let it go live.
 *
 *  Only the brand list in the leading `ftyp` box is read — a few dozen bytes,
 *  not a scan of a 40 MB buffer. The browser-side check in /admin/images is
 *  the thorough one; this is the backstop for anything that reaches the API
 *  another way. */
function looksLikeHevc(bytes: Uint8Array): boolean {
  if (fourcc(bytes, 4) !== 'ftyp') return false;
  const size = Math.min((bytes[0] << 24 | bytes[1] << 16 | bytes[2] << 8 | bytes[3]) >>> 0, 256);
  const brands: string[] = [];
  for (let at = 8; at + 4 <= size && at + 4 <= bytes.length; at += 4) brands.push(fourcc(bytes, at));
  const hevc = new Set(['hvc1', 'hev1', 'hvcC', 'hevc', 'hevx']);
  const good = new Set(['avc1', 'avcC', 'mp41', 'mp42', 'isom', 'iso2', 'iso4', 'iso5', 'iso6', 'M4V ', 'dby1']);
  // A file that claims HEVC AND a baseline mp4 brand usually carries an H.264
  // track too, so only refuse the ones with no fallback brand at all.
  return brands.some((b) => hevc.has(b)) && !brands.some((b) => good.has(b));
}

/** Everything the admin needs to draw one slot's video controls. */
async function slotState(env: Env, site: ReturnType<typeof adminSite>, key: string) {
  const bucket = siteScope(env, site).images;
  const [media, desktop, mobile] = await Promise.all([
    readMediaMap(env, site),
    bucket ? bucket.head(`images/${videoObjectKey(key, 'desktop')}`).catch(() => null) : null,
    bucket ? bucket.head(`images/${videoObjectKey(key, 'mobile')}`).catch(() => null) : null,
  ]);
  const slot = media[key] ?? {};
  return {
    key,
    // Has a FILE — which is what makes "show it again" possible.
    hasFile:       !!desktop,
    hasMobileFile: !!mobile,
    // Is SHOWN — which is what a visitor sees.
    showing:       slot.d === 'video',
    showingMobile: slot.m === 'video',
    size:          desktop?.size ?? 0,
    mobileSize:    mobile?.size ?? 0,
    type:          desktop?.httpMetadata?.contentType ?? '',
    uploaded:      desktop?.uploaded ? new Date(desktop.uploaded).toISOString() : '',
    fit:           slot.fit === 'contain' ? 'contain' : 'cover',
    pos:           slot.pos ?? DEFAULT_POSITION,
    rate:          slot.rate ?? 1,
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return json({ ok: false, error: 'Unauthorized' }, 401);
  const key  = new URL(request.url).searchParams.get('key') || '';
  const meta = PHOTO_CATALOGUE.find((p) => p.key === key);
  if (!meta || !meta.video) return json({ ok: false, error: `Unknown video slot: ${key}` }, 400);
  const site = photoSite(adminSite(request), key);
  return json({ ok: true, ...(await slotState(env, site, key)) });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return json({ ok: false, error: 'Unauthorized' }, 401);

  const editing = adminSite(request);

  let form: FormData;
  try { form = await request.formData(); }
  catch { return json({ ok: false, error: 'Expected multipart/form-data' }, 400); }

  const key  = String(form.get('key') || '');
  const meta = PHOTO_CATALOGUE.find((p) => p.key === key);
  if (!meta)       return json({ ok: false, error: `Unknown image key: ${key}` }, 400);
  if (!meta.video) return json({ ok: false, error: `${meta.label} is not a slot that can show a video` }, 400);

  const variant: MediaVariant = String(form.get('variant') || '') === 'mobile' ? 'mobile' : 'desktop';
  if (variant === 'mobile' && !meta.mobile) {
    return json({ ok: false, error: `${meta.label} has no separate phone frame` }, 400);
  }

  const site   = photoSite(editing, key);
  const bucket = siteScope(env, site).images;
  if (!bucket) return json({ ok: false, error: 'IMAGES binding missing for this venue' }, 500);

  const objectKey = videoObjectKey(key, variant);
  const action    = String(form.get('action') || '');

  /** Every path ends the same way: bump the asset version so every ?v= on the
   *  page changes, then hand back the slot's full state so the admin redraws
   *  from what the server actually has rather than from what it hoped. */
  const finish = async (extra: object = {}) => {
    await bumpAssetVersion(env, site);
    return json({ ok: true, ...(await slotState(env, site, key)), ...extra });
  };

  // ── Framing options ──────────────────────────────────────────────────────
  // One record per slot, not per frame: the phone cut is a better crop of the
  // same clip, not a separately-directed shot, so "how it sits in its frame"
  // is one answer.
  if (action === 'options') {
    const rawFit  = String(form.get('fit')  || '');
    const rawPos  = String(form.get('pos')  || '');
    const rawRate = form.get('rate');
    const opts: Parameters<typeof setMediaOptions>[3] = {};
    if (rawFit)  opts.fit = rawFit === 'contain' ? 'contain' : 'cover';
    if (rawPos)  {
      if (!isPosition(rawPos)) return json({ ok: false, error: 'Bad focal point' }, 400);
      opts.pos = rawPos;
    }
    if (rawRate !== null) {
      const n = Number(rawRate);
      if (!isRate(n)) return json({ ok: false, error: 'Speed must be between 0.25× and 2×' }, 400);
      opts.rate = n;
    }
    try { await setMediaOptions(env, site, key, opts); }
    catch (err) {
      console.error('[admin/images/video] options save failed', err);
      return json({ ok: false, error: `Could not save: ${String((err as Error).message || err)}` }, 500);
    }
    return finish();
  }

  // ── Show the video that is already there ─────────────────────────────────
  if (action === 'show') {
    const head = await bucket.head(`images/${objectKey}`).catch(() => null);
    if (!head) {
      return json({
        ok: false,
        error: variant === 'mobile'
          ? 'There is no phone cut to show — upload one first.'
          : 'There is no video for this slot yet — upload one first.',
      }, 404);
    }
    // A phone cut on its own is a slot that is a video on small screens and a
    // photograph on large ones, which the page cannot decide before it renders
    // — the same rule the upload path enforces, applied to the switch.
    if (variant === 'mobile') {
      const state = await slotState(env, site, key);
      if (!state.showing) {
        return json({ ok: false, error: 'Show the main video first — the phone cut replaces it on small screens.' }, 400);
      }
    }
    try {
      await setMediaSlot(env, site, key, variant, true);
      // Bringing the main video back brings its phone cut with it: hiding took
      // the pair, so showing returns the pair, rather than leaving the owner to
      // notice that phones are still on the photograph.
      if (variant === 'desktop') {
        const cut = await bucket.head(`images/${videoObjectKey(key, 'mobile')}`).catch(() => null);
        if (cut) await setMediaSlot(env, site, key, 'mobile', true);
      }
    } catch (err) {
      console.error('[admin/images/video] KV write failed', err);
      return json({ ok: false, error: `Could not save: ${String((err as Error).message || err)}` }, 500);
    }
    return finish();
  }

  // ── Go back to the photograph — the video file STAYS ─────────────────────
  if (action === 'hide') {
    try {
      await setMediaSlot(env, site, key, variant, false);
      // Hiding the main video hides the phone cut with it: on its own the cut
      // would be a phone-only video the page has no way to show (see below).
      if (variant === 'desktop') await setMediaSlot(env, site, key, 'mobile', false);
    } catch (err) {
      console.error('[admin/images/video] KV write failed', err);
      return json({ ok: false, error: `Could not save: ${String((err as Error).message || err)}` }, 500);
    }
    return finish();
  }

  // ── Delete the file for good ─────────────────────────────────────────────
  if (action === 'delete') {
    try { await bucket.delete(`images/${objectKey}`); }
    catch (err) {
      console.error('[admin/images/video] R2 delete failed', err);
      return json({ ok: false, error: 'Storage failed' }, 500);
    }
    try {
      // Deleting the main video takes the portrait cut with it — on its own it
      // would be a phone-only video the page has no way to show (see below) —
      // and clears the framing settings, so the next upload starts clean.
      if (variant === 'desktop') {
        try { await bucket.delete(`images/${videoObjectKey(key, 'mobile')}`); }
        catch (err) { console.warn('[admin/images/video] orphan cleanup failed', String(err)); }
        await clearMediaSlot(env, site, key);
      } else {
        await setMediaSlot(env, site, key, 'mobile', false);
      }
    } catch (err) {
      console.error('[admin/images/video] KV write failed', err);
      return json({ ok: false, error: `Deleted the file, but the change could not be saved: ${String((err as Error).message || err)}` }, 500);
    }
    return finish();
  }

  // ── Upload ───────────────────────────────────────────────────────────────
  // A slot shows a video because it HAS a desktop video; the portrait cut is a
  // better frame for phones, not a second, independent decision. Allowing a
  // phone-only video would mean a slot that is a video on one screen and a
  // photograph on the other — which the page cannot decide before it renders,
  // so it would have to ship both and throw one away.
  if (variant === 'mobile') {
    const hasDesktop = await bucket.head(`images/${videoObjectKey(key, 'desktop')}`).catch(() => null);
    if (!hasDesktop) {
      return json({ ok: false, error: 'Upload the main video first — the phone cut replaces it on small screens.' }, 400);
    }
  }

  type UploadedFile = { size: number; type?: string; name?: string; arrayBuffer(): Promise<ArrayBuffer> };
  const rawEntry = form.get('file') as unknown;
  if (rawEntry === null || typeof rawEntry === 'string' ||
      typeof (rawEntry as UploadedFile)?.arrayBuffer !== 'function') {
    return json({ ok: false, error: 'Missing file field' }, 400);
  }
  const file = rawEntry as UploadedFile;
  if (file.size === 0)         return json({ ok: false, error: 'File is empty' }, 400);
  if (file.size > MAX_BYTES)   return json({ ok: false, error: `Video is larger than ${Math.round(MAX_BYTES / 1024 / 1024)} MB` }, 413);
  if (file.type && !VALID_TYPES.has(file.type)) {
    return json({ ok: false, error: `Unsupported video type: ${file.type}` }, 415);
  }

  const buffer   = new Uint8Array(await file.arrayBuffer());
  const detected = detectVideoType(buffer);
  if (!detected) return json({ ok: false, error: 'That file does not look like an MP4 or WebM video' }, 415);
  if (looksLikeHevc(buffer)) {
    return json({
      ok: false,
      error: 'That video is HEVC (H.265) — iPhones record this by default and ' +
             'Chrome, Edge and Firefox cannot play it, so most visitors would ' +
             'see the photograph instead. On the iPhone: Settings → Camera → ' +
             'Formats → “Most Compatible”, then re-record or re-export the clip.',
    }, 415);
  }

  try {
    await bucket.put(`images/${objectKey}`, buffer, { httpMetadata: { contentType: detected } });
  } catch (err) {
    console.error('[admin/images/video] R2 put failed', err);
    return json({ ok: false, error: 'Storage failed' }, 500);
  }

  // Read it straight back. A put that reported success but stored nothing would
  // otherwise leave the manifest pointing at a 404, which is the one failure
  // mode the page cannot recover from on its own.
  const stored = await bucket.head(`images/${objectKey}`).catch(() => null);
  if (!stored) {
    return json({ ok: false, error: 'The video did not save. Please try again.' }, 500);
  }

  try { await setMediaSlot(env, site, key, variant, true); }
  catch (err) {
    console.error('[admin/images/video] KV write failed', err);
    return json({
      ok: false,
      error: `The video uploaded, but switching the slot to it failed: ${String((err as Error).message || err)}`,
    }, 500);
  }

  return finish({ size: buffer.byteLength, type: detected });
};
