// Which photo slots are currently showing a VIDEO instead of a still.
//
// ── The problem ────────────────────────────────────────────────────────────
// The site is a static build. A slot like the home hero renders an <img> at
// build time; whether the owner has since uploaded a video for it is only
// known at request time, from R2. Asking R2 on every page view would be slow
// and expensive, and letting the browser find out (fetch a manifest, then swap
// the element) means the still is already downloading before the swap — a
// wasted request on the LCP element, and a visible flash.
//
// ── The shape ──────────────────────────────────────────────────────────────
// So the answer is written down at UPLOAD time, in one tiny KV record per
// venue, and read by the middleware alongside the palette and the copy it is
// already reading:
//
//   `__media__` → { "hero": { "d": "video", "m": "video" }, … }
//
//   d — the desktop slot ('video' when a video is live there)
//   m — the phone slot   ('video' when a portrait video is live there)
//
// A key that is absent means "still photograph", which is what every slot is
// until someone uploads a video. The middleware turns this into a markup
// rewrite (see functions/_middleware.ts), so the page ships the right element
// the first time and the browser never fetches the one it isn't going to use.
//
// ── R2 layout ──────────────────────────────────────────────────────────────
// A video never overwrites the still it replaces. They live side by side:
//
//   images/{key}                 the desktop still
//   images/{key}__mobile         the portrait still
//   images/{key}__video          the desktop video
//   images/{key}__video_mobile   the portrait video
//
// which is what makes "show the video" a reversible switch rather than a
// destructive upload: remove the video and the photograph is still there.

import type { KVNamespace } from '@cloudflare/workers-types';
import { siteScope, type Site, type SiteBindings } from './site';

export type MediaEnv = SiteBindings;

const KEY = '__media__';

/** Which of a slot's two frames a piece of media belongs to. */
export type MediaVariant = 'desktop' | 'mobile';

/** One slot's state. Absent fields mean "a still photograph is shown here". */
export interface MediaSlot { d?: 'video'; m?: 'video' }
export type MediaMap = Record<string, MediaSlot>;

/** R2 object key for a slot's video. */
export function videoObjectKey(key: string, variant: MediaVariant): string {
  return variant === 'mobile' ? `${key}__video_mobile` : `${key}__video`;
}

/** The filename a page requests for a slot's video, from the still's filename.
 *  Kept derived rather than stored so a slot can never end up with a video URL
 *  that points at a different photo's file. */
export function videoFilename(filename: string, variant: MediaVariant): string {
  const stem = filename.replace(/\.[^.]+$/, '');
  return variant === 'mobile' ? `${stem}--mobile.mp4` : `${stem}.mp4`;
}

/** Strip the variant suffix off a requested video filename, returning the
 *  still's filename and which frame was asked for. */
export function parseVideoFilename(file: string): { filename: string; variant: MediaVariant } | null {
  const m = /^(.+?)(--mobile)?\.(mp4|webm)$/i.exec(file);
  if (!m) return null;
  return { filename: m[1], variant: m[2] ? 'mobile' : 'desktop' };
}

function sanitise(input: unknown): MediaMap {
  const out: MediaMap = {};
  if (!input || typeof input !== 'object') return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const slot: MediaSlot = {};
    if ((v as MediaSlot).d === 'video') slot.d = 'video';
    if ((v as MediaSlot).m === 'video') slot.m = 'video';
    if (slot.d || slot.m) out[k] = slot;
  }
  return out;
}

async function readFrom(kv: KVNamespace | null): Promise<MediaMap | null> {
  if (!kv) return null;
  try {
    const raw = await kv.get(KEY);
    return raw ? sanitise(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** The venue's media map. Unlike the palette and the copy there is NO
 *  cross-venue fallback: a video is a file in one venue's bucket, and claiming
 *  rooftop shows a video because Zahara does would render a <video> pointing at
 *  nothing. A venue with no record simply shows stills. */
export async function readMediaMap(env: MediaEnv, site: Site = 'zahara'): Promise<MediaMap> {
  return (await readFrom(siteScope(env, site).kv)) ?? {};
}

/** Record (or clear) one slot's state. Read-modify-write on a record only the
 *  admin writes, from a single form — no concurrent-editor problem to solve. */
export async function setMediaSlot(
  env: MediaEnv, site: Site, key: string, variant: MediaVariant, isVideo: boolean,
): Promise<void> {
  const kv = siteScope(env, site).kv;
  if (!kv) return;
  const map = (await readFrom(kv)) ?? {};
  const slot: MediaSlot = { ...map[key] };
  const field = variant === 'mobile' ? 'm' : 'd';
  if (isVideo) slot[field] = 'video';
  else delete slot[field];
  if (slot.d || slot.m) map[key] = slot;
  else delete map[key];
  try { await kv.put(KEY, JSON.stringify(map)); }
  catch (err) { console.warn('[media] KV put failed', String(err)); }
}

/** Serialise for embedding in a <script type="application/json"> tag. */
export function mediaToJson(map: MediaMap): string {
  return JSON.stringify(map).replace(/</g, '\\u003c');
}
