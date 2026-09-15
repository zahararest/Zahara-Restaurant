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
//   `__media__` → { "hero": { "d": "video", "m": "video", "pos": "50% 35%" }, … }
//
//   d    — the desktop slot ('video' when the video is SHOWN there)
//   m    — the phone slot   ('video' when the portrait cut is SHOWN there)
//   fit  — 'contain' when the video should be shown whole rather than cropped
//   pos  — object-position ("50% 35%"), which part of the frame to keep
//   rate — playback speed, when the owner has slowed or quickened the loop
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
//
// ── Two separate questions ─────────────────────────────────────────────────
// The FILE existing and the slot SHOWING it are deliberately different facts:
//
//   R2 has images/{key}__video   → a video has been uploaded for this slot
//   manifest has d === 'video'   → visitors are seeing it right now
//
// Switching back to the photograph only clears the flag. The video stays in
// the bucket, so "show it again" is one press rather than another upload —
// which is the whole point of calling it a switch. Only an explicit "delete
// the video" removes the file, and it says so before it does.

import type { KVNamespace } from '@cloudflare/workers-types';
import { siteScope, type Site, type SiteBindings } from './site';

export type MediaEnv = SiteBindings;

const KEY = '__media__';

/** Which of a slot's two frames a piece of media belongs to. */
export type MediaVariant = 'desktop' | 'mobile';

/** One slot's state. Absent `d`/`m` mean "a still photograph is shown here";
 *  the rest is how the video sits in its frame, stored only when the owner has
 *  moved it off the defaults so an untouched slot stays an empty object. */
export interface MediaSlot {
  d?:    'video';
  m?:    'video';
  /** 'contain' shows the whole frame (letterboxed); default is 'cover'. */
  fit?:  'contain';
  /** CSS object-position, e.g. "50% 35%". Default is dead centre. */
  pos?:  string;
  /** Playback speed, 0.25–2. Default 1. */
  rate?: number;
}
export type MediaMap = Record<string, MediaSlot>;

/** How a video sits in its frame — the part of a slot's record the owner
 *  adjusts rather than switches. */
export interface MediaOptions {
  fit?:  'cover' | 'contain';
  pos?:  string;
  rate?: number;
}

export const DEFAULT_POSITION = '50% 50%';

/** Accept only a two-part percentage pair. This value is written into a style
 *  attribute, so anything else is refused outright rather than escaped. */
export function isPosition(v: unknown): v is string {
  return typeof v === 'string' && /^\d{1,3}% \d{1,3}%$/.test(v);
}

/** Playback speeds the slider offers. Anything else is snapped away. */
export function isRate(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0.25 && v <= 2;
}

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

/** True when a record still carries something worth storing. A slot whose
 *  video is hidden AND untouched is dropped, so the manifest stays as small as
 *  it was before any of this existed. */
function meaningful(slot: MediaSlot): boolean {
  return !!(slot.d || slot.m || slot.fit || slot.pos || slot.rate !== undefined);
}

function sanitise(input: unknown): MediaMap {
  const out: MediaMap = {};
  if (!input || typeof input !== 'object') return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const raw  = v as MediaSlot;
    const slot: MediaSlot = {};
    if (raw.d === 'video') slot.d = 'video';
    if (raw.m === 'video') slot.m = 'video';
    if (raw.fit === 'contain') slot.fit = 'contain';
    if (isPosition(raw.pos) && raw.pos !== DEFAULT_POSITION) slot.pos = raw.pos;
    if (isRate(raw.rate) && raw.rate !== 1) slot.rate = raw.rate;
    if (meaningful(slot)) out[k] = slot;
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

/** Read-modify-write one slot's record. Only the admin writes this, from a
 *  single form, so there is no concurrent-editor problem to solve.
 *
 *  Failures THROW. They used to be swallowed with a console warning, which
 *  meant a KV write that didn't land still reported a successful upload: the
 *  video sat in the bucket, the manifest never mentioned it, and the site kept
 *  showing the photograph with nothing anywhere saying why. */
async function editSlot(
  env: MediaEnv, site: Site, key: string, edit: (slot: MediaSlot) => void,
): Promise<void> {
  const kv = siteScope(env, site).kv;
  if (!kv) throw new Error('No KV namespace for this venue — the change could not be saved.');
  const map  = (await readFrom(kv)) ?? {};
  const slot: MediaSlot = { ...map[key] };
  edit(slot);
  if (meaningful(slot)) map[key] = slot;
  else delete map[key];
  await kv.put(KEY, JSON.stringify(map));
}

/** Show or hide the video in one of a slot's two frames. Hiding does NOT touch
 *  the file in R2 — see the note at the top of this module. */
export async function setMediaSlot(
  env: MediaEnv, site: Site, key: string, variant: MediaVariant, isVideo: boolean,
): Promise<void> {
  const field = variant === 'mobile' ? 'm' : 'd';
  await editSlot(env, site, key, (slot) => {
    if (isVideo) slot[field] = 'video';
    else delete slot[field];
  });
}

/** Save how a slot's video sits in its frame. Values equal to the default are
 *  removed rather than stored, so "reset" leaves no trace. */
export async function setMediaOptions(
  env: MediaEnv, site: Site, key: string, opts: MediaOptions,
): Promise<void> {
  await editSlot(env, site, key, (slot) => {
    if (opts.fit !== undefined) {
      if (opts.fit === 'contain') slot.fit = 'contain';
      else delete slot.fit;
    }
    if (opts.pos !== undefined) {
      if (isPosition(opts.pos) && opts.pos !== DEFAULT_POSITION) slot.pos = opts.pos;
      else delete slot.pos;
    }
    if (opts.rate !== undefined) {
      if (isRate(opts.rate) && opts.rate !== 1) slot.rate = opts.rate;
      else delete slot.rate;
    }
  });
}

/** Drop a slot's record entirely — used when its video file is deleted, so no
 *  framing settings linger to be silently reapplied to the next upload. */
export async function clearMediaSlot(env: MediaEnv, site: Site, key: string): Promise<void> {
  await editSlot(env, site, key, (slot) => {
    for (const k of Object.keys(slot)) delete (slot as Record<string, unknown>)[k];
  });
}

/** Serialise for embedding in a <script type="application/json"> tag. */
export function mediaToJson(map: MediaMap): string {
  return JSON.stringify(map).replace(/</g, '\\u003c');
}
