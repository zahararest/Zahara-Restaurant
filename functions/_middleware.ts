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
import { readContent, contentToJson, readAssetVersion, type ContentEnv } from './data/content';

const ASSET_VERSION_TOKEN = '__ZASSETV__';

type Env = PaletteEnv & ContentEnv;

export const onRequest: PagesFunction<Env> = async (ctx) => {
  // Let the request resolve normally first — we only rewrite the
  // response, never block the resolution.
  const response = await ctx.next();

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  // Palette, editable copy, and the asset version — three tiny KV reads run
  // together so the added latency stays a single round trip.
  const [palette, content, assetVersion] = await Promise.all([
    readPalette(ctx.env),
    readContent(ctx.env),
    readAssetVersion(ctx.env),
  ]);

  const css        = paletteToCss(palette);
  const hasContent = Object.keys(content).length > 0;

  // Inject the palette + content tags into <head> (when present).
  let res = response;
  if (css || hasContent) {
    const styleTag = css
      ? `<style id="zahara-palette-server" data-zahara-palette>${css}</style>`
      : '';
    const contentTag = hasContent
      ? `<script id="zahara-content" type="application/json">${contentToJson(content)}</script>`
      : '';
    res = new HTMLRewriter()
      .on('head', {
        element(el) {
          if (styleTag)   el.append(styleTag,   { html: true });
          if (contentTag) el.append(contentTag, { html: true });
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
  return new Response(html, { status: res.status, statusText: res.statusText, headers });
};
