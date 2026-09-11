// GET /admin/sync/browse — read-only OneDrive file browser for the admin panel.
//
//   ?folder=<item id>   list that folder (omit → the drive root)
//   ?q=<text>           search the whole drive by name instead
//   ?ext=.docx,.pdf     keep only files with these extensions (folders always
//                       come through, so the owner can keep navigating)
//
// Exists so nobody has to hunt for a OneDrive *link*: the panel lists the real
// drive and saves the item id straight from a click. Access-gated like the
// rest of /admin/*.

import type { PagesFunction } from '@cloudflare/workers-types';
import { checkAccess, type AuthEnv } from '../auth';
import { getAccessToken, listFolder, searchDrive, type DriveEntry, type GraphEnv } from '../../data/graph';

type Env = AuthEnv & GraphEnv;

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type':  'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(status === 401 ? { 'WWW-Authenticate': 'Basic realm="Admin"' } : {}),
    },
  });
}

/** Keep folders + files matching one of the requested extensions. */
function filterByExt(items: DriveEntry[], exts: string[]): DriveEntry[] {
  if (!exts.length) return items;
  return items.filter(i => i.folder || exts.some(e => i.name.toLowerCase().endsWith(e)));
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return json({ ok: false, error: 'Unauthorized' }, 401);

  const url    = new URL(request.url);
  const folder = url.searchParams.get('folder') || '';
  const query  = (url.searchParams.get('q') || '').trim();
  const exts   = (url.searchParams.get('ext') || '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
    .map(e => e.startsWith('.') ? e : '.' + e);

  let token: string;
  try {
    token = await getAccessToken(env);
  } catch (e) {
    // A broken/expired Graph grant is the one failure the owner can act on,
    // so say so plainly instead of showing an empty folder.
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502);
  }

  try {
    if (query) {
      const items = filterByExt(await searchDrive(token, query), exts);
      return json({ ok: true, search: query, items });
    }
    const { items, ...here } = await listFolder(token, folder);
    return json({ ok: true, folder: here, items: filterByExt(items, exts) });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502);
  }
};
