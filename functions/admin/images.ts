// GET /admin/images — Basic-auth gated. Returns a self-contained HTML
// page listing every named photo. For each photo: a thumbnail (showing
// the override if R2 has one, else the default in /public/photos/), an
// upload form to replace it, a "Remove override" button, and a state
// badge ("override" vs "default").
//
// The page POSTs to /admin/images/upload and /admin/images/delete; on
// success it reloads itself. Cache-busting via ?t= timestamp on the
// thumbnail URLs so the new image shows up immediately after upload.

import type { PagesFunction, R2Bucket } from '@cloudflare/workers-types';
import { checkAuth, unauthorized, type AuthEnv } from './auth';
import { PHOTO_CATALOGUE, PHOTO_GROUPS, type PhotoMeta } from '../data/photos-map';

interface Env extends AuthEnv { IMAGES?: R2Bucket; }

const STYLE = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    background: #faf7ee;
    color: #1a1410;
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.55;
  }
  header.top {
    position: sticky;
    top: 0;
    z-index: 10;
    background: rgba(250, 247, 238, 0.95);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid #d8ccae;
    padding: 0.7rem 1.5rem;
    display: grid;
    gap: 0.55rem;
  }
  .top__nav {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .top__brand {
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: #1a1410;
    text-decoration: none;
    padding-inline-end: 0.4rem;
    border-inline-end: 1px solid #d8ccae;
    margin-inline-end: 0.4rem;
  }
  .top__navlink {
    font-size: 0.78rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 600;
    color: #6f6457;
    text-decoration: none;
    padding: 0.35rem 0.65rem;
    border: 1px solid transparent;
    transition: color 0.2s, border-color 0.2s, background 0.2s;
  }
  .top__navlink:hover { color: #1a1410; border-color: #d8ccae; }
  .top__navlink.is-active {
    color: #1a1410;
    background: #ece3d0;
    border-color: #d8ccae;
    pointer-events: none;
  }
  .top__spacer { flex: 1; }
  .top__site {
    font-size: 0.78rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #a88947;
    font-weight: 600;
    text-decoration: none;
    padding: 0.4rem 0.6rem;
  }
  .top__site:hover { text-decoration: underline; }
  .top__title {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #6f6457;
  }

  main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 2rem 1.5rem 5rem;
  }
  .lead {
    color: #6f6457;
    max-width: 52ch;
    margin: 0 0 2rem;
  }
  .lead code {
    background: #ece3d0;
    padding: 0 0.35rem;
    font-family: 'Inter', monospace;
    font-size: 0.85em;
  }

  .group { margin-block-end: 3rem; }
  .group__head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding-block-end: 0.6rem;
    margin-block-end: 1.25rem;
    border-bottom: 1px solid #d8ccae;
  }
  .group__head h2 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .group__head small { color: #6f6457; }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 1.25rem;
  }
  .card {
    background: #fff;
    border: 1px solid #d8ccae;
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    gap: 0;
  }
  .card__thumb {
    width: 100%;
    aspect-ratio: 4 / 3;
    background: #ece3d0 center / cover no-repeat;
    position: relative;
  }
  .card__thumb img {
    width: 100%; height: 100%; object-fit: cover;
    display: block;
  }
  .card__badge {
    position: absolute;
    inset-block-start: 0.5rem;
    inset-inline-start: 0.5rem;
    font-size: 0.65rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 600;
    padding: 0.25rem 0.55rem;
    background: rgba(26, 20, 16, 0.78);
    color: #faf7ee;
  }
  .card__badge--override { background: #a88947; color: #fff; }
  .card__head {
    padding: 0.85rem 0.9rem 0.4rem;
  }
  .card__label {
    margin: 0;
    font-weight: 600;
    font-size: 0.92rem;
  }
  .card__token {
    margin: 0.15rem 0 0;
    font-family: 'Inter', monospace;
    font-size: 0.72rem;
    color: #6f6457;
  }
  .card__file {
    padding: 0.1rem 0.9rem 0.6rem;
    font-size: 0.72rem;
    color: #6f6457;
    font-family: 'Inter', monospace;
  }
  .card__actions {
    padding: 0.6rem 0.9rem 0.9rem;
    border-top: 1px solid #ece3d0;
    display: grid;
    gap: 0.45rem;
  }
  .card__file-input {
    font-size: 0.78rem;
    width: 100%;
  }
  .card__row {
    display: flex;
    gap: 0.45rem;
  }
  .btn {
    font: inherit;
    font-size: 0.74rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    font-weight: 600;
    padding: 0.55rem 0.85rem;
    background: #1a1410;
    color: #faf7ee;
    border: 1px solid #1a1410;
    cursor: pointer;
    flex: 1;
    transition: background 0.2s, border-color 0.2s;
  }
  .btn:hover { background: #a88947; border-color: #a88947; }
  .btn:disabled { opacity: 0.55; cursor: not-allowed; }
  .btn--ghost {
    background: transparent;
    color: #1a1410;
    flex: 0 0 auto;
  }
  .btn--ghost:hover { color: #a88947; background: transparent; border-color: #a88947; }
  .card__status {
    margin: 0;
    min-height: 1.3em;
    font-size: 0.74rem;
    color: #4f6b47;
  }
  .card__status--err { color: #a53623; }
`;

const SCRIPT = `
  (function () {
    'use strict';
    const cards = document.querySelectorAll('[data-photo-card]');
    cards.forEach((card) => {
      const key   = card.dataset.photoCard;
      const form  = card.querySelector('[data-form-upload]');
      const file  = card.querySelector('[data-input-file]');
      const submit= card.querySelector('[data-btn-upload]');
      const del   = card.querySelector('[data-btn-delete]');
      const status= card.querySelector('[data-status]');
      const badge = card.querySelector('[data-badge]');
      const thumb = card.querySelector('[data-thumb]');

      function setStatus(msg, err) {
        status.textContent = msg || '';
        status.classList.toggle('card__status--err', !!err);
      }

      file.addEventListener('change', () => {
        submit.disabled = !file.files || file.files.length === 0;
      });
      submit.disabled = true;

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!file.files || !file.files.length) return;
        const fd = new FormData();
        fd.append('key', key);
        fd.append('file', file.files[0]);
        submit.disabled = true; del.disabled = true;
        setStatus('Uploading…', false);
        try {
          const res = await fetch('/admin/images/upload', { method: 'POST', body: fd });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || 'Upload failed');
          setStatus('Saved · ' + Math.round(data.size/1024) + ' KB', false);
          // Cache-bust the thumb and flip the badge.
          const newSrc = thumb.dataset.src + '?t=' + Date.now();
          thumb.src = newSrc;
          badge.textContent = 'Override';
          badge.classList.add('card__badge--override');
          file.value = '';
          submit.disabled = true;
          del.disabled = false;
          // Notify the site so an open tab refreshes thumbnails.
          try { new BroadcastChannel('zahara-images').postMessage({ key, action: 'set' }); } catch (_) {}
        } catch (err) {
          setStatus(String(err.message || err), true);
        } finally {
          del.disabled = false;
        }
      });

      del.addEventListener('click', async () => {
        if (!confirm('Remove override and revert to the default photo?')) return;
        const fd = new FormData();
        fd.append('key', key);
        submit.disabled = true; del.disabled = true;
        setStatus('Removing…', false);
        try {
          const res = await fetch('/admin/images/delete', { method: 'POST', body: fd });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || 'Delete failed');
          setStatus('Reverted to default', false);
          const newSrc = thumb.dataset.fallback + '?t=' + Date.now();
          thumb.src = newSrc;
          badge.textContent = 'Default';
          badge.classList.remove('card__badge--override');
          try { new BroadcastChannel('zahara-images').postMessage({ key, action: 'delete' }); } catch (_) {}
        } catch (err) {
          setStatus(String(err.message || err), true);
        } finally {
          submit.disabled = false;
        }
      });
    });
  })();
`;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

function renderCard(p: PhotoMeta, hasOverride: boolean, version: number): string {
  // Two URLs:
  //   src      — the URL currently shown (override-aware via middleware)
  //   fallback — the static asset (used after a delete to revert)
  const src      = `/photos/${p.filename}?t=${version}`;
  const fallback = `/photos/${p.filename}`;
  return `
    <article class="card" data-photo-card="${esc(p.key)}">
      <div class="card__thumb">
        <img data-thumb data-src="/photos/${esc(p.filename)}" data-fallback="${esc(fallback)}"
             src="${esc(src)}" alt="${esc(p.label)}" loading="lazy" decoding="async" />
        <span class="card__badge ${hasOverride ? 'card__badge--override' : ''}" data-badge>
          ${hasOverride ? 'Override' : 'Default'}
        </span>
      </div>
      <header class="card__head">
        <p class="card__label">${esc(p.label)}</p>
        <p class="card__token"><code>${esc(p.key)}</code></p>
      </header>
      <p class="card__file">${esc(p.filename)}</p>
      <div class="card__actions">
        <form data-form-upload>
          <input class="card__file-input" type="file" data-input-file
                 accept="image/jpeg,image/png,image/webp" />
          <div class="card__row" style="margin-top:0.55rem">
            <button class="btn" type="submit" data-btn-upload>Upload</button>
            <button class="btn btn--ghost" type="button" data-btn-delete>Remove</button>
          </div>
        </form>
        <p class="card__status" data-status></p>
      </div>
    </article>
  `;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!checkAuth(request, env)) return unauthorized();

  // Look up which keys have an override in R2 right now.
  const overrideSet = new Set<string>();
  if (env.IMAGES) {
    try {
      // R2 list returns up to 1000 keys; we won't exceed that.
      const listing = await env.IMAGES.list({ prefix: 'images/' });
      for (const o of listing.objects) {
        // Strip the `images/` prefix to recover the key.
        overrideSet.add(o.key.replace(/^images\//, ''));
      }
    } catch (err) {
      console.warn('[admin/images] R2 list failed', err);
    }
  }

  // Single version stamp so all thumbs cache-bust together on reload.
  const v = Date.now();

  const groupHtml = (Object.keys(PHOTO_GROUPS) as Array<keyof typeof PHOTO_GROUPS>)
    .map((g) => {
      const photos = PHOTO_CATALOGUE.filter((p) => p.group === g);
      if (!photos.length) return '';
      return `
        <section class="group">
          <header class="group__head">
            <h2>${esc(PHOTO_GROUPS[g])}</h2>
            <small>${photos.length} photo${photos.length === 1 ? '' : 's'}</small>
          </header>
          <div class="grid">
            ${photos.map((p) => renderCard(p, overrideSet.has(p.key), v)).join('')}
          </div>
        </section>
      `;
    }).join('');

  const html = `<!doctype html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Image manager · Zahara admin</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" />
  <style>${STYLE}</style>
</head>
<body>
  <header class="top">
    <nav class="top__nav" aria-label="Admin sections">
      <a class="top__brand" href="/admin/">Zahara · Admin</a>
      <a class="top__navlink"            href="/admin/">Menu editor</a>
      <a class="top__navlink is-active"  href="/admin/images/" aria-current="page">Images</a>
      <a class="top__navlink"            href="/admin/colors/">Colors</a>
      <span class="top__spacer"></span>
      <a class="top__site" href="/" target="_blank">View site ↗</a>
    </nav>
    <h1 class="top__title">Image manager</h1>
  </header>
  <main>
    <p class="lead">
      Replace any photo on the site. Uploads go to R2 under
      <code>images/{key}</code>; the <code>/photos/[file]</code>
      middleware serves your override in place of the default file.
      Press <strong>Remove</strong> to revert to the original.
      Accepts JPG / PNG / WebP up to 5 MB.
    </p>
    ${groupHtml}
  </main>
  <script>${SCRIPT}</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type':  'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag':  'noindex, nofollow',
    },
  });
};
