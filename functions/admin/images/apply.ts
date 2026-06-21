// POST /admin/images/apply  — Basic-auth gated.
// Body: multipart/form-data OR urlencoded with fields:
//   key     — the target PHOTOS key to set (e.g. 'menuFood')
//   source  — the source PHOTOS key to copy the image FROM (e.g. 'hero')
//   variant — optional 'mobile' to copy/set the portrait crop instead
//
// Reuses an image that already exists on the site for another slot, so the
// owner doesn't have to re-upload a photo they've already uploaded
// somewhere else. The source image is resolved from R2 first
// (`images/{source}` — an existing override), falling back to the shipped
// default served at /photos/{sourceFilename}. Its bytes are written to the
// target slot's key, exactly as a fresh upload would.

import type { PagesFunction, R2Bucket } from '@cloudflare/workers-types';
import { checkAccess, type AuthEnv } from '../auth';
import { PHOTO_CATALOGUE } from '../../data/photos-map';
import { purgePhotoCache, type CachePurgeEnv } from './cache';
import { bumpAssetVersion, type ContentEnv } from '../../data/content';

interface Env extends AuthEnv, CachePurgeEnv, ContentEnv { IMAGES: R2Bucket; }

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(status === 401 ? { 'WWW-Authenticate': 'Basic realm="Admin"' } : {}),
    },
  });
}

/** Magic-byte sniff so we never store a non-image (mirrors upload.ts). */
function detectImageType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50)
    return 'image/webp';
  return null;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!env.IMAGES) return json({ ok: false, error: 'IMAGES binding missing' }, 500);

  // Accept either multipart/form-data or urlencoded.
  let form: FormData;
  try { form = await request.formData(); }
  catch { return json({ ok: false, error: 'Expected form data' }, 400); }

  const key    = String(form.get('key') || '');
  const source = String(form.get('source') || '');
  const isMobile = String(form.get('variant') || '') === 'mobile';

  const target = PHOTO_CATALOGUE.find((p) => p.key === key);
  if (!target) return json({ ok: false, error: `Unknown target key: ${key}` }, 400);
  const src = PHOTO_CATALOGUE.find((p) => p.key === source);
  if (!src) return json({ ok: false, error: `Unknown source key: ${source}` }, 400);
  if (key === source && !isMobile) return json({ ok: false, error: 'Source and target are the same' }, 400);

  const sourceObjectKey = isMobile ? `${source}__mobile` : source;
  const targetObjectKey = isMobile ? `${key}__mobile`    : key;

  // ── Resolve the source bytes: R2 override first, else the shipped file ──
  let buffer: Uint8Array | null = null;
  let contentType = 'image/jpeg';
  try {
    const obj = await env.IMAGES.get(`images/${sourceObjectKey}`);
    if (obj) {
      buffer = new Uint8Array(await obj.arrayBuffer());
      contentType = obj.httpMetadata?.contentType ?? contentType;
    }
  } catch (err) {
    console.warn('[admin/images/apply] R2 get failed', err);
  }

  if (!buffer) {
    if (isMobile) {
      // No portrait crop exists for the source — nothing to copy.
      return json({ ok: false, error: 'Source has no mobile photo to copy' }, 404);
    }
    // Fall back to the static/default image served at /photos/{filename}.
    try {
      const origin = new URL(request.url).origin;
      const res = await fetch(`${origin}/photos/${src.filename}`);
      if (!res.ok) return json({ ok: false, error: 'Could not read source image' }, 404);
      buffer = new Uint8Array(await res.arrayBuffer());
      contentType = res.headers.get('Content-Type') ?? contentType;
    } catch (err) {
      console.error('[admin/images/apply] static fetch failed', err);
      return json({ ok: false, error: 'Could not read source image' }, 502);
    }
  }

  if (!buffer || buffer.byteLength === 0) return json({ ok: false, error: 'Source image is empty' }, 400);
  if (buffer.byteLength > MAX_BYTES)      return json({ ok: false, error: 'Source image too large' }, 413);

  const detected = detectImageType(buffer);
  if (!detected) return json({ ok: false, error: 'Source is not a valid image' }, 415);

  try {
    await env.IMAGES.put(`images/${targetObjectKey}`, buffer, {
      httpMetadata: { contentType: detected },
    });
  } catch (err) {
    console.error('[admin/images/apply] R2 put failed', err);
    return json({ ok: false, error: 'Storage failed' }, 500);
  }

  // Same freshness handling as a fresh upload: bump the asset version so the
  // live site picks up the new image, and purge the edge for the desktop
  // filename + anything that falls back to it.
  await bumpAssetVersion(env);
  const origin = new URL(request.url).origin;
  if (!isMobile) {
    await purgePhotoCache(origin, target.filename, env);
    for (const dep of PHOTO_CATALOGUE) {
      if (dep.fallbackKey === key) await purgePhotoCache(origin, dep.filename, env);
    }
  }

  return json({ ok: true, key, source, variant: isMobile ? 'mobile' : 'desktop', size: buffer.byteLength });
};
