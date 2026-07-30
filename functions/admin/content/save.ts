// POST /admin/content/save — Basic-auth gated.
// Body: JSON { map: { [key]: { he?, en? } }, popup?: { enabled, days } }
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
  readPopupConfigOwn, writePopupConfig, popupActive,
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
    const days    = typeof p.days === 'number' && isFinite(p.days)
      ? Math.min(365, Math.max(0, Math.round(p.days)))
      : 0;
    const prior = await readPopupConfigOwn(env, site);
    const mode  = POPUP_MODES.has(p.mode as PopupMode) ? (p.mode as PopupMode) : prior.mode;
    // A fresh auto-hide window starts when the popup is (re)turned on or the
    // day count changes. An unrelated content save re-posts the same
    // settings and must NOT extend a window that's already running.
    const startNew = !popupActive(prior) || days !== prior.days || !prior.until;
    const until = enabled && days > 0
      ? (startNew ? Date.now() + days * 86_400_000 : prior.until)
      : 0;
    // hasImage is owned by the popup-image endpoints — preserve it here.
    await writePopupConfig(env, site, { enabled, days, until, mode, hasImage: prior.hasImage });
  }

  return json({ ok: true, count: Object.keys(merged).length });
};
