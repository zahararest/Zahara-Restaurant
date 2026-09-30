// POST /admin/images/video — the video a slot can show instead of its still.
//
// Body: multipart/form-data
//   key      — the catalogue key (e.g. 'hero')
//   variant  — 'desktop' (default) | 'mobile'
//   action   — what to do, to THAT frame only:
//                (omitted) upload the `file` field and show it
//                'show'    show the video that is already in the bucket
//                'hide'    go back to the photograph, KEEPING the video
//                'follow'  (phone only) show whatever the desktop shows
//                'delete'  remove the video file for good
//                'options' save fit / position / speed for this frame
//                'copy'    reuse a video already uploaded elsewhere:
//                          `from` (catalogue key) + `fromVariant`
//   file     — an MP4 / H.264 video, ≤ MAX_BYTES (upload only). See
//              inspect() and refuse() below for what is turned away and why.
//
// The two frames are independent: a phone can play a video over a desktop
// photograph and the other way round. Until the owner makes a choice for
// phones they follow the desktop, which is how every slot behaved before the
// frames were separated. See functions/data/media.ts.
//
// GET /admin/images/video?key=… — what this slot has: whether a video file
// exists for each frame, whether it is being shown, and its framing options.
//
// Deliberately a SEPARATE route from images/upload. That route runs every
// upload through a canvas crop editor and re-encodes it as a JPEG; a video has
// no business going anywhere near that path, and folding the two would mean a
// dozen `if (isVideo)` branches through code whose whole job is stills.
//
// The still is never touched, and neither is the video unless 'delete' says
// so: showing and hiding are flags in the media manifest, so the owner can go
// back and forth without re-uploading. See functions/data/media.ts.

import type { PagesFunction, R2Bucket } from '@cloudflare/workers-types';
import { checkAccess, type AuthEnv } from '../auth';
import { PHOTO_CATALOGUE, photoSite, canShowVideo } from '../../data/photos-map';
import { bumpAssetVersion, type ContentEnv } from '../../data/content';
import {
  readMediaMap, setDesktopVideo, setPhoneMode, setMediaOptions,
  clearDesktopVideo, clearPhoneVideo, videoObjectKey, videoState,
  isPosition, isRate, type MediaEnv, type MediaVariant,
} from '../../data/media';
import { adminSite, siteScope } from '../../data/site';

interface Env extends AuthEnv, ContentEnv, MediaEnv { IMAGES?: R2Bucket; }

/** 40 MB. Big enough for the 10–20s loops these slots are for, small enough
 *  that a phone on hotel wifi can still upload one — and that nobody
 *  accidentally puts a 4K master on the home page. */
const MAX_BYTES = 40 * 1024 * 1024;

// The MIME type the BROWSER claims, which is only a first filter — every
// upload is then read for what it actually contains (inspect()). WebM is no
// longer on the list: iOS Safari cannot play it, so a WebM hero is a hero
// that is broken for most of this site's visitors.
const VALID_TYPES = new Set(['video/mp4', 'video/quicktime']);

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...(status === 401 ? { 'WWW-Authenticate': 'Basic realm="Admin"' } : {}),
    },
  });
}

/** Read a four-character box/brand code at an offset. */
function fourcc(bytes: Uint8Array, at: number): string {
  if (at + 4 > bytes.length) return '';
  return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
}

/** Magic-byte check, so a renamed .mov or a mislabelled upload is caught here
 *  rather than by a browser that silently refuses to play it.
 *   MP4 / MOV — an ISO-BMFF 'ftyp' box at offset 4.
 *   WebM      — the EBML header 1A 45 DF A3. */
function detectVideoType(bytes: Uint8Array): string | null {
  if (bytes.length < 16) return null;
  // Still recognised, so that refuse() can turn it away by name rather than
  // with a generic "not a video" — see inspect().
  if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) return 'video/webm';
  if (fourcc(bytes, 4) === 'ftyp') {
    // 'qt  ' brand is a QuickTime .mov. Browsers play the common H.264 ones,
    // but not reliably — served as mp4 it works wherever it is going to work.
    return 'video/mp4';
  }
  return null;
}

/** Find a four-character code anywhere in the buffer. Used to read the codec
 *  out of the sample-description box without walking the whole atom tree — the
 *  codes below are distinctive enough that a false positive in compressed
 *  video data would be an extraordinary coincidence, and the cost of one is a
 *  clear error message asking for an H.264 export. */
function contains(bytes: Uint8Array, code: string): boolean {
  const a = code.charCodeAt(0), b = code.charCodeAt(1), c = code.charCodeAt(2), d = code.charCodeAt(3);
  for (let i = 0; i + 3 < bytes.length; i++) {
    if (bytes[i] === a && bytes[i + 1] === b && bytes[i + 2] === c && bytes[i + 3] === d) return true;
  }
  return false;
}

/** What is actually inside the file, as far as it matters to a browser.
 *
 *  Every field here exists because a file that passed the old checks went live
 *  and played nowhere. The rule this enforces is the only one that holds
 *  everywhere: **H.264 video in an MP4, with the index at the front.**
 *
 *   • `hevc` — H.265, what an iPhone records by default. Safari decodes it,
 *     Chrome, Edge and Firefox do not. The owner uploads from a Mac, sees it
 *     play, and the site is broken for most visitors with no error anywhere.
 *     The old check read only the `ftyp` brand list, which a QuickTime .mov
 *     does not put codec brands in — so an HEVC .mov sailed through and the
 *     rooftop hero sat on a dead play arrow in every Chrome.
 *   • `webm` — VP8/VP9/AV1 in WebM. The mirror image: Chrome plays it, iOS
 *     Safari does not, and on a restaurant site most visitors are on an
 *     iPhone. It used to be an accepted upload type. It is not any more.
 *   • `prores` / other QuickTime-only codecs — an editing master, not a web
 *     file. Nothing in a browser decodes them.
 *   • `faststart` — where the `moov` index sits. Behind the media data, the
 *     player cannot know the duration or the codec until it has fetched to
 *     the end of the file, so a background loop either stalls or downloads
 *     whole before showing a frame.
 *
 *  Only the head and the tail are scanned. `moov` lives at one end or the
 *  other by construction, and the codec code lives inside it, so a 40 MB
 *  buffer is read at its two edges rather than end to end. */
const SNIFF_BYTES = 512 * 1024;

interface VideoFacts {
  container: 'mp4' | 'mov' | 'webm' | null;
  hevc:      boolean;
  h264:      boolean;
  prores:    boolean;
  faststart: boolean;
}

function inspect(bytes: Uint8Array): VideoFacts {
  const facts: VideoFacts = { container: null, hevc: false, h264: false, prores: false, faststart: true };

  if (bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
    facts.container = 'webm';
    return facts;
  }
  if (fourcc(bytes, 4) !== 'ftyp') return facts;

  const size = Math.min((bytes[0] << 24 | bytes[1] << 16 | bytes[2] << 8 | bytes[3]) >>> 0, 256);
  const brands: string[] = [];
  for (let at = 8; at + 4 <= size && at + 4 <= bytes.length; at += 4) brands.push(fourcc(bytes, at));
  facts.container = brands[0] === 'qt  ' ? 'mov' : 'mp4';

  // The head and the tail, which between them always hold `moov`.
  const head = bytes.subarray(0, Math.min(SNIFF_BYTES, bytes.length));
  const tail = bytes.length > SNIFF_BYTES ? bytes.subarray(bytes.length - SNIFF_BYTES) : head;

  // Faststart means `moov` comes BEFORE the first `mdat`.
  //
  // Read it from `mdat`, not from `moov`: a long clip's index can itself run
  // past the window scanned here, and "I did not find moov in the first half
  // megabyte" would then condemn a perfectly good file. Not finding `mdat`
  // means the media data has not begun yet, which is only true when the index
  // is still in front of it.
  const moovHead = indexOfCode(head, 'moov');
  const mdatHead = indexOfCode(head, 'mdat');
  facts.faststart = mdatHead < 0 || (moovHead >= 0 && moovHead < mdatHead);

  for (const where of [head, tail]) {
    if (contains(where, 'hvc1') || contains(where, 'hev1')) facts.hevc = true;
    if (contains(where, 'avc1') || contains(where, 'avcC')) facts.h264 = true;
    if (contains(where, 'apcn') || contains(where, 'apch') ||
        contains(where, 'apcs') || contains(where, 'ap4h')) facts.prores = true;
  }
  // A brand list that names HEVC and nothing else counts too — some encoders
  // write the codec only there.
  if (brands.some((b) => b === 'hvc1' || b === 'hev1' || b === 'hevc' || b === 'hevx')) facts.hevc = true;
  return facts;
}

function indexOfCode(bytes: Uint8Array, code: string): number {
  const a = code.charCodeAt(0), b = code.charCodeAt(1), c = code.charCodeAt(2), d = code.charCodeAt(3);
  for (let i = 0; i + 3 < bytes.length; i++) {
    if (bytes[i] === a && bytes[i + 1] === b && bytes[i + 2] === c && bytes[i + 3] === d) return i;
  }
  return -1;
}

/** The refusal a file earns, or null if it is fit to serve. One message per
 *  problem, each one saying what to do about it — an owner reading "unsupported
 *  format" learns nothing they can act on. */
function refuse(facts: VideoFacts): string | null {
  const reexport =
    'Re-export it as MP4 / H.264 (in QuickTime, Photos or any editor: “most compatible”, ' +
    'or H.264 1080p), then upload it again.';

  if (!facts.container) return 'That file does not look like a video at all.';

  if (facts.container === 'webm') {
    return 'That video is a WebM (VP8/VP9). iPhones and iPads cannot play WebM at all, ' +
           'and most visitors here are on one — they would see the photograph instead. ' + reexport;
  }
  if (facts.prores && !facts.h264) {
    return 'That video is a ProRes editing master — no browser can play it, and the file is ' +
           'far bigger than a web loop needs. ' + reexport;
  }
  if (facts.hevc && !facts.h264) {
    return 'That video is HEVC (H.265) — iPhones record this by default and Chrome, Edge and ' +
           'Firefox cannot play it, so most visitors would see the photograph instead. ' +
           'On the iPhone: Settings → Camera → Formats → “Most Compatible”, then re-record — ' +
           'or ' + reexport.charAt(0).toLowerCase() + reexport.slice(1);
  }
  if (!facts.faststart) {
    return 'That video has its index at the end of the file, so a browser has to download ' +
           'the whole clip before it can show a single frame — which reads as a video that ' +
           'never starts. Re-save it “optimised for web” / with faststart (ffmpeg: ' +
           '-movflags +faststart), then upload it again.';
  }
  return null;
}

/** Everything the admin needs to draw one slot's video controls — the SAME
 *  shape the page renders its cards from (videoState), so a redraw after a
 *  button press can never read a field the first render didn't have. */
async function slotState(env: Env, site: ReturnType<typeof adminSite>, key: string) {
  const bucket = siteScope(env, site).images;
  const [media, desktop, mobile] = await Promise.all([
    readMediaMap(env, site),
    bucket ? bucket.head(`images/${videoObjectKey(key, 'desktop')}`).catch(() => null) : null,
    bucket ? bucket.head(`images/${videoObjectKey(key, 'mobile')}`).catch(() => null) : null,
  ]);
  return videoState(key, media[key], {
    // Has a FILE — which is what makes "show it again" possible.
    hasFile:        !!desktop,
    size:           desktop?.size ?? 0,
    type:           desktop?.httpMetadata?.contentType ?? '',
    uploaded:       desktop?.uploaded ? new Date(desktop.uploaded).toISOString() : '',
    hasMobileFile:  !!mobile,
    mobileSize:     mobile?.size ?? 0,
    mobileType:     mobile?.httpMetadata?.contentType ?? '',
    mobileUploaded: mobile?.uploaded ? new Date(mobile.uploaded).toISOString() : '',
  });
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return json({ ok: false, error: 'Unauthorized' }, 401);
  const key  = new URL(request.url).searchParams.get('key') || '';
  const meta = PHOTO_CATALOGUE.find((p) => p.key === key);
  if (!meta || !canShowVideo(meta)) return json({ ok: false, error: `Unknown video slot: ${key}` }, 400);
  const site = photoSite(adminSite(request), key);
  return json({ ok: true, ...(await slotState(env, site, key)) });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return json({ ok: false, error: 'Unauthorized' }, 401);

  const editing = adminSite(request);

  let form: FormData;
  try { form = await request.formData(); }
  catch { return json({ ok: false, error: 'Expected multipart/form-data' }, 400); }

  const key  = String(form.get('key') || '');
  const meta = PHOTO_CATALOGUE.find((p) => p.key === key);
  if (!meta)               return json({ ok: false, error: `Unknown image key: ${key}` }, 400);
  if (!canShowVideo(meta)) return json({ ok: false, error: `${meta.label} is not a slot that can show a video` }, 400);

  const variant: MediaVariant = String(form.get('variant') || '') === 'mobile' ? 'mobile' : 'desktop';
  if (variant === 'mobile' && !meta.mobile) {
    return json({ ok: false, error: `${meta.label} has no separate phone frame` }, 400);
  }
  const isPhone = variant === 'mobile';

  const site   = photoSite(editing, key);
  const bucket = siteScope(env, site).images;
  if (!bucket) return json({ ok: false, error: 'IMAGES binding missing for this venue' }, 500);

  const objectKey = videoObjectKey(key, variant);
  const action    = String(form.get('action') || '');

  /** Every path ends the same way: bump the asset version so every ?v= on the
   *  page changes, then hand back the slot's full state so the admin redraws
   *  from what the server actually has rather than from what it hoped. */
  const finish = async (extra: object = {}) => {
    await bumpAssetVersion(env, site);
    return json({ ok: true, ...(await slotState(env, site, key)), ...extra });
  };

  /** A KV write that failed, said plainly — see editSlot() for why these are
   *  never swallowed. */
  const saveFailed = (err: unknown, prefix = 'Could not save') => {
    console.error('[admin/images/video] KV write failed', err);
    return json({ ok: false, error: `${prefix}: ${String((err as Error)?.message || err)}` }, 500);
  };

  // ── Framing options ──────────────────────────────────────────────────────
  // One record per FRAME. A phone frame is a different shape from a desktop
  // one, so the part of the clip worth keeping is usually different too.
  if (action === 'options') {
    const rawFit  = String(form.get('fit')  || '');
    const rawPos  = String(form.get('pos')  || '');
    const rawRate = form.get('rate');
    const opts: Parameters<typeof setMediaOptions>[3] = {};
    if (rawFit)  opts.fit = rawFit === 'contain' ? 'contain' : 'cover';
    if (rawPos)  {
      if (!isPosition(rawPos)) return json({ ok: false, error: 'Bad focal point' }, 400);
      opts.pos = rawPos;
    }
    if (rawRate !== null) {
      const n = Number(rawRate);
      if (!isRate(n)) return json({ ok: false, error: 'Speed must be between 0.25× and 2×' }, 400);
      opts.rate = n;
    }
    try { await setMediaOptions(env, site, key, opts, variant); }
    catch (err) { return saveFailed(err); }
    return finish();
  }

  // ── Phones: play whatever the desktop shows ──────────────────────────────
  if (action === 'follow') {
    if (!isPhone) return json({ ok: false, error: 'Only the phone frame can follow the desktop' }, 400);
    try { await setPhoneMode(env, site, key, 'follow'); }
    catch (err) { return saveFailed(err); }
    return finish();
  }

  // ── Show the video that is already there ─────────────────────────────────
  if (action === 'show') {
    const head = await bucket.head(`images/${objectKey}`).catch(() => null);
    if (!head) {
      return json({
        ok: false,
        error: isPhone
          ? 'There is no phone video to show — upload one first.'
          : 'There is no video for this slot yet — upload one first.',
      }, 404);
    }
    try {
      if (isPhone) await setPhoneMode(env, site, key, 'video');
      else         await setDesktopVideo(env, site, key, true);
    } catch (err) { return saveFailed(err); }
    return finish();
  }

  // ── Go back to the photograph — the video file STAYS ─────────────────────
  // Only this frame changes. Phones that follow the desktop follow it back to
  // the photo; phones with a video of their own keep playing it.
  if (action === 'hide') {
    try {
      if (isPhone) await setPhoneMode(env, site, key, 'photo');
      else         await setDesktopVideo(env, site, key, false);
    } catch (err) { return saveFailed(err); }
    return finish();
  }

  // ── Delete the file for good ─────────────────────────────────────────────
  if (action === 'delete') {
    try { await bucket.delete(`images/${objectKey}`); }
    catch (err) {
      console.error('[admin/images/video] R2 delete failed', err);
      return json({ ok: false, error: 'Storage failed' }, 500);
    }
    try {
      if (isPhone) await clearPhoneVideo(env, site, key);
      else         await clearDesktopVideo(env, site, key);
    } catch (err) {
      return saveFailed(err, 'Deleted the file, but the change could not be saved');
    }
    return finish();
  }

  // ── Reuse a video that is already in the bucket ──────────────────────────
  // The same idea as "Choose existing" for stills (see images/apply.ts): a clip
  // that is already up shouldn't have to travel again from a phone on hotel
  // wifi to sit in a second frame — which is exactly what the hero usually
  // wants, the same loop on desktop and on phones, framed differently.
  //
  // The bytes are COPIED, not shared: every frame keeps its own object, so
  // deleting the video on one slot can never empty another. Cheap enough —
  // R2 to R2 inside one datacentre, and the ceiling is 40 MB.
  if (action === 'copy') {
    const fromKey  = String(form.get('from') || '');
    const fromMeta = PHOTO_CATALOGUE.find((p) => p.key === fromKey);
    const fromVariant: MediaVariant = String(form.get('fromVariant') || '') === 'mobile' ? 'mobile' : 'desktop';
    if (!fromMeta || !canShowVideo(fromMeta)) {
      return json({ ok: false, error: `Unknown video to copy: ${fromKey}` }, 400);
    }
    if (fromKey === key && fromVariant === variant) {
      return json({ ok: false, error: 'That is this frame’s own video.' }, 400);
    }
    // Shared slots keep their files in Zahara's bucket whichever venue is being
    // edited, so the SOURCE bucket is resolved from the source key — copying a
    // shared clip into a rooftop slot reads from one bucket and writes to
    // another.
    const fromBucket = siteScope(env, photoSite(editing, fromKey)).images;
    if (!fromBucket) return json({ ok: false, error: 'IMAGES binding missing for this venue' }, 500);

    const src = await fromBucket.get(`images/${videoObjectKey(fromKey, fromVariant)}`).catch(() => null);
    if (!src) {
      return json({
        ok: false,
        error: `${fromMeta.label} has no ${fromVariant === 'mobile' ? 'phone ' : ''}video any more — ` +
               'reload the page to see what is actually there.',
      }, 404);
    }

    const buffer = new Uint8Array(await src.arrayBuffer());
    // It passed the format checks on its way in; re-reading the brands costs a
    // few bytes and means a file that somehow got in another way can't spread.
    const detected = detectVideoType(buffer);
    if (!detected) return json({ ok: false, error: 'That stored file is not a video we can serve' }, 415);
    const storedProblem = refuse(inspect(buffer));
    if (storedProblem) {
      return json({ ok: false, error: 'That video cannot be reused: ' + storedProblem }, 415);
    }

    try {
      await bucket.put(`images/${objectKey}`, buffer, { httpMetadata: { contentType: detected } });
    } catch (err) {
      console.error('[admin/images/video] R2 copy put failed', err);
      return json({ ok: false, error: 'Storage failed' }, 500);
    }
    const copied = await bucket.head(`images/${objectKey}`).catch(() => null);
    if (!copied) return json({ ok: false, error: 'The video did not save. Please try again.' }, 500);

    try {
      if (isPhone) await setPhoneMode(env, site, key, 'video');
      else         await setDesktopVideo(env, site, key, true);
    } catch (err) {
      return saveFailed(err, 'The video was copied, but switching the slot to it failed');
    }
    return finish({ copiedFrom: fromMeta.label });
  }

  // ── Upload ───────────────────────────────────────────────────────────────
  // Either frame can go first. A phone video uploaded on its own makes the
  // slot a video on phones and leaves desktop on the photograph.
  type UploadedFile = { size: number; type?: string; name?: string; arrayBuffer(): Promise<ArrayBuffer> };
  const rawEntry = form.get('file') as unknown;
  if (rawEntry === null || typeof rawEntry === 'string' ||
      typeof (rawEntry as UploadedFile)?.arrayBuffer !== 'function') {
    return json({ ok: false, error: 'Missing file field' }, 400);
  }
  const file = rawEntry as UploadedFile;
  if (file.size === 0)         return json({ ok: false, error: 'File is empty' }, 400);
  if (file.size > MAX_BYTES)   return json({ ok: false, error: `Video is larger than ${Math.round(MAX_BYTES / 1024 / 1024)} MB` }, 413);
  if (file.type && !VALID_TYPES.has(file.type)) {
    return json({ ok: false, error: `Unsupported video type: ${file.type}` }, 415);
  }

  const buffer   = new Uint8Array(await file.arrayBuffer());
  const detected = detectVideoType(buffer);
  if (!detected) return json({ ok: false, error: 'That file does not look like an MP4 video' }, 415);
  // What is actually in the file, not what its name or its MIME type claims.
  // This is the gate that was missing: the hero videos on both venues were
  // accepted here — one a VP9 WebM named .mp4, one an HEVC QuickTime named
  // .mp4 — and each one played on the machine it was uploaded from and
  // nowhere else.
  const problem = refuse(inspect(buffer));
  if (problem) return json({ ok: false, error: problem }, 415);

  try {
    await bucket.put(`images/${objectKey}`, buffer, { httpMetadata: { contentType: detected } });
  } catch (err) {
    console.error('[admin/images/video] R2 put failed', err);
    return json({ ok: false, error: 'Storage failed' }, 500);
  }

  // Read it straight back. A put that reported success but stored nothing would
  // otherwise leave the manifest pointing at a 404, which is the one failure
  // mode the page cannot recover from on its own.
  const stored = await bucket.head(`images/${objectKey}`).catch(() => null);
  if (!stored) {
    return json({ ok: false, error: 'The video did not save. Please try again.' }, 500);
  }

  try {
    if (isPhone) await setPhoneMode(env, site, key, 'video');
    else         await setDesktopVideo(env, site, key, true);
  } catch (err) {
    return saveFailed(err, 'The video uploaded, but switching the slot to it failed');
  }

  return finish();
};
