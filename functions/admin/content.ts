// GET /admin/content — Basic-auth gated. A self-contained editor for the
// site's homepage + info-strip copy. Each field has HE + EN inputs,
// pre-filled with the saved override (blank → the built-in default is used
// on the live site). "Save changes" POSTs the whole map to
// /admin/content/save, which merges it into the single KV record the
// middleware injects into every page.

import type { PagesFunction } from '@cloudflare/workers-types';
import { checkAuth, unauthorized, type AuthEnv } from './auth';
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
  .col textarea { min-height: 4.5rem; resize: vertical; line-height: 1.5; }
  .col [dir="rtl"] { direction: rtl; }
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
      return map;
    }
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
  const tag = f.html ? '<span class="field__tag">HTML</span>' : '';
  // Placeholder = the built-in default, so a cleared (hidden) field still
  // shows what the default was — retype it to restore, leave blank to hide.
  const phHe = esc(f.he ?? '');
  const phEn = esc(f.en ?? '');
  const input = (lang: 'he' | 'en', val: string, dir: string, ph: string) => f.multiline
    ? `<textarea data-key="${esc(f.key)}" data-lang="${lang}" dir="${dir}" placeholder="${ph}">${val}</textarea>`
    : `<input type="text" data-key="${esc(f.key)}" data-lang="${lang}" dir="${dir}" value="${val}" placeholder="${ph}" />`;
  return `
    <div class="field">
      <div class="field__label">${esc(f.label)} ${tag}</div>
      <div class="pair">
        <div class="col"><span class="col__lang">Hebrew</span>${input('he', he, 'rtl', phHe)}</div>
        <div class="col"><span class="col__lang">English</span>${input('en', en, 'ltr', phEn)}</div>
      </div>
    </div>`;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!checkAuth(request, env)) return unauthorized();

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
    <p class="lead">
      Every field shows the <strong>current</strong> live text — edit any of
      them and press <strong>Save changes</strong>. <strong>Clear a field and
      save to HIDE that text</strong> on the site; the faded placeholder keeps
      showing the original wording, so retype it to bring the text back.
      Fields tagged <strong>HTML</strong> accept simple inline markup —
      <code>&lt;br&gt;</code>, <code>&lt;em&gt;</code>, <code>&lt;strong&gt;</code>.
      Gallery photo captions are edited per photo in the
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
