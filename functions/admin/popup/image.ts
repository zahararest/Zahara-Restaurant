// POST /admin/popup/image — Cloudflare Access gated. Manages the single photo
// used by the entry popup (stored in R2 at `images/popup`, served publicly at
// /popup-image). Three actions, chosen by the posted fields:
//
//   • file=<image>        — upload a new popup photo (JPG / PNG / WebP, ≤10MB)
//   • source=<photoKey>   — reuse a photo already on the site (copies its bytes)
//   • action=delete       — remove the popup photo
//
// On any change it flips the `hasImage` flag on the popup config (so the
// middleware knows whether to inject the image) and bumps the asset version
// (so /popup-image?v=… changes and the live site fetches the new file).

import type { PagesFunction, R2Bucket } from '@cloudflare/workers-types';
import { checkAccess, type AuthEnv } from '../auth';
import { PHOTO_CATALOGUE } from '../../data/photos-map';
import {
  readPopupConfigOwn, writePopupConfig, bumpAssetVersion,
  POPUP_IMAGE_OBJECT, type ContentEnv,
} from '../../data/content';
import { adminSite, siteScope, withSiteParam, type Site } from '../../data/site';

interface Env extends AuthEnv, ContentEnv { IMAGES?: R2Bucket; }

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

async function setHasImage(env: Env, site: Site, hasImage: boolean): Promise<void> {
  const prior = await readPopupConfigOwn(env, site);
  await writePopupConfig(env, site, { ...prior, hasImage });
  await bumpAssetVersion(env, site);
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return json({ ok: false, error: 'Unauthorized' }, 401);

  // The venue being edited — the popup photo lives in its own bucket + config.
  const site   = adminSite(request);
  const bucket = siteScope(env, site).images;
  if (!bucket) return json({ ok: false, error: 'IMAGES binding missing for this venue' }, 500);

  let form: FormData;
  try { form = await request.formData(); }
  catch { return json({ ok: false, error: 'Expected form data' }, 400); }

  // ── Delete ────────────────────────────────────────────────────────────
  if (String(form.get('action') || '') === 'delete') {
    try { await bucket.delete(POPUP_IMAGE_OBJECT); }
    catch (err) {
      console.error('[admin/popup/image] R2 delete failed', err);
      return json({ ok: false, error: 'Delete failed' }, 500);
    }
    await setHasImage(env, site, false);
    return json({ ok: true, hasImage: false });
  }

  // ── Resolve bytes: a fresh upload, or a copy of an existing site photo ──
  let buffer: Uint8Array | null = null;

  const source = String(form.get('source') || '');
  if (source) {
    const src = PHOTO_CATALOGUE.find((p) => p.key === source);
    if (!src) return json({ ok: false, error: `Unknown source key: ${source}` }, 400);
    // Prefer this venue's R2 override; fall back to what it displays for that
    // slot (its own R2 → Zahara → static) via ?site.
    try {
      const obj = await bucket.get(`images/${source}`);
      if (obj) buffer = new Uint8Array(await obj.arrayBuffer());
    } catch (err) {
      console.warn('[admin/popup/image] R2 get failed', err);
    }
    if (!buffer) {
      try {
        const origin = new URL(request.url).origin;
        const res = await fetch(withSiteParam(`${origin}/photos/${src.filename}`, site));
        if (!res.ok) return json({ ok: false, error: 'Could not read source image' }, 404);
        buffer = new Uint8Array(await res.arrayBuffer());
      } catch (err) {
        console.error('[admin/popup/image] static fetch failed', err);
        return json({ ok: false, error: 'Could not read source image' }, 502);
      }
    }
  } else {
    // A direct file upload.
    type UploadedFile = { size: number; type?: string; arrayBuffer(): Promise<ArrayBuffer> };
    const rawEntry = form.get('file') as unknown;
    if (rawEntry === null || typeof rawEntry === 'string' ||
        typeof (rawEntry as UploadedFile)?.arrayBuffer !== 'function') {
      return json({ ok: false, error: 'Missing file field' }, 400);
    }
    const file = rawEntry as UploadedFile;
    if (file.size === 0)          return json({ ok: false, error: 'File is empty' }, 400);
    if (file.size > MAX_BYTES)    return json({ ok: false, error: `File exceeds ${MAX_BYTES} bytes` }, 413);
    buffer = new Uint8Array(await file.arrayBuffer());
  }

  if (!buffer || buffer.byteLength === 0) return json({ ok: false, error: 'Image is empty' }, 400);
  if (buffer.byteLength > MAX_BYTES)      return json({ ok: false, error: 'Image too large' }, 413);

  const detected = detectImageType(buffer);
  if (!detected) return json({ ok: false, error: 'That file is not a valid image' }, 415);

  try {
    await bucket.put(POPUP_IMAGE_OBJECT, buffer, { httpMetadata: { contentType: detected } });
  } catch (err) {
    console.error('[admin/popup/image] R2 put failed', err);
    return json({ ok: false, error: 'Storage failed' }, 500);
  }

  await setHasImage(env, site, true);
  return json({ ok: true, hasImage: true, size: buffer.byteLength, type: detected });
};
