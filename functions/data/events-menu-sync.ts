// OneDrive → R2 sync for the Events-page menu PDF.
//
// Deliberately SEPARATE from the .docx menu sync in ./menu-sync.ts:
//   • its own KV record (`events_menu_sync`, per venue) — not a slug inside
//     `sync_config.menus`, so "Sync all now" and the hourly schedule can never
//     pull it;
//   • its own trigger (the "Sync now" button on /admin → Events menu (PDF));
//   • a different destination — the file lands in R2 as-is (images/events-menu)
//     instead of being parsed into menu sections in KV.
//
// The events menu is a designed document the owner replaces every so often,
// not a daily market menu, which is why it syncs on its own schedule: theirs.

import type { R2Bucket } from '@cloudflare/workers-types';
import { getAccessToken, downloadFile, fileIdFromLink, type GraphEnv } from './graph';
import { bumpAssetVersion, EVENTS_MENU_OBJECT } from './content';
import { siteScope, type Site, type SiteBindings } from './site';

// Shared OneDrive creds (MENU_KV, via GraphEnv) + both venues' R2 buckets.
export interface EventsMenuSyncEnv extends GraphEnv, SiteBindings {}

export interface EventsMenuConfig {
  /** Raw OneDrive link the owner pasted (shown back in the UI). */
  link?:       string;
  /** Drive-item id derived from the link — what Graph downloads. */
  fileId?:     string;
  /** ISO timestamp of the last sync attempt. */
  lastSync?:   string | null;
  /** 'ok' or the error message from the last attempt. */
  lastStatus?: string | null;
  /** Size in bytes of the last successfully stored PDF. */
  lastSize?:   number | null;
  /** The OneDrive filename it came from, for the "you're syncing X" line. */
  lastName?:   string | null;
}

const EMPTY: EventsMenuConfig = {};

/** Per-venue keys inside the SHARED MENU_KV namespace, mirroring menu-sync. */
const configKeyFor = (site: Site): string =>
  site === 'rooftop' ? 'events_menu_sync_rooftop' : 'events_menu_sync';

/** Same ceiling as the manual upload in functions/admin/events-menu.ts. */
export const MAX_PDF_BYTES = 15 * 1024 * 1024;

/** A PDF starts with "%PDF-". Guards against a OneDrive link pointing at a
 *  .docx (the most likely mistake, given the other menus are Word files). */
function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 &&
    bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 &&
    bytes[3] === 0x46 && bytes[4] === 0x2d;
}

function sanitise(raw: unknown): EventsMenuConfig {
  if (!raw || typeof raw !== 'object') return { ...EMPTY };
  const o = raw as Record<string, unknown>;
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
  return {
    link:       str(o.link),
    fileId:     str(o.fileId),
    lastSync:   str(o.lastSync)   ?? null,
    lastStatus: str(o.lastStatus) ?? null,
    lastSize:   typeof o.lastSize === 'number' && isFinite(o.lastSize) ? o.lastSize : null,
    lastName:   str(o.lastName)   ?? null,
  };
}

export async function readEventsMenuConfig(
  env: EventsMenuSyncEnv, site: Site = 'zahara',
): Promise<EventsMenuConfig> {
  try {
    const raw = await env.MENU_KV.get(configKeyFor(site), { type: 'json' });
    return raw ? sanitise(raw) : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

export async function writeEventsMenuConfig(
  env: EventsMenuSyncEnv, cfg: EventsMenuConfig, site: Site = 'zahara',
): Promise<void> {
  await env.MENU_KV.put(configKeyFor(site), JSON.stringify(sanitise(cfg)));
}

/** Save a pasted link (deriving the drive-item id), keeping the sync history.
 *  An empty link clears the source without touching the stored PDF. */
export async function setEventsMenuLink(
  env: EventsMenuSyncEnv, link: string, site: Site = 'zahara',
): Promise<EventsMenuConfig> {
  const cfg  = await readEventsMenuConfig(env, site);
  const trim = (link || '').trim();
  const next: EventsMenuConfig = {
    ...cfg,
    link:   trim || undefined,
    fileId: trim ? (fileIdFromLink(trim) ?? undefined) : undefined,
  };
  await writeEventsMenuConfig(env, next, site);
  return next;
}

export interface EventsMenuSyncResult {
  ok:     boolean;
  size?:  number;
  name?:  string;
  error?: string;
}

/**
 * Pull the linked PDF from OneDrive into this venue's R2 bucket, replacing the
 * live events menu. Bumps the asset version so the admin's "view the current
 * PDF" link (and any cached copy) points at the new file.
 */
export async function syncEventsMenu(
  env: EventsMenuSyncEnv, site: Site = 'zahara',
): Promise<EventsMenuSyncResult> {
  const cfg = await readEventsMenuConfig(env, site);
  const now = new Date().toISOString();

  const fail = async (error: string): Promise<EventsMenuSyncResult> => {
    await writeEventsMenuConfig(env, { ...cfg, lastSync: now, lastStatus: error }, site);
    return { ok: false, error };
  };

  if (!cfg.fileId) return { ok: false, error: 'No OneDrive link set' };

  const bucket: R2Bucket | null = siteScope(env, site).images;
  if (!bucket) return fail('No image storage bound for this venue');

  try {
    const token = await getAccessToken(env);
    const { name, bytes } = await downloadFile(cfg.fileId, token);

    const buffer = new Uint8Array(bytes);
    if (buffer.byteLength === 0)          return await fail('The file in OneDrive is empty');
    if (buffer.byteLength > MAX_PDF_BYTES) {
      return await fail(`That file is larger than ${Math.round(MAX_PDF_BYTES / 1024 / 1024)} MB`);
    }
    if (!isPdf(buffer)) {
      return await fail(name
        ? `“${name}” is not a PDF — link the PDF version of the menu`
        : 'That file is not a PDF');
    }

    await bucket.put(EVENTS_MENU_OBJECT, buffer, {
      httpMetadata: { contentType: 'application/pdf' },
    });
    await bumpAssetVersion(env, site);

    await writeEventsMenuConfig(env, {
      ...cfg,
      lastSync: now, lastStatus: 'ok',
      lastSize: buffer.byteLength, lastName: name || null,
    }, site);

    return { ok: true, size: buffer.byteLength, name: name || undefined };
  } catch (e) {
    return await fail(e instanceof Error ? e.message : String(e));
  }
}
