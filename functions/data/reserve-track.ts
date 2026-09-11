// First-party analytics for the /reserve venue portal.
//
// WHY THIS EXISTS ALONGSIDE GA4
// The portal is a pure gateway: a visitor lands, picks a venue, and leaves for
// Tabit. That makes it the one page where losing data actually costs money —
// and GA4 loses a lot of it. Consent Mode defaults every storage type to
// denied, so until a visitor accepts cookies GA4 only sends cookieless pings;
// ad blockers drop it outright. This module is the ground truth: it counts at
// the edge, in first-party code, so every real visit is recorded. GA4 stays on
// the page as the secondary, richer-but-lossier view.
//
// WHAT IS STORED — deliberately no personal data
// Per visit: timestamp, whether a venue was chosen and which, coarse geo from
// Cloudflare, device class, browser family, referrer HOST, and UTM tags. No IP
// address, no identifier of any kind, nothing written to the visitor's device.
// (Earlier records also carried a per-pageload nonce, which joined a click to
// its arrival; one record per visit made it unnecessary and it is no longer
// written.) Because nothing is stored on the device and nothing identifies a
// person, this needs no cookie consent to run.
//
// STORAGE SHAPE
// One KV key per VISIT, with the whole record in the key's METADATA:
//
//   rsv:<YYYY-MM-DD>:<epoch-ms>:<rand>   →  ""  + metadata { e, v, t, … }
//
// KV `list()` returns metadata inline, so a day is read in ONE list call — no
// per-key get(). A key per visit also means no read-modify-write, so
// concurrent visitors can't clobber each other's counts the way a single
// incrementing counter would.
//
// The date in the key is the ISRAEL date, not UTC — the owner reads these
// numbers in local time, and a UTC bucket would split an evening's traffic
// across two days at 03:00 local.
//
// ── COST: why one record per visit, and why closed days are cached ──────────
// This runs on Cloudflare's free plan, where WRITES (1,000/day) are the
// binding limit and reads (100,000/day) are the next one. Two things keep this
// page inside both:
//
//   1. ONE write per visit. The page used to beacon twice — an arrival and, if
//      it happened, a venue click — so a visitor who booked cost two of the
//      day's 1,000 writes and the portal alone could run the account dry at
//      ~500 visitors. A 'click' record now MEANS "landed and chose", so the
//      pair collapses into one record with no loss: visits are records, clicks
//      are records whose `e` is 'click', and the click-through rate is the
//      ratio of the two. (Records written before this change carry a session
//      nonce `s`; summarise() still reads those correctly — see below.)
//
//   2. The read side is deliberately left alone. A report is one list() per
//      day in the range, but only the OWNER opens it, a handful of times a
//      day — a rounding error against the 100,000 daily reads. The reads that
//      actually scale with traffic are the ones every page makes through
//      functions/_middleware.ts, which is where the caching went.

import type { KVNamespace } from '@cloudflare/workers-types';

/** The portal is shared by both venues, so its data is NOT site-scoped: every
 *  hit lands in Zahara's general KV regardless of which venue was chosen. */
export interface ReserveTrackEnv {
  MENU_DATA?:    KVNamespace;
  PALETTE_DATA?: KVNamespace;
}

export type ReserveEvent = 'view' | 'click';
export type ReserveVenue = 'zahara' | 'rooftop';

/** One recorded hit. Field names are short because KV metadata is capped at
 *  1024 bytes per key. */
export interface Hit {
  /** One visit. 'view' = landed and chose nothing · 'click' = landed AND chose
   *  a venue. A click therefore counts as a visit too — it is not a second
   *  record alongside a view. */
  e:  ReserveEvent;
  /** Which venue was chosen (clicks only). */
  v?: ReserveVenue;
  /** Epoch ms. */
  t:  number;
  /** LEGACY: the per-pageload nonce that used to join a click record to its
   *  view record. Never written any more — its presence is exactly what marks
   *  a record as the old two-per-visit shape, which is how summarise() avoids
   *  counting those visits twice. */
  s?: string;
  /** Two-letter country, from Cloudflare. */
  c?:  string;
  /** City, from Cloudflare. */
  ct?: string;
  /** 'mobile' | 'tablet' | 'desktop'. */
  d?:  string;
  /** Browser family. */
  b?:  string;
  /** Referrer host only — never the full URL. */
  r?:  string;
  /** utm_source / utm_medium / utm_campaign. */
  us?: string;
  um?: string;
  uc?: string;
}

const PREFIX = 'rsv:';

/** Hits expire after 90 days. Long enough to see a season, short enough that
 *  the dashboard's list() calls stay fast and KV storage stays trivial. */
export const RETENTION_DAYS = 90;
const RETENTION_SECONDS = RETENTION_DAYS * 24 * 60 * 60;

/** The portal's KV store. Falls back to the palette namespace on
 *  single-namespace installs, mirroring functions/data/site.ts. */
export function trackKv(env: ReserveTrackEnv): KVNamespace | null {
  return env.MENU_DATA ?? env.PALETTE_DATA ?? null;
}

// ── Israel-local dates ──────────────────────────────────────────────────────

const DAY_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
});
const HOUR_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false,
});

/** 'YYYY-MM-DD' in Israel time — en-CA formats exactly that way. */
export function israelDay(ts: number): string {
  return DAY_FMT.format(new Date(ts));
}

/** Hour of day (0–23) in Israel time. */
export function israelHour(ts: number): number {
  return Number(HOUR_FMT.format(new Date(ts)));
}

/** The last `n` Israel-local day keys, oldest first. Built by stepping back in
 *  24h hops and re-formatting, so DST shifts can't produce a missing day. */
export function recentDays(n: number, now = Date.now()): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) days.push(israelDay(now - i * 86_400_000));
  return Array.from(new Set(days));
}

// ── Write ───────────────────────────────────────────────────────────────────

/** Record one hit. Returns false when no KV namespace is bound. */
export async function recordHit(env: ReserveTrackEnv, hit: Hit): Promise<boolean> {
  const kv = trackKv(env);
  if (!kv) return false;

  const rand = Math.random().toString(36).slice(2, 8);
  const key  = `${PREFIX}${israelDay(hit.t)}:${hit.t}:${rand}`;

  // Empty value — everything lives in metadata so list() alone can read it.
  await kv.put(key, '', { metadata: hit, expirationTtl: RETENTION_SECONDS });
  return true;
}

// ── Read ────────────────────────────────────────────────────────────────────

/** Every hit recorded on one Israel-local day. */
async function readDay(kv: KVNamespace, day: string): Promise<Hit[]> {
  const hits: Hit[] = [];
  let cursor: string | undefined;

  // A day with more than 1000 hits pages; the cursor loop is capped so a
  // freak traffic spike can't turn the dashboard into a long-running request.
  for (let page = 0; page < 10; page++) {
    const res = await kv.list<Hit>({ prefix: `${PREFIX}${day}:`, limit: 1000, cursor });
    for (const k of res.keys) if (k.metadata) hits.push(k.metadata);
    if (res.list_complete || !res.cursor) break;
    cursor = res.cursor;
  }
  return hits;
}

/** Every hit across the given Israel-local days, oldest first, with anything
 *  from before the last reset filtered out. Days are read in parallel — one
 *  list() each. */
export async function readHits(env: ReserveTrackEnv, days: string[]): Promise<Hit[]> {
  const kv = trackKv(env);
  if (!kv) return [];
  const [pages, resetAt] = await Promise.all([
    Promise.all(days.map((d) => readDay(kv, d))),
    readResetAt(env),
  ]);
  return pages.flat()
    .filter((h) => h.t > resetAt)
    .sort((a, b) => a.t - b.t);
}

// ── Reset ───────────────────────────────────────────────────────────────────
//
// "Start counting again" is a timestamp, not a delete sweep. KV has no bulk
// delete — clearing a busy month would mean thousands of individual deletes in
// one request, which is exactly the kind of thing that half-finishes and
// leaves the numbers in a state nobody can explain. A marker is atomic: one
// write, and every read is filtered from that instant on. The hidden records
// then age out on their own 90-day TTL.

const RESET_KEY = 'rsv_reset_at';

/** Epoch ms of the last reset, or 0 if the counter has never been reset. */
export async function readResetAt(env: ReserveTrackEnv): Promise<number> {
  const kv = trackKv(env);
  if (!kv) return 0;
  try {
    const raw = await kv.get(RESET_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Hide everything recorded up to now. Returns the timestamp that was set. */
export async function resetCounter(env: ReserveTrackEnv): Promise<number | null> {
  const kv = trackKv(env);
  if (!kv) return null;
  const at = Date.now();
  await kv.put(RESET_KEY, String(at));
  return at;
}

// ── Aggregate ───────────────────────────────────────────────────────────────

export interface DayRow {
  day:     string;
  views:   number;
  zahara:  number;
  rooftop: number;
}

export interface Breakdown { label: string; count: number }

export interface Summary {
  views:      number;
  /** Distinct page loads — the honest "how many people landed" number. */
  visits:     number;
  zahara:     number;
  rooftop:    number;
  clicks:     number;
  /** Share of visits that chose a venue, 0–1. */
  ctr:        number;
  days:       DayRow[];
  hours:      number[];
  countries:  Breakdown[];
  cities:     Breakdown[];
  devices:    Breakdown[];
  browsers:   Breakdown[];
  referrers:  Breakdown[];
  campaigns:  Breakdown[];
  recent:     Hit[];
}

function tally(map: Map<string, number>, key: string | undefined, fallback = '(none)') {
  const k = (key || '').trim() || fallback;
  map.set(k, (map.get(k) || 0) + 1);
}

function toBreakdown(map: Map<string, number>, limit = 12): Breakdown[] {
  return Array.from(map, ([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Roll a flat hit list up into everything the dashboard renders.
 *
 * `venue` narrows the whole report to the people who chose ONE venue: the
 * arrival context is kept only for sessions that went on to click it, and the
 * click counts drop the other venue. That is what makes the Zahara and Rooftop
 * tabs answer "where did the people who booked THIS come from" rather than
 * just re-printing the same visitor mix under two headings.
 */
export function summarise(hits: Hit[], days: string[], venue?: ReserveVenue): Summary {
  // TWO RECORD SHAPES live in this list, and the difference is `s`:
  //
  //   current — one record per visit. A 'click' record IS the arrival too, so
  //             it counts as both a visit and a click. No `s`.
  //   legacy  — two records per visit, joined by the nonce `s`: a 'view' for
  //             the arrival and a separate 'click' for the choice. Counting a
  //             legacy click as a visit would double that visitor.
  //
  // So `isVisit` below is the one place the distinction lives: a record is an
  // arrival if it is a current-shape record (no `s`) or a legacy 'view'.
  const isVisit = (h: Hit) => !h.s || h.e === 'view';

  // Legacy only: which sessions chose which venue — needed before the main
  // pass, because a legacy view is kept only once we know what its session did
  // later. Current-shape records answer that on their own.
  let keep: Set<string> | null = null;
  if (venue) {
    keep = new Set<string>();
    for (const h of hits) if (h.e === 'click' && (h.v ?? 'zahara') === venue && h.s) keep.add(h.s);
  }

  const dayMap = new Map<string, DayRow>();
  for (const day of days) dayMap.set(day, { day, views: 0, zahara: 0, rooftop: 0 });

  const hours = new Array(24).fill(0) as number[];
  const countries = new Map<string, number>();
  const cities    = new Map<string, number>();
  const devices   = new Map<string, number>();
  const browsers  = new Map<string, number>();
  const referrers = new Map<string, number>();
  const campaigns = new Map<string, number>();

  const viewSessions  = new Set<string>();
  const clickSessions = new Set<string>();

  let views = 0, zahara = 0, rooftop = 0;

  // Current-shape visits and clicks have no session to dedupe by, so they are
  // counted straight. Legacy ones go through the session sets as before.
  let plainVisits = 0;
  let plainClicks = 0;

  for (const h of hits) {
    const legacy = !!h.s;

    // Venue tab: drop arrivals that never chose this venue, and clicks that
    // belong to the other one.
    if (keep) {
      if (legacy) {
        if (h.e === 'view') { if (!keep.has(h.s as string)) continue; }
        else if ((h.v ?? 'zahara') !== venue) continue;
      } else if (h.e !== 'click' || (h.v ?? 'zahara') !== venue) {
        continue;
      }
    }

    const row = dayMap.get(israelDay(h.t));

    if (isVisit(h)) {
      views++;
      if (legacy) viewSessions.add(h.s as string); else plainVisits++;
      if (row) row.views++;
      hours[israelHour(h.t)]++;
      // Context is attributed to the ARRIVAL. On a legacy pair that is the
      // view record only — the click carries the same context, and counting
      // both would double every visitor.
      tally(countries, h.c,  '(unknown)');
      tally(cities,    h.ct, '(unknown)');
      tally(devices,   h.d,  '(unknown)');
      tally(browsers,  h.b,  '(unknown)');
      tally(referrers, h.r,  '(direct)');
      tally(campaigns, h.uc || h.us, '(none)');
    }

    if (h.e === 'click') {
      if (legacy) clickSessions.add(h.s as string); else plainClicks++;
      if (h.v === 'rooftop') { rooftop++; if (row) row.rooftop++; }
      else                   { zahara++;  if (row) row.zahara++;  }
    }
  }

  const visits = viewSessions.size + plainVisits || views;

  return {
    views,
    visits,
    zahara,
    rooftop,
    clicks: zahara + rooftop,
    ctr: visits ? (clickSessions.size + plainClicks) / visits : 0,
    days: Array.from(dayMap.values()),
    hours,
    countries: toBreakdown(countries),
    cities:    toBreakdown(cities),
    devices:   toBreakdown(devices),
    browsers:  toBreakdown(browsers),
    referrers: toBreakdown(referrers),
    campaigns: toBreakdown(campaigns),
    recent:    hits.slice(-60).reverse(),
  };
}

// ── Request fingerprinting (coarse, non-identifying) ────────────────────────

/** Device class from the User-Agent. Three buckets is all the owner needs —
 *  "is this an Instagram phone audience or people at a desk?" */
export function deviceClass(ua: string): string {
  if (/\bipad\b|\btablet\b|\bplaybook\b|\bsilk\b|android(?!.*\bmobile\b)/i.test(ua)) return 'tablet';
  if (/\bmobi|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(ua))         return 'mobile';
  if (!ua)                                                                           return 'unknown';
  return 'desktop';
}

/** Browser family. Order matters — every Chromium browser also says "Chrome",
 *  and every WebKit browser also says "Safari", so the specific brands are
 *  tested before the generic ones. */
export function browserFamily(ua: string): string {
  if (/\bedg\//i.test(ua))                    return 'Edge';
  if (/\bopr\/|\bopera\b/i.test(ua))          return 'Opera';
  if (/\bsamsungbrowser\//i.test(ua))         return 'Samsung Internet';
  if (/\bfban|\bfbav|\binstagram\b/i.test(ua)) return 'Instagram / Facebook';
  if (/\bfxios\/|\bfirefox\//i.test(ua))      return 'Firefox';
  if (/\bcrios\/|\bchrome\//i.test(ua))       return 'Chrome';
  if (/\bsafari\//i.test(ua))                 return 'Safari';
  if (!ua)                                    return 'unknown';
  return 'other';
}

/** Bots inflate every number and choose no venue, so they are dropped at the
 *  door rather than filtered in the dashboard. */
export function looksLikeBot(ua: string): boolean {
  return !ua || /bot|crawl|spider|slurp|headless|preview|monitor|curl|wget|python-requests|axios|scan|lighthouse|pingdom|uptime/i.test(ua);
}

/** Referrer HOST only. The full URL can carry search terms and other
 *  incidental personal data, and the host answers the actual question —
 *  "where did they come from?" */
export function referrerHost(referrer: string, selfHost: string): string {
  if (!referrer) return '';
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '');
    return host === selfHost.replace(/^www\./, '') ? '' : host;
  } catch {
    return '';
  }
}
