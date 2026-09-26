// Minify the INLINE <script> blocks in the built HTML.
//
// ── Why this exists ────────────────────────────────────────────────────────
// Astro bundles and minifies module scripts, but `is:inline` scripts are
// passed through to the HTML verbatim — comments, indentation and all. This
// site leans on them heavily and deliberately: the theme/palette boot script
// must run before first paint, the media, motion, content-overlay and form
// scripts must not wait on a module graph, and every one of them is written to
// explain itself to the next person reading it.
//
// Measured on /menu/: 148 KB of inline script per page, 55% of it comments.
// Gzip hides most of that on the wire, but the browser still has to lex every
// byte — and it was showing up as "Minify JavaScript" and as parse/compile time
// on the mobile trace, on the main thread, during the LCP window.
//
// So the comments stay in the source, where they are worth their weight, and
// come out of the build. esbuild (already present, as Astro's own bundler)
// does the transform, so string and regex literals containing `//` are handled
// by a real JS parser rather than a regex that would corrupt them.
//
// ── What it deliberately does NOT touch ────────────────────────────────────
//   • <script src=…>       — nothing inline to minify.
//   • type="application/…" — ld+json and the middleware's JSON payload blocks
//                            are data, not scripts.
//   • Anything it cannot parse — kept exactly as-is, and reported. A page that
//     ships slightly larger is a nuisance; a page that ships broken JS is not.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { transform } from 'esbuild';

const ROOTS = ['dist', 'dist/rooftop'];

/** Every .html file under a directory, recursively. */
async function htmlFiles(dir) {
  const out = [];
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    // dist/rooftop is walked as its own root, so don't descend into it twice.
    if (e.isDirectory()) { if (p !== 'dist/rooftop') out.push(...await htmlFiles(p)); }
    else if (extname(e.name) === '.html') out.push(p);
  }
  return out;
}

// Opening tag, body, closing tag. `[^]` rather than `.` with /s so the body
// may span lines.
const SCRIPT = /<script([^>]*)>([^]*?)<\/script>/g;

/** Is this a real script we should minify? */
function isJs(attrs) {
  if (/\ssrc\s*=/i.test(attrs)) return false;
  const type = attrs.match(/\stype\s*=\s*["']([^"']+)["']/i);
  if (!type) return true;                       // no type = classic JS
  const t = type[1].toLowerCase();
  return t === 'text/javascript' || t === 'module' || t === 'application/javascript';
}

let files = 0, blocks = 0, before = 0, after = 0;
const failures = [];

for (const root of ROOTS) {
  for (const file of await htmlFiles(root)) {
    const html = await readFile(file, 'utf8');
    const pieces = [];
    let last = 0, changed = false;

    for (const m of html.matchAll(SCRIPT)) {
      const [whole, attrs, body] = m;
      if (!isJs(attrs) || !body.trim()) continue;
      let min;
      try {
        // `format` is left alone: a module stays a module. Minifying
        // identifiers is safe here because each block is its own scope (they
        // are IIFEs) — but esbuild will not rename anything reachable from
        // outside, so the few globals these scripts publish survive.
        ({ code: min } = await transform(body, {
          loader: 'js',
          minify: true,
          format: attrs.includes('module') ? 'esm' : undefined,
          target: 'es2019',
        }));
      } catch (err) {
        failures.push(`${file}: ${String(err).split('\n')[0]}`);
        continue;
      }
      pieces.push(html.slice(last, m.index), `<script${attrs}>`, min, '</script>');
      last = m.index + whole.length;
      before += body.length; after += min.length; blocks++; changed = true;
    }

    if (!changed) continue;
    pieces.push(html.slice(last));
    await writeFile(file, pieces.join(''));
    files++;
  }
}

const saved = before - after;
console.log(
  `[minify-inline] ${blocks} inline scripts in ${files} pages: ` +
  `${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB ` +
  `(${saved > 0 ? Math.round((saved / before) * 100) : 0}% smaller)`);
if (failures.length) {
  console.warn(`[minify-inline] left ${failures.length} block(s) unminified:`);
  for (const f of failures.slice(0, 5)) console.warn('  ' + f);
}
