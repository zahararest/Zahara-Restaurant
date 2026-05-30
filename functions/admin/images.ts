// GET /admin/images — Basic-auth gated. Returns a self-contained HTML
// page listing every photo on the site, grouped by page and ordered the
// way the photos actually appear as you scroll each page.
//
// For each photo: a thumbnail (the R2 override if one exists, else the
// default), a "where it appears" note, an Upload form, an "Edit & adjust"
// button that opens a client-side editor (black & white, brightness,
// contrast, saturation, zoom/crop, and resize — all baked into the file
// that gets uploaded), and a "Remove" button that reverts to the default.
//
// The page POSTs to /admin/images/upload and /admin/images/delete; on
// success it cache-busts the thumbnail (?t=) so the new image shows up
// immediately, and broadcasts on the 'zahara-images' channel so an open
// site tab can refresh.

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
    max-width: 60ch;
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
  .card__tags {
    position: absolute;
    inset-block-start: 0.5rem;
    inset-inline-end: 0.5rem;
    display: flex;
    gap: 0.3rem;
  }
  .card__tag {
    font-size: 0.6rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-weight: 600;
    padding: 0.2rem 0.45rem;
    background: rgba(26, 20, 16, 0.6);
    color: #faf7ee;
  }
  .card__head {
    padding: 0.85rem 0.9rem 0.4rem;
  }
  .card__label {
    margin: 0;
    font-weight: 600;
    font-size: 0.92rem;
  }
  .card__where {
    margin: 0.25rem 0 0;
    font-size: 0.78rem;
    color: #6f6457;
    line-height: 1.45;
  }
  .card__token {
    margin: 0.35rem 0 0;
    font-family: 'Inter', monospace;
    font-size: 0.7rem;
    color: #9a8d77;
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
    font-size: 0.72rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    font-weight: 600;
    padding: 0.55rem 0.7rem;
    background: #1a1410;
    color: #faf7ee;
    border: 1px solid #1a1410;
    cursor: pointer;
    flex: 1;
    transition: background 0.2s, border-color 0.2s, color 0.2s;
  }
  .btn:hover { background: #a88947; border-color: #a88947; }
  .btn:disabled { opacity: 0.55; cursor: not-allowed; }
  .btn--ghost {
    background: transparent;
    color: #1a1410;
  }
  .btn--ghost:hover { color: #a88947; background: transparent; border-color: #a88947; }
  .btn--sm { flex: 0 0 auto; }
  .card__status {
    margin: 0;
    min-height: 1.3em;
    font-size: 0.74rem;
    color: #4f6b47;
  }
  .card__status--err { color: #a53623; }

  /* ── Editor modal ────────────────────────────────────────────── */
  .editor {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: none;
    align-items: stretch;
    justify-content: center;
    background: rgba(20, 16, 12, 0.55);
    backdrop-filter: blur(3px);
    padding: 2vh 1rem;
    overflow: auto;
  }
  .editor.is-open { display: flex; }
  .editor__panel {
    background: #faf7ee;
    border: 1px solid #d8ccae;
    width: min(960px, 100%);
    margin: auto;
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(260px, 1fr);
    max-height: 96vh;
  }
  @media (max-width: 760px) {
    .editor__panel { grid-template-columns: 1fr; }
  }
  .editor__stage {
    background:
      repeating-conic-gradient(#ece3d0 0% 25%, #f6efdf 0% 50%) 50% / 22px 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    overflow: hidden;
    min-height: 280px;
  }
  .editor__canvas {
    max-width: 100%;
    max-height: 80vh;
    cursor: grab;
    box-shadow: 0 6px 30px rgba(0,0,0,0.25);
    touch-action: none;
  }
  .editor__canvas:active { cursor: grabbing; }
  .editor__side {
    border-inline-start: 1px solid #d8ccae;
    padding: 1.1rem 1.2rem 1.4rem;
    display: grid;
    gap: 0.9rem;
    align-content: start;
    overflow-y: auto;
  }
  @media (max-width: 760px) {
    .editor__side { border-inline-start: none; border-top: 1px solid #d8ccae; }
  }
  .editor__title {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .editor__sub {
    margin: -0.4rem 0 0;
    font-size: 0.76rem;
    color: #6f6457;
  }
  .ctl { display: grid; gap: 0.3rem; }
  .ctl__row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
  }
  .ctl label {
    font-size: 0.74rem;
    font-weight: 600;
    letter-spacing: 0.06em;
  }
  .ctl__val {
    font-family: 'Inter', monospace;
    font-size: 0.72rem;
    color: #6f6457;
  }
  .ctl input[type="range"] { width: 100%; accent-color: #a88947; }
  .ctl select {
    font: inherit;
    font-size: 0.8rem;
    padding: 0.35rem 0.4rem;
    border: 1px solid #d8ccae;
    background: #fff;
    width: 100%;
  }
  .editor__toggles { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .chip {
    font: inherit;
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-weight: 600;
    padding: 0.4rem 0.7rem;
    border: 1px solid #d8ccae;
    background: #fff;
    color: #6f6457;
    cursor: pointer;
  }
  .chip.is-on { background: #1a1410; color: #faf7ee; border-color: #1a1410; }
  .editor__meta {
    font-size: 0.72rem;
    color: #6f6457;
    font-family: 'Inter', monospace;
  }
  .editor__foot {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.3rem;
  }
  .editor__status {
    margin: 0;
    min-height: 1.2em;
    font-size: 0.74rem;
    color: #4f6b47;
  }
  .editor__status--err { color: #a53623; }
  .ctl__hint { font-size: 0.68rem; color: #9a8d77; margin: 0; }
`;

const SCRIPT = `
  (function () {
    'use strict';

    // ── Per-card upload / remove wiring ───────────────────────────────
    const cards = document.querySelectorAll('[data-photo-card]');
    cards.forEach((card) => {
      const key   = card.dataset.photoCard;
      const form  = card.querySelector('[data-form-upload]');
      const file  = card.querySelector('[data-input-file]');
      const submit= card.querySelector('[data-btn-upload]');
      const editB = card.querySelector('[data-btn-edit]');
      const del   = card.querySelector('[data-btn-delete]');
      const status= card.querySelector('[data-status]');
      const badge = card.querySelector('[data-badge]');
      const thumb = card.querySelector('[data-thumb]');

      function setStatus(msg, err) {
        status.textContent = msg || '';
        status.classList.toggle('card__status--err', !!err);
      }

      // After any successful save, refresh this card's thumb + badge.
      function markSaved(sizeBytes) {
        setStatus('Saved · ' + Math.round(sizeBytes / 1024) + ' KB', false);
        thumb.src = thumb.dataset.src + '?t=' + Date.now();
        badge.textContent = 'Override';
        badge.classList.add('card__badge--override');
        try { new BroadcastChannel('zahara-images').postMessage({ key, action: 'set' }); } catch (_) {}
      }

      file.addEventListener('change', () => {
        submit.disabled = !file.files || file.files.length === 0;
      });
      submit.disabled = true;

      // Plain upload — send the selected file as-is, no editing.
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!file.files || !file.files.length) return;
        submit.disabled = true; del.disabled = true; editB.disabled = true;
        setStatus('Uploading…', false);
        try {
          const data = await window.ZAHARA_UPLOAD(key, file.files[0]);
          markSaved(data.size);
          file.value = '';
        } catch (err) {
          setStatus(String(err.message || err), true);
        } finally {
          submit.disabled = true; del.disabled = false; editB.disabled = false;
        }
      });

      // Edit & adjust — open the editor on the selected file, or on the
      // photo currently shown if no new file is picked.
      editB.addEventListener('click', () => {
        const src = (file.files && file.files[0])
          ? file.files[0]
          : (thumb.dataset.src + '?t=' + Date.now());  // same-origin → canvas-safe
        window.ZAHARA_EDITOR.open({
          key,
          label: card.dataset.label || key,
          source: src,
          onSaved: (size) => { markSaved(size); file.value = ''; },
        });
      });

      del.addEventListener('click', async () => {
        if (!confirm('Remove override and revert to the default photo?')) return;
        const fd = new FormData();
        fd.append('key', key);
        submit.disabled = true; del.disabled = true; editB.disabled = true;
        setStatus('Removing…', false);
        try {
          const res = await fetch('/admin/images/delete', { method: 'POST', body: fd });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || 'Delete failed');
          setStatus('Reverted to default', false);
          thumb.src = thumb.dataset.fallback + '?t=' + Date.now();
          badge.textContent = 'Default';
          badge.classList.remove('card__badge--override');
          try { new BroadcastChannel('zahara-images').postMessage({ key, action: 'delete' }); } catch (_) {}
        } catch (err) {
          setStatus(String(err.message || err), true);
        } finally {
          submit.disabled = false; del.disabled = false; editB.disabled = false;
        }
      });
    });

    // ── Shared upload helper (canvas blob OR File) ────────────────────
    window.ZAHARA_UPLOAD = async function (key, fileOrBlob, filename) {
      const fd = new FormData();
      fd.append('key', key);
      fd.append('file', fileOrBlob, filename || (fileOrBlob.name || (key + '.jpg')));
      const res  = await fetch('/admin/images/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Upload failed');
      return data;
    };

    // ── Image editor ──────────────────────────────────────────────────
    window.ZAHARA_EDITOR = (function () {
      const root   = document.getElementById('editor');
      const canvas = document.getElementById('ed-canvas');
      const ctx    = canvas.getContext('2d');
      const titleEl= document.getElementById('ed-title');
      const statusEl=document.getElementById('ed-status');
      const metaEl = document.getElementById('ed-meta');

      const inputs = {
        grayscale:  document.getElementById('ed-grayscale'),
        brightness: document.getElementById('ed-brightness'),
        contrast:   document.getElementById('ed-contrast'),
        saturate:   document.getElementById('ed-saturate'),
        zoom:       document.getElementById('ed-zoom'),
        width:      document.getElementById('ed-width'),
        quality:    document.getElementById('ed-quality'),
      };
      const vals = {
        grayscale:  document.getElementById('ed-grayscale-v'),
        brightness: document.getElementById('ed-brightness-v'),
        contrast:   document.getElementById('ed-contrast-v'),
        saturate:   document.getElementById('ed-saturate-v'),
        zoom:       document.getElementById('ed-zoom-v'),
      };
      const bwChip = document.getElementById('ed-bw');
      const resetB = document.getElementById('ed-reset');
      const applyB = document.getElementById('ed-apply');
      const cancelB= document.getElementById('ed-cancel');

      let img = null;             // the loaded HTMLImageElement
      let ctxState = null;        // { key, onSaved }
      let panX = 0, panY = 0;     // -0.5 … 0.5 crop offset
      const PREVIEW_MAX = 520;    // px — preview canvas longest edge

      // Current adjustment values, read straight off the sliders.
      function currentOpts() {
        return {
          grayscale:  +inputs.grayscale.value,
          brightness: +inputs.brightness.value,
          contrast:   +inputs.contrast.value,
          saturate:   +inputs.saturate.value,
        };
      }
      function needsAdjust(o) {
        return o.grayscale !== 0 || o.brightness !== 100 ||
               o.contrast !== 100 || o.saturate !== 100;
      }

      // Per-pixel adjustment. Done in plain JS (not ctx.filter, which
      // older Safari ignores) so it works in every browser and is baked
      // into the uploaded file. Mutates the RGBA array in place.
      function adjustPixels(data, o) {
        const br = o.brightness / 100;
        const ct = o.contrast   / 100;
        const sat = o.saturate  / 100;
        const gr = o.grayscale  / 100;
        for (let i = 0; i < data.length; i += 4) {
          let r = data[i], g = data[i + 1], b = data[i + 2];
          // brightness
          r *= br; g *= br; b *= br;
          // contrast around mid-grey
          r = ((r / 255 - 0.5) * ct + 0.5) * 255;
          g = ((g / 255 - 0.5) * ct + 0.5) * 255;
          b = ((b / 255 - 0.5) * ct + 0.5) * 255;
          // saturation: pull toward / push from luma
          let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          r = lum + (r - lum) * sat;
          g = lum + (g - lum) * sat;
          b = lum + (b - lum) * sat;
          // black & white: mix toward luma
          if (gr > 0) {
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            r += (lum - r) * gr;
            g += (lum - g) * gr;
            b += (lum - b) * gr;
          }
          data[i]     = r < 0 ? 0 : r > 255 ? 255 : r;
          data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
          data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
        }
      }

      // Compute the source-crop rect for the current zoom + pan.
      function cropRect() {
        const z = parseFloat(inputs.zoom.value);
        const sw = img.naturalWidth  / z;
        const sh = img.naturalHeight / z;
        let sx = (img.naturalWidth  - sw) * (0.5 + panX);
        let sy = (img.naturalHeight - sh) * (0.5 + panY);
        sx = Math.max(0, Math.min(img.naturalWidth  - sw, sx));
        sy = Math.max(0, Math.min(img.naturalHeight - sh, sy));
        return { sx, sy, sw, sh };
      }

      function syncLabels() {
        vals.grayscale.textContent  = inputs.grayscale.value + '%';
        vals.brightness.textContent = inputs.brightness.value + '%';
        vals.contrast.textContent   = inputs.contrast.value + '%';
        vals.saturate.textContent   = inputs.saturate.value + '%';
        vals.zoom.textContent       = parseFloat(inputs.zoom.value).toFixed(2) + '×';
        bwChip.classList.toggle('is-on', inputs.grayscale.value === '100');
      }

      function drawPreview() {
        if (!img) return;
        const ar = img.naturalWidth / img.naturalHeight;
        let pw = PREVIEW_MAX, ph = Math.round(PREVIEW_MAX / ar);
        if (ph > PREVIEW_MAX) { ph = PREVIEW_MAX; pw = Math.round(PREVIEW_MAX * ar); }
        canvas.width = pw; canvas.height = ph;
        const { sx, sy, sw, sh } = cropRect();
        ctx.clearRect(0, 0, pw, ph);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, pw, ph);
        const o = currentOpts();
        if (needsAdjust(o)) {
          try {
            const id = ctx.getImageData(0, 0, pw, ph);
            adjustPixels(id.data, o);
            ctx.putImageData(id, 0, 0);
          } catch (err) {
            setStatus('Cannot adjust this image (security restriction): ' + err.message, true);
          }
        }
        syncLabels();
      }

      // Build the full-resolution output and hand back a Blob.
      function exportBlob() {
        const { sx, sy, sw, sh } = cropRect();
        const targetW = inputs.width.value === 'orig'
          ? Math.round(sw)
          : Math.min(parseInt(inputs.width.value, 10), Math.round(sw));
        const outW = Math.max(1, Math.round(targetW));
        const outH = Math.max(1, Math.round(outW * sh / sw));
        const off = document.createElement('canvas');
        off.width = outW; off.height = outH;
        const octx = off.getContext('2d');
        octx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
        const o = currentOpts();
        if (needsAdjust(o)) {
          const id = octx.getImageData(0, 0, outW, outH);
          adjustPixels(id.data, o);
          octx.putImageData(id, 0, 0);
        }
        const q = parseFloat(inputs.quality.value);
        return new Promise((resolve, reject) => {
          off.toBlob((b) => b ? resolve({ blob: b, w: outW, h: outH }) : reject(new Error('Export failed')), 'image/jpeg', q);
        });
      }

      function setStatus(msg, err) {
        statusEl.textContent = msg || '';
        statusEl.classList.toggle('editor__status--err', !!err);
      }

      function reset() {
        inputs.grayscale.value = '0';
        inputs.brightness.value = '100';
        inputs.contrast.value = '100';
        inputs.saturate.value = '100';
        inputs.zoom.value = '1';
        inputs.width.value = '2000';
        inputs.quality.value = '0.85';
        panX = 0; panY = 0;
        drawPreview();
      }

      function open(opts) {
        ctxState = opts;
        titleEl.textContent = 'Edit · ' + opts.label;
        setStatus('Loading…', false);
        reset();
        applyB.disabled = true;
        root.classList.add('is-open');

        const im = new Image();
        im.crossOrigin = 'anonymous';   // same-origin photos; keeps canvas untainted
        im.onload = () => {
          img = im;
          metaEl.textContent = im.naturalWidth + ' × ' + im.naturalHeight + ' px source';
          applyB.disabled = false;
          setStatus('', false);
          drawPreview();
        };
        im.onerror = () => setStatus(
          'Could not load the current photo. Choose a file first, then press Edit & adjust.',
          true,
        );
        if (typeof opts.source === 'string') {
          im.src = opts.source;
        } else {
          // a File / Blob
          im.src = URL.createObjectURL(opts.source);
        }
      }

      function close() {
        root.classList.remove('is-open');
        img = null; ctxState = null;
      }

      // ── Wire controls ──
      ['grayscale','brightness','contrast','saturate','zoom'].forEach((k) => {
        inputs[k].addEventListener('input', drawPreview);
      });
      bwChip.addEventListener('click', () => {
        inputs.grayscale.value = inputs.grayscale.value === '100' ? '0' : '100';
        drawPreview();
      });
      resetB.addEventListener('click', reset);
      cancelB.addEventListener('click', close);
      root.addEventListener('click', (e) => { if (e.target === root) close(); });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && root.classList.contains('is-open')) close();
      });

      // Drag to pan when zoomed in.
      let dragging = false, lastX = 0, lastY = 0;
      canvas.addEventListener('pointerdown', (e) => {
        if (parseFloat(inputs.zoom.value) <= 1) return;
        dragging = true; lastX = e.clientX; lastY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
      });
      canvas.addEventListener('pointermove', (e) => {
        if (!dragging || !img) return;
        const z = parseFloat(inputs.zoom.value);
        // Move proportionally to how much is hidden by the zoom.
        panX -= (e.clientX - lastX) / canvas.width  / z;
        panY -= (e.clientY - lastY) / canvas.height / z;
        panX = Math.max(-0.5, Math.min(0.5, panX));
        panY = Math.max(-0.5, Math.min(0.5, panY));
        lastX = e.clientX; lastY = e.clientY;
        drawPreview();
      });
      canvas.addEventListener('pointerup',   () => { dragging = false; });
      canvas.addEventListener('pointercancel',() => { dragging = false; });

      applyB.addEventListener('click', async () => {
        if (!img || !ctxState) return;
        applyB.disabled = true; cancelB.disabled = true;
        setStatus('Rendering…', false);
        try {
          const { blob, w, h } = await exportBlob();
          setStatus('Uploading ' + w + '×' + h + ' · ' + Math.round(blob.size / 1024) + ' KB…', false);
          const data = await window.ZAHARA_UPLOAD(ctxState.key, blob, ctxState.key + '.jpg');
          if (ctxState.onSaved) ctxState.onSaved(data.size);
          close();
        } catch (err) {
          setStatus(String(err.message || err), true);
        } finally {
          applyB.disabled = false; cancelB.disabled = false;
        }
      });

      return { open };
    })();
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
  //   fallback — the same path without override; after a delete we reload it
  const src      = `/photos/${p.filename}?t=${version}`;
  const fallback = `/photos/${p.filename}`;
  const tags: string[] = [];
  if (p.reused)   tags.push('<span class="card__tag">Shared</span>');
  if (p.reserved) tags.push('<span class="card__tag">Not shown</span>');
  return `
    <article class="card" data-photo-card="${esc(p.key)}" data-label="${esc(p.label)}">
      <div class="card__thumb">
        <img data-thumb data-src="/photos/${esc(p.filename)}" data-fallback="${esc(fallback)}"
             src="${esc(src)}" alt="${esc(p.label)}" loading="lazy" decoding="async"
             onerror="this.style.opacity=0.25" />
        <span class="card__badge ${hasOverride ? 'card__badge--override' : ''}" data-badge>
          ${hasOverride ? 'Override' : 'Default'}
        </span>
        ${tags.length ? `<div class="card__tags">${tags.join('')}</div>` : ''}
      </div>
      <header class="card__head">
        <p class="card__label">${esc(p.label)}</p>
        <p class="card__where">${esc(p.where)}</p>
        <p class="card__token"><code>${esc(p.key)}</code></p>
      </header>
      <div class="card__actions">
        <form data-form-upload>
          <input class="card__file-input" type="file" data-input-file
                 accept="image/jpeg,image/png,image/webp" />
          <div class="card__row" style="margin-top:0.55rem">
            <button class="btn" type="submit" data-btn-upload>Upload</button>
            <button class="btn btn--ghost btn--sm" type="button" data-btn-edit>Edit &amp; adjust</button>
          </div>
        </form>
        <div class="card__row">
          <button class="btn btn--ghost" type="button" data-btn-delete>Remove override</button>
        </div>
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
            <small>${photos.length} photo${photos.length === 1 ? '' : 's'} · in page order</small>
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
      Every photo on the site, grouped by page and listed in the order you
      meet it as you scroll. Each one is adjusted on its own. Press
      <strong>Upload</strong> to drop in a replacement as-is, or
      <strong>Edit &amp; adjust</strong> to crop / zoom, make it black &amp;
      white, tweak brightness &amp; contrast, and resize before saving.
      <strong>Remove override</strong> reverts to the original.
      Accepts JPG / PNG / WebP up to 10&nbsp;MB.
    </p>
    ${groupHtml}
  </main>

  <!-- Editor modal (single instance, reused by every card) -->
  <div class="editor" id="editor" aria-hidden="true">
    <div class="editor__panel" role="dialog" aria-label="Photo editor">
      <div class="editor__stage">
        <canvas class="editor__canvas" id="ed-canvas" width="520" height="390"></canvas>
      </div>
      <div class="editor__side">
        <h2 class="editor__title" id="ed-title">Edit photo</h2>
        <p class="editor__sub">Drag the image to reposition when zoomed in.</p>

        <div class="editor__toggles">
          <button type="button" class="chip" id="ed-bw">Black &amp; white</button>
          <button type="button" class="chip" id="ed-reset">Reset</button>
        </div>

        <div class="ctl">
          <div class="ctl__row"><label for="ed-zoom">Zoom / crop</label><span class="ctl__val" id="ed-zoom-v">1.00×</span></div>
          <input type="range" id="ed-zoom" min="1" max="4" step="0.01" value="1" />
        </div>
        <div class="ctl">
          <div class="ctl__row"><label for="ed-grayscale">Black &amp; white</label><span class="ctl__val" id="ed-grayscale-v">0%</span></div>
          <input type="range" id="ed-grayscale" min="0" max="100" step="1" value="0" />
        </div>
        <div class="ctl">
          <div class="ctl__row"><label for="ed-brightness">Brightness</label><span class="ctl__val" id="ed-brightness-v">100%</span></div>
          <input type="range" id="ed-brightness" min="40" max="160" step="1" value="100" />
        </div>
        <div class="ctl">
          <div class="ctl__row"><label for="ed-contrast">Contrast</label><span class="ctl__val" id="ed-contrast-v">100%</span></div>
          <input type="range" id="ed-contrast" min="40" max="180" step="1" value="100" />
        </div>
        <div class="ctl">
          <div class="ctl__row"><label for="ed-saturate">Saturation</label><span class="ctl__val" id="ed-saturate-v">100%</span></div>
          <input type="range" id="ed-saturate" min="0" max="200" step="1" value="100" />
        </div>

        <div class="ctl">
          <label for="ed-width">Resize (max width)</label>
          <select id="ed-width">
            <option value="orig">Keep original width</option>
            <option value="2400">2400 px — extra large</option>
            <option value="2000" selected>2000 px — large (recommended)</option>
            <option value="1600">1600 px — medium</option>
            <option value="1200">1200 px — small</option>
          </select>
          <p class="ctl__hint">Smaller files load faster. 2000 px is plenty for full-bleed photos.</p>
        </div>
        <div class="ctl">
          <label for="ed-quality">JPEG quality</label>
          <select id="ed-quality">
            <option value="0.92">High (92%)</option>
            <option value="0.85" selected>Balanced (85%)</option>
            <option value="0.75">Smaller (75%)</option>
          </select>
        </div>

        <p class="editor__meta" id="ed-meta"></p>
        <p class="editor__status" id="ed-status"></p>
        <div class="editor__foot">
          <button type="button" class="btn" id="ed-apply">Apply &amp; upload</button>
          <button type="button" class="btn btn--ghost btn--sm" id="ed-cancel">Cancel</button>
        </div>
      </div>
    </div>
  </div>

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
