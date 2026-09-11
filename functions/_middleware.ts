// Root middleware — runs on every request that hits Cloudflare Pages
// Functions. On HTML responses it does three things, all from tiny KV reads
// so the page renders correctly on first paint with NO extra browser fetches:
//
//   1. Injects the saved colour palette as a <style> block.
//   2. Injects the saved editable copy as a <script id="zahara-content"> blob.
//   3. Stamps the current asset version onto every resized-image URL
//      (replacing ASSET_VERSION_TOKEN). Cloudflare caches each resized
//      variant under its /cdn-cgi/image/… URL — a store SEPARATE from R2 —
//      so re-uploading a photo (same URL) otherwise keeps serving the old
//      transform. Bumping the version on upload changes the URL, which forces
//      a fresh transform with no cache purge required.
//
// Non-HTML responses (assets, fonts, the API) are returned untouched.

import type { PagesFunction } from '@cloudflare/workers-types';
import { readPalette, paletteToCss, type PaletteEnv } from './data/palette';
import {
  readContent, contentToJson, readAssetVersion,
  readPopupConfig, popupActive, popupShowsImage, type ContentEnv,
} from './data/content';
import { readMenusOff, type MenuVisEnv } from './data/menu-visibility';
import { readMediaMap, type MediaEnv, type MediaMap } from './data/media';
import { readSections, sectionsToJson, type SectionEnv, type SectionMap } from './data/sections';
import { siteFromRequest, withSiteParam } from './data/site';

const ASSET_VERSION_TOKEN = '__ZASSETV__';

type Env = PaletteEnv & ContentEnv & MenuVisEnv & MediaEnv & SectionEnv;

// ── KV read budget ──────────────────────────────────────────────────────────
//
// Every HTML response used to cost FIVE KV reads, on every request. That is the
// one number here that scales with traffic: at five reads a pageview, the free
// plan's 100,000 daily reads are gone by 20,000 pageviews, and /reserve — a
// page whose whole job is to be opened from an Instagram bio — burned them
// alongside its own tracking writes.
//
// Two things fix that, and neither changes what a visitor sees:
//
//   1. A short in-isolate memo. All five records change only when the owner
//      presses Save in /admin, so re-reading them for every visitor in the same
//      second is pure waste. A Worker isolate is reused across requests, so one
//      read now serves every request that isolate handles for the next
//      MEMO_MS. Busy minutes collapse from thousands of reads to a handful.
//      The cost is bounded staleness: after saving, an edit can take up to
//      MEMO_MS to appear. Kept deliberately short for that reason.
//
//   2. Not reading what a page cannot use. /reserve/ is standalone — no
//      header, no footer, no menu embed, no entry popup — so the popup switch
//      and the menu-visibility list are two reads it can never spend.
//
// The memo is best-effort by nature: isolates are created and discarded at
// Cloudflare's discretion, so a cold one simply reads through. Nothing depends
// on it being warm.
const MEMO_MS = 30_000;

interface Memo<T> { at: number; value: T }
const memos = new Map<string, Memo<unknown>>();

/** Read through a per-isolate, time-boxed memo. `key` must identify the venue
 *  as well as the record — the two venues have separate stores, and serving
 *  one's palette to the other is exactly the bug this must not introduce. */
/** Pages built without BaseLayout, which therefore carry none of the chrome
 *  the popup and menu records feed. Matched on the path so the check costs
 *  nothing; if another standalone page is added, list it here. */
function isStandalonePage(request: { url: string }): boolean {
  try {
    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    return path === '/reserve' || path === '/rooftop/reserve';
  } catch {
    return false;
  }
}

/** Escape a value for an HTML attribute in the markup built above. Every
 *  value here comes from the site's own build, but this is generated markup —
 *  so it escapes rather than trusting that that stays true. */
function escAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function memoised<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = memos.get(key);
  if (hit && Date.now() - hit.at < MEMO_MS) return Promise.resolve(hit.value as T);
  return load().then((value) => {
    memos.set(key, { at: Date.now(), value });
    return value;
  });
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  // Let the request resolve normally first — we only rewrite the
  // response, never block the resolution.
  const response = await ctx.next();

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  // Which venue is this page? Rooftop pages live under /rooftop, so every KV
  // read below is scoped to the right store (and falls back to Zahara for any
  // item rooftop hasn't customised yet). Zahara pages are unaffected.
  const site = siteFromRequest(ctx.request);

  // The /reserve/ portal renders none of the site's chrome — no header, no
  // footer, no menu embed, no entry popup — so two of these five records have
  // nothing to act on there. Reading them anyway is two KV ops per visit on
  // the most-linked page on the site.
  const standalone = isStandalonePage(ctx.request);

  // Palette, editable copy, the asset version, and (where the page can use
  // them) the popup switch and menu list — read together so the added latency
  // stays a single round trip, and through the memo so a busy minute is one
  // round trip rather than one per visitor.
  const [palette, content, assetVersion, popupCfg, menusOff, media, sections] = await Promise.all([
    memoised(`palette:${site}`, () => readPalette(ctx.env, site)),
    memoised(`content:${site}`, () => readContent(ctx.env, site)),
    memoised(`version:${site}`, () => readAssetVersion(ctx.env, site)),
    standalone ? Promise.resolve(null) : memoised(`popup:${site}`, () => readPopupConfig(ctx.env, site)),
    standalone ? Promise.resolve([] as string[]) : memoised(`menus:${site}`, () => readMenusOff(ctx.env, site)),
    standalone ? Promise.resolve({} as MediaMap) : memoised(`media:${site}`, () => readMediaMap(ctx.env, site)),
    standalone ? Promise.resolve({} as SectionMap) : memoised(`sections:${site}`, () => readSections(ctx.env, site)),
  ]);

  const css        = paletteToCss(palette);
  const hasContent = Object.keys(content).length > 0;
  // The entry popup: its shell ships in every page's static HTML, but it only
  // activates when this marker tag is present — i.e. the owner has it turned
  // on in /admin/content → Popup and any auto-hide window hasn't ended.
  const popupOn    = popupCfg !== null && popupActive(popupCfg);

  // Inject the palette + content + popup + menu tags into <head> (when present).
  const sectionsOn = Object.keys(sections).length > 0;

  let res = response;
  if (css || hasContent || popupOn || menusOff.length || sectionsOn) {
    const styleTag = css
      ? `<style id="zahara-palette-server" data-zahara-palette>${css}</style>`
      : '';
    const contentTag = hasContent
      ? `<script id="zahara-content" type="application/json">${contentToJson(content)}</script>`
      : '';
    // The popup marker also carries HOW to present it: mode (text/photo/both)
    // and, when a photo applies, its cache-busted URL. The component's inline
    // script reads this to decide between the text card and the photo.
    const popupPayload = popupOn && popupCfg
      ? {
          active: true,
          mode: popupCfg.mode,
          // Rooftop's popup photo is served from its own bucket via ?site.
          image: popupShowsImage(popupCfg) ? withSiteParam(`/popup-image?v=${assetVersion}`, site) : '',
        }
      : null;
    const popupTag = popupPayload
      ? `<script id="zahara-popup" type="application/json">${
          JSON.stringify(popupPayload).replace(/</g, '\\u003c')
        }</script>`
      : '';
    // Menus this venue doesn't use — the menu embed and the home tiles drop
    // those categories before first paint.
    const menusTag = menusOff.length
      ? `<script id="zahara-menus" type="application/json">${
          JSON.stringify({ off: menusOff }).replace(/</g, '\\u003c')
        }</script>`
      : '';
    // Optional sections the owner has switched on. Absent = every optional
    // section stays hidden, which is what an unconfigured venue should do.
    const sectionsTag = sectionsOn
      ? `<script id="zahara-sections" type="application/json">${sectionsToJson(sections)}</script>`
      : '';
    res = new HTMLRewriter()
      .on('head', {
        element(el) {
          if (styleTag)    el.append(styleTag,    { html: true });
          if (contentTag)  el.append(contentTag,  { html: true });
          if (popupTag)    el.append(popupTag,    { html: true });
          if (menusTag)    el.append(menusTag,    { html: true });
          if (sectionsTag) el.append(sectionsTag, { html: true });
        },
      })
      .transform(res);
  }

  // ── Stills → video, where the owner has uploaded one ────────────────────
  // The build shipped an <img> for every slot; the manifest says which of them
  // are showing a video today. Doing the swap HERE, in the response, is what
  // makes it free: the browser receives a <video> and never sees — let alone
  // downloads — the photograph it replaced. A client-side swap would fetch
  // both, on the very elements (hero, gallery) where that hurts most.
  if (Object.keys(media).length) {
    res = new HTMLRewriter()
      // The hero's LCP preload describes the STILL. When that slot is a video
      // the still is never rendered, so the preload becomes a full-size
      // download of an image nobody sees — and a high-priority one, on the
      // exact request the page is racing.
      .on('link[data-hero-preload]', {
        element(el) {
          const key = el.getAttribute('data-hero-preload');
          if (key && media[key]?.d === 'video') el.remove();
        },
      })
      .on('[data-media-slot]', {
        element(el) {
          const key = el.getAttribute('data-media-slot');
          if (!key || media[key]?.d !== 'video') return;
          const src       = el.getAttribute('data-media-video') || '';
          const srcMobile = media[key]?.m === 'video'
            ? (el.getAttribute('data-media-video-mobile') || '') : '';
          if (!src) return;
          // The poster is the still this replaces, so the frame is filled from
          // the already-cached image while the video's first bytes arrive.
          const poster = el.getAttribute('data-media-poster') || '';
          const cls    = el.getAttribute('data-media-class') || '';
          el.setAttribute('data-media-is-video', '1');
          el.setInnerContent(
            `<video class="${escAttr(cls)}" playsinline muted loop autoplay preload="none"` +
            ` aria-hidden="true" tabindex="-1"` +
            (poster ? ` poster="${escAttr(poster)}"` : '') +
            ` data-video-src="${escAttr(src)}"` +
            (srcMobile ? ` data-video-src-mobile="${escAttr(srcMobile)}"` : '') +
            `></video>`,
            { html: true },
          );
        },
      })
      .transform(res);
  }

  // Stamp the asset version onto every resized-image URL. This requires
  // buffering the HTML (a few tens of KB), which is fine for page documents.
  let html = await res.text();
  if (html.includes(ASSET_VERSION_TOKEN)) {
    html = html.split(ASSET_VERSION_TOKEN).join(assetVersion);
  }

  const headers = new Headers(res.headers);
  headers.delete('content-length'); // body length changed; let the platform set it

  // The site is also served at *.pages.dev (the production alias + every
  // preview deployment). Tell search engines not to index those copies, so
  // they don't compete with zahara.rest as duplicate content. We noindex
  // rather than redirect, so preview deployments stay usable for QA.
  try {
    if (new URL(ctx.request.url).hostname !== 'zahara.rest') {
      headers.set('X-Robots-Tag', 'noindex');
    }
  } catch { /* malformed URL — leave headers untouched */ }

  return new Response(html, { status: res.status, statusText: res.statusText, headers });
};
