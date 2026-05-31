// POST /admin/images/delete — removes an R2 override so the photo
// falls back to its default file in /public/photos/.
// Body: form-data { key }

import type { PagesFunction, R2Bucket } from '@cloudflare/workers-types';
import { checkAuth, type AuthEnv } from '../auth';
import { PHOTO_CATALOGUE } from '../../data/photos-map';
import { purgePhotoCache } from './cache';

interface Env extends AuthEnv { IMAGES: R2Bucket; }

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(status === 401 ? { 'WWW-Authenticate': 'Basic realm="Admin"' } : {}),
    },
  });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!checkAuth(request, env)) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!env.IMAGES) return json({ ok: false, error: 'IMAGES binding missing' }, 500);

  let key = '';
  try {
    const form = await request.formData();
    key = String(form.get('key') || '');
  } catch {
    return json({ ok: false, error: 'Expected form data' }, 400);
  }

  const meta = PHOTO_CATALOGUE.find((p) => p.key === key);
  if (!meta) return json({ ok: false, error: 'Unknown key' }, 400);

  try {
    await env.IMAGES.delete(`images/${key}`);
  } catch (err) {
    console.error('[admin/images/delete] R2 delete failed', err);
    return json({ ok: false, error: 'Storage failed' }, 500);
  }

  const origin = new URL(request.url).origin;
  await purgePhotoCache(origin, meta.filename);
  for (const dep of PHOTO_CATALOGUE) {
    if (dep.fallbackKey === key) await purgePhotoCache(origin, dep.filename);
  }

  return json({ ok: true, key });
};
