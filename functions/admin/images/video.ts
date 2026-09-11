// POST /admin/images/video — upload or remove the video a slot shows.
//
// Body: multipart/form-data
//   key      — the catalogue key (e.g. 'hero')
//   variant  — 'desktop' (default) | 'mobile'
//   action   — 'delete' to remove; otherwise a `file` is expected
//   file     — video/mp4 or video/webm, ≤ MAX_BYTES
//
// Deliberately a SEPARATE route from images/upload. That route runs every
// upload through a canvas crop editor and re-encodes it as a JPEG; a video has
// no business going anywhere near that path, and folding the two would mean a
// dozen `if (isVideo)` branches through code whose whole job is stills.
//
// The still is never touched. Uploading a video sets the slot's flag in the
// media manifest; removing it clears the flag, and the photograph that was
// always there underneath comes back. See functions/data/media.ts.

import type { PagesFunction, R2Bucket } from '@cloudflare/workers-types';
import { checkAccess, type AuthEnv } from '../auth';
import { PHOTO_CATALOGUE, photoSite } from '../../data/photos-map';
import { bumpAssetVersion, type ContentEnv } from '../../data/content';
import { setMediaSlot, videoObjectKey, type MediaEnv, type MediaVariant } from '../../data/media';
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
      ...(status === 401 ? { 'WWW-Authenticate': 'Basic realm="Admin"' } : {}),
    },
  });
}

/** Magic-byte check, so a renamed .mov or a mislabelled upload is caught here
 *  rather than by a browser that silently refuses to play it.
 *   MP4 / MOV — an ISO-BMFF 'ftyp' box at offset 4.
 *   WebM      — the EBML header 1A 45 DF A3. */
function detectVideoType(bytes: Uint8Array): string | null {
  if (bytes.length < 16) return null;
  if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) return 'video/webm';
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    // 'qt  ' brand is a QuickTime .mov. Browsers play the common H.264 ones,
    // but not reliably — served as mp4 it works wherever it is going to work.
    return 'video/mp4';
  }
  return null;
}

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

  // A slot shows a video because it HAS a desktop video; the portrait cut is a
  // better frame for phones, not a second, independent decision. Allowing a
  // phone-only video would mean a slot that is a video on one screen and a
  // photograph on the other — which the page cannot decide before it renders,
  // so it would have to ship both and throw one away.
  const action = String(form.get('action') || '');
  if (variant === 'mobile' && action !== 'delete') {
    const hasDesktop = await bucket.head(`images/${videoObjectKey(key, 'desktop')}`).catch(() => null);
    if (!hasDesktop) {
      return json({ ok: false, error: 'Upload the main video first — the phone cut replaces it on small screens.' }, 400);
    }
  }

  // ── Remove ───────────────────────────────────────────────────────────────
  if (action === 'delete') {
    try { await bucket.delete(`images/${objectKey}`); }
    catch (err) {
      console.error('[admin/images/video] R2 delete failed', err);
      return json({ ok: false, error: 'Storage failed' }, 500);
    }
    // Flag first-class: the page reads the manifest, not the bucket, so the
    // slot keeps rendering a <video> until this is cleared.
    await setMediaSlot(env, site, key, variant, false);
    // Removing the main video takes the portrait cut with it — on its own it
    // would be a phone-only video the page has no way to show (see above).
    if (variant === 'desktop') {
      try { await bucket.delete(`images/${videoObjectKey(key, 'mobile')}`); }
      catch (err) { console.warn('[admin/images/video] orphan cleanup failed', String(err)); }
      await setMediaSlot(env, site, key, 'mobile', false);
    }
    await bumpAssetVersion(env, site);
    return json({ ok: true, key, variant, video: false });
  }

  // ── Upload ───────────────────────────────────────────────────────────────
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

  try {
    await bucket.put(`images/${objectKey}`, buffer, { httpMetadata: { contentType: detected } });
  } catch (err) {
    console.error('[admin/images/video] R2 put failed', err);
    return json({ ok: false, error: 'Storage failed' }, 500);
  }

  await setMediaSlot(env, site, key, variant, true);
  // Changes every ?v= on the page, which is what makes the swap show up now
  // instead of whenever the edge cache happens to expire.
  await bumpAssetVersion(env, site);

  return json({ ok: true, key, variant, video: true, size: buffer.byteLength, type: detected });
};
