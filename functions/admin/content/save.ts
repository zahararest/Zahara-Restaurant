// POST /admin/content/save — Basic-auth gated.
// Body: JSON { map: { [key]: { he?, en? } }, popup?: { enabled, until, mode } }
// (full or partial).
//
// Merges the posted map into the single KV content record. A posted lang
// value that is an empty string clears that override; a missing lang is
// left untouched. Used by both the Content editor and the per-photo gallery
// caption inputs in /admin/images.
//
// When `popup` is present (the Content editor always sends it) the entry
// popup's on/off + auto-hide settings are stored in their own KV record.

import type { PagesFunction } from '@cloudflare/workers-types';
import { checkAccess, type AuthEnv } from '../auth';
import {
  readContentForEditor, writeContentSplit, mergeContent,
  readPopupConfigOwn, writePopupConfig,
  type ContentEnv, type PopupMode,
} from '../../data/content';
import { adminSite } from '../../data/site';

const POPUP_MODES = new Set<PopupMode>(['text', 'photo', 'both']);

type Env = AuthEnv & ContentEnv;

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
  if (!(await checkAccess(request, env))) return json({ ok: false, error: 'Unauthorized' }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Expected JSON body' }, 400);
  }

  const posted = (body && typeof body === 'object' && 'map' in body)
    ? (body as { map: unknown }).map
    : body;

  // Which venue is being edited (admin site-switch cookie). All reads + writes
  // below target that venue's OWN store, EXCEPT the reserve-portal keys: that
  // page is shared by both venues and built only once, so its copy is pinned to
  // the shared store and either venue can edit it (see writeContentSplit).
  const site     = adminSite(request);
  const existing = await readContentForEditor(env, site);
  const merged   = mergeContent(existing, posted);

  const ok = await writeContentSplit(env, site, merged);
  if (!ok) return json({ ok: false, error: 'No KV namespace bound for this venue' }, 500);

  // ── Entry popup visibility ────────────────────────────────────────────
  const postedPopup = (body && typeof body === 'object' && 'popup' in body)
    ? (body as { popup: unknown }).popup
    : undefined;
  if (postedPopup && typeof postedPopup === 'object') {
    const p       = postedPopup as Record<string, unknown>;
    const enabled = !!p.enabled;
    const prior = await readPopupConfigOwn(env, site);
    const mode  = POPUP_MODES.has(p.mode as PopupMode) ? (p.mode as PopupMode) : prior.mode;
    // The editor posts the moment the popup should hide itself, chosen on a
    // date + time picker (Israel time, converted in the browser). 0 / missing
    // = no end time. Anything past MAX_AHEAD is treated as a mis-typed year
    // rather than a real intention.
    const posted = typeof p.until === 'number' && isFinite(p.until) ? Math.round(p.until) : 0;
    const MAX_AHEAD = 5 * 365 * 86_400_000;
    const until = enabled && posted > 0 ? Math.min(posted, Date.now() + MAX_AHEAD) : 0;
    // hasImage is owned by the popup-image endpoints — preserve it here.
    // `days` is the retired setting this replaced; a save from here clears it.
    await writePopupConfig(env, site, { enabled, days: 0, until, mode, hasImage: prior.hasImage });
  }

  return json({ ok: true, count: Object.keys(merged).length });
};
