// Microsoft Graph access for the OneDrive menu sync.
//
// The site's OneDrive files require authentication (anonymous/share links
// can't be downloaded by a server — proven during setup), so we use the
// owner's one-time OAuth grant: a refresh token kept in KV. On each sync we
// trade the refresh token for a short-lived access token, then download the
// menu .docx files by their drive-item id.
//
// Secrets live in the MENU_KV namespace (NOT in wrangler.toml / env), because
// the refresh token ROTATES: Microsoft returns a fresh refresh token on every
// exchange and eventually invalidates the old one, so we must write the new
// value straight back to KV. Env vars are immutable per-deploy and can't hold
// a rotating value.
//
// Required MENU_KV keys (set once via `wrangler kv key put … --namespace-id`):
//   client_id      — Azure app "Application (client) ID"
//   client_secret  — Azure app client-secret VALUE
//   refresh_token  — from the one-time OAuth consent (offline_access)

export interface GraphEnv {
  MENU_KV: KVNamespace;
}

// Personal Microsoft accounts (consumer OneDrive) authenticate against the
// "consumers" tenant. Verified working for this account during setup.
const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const SCOPE     = 'Files.Read offline_access';

interface TokenResponse {
  access_token?:  string;
  refresh_token?: string;
  expires_in?:    number;
  error?:         string;
  error_description?: string;
}

/**
 * Exchange the stored refresh token for an access token, persisting the
 * rotated refresh token back to KV. Throws with a readable message on
 * failure (missing creds, revoked grant, etc.).
 *
 * Call ONCE per sync run and reuse the token for every file — running two
 * exchanges concurrently would race on the rotating refresh token.
 */
export async function getAccessToken(env: GraphEnv): Promise<string> {
  const [clientId, clientSecret, refreshToken] = await Promise.all([
    env.MENU_KV.get('client_id'),
    env.MENU_KV.get('client_secret'),
    env.MENU_KV.get('refresh_token'),
  ]);

  if (!clientId || !clientSecret || !refreshToken) {
    const missing = [
      !clientId     && 'client_id',
      !clientSecret && 'client_secret',
      !refreshToken && 'refresh_token',
    ].filter(Boolean).join(', ');
    throw new Error(`Graph not configured — missing in MENU_KV: ${missing}`);
  }

  const body = new URLSearchParams({
    client_id:     clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type:    'refresh_token',
    scope:         SCOPE,
  });

  const res  = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json() as TokenResponse;

  if (!res.ok || !data.access_token) {
    const detail = data.error_description || data.error || `HTTP ${res.status}`;
    // AADSTS700082/70043 = refresh token expired/revoked → owner must re-consent.
    throw new Error(`Token exchange failed: ${detail}`);
  }

  // Persist the rotated refresh token immediately so the next run has a valid
  // one. If Graph didn't return a new token, the old one stays valid.
  if (data.refresh_token && data.refresh_token !== refreshToken) {
    await env.MENU_KV.put('refresh_token', data.refresh_token);
  }

  return data.access_token;
}

export interface DriveFile { name: string; bytes: ArrayBuffer; }

/**
 * Download a drive item's content by id, also returning its filename (used
 * by the parser's date-from-filename fallback). `fileId` is the OneDrive
 * item id, e.g. "142F90612FF3D8AC!s75f06bc0c06c4c4d81f35600066b1d12".
 */
export async function downloadFile(fileId: string, accessToken: string): Promise<DriveFile> {
  const auth = { Authorization: `Bearer ${accessToken}` };
  const base = `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(fileId)}`;

  const metaRes = await fetch(`${base}?select=name,size`, { headers: auth });
  if (!metaRes.ok) {
    const t = await metaRes.text().catch(() => '');
    throw new Error(`Drive item ${fileId} not found (HTTP ${metaRes.status}) ${t.slice(0, 160)}`);
  }
  const meta = await metaRes.json() as { name?: string };

  const contentRes = await fetch(`${base}/content`, { headers: auth, redirect: 'follow' });
  if (!contentRes.ok) {
    throw new Error(`Download failed for ${fileId} (HTTP ${contentRes.status})`);
  }
  const bytes = await contentRes.arrayBuffer();
  return { name: meta.name || '', bytes };
}

/**
 * Extract a OneDrive drive-item id from a pasted share/view link. The admin
 * UI lets the owner paste any OneDrive link for a menu; Graph needs the bare
 * item id. Links carry it as `id=` or `resid=` (URL-encoded `!` → %21). If a
 * bare id is pasted, it's returned unchanged.
 */
export function fileIdFromLink(input: string): string | null {
  const raw = (input || '').trim();
  if (!raw) return null;
  // Already a bare id (contains "!" and no scheme/query).
  if (!/^https?:\/\//i.test(raw) && /![a-z0-9!]/i.test(raw)) return raw;
  try {
    const url = new URL(raw);
    const id  = url.searchParams.get('id') || url.searchParams.get('resid');
    if (id) return decodeURIComponent(id);
  } catch { /* not a URL — fall through */ }
  // Last resort: pull an id-shaped token out of the raw string.
  const m = raw.match(/(?:id|resid)=([^&]+)/i);
  if (m) return decodeURIComponent(m[1]);
  return null;
}
