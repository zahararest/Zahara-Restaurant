// GET /admin/content — Cloudflare Access gated. The site's copy desk.
//
// Everything the owner can rewrite in words lives here: the home page, the
// About / Events / Menu / Privacy / Accessibility headers, and the entry
// popup. The page is self-contained (inline CSS + JS, no build step).
//
// How it's built:
//   • One PANEL per site page, chosen from the rail on the left. Every panel
//     stays in the DOM, so switching never loses an unsaved edit and Save
//     always sends the whole map.
//   • Each field is edited TWICE — once in Hebrew, once in English — in its
//     own column, each with its own formatting bar. The two languages are
//     independent: size, alignment and the section dash are stored per
//     language (heStyle / enStyle), because a size that fits the Hebrew
//     headline rarely fits the English one.
//   • Each editor box is TYPESET LIKE THE SITE: the field's role (eyebrow,
//     hero, display, lede, body, button…) picks the real face, size, tracking
//     and colour, copy that sits over photography is previewed on a dark
//     plate, and the size/alignment/dash controls change the box in place. So
//     what the owner sees while typing is what the page will show.
//   • Search finds any field by its words across every page; "Edited only"
//     narrows to what's been changed; every field can be put back to the
//     original text and styling with one button.
//
// Saving POSTs the whole map to /admin/content/save, which diffs each value
// against the built-in default and stores only real overrides.

import type { PagesFunction, R2Bucket } from '@cloudflare/workers-types';
import { checkAccess, unauthorized, type AuthEnv } from './auth';
import { CHROME_CSS, adminHead, topbar } from './chrome';
import {
  CONTENT_GROUPS, CONTENT_PAGES, readContentForEditor, defaultTokens, defaultAlignFor, styleFor,
  readPopupConfigOwn, popupActive, POPUP_IMAGE_OBJECT, EVENTS_MENU_OBJECT, type PopupConfig,
  type ContentEnv, type ContentMap, type ContentField, type ContentGroup,
  type ContentAlign, type FieldRole, type PageId,
} from '../data/content';
import { readPalette } from '../data/palette';
import { PHOTO_CATALOGUE } from '../data/photos-map';
import { adminSite, siteScope, type Site } from '../data/site';

interface Env extends AuthEnv, ContentEnv { IMAGES?: R2Bucket; }

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

// Server-side twin of the live site's formatRich (src/layouts/BaseLayout.astro):
// turns the stored tokens (**bold**, *italic*, __underline__, newlines) plus a
// tiny raw-tag whitelist into safe HTML. Used to pre-fill the editors so the
// owner sees each field rendered EXACTLY as the site shows it. Keep the two in
// sync. (The editor serialises back to the same tokens on save.)
function renderRich(s: string): string {
  let h = String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  h = h.replace(/&lt;(\/?)(br|strong|em|b|i|u)\s*\/?&gt;/gi, (_m, sl, tg) => `<${sl}${tg.toLowerCase()}>`);
  h = h.replace(/\*\*(\S(?:[^*\n]*\S)?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(^|[^*])\*(\S(?:[^*\n]*\S)?)\*(?!\*)/g, '$1<em>$2</em>');
  h = h.replace(/__(\S(?:[^_\n]*\S)?)__/g, '<u>$1</u>');
  return h.replace(/\r?\n/g, '<br>');
}

/** Plain text of a value, for the search index. */
function plain(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/[*_]/g, '').replace(/\s+/g, ' ').trim();
}

// ── Field roles ─────────────────────────────────────────────────────────────
// Which controls a role gets, and how it reads in the field's subtitle.
const ROLE_NOTE: Record<FieldRole, string> = {
  eyebrow:    'Small tracked kicker',
  hero:       'Hero headline',
  heroMark:   'Hero headline — italic line',
  display:    'Section heading',
  title:      'Heading',
  lede:       'Intro paragraph',
  body:       'Paragraph',
  button:     'Button label',
  link:       'Small link',
  label:      'Label',
  value:      'Value',
  note:       'Small print',
  popupTitle: 'Popup title',
  popupBody:  'Popup text',
};
/** Roles whose copy is a block of text worth aligning. */
const ALIGNABLE = new Set<FieldRole>([
  'eyebrow', 'hero', 'heroMark', 'display', 'title', 'lede', 'body', 'note',
  'popupTitle', 'popupBody',
]);
/** Roles where a "section dash" above the copy makes sense (headings only). */
const DASHABLE = new Set<FieldRole>(['hero', 'heroMark', 'display', 'title', 'popupTitle']);

const STYLE = String.raw`
  /* ── The site's own faces, so every preview box is typeset for real ── */
  @font-face { font-family:'AlenbiSerif'; font-style:normal; font-weight:400; font-display:swap;
    src:url('/fonts/AlenbiSerifRegular_web/AlenbiSerif-Regular.woff2') format('woff2'); }
  @font-face { font-family:'AlenbiSerif'; font-style:normal; font-weight:700; font-display:swap;
    src:url('/fonts/AlenbiSerifBold_web/AlenbiSerif-Bold.woff2') format('woff2'); }

  html, body { height: 100%; }
  body { font-size: .92rem; }
  main { display: block; }

  /* ══ Workbench: rail + work area ══════════════════════════════════════ */
  .wb { display: grid; grid-template-columns: 232px minmax(0, 1fr); align-items: start; }
  .rail {
    position: sticky; top: var(--topbar-h, 88px);
    height: calc(100vh - var(--topbar-h, 88px));
    overflow-y: auto; overscroll-behavior: contain;
    background: var(--deep); border-inline-end: 1px solid var(--line-soft);
    padding: 1.4rem 0 2.5rem;
  }
  .rail__cap {
    margin: 0 0 .5rem; padding: 0 1.4rem;
    font-size: .6rem; letter-spacing: .26em; text-transform: uppercase;
    font-weight: 700; color: var(--muted);
  }
  .rail__cap + .rail__cap, .rail__nav + .rail__cap { margin-block-start: 1.8rem; }
  .rail__item {
    display: flex; align-items: center; gap: .5rem; width: 100%;
    padding: .6rem 1.4rem; border: 0; background: none; cursor: pointer;
    font: inherit; font-size: .85rem; color: var(--soft); text-align: start;
    border-inline-start: 2px solid transparent;
    transition: color .15s, background .15s, border-color .15s;
  }
  .rail__item:hover { color: var(--ink); background: rgba(255,255,255,.4); }
  .rail__item.is-active {
    color: var(--ink); font-weight: 600;
    background: var(--paper); border-inline-start-color: var(--accent);
  }
  .rail__name { flex: 1; }
  .rail__count {
    font-size: .66rem; font-weight: 700; letter-spacing: .04em;
    color: var(--accent); background: var(--accent-soft);
    padding: .05rem .38rem; border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
  }
  .rail__count[hidden] { display: none; }
  .rail__jump { display: grid; }
  .rail__jumplink {
    display: block; padding: .34rem 1.4rem .34rem 1.9rem;
    font: inherit; font-size: .78rem; color: var(--muted); background: none; border: 0;
    text-align: start; cursor: pointer; transition: color .15s;
  }
  .rail__jumplink:hover { color: var(--ink); }
  .rail__foot { margin: 1.6rem 1.4rem 0; font-size: .72rem; line-height: 1.6; color: var(--muted); }

  /* ══ Work area ════════════════════════════════════════════════════════ */
  .work { min-width: 0; padding-block-end: 6rem; }
  /* Fully opaque — a translucent bar let the fields scroll through it and
     read as a smear of overlapping text. */
  .tools {
    position: sticky; top: var(--topbar-h, 88px); z-index: 20;
    display: flex; align-items: center; gap: .6rem; flex-wrap: wrap;
    padding: .7rem clamp(1rem, 3vw, 2rem);
    background: var(--paper); border-bottom: 1px solid var(--line);
    box-shadow: 0 6px 12px -12px rgba(26,20,16,.55);
  }
  .search { position: relative; flex: 1 1 15rem; min-width: 12rem; max-width: 26rem; }
  .search input {
    width: 100%; font: inherit; font-size: .85rem;
    padding: .48rem .7rem .48rem 2rem; border: 1px solid var(--line);
    background: #fff; color: var(--ink); border-radius: 0;
  }
  .search input:focus { outline: 2px solid var(--accent); outline-offset: 0; border-color: var(--accent); }
  .search svg { position: absolute; inset-inline-start: .6rem; inset-block-start: 50%;
    transform: translateY(-50%); color: var(--muted); pointer-events: none; }
  .seg { display: inline-flex; border: 1px solid var(--line); background: #fff; }
  .seg__btn {
    font: inherit; font-size: .76rem; font-weight: 600; letter-spacing: .04em;
    padding: .45rem .8rem; background: transparent; color: var(--muted);
    border: 0; border-inline-end: 1px solid var(--line-soft); cursor: pointer;
    transition: background .15s, color .15s;
  }
  .seg__btn:last-child { border-inline-end: 0; }
  .seg__btn:hover { color: var(--ink); }
  .seg__btn.is-active { background: var(--ink); color: var(--paper); }
  .chip {
    font: inherit; font-size: .76rem; font-weight: 600; letter-spacing: .04em;
    padding: .45rem .8rem; background: #fff; color: var(--muted);
    border: 1px solid var(--line); cursor: pointer; transition: background .15s, color .15s;
  }
  .chip:hover { color: var(--ink); }
  .chip.is-on { background: var(--ink); color: var(--paper); border-color: var(--ink); }
  .tools__spacer { flex: 1; }
  .tools__view {
    font-size: .74rem; letter-spacing: .14em; text-transform: uppercase;
    font-weight: 600; color: var(--accent); padding: .4rem .2rem;
  }
  .tools__view:hover { text-decoration: underline; }

  .panels { padding: 1.6rem clamp(1rem, 3vw, 2rem) 0; max-width: 1180px; }
  .panel { display: none; }
  .panel.is-active { display: block; }
  .wb.is-searching .panel { display: block; }
  .panel__head { margin-block-end: 1.8rem; }
  .panel__title {
    font-family: 'Frank Ruhl Libre', serif; font-size: 1.75rem; font-weight: 500;
    margin: 0 0 .25rem; letter-spacing: -.01em;
  }
  .panel__note { margin: 0; color: var(--muted); font-size: .85rem; max-width: 62ch; }
  /* While filtering, the panel's own header and its upload/visibility tools
     step aside — the result list is the whole point of the view. */
  .wb.is-searching .panel__head, .wb.is-searching .panel__tools,
  .wb.is-filtered .panel__tools { display: none; }
  .empty { padding: 3rem 0; color: var(--muted); font-size: .9rem; }

  /* ── Group ── */
  .grp { margin-block-end: 2.6rem; scroll-margin-top: calc(var(--topbar-h, 88px) + 4rem); }
  .grp__head {
    display: flex; align-items: baseline; gap: .8rem; flex-wrap: wrap;
    padding-block-end: .5rem; margin-block-end: 1.1rem;
    border-bottom: 1px solid var(--line);
  }
  .grp__title {
    margin: 0; font-size: .8rem; font-weight: 700;
    letter-spacing: .18em; text-transform: uppercase;
  }
  .grp__note { margin: 0; font-size: .78rem; color: var(--muted); }
  .grp.is-hidden, .fld.is-hidden, .panel.is-hidden { display: none; }

  /* ── Field ── */
  .fld {
    border: 1px solid var(--line-soft); background: var(--card);
    margin-block-end: .9rem;
  }
  .fld.is-dirty { border-color: var(--accent); }
  .fld__head {
    display: flex; align-items: baseline; gap: .75rem; flex-wrap: wrap;
    padding: .7rem .85rem; border-bottom: 1px solid var(--line-soft);
  }
  .fld__name { margin: 0; font-size: .88rem; font-weight: 600; }
  .fld__role {
    font-size: .62rem; letter-spacing: .14em; text-transform: uppercase;
    font-weight: 600; color: var(--muted);
  }
  .fld__hint { margin: 0; font-size: .78rem; color: var(--muted); }
  .fld__crumb { display: none; margin: 0; font-size: .72rem; color: var(--accent); font-weight: 600; }
  .wb.is-searching .fld__crumb { display: block; }
  .fld__meta { margin-inline-start: auto; display: flex; align-items: center; gap: .5rem; }
  .tag {
    font-size: .62rem; letter-spacing: .12em; text-transform: uppercase; font-weight: 700;
    padding: .1rem .4rem; border: 1px solid var(--line);
    color: var(--muted); background: var(--deep);
  }
  .tag--dirty { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 35%, transparent);
    background: var(--accent-soft); }
  .tag[hidden] { display: none; }
  .mini {
    font: inherit; font-size: .72rem; font-weight: 600; letter-spacing: .04em;
    padding: .28rem .55rem; background: transparent; color: var(--muted);
    border: 1px solid var(--line); cursor: pointer;
    transition: color .15s, border-color .15s, background .15s;
  }
  .mini:hover:not(:disabled) { color: var(--accent); border-color: var(--accent); background: #fff; }
  .mini:disabled { opacity: .4; cursor: default; }

  .fld__cols { display: grid; grid-template-columns: 1fr 1fr; }
  .col { display: grid; align-content: start; min-width: 0; }
  .col + .col { border-inline-start: 1px solid var(--line); }
  .wb.is-he .col[data-col="en"], .wb.is-en .col[data-col="he"] { display: none; }
  .wb.is-he .col[data-col="he"], .wb.is-en .col[data-col="en"] { border-inline-start: 0; }
  .wb.is-he .fld__cols, .wb.is-en .fld__cols { grid-template-columns: 1fr; }
  @media (max-width: 900px) { .fld__cols { grid-template-columns: 1fr; }
    .col + .col { border-inline-start: 0; border-block-start: 1px solid var(--line); } }

  .col__bar {
    display: flex; align-items: center; gap: .5rem; flex-wrap: wrap;
    padding: .5rem .6rem; background: var(--deep);
    border-bottom: 1px solid var(--line-soft);
  }
  .col__lang {
    font-size: .66rem; letter-spacing: .18em; text-transform: uppercase;
    font-weight: 700; color: var(--muted);
  }
  .fmt { display: flex; align-items: center; gap: .2rem; flex-wrap: wrap; margin-inline-start: auto; }
  .fb {
    font: inherit; font-size: .76rem; line-height: 1; min-width: 1.75rem;
    padding: .3rem .4rem; border: 1px solid var(--line); background: #fff; color: var(--soft);
    cursor: pointer; transition: background .12s, color .12s, border-color .12s;
  }
  .fb:hover { color: var(--accent); border-color: var(--accent); }
  .fb.is-on { background: var(--ink); color: var(--paper); border-color: var(--ink); }
  .fb--b { font-weight: 800; }
  .fb--i { font-style: italic; font-family: Georgia, serif; }
  .fb--u { text-decoration: underline; }
  .fb--size { min-width: 3.1rem; font-variant-numeric: tabular-nums; font-size: .72rem; font-weight: 600; }
  .fb--size.is-set { color: var(--accent); border-color: var(--accent); font-weight: 700; }
  .fb--icon { display: inline-grid; place-items: center; padding: .3rem .35rem; }
  .fb--icon svg { display: block; }
  .fmt__sep { width: 1px; align-self: stretch; background: var(--line-soft); margin-inline: .18rem; }

  /* ── The preview stage: paper by default, a dark plate for copy that sits
        over photography, so the box reads like its place on the site. ── */
  .stage {
    --s-paper:#F0E8D2; --s-paper-card:#F7F0DB; --s-on-photo:#F4ECCF;
    --s-ink:#1A1410; --s-ink-soft:#3D362E; --s-ink-muted:#6F5E48;
    --s-accent:#A88947; --s-rule:#CFC3A4;
    --pv-ink: var(--s-ink); --pv-soft: var(--s-ink-soft);
    --pv-muted: var(--s-ink-muted); --pv-accent: var(--s-accent);
    padding: 1rem .95rem; background: var(--s-paper); min-width: 0;
  }
  /* The popup sits on its own paper card, a shade lighter than the page. */
  .stage--card { background: var(--s-paper-card); }
  /* Copy that lives over photography, previewed on a dark plate. */
  .stage--photo {
    background:
      radial-gradient(120% 100% at 20% 0%, rgba(120,96,60,.35), transparent 60%),
      linear-gradient(170deg, #2A2118, #14100B);
    --pv-ink: var(--s-on-photo); --pv-soft: var(--s-on-photo);
    --pv-muted: color-mix(in srgb, var(--s-on-photo) 78%, transparent);
    --pv-accent: var(--s-on-photo);
  }

  .pv {
    font-family: 'AlenbiSerif', Georgia, serif;
    color: var(--pv-ink);
    font-size: calc(var(--pv-base, 1rem) * var(--pv-scale, 1));
    line-height: 1.6; min-height: 1.6em; outline: 0;
    overflow-wrap: anywhere; cursor: text;
  }
  .pv:focus-visible, .pv:focus { outline: 2px solid var(--accent); outline-offset: 4px; }
  .pv.is-empty::after {
    content: attr(data-ph); color: var(--pv-muted); opacity: .55; font-style: italic;
  }
  .pv b, .pv strong { font-weight: 700; }
  .pv i, .pv em { font-style: italic; }
  .pv u { text-decoration: underline; }
  /* Owner-toggled section dash, exactly as base.css draws it on the site. */
  .pv.has-dash::before {
    content: ''; display: block; inline-size: 2.25rem; block-size: 2px;
    background: var(--pv-accent); margin-block-end: .7rem;
  }
  .pv.has-dash[style*="center"]::before { margin-inline: auto; }

  .pv--eyebrow { --pv-base: .78rem; letter-spacing: .3em; text-transform: uppercase;
    font-weight: 500; color: var(--pv-muted); line-height: 1.7; }
  .pv--eyebrow::before { content: ''; display: inline-block; inline-size: 1.6rem;
    block-size: 1px; background: var(--pv-accent); vertical-align: middle; margin-inline-end: .75rem; }
  .pv--eyebrow.has-dash::before { display: block; inline-size: 2.25rem; block-size: 2px; margin: 0 0 .7rem; }
  .pv--hero      { --pv-base: 2.5rem;  font-weight: 700; line-height: 1.04; letter-spacing: -.018em; }
  .pv--heroMark  { --pv-base: 2.5rem;  font-weight: 400; line-height: 1.04; font-style: italic; opacity: .92; }
  .pv--display   { --pv-base: 1.85rem; font-weight: 700; line-height: 1.08; letter-spacing: -.018em; }
  .pv--title     { --pv-base: 1.35rem; font-weight: 700; line-height: 1.15; letter-spacing: -.01em; }
  .pv--lede      { --pv-base: 1.1rem;  line-height: 1.6; color: var(--pv-soft); }
  .pv--body      { --pv-base: .98rem;  line-height: 1.75; color: var(--pv-soft); }
  .pv--note      { --pv-base: .8rem;   color: var(--pv-muted); }
  .pv--label     { --pv-base: .68rem;  letter-spacing: .28em; text-transform: uppercase;
    font-weight: 500; color: var(--pv-muted); }
  .pv--value     { --pv-base: 1.05rem; line-height: 1.35; }
  .pv--link      { --pv-base: .72rem;  letter-spacing: .18em; text-transform: uppercase;
    font-weight: 600; color: var(--pv-accent); }
  .pv--button {
    --pv-base: .74rem; letter-spacing: .24em; text-transform: uppercase; font-weight: 600;
    border: 1px solid var(--pv-ink); padding: .7rem 1.1rem; width: fit-content;
    min-width: 9rem; text-align: center; line-height: 1.3;
  }
  .pv--popupTitle { --pv-base: 1.5rem; font-weight: 700; line-height: 1.15; }
  .pv--popupBody  { --pv-base: .98rem; line-height: 1.7; color: var(--pv-soft); }

  .col__foot {
    display: flex; align-items: center; gap: .5rem; flex-wrap: wrap;
    padding: .45rem .6rem; border-top: 1px solid var(--line-soft); background: var(--card);
  }
  .col__state { font-size: .72rem; color: var(--muted); margin-inline-end: auto; }
  .col__state--hidden { color: var(--err); font-weight: 600; }
  .col__state--edited { color: var(--accent); font-weight: 600; }
  /* Marks a field whose "original" is the owner's own pinned copy. */
  .pin {
    font: inherit; font-size: .66rem; letter-spacing: .1em; text-transform: uppercase;
    font-weight: 700; padding: .2rem .45rem; cursor: pointer;
    color: var(--accent); background: var(--accent-soft);
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  }
  .pin:hover { background: var(--accent); color: var(--paper); }
  .pin[hidden] { display: none; }

  /* ── Retired fields (kept, but not on the page any more) ── */
  .retired { border: 1px dashed var(--line); background: var(--deep); padding: .7rem .9rem;
    margin-block-end: 2.6rem; }
  .retired.is-hidden { display: none; }
  .retired > summary { cursor: pointer; font-size: .78rem; font-weight: 600; color: var(--muted); }
  .retired > summary::marker { color: var(--muted); }
  .retired__note { margin: .6rem 0 1rem; font-size: .78rem; color: var(--muted); max-width: 68ch; }

  /* ══ Panels for the popup + events tools ══════════════════════════════ */
  .card { border: 1px solid var(--line-soft); background: var(--card); padding: 1.1rem 1.1rem 1.2rem;
    margin-block-end: 1.4rem; }
  .card__title { margin: 0 0 .2rem; font-size: .8rem; font-weight: 700;
    letter-spacing: .18em; text-transform: uppercase; }
  .card__note { margin: 0 0 1rem; font-size: .8rem; color: var(--muted); }
  .status {
    margin: 0; font-size: .82rem; color: var(--soft);
    padding: .5rem .7rem; background: var(--deep); border-inline-start: 3px solid var(--line);
  }
  .status--on { border-inline-start-color: var(--ok); color: var(--ok); }
  .row { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
  .row + .row { margin-block-start: .8rem; }
  .row__hint { font-size: .78rem; color: var(--muted); }
  /* On/off switch */
  .switch { display: inline-flex; align-items: center; gap: .6rem; cursor: pointer; font-weight: 600; }
  .switch input { position: absolute; opacity: 0; width: 0; height: 0; }
  .switch__track { inline-size: 2.6rem; block-size: 1.4rem; background: var(--edge);
    border: 1px solid var(--line); position: relative; transition: background .18s; flex: none; }
  .switch__track::after { content: ''; position: absolute; inset-block-start: 2px; inset-inline-start: 2px;
    inline-size: 1rem; block-size: 1rem; background: #fff; transition: transform .18s; }
  .switch input:checked + .switch__track { background: var(--ok); border-color: var(--ok); }
  .switch input:checked + .switch__track::after { transform: translateX(1.2rem); }
  html[dir="rtl"] .switch input:checked + .switch__track::after { transform: translateX(-1.2rem); }
  .switch input:focus-visible + .switch__track { outline: 2px solid var(--accent); outline-offset: 2px; }
  .num { font: inherit; font-size: .85rem; inline-size: 4.2rem; text-align: center;
    padding: .35rem .4rem; border: 1px solid var(--line); background: #fff; color: var(--ink); }
  .num:focus { outline: 2px solid var(--accent); outline-offset: 0; border-color: var(--accent); }
  /* When the popup should hide itself — a date + time, in Israel time. */
  .when { font: inherit; font-size: .85rem; padding: .35rem .5rem;
    border: 1px solid var(--line); background: #fff; color: var(--ink); }
  .when:focus { outline: 2px solid var(--accent); outline-offset: 0; border-color: var(--accent); }
  /* The words card, hidden while the popup style is the photo alone. Separate
     from .is-hidden so the search/“changed only” filters keep working. */
  .grp.is-mode-off { display: none; }

  .modes { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: .6rem; }
  .mode {
    display: grid; gap: .3rem; text-align: start; padding: .7rem .8rem; cursor: pointer;
    background: #fff; border: 1px solid var(--line); font: inherit;
    transition: border-color .15s, background .15s;
  }
  .mode:hover { border-color: var(--accent); }
  .mode.is-active { background: var(--ink); border-color: var(--ink); color: var(--paper); }
  .mode__name { font-size: .82rem; font-weight: 700; }
  .mode__note { font-size: .74rem; opacity: .78; line-height: 1.45; }

  .photo { display: grid; gap: .8rem; margin-block-start: 1.2rem; }
  .photo.is-hidden, .picker.is-hidden, .need.is-hidden { display: none; }
  .photo__row { display: flex; gap: .9rem; align-items: flex-start; flex-wrap: wrap; }
  .photo__thumb { inline-size: 190px; max-inline-size: 100%; aspect-ratio: 4/3; object-fit: contain;
    background: var(--deep); border: 1px solid var(--line); display: block; }
  .photo__thumb.is-empty { display: grid; place-items: center; color: var(--muted);
    font-size: .78rem; text-align: center; padding: .5rem; }
  .photo__actions { display: grid; gap: .45rem; align-content: start; }
  .photo__file, .pdf__file { display: none; }
  .need { margin: 0; font-size: .8rem; color: var(--accent-d);
    padding: .5rem .65rem; background: var(--accent-soft); border-inline-start: 3px solid var(--accent); }
  .picker { border: 1px solid var(--line-soft); background: var(--paper); padding: .7rem; }
  .picker__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: .5rem; }
  .picker__item { padding: 0; border: 1px solid var(--line); background: #fff; cursor: pointer;
    display: block; transition: border-color .15s; }
  .picker__item:hover { border-color: var(--accent); }
  .picker__item:disabled { opacity: .5; cursor: not-allowed; }
  .picker__item img { inline-size: 100%; aspect-ratio: 4/3; object-fit: cover; display: block; background: var(--deep); }
  .picker__item span { display: block; font-size: .62rem; color: var(--muted); padding: .2rem .3rem;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .minor { margin: .5rem 0 0; min-height: 1.1em; font-size: .78rem; color: var(--ok); }
  .minor--err { color: var(--err); }
  .pdf__link { color: var(--accent); font-weight: 600; border-bottom: 1px solid var(--accent); }
  .pdf__link:hover { color: var(--accent-d); }

  /* ══ Buttons + save bar ═══════════════════════════════════════════════ */
  .btn {
    font: inherit; font-size: .74rem; letter-spacing: .16em; text-transform: uppercase;
    font-weight: 600; padding: .65rem 1.3rem; background: var(--ink); color: var(--paper);
    border: 1px solid var(--ink); cursor: pointer; transition: background .15s, border-color .15s;
  }
  .btn:hover:not(:disabled) { background: var(--accent); border-color: var(--accent); }
  .btn:disabled { opacity: .5; cursor: not-allowed; }
  .btn--ghost { background: transparent; color: var(--ink); }
  .btn--ghost:hover:not(:disabled) { background: var(--ink); color: var(--paper); border-color: var(--ink); }
  .savebar {
    position: fixed; inset-block-end: 0; inset-inline: 0; z-index: 40;
    display: flex; align-items: center; gap: 1rem;
    padding: .7rem clamp(1rem, 3vw, 2rem);
    background: var(--card); border-top: 1px solid var(--line);
    box-shadow: 0 -6px 14px -12px rgba(26,20,16,.5);
  }
  .savebar__count { font-size: .82rem; font-weight: 600; color: var(--muted); }
  .savebar__count.is-dirty { color: var(--accent); }
  .savebar__msg { font-size: .82rem; color: var(--ok); margin-inline-start: auto; }
  .savebar__msg--err { color: var(--err); }
  .savebar__actions { display: flex; gap: .5rem; margin-inline-start: auto; }
  .savebar__msg + .savebar__actions { margin-inline-start: .5rem; }

  @media (max-width: 780px) {
    .wb { grid-template-columns: 1fr; }
    .rail { position: static; height: auto; display: flex; gap: .3rem; overflow-x: auto;
      padding: .55rem .8rem; border-inline-end: 0; border-bottom: 1px solid var(--line-soft); }
    .rail__cap, .rail__jump, .rail__foot { display: none; }
    .rail__nav { display: flex; gap: .3rem; }
    .rail__item { inline-size: auto; white-space: nowrap; border-inline-start: 0;
      border: 1px solid var(--line); padding: .4rem .7rem; }
    .rail__item.is-active { border-color: var(--ink); }
    .tools { top: 0; }
  }
`;

const SCRIPT = String.raw`
(function () {
  'use strict';

  var wb       = document.getElementById('wb');
  var saveBtn  = document.getElementById('save');
  var msgEl    = document.getElementById('savemsg');
  var countEl  = document.getElementById('savecount');
  var DEFAULTS = window.ZAHARA_CONTENT_DEFAULTS || {};
  var SIZE_MIN = 0.6, SIZE_MAX = 2.5, SIZE_STEP = 0.05;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // ── Serialising a preview box back to the site's stored tokens ──────────
  // execCommand runs with styleWithCSS OFF, so bold/italic/underline arrive as
  // <b>/<i>/<u> (or <strong>/<em>); inline styles are honoured as a fallback.
  // Whitespace at the EDGES of a formatted run is moved OUTSIDE the markers
  // (so we emit "**word** " not "**word **") — the live formatter only renders
  // **x** when x has no edge spaces.
  function serializeRich(root) {
    function wrap(inner, bold, ital, und) {
      if (!bold && !ital && !und) return inner;
      var m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/);
      var lead = m[1], core = m[2], trail = m[3];
      if (core === '') return inner;
      var open  = (bold ? '**' : '') + (ital ? '*' : '') + (und ? '__' : '');
      var close = (und ? '__' : '') + (ital ? '*' : '') + (bold ? '**' : '');
      return lead + open + core + close + trail;
    }
    function walk(node) {
      var s = '';
      for (var i = 0; i < node.childNodes.length; i++) {
        var n = node.childNodes[i];
        if (n.nodeType === 3) { s += n.nodeValue.replace(/\u00a0/g, ' '); continue; }
        if (n.nodeType !== 1) continue;
        var tag = n.tagName.toLowerCase();
        if (tag === 'br') { s += '\n'; continue; }
        if (tag === 'div' || tag === 'p') {
          if (s && s.charAt(s.length - 1) !== '\n') s += '\n';
          s += walk(n);
          continue;
        }
        var st = n.style || {};
        var fw = st.fontWeight || '';
        var bold = tag === 'b' || tag === 'strong' || fw === 'bold' || parseInt(fw, 10) >= 600;
        var ital = tag === 'i' || tag === 'em' || st.fontStyle === 'italic';
        var deco = (st.textDecoration || '') + ' ' + (st.textDecorationLine || '');
        var und  = tag === 'u' || deco.indexOf('underline') !== -1;
        s += wrap(walk(n), bold, ital, und);
      }
      return s;
    }
    return walk(root).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
                     .replace(/^\s+|\s+$/g, '');
  }

  // ── Field state ────────────────────────────────────────────────────────
  function colOf(fld, lang) { return fld.querySelector('[data-col="' + lang + '"]'); }
  function styleOf(col) {
    return {
      size:  parseFloat(col.getAttribute('data-size')) || 1,
      align: col.getAttribute('data-align') || 'start',
      dash:  col.getAttribute('data-dash') === '1'
    };
  }

  // The owner's own "original" per field+language, pinned with "Set as
  // original". BASES[key][lang] === null means "use the built-in copy".
  var BASES = {};
  fields_init();
  function fields_init() {
    for (var key in DEFAULTS) {
      if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) continue;
      BASES[key] = { he: DEFAULTS[key].heBase || null, en: DEFAULTS[key].enBase || null };
    }
  }
  /** What this language goes back to: the pinned original, else what the
   *  page ships with. */
  function originalOf(fld, lang) {
    var key = fld.getAttribute('data-key');
    var def = DEFAULTS[key] || {};
    var own = (BASES[key] || {})[lang];
    if (own) {
      return {
        text:  own.text || '',
        size:  own.size || 1,
        align: own.align || def.align || 'start',
        dash:  own.dash === true,
        pinned: true
      };
    }
    return { text: def[lang] || '', size: 1, align: def.align || 'start', dash: false, pinned: false };
  }

  function entryOf(fld) {
    var out = {};
    var key = fld.getAttribute('data-key');
    ['he', 'en'].forEach(function (lang) {
      var col = colOf(fld, lang);
      out[lang] = serializeRich($('.pv', col));
      out[lang === 'he' ? 'heStyle' : 'enStyle'] = styleOf(col);
      out[lang === 'he' ? 'heBase'  : 'enBase' ] = (BASES[key] || {})[lang] || null;
    });
    return out;
  }
  function sigOf(fld) { return JSON.stringify(entryOf(fld)); }

  var fields   = $$('[data-field]');
  var baseline = {};                      // key → signature at last save
  fields.forEach(function (f) { baseline[f.getAttribute('data-key')] = sigOf(f); });

  /** Has this language been changed away from the original it goes back to? */
  function isEdited(fld, lang) {
    var col = colOf(fld, lang);
    var st  = styleOf(col);
    var og  = originalOf(fld, lang);
    if (serializeRich($('.pv', col)) !== og.text) return true;
    return st.size !== og.size || st.dash !== og.dash || st.align !== og.align;
  }

  // ── Painting one field's badges + the page/save counters ───────────────
  function paintField(fld) {
    var dirty = sigOf(fld) !== baseline[fld.getAttribute('data-key')];
    fld.classList.toggle('is-dirty', dirty);
    $('[data-tag-dirty]', fld).hidden = !dirty;

    var edited = false;
    ['he', 'en'].forEach(function (lang) {
      var col   = colOf(fld, lang);
      var state = $('[data-state]', col);
      var og    = originalOf(fld, lang);
      var ed    = isEdited(fld, lang);
      var empty = serializeRich($('.pv', col)) === '';
      edited = edited || ed;

      // Three honest states: nothing here at all, deliberately hidden, or
      // changed. An empty box whose original is ALSO empty isn't "hidden" —
      // there was never anything to hide.
      var blank  = empty && og.text === '';
      var hidden = empty && og.text !== '';
      state.className = 'col__state' + (hidden ? ' col__state--hidden' : ed ? ' col__state--edited' : '');
      state.textContent = hidden ? 'Hidden on the site'
                        : blank  ? 'Nothing here — the site shows nothing'
                        : ed     ? 'Changed from the original' : '';

      $('[data-reset-lang]', col).disabled = !ed;
      // Nothing to hide when the box is already empty.
      $('[data-hide-lang]', col).disabled = empty;
      // Nothing to pin while the box already matches its original.
      $('[data-set-base]', col).disabled = !ed;
      $('[data-set-base]', col).textContent = og.pinned ? 'Update original' : 'Set as original';
      $('[data-clear-base]', col).hidden = !og.pinned;
    });
    fld.setAttribute('data-edited', edited ? '1' : '0');
    $('[data-tag-edited]', fld).hidden = !edited;
    $('[data-reset]', fld).disabled = !edited;
  }

  // The popup's on/off switch, day count and style live outside the field map,
  // so they're tracked with one flag of their own.
  var popupTouched = false;

  function repaintCounts() {
    var dirty = 0;
    var perPage = {};
    fields.forEach(function (f) {
      var page = f.getAttribute('data-page');
      if (f.classList.contains('is-dirty')) dirty++;
      if (f.getAttribute('data-edited') === '1') perPage[page] = (perPage[page] || 0) + 1;
    });
    $$('[data-page-count]').forEach(function (el) {
      var n = perPage[el.getAttribute('data-page-count')] || 0;
      el.textContent = String(n);
      el.hidden = n === 0;
    });
    countEl.textContent = dirty > 0
      ? (dirty === 1 ? '1 unsaved change' : dirty + ' unsaved changes')
      : popupTouched ? 'Popup settings changed' : 'No unsaved changes';
    var pending = dirty > 0 || popupTouched;
    countEl.classList.toggle('is-dirty', pending);
    saveBtn.disabled = !pending;
    $('#revert').hidden = !pending;
  }
  function touch(fld) { paintField(fld); repaintCounts(); applyFilters(); }

  // ── The preview box: placeholder, plain paste, Enter = line break ──────
  try { document.execCommand('styleWithCSS', false, false); } catch (e) {}
  function refreshEmpty(pv) {
    var empty = pv.textContent.replace(/\u00a0/g, ' ').trim() === '' && !pv.querySelector('img');
    pv.classList.toggle('is-empty', empty);
  }
  $$('.pv').forEach(function (pv) {
    refreshEmpty(pv);
    pv.addEventListener('input', function () { refreshEmpty(pv); touch(pv.closest('[data-field]')); });
    pv.addEventListener('paste', function (e) {
      e.preventDefault();
      var t = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, t);
    });
    // Plain line breaks — never a new <div>/<p>, which the site's formatter
    // wouldn't understand.
    pv.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); }
    });
  });

  // ── Applying the per-language styling to its box ───────────────────────
  function renderStyle(col) {
    var pv = $('.pv', col);
    var st = styleOf(col);
    pv.style.setProperty('--pv-scale', String(st.size));
    pv.style.textAlign = st.align;
    pv.classList.toggle('has-dash', st.dash);
    var out = $('[data-size-out]', col);
    if (out) {
      out.textContent = Math.round(st.size * 100) + '%';
      out.classList.toggle('is-set', st.size !== 1);
    }
    $$('[data-align]', col).forEach(function (b) {
      var on = b.getAttribute('data-align') === st.align;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var dashBtn = $('[data-fmt="dash"]', col);
    if (dashBtn) {
      dashBtn.classList.toggle('is-on', st.dash);
      dashBtn.setAttribute('aria-pressed', st.dash ? 'true' : 'false');
    }
  }
  function setStyle(col, patch) {
    if ('size'  in patch) col.setAttribute('data-size',  String(patch.size));
    if ('align' in patch) col.setAttribute('data-align', patch.align);
    if ('dash'  in patch) col.setAttribute('data-dash',  patch.dash ? '1' : '0');
    renderStyle(col);
    touch(col.closest('[data-field]'));
  }
  function stepSize(col, dir) {
    var cur  = styleOf(col).size;
    var next = Math.round((cur + dir * SIZE_STEP) * 100) / 100;
    setStyle(col, { size: Math.min(SIZE_MAX, Math.max(SIZE_MIN, next)) });
  }

  // ── Toolbar ────────────────────────────────────────────────────────────
  document.addEventListener('mousedown', function (e) {
    // Keep the box's selection while a format button is pressed.
    if (e.target.closest && e.target.closest('.fb')) e.preventDefault();
  });
  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.fb, .mini, .pin') : null;
    if (!btn) return;
    var col = btn.closest('[data-col]');
    var fld = btn.closest('[data-field]');

    if (btn.hasAttribute('data-align')) { setStyle(col, { align: btn.getAttribute('data-align') }); return; }
    if (btn.hasAttribute('data-size-out')) { setStyle(col, { size: 1 }); return; }
    if (btn.hasAttribute('data-reset-lang')) { resetLang(fld, col.getAttribute('data-col')); return; }
    if (btn.hasAttribute('data-set-base'))   { setBase(fld, col.getAttribute('data-col')); return; }
    if (btn.hasAttribute('data-clear-base')) { clearBase(fld, col.getAttribute('data-col')); return; }
    if (btn.hasAttribute('data-hide-lang')) {
      var pv = $('.pv', col);
      pv.innerHTML = '';
      refreshEmpty(pv);
      touch(fld);
      return;
    }
    if (btn.hasAttribute('data-reset')) { resetLang(fld, 'he'); resetLang(fld, 'en'); return; }

    var fmt = btn.getAttribute('data-fmt');
    if (!fmt) return;
    if (fmt === 'bigger')  { stepSize(col, +1); return; }
    if (fmt === 'smaller') { stepSize(col, -1); return; }
    if (fmt === 'dash')    { setStyle(col, { dash: !styleOf(col).dash }); return; }
    if (fmt === 'clear') {
      var box = $('.pv', col);
      $$('b, strong, i, em, u', box).forEach(function (el) {
        while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
        el.parentNode.removeChild(el);
      });
      box.normalize();
      touch(fld);
      return;
    }
    try { document.execCommand(fmt); } catch (err) {}
    touch(fld);
  });

  /** Put one language back to its original — the owner's pinned copy when
   *  there is one, otherwise the copy the page ships with. */
  function resetLang(fld, lang) {
    var og  = originalOf(fld, lang);
    var col = colOf(fld, lang);
    var pv  = $('.pv', col);
    pv.innerHTML = formatRich(og.text);
    refreshEmpty(pv);
    setStyle(col, { size: og.size, align: og.align, dash: og.dash });
  }

  /** Pin what's in the box now as this language's original, so "Original"
   *  brings THIS back instead of the built-in copy. Saved with everything
   *  else; nothing on the live site reads it. */
  function setBase(fld, lang) {
    var key = fld.getAttribute('data-key');
    var col = colOf(fld, lang);
    var st  = styleOf(col);
    BASES[key] = BASES[key] || { he: null, en: null };
    BASES[key][lang] = {
      text: serializeRich($('.pv', col)),
      size: st.size, align: st.align, dash: st.dash
    };
    touch(fld);
  }
  /** Hand the field back to the copy the site ships with. */
  function clearBase(fld, lang) {
    var key = fld.getAttribute('data-key');
    if (BASES[key]) BASES[key][lang] = null;
    touch(fld);
  }
  /** The site's own formatter, so a restored default renders like the page. */
  function formatRich(s) {
    var h = String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    h = h.replace(/&lt;(\/?)(br|strong|em|b|i|u)\s*\/?&gt;/gi, function (_m, sl, tg) {
      return '<' + sl + tg.toLowerCase() + '>';
    });
    h = h.replace(/\*\*(\S(?:[^*\n]*\S)?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/(^|[^*])\*(\S(?:[^*\n]*\S)?)\*(?!\*)/g, '$1<em>$2</em>');
    h = h.replace(/__(\S(?:[^_\n]*\S)?)__/g, '<u>$1</u>');
    return h.replace(/\r?\n/g, '<br>');
  }

  // ── Pages, jump list, search, filters ─────────────────────────────────
  var tabs   = $$('[data-page-tab]');
  var panels = $$('[data-page-panel]');
  var jump   = $('#jump');
  var viewLink = $('#viewlink');

  function showPage(id) {
    tabs.forEach(function (t) {
      var on = t.getAttribute('data-page-tab') === id;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    panels.forEach(function (p) {
      p.classList.toggle('is-active', p.getAttribute('data-page-panel') === id);
    });
    var panel = panels.filter(function (p) { return p.getAttribute('data-page-panel') === id; })[0];
    buildJump(panel);
    if (panel) {
      var href = panel.getAttribute('data-page-href');
      viewLink.hidden = !href;
      if (href) viewLink.href = href;
    }
    try { history.replaceState(null, '', '#' + id); } catch (e) {}
  }

  /** Rebuild the "on this page" list from a panel's groups, skipping any the
   *  current settings have switched off (the popup's words in Photo style). */
  function buildJump(panel) {
    jump.innerHTML = '';
    if (!panel) return;
    $$('[data-group]', panel).forEach(function (g) {
      if (g.classList.contains('is-mode-off')) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'rail__jumplink';
      b.textContent = g.getAttribute('data-group');
      b.addEventListener('click', function () { g.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      jump.appendChild(b);
    });
  }
  function refreshJump() {
    buildJump(panels.filter(function (p) { return p.classList.contains('is-active'); })[0]);
  }
  tabs.forEach(function (t) {
    t.addEventListener('click', function () { showPage(t.getAttribute('data-page-tab')); });
  });

  var searchEl   = $('#q');
  var editedOnly = $('#edited');
  function applyFilters() {
    var q  = (searchEl.value || '').trim().toLowerCase();
    var on = editedOnly.classList.contains('is-on');
    wb.classList.toggle('is-searching', q !== '');
    wb.classList.toggle('is-filtered', on);
    var shown = 0;
    fields.forEach(function (f) {
      var hit = true;
      if (q) hit = ((f.getAttribute('data-search') || '') + ' ' + f.textContent).toLowerCase().indexOf(q) !== -1;
      if (hit && on) hit = f.getAttribute('data-edited') === '1';
      f.classList.toggle('is-hidden', !hit);
      if (hit) shown++;
    });
    // Hide groups (and, while searching, whole pages) that have nothing left.
    $$('[data-group]').forEach(function (g) {
      g.classList.toggle('is-hidden', !$('[data-field]:not(.is-hidden)', g));
    });
    $$('[data-retired]').forEach(function (d) {
      var any = !!$('[data-field]:not(.is-hidden)', d);
      d.classList.toggle('is-hidden', !any);
      if (any && q) d.open = true;          // a search should reach in here too
    });
    panels.forEach(function (p) {
      var any = !!$('[data-field]:not(.is-hidden)', p) || (!q && !on);
      p.classList.toggle('is-hidden', (q || on) ? !any : false);
    });
    $('#noresults').hidden = !((q || on) && shown === 0);
  }
  searchEl.addEventListener('input', applyFilters);
  searchEl.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { searchEl.value = ''; applyFilters(); }
  });
  editedOnly.addEventListener('click', function () {
    var on = !editedOnly.classList.contains('is-on');
    editedOnly.classList.toggle('is-on', on);
    editedOnly.setAttribute('aria-pressed', on ? 'true' : 'false');
    applyFilters();
  });
  $$('[data-view]').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-view');
      $$('[data-view]').forEach(function (o) { o.classList.toggle('is-active', o === b); });
      wb.classList.remove('is-he', 'is-en');
      if (v !== 'both') wb.classList.add('is-' + v);
      try { localStorage.setItem('zahara-content-view', v); } catch (e) {}
    });
  });
  try {
    var savedView = localStorage.getItem('zahara-content-view');
    if (savedView) {
      var b = $('[data-view="' + savedView + '"]');
      if (b) b.click();
    }
  } catch (e) {}

  // ── Save ───────────────────────────────────────────────────────────────
  function setMsg(text, err) {
    msgEl.textContent = text || '';
    msgEl.classList.toggle('savebar__msg--err', !!err);
  }
  function collect() {
    var map = {};
    fields.forEach(function (f) { map[f.getAttribute('data-key')] = entryOf(f); });
    return map;
  }

  // ── "Hide the popup on …" — read as ISRAEL wall-clock time ─────────────
  // The picker says 20:00 and the restaurant means 20:00 in Jerusalem, whatever
  // zone the laptop is in (and whatever the server thinks). Server-side twin:
  // jerusalemInputValue() fills the same box back in.
  function israelOffset(ms) {
    var f = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jerusalem', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    var p = {};
    f.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    var h = p.hour === '24' ? '00' : p.hour;
    return Date.UTC(+p.year, +p.month - 1, +p.day, +h, +p.minute, +p.second) - ms;
  }
  function israelInputToMs(value) {
    var v = (value || '').trim();
    if (!v) return 0;                                    // empty = no end time
    var utc = Date.parse(v.slice(0, 16) + ':00Z');       // read the digits as UTC…
    if (isNaN(utc)) return 0;
    // …then subtract Israel's offset AT THAT MOMENT. Twice, so a time that
    // lands near a daylight-saving switch settles on the right side of it.
    var ms = utc - israelOffset(utc);
    return utc - israelOffset(ms);
  }
  async function save() {
    saveBtn.disabled = true;
    setMsg('Saving…', false);
    try {
      var payload = { map: collect() };
      var enabled = $('#popup-enabled');
      var until   = $('#popup-until');
      var mode    = $('#popup-mode');
      if (enabled && until) {
        payload.popup = {
          enabled: enabled.checked,
          until: israelInputToMs(until.value),
          mode: mode ? mode.value : undefined
        };
      }
      var res  = await fetch('/admin/content/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Save failed');
      fields.forEach(function (f) { baseline[f.getAttribute('data-key')] = sigOf(f); paintField(f); });
      popupTouched = false;
      repaintCounts();
      setMsg('Saved · live on the site now.', false);
      try { new BroadcastChannel('zahara-content').postMessage({ action: 'saved' }); } catch (e) {}
    } catch (err) {
      setMsg(String(err.message || err), true);
      saveBtn.disabled = false;
    }
  }
  saveBtn.addEventListener('click', save);
  $('#revert').addEventListener('click', function () {
    if (!confirm('Throw away every unsaved change on this page?')) return;
    location.reload();
  });
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (!saveBtn.disabled) save();
    }
  });
  window.addEventListener('beforeunload', function (e) {
    if (!saveBtn.disabled) { e.preventDefault(); e.returnValue = ''; }
  });

  // ── Popup: style + photo (Entry popup panel) ──────────────────────────
  // The style rides along with Save; the photo itself is uploaded / reused /
  // removed immediately through /admin/popup/image.
  (function () {
    var modeInput = $('#popup-mode');
    if (!modeInput) return;
    var photoWrap = $('#popup-photo');
    var thumb     = $('#popup-photo-thumb');
    var fileInput = $('#popup-photo-file');
    var uploadBtn = $('#popup-photo-upload');
    var chooseBtn = $('#popup-photo-choose');
    var removeBtn = $('#popup-photo-remove');
    var statusEl  = $('#popup-photo-status');
    var picker    = $('#popup-picker');
    var needEl    = $('#popup-photo-need');
    var hasImg    = !!(removeBtn && !removeBtn.hidden);

    function setS(m, err) {
      if (!statusEl) return;
      statusEl.textContent = m || '';
      statusEl.classList.toggle('minor--err', !!err);
    }
    function refreshNeed() {
      if (needEl) needEl.classList.toggle('is-hidden', !(modeInput.value !== 'text' && !hasImg));
    }
    // In "Photo" style the popup shows no words at all, so the two text boxes
    // below would be editing something nobody sees. They're hidden (never
    // cleared — switch back to a style with words and they're still there).
    var styleNote = $('#popup-style-note');
    function paintTextGroups(mode) {
      var off = mode === 'photo';
      $$('[data-page-panel="popup"] .grp').forEach(function (g) {
        g.classList.toggle('is-mode-off', off);
      });
      if (styleNote) {
        styleNote.textContent = off
          ? 'This style shows no words at all, so the two text boxes are hidden. Your words are kept — pick a style with text and they come back.'
          : 'The words themselves are the two fields below.';
      }
      refreshJump();
    }
    function setMode(mode) {
      modeInput.value = mode;
      $$('[data-popup-mode]').forEach(function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-popup-mode') === mode);
      });
      if (photoWrap) photoWrap.classList.toggle('is-hidden', mode === 'text');
      paintTextGroups(mode);
      refreshNeed();
      popupTouched = true;
      repaintCounts();
    }
    $$('[data-popup-mode]').forEach(function (b) {
      b.addEventListener('click', function () { setMode(b.getAttribute('data-popup-mode')); });
    });
    paintTextGroups(modeInput.value);   // whatever style is saved right now

    // "No end time" — empties the picker, which saves as "stays until switched off".
    var clearBtn = $('#popup-until-clear');
    var untilEl  = $('#popup-until');
    if (clearBtn && untilEl) clearBtn.addEventListener('click', function () {
      untilEl.value = '';
      popupTouched = true;
      repaintCounts();
    });
    function swapThumb(node) { if (thumb && thumb.parentNode) { thumb.parentNode.replaceChild(node, thumb); thumb = node; } }
    function onHasImage(has) {
      hasImg = has;
      if (removeBtn) removeBtn.hidden = !has;
      if (has) {
        var img = document.createElement('img');
        img.className = 'photo__thumb'; img.id = 'popup-photo-thumb';
        img.alt = 'The photo the popup is showing';
        img.src = '/popup-image?v=' + Date.now() + (window.ADMIN_SITE_SUFFIX || '');
        swapThumb(img);
      } else {
        var box = document.createElement('div');
        box.className = 'photo__thumb is-empty'; box.id = 'popup-photo-thumb';
        box.textContent = 'No photo yet';
        swapThumb(box);
      }
      refreshNeed();
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
      setS('Uploading…', false);
      try {
        var fd = new FormData(); fd.append('file', fileInput.files[0]);
        await post(fd); onHasImage(true);
        setS('Photo saved · live now.', false);
      } catch (err) { setS(String(err.message || err), true); }
      finally { fileInput.value = ''; }
    });
    if (chooseBtn && picker) chooseBtn.addEventListener('click', function () {
      picker.classList.toggle('is-hidden');
    });
    if (picker) picker.addEventListener('click', async function (e) {
      var item = e.target.closest('[data-popup-source]');
      if (!item) return;
      var items = $$('[data-popup-source]', picker);
      items.forEach(function (b) { b.disabled = true; });
      setS('Applying…', false);
      try {
        var fd = new FormData(); fd.append('source', item.getAttribute('data-popup-source'));
        await post(fd); onHasImage(true); picker.classList.add('is-hidden');
        setS('Photo set · live now.', false);
      } catch (err) { setS(String(err.message || err), true); }
      finally { items.forEach(function (b) { b.disabled = false; }); }
    });
    if (removeBtn) removeBtn.addEventListener('click', async function () {
      if (!confirm('Remove the popup photo?')) return;
      setS('Removing…', false);
      try {
        var fd = new FormData(); fd.append('action', 'delete');
        await post(fd); onHasImage(false);
        setS('Photo removed.', false);
      } catch (err) { setS(String(err.message || err), true); }
    });
    // The on/off switch and the day count are saved with everything else, so
    // touching them should light up the save bar too.
    ['popup-enabled', 'popup-until'].forEach(function (id) {
      var el = $('#' + id);
      if (el) el.addEventListener('change', function () { popupTouched = true; repaintCounts(); });
    });
  })();

  // ── Events menu PDF (Events panel) — upload / replace / remove, live now ─
  (function () {
    var fileInput = $('#pdf-file');
    var uploadBtn = $('#pdf-upload');
    var removeBtn = $('#pdf-remove');
    var statusEl  = $('#pdf-status');
    var stateEl   = $('#pdf-state');
    if (!uploadBtn) return;
    var suffix = window.ADMIN_SITE_SUFFIX || '';
    function setS(m, err) {
      if (!statusEl) return;
      statusEl.textContent = m || '';
      statusEl.classList.toggle('minor--err', !!err);
    }
    async function post(fd) {
      var res  = await fetch('/admin/events-menu', { method: 'POST', body: fd });
      var data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed');
      return data;
    }
    uploadBtn.addEventListener('click', function () { if (fileInput) fileInput.click(); });
    if (fileInput) fileInput.addEventListener('change', async function () {
      if (!fileInput.files || !fileInput.files.length) return;
      setS('Uploading…', false);
      try {
        var fd = new FormData(); fd.append('file', fileInput.files[0]);
        await post(fd);
        setS('Saved · the button is now live on the Events page.', false);
        if (removeBtn) removeBtn.hidden = false;
        uploadBtn.textContent = 'Replace PDF…';
        stateEl.innerHTML = '<a class="pdf__link" href="/events-menu?v=' + Date.now() + suffix +
          '" target="_blank" rel="noopener">View the current PDF ↗</a>';
      } catch (err) { setS(String(err.message || err), true); }
      finally { fileInput.value = ''; }
    });
    if (removeBtn) removeBtn.addEventListener('click', async function () {
      if (!confirm('Remove the events menu PDF? The button disappears from the Events page.')) return;
      setS('Removing…', false);
      try {
        var fd = new FormData(); fd.append('action', 'delete');
        await post(fd);
        setS('Removed.', false);
        removeBtn.hidden = true;
        uploadBtn.textContent = 'Upload PDF…';
        stateEl.textContent = 'No menu uploaded — the button stays hidden on the Events page.';
      } catch (err) { setS(String(err.message || err), true); }
    });
  })();

  // ── Boot ───────────────────────────────────────────────────────────────
  function measureTopbar() {
    var bar = document.querySelector('.topbar');
    if (bar) document.documentElement.style.setProperty('--topbar-h', bar.offsetHeight + 'px');
  }
  measureTopbar();
  window.addEventListener('resize', measureTopbar, { passive: true });

  $$('.col').forEach(renderStyle);
  fields.forEach(paintField);
  repaintCounts();
  var initial = (location.hash || '').replace('#', '');
  showPage(tabs.some(function (t) { return t.getAttribute('data-page-tab') === initial; })
    ? initial : (tabs[0] && tabs[0].getAttribute('data-page-tab')));
  applyFilters();
})();
`;

// ── Field rendering ─────────────────────────────────────────────────────────

const ALIGN_ICON: Record<ContentAlign, string> = {
  start:  `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="4" x2="14" y2="4"/><line x1="2" y1="8" x2="10" y2="8"/><line x1="2" y1="12" x2="12" y2="12"/></svg>`,
  center: `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="4" x2="14" y2="4"/><line x1="4" y1="8" x2="12" y2="8"/><line x1="3" y1="12" x2="13" y2="12"/></svg>`,
  end:    `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="4" x2="14" y2="4"/><line x1="6" y1="8" x2="14" y2="8"/><line x1="4" y1="12" x2="14" y2="12"/></svg>`,
};

const LANG_NAME: Record<'he' | 'en', string> = { he: 'Hebrew · עברית', en: 'English' };

/** What an empty box shows: the built-in copy the site would fall back to, or
 *  a plain nudge for the handful of fields the page ships empty. */
function placeholder(f: ContentField, lang: 'he' | 'en'): string {
  const def = f[lang] ?? '';
  if (def) return def;
  return lang === 'he' ? 'ריק — הקלידו כדי להוסיף' : 'Empty — type to add';
}

/** One language's column: its own formatting bar, its own preview box, its
 *  own state line. Nothing here is shared with the other language. */
function columnHtml(f: ContentField, lang: 'he' | 'en', value: ContentMap[string]): string {
  const role  = f.role ?? 'body';
  const text  = value?.[lang] ?? f[lang] ?? '';
  const st    = styleFor(value, lang);
  const size  = st.size ?? 1;
  const align = st.align ?? f.align ?? 'start';
  const dash  = st.dash === true;
  const dir   = lang === 'he' ? 'rtl' : 'ltr';

  const alignBtns = ALIGNABLE.has(role)
    ? `<span class="fmt__sep"></span>` + (['start', 'center', 'end'] as ContentAlign[]).map((a) =>
        `<button type="button" class="fb fb--icon" data-align="${a}" title="Align ${a === 'start' ? 'to the start' : a === 'center' ? 'centre' : 'to the end'}" aria-label="Align ${a}" aria-pressed="false">${ALIGN_ICON[a]}</button>`,
      ).join('')
    : '';
  const dashBtn = DASHABLE.has(role)
    ? `<button type="button" class="fb" data-fmt="dash" aria-pressed="false"
               title="Draw a short accent rule above this text (stands in for an eyebrow)">—</button>`
    : '';

  return `
      <section class="col" data-col="${lang}" data-size="${size}" data-align="${align}" data-dash="${dash ? 1 : 0}">
        <div class="col__bar">
          <span class="col__lang">${esc(LANG_NAME[lang])}</span>
          <div class="fmt">
            <button type="button" class="fb fb--b" data-fmt="bold"      title="Bold (Ctrl/⌘+B)" aria-label="Bold">B</button>
            <button type="button" class="fb fb--i" data-fmt="italic"    title="Italic (Ctrl/⌘+I)" aria-label="Italic">I</button>
            <button type="button" class="fb fb--u" data-fmt="underline" title="Underline (Ctrl/⌘+U)" aria-label="Underline">U</button>
            <span class="fmt__sep"></span>
            <button type="button" class="fb" data-fmt="smaller" title="Smaller" aria-label="Smaller">A−</button>
            <button type="button" class="fb fb--size" data-size-out title="Back to the page's own size">100%</button>
            <button type="button" class="fb" data-fmt="bigger"  title="Bigger" aria-label="Bigger">A+</button>
            ${alignBtns}
            ${dashBtn ? `<span class="fmt__sep"></span>${dashBtn}` : ''}
            <span class="fmt__sep"></span>
            <button type="button" class="fb" data-fmt="clear" title="Remove bold / italic / underline" aria-label="Clear formatting">T×</button>
          </div>
        </div>
        <div class="stage${f.onPhoto ? ' stage--photo' : ''}${role === 'popupTitle' || role === 'popupBody' ? ' stage--card' : ''}">
          <div class="pv pv--${role}" contenteditable="true" role="textbox" aria-multiline="true"
               aria-label="${esc(f.label)} — ${lang === 'he' ? 'Hebrew' : 'English'}"
               dir="${dir}" data-ph="${esc(placeholder(f, lang))}">${renderRich(text)}</div>
        </div>
        <div class="col__foot">
          <span class="col__state" data-state></span>
          <button type="button" class="pin" data-clear-base hidden
                  title="Drop your own original and go back to the copy the site ships with">Your original ✕</button>
          <button type="button" class="mini" data-reset-lang
                  title="Put the original text and styling back">Original</button>
          <button type="button" class="mini" data-set-base
                  title="Make what's in the box now the original this field goes back to">Set as original</button>
          <button type="button" class="mini" data-hide-lang
                  title="Clear the text so this doesn't show on the site">Hide</button>
        </div>
      </section>`;
}

function fieldHtml(f: ContentField, value: ContentMap[string], page: PageId, groupTitle: string): string {
  const role = f.role ?? 'body';
  const search = [
    f.label, f.hint ?? '', f.key, plain(f.he ?? ''), plain(f.en ?? ''),
    plain(value?.he ?? ''), plain(value?.en ?? ''),
  ].join(' ').toLowerCase();

  return `
    <article class="fld" data-field data-key="${esc(f.key)}" data-page="${esc(page)}"
             data-edited="0" data-search="${esc(search)}">
      <header class="fld__head">
        <h4 class="fld__name">${esc(f.label)}</h4>
        <span class="fld__role">${esc(ROLE_NOTE[role])}</span>
        ${f.hint ? `<p class="fld__hint">${esc(f.hint)}</p>` : ''}
        <p class="fld__crumb">${esc(groupTitle)}</p>
        <div class="fld__meta">
          <span class="tag tag--dirty" data-tag-dirty hidden>Unsaved</span>
          <span class="tag" data-tag-edited hidden>Edited</span>
          <button type="button" class="mini" data-reset
                  title="Put both languages back to the original text and styling">Reset</button>
        </div>
      </header>
      <div class="fld__cols">
        ${columnHtml(f, 'he', value)}
        ${columnHtml(f, 'en', value)}
      </div>
    </article>`;
}

function groupHtml(g: ContentGroup, overrides: ContentMap): string {
  const live    = g.fields.filter((f) => !f.retired);
  const retired = g.fields.filter((f) => f.retired);
  const crumb   = `${CONTENT_PAGES.find((p) => p.id === g.page)?.label ?? ''} · ${g.title}`;
  const render  = (f: ContentField) => fieldHtml(f, overrides[f.key], g.page, crumb);

  // Copy whose section isn't built any more is kept (nothing is ever thrown
  // away) but folded out of the way, clearly labelled.
  const rest = retired.length ? `
    <details class="retired" data-retired>
      <summary>${esc(g.title)} — not on the site right now (${retired.length})</summary>
      <p class="retired__note">These belong to parts of the page that aren’t built any more.
        Your words are kept safe here, but editing them changes nothing unless that section comes back.</p>
      ${retired.map(render).join('')}
    </details>` : '';

  // A group whose fields are ALL retired shouldn't leave an empty heading.
  if (!live.length) return rest;

  return `
    <section class="grp" data-group="${esc(g.title)}">
      <header class="grp__head">
        <h3 class="grp__title">${esc(g.title)}</h3>
        ${g.note ? `<p class="grp__note">${esc(g.note)}</p>` : ''}
      </header>
      ${live.map(render).join('')}
    </section>${rest}`;
}

// ── Entry-popup + events panels ─────────────────────────────────────────────

/** Visibility: the on/off switch, the auto-hide window, and a plain-words line
 *  saying what visitors get right now. */
function popupVisHtml(cfg: PopupConfig): string {
  const active = popupActive(cfg);
  const fmt = (ms: number) => new Date(ms).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem',
  });
  let status: string;
  if (active) {
    status = cfg.until > 0
      ? `Showing now — it hides itself on ${fmt(cfg.until)} (Israel time).`
      : 'Showing now, with no end time — it stays until you switch it off.';
  } else if (cfg.enabled && cfg.until > 0) {
    status = `The end time (${fmt(cfg.until)}, Israel time) has passed, so nobody sees the popup. `
      + 'Pick a new one — or clear it — and save.';
  } else {
    status = 'Switched off — visitors don’t see it.';
  }
  return `
    <section class="card">
      <h3 class="card__title">Is the popup showing?</h3>
      <p class="card__note">Takes effect when you press Save changes.</p>
      <div class="row">
        <label class="switch">
          <input type="checkbox" id="popup-enabled"${cfg.enabled ? ' checked' : ''}>
          <span class="switch__track" aria-hidden="true"></span>
          <span>Show the popup</span>
        </label>
      </div>
      <div class="row">
        <span>Hide it automatically on</span>
        <input class="when" type="datetime-local" id="popup-until" value="${esc(jerusalemInputValue(cfg.until))}">
        <button type="button" class="mini" id="popup-until-clear">No end time</button>
        <span class="row__hint">Date and time in Israel. Leave it empty and the popup
          stays up until you switch it off.</span>
      </div>
      <div class="row"><p class="status${active ? ' status--on' : ''}">${esc(status)}</p></div>
    </section>`;
}

/** The `datetime-local` value ("YYYY-MM-DDTHH:mm") for an instant, read as
 *  Israel wall-clock time — the zone the owner thinks in, and the one the
 *  status line prints. Empty string for "no end time". Mirrored in the
 *  browser by israelInputToMs() in the editor script. */
function jerusalemInputValue(ms: number): string {
  if (!ms || ms <= 0) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const hour = get('hour') === '24' ? '00' : get('hour');   // some runtimes emit 24 at midnight
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}

/** Style: text card / photo / photo + text, plus the photo itself. Photo
 *  actions are immediate; the chosen style rides along with Save changes. */
function popupStyleHtml(cfg: PopupConfig, hasImage: boolean, version: string, site: Site): string {
  const modes: Array<[string, string, string]> = [
    ['text',  'Text card',   'A paper card with your title and message.'],
    ['photo', 'Photo',       'The popup is the photo, edge to edge — no card, no words.'],
    ['both',  'Photo + text', 'The photo on top, your title and message beneath it.'],
  ];
  const modeBtns = modes.map(([id, label, note]) =>
    `<button type="button" class="mode${cfg.mode === id ? ' is-active' : ''}" data-popup-mode="${id}">
      <span class="mode__name">${esc(label)}</span>
      <span class="mode__note">${esc(note)}</span>
    </button>`).join('');

  // Preview from THIS venue's view (rooftop → &site=rooftop).
  const siteAmp = site === 'rooftop' ? '&site=rooftop' : '';
  const thumb = hasImage
    ? `<img class="photo__thumb" id="popup-photo-thumb" src="/popup-image?v=${esc(version)}${siteAmp}" alt="The photo the popup is showing" />`
    : `<div class="photo__thumb is-empty" id="popup-photo-thumb">No photo yet</div>`;

  const pickerItems = PHOTO_CATALOGUE
    .filter((p) => !p.reserved)
    .map((p) =>
      `<button type="button" class="picker__item" data-popup-source="${esc(p.key)}" title="${esc(p.label)}">
        <img src="/photos/${esc(p.filename)}?t=${esc(version)}${siteAmp}" alt="" loading="lazy" onerror="this.style.opacity=0.2" />
        <span>${esc(p.label)}</span>
      </button>`).join('');

  const needPhoto = cfg.mode !== 'text' && !hasImage;

  return `
    <section class="card">
      <h3 class="card__title">What the popup looks like</h3>
      <p class="card__note" id="popup-style-note">The words themselves are the two fields below.</p>
      <div class="modes" role="group" aria-label="Popup style">${modeBtns}</div>
      <input type="hidden" id="popup-mode" value="${esc(cfg.mode)}" />

      <div class="photo${cfg.mode === 'text' ? ' is-hidden' : ''}" id="popup-photo">
        <p class="need${needPhoto ? '' : ' is-hidden'}" id="popup-photo-need">
          No photo uploaded yet — add one below, or the popup falls back to the text card.
        </p>
        <div class="photo__row">
          ${thumb}
          <div class="photo__actions">
            <input class="photo__file" type="file" id="popup-photo-file" accept="image/jpeg,image/png,image/webp" />
            <button type="button" class="btn" id="popup-photo-upload">Upload photo…</button>
            <button type="button" class="btn btn--ghost" id="popup-photo-choose">Choose an existing photo</button>
            <button type="button" class="btn btn--ghost" id="popup-photo-remove"${hasImage ? '' : ' hidden'}>Remove photo</button>
          </div>
        </div>
        <p class="minor" id="popup-photo-status"></p>
        <div class="picker is-hidden" id="popup-picker">
          <div class="picker__grid">${pickerItems}</div>
        </div>
      </div>
    </section>`;
}

/** The Events panel's menu-PDF manager — the file behind the "View events
 *  menu" button. Uploads are live immediately (stored in R2, served at
 *  /events-menu). */
function eventsMenuHtml(hasPdf: boolean, version: string, site: Site): string {
  const siteAmp = site === 'rooftop' ? '&site=rooftop' : '';
  const state = hasPdf
    ? `<a class="pdf__link" href="/events-menu?v=${esc(version)}${siteAmp}" target="_blank" rel="noopener">View the current PDF ↗</a>`
    : 'No menu uploaded — the button stays hidden on the Events page.';
  return `
    <section class="card">
      <h3 class="card__title">Events menu (PDF)</h3>
      <p class="card__note">The file behind the menu button — visitors read it on the page itself.
        Saved the moment you upload it. To pull it from OneDrive instead, open
        <a class="pdf__link" href="/admin/">Menu editor → Events menu (PDF)</a>,
        which syncs on its own and is left out of “Sync all now”.</p>
      <div class="row"><p id="pdf-state">${state}</p></div>
      <div class="row">
        <input class="pdf__file" type="file" id="pdf-file" accept="application/pdf,.pdf" />
        <button type="button" class="btn" id="pdf-upload">${hasPdf ? 'Replace PDF…' : 'Upload PDF…'}</button>
        <button type="button" class="btn btn--ghost" id="pdf-remove"${hasPdf ? '' : ' hidden'}>Remove</button>
        <span class="row__hint">PDF only, up to 15&nbsp;MB. It opens in the browser.</span>
      </div>
      <p class="minor" id="pdf-status"></p>
    </section>`;
}

// ── Page ────────────────────────────────────────────────────────────────────

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return unauthorized();

  // The venue being edited (site-switch cookie). Prefill from its OWN store so
  // the save/diff compares against code defaults, never the other venue's copy.
  const site = adminSite(request);
  const [overrides, popupCfg, palette] = await Promise.all([
    readContentForEditor(env, site), readPopupConfigOwn(env, site), readPalette(env, site),
  ]);

  // Is a popup photo / events PDF actually stored right now for THIS venue?
  // (head avoids downloading them.)
  const bucket = siteScope(env, site).images;
  let hasPopupImage = false;
  let hasEventsMenu = false;
  if (bucket) {
    try { hasPopupImage = (await bucket.head(POPUP_IMAGE_OBJECT)) !== null; }
    catch (err) { console.warn('[admin/content] popup image head failed', err); }
    try { hasEventsMenu = (await bucket.head(EVENTS_MENU_OBJECT)) !== null; }
    catch (err) { console.warn('[admin/content] events menu head failed', err); }
  }
  const adminVersion = Date.now().toString(36);

  // Paint the preview boxes with the venue's REAL colours, so a field that's
  // been retuned in /admin/colors previews in the colour the visitor sees.
  const SITE_TOKEN: Record<string, string> = {
    '--paper': '--s-paper', '--paper-card': '--s-paper-card', '--paper-on-photo': '--s-on-photo',
    '--ink': '--s-ink', '--ink-soft': '--s-ink-soft', '--ink-muted': '--s-ink-muted',
    '--accent': '--s-accent', '--rule': '--s-rule',
  };
  const paletteCss = Object.entries(palette.light || {})
    .filter(([k]) => SITE_TOKEN[k])
    .map(([k, v]) => `${SITE_TOKEN[k]}:${v}`)
    .join(';');

  // Which pages actually have copy (all of them, but stay defensive).
  const pages = CONTENT_PAGES.filter((p) =>
    CONTENT_GROUPS.some((g) => g.page === p.id) || p.id === 'popup' || p.id === 'events');
  const base = site === 'rooftop' ? '/rooftop' : '';

  const railHtml = pages.map((p) =>
    `<button class="rail__item" type="button" role="tab" data-page-tab="${esc(p.id)}">
       <span class="rail__name">${esc(p.label)}</span>
       <span class="rail__count" data-page-count="${esc(p.id)}" title="Fields changed from the original" hidden>0</span>
     </button>`).join('');

  const panelsHtml = pages.map((p) => {
    const href = p.path ? `${base}${p.path === '/' ? '/' : p.path}` : '';
    const tools = p.id === 'popup'
      ? popupVisHtml(popupCfg) + popupStyleHtml(popupCfg, hasPopupImage, adminVersion, site)
      : p.id === 'events'
        ? eventsMenuHtml(hasEventsMenu, adminVersion, site)
        : '';
    return `
    <section class="panel" data-page-panel="${esc(p.id)}" data-page-href="${esc(href)}" role="tabpanel">
      <header class="panel__head">
        <h2 class="panel__title">${esc(p.label)}</h2>
        ${p.note ? `<p class="panel__note">${esc(p.note)}</p>` : ''}
      </header>
      ${tools ? `<div class="panel__tools">${tools}</div>` : ''}
      ${CONTENT_GROUPS.filter((g) => g.page === p.id).map((g) => groupHtml(g, overrides)).join('')}
    </section>`;
  }).join('');

  // The built-in copy (in the editor's own token form) + the alignment each
  // field already has, so the browser can tell "changed" from "untouched" and
  // put a field back exactly as the page ships it. Any "original" the owner
  // pinned for this venue rides along and takes over that job.
  const defaults = Object.fromEntries(
    CONTENT_GROUPS.flatMap((g) => g.fields.map((f) => {
      const saved = overrides[f.key];
      return [f.key, {
        he: defaultTokens(f.key, 'he'),
        en: defaultTokens(f.key, 'en'),
        align: defaultAlignFor(f.key),
        ...(saved?.heBase ? { heBase: saved.heBase } : {}),
        ...(saved?.enBase ? { enBase: saved.enBase } : {}),
      }];
    })),
  );

  const html = `${adminHead(site, 'Content',
    `<style>${CHROME_CSS}${STYLE}${paletteCss ? `.stage{${paletteCss}}` : ''}</style>`)}
<body>
  ${topbar('content', { site })}
  <div class="wb" id="wb">
    <aside class="rail">
      <p class="rail__cap">Pages</p>
      <nav class="rail__nav" role="tablist" aria-label="Pages">${railHtml}</nav>
      <p class="rail__cap">On this page</p>
      <nav class="rail__jump" id="jump" aria-label="Sections"></nav>
      <p class="rail__foot">
        Every box is styled the way the site shows it. Type straight into it —
        select words and press <strong>B</strong>, <strong>I</strong> or
        <strong>U</strong> to style them, and use <strong>A−</strong> /
        <strong>A+</strong> to size the whole line. Hebrew and English are
        styled separately.
      </p>
      <p class="rail__foot">
        <strong>Original</strong> puts a box back the way it was;
        <strong>Set as original</strong> makes what you’ve written the thing it
        goes back to. <strong>⌘S</strong> saves.
      </p>
    </aside>

    <div class="work">
      <div class="tools">
        <label class="search">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="7" cy="7" r="4.5"/><line x1="10.5" y1="10.5" x2="14" y2="14" stroke-linecap="round"/></svg>
          <input id="q" type="search" placeholder="Search every page for a word…" aria-label="Search the site's text" />
        </label>
        <div class="seg" role="group" aria-label="Which language to show">
          <button type="button" class="seg__btn is-active" data-view="both">Both</button>
          <button type="button" class="seg__btn" data-view="he">עברית</button>
          <button type="button" class="seg__btn" data-view="en">English</button>
        </div>
        <button type="button" class="chip" id="edited" aria-pressed="false">Changed only</button>
        <span class="tools__spacer"></span>
        <a class="tools__view" id="viewlink" href="/" target="_blank" rel="noopener">View page ↗</a>
      </div>
      <div class="panels">
        ${panelsHtml}
        <p class="empty" id="noresults" hidden>Nothing matches. Try a different word, or clear the filters.</p>
      </div>
    </div>
  </div>

  <div class="savebar">
    <span class="savebar__count" id="savecount">No unsaved changes</span>
    <button class="mini" type="button" id="revert" hidden>Discard changes</button>
    <p class="savebar__msg" id="savemsg"></p>
    <div class="savebar__actions">
      <button class="btn" type="button" id="save" disabled>Save changes</button>
    </div>
  </div>

  <script>
    window.ADMIN_SITE_SUFFIX = ${JSON.stringify(site === 'rooftop' ? '&site=rooftop' : '')};
    window.ZAHARA_CONTENT_DEFAULTS = ${JSON.stringify(defaults).replace(/</g, '\\u003c')};
  </script>
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
