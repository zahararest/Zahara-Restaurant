// POST /admin/events-menu — Cloudflare Access gated. Manages the Events-page
// menu PDF (stored in R2 at images/events-menu, served publicly at /events-menu).
//   • file=<pdf>     — upload / replace the menu PDF (≤ 15 MB)
//   • action=delete  — remove it
//
// Bumps the venue's asset version on any change so the /events-menu?v=… URL
// changes and the live site fetches the new file.

import type { PagesFunction, R2Bucket } from '@cloudflare/workers-types';
import { checkAccess, type AuthEnv } from './auth';
import { bumpAssetVersion, EVENTS_MENU_OBJECT, type ContentEnv } from '../data/content';
import { adminSite, siteScope } from '../data/site';

interface Env extends AuthEnv, ContentEnv { IMAGES?: R2Bucket; }

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(status === 401 ? { 'WWW-Authenticate': 'Basic realm="Admin"' } : {}),
    },
  });
}

/** A PDF starts with "%PDF-". Guards against a mis-named upload. */
function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 &&
    bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 &&
    bytes[3] === 0x46 && bytes[4] === 0x2d;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return json({ ok: false, error: 'Unauthorized' }, 401);

  const site   = adminSite(request);
  const bucket = siteScope(env, site).images;
  if (!bucket) return json({ ok: false, error: 'IMAGES binding missing for this venue' }, 500);

  let form: FormData;
  try { form = await request.formData(); }
  catch { return json({ ok: false, error: 'Expected form data' }, 400); }

  // ── Delete ──────────────────────────────────────────────────────────────
  if (String(form.get('action') || '') === 'delete') {
    try { await bucket.delete(EVENTS_MENU_OBJECT); }
    catch (err) {
      console.error('[admin/events-menu] R2 delete failed', err);
      return json({ ok: false, error: 'Delete failed' }, 500);
    }
    await bumpAssetVersion(env, site);
    return json({ ok: true, hasPdf: false });
  }

  // ── Upload ──────────────────────────────────────────────────────────────
  type UploadedFile = { size: number; type?: string; arrayBuffer(): Promise<ArrayBuffer> };
  const rawEntry = form.get('file') as unknown;
  if (rawEntry === null || typeof rawEntry === 'string' ||
      typeof (rawEntry as UploadedFile)?.arrayBuffer !== 'function') {
    return json({ ok: false, error: 'Missing file field' }, 400);
  }
  const file = rawEntry as UploadedFile;
  if (file.size === 0)       return json({ ok: false, error: 'File is empty' }, 400);
  if (file.size > MAX_BYTES) return json({ ok: false, error: `File exceeds ${MAX_BYTES} bytes` }, 413);

  const buffer = new Uint8Array(await file.arrayBuffer());
  if (!isPdf(buffer)) return json({ ok: false, error: 'That file is not a PDF' }, 415);

  try {
    await bucket.put(EVENTS_MENU_OBJECT, buffer, { httpMetadata: { contentType: 'application/pdf' } });
  } catch (err) {
    console.error('[admin/events-menu] R2 put failed', err);
    return json({ ok: false, error: 'Storage failed' }, 500);
  }

  await bumpAssetVersion(env, site);
  return json({ ok: true, hasPdf: true, size: buffer.byteLength });
};
