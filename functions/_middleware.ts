// Root middleware — runs on every request that hits Cloudflare Pages
// Functions. Its single job is to read the saved colour palette from KV
// and inject it as a `<style>` block into the `<head>` of every HTML
// response, so the site-wide custom-property overrides apply for every
// visitor on first paint (no FOUC, no localStorage required).
//
// We deliberately only touch HTML — static assets (JS, CSS, images,
// fonts, the API endpoints) are returned untouched, so the middleware
// adds no latency to the hot path.

import type { PagesFunction } from '@cloudflare/workers-types';
import { readPalette, paletteToCss, type PaletteEnv } from './data/palette';
import { readContent, contentToJson, type ContentEnv } from './data/content';

type Env = PaletteEnv & ContentEnv;

export const onRequest: PagesFunction<Env> = async (ctx) => {
  // Let the request resolve normally first — we only rewrite the
  // response, never block the resolution.
  const response = await ctx.next();

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  // Read the saved palette + editable copy together — both are tiny KV
  // reads, so running them in parallel keeps the added latency to a single
  // round trip. Both get injected into <head>, so the page applies the
  // owner's colours AND text on first paint with NO extra browser fetches.
  const [palette, content] = await Promise.all([
    readPalette(ctx.env),
    readContent(ctx.env),
  ]);

  const css        = paletteToCss(palette);
  const hasContent = Object.keys(content).length > 0;
  if (!css && !hasContent) return response;

  // Stable ids so client code can find these blocks (and read the
  // server-side values without a second fetch).
  const styleTag = css
    ? `<style id="zahara-palette-server" data-zahara-palette>${css}</style>`
    : '';
  const contentTag = hasContent
    ? `<script id="zahara-content" type="application/json">${contentToJson(content)}</script>`
    : '';

  return new HTMLRewriter()
    .on('head', {
      element(el) {
        if (styleTag)   el.append(styleTag,   { html: true });
        if (contentTag) el.append(contentTag, { html: true });
      },
    })
    .transform(response);
};
