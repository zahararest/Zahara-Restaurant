// OneDrive → KV menu sync core.
//
// Pulls each configured menu's .docx from OneDrive via Microsoft Graph,
// parses it with the shared server-side parser, and writes the result to the
// SAME MENU_DATA keys/shape the admin editor uses, so synced menus and
// manually-edited menus are indistinguishable downstream.
//
// Config (one JSON doc in MENU_KV under `sync_config`) holds the schedule and
// the per-menu OneDrive source. The admin /admin/sync page reads/writes it;
// the cron endpoint and the "Sync now" button both call into here.

import { getAccessToken, downloadFile, fileIdFromLink, type GraphEnv } from './graph';
import { parseDocx } from './docx-parse';
import { VALID_SLUGS } from './menu-slugs';
import type { MenuSection } from './menu-defaults';

export interface SyncEnv extends GraphEnv {
  MENU_DATA: KVNamespace;
}

export interface MenuSource {
  /** Raw OneDrive link the owner pasted (shown back in the UI). */
  link?:       string;
  /** Drive-item id derived from the link — what Graph downloads. */
  fileId?:     string;
  /** ISO timestamp of the last successful/failed sync attempt. */
  lastSync?:   string | null;
  /** 'ok' or an error message from the last attempt. */
  lastStatus?: string | null;
  /** Item count imported on the last successful sync. */
  lastItems?:  number | null;
}

export interface SyncConfig {
  enabled: boolean;
  /** Local (Asia/Jerusalem) hours-of-day to auto-sync, e.g. [12,16,18]. */
  hours:   number[];
  /** Per-slug source. Only slugs with a fileId are synced. */
  menus:   Record<string, MenuSource>;
}

const CONFIG_KEY  = 'sync_config';
const RUN_LOG_KEY = 'sync_last_run_hour'; // dedupe key: "YYYY-MM-DD-HH" (Israel)

// Per-slug document language. Used to keep only the matching-language
// sections from a doc — essential for the desserts file, which holds BOTH
// languages in one document (Hebrew sections + English sections) and is
// assigned to both `dessert` and `dessert_en`. For single-language files this
// is a harmless safety net (a Hebrew doc has no English sections to drop).
// `cocktails` is bilingual by design (EN · HE per item) → no filtering.
const SLUG_LANG: Record<string, 'he' | 'en' | null> = {
  he: 'he', en: 'en',
  wine: 'he', wine_en: 'en',
  dessert: 'he', dessert_en: 'en',
  cocktails: null,
  events: 'he', events_en: 'en',
};

/** True if the string is predominantly Hebrew script. */
function isHebrew(s: string): boolean {
  const he = (s.match(/[֐-׿]/g) || []).length;
  const la = (s.match(/[A-Za-z]/g) || []).length;
  return he > la;
}

/** Keep only sections whose language matches the slug. A section's language
 *  is judged from its title + item names (descriptions can be bilingual). */
function filterByLang(sections: MenuSection[], lang: 'he' | 'en' | null): MenuSection[] {
  if (!lang) return sections;
  const kept = sections.filter(sec => {
    const sample = (sec.title || '') + ' ' + sec.items.map(i => i.name).join(' ');
    return isHebrew(sample) === (lang === 'he');
  });
  // If filtering removed everything (e.g. a doc that's all one language but
  // mis-detected), fall back to the unfiltered sections rather than wiping
  // the menu.
  return kept.length ? kept : sections;
}

const DEFAULT_CONFIG: SyncConfig = { enabled: true, hours: [12, 16, 18], menus: {} };

// ── Config read / write ──────────────────────────────────────────────────
export async function readConfig(env: SyncEnv): Promise<SyncConfig> {
  try {
    const raw = await env.MENU_KV.get(CONFIG_KEY, { type: 'json' }) as Partial<SyncConfig> | null;
    if (!raw) return { ...DEFAULT_CONFIG };
    return {
      enabled: raw.enabled !== false,
      hours:   Array.isArray(raw.hours) && raw.hours.length ? sanitizeHours(raw.hours) : [...DEFAULT_CONFIG.hours],
      menus:   raw.menus && typeof raw.menus === 'object' ? raw.menus : {},
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function writeConfig(env: SyncEnv, cfg: SyncConfig): Promise<void> {
  await env.MENU_KV.put(CONFIG_KEY, JSON.stringify(cfg));
}

function sanitizeHours(hours: unknown[]): number[] {
  const seen = new Set<number>();
  for (const h of hours) {
    const n = Math.floor(Number(h));
    if (Number.isFinite(n) && n >= 0 && n <= 23) seen.add(n);
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * Apply an admin-submitted config patch, deriving fileId from any pasted
 * link and dropping unknown slugs. Preserves existing lastSync/status so the
 * UI doesn't lose history when the owner just edits a link or the schedule.
 */
export async function applyConfigPatch(
  env: SyncEnv,
  patch: { enabled?: boolean; hours?: unknown[]; menus?: Record<string, { link?: string }> },
): Promise<SyncConfig> {
  const cfg = await readConfig(env);

  if (typeof patch.enabled === 'boolean') cfg.enabled = patch.enabled;
  if (Array.isArray(patch.hours))         cfg.hours   = sanitizeHours(patch.hours);

  if (patch.menus && typeof patch.menus === 'object') {
    for (const [slug, entry] of Object.entries(patch.menus)) {
      if (!VALID_SLUGS.has(slug)) continue;
      const prev = cfg.menus[slug] || {};
      const link = (entry?.link ?? '').trim();
      cfg.menus[slug] = {
        ...prev,
        link:   link || undefined,
        fileId: link ? (fileIdFromLink(link) ?? undefined) : undefined,
      };
    }
  }

  await writeConfig(env, cfg);
  return cfg;
}

// ── featured-flag merge ────────────────────────────────────────────────────
/** The `featured` stars are set in the editor, not the Word doc — re-apply
 *  them to imported items whose name still matches so a sync doesn't wipe the
 *  home-page selection. */
function mergeFeatured(imported: MenuSection[], existing: MenuSection[]): MenuSection[] {
  const featured = new Set<string>();
  for (const s of existing) {
    for (const it of s.items) if (it.featured) featured.add(it.name.trim());
  }
  if (!featured.size) return imported;
  for (const s of imported) {
    for (const it of s.items) {
      if (featured.has(it.name.trim())) it.featured = true;
    }
  }
  return imported;
}

// ── per-slug sync ──────────────────────────────────────────────────────────
export interface SlugResult {
  slug: string; ok: boolean; items?: number; sections?: number;
  date?: string | null; error?: string;
}

/**
 * Sync one slug. Caller passes a shared access token (one per run). Mutates
 * the menu entry's lastSync/lastStatus/lastItems on `cfg` (caller persists).
 */
export async function syncSlug(env: SyncEnv, cfg: SyncConfig, slug: string, accessToken: string): Promise<SlugResult> {
  const entry = cfg.menus[slug];
  const now   = new Date().toISOString();

  if (!entry?.fileId) {
    return { slug, ok: false, error: 'No OneDrive link set' };
  }

  try {
    const { name, bytes } = await downloadFile(entry.fileId, accessToken);
    const parsed = await parseDocx(bytes, name);
    if (!parsed.sections.length) throw new Error('No sections parsed from document');

    // Keep only this slug's language (splits the bilingual desserts doc).
    const langSections = filterByLang(parsed.sections, SLUG_LANG[slug] ?? null);

    // Merge featured flags + fall back to the existing date when the doc has none.
    let existing: { date?: string | null; sections?: MenuSection[] } = {};
    try { existing = (await env.MENU_DATA.get(slug, { type: 'json' })) as typeof existing || {}; } catch { /* none */ }
    const sections = mergeFeatured(langSections, existing.sections || []);
    const date     = parsed.date ?? existing.date ?? null;

    await env.MENU_DATA.put(slug, JSON.stringify({ date, sections }));

    const items = sections.reduce((n, s) => n + s.items.length, 0);
    entry.lastSync = now; entry.lastStatus = 'ok'; entry.lastItems = items;
    return { slug, ok: true, items, sections: sections.length, date };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    entry.lastSync = now; entry.lastStatus = msg;
    return { slug, ok: false, error: msg };
  }
}

export interface SyncRunResult { ok: boolean; results: SlugResult[]; error?: string; }

/**
 * Sync the given slugs (default: every menu with a fileId). Gets ONE access
 * token for the whole run and persists the updated config once at the end.
 */
export async function syncMenus(env: SyncEnv, slugs?: string[]): Promise<SyncRunResult> {
  const cfg     = await readConfig(env);
  const targets = (slugs ?? Object.keys(cfg.menus)).filter(s => cfg.menus[s]?.fileId);

  if (!targets.length) {
    return { ok: false, results: [], error: 'No menus have a OneDrive link set' };
  }

  let token: string;
  try {
    token = await getAccessToken(env);
  } catch (e) {
    return { ok: false, results: [], error: e instanceof Error ? e.message : String(e) };
  }

  const results: SlugResult[] = [];
  for (const slug of targets) results.push(await syncSlug(env, cfg, slug, token));

  await writeConfig(env, cfg);
  return { ok: results.every(r => r.ok), results };
}

// ── scheduled (cron) entry ─────────────────────────────────────────────────
/** Current hour-of-day (0–23) and a YYYY-MM-DD-HH stamp, in Israel local time. */
function israelNow(): { hour: number; stamp: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  const hourRaw = get('hour') === '24' ? '00' : get('hour'); // some runtimes emit 24 at midnight
  const hour = parseInt(hourRaw, 10);
  return { hour, stamp: `${get('year')}-${get('month')}-${get('day')}-${hourRaw}` };
}

/**
 * Called by the external cron (hourly). Syncs everything iff the current
 * Israel hour is one of the configured hours AND we haven't already synced
 * this hour (dedupe, so a scheduler that fires more than once an hour is
 * harmless). Returns a description for the cron response/log.
 */
export async function runScheduled(env: SyncEnv): Promise<{ ran: boolean; reason: string; result?: SyncRunResult }> {
  const cfg = await readConfig(env);
  if (!cfg.enabled) return { ran: false, reason: 'sync disabled' };

  const { hour, stamp } = israelNow();
  if (!cfg.hours.includes(hour)) {
    return { ran: false, reason: `hour ${hour} not in [${cfg.hours.join(',')}] (Israel)` };
  }

  const lastRun = await env.MENU_KV.get(RUN_LOG_KEY);
  if (lastRun === stamp) return { ran: false, reason: `already synced this hour (${stamp})` };
  await env.MENU_KV.put(RUN_LOG_KEY, stamp);

  const result = await syncMenus(env);
  return { ran: true, reason: `synced at Israel hour ${hour}`, result };
}
