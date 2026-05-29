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

export const onRequest: PagesFunction<PaletteEnv> = async (ctx) => {
  // Let the request resolve normally first — we only rewrite the
  // response, never block the resolution.
  const response = await ctx.next();

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  const palette = await readPalette(ctx.env);
  const css     = paletteToCss(palette);
  if (!css) return response;

  // Stable id so client code can find this block later (e.g. to read
  // the current server-side values without a second fetch).
  const styleTag =
    `<style id="zahara-palette-server" data-zahara-palette>${css}</style>`;

  return new HTMLRewriter()
    .on('head', {
      element(el) { el.append(styleTag, { html: true }); },
    })
    .transform(response);
};
