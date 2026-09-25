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
import { readPricesOff, type PriceVisEnv } from './data/price-visibility';
import {
  readMediaMap, frameModes, framingFor, DEFAULT_POSITION, type MediaEnv, type MediaMap,
} from './data/media';
import { readSections, sectionsToJson, type SectionEnv, type SectionMap } from './data/sections';
import { readHomeLayout, type HomeLayout, type HomeSectionEnv } from './data/home-sections';
import { siteFromRequest, withSiteParam } from './data/site';

const ASSET_VERSION_TOKEN = '__ZASSETV__';

type Env = PaletteEnv & ContentEnv & MenuVisEnv & PriceVisEnv & MediaEnv & SectionEnv & HomeSectionEnv;

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
//      and the menu-visibility list are two reads it can never spend. (Its two
//      panels are photo slots like any other, so it DOES read the media map.)
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

/** The home page, in either language, for either venue — the only page whose
 *  sections can be switched off, so the only one that reads that record. */
function isHomePage(request: { url: string }): boolean {
  try {
    const path = new URL(request.url).pathname.replace(/index\.html$/, '').replace(/\/+$/, '');
    return path === '' || path === '/en' || path === '/rooftop' || path === '/rooftop/en';
  } catch {
    return false;
  }
}

/** The menu page, in either language, for either venue — the only page that
 *  shows prices, so the only one that reads which menus hide them. */
function isMenuPage(request: { url: string }): boolean {
  try {
    const path = new URL(request.url).pathname.replace(/index\.html$/, '').replace(/\/+$/, '');
    return /^(\/rooftop)?(\/en)?\/menu$/.test(path);
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

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', lt: '<', gt: '>', apos: "'" };

/** An attribute's VALUE, decoded. HTMLRewriter hands attributes back exactly as
 *  they sit in the source, entities and all, so copying one into new markup
 *  without decoding it first escapes it twice.
 *
 *  That is not hypothetical: every rooftop URL carries `&site=rooftop`, which
 *  the build writes as `&amp;site=rooftop`, which came out of escAttr() as
 *  `&amp;amp;site=rooftop` — so the browser asked for `?amp;site=rooftop`, the
 *  /videos route saw no venue, looked in Zahara's bucket and answered 404. The
 *  rooftop hero video uploaded fine and never played, and its poster quietly
 *  showed Zahara's photograph. Zahara's own URLs have no `&`, which is why only
 *  the rooftop broke. */
function attr(el: { getAttribute(name: string): string | null }, name: string): string {
  const raw = el.getAttribute(name);
  if (!raw) return '';
  return raw.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, ent: string) => {
    if (ent[0] === '#') {
      const code = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[ent.toLowerCase()] ?? whole;
  });
}

// ── Video slots: how a video sits in the page ───────────────────────────────
// Global on purpose. The <video> is generated here, not by Astro, so it never
// carries the scope attribute component styles are compiled against (the swap
// copies the slot's scope attribute across for exactly that reason — see
// below — but these rules have to hold on every page, including /reserve/,
// which loads none of the site's stylesheets).
//
//  • A slot showing a video on ONE frame only keeps its still and lays the
//    video over it, shown at its own breakpoint and nowhere else. The still is
//    what the other frame shows, and on this frame it is the poster — once the
//    video has a picture the still underneath is hidden, so a "fit whole" clip
//    doesn't letterbox onto the photograph.
//  • Framing is written onto the element as custom properties, one pair per
//    frame, and applied here so the phone and the desktop can each keep a
//    different part of the clip without the server knowing the screen.
//
// 600px is the phone breakpoint every <picture> and MediaVideo.astro use.
// The still under a ONE-frame video is hidden from the first paint, not once
// the clip is ready. Waiting for `data-video-ready` meant the frame opened on
// the photograph and then cut to the video — the same flash the poster caused
// on both-frame slots. The still comes back only if the video gives up
// (`data-video-failed`), or if the visitor asked for reduced motion, in which
// case the photograph IS the intended picture.
const MEDIA_CSS =
  '[data-media-is-video=desktop]>video,[data-media-is-video=mobile]>video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}' +
  '@media (max-width:600px){[data-media-is-video=desktop]>video{display:none!important}' +
    '[data-media-is-video=mobile]:has(>video:not([data-video-failed]))>:not(video){visibility:hidden}}' +
  '@media (min-width:601px){[data-media-is-video=mobile]>video{display:none!important}' +
    '[data-media-is-video=desktop]:has(>video:not([data-video-failed]))>:not(video){visibility:hidden}}' +
  '@media (prefers-reduced-motion:reduce){[data-media-is-video]>:not(video){visibility:visible!important}}' +
  'video[data-video-framed]{object-fit:var(--vf,cover)!important;object-position:var(--vp,50% 50%)!important}' +
  '@media (max-width:600px){video[data-video-framed]{object-fit:var(--vf-m,var(--vf,cover))!important;' +
    'object-position:var(--vp-m,var(--vp,50% 50%))!important}}';

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
  const [palette, content, assetVersion, popupCfg, menusOff, media, sections, home, pricesOff] = await Promise.all([
    memoised(`palette:${site}`, () => readPalette(ctx.env, site)),
    memoised(`content:${site}`, () => readContent(ctx.env, site)),
    memoised(`version:${site}`, () => readAssetVersion(ctx.env, site)),
    standalone ? Promise.resolve(null) : memoised(`popup:${site}`, () => readPopupConfig(ctx.env, site)),
    standalone ? Promise.resolve([] as string[]) : memoised(`menus:${site}`, () => readMenusOff(ctx.env, site)),
    memoised(`media:${site}`, () => readMediaMap(ctx.env, site)),
    standalone ? Promise.resolve({} as SectionMap) : memoised(`sections:${site}`, () => readSections(ctx.env, site)),
    isHomePage(ctx.request)
      ? memoised(`home:${site}`, () => readHomeLayout(ctx.env, site))
      : Promise.resolve({ off: [], single: [] } as HomeLayout),
    isMenuPage(ctx.request)
      ? memoised(`prices:${site}`, () => readPricesOff(ctx.env, site))
      : Promise.resolve([] as string[]),
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
  if (css || hasContent || popupOn || menusOff.length || pricesOff.length || sectionsOn) {
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
    // those categories before first paint — and, on the menu page, the menus
    // it shows without prices, which the embed lays out without a price column.
    const menusTag = menusOff.length || pricesOff.length
      ? `<script id="zahara-menus" type="application/json">${
          JSON.stringify({ off: menusOff, noPrices: pricesOff }).replace(/</g, '\\u003c')
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

  // ── Home sections this venue has switched off ───────────────────────────
  // Removed from the markup rather than hidden, so nothing inside them — the
  // photos, a video, the gallery's script — is ever fetched or run. Runs before
  // the video swap below, which then never sees a slot that isn't there.
  //
  // The same pass turns a gallery into a single photo: everything a gallery
  // place marks as `data-gallery-extra="<place>"` (the frames after the first,
  // the arrows, the counter) goes, and the page's own scripts already do
  // nothing with fewer than two frames.
  if (home.off.length || home.single.length) {
    const off    = new Set(home.off);
    const single = new Set(home.single);
    res = new HTMLRewriter()
      .on('[data-gallery-extra]', {
        element(el) {
          const place = el.getAttribute('data-gallery-extra');
          if (place && single.has(place)) el.remove();
        },
      })
      .on('[data-gallery-place]', {
        element(el) {
          const place = el.getAttribute('data-gallery-place');
          if (!place || !single.has(place)) return;
          el.setAttribute('data-gallery-single', '');
          // One photo is not a carousel — don't announce it as one.
          el.removeAttribute('aria-roledescription');
        },
      })
      .on('[data-home-section]', {
        element(el) {
          const id = el.getAttribute('data-home-section');
          if (id && off.has(id)) el.remove();
        },
      })
      // A wrapper around several switchable parts: gone once all of them are,
      // otherwise it records which are off (for CSS) and takes the section
      // label of the first part still showing, so the page's section counter
      // never names a part that was removed.
      .on('[data-home-group]', {
        element(el) {
          let members: unknown;
          try { members = JSON.parse(attr(el, 'data-home-group')); } catch { return; }
          if (!Array.isArray(members) || !members.length) return;
          const parts   = members.filter((m): m is [string, string?] => Array.isArray(m) && typeof m[0] === 'string');
          const showing = parts.filter(([id]) => !off.has(id));
          if (!showing.length) { el.remove(); return; }
          const hidden = parts.filter(([id]) => off.has(id)).map(([id]) => id);
          if (hidden.length) el.setAttribute('data-home-off', hidden.join(' '));
          const label = showing[0][1];
          if (typeof label === 'string' && el.hasAttribute('data-section-name')) {
            el.setAttribute('data-section-name', label);
          }
        },
      })
      .transform(res);
  }

  // ── Stills → video, where the owner has uploaded one ────────────────────
  // The build shipped an <img> for every slot; the manifest says which of them
  // are showing a video today, on which frame. Doing the swap HERE, in the
  // response, is what makes it cheap: when both frames are video the browser
  // receives a <video> and never sees — let alone downloads — the photograph
  // it replaced. A client-side swap would fetch both, on the very elements
  // (hero, gallery) where that hurts most.
  //
  // When only ONE frame is a video the still has to stay, because it is what
  // the other frame shows. The video is added beside it and MEDIA_CSS decides
  // which one each screen sees.
  const anyVideo = Object.values(media).some((slot) => {
    const m = frameModes(slot);
    return m.desktop || m.mobile;
  });
  if (anyVideo) {
    res = new HTMLRewriter()
      .on('head', {
        element(el) { el.append(`<style id="zahara-media">${MEDIA_CSS}</style>`, { html: true }); },
      })
      // The hero's LCP preload describes the STILL. When the slot is a video
      // on both frames the still is never rendered, so the preload becomes a
      // full-size download of an image nobody sees — and a high-priority one,
      // on the exact request the page is racing. With a video on one frame
      // only, the still is still the other frame's picture (and this one's
      // poster), so the preload is still earning its keep.
      .on('link[data-hero-preload]', {
        element(el) {
          const key   = el.getAttribute('data-hero-preload');
          const modes = frameModes(key ? media[key] : undefined);
          if (modes.desktop && modes.mobile) el.remove();
        },
      })
      .on('[data-media-slot]', {
        element(el) {
          const key   = el.getAttribute('data-media-slot');
          const slot  = key ? media[key] : undefined;
          const modes = frameModes(slot);
          if (!slot || (!modes.desktop && !modes.mobile)) return;

          const desktopSrc = attr(el, 'data-media-video');
          if (!desktopSrc) return;
          // A phone with its OWN video plays the phone file (the /videos route
          // falls back to the desktop file if it's missing); a phone following
          // the desktop plays the desktop file.
          const mobileAttr = attr(el, 'data-media-video-mobile');
          const phoneSrc   = slot.m === 'video' && mobileAttr ? mobileAttr : desktopSrc;
          const cls        = attr(el, 'data-media-class');
          const both       = modes.desktop && modes.mobile;
          const only       = both ? '' : (modes.desktop ? 'desktop' : 'mobile');

          // Component styles are compiled against a `data-astro-cid-*`
          // attribute that only elements Astro rendered carry. Without it, a
          // <video> put in a gallery frame matched none of the gallery's rules
          // and sat at its natural size in the corner of the slide. The slot
          // belongs to the same component, so its scope is the right one.
          const scope = [...el.attributes]
            .filter(([name]) => name.startsWith('data-astro-cid-'))
            .map(([name]) => ` ${name}`)
            .join('');

          // How the owner framed it in /admin/images, per frame. Only written
          // when some frame on show is NOT the default, so an untouched slot
          // ships the same markup it always did and the class's own
          // object-fit still governs.
          const df = framingFor(slot, 'desktop');
          const mf = framingFor(slot, 'mobile');
          const custom = (f: { fit: string; pos: string }) => f.fit !== 'cover' || f.pos !== DEFAULT_POSITION;
          const framed = (modes.desktop && custom(df)) || (modes.mobile && custom(mf));
          const style  = framed
            ? `--vf:${df.fit};--vp:${df.pos};--vf-m:${mf.fit};--vp-m:${mf.pos}` : '';

          // Speed, per frame. The phone attribute is only needed where it
          // differs, and then it is written even when it is 1, or a phone
          // would inherit the desktop's slowed-down loop.
          const rate  = (modes.desktop || !modes.mobile) ? df.rate : mf.rate;
          const mrate = both && mf.rate !== df.rate ? mf.rate : null;

          // ── No poster. Ever. ──────────────────────────────────────────
          // A poster is the photograph this video replaced, and the browser
          // paints it the moment it arrives — so a slot the owner turned into
          // a video opened on the photo and then cut to the clip, and if the
          // video never loaded it stayed on the photo indefinitely. Both read
          // as the site being broken.
          //
          // So the photograph is not shipped at all. It stays on the wrapper
          // as data-media-poster and MediaVideo.astro puts it back in exactly
          // two cases: the visitor asked for reduced motion, or the video
          // failed to play. A photograph as a fallback, never as a pre-roll.
          //
          // ── …and a real `src` where one file serves both screens ──────────
          // The src was left off so the browser could not fetch a cut meant
          // for the other screen. That reasoning only applies when the two
          // frames play DIFFERENT files; when they play the same one there is
          // nothing to choose, and withholding the src only meant the video
          // could not start until JavaScript had run — the "photo, and then
          // maybe a video" everyone was seeing. With the src in the markup the
          // browser starts it during parse, and a visitor with no JavaScript
          // at all gets the video rather than a still.
          const oneFile = both && phoneSrc === desktopSrc;
          const eager   = el.hasAttribute('data-media-eager');

          el.setAttribute('data-media-is-video', both ? '1' : only);
          const video =
            `<video class="${escAttr(cls)}"${scope} playsinline muted loop autoplay` +
            // preload=auto on an above-the-fold frame; elsewhere the browser's
            // own autoplay heuristics hold the bytes until it is near.
            ` preload="${oneFile && eager ? 'auto' : 'none'}"` +
            (oneFile ? ` src="${escAttr(desktopSrc)}"` : '') +
            ` aria-hidden="true" tabindex="-1"` +
            (framed ? ` data-video-framed style="${escAttr(style)}"` : '') +
            (rate !== 1 ? ` data-video-rate="${escAttr(String(rate))}"` : '') +
            (mrate !== null ? ` data-video-rate-mobile="${escAttr(String(mrate))}"` : '') +
            (only ? ` data-video-only="${only}"` : '') +
            ` data-video-src="${escAttr(only === 'mobile' ? phoneSrc : desktopSrc)}"` +
            (both && phoneSrc !== desktopSrc ? ` data-video-src-mobile="${escAttr(phoneSrc)}"` : '') +
            `></video>`;
          if (both) el.setInnerContent(video, { html: true });
          else      el.append(video, { html: true });
        },
      })
      .transform(res);
  }

  // ── Colour-editor preview ────────────────────────────────────────────────
  // /admin/colors shows the REAL pages in a frame, loaded with ?zp=1. Those
  // loads are the owner looking at a palette, not visitors: drop every script
  // marked data-analytics (Tag Manager, gtag, the reserve-portal beacon) so
  // they are never counted as traffic.
  if (new URL(ctx.request.url).searchParams.get('zp') === '1') {
    res = new HTMLRewriter()
      .on('[data-analytics]', { element(el) { el.remove(); } })
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
