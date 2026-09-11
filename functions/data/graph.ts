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

  // Fetch the item metadata WITHOUT a restrictive $select — we need the instance
  // annotation `@microsoft.graph.downloadUrl`, a short-lived, PRE-AUTHENTICATED
  // link to OneDrive storage.
  const metaRes = await fetch(base, { headers: auth });
  if (!metaRes.ok) {
    const t = await metaRes.text().catch(() => '');
    throw new Error(`Drive item ${fileId} not found (HTTP ${metaRes.status}) ${t.slice(0, 160)}`);
  }
  const meta = await metaRes.json() as { name?: string; '@microsoft.graph.downloadUrl'?: string };
  const name = meta.name || '';

  // Preferred path: download from the pre-authenticated URL with NO auth header.
  // The Graph token must NOT be sent to the storage host — and Workers' fetch
  // forwards the Authorization header across the cross-host `/content` redirect,
  // which the storage host rejects with 401 (the failure seen in production).
  const preAuthUrl = meta['@microsoft.graph.downloadUrl'];
  if (preAuthUrl) {
    const res = await fetch(preAuthUrl);
    if (!res.ok) throw new Error(`Download failed for ${fileId} (HTTP ${res.status})`);
    return { name, bytes: await res.arrayBuffer() };
  }

  // Fallback: hit /content but handle the redirect MANUALLY so the Bearer token
  // never leaks to the storage host.
  const contentRes = await fetch(`${base}/content`, { headers: auth, redirect: 'manual' });
  if (contentRes.status >= 300 && contentRes.status < 400) {
    const loc = contentRes.headers.get('Location');
    if (!loc) throw new Error(`Download failed for ${fileId} (redirect without Location)`);
    const finalRes = await fetch(loc); // pre-authenticated URL — no auth header
    if (!finalRes.ok) throw new Error(`Download failed for ${fileId} (HTTP ${finalRes.status})`);
    return { name, bytes: await finalRes.arrayBuffer() };
  }
  if (!contentRes.ok) throw new Error(`Download failed for ${fileId} (HTTP ${contentRes.status})`);
  return { name, bytes: await contentRes.arrayBuffer() };
}

// ── Link → drive-item id ───────────────────────────────────────────────────
//
// OneDrive hands out a different link shape from nearly every button in its UI,
// and only one of them carries the item id Graph wants
// (`142F90612FF3D8AC!s25e68c369d164614b1500d46dc186e9c`). The owner should be
// able to paste ANY of them, so we recognise the lot:
//
//   …/?cid=<cid>&id=<cid>%21s<hex32>        ← the "old" full id (already usable)
//   …/personal/<cid>/_layouts/15/doc.aspx?resid=<guid>&cid=<cid>   ← "Open in browser"
//   …/_layouts/15/Doc.aspx?sourcedoc={<guid>}&…                    ← Office web
//   …/edit.aspx?resid=<cid>!<n>&cid=<cid>                          ← legacy numeric
//   https://1drv.ms/w/…  ·  …/:w:/g/personal/<cid>/<token>         ← share links
//
// The first four are pure string work, done here. Share links carry no id at
// all and are resolved against Graph in `resolveFileLink` below.

/** A GUID with or without dashes/braces → 32 lowercase hex chars, or null. */
function guidHex(value: string): string | null {
  const m = /^\{?([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})\}?$/i
    .exec(value.trim());
  return m ? m.slice(1).join('').toLowerCase() : null;
}

/** The drive/user id ("cid"): 16 hex chars. */
const isCid = (v: string): boolean => /^[0-9a-f]{16}$/i.test(v.trim());

/** Modern personal-OneDrive item id: <CID>!s<guid without dashes>. */
function composeItemId(cid: string, guid: string): string | null {
  const hex = guidHex(guid);
  return hex && isCid(cid) ? `${cid.trim().toUpperCase()}!s${hex}` : null;
}

/** Pull the cid out of a link — query string first, then the /personal/<cid>/ path. */
function cidFromLink(url: URL | null, raw: string): string | null {
  const q = url?.searchParams.get('cid') || url?.searchParams.get('CID');
  if (q && isCid(q)) return q.trim();
  const path = (url?.pathname || raw).match(/\/personal\/([0-9a-f]{16})(?:\/|$)/i);
  if (path) return path[1];
  const loose = raw.match(/[?&]cid=([0-9a-f]{16})\b/i);
  return loose ? loose[1] : null;
}

/** Case-insensitive query lookup — OneDrive isn't consistent about casing. */
function param(url: URL, ...names: string[]): string | null {
  for (const [k, v] of url.searchParams) {
    if (names.some(n => n.toLowerCase() === k.toLowerCase()) && v) return v;
  }
  return null;
}

/**
 * Extract a OneDrive drive-item id from a pasted link, without touching the
 * network. Returns null for links whose id can only come from Graph (share
 * links, bare GUIDs) — `resolveFileLink` handles those.
 */
export function fileIdFromLink(input: string): string | null {
  const raw = (input || '').trim();
  if (!raw) return null;

  // A bare id pasted straight in (either id shape).
  if (!/^https?:\/\//i.test(raw)) {
    if (/^[0-9a-f]{16}![a-z0-9!]+$/i.test(raw)) return raw;
    return null;
  }

  let url: URL | null = null;
  try { url = new URL(raw); } catch { /* fall through to regex scraping */ }
  const cid = cidFromLink(url, raw);

  // `id=` / `resid=` / `sourcedoc=` — whichever this link shape uses.
  const candidates: string[] = [];
  if (url) {
    for (const name of ['id', 'resid', 'sourcedoc']) {
      const v = param(url, name);
      if (v) candidates.push(decodeURIComponent(v));
    }
  } else {
    const m = raw.match(/(?:\b(?:id|resid|sourcedoc)=)([^&]+)/i);
    if (m) candidates.push(decodeURIComponent(m[1]));
  }

  for (const value of candidates) {
    // Already a full item id (`<cid>!s<hex>` or the legacy `<cid>!<n>`).
    if (/^[0-9a-f]{16}![a-z0-9!]+$/i.test(value)) return value;
    // A GUID needs the cid to become an item id.
    if (cid) {
      const composed = composeItemId(cid, value);
      if (composed) return composed;
    }
  }

  return null;
}

// ── Graph-assisted resolution (share links, verification, names) ───────────

/** Graph's sharing token for a URL: `u!` + unpadded base64url of the link. */
function sharingToken(link: string): string {
  const bytes = new TextEncoder().encode(link);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return 'u!' + btoa(bin).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
}

async function graphJson<T>(path: string, accessToken: string): Promise<T | null> {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return await res.json() as T;
}

interface GraphItem {
  id?: string;
  name?: string;
  size?: number;
  lastModifiedDateTime?: string;
  folder?: { childCount?: number };
  file?:   { mimeType?: string };
  parentReference?: { id?: string; path?: string };
}

/** Item name (+ id) for a known drive-item id, or null if it isn't there. */
export async function getItemInfo(fileId: string, accessToken: string): Promise<{ id: string; name: string } | null> {
  const item = await graphJson<GraphItem>(
    `/me/drive/items/${encodeURIComponent(fileId)}?$select=id,name`, accessToken);
  return item?.id ? { id: item.id, name: item.name || '' } : null;
}

/** The signed-in account's drive id — the "cid" half of every item id. */
async function driveCid(accessToken: string): Promise<string | null> {
  const drive = await graphJson<{ id?: string }>('/me/drive?$select=id', accessToken);
  return drive?.id && isCid(drive.id) ? drive.id : null;
}

export interface ResolvedFile { id: string; name?: string; }

/**
 * Turn anything the owner pastes into a drive-item id, using Graph when the
 * link alone isn't enough. Order matters: the cheap string parse first, then
 * the share-link API, then a bare GUID against the account's own drive.
 *
 * `getToken` is called at most once and only when needed, so saving a link
 * still works (unverified) if the Graph grant is broken.
 */
export async function resolveFileLink(
  raw: string,
  getToken: () => Promise<string>,
): Promise<ResolvedFile | null> {
  const link = (raw || '').trim();
  if (!link) return null;

  const parsed = fileIdFromLink(link);
  let token: string | null = null;
  try { token = await getToken(); } catch { /* Graph unavailable — parse-only */ }

  // No token: trust the parse (the sync itself will report a bad id later).
  if (!token) return parsed ? { id: parsed } : null;

  // Verify the parsed id — a wrong guess should fall through to the share API
  // rather than being saved as a link that silently fails every sync.
  if (parsed) {
    const info = await getItemInfo(parsed, token).catch(() => null);
    if (info) return { id: info.id, name: info.name };
  }

  // Share / short links (1drv.ms, ".../:w:/g/personal/...") carry no id.
  if (/^https?:\/\//i.test(link)) {
    const shared = await graphJson<GraphItem>(
      `/shares/${sharingToken(link)}/driveItem?$select=id,name`, token).catch(() => null);
    if (shared?.id) return { id: shared.id, name: shared.name };
  }

  // A bare GUID (or a link with a GUID but no cid) → pair it with our drive.
  const guidSource = link.match(/(?:id|resid|sourcedoc)=([^&]+)/i)?.[1] ?? link;
  const hex = guidHex(decodeURIComponent(guidSource));
  if (hex) {
    const cid = await driveCid(token);
    const composed = cid && composeItemId(cid, hex);
    if (composed) {
      const info = await getItemInfo(composed, token).catch(() => null);
      if (info) return { id: info.id, name: info.name };
    }
  }

  return parsed ? { id: parsed } : null;
}

// ── Drive browsing (the admin file picker) ─────────────────────────────────

export interface DriveEntry {
  id:        string;
  name:      string;
  folder:    boolean;
  size?:     number;
  modified?: string;
  /** Human-readable containing folder — only filled in for search results. */
  path?:     string;
}

/** `/drive/root:/Menus/2026` → `Menus/2026` (empty string at the root). */
function prettyPath(ref?: { path?: string }): string {
  const p = ref?.path || '';
  const i = p.indexOf('root:');
  return i < 0 ? '' : decodeURIComponent(p.slice(i + 5)).replace(/^\/+/, '');
}

function toEntry(item: GraphItem): DriveEntry | null {
  if (!item.id || !item.name) return null;
  return {
    id:       item.id,
    name:     item.name,
    folder:   !!item.folder,
    size:     item.size,
    modified: item.lastModifiedDateTime,
    path:     prettyPath(item.parentReference),
  };
}

/** Folders first, then alphabetical — how a file browser is expected to read. */
function sortEntries(entries: DriveEntry[]): DriveEntry[] {
  return entries.sort((a, b) =>
    (a.folder === b.folder ? 0 : a.folder ? -1 : 1) ||
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

const SELECT = '$select=id,name,folder,file,size,lastModifiedDateTime,parentReference';

/** Follow @odata.nextLink a few times so big folders aren't silently cut off. */
async function collectPages(firstPath: string, accessToken: string, maxPages = 5): Promise<GraphItem[]> {
  const out: GraphItem[] = [];
  let next: string | null = `https://graph.microsoft.com/v1.0${firstPath}`;
  for (let page = 0; page < maxPages && next; page++) {
    const res: Response = await fetch(next, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`OneDrive listing failed (HTTP ${res.status}) ${detail.slice(0, 160)}`);
    }
    const body = await res.json() as { value?: GraphItem[]; '@odata.nextLink'?: string };
    out.push(...(body.value || []));
    next = body['@odata.nextLink'] || null;
  }
  return out;
}

export interface FolderListing {
  id:       string;
  name:     string;
  parentId: string | null;
  path:     string;
  items:    DriveEntry[];
}

/** List one folder's contents. `folderId` null/empty = the drive root. */
export async function listFolder(accessToken: string, folderId?: string | null): Promise<FolderListing> {
  const id   = (folderId || '').trim();
  const base = id ? `/me/drive/items/${encodeURIComponent(id)}` : '/me/drive/root';

  const [meta, children] = await Promise.all([
    graphJson<GraphItem>(`${base}?$select=id,name,parentReference`, accessToken),
    collectPages(`${base}/children?${SELECT}&$top=200`, accessToken),
  ]);

  return {
    id:       meta?.id || id,
    // Graph calls the root "root"; the owner knows it as their OneDrive.
    name:     id ? (meta?.name || 'Folder') : 'OneDrive',
    // The root's parentReference has no id — that's how the UI knows to stop.
    parentId: id ? (meta?.parentReference?.id || null) : null,
    path:     id ? prettyPath(meta?.parentReference) : '',
    items:    sortEntries(children.map(toEntry).filter((e): e is DriveEntry => !!e)),
  };
}

/** Search the whole drive by name. */
export async function searchDrive(accessToken: string, query: string): Promise<DriveEntry[]> {
  const q = query.trim().replace(/'/g, "''");
  if (!q) return [];
  const items = await collectPages(
    `/me/drive/root/search(q='${encodeURIComponent(q)}')?${SELECT}&$top=100`, accessToken, 2);
  return sortEntries(items.map(toEntry).filter((e): e is DriveEntry => !!e));
}
