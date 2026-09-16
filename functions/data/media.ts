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
//   d    — the desktop frame: 'video' when the video is SHOWN there
//   m    — the phone frame, which is its OWN decision:
//            (absent) follow the desktop — a video on desktop plays on phones
//                     too, a photo on desktop is a photo on phones
//            'video'  phones play the phone video, whatever desktop shows
//            'photo'  phones show the photo, whatever desktop shows
//   fit  — 'contain' when the desktop video is shown whole rather than cropped
//   pos  — object-position ("50% 35%"), which part of the frame to keep
//   rate — playback speed, when the owner has slowed or quickened the loop
//   mfit / mpos / mrate — the same three for the PHONE frame. Each one that is
//          absent falls back to the desktop value, which is how a phone that
//          follows the desktop clip keeps the desktop framing until the owner
//          frames it for phones. Unlike the desktop values these are stored
//          even when they equal the defaults: "centre, cropped, normal speed"
//          chosen for phones is a real choice, distinct from "same as desktop".
//
// A key that is absent means "still photograph", which is what every slot is
// until someone uploads a video. The middleware turns this into a markup
// rewrite (see functions/_middleware.ts), so the page ships the right element
// the first time.
//
// ── Why phone and desktop can differ ───────────────────────────────────────
// One page is served to every screen, so the server cannot know which frame a
// visitor will see. When both frames are videos that doesn't matter: the still
// is replaced outright and the browser picks the file. When only ONE frame is
// a video, the still stays in the markup and the video is laid over it, shown
// only at its breakpoint — the still is what the other frame shows, and it is
// also the video's poster on its own frame. See functions/_middleware.ts.
//
// ── R2 layout ──────────────────────────────────────────────────────────────
// A video never overwrites the still it replaces. They live side by side:
//
//   images/{key}                 the desktop still
//   images/{key}__mobile         the portrait still
//   images/{key}__video          the desktop video
//   images/{key}__video_mobile   the phone video
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
// Switching back to the photograph only changes the flag. The video stays in
// the bucket, so "show it again" is one press rather than another upload —
// which is the whole point of calling it a switch. Only an explicit "delete
// the video" removes the file, and it says so before it does.

import type { KVNamespace } from '@cloudflare/workers-types';
import { siteScope, type Site, type SiteBindings } from './site';

export type MediaEnv = SiteBindings;

const KEY = '__media__';

/** Which of a slot's two frames a piece of media belongs to. */
export type MediaVariant = 'desktop' | 'mobile';

/** One slot's state. Absent `d`/`m` mean "a still photograph is shown here"
 *  (for `m`: "whatever the desktop shows"); the rest is how the video sits in
 *  its frame, stored only when the owner has moved it off the defaults. */
export interface MediaSlot {
  d?:    'video';
  m?:    'video' | 'photo';
  /** 'contain' shows the whole frame (letterboxed); default is 'cover'. */
  fit?:  'contain';
  /** CSS object-position, e.g. "50% 35%". Default is dead centre. */
  pos?:  string;
  /** Playback speed, 0.25–2. Default 1. */
  rate?: number;
  /** Phone framing — see the note at the top. Absent = same as desktop. */
  mfit?:  'cover' | 'contain';
  mpos?:  string;
  mrate?: number;
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

/** Whether each frame of a slot is showing a video. The one place the "phones
 *  follow the desktop unless told otherwise" rule is spelled out, so the
 *  middleware, the admin and the gallery API can never disagree about it. */
export function frameModes(slot: MediaSlot | undefined): { desktop: boolean; mobile: boolean } {
  const desktop = slot?.d === 'video';
  const mobile  = slot?.m === 'video' ? true : slot?.m === 'photo' ? false : desktop;
  return { desktop, mobile };
}

/** What a phone is actually shown:
 *    'own'     — the phone video
 *    'desktop' — the desktop video (following it, or no phone file to play)
 *    'photo'   — the still
 *  File presence matters here because /videos falls back to the desktop file
 *  when a phone file is asked for and missing. */
export type PhoneMode = 'own' | 'desktop' | 'photo';
export function phoneMode(slot: MediaSlot | undefined, hasFile: boolean, hasMobileFile: boolean): PhoneMode {
  if (!frameModes(slot).mobile) return 'photo';
  if (slot?.m === 'video') return hasMobileFile ? 'own' : (hasFile ? 'desktop' : 'photo');
  return hasFile ? 'desktop' : 'photo';
}

/** Framing for one frame, with the phone falling back to the desktop value
 *  field by field and both falling back to the defaults. */
export function framingFor(slot: MediaSlot | undefined, variant: MediaVariant) {
  const s = slot ?? {};
  const dFit  = s.fit === 'contain' ? 'contain' : 'cover';
  const dPos  = s.pos ?? DEFAULT_POSITION;
  const dRate = s.rate ?? 1;
  if (variant === 'desktop') return { fit: dFit, pos: dPos, rate: dRate } as const;
  return {
    fit:  (s.mfit ?? dFit) as 'cover' | 'contain',
    pos:  s.mpos ?? dPos,
    rate: s.mrate ?? dRate,
  } as const;
}

/** True when a record still carries something worth storing. A slot whose
 *  video is hidden AND untouched is dropped, so the manifest stays as small as
 *  it was before any of this existed. */
function meaningful(slot: MediaSlot): boolean {
  return !!(slot.d || slot.m || slot.fit || slot.pos || slot.rate !== undefined ||
            slot.mfit || slot.mpos || slot.mrate !== undefined);
}

function sanitise(input: unknown): MediaMap {
  const out: MediaMap = {};
  if (!input || typeof input !== 'object') return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue;
    const raw  = v as MediaSlot;
    const slot: MediaSlot = {};
    if (raw.d === 'video') slot.d = 'video';
    if (raw.m === 'video' || raw.m === 'photo') slot.m = raw.m;
    if (raw.fit === 'contain') slot.fit = 'contain';
    if (isPosition(raw.pos) && raw.pos !== DEFAULT_POSITION) slot.pos = raw.pos;
    if (isRate(raw.rate) && raw.rate !== 1) slot.rate = raw.rate;
    if (raw.mfit === 'cover' || raw.mfit === 'contain') slot.mfit = raw.mfit;
    if (isPosition(raw.mpos)) slot.mpos = raw.mpos;
    if (isRate(raw.mrate)) slot.mrate = raw.mrate;
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

/** Show or hide the DESKTOP video. The phone frame is left exactly as it is:
 *  a phone following the desktop follows this change, a phone with its own
 *  choice keeps it. Hiding does NOT touch the file in R2. */
export async function setDesktopVideo(env: MediaEnv, site: Site, key: string, show: boolean): Promise<void> {
  await editSlot(env, site, key, (slot) => {
    if (show) slot.d = 'video';
    else delete slot.d;
  });
}

/** Set what phones show. 'follow' clears the phone's own choice.
 *
 *  'photo' is only stored when it differs from following: with no desktop
 *  video, following already means the photo, and storing it would quietly
 *  keep phones on the photograph the next time a desktop video goes up — which
 *  is not something the owner decided. */
export async function setPhoneMode(
  env: MediaEnv, site: Site, key: string, mode: 'video' | 'photo' | 'follow',
): Promise<void> {
  await editSlot(env, site, key, (slot) => {
    if (mode === 'video') slot.m = 'video';
    else if (mode === 'photo' && slot.d === 'video') slot.m = 'photo';
    else delete slot.m;
  });
}

/** Save how one frame's video sits in its frame. Desktop values equal to the
 *  default are removed rather than stored; phone values are stored as given
 *  (see the note at the top). */
export async function setMediaOptions(
  env: MediaEnv, site: Site, key: string, opts: MediaOptions, variant: MediaVariant = 'desktop',
): Promise<void> {
  await editSlot(env, site, key, (slot) => {
    if (variant === 'mobile') {
      if (opts.fit !== undefined)  slot.mfit = opts.fit === 'contain' ? 'contain' : 'cover';
      if (opts.pos !== undefined && isPosition(opts.pos)) slot.mpos = opts.pos;
      if (opts.rate !== undefined && isRate(opts.rate))   slot.mrate = opts.rate;
      return;
    }
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

/** The desktop video file was deleted: stop showing it and forget its framing,
 *  so nothing lingers to be silently reapplied to the next upload.
 *
 *  The phone frame is independent and survives. If it inherits any framing
 *  from the desktop, that framing is copied onto the phone first, so deleting
 *  the desktop clip doesn't re-crop the phone one. A stored 'photo' choice
 *  only meant "not the desktop video", which no longer exists, so it goes. */
export async function clearDesktopVideo(env: MediaEnv, site: Site, key: string): Promise<void> {
  await editSlot(env, site, key, (slot) => {
    if (slot.m === 'video') {
      const phone = framingFor(slot, 'mobile');
      slot.mfit = phone.fit; slot.mpos = phone.pos; slot.mrate = phone.rate;
    }
    if (slot.m === 'photo') delete slot.m;
    delete slot.d; delete slot.fit; delete slot.pos; delete slot.rate;
  });
}

/** The phone video file was deleted: phones go back to following the desktop
 *  (the photo, or the desktop clip if one is showing), and the framing chosen
 *  for the deleted clip goes with it. */
export async function clearPhoneVideo(env: MediaEnv, site: Site, key: string): Promise<void> {
  await editSlot(env, site, key, (slot) => {
    if (slot.m === 'video') delete slot.m;
    delete slot.mfit; delete slot.mpos; delete slot.mrate;
  });
}

/** Serialise for embedding in a <script type="application/json"> tag. */
export function mediaToJson(map: MediaMap): string {
  return JSON.stringify(map).replace(/</g, '\\u003c');
}

/** Everything the admin needs to draw a slot's video controls, on either card.
 *  Computed in ONE place so the page's first render and every later redraw
 *  (from an endpoint response) read the same fields. */
export interface VideoFiles {
  hasFile: boolean;       size: number;       type: string;       uploaded: string;
  hasMobileFile: boolean; mobileSize: number; mobileType: string; mobileUploaded: string;
}
export function videoState(key: string, slot: MediaSlot | undefined, files: VideoFiles) {
  const modes   = frameModes(slot);
  const desktop = framingFor(slot, 'desktop');
  const phone   = framingFor(slot, 'mobile');
  return {
    key,
    ...files,
    // Is SHOWN — which is what a visitor sees.
    showing:       modes.desktop,
    phoneMode:     phoneMode(slot, files.hasFile, files.hasMobileFile),
    /** The phone has a choice of its own, rather than following the desktop. */
    phoneChoice:   slot?.m ?? '',
    fit: desktop.fit, pos: desktop.pos, rate: desktop.rate,
    mfit: phone.fit,  mpos: phone.pos,  mrate: phone.rate,
    /** Phone framing is its own rather than borrowed from the desktop. */
    phoneFramed:   !!(slot?.mfit || slot?.mpos || slot?.mrate !== undefined),
  };
}
export type VideoState = ReturnType<typeof videoState>;
