// Instagram long-lived token store + auto-refresh.
//
// Meta long-lived tokens (graph.instagram.com) live ~60 days. They can be
// rotated for a fresh 60 days any time AFTER they're 24h old and BEFORE they
// expire, via the ig_refresh_token grant. To keep the feed alive forever we
// store the live token in MENU_KV and let the hourly scheduler rotate it well
// before expiry. The INSTAGRAM_ACCESS_TOKEN secret is only a SEED — used on
// the first run (or if KV is ever cleared) to bootstrap the KV copy.
//
// IMPORTANT: the seed token in INSTAGRAM_ACCESS_TOKEN must be a FRESH, valid
// long-lived token. An already-expired token cannot be refreshed — Meta only
// rotates tokens that are still alive. So: install a new token once, and this
// keeps it from ever expiring again.

import type { KVNamespace } from '@cloudflare/workers-types';

const KEY            = 'instagram_token';
const REFRESH_BASE   = 'https://graph.instagram.com/refresh_access_token';
const DAY_MS         = 24 * 60 * 60 * 1000;
const SIXTY_DAYS_MS  = 60 * DAY_MS;
// Rotate once the token is within this window of expiry. 10 days gives plenty
// of margin even if the scheduler skips a few hourly runs.
const REFRESH_WINDOW_MS = 10 * DAY_MS;

export interface TokenEnv {
  MENU_KV?:                KVNamespace;
  INSTAGRAM_ACCESS_TOKEN?: string;
}

interface StoredToken {
  token:      string;
  expires_at: number; // epoch ms
}

async function readStored(env: TokenEnv): Promise<StoredToken | null> {
  if (!env.MENU_KV) return null;
  try {
    const raw = await env.MENU_KV.get(KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as StoredToken;
    if (t && typeof t.token === 'string' && typeof t.expires_at === 'number') return t;
  } catch (_) { /* bad JSON — treat as absent */ }
  return null;
}

/**
 * The token the live feed should use: the rotated KV copy when present and
 * unexpired, otherwise the seed secret (covers the gap before the first
 * scheduled run has seeded KV).
 */
export async function getValidToken(env: TokenEnv): Promise<string | undefined> {
  const stored = await readStored(env);
  if (stored && stored.expires_at > Date.now()) return stored.token;
  return env.INSTAGRAM_ACCESS_TOKEN;
}

export interface RefreshResult {
  ok:          boolean;
  reason:      string;
  expires_at?: number;
  status?:     number;
  body?:       string;
}

/**
 * Rotate the long-lived token if it's missing from KV or within the refresh
 * window. Cheap and safe to call hourly — it only calls Meta when actually due,
 * so the network hit happens roughly once every ~50 days.
 *
 * `force: true` rotates immediately (for the manual endpoint / testing). Note
 * Meta rejects refreshing a token younger than 24h, so forcing right after you
 * install a brand-new seed may return meta_rejected — that's expected; the
 * seeded token is still valid and will rotate normally later.
 */
export async function refreshInstagramToken(
  env: TokenEnv,
  opts: { force?: boolean } = {},
): Promise<RefreshResult> {
  if (!env.MENU_KV) return { ok: false, reason: 'no_kv' };

  const now = Date.now();
  let stored = await readStored(env);

  // First run: seed KV from the secret. Assume a fresh 60-day life (the owner
  // just installed it); a later rotation corrects the real expiry from Meta.
  if (!stored) {
    if (!env.INSTAGRAM_ACCESS_TOKEN) return { ok: false, reason: 'no_seed_token' };
    stored = { token: env.INSTAGRAM_ACCESS_TOKEN, expires_at: now + SIXTY_DAYS_MS };
    await env.MENU_KV.put(KEY, JSON.stringify(stored));
    if (!opts.force) return { ok: true, reason: 'seeded', expires_at: stored.expires_at };
  }

  const dueSoon = stored.expires_at - now < REFRESH_WINDOW_MS;
  if (!opts.force && !dueSoon) {
    return { ok: true, reason: 'not_due', expires_at: stored.expires_at };
  }

  let res: Response;
  try {
    res = await fetch(`${REFRESH_BASE}?grant_type=ig_refresh_token&access_token=${stored.token}`);
  } catch (err) {
    return { ok: false, reason: 'fetch_failed', body: String(err) };
  }

  const text = await res.text();
  if (!res.ok) {
    return { ok: false, reason: 'meta_rejected', status: res.status, body: text.slice(0, 300) };
  }

  let data: { access_token?: string; expires_in?: number };
  try { data = JSON.parse(text); } catch { return { ok: false, reason: 'bad_json', body: text.slice(0, 300) }; }
  if (!data.access_token) return { ok: false, reason: 'no_access_token' };

  const expires_at = now + (data.expires_in ? data.expires_in * 1000 : SIXTY_DAYS_MS);
  await env.MENU_KV.put(KEY, JSON.stringify({ token: data.access_token, expires_at } as StoredToken));
  return { ok: true, reason: 'rotated', expires_at };
}
