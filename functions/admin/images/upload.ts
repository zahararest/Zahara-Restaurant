// POST /admin/images/upload  — Basic-auth gated.
// Body: multipart/form-data with fields:
//   key  — the PHOTOS key being overridden (e.g. 'hero')
//   file — the image file (image/jpeg | image/png | image/webp, ≤ 5MB)
//
// Stores the image in R2 at `images/{key}` with its original
// Content-Type as metadata so the middleware can serve it back.

import type { PagesFunction, R2Bucket } from '@cloudflare/workers-types';
import { checkAuth, type AuthEnv } from '../auth';
import { PHOTO_CATALOGUE } from '../../data/photos-map';
import { purgePhotoCache, type CachePurgeEnv } from './cache';
import { bumpAssetVersion, type ContentEnv } from '../../data/content';

interface Env extends AuthEnv, CachePurgeEnv, ContentEnv { IMAGES: R2Bucket; }

const MAX_BYTES = 10 * 1024 * 1024;  // 10 MB

const VALID_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(status === 401 ? { 'WWW-Authenticate': 'Basic realm="Admin"' } : {}),
    },
  });
}

/** Verify the file's magic bytes really match an image. Defends
 *  against renamed-extension uploads. */
function detectImageType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
  // WebP: 52 49 46 46 ... 57 45 42 50
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50)
    return 'image/webp';
  return null;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!checkAuth(request, env)) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!env.IMAGES) return json({ ok: false, error: 'IMAGES binding missing' }, 500);

  let form: FormData;
  try { form = await request.formData(); }
  catch { return json({ ok: false, error: 'Expected multipart/form-data' }, 400); }

  const key = String(form.get('key') || '');
  const meta = PHOTO_CATALOGUE.find((p) => p.key === key);
  if (!meta) {
    return json({ ok: false, error: `Unknown image key: ${key}` }, 400);
  }

  // Optional mobile (portrait) variant — stored separately and served on
  // phones via /photos-m. Only allowed for photos flagged `mobile`.
  const isMobile   = String(form.get('variant') || '') === 'mobile';
  if (isMobile && !meta.mobile) {
    return json({ ok: false, error: 'This photo has no mobile variant' }, 400);
  }
  const objectKey  = isMobile ? `${key}__mobile` : key;

  // The Workers type lib types FormData values as `string`, with no `File`
  // value to `instanceof`. At runtime an uploaded file is a Blob-like with
  // these members, so we guard structurally and cast to that shape.
  type UploadedFile = { size: number; type?: string; name?: string; arrayBuffer(): Promise<ArrayBuffer> };
  const rawEntry = form.get('file') as unknown;
  if (rawEntry === null || typeof rawEntry === 'string' ||
      typeof (rawEntry as UploadedFile)?.arrayBuffer !== 'function') {
    return json({ ok: false, error: 'Missing file field' }, 400);
  }
  const file = rawEntry as UploadedFile;
  if (file.size === 0) {
    return json({ ok: false, error: 'File is empty' }, 400);
  }
  if (file.size > MAX_BYTES) {
    return json({ ok: false, error: `File exceeds ${MAX_BYTES} bytes` }, 413);
  }
  if (file.type && !VALID_TYPES.has(file.type)) {
    return json({ ok: false, error: `Unsupported content-type: ${file.type}` }, 415);
  }

  const buffer = new Uint8Array(await file.arrayBuffer());
  const detected = detectImageType(buffer);
  if (!detected) {
    return json({ ok: false, error: 'File does not look like an image' }, 415);
  }

  try {
    await env.IMAGES.put(`images/${objectKey}`, buffer, {
      httpMetadata: { contentType: detected },
    });
  } catch (err) {
    console.error('[admin/images/upload] R2 put failed', err);
    return json({ ok: false, error: 'Storage failed' }, 500);
  }

  // Bump the asset version so every resized URL changes → the live site
  // (desktop AND mobile variants) gets the new image immediately, without
  // depending on a cache purge.
  await bumpAssetVersion(env);

  // Colo purge for the desktop filename + anything that falls back to it.
  // (Mobile variants ride the version bump, so no separate purge needed.)
  const origin = new URL(request.url).origin;
  if (!isMobile) {
    await purgePhotoCache(origin, meta.filename, env);
    for (const dep of PHOTO_CATALOGUE) {
      if (dep.fallbackKey === key) await purgePhotoCache(origin, dep.filename, env);
    }
  }

  return json({ ok: true, key, variant: isMobile ? 'mobile' : 'desktop', size: buffer.byteLength, type: detected });
};
