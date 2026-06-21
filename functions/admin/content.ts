// GET /admin/content — Cloudflare Access gated. A self-contained editor for the
// site's homepage + info-strip copy. Each field has HE + EN inputs,
// pre-filled with the saved override (blank → the built-in default is used
// on the live site). "Save changes" POSTs the whole map to
// /admin/content/save, which merges it into the single KV record the
// middleware injects into every page.

import type { PagesFunction } from '@cloudflare/workers-types';
import { checkAccess, unauthorized, type AuthEnv } from './auth';
import {
  CONTENT_GROUPS, readContent,
  type ContentEnv, type ContentMap, type ContentField,
} from '../data/content';

type Env = AuthEnv & ContentEnv;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

const STYLE = `
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; background: #faf7ee; color: #1a1410;
    font-family: 'Inter', system-ui, sans-serif; font-size: 14px; line-height: 1.55; }
  header.top { position: sticky; top: 0; z-index: 10;
    background: rgba(250,247,238,0.95); backdrop-filter: blur(8px);
    border-bottom: 1px solid #d8ccae; padding: 0.7rem 1.5rem; display: grid; gap: 0.55rem; }
  .top__nav { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .top__brand { font-size: 0.78rem; font-weight: 700; letter-spacing: 0.24em;
    text-transform: uppercase; color: #1a1410; text-decoration: none;
    padding-inline-end: 0.4rem; border-inline-end: 1px solid #d8ccae; margin-inline-end: 0.4rem; }
  .top__navlink { font-size: 0.78rem; letter-spacing: 0.18em; text-transform: uppercase;
    font-weight: 600; color: #6f6457; text-decoration: none; padding: 0.35rem 0.65rem;
    border: 1px solid transparent; transition: color .2s, border-color .2s, background .2s; }
  .top__navlink:hover { color: #1a1410; border-color: #d8ccae; }
  .top__navlink.is-active { color: #1a1410; background: #ece3d0; border-color: #d8ccae; pointer-events: none; }
  .top__spacer { flex: 1; }
  .top__site { font-size: 0.78rem; letter-spacing: 0.18em; text-transform: uppercase;
    color: #a88947; font-weight: 600; text-decoration: none; padding: 0.4rem 0.6rem; }
  .top__site:hover { text-decoration: underline; }
  .top__title { margin: 0; font-size: 0.85rem; font-weight: 700; letter-spacing: 0.22em;
    text-transform: uppercase; color: #6f6457; }
  main { max-width: 920px; margin: 0 auto; padding: 2rem 1.5rem 7rem; }
  .lead { color: #6f6457; max-width: 64ch; margin: 0 0 2rem; }
  .group { margin-block-end: 2.5rem; }
  .group__head { display: flex; align-items: baseline; justify-content: space-between;
    padding-block-end: 0.5rem; margin-block-end: 1.1rem; border-bottom: 1px solid #d8ccae; }
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
    padding: 0.5rem 0.6rem; border: 1px solid #d8ccae; background: #fff; color: #1a1410; border-radius: 0; }
  .col input:focus, .col textarea:focus { outline: 2px solid #a88947; outline-offset: 0; border-color: #a88947; }
  .col textarea { min-height: 2.4rem; resize: vertical; line-height: 1.5; }
  .col textarea.is-multi { min-height: 4.5rem; }
  .fmt-hint code { background: #f3eddc; border: 1px solid #e3d7b8; padding: 0.05rem 0.35rem; font-size: 0.8em; }
  .col [dir="rtl"] { direction: rtl; }
  .field__size { display: flex; align-items: center; gap: 0.5rem; margin-block-start: 0.4rem; }
  .field__size label { font-size: 0.72rem; letter-spacing: 0.1em; text-transform: uppercase;
    font-weight: 600; color: #9a8d77; }
  .field__size select { font: inherit; font-size: 0.8rem; padding: 0.3rem 0.5rem;
    border: 1px solid #d8ccae; background: #fff; color: #1a1410; border-radius: 0; }
  .field__size select:focus { outline: 2px solid #a88947; outline-offset: 0; border-color: #a88947; }
  .field__size select.is-set { border-color: #a88947; color: #6f5a2e; font-weight: 600; }
  .savebar { position: fixed; inset-block-end: 0; inset-inline: 0; z-index: 20;
    background: rgba(250,247,238,0.97); border-top: 1px solid #d8ccae;
    padding: 0.8rem 1.5rem; display: flex; align-items: center; gap: 1rem; justify-content: flex-end; }
  .savebar__status { margin-inline-end: auto; font-size: 0.8rem; color: #4f6b47; min-height: 1.2em; }
  .savebar__status--err { color: #a53623; }
  .btn { font: inherit; font-size: 0.74rem; letter-spacing: 0.16em; text-transform: uppercase;
    font-weight: 600; padding: 0.7rem 1.4rem; background: #1a1410; color: #faf7ee;
    border: 1px solid #1a1410; cursor: pointer; }
  .btn:hover { background: #a88947; border-color: #a88947; }
  .btn:disabled { opacity: 0.55; cursor: not-allowed; }
`;

const SCRIPT = `
  (function () {
    'use strict';
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
    saveBtn.addEventListener('click', async function () {
      saveBtn.disabled = true;
      setStatus('Saving…', false);
      try {
        var res = await fetch('/admin/content/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ map: collect() }),
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
    [0.9, 'Smaller'], [1, 'Default'], [1.15, 'Larger'], [1.3, 'Largest'], [1.5, 'Huge'],
  ];
  if (!presets.some(([n]) => n === curSize)) presets.push([curSize, `Custom (${curSize}×)`]);
  const sizeOpts = presets
    .map(([n, lbl]) => `<option value="${n}"${n === curSize ? ' selected' : ''}>${esc(lbl)}</option>`)
    .join('');
  const sizeSet = curSize !== 1 ? ' is-set' : '';

  return `
    <div class="field">
      <div class="field__label">${esc(f.label)}</div>
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

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return unauthorized();

  const overrides = await readContent(env);

  const groupsHtml = CONTENT_GROUPS.map((g) => `
    <section class="group">
      <header class="group__head">
        <h2>${esc(g.title)}</h2>
        ${g.note ? `<small>${esc(g.note)}</small>` : ''}
      </header>
      ${g.fields.map((f) => fieldHtml(f, overrides[f.key])).join('')}
    </section>`).join('');

  const html = `<!doctype html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Content · Zahara admin</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
  <style>${STYLE}</style>
</head>
<body>
  <header class="top">
    <nav class="top__nav" aria-label="Admin sections">
      <a class="top__brand" href="/admin/">Zahara · Admin</a>
      <a class="top__navlink"           href="/admin/">Menu editor</a>
      <a class="top__navlink"           href="/admin/images/">Images</a>
      <a class="top__navlink is-active" href="/admin/content/" aria-current="page">Content</a>
      <a class="top__navlink"           href="/admin/colors/">Colors</a>
      <span class="top__spacer"></span>
      <a class="top__site" href="/" target="_blank">View site ↗</a>
    </nav>
    <h1 class="top__title">Site text</h1>
  </header>
  <main>
    <p class="lead fmt-hint">
      Edit any field and press <strong>Save changes</strong>. Clear a field to
      hide that text on the site. Formatting works in <strong>every</strong> field:
      type <code>**bold**</code> for bold, <code>*italic*</code> for italic, and
      press <strong>Enter</strong> for a line break. Photo captions live in the
      <a href="/admin/images/">Images</a> tab.
    </p>
    ${groupsHtml}
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
