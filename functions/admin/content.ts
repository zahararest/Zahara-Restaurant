// GET /admin/content — Cloudflare Access gated. A self-contained editor for the
// site's homepage + info-strip copy. Each field has HE + EN inputs,
// pre-filled with the saved override (blank → the built-in default is used
// on the live site). "Save changes" POSTs the whole map to
// /admin/content/save, which merges it into the single KV record the
// middleware injects into every page.

import type { PagesFunction, R2Bucket } from '@cloudflare/workers-types';
import { checkAccess, unauthorized, type AuthEnv } from './auth';
import { CHROME_CSS, ADMIN_FONTS_HREF, topbar } from './chrome';
import {
  CONTENT_GROUPS, CONTENT_PAGES, readContent,
  readPopupConfig, popupActive, POPUP_IMAGE_OBJECT, type PopupConfig,
  type ContentEnv, type ContentMap, type ContentField,
} from '../data/content';
import { PHOTO_CATALOGUE } from '../data/photos-map';

interface Env extends AuthEnv, ContentEnv { IMAGES?: R2Bucket; }

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

const STYLE = `
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; background: #F4EDDF; color: #1a1410;
    font-family: 'Inter', system-ui, sans-serif; font-size: 14px; line-height: 1.55; }
  header.top { position: sticky; top: 0; z-index: 10;
    background: rgba(250,247,238,0.95); backdrop-filter: blur(8px);
    border-bottom: 1px solid #D5CBB1; padding: 0.7rem 1.5rem; display: grid; gap: 0.55rem; }
  .top__nav { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .top__brand { font-size: 0.78rem; font-weight: 700; letter-spacing: 0.24em;
    text-transform: uppercase; color: #1a1410; text-decoration: none;
    padding-inline-end: 0.4rem; border-inline-end: 1px solid #D5CBB1; margin-inline-end: 0.4rem; }
  .top__navlink { font-size: 0.78rem; letter-spacing: 0.18em; text-transform: uppercase;
    font-weight: 600; color: #6f6457; text-decoration: none; padding: 0.35rem 0.65rem;
    border: 1px solid transparent; transition: color .2s, border-color .2s, background .2s; }
  .top__navlink:hover { color: #1a1410; border-color: #D5CBB1; }
  .top__navlink.is-active { color: #1a1410; background: #ece3d0; border-color: #D5CBB1; pointer-events: none; }
  .top__spacer { flex: 1; }
  .top__site { font-size: 0.78rem; letter-spacing: 0.18em; text-transform: uppercase;
    color: #9C4621; font-weight: 600; text-decoration: none; padding: 0.4rem 0.6rem; }
  .top__site:hover { text-decoration: underline; }
  .top__title { margin: 0; font-size: 0.85rem; font-weight: 700; letter-spacing: 0.22em;
    text-transform: uppercase; color: #6f6457; }
  /* Page tabs — one button per site page, so the owner edits one page's copy
     at a time (mirrors the Menu editor's tabbed layout). */
  .pagetabs { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .pagetab { font: inherit; font-size: 0.74rem; letter-spacing: 0.14em; text-transform: uppercase;
    font-weight: 600; color: #6f6457; background: transparent; cursor: pointer;
    padding: 0.4rem 0.85rem; border: 1px solid #D5CBB1; border-radius: 0;
    transition: color .2s, border-color .2s, background .2s; }
  .pagetab:hover { color: #1a1410; background: #f1e9d6; }
  .pagetab.is-active { color: #F4EDDF; background: #1a1410; border-color: #1a1410; }
  main { max-width: 920px; margin: 0 auto; padding: 2rem 1.5rem 7rem; }
  .page { display: none; }
  .page.is-active { display: block; }
  .lead { color: #6f6457; max-width: 64ch; margin: 0 0 2rem; }
  .group { margin-block-end: 2.5rem; }
  .group__head { display: flex; align-items: baseline; justify-content: space-between;
    padding-block-end: 0.5rem; margin-block-end: 1.1rem; border-bottom: 1px solid #D5CBB1; }
  .group__head h2 { margin: 0; font-size: 0.95rem; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; }
  .group__head small { color: #6f6457; }
  .field { margin-block-end: 1.1rem; }
  .field__label { display: flex; align-items: baseline; gap: 0.5rem;
    font-weight: 600; font-size: 0.85rem; margin-block-end: 0.35rem; }
  .field__tag { font-size: 0.62rem; letter-spacing: 0.12em; text-transform: uppercase;
    font-weight: 600; color: #6f5a2e; background: #f3eddc; padding: 0.1rem 0.4rem; border: 1px solid #e3d7b8; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  @media (max-width: 620px) { .pair { grid-template-columns: 1fr; } }
  .col { display: grid; gap: 0.25rem; }
  .col__lang { font-size: 0.66rem; letter-spacing: 0.18em; text-transform: uppercase;
    font-weight: 700; color: #9a8d77; }
  .col input, .col textarea { font: inherit; font-size: 0.86rem; width: 100%;
    padding: 0.5rem 0.6rem; border: 1px solid #D5CBB1; background: #fff; color: #1a1410; border-radius: 0; }
  .col input:focus, .col textarea:focus { outline: 2px solid #9C4621; outline-offset: 0; border-color: #9C4621; }
  .col textarea { min-height: 2.4rem; resize: vertical; line-height: 1.5; }
  .col textarea.is-multi { min-height: 4.5rem; }
  .fmt-hint code { background: #f3eddc; border: 1px solid #e3d7b8; padding: 0.05rem 0.35rem; font-size: 0.8em; }
  .col [dir="rtl"] { direction: rtl; }
  /* ── Formatting toolbar (Word/Docs-style) shown above each field's inputs ── */
  .fmtbar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem;
    margin-block-end: 0.4rem; }
  .fmtbtn { font: inherit; font-size: 0.82rem; line-height: 1; min-width: 2rem;
    padding: 0.34rem 0.5rem; border: 1px solid #D5CBB1; background: #fff; color: #1a1410;
    cursor: pointer; border-radius: 0; transition: background .15s, border-color .15s, color .15s; }
  .fmtbtn:hover { background: #f1e9d6; border-color: #9C4621; color: #9C4621; }
  .fmtbtn:active { background: #ece3d0; }
  .fmtbtn--b { font-weight: 800; }
  .fmtbtn--i { font-style: italic; font-family: Georgia, 'Times New Roman', serif; }
  .fmtbtn--u { text-decoration: underline; }
  .fmtbar__sep { width: 1px; align-self: stretch; background: #e3d7b8; margin-inline: 0.15rem; }
  .fmtbar__hint { font-size: 0.68rem; color: #9a8d77; margin-inline-start: auto; }
  .field__size { display: flex; align-items: center; gap: 0.5rem; margin-block-start: 0.4rem; }
  .field__size label { font-size: 0.72rem; letter-spacing: 0.1em; text-transform: uppercase;
    font-weight: 600; color: #9a8d77; }
  .field__size select { font: inherit; font-size: 0.8rem; padding: 0.3rem 0.5rem;
    border: 1px solid #D5CBB1; background: #fff; color: #1a1410; border-radius: 0; }
  .field__size select:focus { outline: 2px solid #9C4621; outline-offset: 0; border-color: #9C4621; }
  .field__size select.is-set { border-color: #9C4621; color: #6f5a2e; font-weight: 600; }
  .savebar { position: fixed; inset-block-end: 0; inset-inline: 0; z-index: 20;
    background: rgba(250,247,238,0.97); border-top: 1px solid #D5CBB1;
    padding: 0.8rem 1.5rem; display: flex; align-items: center; gap: 1rem; justify-content: flex-end; }
  .savebar__status { margin-inline-end: auto; font-size: 0.8rem; color: #4f6b47; min-height: 1.2em; }
  .savebar__status--err { color: #a53623; }
  .btn { font: inherit; font-size: 0.74rem; letter-spacing: 0.16em; text-transform: uppercase;
    font-weight: 600; padding: 0.7rem 1.4rem; background: #1a1410; color: #F4EDDF;
    border: 1px solid #1a1410; cursor: pointer; }
  .btn:hover { background: #9C4621; border-color: #9C4621; }
  .btn:disabled { opacity: 0.55; cursor: not-allowed; }
  /* Popup tab — visibility controls (on/off switch + auto-hide days). */
  .popup-vis { display: grid; gap: 0.9rem; }
  .popup-vis__row { display: flex; align-items: center; flex-wrap: wrap; gap: 0.55rem;
    font-size: 0.9rem; font-weight: 600; }
  .popup-vis__row input[type="checkbox"] { width: 1.1rem; height: 1.1rem;
    accent-color: #9C4621; cursor: pointer; }
  .popup-vis__days input { font: inherit; font-size: 0.86rem; width: 4.5rem;
    padding: 0.4rem 0.5rem; border: 1px solid #D5CBB1; background: #fff;
    color: #1a1410; border-radius: 0; text-align: center; }
  .popup-vis__days input:focus { outline: 2px solid #9C4621; outline-offset: 0; border-color: #9C4621; }
  .popup-vis__hint { color: #9a8d77; font-weight: 400; font-size: 0.8rem; }
  .popup-vis__status { margin: 0; font-size: 0.85rem; color: #6f6457;
    padding: 0.55rem 0.75rem; background: #f1e9d6; border: 1px solid #e3d7b8; }
  .popup-vis__status--on { color: #4f6b47; }
  /* ── Popup style + photo controls ─────────────────────────────────── */
  .popup-style { display: grid; gap: 1rem; }
  .modeseg { display: inline-flex; flex-wrap: wrap; border: 1px solid #D5CBB1; background: #fff; width: fit-content; }
  .modeseg__btn { font: inherit; font-size: 0.78rem; letter-spacing: 0.04em; font-weight: 600;
    padding: 0.5rem 0.95rem; background: transparent; color: #6f6457; border: 0;
    border-inline-end: 1px solid #D5CBB1; cursor: pointer; }
  .modeseg__btn:last-child { border-inline-end: 0; }
  .modeseg__btn.is-active { background: #1a1410; color: #F4EDDF; }
  .popup-photo { display: grid; gap: 0.85rem; }
  .popup-photo.is-hidden { display: none; }
  .popup-photo__preview { display: flex; gap: 0.9rem; align-items: flex-start; flex-wrap: wrap; }
  .popup-photo__thumb { width: 190px; max-width: 100%; aspect-ratio: 4 / 3; object-fit: contain;
    background: #ece3d0; border: 1px solid #D5CBB1; display: block; }
  .popup-photo__thumb.is-empty { display: grid; place-items: center; color: #9a8d77;
    font-size: 0.8rem; text-align: center; padding: 0.5rem; }
  .popup-photo__actions { display: flex; flex-direction: column; gap: 0.5rem; }
  .popup-photo__file { display: none; }
  .popup-photo__status { margin: 0; min-height: 1.1em; font-size: 0.78rem; color: #4f6b47; }
  .popup-photo__status--err { color: #a53623; }
  .popup-picker { border: 1px solid #e3d7b8; background: #fbf7ee; padding: 0.7rem; }
  .popup-picker.is-hidden { display: none; }
  .popup-picker__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 0.5rem; }
  .popup-picker__item { padding: 0; border: 1px solid #D5CBB1; background: #fff; cursor: pointer;
    display: block; transition: border-color .15s, box-shadow .15s; }
  .popup-picker__item:hover { border-color: #9C4621; box-shadow: 0 3px 12px rgba(0,0,0,0.12); }
  .popup-picker__item:disabled { opacity: 0.5; cursor: not-allowed; }
  .popup-picker__item img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block; background: #ece3d0; }
  .popup-picker__item span { display: block; font-size: 0.62rem; color: #6f6457; padding: 0.2rem 0.3rem;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
`;

const SCRIPT = `
  (function () {
    'use strict';
    // ── Page tabs — show one page's groups at a time. All inputs stay in the
    // DOM (just hidden), so collect() still gathers every page on save and
    // switching tabs never loses an unsaved edit. ──
    var tabs   = Array.prototype.slice.call(document.querySelectorAll('[data-page-tab]'));
    var panels = Array.prototype.slice.call(document.querySelectorAll('[data-page]'));
    function showPage(id) {
      tabs.forEach(function (t) {
        var on = t.getAttribute('data-page-tab') === id;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      panels.forEach(function (p) {
        p.classList.toggle('is-active', p.getAttribute('data-page') === id);
      });
      try { history.replaceState(null, '', '#' + id); } catch (e) {}
    }
    tabs.forEach(function (t) {
      t.addEventListener('click', function () { showPage(t.getAttribute('data-page-tab')); });
    });
    var initial = (location.hash || '').replace('#', '');
    showPage(tabs.some(function (t) { return t.getAttribute('data-page-tab') === initial; })
      ? initial : (tabs[0] && tabs[0].getAttribute('data-page-tab')));

    var saveBtn = document.getElementById('save');
    var statusEl = document.getElementById('status');
    function setStatus(msg, err) {
      statusEl.textContent = msg || '';
      statusEl.classList.toggle('savebar__status--err', !!err);
    }
    function collect() {
      var map = {};
      document.querySelectorAll('[data-key]').forEach(function (el) {
        var key = el.getAttribute('data-key');
        var lang = el.getAttribute('data-lang');
        if (!map[key]) map[key] = {};
        map[key][lang] = el.value;
      });
      document.querySelectorAll('[data-size-key]').forEach(function (el) {
        var key = el.getAttribute('data-size-key');
        if (!map[key]) map[key] = {};
        map[key].size = parseFloat(el.value) || 1;
      });
      return map;
    }
    // Highlight a size control once it's set to anything but Default.
    document.querySelectorAll('.field__sizesel').forEach(function (sel) {
      sel.addEventListener('change', function () {
        sel.classList.toggle('is-set', parseFloat(sel.value) !== 1);
      });
    });

    // ── Formatting toolbar (Bold / Italic / Underline / size / line break) ──
    // The buttons wrap the selection in the SAME lightweight markup the live
    // site understands (**bold**, *italic*, __underline__) so nothing new has
    // to be taught to the renderer. A± step the field's Text-size control.
    // Track the last-focused input per field so a button knows which of the
    // Hebrew/English boxes to act on (clicking a button must not steal focus).
    document.querySelectorAll('[data-key]').forEach(function (ta) {
      ta.addEventListener('focus', function () {
        var field = ta.closest('.field');
        if (field) field.__activeTa = ta;
      });
    });
    function activeInput(field) {
      if (field && field.__activeTa && field.contains(field.__activeTa)) return field.__activeTa;
      return field ? field.querySelector('[data-key]') : null;
    }
    function surround(ta, before, after) {
      var s = ta.selectionStart, e = ta.selectionEnd, val = ta.value;
      var sel = val.slice(s, e);
      ta.value = val.slice(0, s) + before + sel + after + val.slice(e);
      ta.focus();
      if (sel) { ta.selectionStart = s + before.length; ta.selectionEnd = e + before.length + sel.length; }
      else     { ta.selectionStart = ta.selectionEnd = s + before.length; }
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function insertAt(ta, text) {
      var s = ta.selectionStart, e = ta.selectionEnd, val = ta.value;
      ta.value = val.slice(0, s) + text + val.slice(e);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = s + text.length;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function stepSize(field, dir) {
      var sel = field.querySelector('.field__sizesel');
      if (!sel) return;
      var next = sel.selectedIndex + dir;
      if (next < 0 || next >= sel.options.length) return;
      sel.selectedIndex = next;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function applyFmt(field, action) {
      if (action === 'bigger')  { stepSize(field, +1); return; }
      if (action === 'smaller') { stepSize(field, -1); return; }
      var ta = activeInput(field);
      if (!ta) return;
      if (action === 'bold')      surround(ta, '**', '**');
      else if (action === 'italic')    surround(ta, '*', '*');
      else if (action === 'underline') surround(ta, '__', '__');
      else if (action === 'linebreak') insertAt(ta, '\\n');
    }
    document.querySelectorAll('[data-fmtbar] .fmtbtn').forEach(function (btn) {
      // mousedown → preventDefault keeps the textarea's selection/focus intact
      // when the button is pressed (so the wrap targets the right text).
      btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
      btn.addEventListener('click', function () {
        var field = btn.closest('.field');
        applyFmt(field, btn.getAttribute('data-fmt'));
      });
    });
    // Ctrl/⌘ + B / I / U inside any copy box.
    document.addEventListener('keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      var k = e.key.toLowerCase();
      if (k !== 'b' && k !== 'i' && k !== 'u') return;
      var ta = e.target;
      if (!ta || !ta.matches || !ta.matches('[data-key]')) return;
      e.preventDefault();
      var field = ta.closest('.field');
      applyFmt(field, k === 'b' ? 'bold' : k === 'i' ? 'italic' : 'underline');
    });
    // ── Popup: style selector + photo management (Popup tab) ──
    // The style (text / photo / both) rides along with Save changes; the photo
    // itself is uploaded/reused/removed instantly via /admin/popup/image.
    (function () {
      var modeInput = document.getElementById('popup-mode');
      if (!modeInput) return;
      var seg       = document.querySelectorAll('[data-popup-mode]');
      var photoWrap = document.getElementById('popup-photo');
      var thumb     = document.getElementById('popup-photo-thumb');
      var fileInput = document.getElementById('popup-photo-file');
      var uploadBtn = document.getElementById('popup-photo-upload');
      var chooseBtn = document.getElementById('popup-photo-choose');
      var removeBtn = document.getElementById('popup-photo-remove');
      var statusEl  = document.getElementById('popup-photo-status');
      var picker    = document.getElementById('popup-picker');

      function setPStatus(m, err) {
        if (!statusEl) return;
        statusEl.textContent = m || '';
        statusEl.classList.toggle('popup-photo__status--err', !!err);
      }
      function setMode(mode) {
        modeInput.value = mode;
        seg.forEach(function (b) { b.classList.toggle('is-active', b.getAttribute('data-popup-mode') === mode); });
        if (photoWrap) photoWrap.classList.toggle('is-hidden', mode === 'text');
      }
      seg.forEach(function (b) {
        b.addEventListener('click', function () { setMode(b.getAttribute('data-popup-mode')); });
      });

      function refreshThumb() {
        var img = document.createElement('img');
        img.className = 'popup-photo__thumb'; img.id = 'popup-photo-thumb';
        img.alt = 'Current popup photo'; img.src = '/popup-image?v=' + Date.now();
        if (thumb && thumb.parentNode) { thumb.parentNode.replaceChild(img, thumb); thumb = img; }
      }
      function clearThumb() {
        var box = document.createElement('div');
        box.className = 'popup-photo__thumb is-empty'; box.id = 'popup-photo-thumb';
        box.textContent = 'No photo yet';
        if (thumb && thumb.parentNode) { thumb.parentNode.replaceChild(box, thumb); thumb = box; }
      }
      function onHasImage(has) {
        if (removeBtn) removeBtn.hidden = !has;
        if (has) refreshThumb(); else clearThumb();
      }
      async function post(fd) {
        var res  = await fetch('/admin/popup/image', { method: 'POST', body: fd });
        var data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Failed');
        return data;
      }

      if (uploadBtn && fileInput) uploadBtn.addEventListener('click', function () { fileInput.click(); });
      if (fileInput) fileInput.addEventListener('change', async function () {
        if (!fileInput.files || !fileInput.files.length) return;
        setPStatus('Uploading…', false);
        try {
          var fd = new FormData(); fd.append('file', fileInput.files[0]);
          await post(fd); onHasImage(true);
          setPStatus('Photo saved · live now.', false);
        } catch (err) { setPStatus(String(err.message || err), true); }
        finally { fileInput.value = ''; }
      });
      if (chooseBtn && picker) chooseBtn.addEventListener('click', function () {
        picker.classList.toggle('is-hidden');
      });
      if (picker) picker.addEventListener('click', async function (e) {
        var item = e.target.closest('[data-popup-source]');
        if (!item) return;
        var items = picker.querySelectorAll('[data-popup-source]');
        items.forEach(function (b) { b.disabled = true; });
        setPStatus('Applying…', false);
        try {
          var fd = new FormData(); fd.append('source', item.getAttribute('data-popup-source'));
          await post(fd); onHasImage(true); picker.classList.add('is-hidden');
          setPStatus('Photo set · live now.', false);
        } catch (err) { setPStatus(String(err.message || err), true); }
        finally { items.forEach(function (b) { b.disabled = false; }); }
      });
      if (removeBtn) removeBtn.addEventListener('click', async function () {
        if (!confirm('Remove the popup photo?')) return;
        setPStatus('Removing…', false);
        try {
          var fd = new FormData(); fd.append('action', 'delete');
          await post(fd); onHasImage(false);
          setPStatus('Photo removed.', false);
        } catch (err) { setPStatus(String(err.message || err), true); }
      });
    })();

    saveBtn.addEventListener('click', async function () {
      saveBtn.disabled = true;
      setStatus('Saving…', false);
      try {
        // The popup's on/off + days controls (Popup tab) ride along with the
        // text map; the save endpoint stores them in their own KV record.
        var payload = { map: collect() };
        var popupEnabledEl = document.getElementById('popup-enabled');
        var popupDaysEl    = document.getElementById('popup-days');
        var popupModeEl    = document.getElementById('popup-mode');
        if (popupEnabledEl && popupDaysEl) {
          payload.popup = {
            enabled: popupEnabledEl.checked,
            days: Math.max(0, Math.round(parseFloat(popupDaysEl.value) || 0)),
            mode: popupModeEl ? popupModeEl.value : undefined,
          };
        }
        var res = await fetch('/admin/content/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        var data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Save failed');
        setStatus('Saved · changes are live (reload the site to see them).', false);
        try { new BroadcastChannel('zahara-content').postMessage({ action: 'saved' }); } catch (e) {}
      } catch (err) {
        setStatus(String(err.message || err), true);
      } finally {
        saveBtn.disabled = false;
      }
    });
  })();
`;

function fieldHtml(f: ContentField, value: ContentMap[string]): string {
  // Pre-fill with the saved override, falling back to the built-in default,
  // so the editor always shows the CURRENT live text rather than a blank box.
  const he  = esc(value?.he ?? f.he ?? '');
  const en  = esc(value?.en ?? f.en ?? '');
  // Placeholder = the built-in default, so a cleared (hidden) field still
  // shows what the default was — retype it to restore, leave blank to hide.
  const phHe = esc(f.he ?? '');
  const phEn = esc(f.en ?? '');
  // Every field is a textarea so line breaks (and **bold** / *italic*) work
  // anywhere; longer fields get extra height via the is-multi class.
  const cls = f.multiline ? ' is-multi' : '';
  const input = (lang: 'he' | 'en', val: string, dir: string, ph: string) =>
    `<textarea class="field__input${cls}" data-key="${esc(f.key)}" data-lang="${lang}" dir="${dir}" rows="${f.multiline ? 4 : 1}" placeholder="${ph}">${val}</textarea>`;

  // Optional font-size control. Presets keep it simple; the saved value is
  // pre-selected (and an off-preset value is added so it isn't lost).
  const curSize = value?.size ?? 1;
  const presets: Array<[number, string]> = [
    [0.8, 'Smallest'], [0.9, 'Smaller'], [1, 'Default'],
    [1.15, 'Larger'], [1.3, 'Largest'], [1.5, 'Huge'], [1.75, 'Giant'],
  ];
  if (!presets.some(([n]) => n === curSize)) presets.push([curSize, `Custom (${curSize}×)`]);
  const sizeOpts = presets
    .map(([n, lbl]) => `<option value="${n}"${n === curSize ? ' selected' : ''}>${esc(lbl)}</option>`)
    .join('');
  const sizeSet = curSize !== 1 ? ' is-set' : '';

  // Word/Docs-style toolbar: buttons act on whichever of the two inputs below
  // is focused (Bold/Italic/Underline wrap the selection; A± step the size).
  const toolbar = `
      <div class="fmtbar" data-fmtbar>
        <button type="button" class="fmtbtn fmtbtn--b" data-fmt="bold"      title="Bold (Ctrl/⌘+B)" aria-label="Bold">B</button>
        <button type="button" class="fmtbtn fmtbtn--i" data-fmt="italic"    title="Italic (Ctrl/⌘+I)" aria-label="Italic">I</button>
        <button type="button" class="fmtbtn fmtbtn--u" data-fmt="underline" title="Underline (Ctrl/⌘+U)" aria-label="Underline">U</button>
        <span class="fmtbar__sep"></span>
        <button type="button" class="fmtbtn" data-fmt="smaller" title="Make this text smaller" aria-label="Smaller text">A−</button>
        <button type="button" class="fmtbtn" data-fmt="bigger"  title="Make this text bigger" aria-label="Bigger text">A+</button>
        <span class="fmtbar__sep"></span>
        <button type="button" class="fmtbtn" data-fmt="linebreak" title="Insert a line break" aria-label="Line break">↵</button>
        <span class="fmtbar__hint">select text, then click a style</span>
      </div>`;

  return `
    <div class="field">
      <div class="field__label">${esc(f.label)}</div>
      ${toolbar}
      <div class="pair">
        <div class="col"><span class="col__lang">Hebrew</span>${input('he', he, 'rtl', phHe)}</div>
        <div class="col"><span class="col__lang">English</span>${input('en', en, 'ltr', phEn)}</div>
      </div>
      <div class="field__size">
        <label>Text size</label>
        <select class="field__sizesel${sizeSet}" data-size-key="${esc(f.key)}">${sizeOpts}</select>
      </div>
    </div>`;
}

// The Visibility section shown at the top of the Popup tab — an on/off
// switch, the auto-hide day count, and a plain-words status line so the
// owner can see at a glance whether visitors currently get the popup.
function popupVisHtml(cfg: PopupConfig): string {
  const active = popupActive(cfg);
  const fmt = (ms: number) => new Date(ms).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem',
  });
  let status: string;
  if (active) {
    status = cfg.days > 0
      ? `The popup is ON — it hides itself automatically on ${fmt(cfg.until)}.`
      : 'The popup is ON — visitors see it until you turn it off.';
  } else if (cfg.enabled && cfg.days > 0 && cfg.until) {
    status = `The ${cfg.days}-day window ended on ${fmt(cfg.until)} — the popup is hidden. `
      + 'Tick “Show the popup” and save to start a new window.';
  } else {
    status = 'The popup is OFF — visitors don’t see it.';
  }
  return `
    <section class="group">
      <header class="group__head">
        <h2>Visibility</h2>
        <small>Applies when you press Save changes.</small>
      </header>
      <div class="popup-vis">
        <label class="popup-vis__row">
          <input type="checkbox" id="popup-enabled"${active ? ' checked' : ''}>
          <span>Show the popup</span>
        </label>
        <label class="popup-vis__row popup-vis__days">
          <span>Hide automatically after</span>
          <input type="number" id="popup-days" min="0" max="365" step="1" value="${cfg.days}">
          <span>days</span>
          <span class="popup-vis__hint">0 = no time limit. The countdown starts from the save
            that turns the popup on or changes the number of days.</span>
        </label>
        <p class="popup-vis__status${active ? ' popup-vis__status--on' : ''}">${esc(status)}</p>
      </div>
    </section>`;
}

// The Style section — choose between the text card, a photo, or a photo with
// text, and manage the popup photo (upload / reuse an existing site photo /
// remove). Photo actions take effect immediately; the chosen STYLE applies
// when the owner presses Save changes (like the visibility settings above).
function popupStyleHtml(cfg: PopupConfig, hasImage: boolean, version: string): string {
  const modes: Array<[string, string]> = [
    ['text', 'Text card'], ['photo', 'Photo'], ['both', 'Photo + text'],
  ];
  const modeBtns = modes.map(([id, label]) =>
    `<button type="button" class="modeseg__btn${cfg.mode === id ? ' is-active' : ''}" data-popup-mode="${id}">${esc(label)}</button>`
  ).join('');

  const thumb = hasImage
    ? `<img class="popup-photo__thumb" id="popup-photo-thumb" src="/popup-image?v=${esc(version)}" alt="Current popup photo" />`
    : `<div class="popup-photo__thumb is-empty" id="popup-photo-thumb">No photo yet</div>`;

  // Inline "reuse an existing photo" grid — every non-reserved site photo.
  const pickerItems = PHOTO_CATALOGUE
    .filter((p) => !p.reserved)
    .map((p) =>
      `<button type="button" class="popup-picker__item" data-popup-source="${esc(p.key)}" title="${esc(p.label)}">
        <img src="/photos/${esc(p.filename)}?t=${esc(version)}" alt="" loading="lazy" onerror="this.style.opacity=0.2" />
        <span>${esc(p.label)}</span>
      </button>`
    ).join('');

  // Photo controls hidden while in text mode.
  const photoHidden = cfg.mode === 'text' ? ' is-hidden' : '';

  return `
    <section class="group">
      <header class="group__head">
        <h2>Popup style</h2>
        <small>How the popup looks. Save changes to apply the style.</small>
      </header>
      <div class="popup-style">
        <div class="modeseg" role="group" aria-label="Popup style">${modeBtns}</div>
        <input type="hidden" id="popup-mode" value="${esc(cfg.mode)}" />

        <div class="popup-photo${photoHidden}" id="popup-photo">
          <div class="popup-photo__preview">
            ${thumb}
            <div class="popup-photo__actions">
              <input class="popup-photo__file" type="file" id="popup-photo-file"
                     accept="image/jpeg,image/png,image/webp" />
              <button type="button" class="btn" id="popup-photo-upload">Upload photo…</button>
              <button type="button" class="btn" id="popup-photo-choose"
                      style="background:transparent;color:#1a1410;">Choose existing</button>
              <button type="button" class="btn" id="popup-photo-remove"
                      style="background:transparent;color:#1a1410;"${hasImage ? '' : ' hidden'}>Remove photo</button>
            </div>
          </div>
          <p class="popup-photo__status" id="popup-photo-status"></p>
          <div class="popup-picker is-hidden" id="popup-picker">
            <div class="popup-picker__grid">${pickerItems}</div>
          </div>
        </div>
      </div>
    </section>`;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return unauthorized();

  const [overrides, popupCfg] = await Promise.all([readContent(env), readPopupConfig(env)]);

  // Is a popup photo actually stored right now? (head avoids downloading it.)
  let hasPopupImage = false;
  if (env.IMAGES) {
    try { hasPopupImage = (await env.IMAGES.head(POPUP_IMAGE_OBJECT)) !== null; }
    catch (err) { console.warn('[admin/content] popup image head failed', err); }
  }
  // Per-load cache-buster for admin thumbnails.
  const adminVersion = Date.now().toString(36);

  const groupHtml = (g: (typeof CONTENT_GROUPS)[number]) => `
    <section class="group">
      <header class="group__head">
        <h2>${esc(g.title)}</h2>
        ${g.note ? `<small>${esc(g.note)}</small>` : ''}
      </header>
      ${g.fields.map((f) => fieldHtml(f, overrides[f.key])).join('')}
    </section>`;

  // One tab + one panel per page. Pages with no groups are skipped. The
  // Popup tab additionally gets the Visibility controls above its text fields.
  const pages = CONTENT_PAGES.filter((p) => CONTENT_GROUPS.some((g) => g.page === p.id));
  const tabsHtml = pages.map((p) =>
    `<button class="pagetab" type="button" role="tab" data-page-tab="${esc(p.id)}">${esc(p.label)}</button>`
  ).join('');
  const pagesHtml = pages.map((p) => `
    <div class="page" data-page="${esc(p.id)}" role="tabpanel">
      ${p.id === 'popup' ? popupVisHtml(popupCfg) + popupStyleHtml(popupCfg, hasPopupImage, adminVersion) : ''}
      ${CONTENT_GROUPS.filter((g) => g.page === p.id).map(groupHtml).join('')}
    </div>`).join('');

  const html = `<!doctype html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Content · Zahara admin</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="${ADMIN_FONTS_HREF}" />
  <style>${CHROME_CSS}${STYLE}</style>
</head>
<body>
  ${topbar('content', {
    titleSlot: `<div class="pagetabs" role="tablist" aria-label="Pages">${tabsHtml}</div>`,
  })}
  <main>
    <p class="lead fmt-hint">
      Edit any field and press <strong>Save changes</strong>. Clear a field to
      hide that text on the site. To style text, <strong>select it</strong> and
      use the <strong>B</strong> / <em>I</em> / <u>U</u> buttons above each field
      (or <code>Ctrl/⌘+B</code>, <code>I</code>, <code>U</code>); <strong>A−</strong>
      / <strong>A+</strong> make the whole field smaller or bigger, and
      <strong>↵</strong> adds a line break. Photo captions live in the
      <a href="/admin/images/">Images</a> tab.
    </p>
    ${pagesHtml}
  </main>
  <div class="savebar">
    <p class="savebar__status" id="status"></p>
    <button class="btn" type="button" id="save">Save changes</button>
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
