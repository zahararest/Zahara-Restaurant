// GET /admin/images — Basic-auth gated. Returns a self-contained HTML
// page for managing every photo on the site.
//
// Layout (rebuilt):
//   • A sticky toolbar with two VIEWS — "Desktop" and "Mobile (portrait)" —
//     so the two sets of images live in separate sections instead of being
//     stacked inside one card. A live search box and per-page jump chips make
//     it quick to find a specific photo without endless scrolling.
//   • Listing thumbnails are UNIFORM (one tidy 4:3 grid). The true crop — how
//     the photo actually appears in its place on the site — is shown inside
//     the editor instead, where you frame it.
//   • Picking a file (or dropping one) opens the Edit & adjust editor straight
//     away, so a new photo is always framed/colour-checked before it goes live
//     rather than uploaded raw.
//   • The editor crops to the photo's REAL aspect ratio (the preview canvas IS
//     the crop, ~1:1 with the site, just smaller), with zoom-toward-the-cursor,
//     drag-to-pan, rotate, and brightness/contrast/saturation/B&W — all baked
//     into the uploaded file.
//
// Server endpoints used (all Basic-auth gated, unchanged):
//   /admin/images/upload   — store an override (desktop or ?variant=mobile)
//   /admin/images/apply    — reuse an image already on the site
//   /admin/images/delete   — revert to default (desktop) / desktop (mobile)
//   /admin/images/purge    — force the CDN to refetch every photo
//   /admin/content/save    — gallery captions

import type { PagesFunction, R2Bucket } from '@cloudflare/workers-types';
import { checkAccess, unauthorized, type AuthEnv } from './auth';
import { CHROME_CSS, adminHead, topbar } from './chrome';
import { PHOTO_CATALOGUE, PHOTO_GROUPS, type PhotoMeta } from '../data/photos-map';
import {
  readContentOwn, galleryCaptionKey, GALLERY_CAPTION_KEYS,
  type ContentEnv, type ContentValue,
} from '../data/content';
import { adminSite, siteScope, type Site } from '../data/site';

interface Env extends AuthEnv, ContentEnv { IMAGES?: R2Bucket; }

const GALLERY_CAPTION_SET = new Set<string>(GALLERY_CAPTION_KEYS);

const STYLE = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    background: #F4EDDF;
    color: #1a1410;
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.55;
  }
  header.top {
    position: sticky;
    top: 0;
    z-index: 30;
    background: rgba(250, 247, 238, 0.96);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid #D5CBB1;
    padding: 0.7rem 1.25rem;
    display: grid;
    gap: 0.55rem;
  }
  .top__nav {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .top__brand {
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #1a1410;
    text-decoration: none;
    padding-inline-end: 0.4rem;
    border-inline-end: 1px solid #D5CBB1;
    margin-inline-end: 0.3rem;
  }
  .top__navlink {
    font-size: 0.76rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-weight: 600;
    color: #6f6457;
    text-decoration: none;
    padding: 0.35rem 0.6rem;
    border: 1px solid transparent;
    transition: color 0.2s, border-color 0.2s, background 0.2s;
  }
  .top__navlink:hover { color: #1a1410; border-color: #D5CBB1; }
  .top__navlink.is-active {
    color: #1a1410;
    background: #ece3d0;
    border-color: #D5CBB1;
    pointer-events: none;
  }
  .top__spacer { flex: 1; }
  .top__site {
    font-size: 0.76rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #9C4621;
    font-weight: 600;
    text-decoration: none;
    padding: 0.4rem 0.5rem;
  }
  .top__site:hover { text-decoration: underline; }
  .top__action {
    font: inherit;
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-weight: 600;
    padding: 0.45rem 0.65rem;
    background: transparent;
    color: #6f6457;
    border: 1px solid #D5CBB1;
    cursor: pointer;
    transition: color 0.2s, background 0.2s, border-color 0.2s;
  }
  .top__action:hover { color: #1a1410; background: #ece3d0; border-color: #9C4621; }
  .top__action:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ── Toolbar: view tabs + search + jump chips ─────────────────────── */
  .toolbar {
    display: flex;
    align-items: center;
    gap: 0.7rem 1rem;
    flex-wrap: wrap;
  }
  .viewtabs { display: inline-flex; border: 1px solid #D5CBB1; background: #fff; }
  .viewtab {
    font: inherit;
    font-size: 0.74rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-weight: 600;
    padding: 0.4rem 0.85rem;
    background: transparent;
    color: #6f6457;
    border: 0;
    border-inline-end: 1px solid #D5CBB1;
    cursor: pointer;
  }
  .viewtab:last-child { border-inline-end: 0; }
  .viewtab.is-active { background: #1a1410; color: #F4EDDF; }
  .toolbar__search {
    font: inherit;
    font-size: 0.85rem;
    padding: 0.45rem 0.7rem;
    border: 1px solid #D5CBB1;
    background: #fff;
    color: #1a1410;
    min-width: 200px;
    flex: 1 1 200px;
    max-width: 340px;
  }
  .toolbar__search:focus { outline: 2px solid #9C4621; outline-offset: 0; border-color: #9C4621; }
  .jumpnav { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .jumpnav__chip {
    font: inherit;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-weight: 600;
    padding: 0.35rem 0.6rem;
    background: #fff;
    color: #6f6457;
    border: 1px solid #D5CBB1;
    cursor: pointer;
  }
  .jumpnav__chip:hover { color: #1a1410; border-color: #9C4621; background: #ece3d0; }

  main {
    max-width: 1180px;
    margin: 0 auto;
    padding: 1.5rem 1.25rem 5rem;
  }
  /* ── Progress strip + filters ─────────────────────────────────────── */
  .status-strip {
    display: flex; align-items: center; gap: 0.9rem; flex-wrap: wrap;
    margin-block-end: 0.85rem;
  }
  .status-strip__count {
    margin: 0; font-size: 0.82rem; color: #6f6457; font-weight: 600;
  }
  .status-strip__count b { color: #1a1410; }
  .status-strip__count .is-warn { color: #a53623; }
  .status-strip__filters { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .filter-chip {
    font: inherit; font-size: 0.74rem; letter-spacing: 0.08em;
    font-weight: 600; padding: 0.36rem 0.7rem; cursor: pointer;
    background: #fff; color: #6f6457; border: 1px solid #D5CBB1;
    transition: color 0.2s, background 0.2s, border-color 0.2s;
  }
  .filter-chip:hover { color: #1a1410; border-color: #9C4621; }
  .filter-chip.is-active { background: #9C4621; border-color: #9C4621; color: #fff; }
  .filter-chip:focus-visible { outline: 2px solid #9C4621; outline-offset: 2px; }

  /* Busy overlay — while a card is uploading or removing, it locks and says
     so, so a slow connection never looks like "nothing happened". */
  .card { position: relative; }
  .card.is-busy { pointer-events: none; }
  .card.is-busy::after {
    content: attr(data-busy);
    position: absolute; inset: 0; z-index: 5;
    display: grid; place-items: center;
    background: rgba(244, 237, 223, 0.86);
    font-size: 0.78rem; font-weight: 700; letter-spacing: 0.12em;
    text-transform: uppercase; color: #1a1410;
  }

  /* The thumbnail is the biggest, most obvious target on the card — make it
     open the editor, and say so on hover. */
  .card__thumb { cursor: pointer; }
  /* Centred so it never collides with the badge (top-start) or the aspect
     chip (bottom-end). */
  .card__thumb::after {
    content: 'Click, or drop a photo here';
    position: absolute; inset-block-start: 50%; inset-inline-start: 50%;
    transform: translate(-50%, -50%);
    padding: 0.4rem 0.75rem; white-space: nowrap;
    background: rgba(26, 20, 16, 0.78); color: #F4EDDF;
    font-size: 0.7rem; letter-spacing: 0.06em; font-weight: 600;
    opacity: 0; transition: opacity 0.18s;
    pointer-events: none;
  }
  .card__thumb:hover::after,
  .card__thumb.is-dragging::after { opacity: 1; }

  .lead {
    color: #6f6457;
    max-width: 70ch;
    margin: 0 0 1.5rem;
  }
  .lead code {
    background: #ece3d0;
    padding: 0 0.35rem;
    font-family: 'Inter', monospace;
    font-size: 0.85em;
  }

  .view { display: none; }
  .view.is-active { display: block; }
  .view__intro {
    margin: 0 0 1.5rem;
    padding: 0.7rem 0.9rem;
    background: #f3eddc;
    border-inline-start: 3px solid #9C4621;
    color: #6f5a2e;
    font-size: 0.82rem;
    max-width: 80ch;
  }

  .group { margin-block-end: 2.5rem; scroll-margin-top: 130px; }
  .group__head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding-block-end: 0.6rem;
    margin-block-end: 1.1rem;
    border-bottom: 1px solid #D5CBB1;
  }
  .group__head h2 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .group__head small { color: #6f6457; }
  .group.is-empty { display: none; }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 1.1rem;
  }
  .card {
    background: #fff;
    border: 1px solid #D5CBB1;
    display: flex;
    flex-direction: column;
  }
  .card.is-hidden { display: none; }
  /* UNIFORM thumbnails — one tidy grid. The real crop is shown in the editor. */
  .card__thumb {
    width: 100%;
    aspect-ratio: 4 / 3;
    background: #ece3d0 center / cover no-repeat;
    position: relative;
    transition: outline-color 0.15s;
    outline: 2px dashed transparent;
    outline-offset: -6px;
  }
  .card__thumb img {
    width: 100%; height: 100%; object-fit: cover;
    display: block;
  }
  .card__thumb.is-dragging { outline-color: #9C4621; background: #ece3d0; }
  .card__badge {
    position: absolute;
    inset-block-start: 0.5rem;
    inset-inline-start: 0.5rem;
    font-size: 0.62rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-weight: 600;
    padding: 0.22rem 0.5rem;
    background: rgba(26, 20, 16, 0.78);
    color: #F4EDDF;
  }
  .card__badge--override { background: #9C4621; color: #fff; }
  .card__badge--missing  { background: #a53623; color: #fff; }
  .card__badge--fallback { background: #6f6457; color: #F4EDDF; }
  .card__badge--optional { background: #c9bda0; color: #1a1410; }
  .card__badge--set      { background: #9C4621; color: #fff; }
  .card__ar {
    position: absolute;
    inset-block-end: 0.5rem;
    inset-inline-end: 0.5rem;
    font-size: 0.6rem;
    letter-spacing: 0.1em;
    font-weight: 600;
    padding: 0.18rem 0.45rem;
    background: rgba(26, 20, 16, 0.62);
    color: #F4EDDF;
    font-family: 'Inter', monospace;
  }
  .card__tags {
    position: absolute;
    inset-block-start: 0.5rem;
    inset-inline-end: 0.5rem;
    display: flex;
    gap: 0.3rem;
  }
  .card__tag {
    font-size: 0.58rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-weight: 600;
    padding: 0.18rem 0.42rem;
    background: rgba(26, 20, 16, 0.6);
    color: #F4EDDF;
  }
  .card__head { padding: 0.8rem 0.9rem 0.4rem; }
  .card__label { margin: 0; font-weight: 600; font-size: 0.9rem; }
  .card__where {
    margin: 0.25rem 0 0;
    font-size: 0.76rem;
    color: #6f6457;
    line-height: 1.45;
  }
  .card__token {
    margin: 0.35rem 0 0;
    font-family: 'Inter', monospace;
    font-size: 0.68rem;
    color: #9a8d77;
  }
  .card__missing-note {
    margin: 0.4rem 0 0;
    padding: 0.45rem 0.55rem;
    background: #fbeae6;
    border-inline-start: 3px solid #a53623;
    font-size: 0.74rem;
    color: #6b1a0e;
    line-height: 1.45;
  }
  .card__optional-note {
    margin: 0.4rem 0 0;
    padding: 0.45rem 0.55rem;
    background: #f3eddc;
    border-inline-start: 3px solid #9C4621;
    font-size: 0.74rem;
    color: #6f5a2e;
    line-height: 1.45;
  }
  .card__actions {
    margin-top: auto;
    padding: 0.6rem 0.9rem 0.9rem;
    border-top: 1px solid #ece3d0;
    display: grid;
    gap: 0.5rem;
  }
  .card__file { display: none; }
  .card__file-name {
    margin: 0;
    font-family: 'Inter', monospace;
    font-size: 0.72rem;
    color: #6f6457;
    word-break: break-all;
    min-height: 1.1em;
  }
  .card__row { display: flex; gap: 0.45rem; flex-wrap: wrap; }
  .btn {
    font: inherit;
    font-size: 0.72rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-weight: 600;
    padding: 0.55rem 0.7rem;
    background: #1a1410;
    color: #F4EDDF;
    border: 1px solid #1a1410;
    cursor: pointer;
    flex: 1 1 auto;
    transition: background 0.2s, border-color 0.2s, color 0.2s;
  }
  .btn:hover { background: #9C4621; border-color: #9C4621; }
  .btn:disabled { opacity: 0.55; cursor: not-allowed; }
  .btn--ghost { background: transparent; color: #1a1410; }
  .btn--ghost:hover { color: #9C4621; background: transparent; border-color: #9C4621; }
  .card__status {
    margin: 0;
    min-height: 1.3em;
    font-size: 0.74rem;
    color: #4f6b47;
  }
  .card__status--err { color: #a53623; }
  .card__caption {
    margin-top: 0.3rem;
    padding-top: 0.6rem;
    border-top: 1px solid #ece3d0;
    display: grid;
    gap: 0.4rem;
  }
  .card__caption-label { margin: 0; font-size: 0.74rem; font-weight: 600; color: #6f6457; }
  .card__caption-label span { display: block; font-weight: 400; color: #9a8d77; font-size: 0.68rem; }
  .card__caption-input {
    font: inherit; font-size: 0.82rem; width: 100%;
    padding: 0.4rem 0.5rem; border: 1px solid #D5CBB1; background: #fff; color: #1a1410;
  }
  .card__caption-input:focus { outline: 2px solid #9C4621; outline-offset: 0; border-color: #9C4621; }
  .card__caption-status { margin: 0; min-height: 1.05em; font-size: 0.72rem; color: #4f6b47; }
  .card__caption-status--err { color: #a53623; }

  /* ── Picker modal (choose an existing image) ───────────────────── */
  .picker {
    position: fixed;
    inset: 0;
    z-index: 55;
    display: none;
    align-items: stretch;
    justify-content: center;
    background: rgba(20, 16, 12, 0.55);
    backdrop-filter: blur(3px);
    padding: 4vh 1rem;
    overflow: auto;
  }
  .picker.is-open { display: flex; }
  .picker__panel {
    background: #F4EDDF;
    border: 1px solid #D5CBB1;
    width: min(880px, 100%);
    margin: auto;
    padding: 1.1rem 1.3rem 1.5rem;
    display: grid;
    gap: 0.7rem;
    align-content: start;
    max-height: 92vh;
    overflow-y: auto;
  }
  .picker__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .picker__title {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #1a1410;
  }
  .picker__sub { margin: 0; font-size: 0.8rem; color: #6f6457; }
  .picker__sub em { font-style: normal; font-weight: 600; color: #9C4621; }
  .picker__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 0.7rem;
    margin-top: 0.3rem;
  }
  .picker__item {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 0;
    border: 1px solid #D5CBB1;
    background: #fff;
    cursor: pointer;
    text-align: start;
    transition: border-color 0.15s, box-shadow 0.15s, transform 0.1s;
  }
  .picker__item:hover { border-color: #9C4621; box-shadow: 0 4px 16px rgba(0,0,0,0.12); }
  .picker__item:active { transform: translateY(1px); }
  .picker__item:disabled { opacity: 0.5; cursor: not-allowed; }
  .picker__item-thumb {
    aspect-ratio: 4 / 3;
    width: 100%;
    object-fit: cover;
    display: block;
    background: #ece3d0;
  }
  .picker__item-meta { padding: 0.45rem 0.55rem 0.55rem; display: grid; gap: 0.15rem; }
  .picker__item-label { font-size: 0.76rem; font-weight: 600; color: #1a1410; line-height: 1.25; }
  .picker__item-flag {
    font-size: 0.6rem; letter-spacing: 0.1em; text-transform: uppercase;
    color: #9C4621; font-weight: 600;
  }
  .picker__item-flag.is-default { color: #9a8d77; }
  .picker__status { margin: 0; min-height: 1.1em; font-size: 0.78rem; color: #4f6b47; }
  .picker__status--err { color: #a53623; }
  .picker__empty { color: #6f6457; font-size: 0.82rem; padding: 1rem 0; }

  /* ── Editor modal ────────────────────────────────────────────── */
  .editor {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: none;
    align-items: stretch;
    justify-content: center;
    background: rgba(20, 16, 12, 0.6);
    backdrop-filter: blur(3px);
    padding: 2vh 1rem;
    overflow: auto;
  }
  .editor.is-open { display: flex; }
  .editor__panel {
    background: #F4EDDF;
    border: 1px solid #D5CBB1;
    width: min(980px, 100%);
    margin: auto;
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(280px, 1fr);
    /* Bounded a little under the viewport (the modal's own 2vh padding takes
       the rest) so the centered panel is never taller than the screen — which
       used to clip the editor's top/bottom and make the controls unreachable.
       The side column scrolls internally instead. */
    max-height: 94vh;
    overflow: hidden;
  }
  @media (max-width: 760px) {
    /* Stacked: let the whole modal scroll rather than a tiny inner column. */
    .editor__panel { grid-template-columns: 1fr; max-height: none; overflow: visible; }
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
    max-height: 78vh;
    cursor: grab;
    box-shadow: 0 6px 30px rgba(0,0,0,0.3);
    background: #1a1410;
    touch-action: none;
  }
  .editor__canvas:active { cursor: grabbing; }
  .editor__side {
    border-inline-start: 1px solid #D5CBB1;
    padding: 1.1rem 1.2rem 1.4rem;
    display: grid;
    gap: 0.85rem;
    align-content: start;
    /* Scroll the controls within the bounded panel so nothing is cut off. */
    min-height: 0;
    max-height: 94vh;
    overflow-y: auto;
  }
  @media (max-width: 760px) {
    .editor__side { border-inline-start: none; border-top: 1px solid #D5CBB1;
      max-height: none; overflow-y: visible; }
  }
  .editor__title {
    margin: 0;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .editor__sub {
    margin: -0.45rem 0 0;
    font-size: 0.76rem;
    color: #6f6457;
  }
  .editor__sub b { color: #9C4621; }
  .ctl { display: grid; gap: 0.3rem; }
  .ctl__row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
  }
  .ctl label { font-size: 0.74rem; font-weight: 600; letter-spacing: 0.04em; }
  .ctl__val { font-family: 'Inter', monospace; font-size: 0.72rem; color: #6f6457; }
  .ctl__reset { font: inherit; font-size: 0.66rem; letter-spacing: 0.06em; text-transform: uppercase;
    color: #9C4621; background: transparent; border: 0; padding: 0 0 1px; margin-inline-start: auto;
    border-bottom: 1px solid transparent; cursor: pointer; }
  .ctl__reset:hover { border-bottom-color: #9C4621; }
  .ctl input[type="range"] { width: 100%; accent-color: #9C4621; }
  .ctl select {
    font: inherit;
    font-size: 0.8rem;
    padding: 0.35rem 0.4rem;
    border: 1px solid #D5CBB1;
    background: #fff;
    width: 100%;
  }
  .editor__toggles { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  .chip {
    font: inherit;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-weight: 600;
    padding: 0.4rem 0.65rem;
    border: 1px solid #D5CBB1;
    background: #fff;
    color: #6f6457;
    cursor: pointer;
  }
  .chip.is-on { background: #1a1410; color: #F4EDDF; border-color: #1a1410; }
  .editor__divider { height: 1px; background: #e6dcc4; margin: 0.2rem 0; }
  .editor__meta { font-size: 0.72rem; color: #6f6457; font-family: 'Inter', monospace; line-height: 1.5; }
  .editor__meta--warn {
    color: #8a4b12; background: #fdf1e3;
    border-inline-start: 3px solid #d97706; padding: 0.45rem 0.6rem;
  }
  .editor__foot { display: flex; gap: 0.5rem; margin-top: 0.3rem; }
  .editor__status { margin: 0; min-height: 1.2em; font-size: 0.74rem; color: #4f6b47; }
  .editor__status--err { color: #a53623; }
  .ctl__hint { font-size: 0.68rem; color: #9a8d77; margin: 0; }

  @media (max-width: 560px) {
    header.top { padding: 0.6rem 0.85rem; }
    .top__navlink { padding: 0.3rem 0.45rem; font-size: 0.7rem; }
    main { padding: 1.25rem 0.85rem 4rem; }
    .grid { grid-template-columns: 1fr; gap: 0.9rem; }
    .toolbar__search { max-width: none; }
    /* Buttons stay full-width and reachable — no squished half-buttons. */
    .card__row .btn { flex: 1 1 100%; }
  }
`;

const SCRIPT = `
  (function () {
    'use strict';

    function fmtKB(b) { return Math.round(b / 1024) + ' KB'; }
    function escA(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
    function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

    // ── Bulk "refresh cached photos" button ───────────────────────────
    const purgeBtn = document.getElementById('top-purge');
    if (purgeBtn) {
      purgeBtn.addEventListener('click', async () => {
        const orig = purgeBtn.textContent;
        purgeBtn.disabled = true;
        purgeBtn.textContent = 'Refreshing…';
        try {
          const res = await fetch('/admin/images/purge', { method: 'POST' });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || 'Purge failed');
          purgeBtn.textContent = 'Refreshed ' + data.count;
          document.querySelectorAll('[data-thumb]').forEach((img) => {
            img.src = img.dataset.src + '?t=' + Date.now() + (window.ADMIN_SITE_SUFFIX || '');
          });
        } catch (err) {
          purgeBtn.textContent = 'Failed — retry';
          console.warn('[purge]', err);
        } finally {
          setTimeout(() => { purgeBtn.textContent = orig; purgeBtn.disabled = false; }, 2500);
        }
      });
    }

    // ── View tabs (Desktop / Mobile) ──────────────────────────────────
    const views = Array.prototype.slice.call(document.querySelectorAll('[data-view]'));
    const viewTabs = Array.prototype.slice.call(document.querySelectorAll('[data-view-tab]'));
    const jumpnav = document.getElementById('jumpnav');
    const searchInput = document.getElementById('img-search');

    function activeView() {
      return views.find((v) => v.classList.contains('is-active')) || views[0];
    }
    function buildJumpnav() {
      if (!jumpnav) return;
      const v = activeView();
      if (!v) { jumpnav.innerHTML = ''; return; }
      const groups = Array.prototype.slice.call(v.querySelectorAll('.group'))
        .filter((g) => !g.classList.contains('is-empty'));
      jumpnav.innerHTML = groups.map((g) =>
        '<button type="button" class="jumpnav__chip" data-jump="' + escA(g.id) + '">' +
          escA(g.dataset.groupLabel || '') + '</button>'
      ).join('');
    }
    function setView(name) {
      views.forEach((v) => v.classList.toggle('is-active', v.dataset.view === name));
      viewTabs.forEach((t) => t.classList.toggle('is-active', t.dataset.viewTab === name));
      applySearch();
      buildJumpnav();
    }
    viewTabs.forEach((t) => t.addEventListener('click', () => setView(t.dataset.viewTab)));
    if (jumpnav) {
      jumpnav.addEventListener('click', (e) => {
        const chip = e.target.closest('[data-jump]');
        if (!chip) return;
        const target = document.getElementById(chip.dataset.jump);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    // ── Live search + status filter ───────────────────────────────────
    // A card's state lives on its badge, so the filter reads the badge class
    // rather than a separate flag — that way it stays correct after an upload
    // or a removal without any extra bookkeeping.
    let activeFilter = 'all';

    function cardState(card) {
      const badge = card.querySelector('[data-badge]');
      const cls = badge ? badge.className : '';
      if (cls.indexOf('card__badge--missing') !== -1) return 'attention';
      if (cls.indexOf('card__badge--override') !== -1 ||
          cls.indexOf('card__badge--set') !== -1)     return 'mine';
      return 'other';
    }

    function applySearch() {
      const q = (searchInput && searchInput.value || '').trim().toLowerCase();
      const v = activeView();
      if (!v) return;
      v.querySelectorAll('.group').forEach((group) => {
        let shown = 0;
        group.querySelectorAll('[data-photo-card]').forEach((card) => {
          const hay = card.dataset.search || '';
          const matchQ = !q || hay.indexOf(q) !== -1;
          const matchF = activeFilter === 'all' || cardState(card) === activeFilter;
          card.classList.toggle('is-hidden', !(matchQ && matchF));
          if (matchQ && matchF) shown++;
        });
        group.classList.toggle('is-empty', shown === 0);
      });
      buildJumpnav();
      updateCount();
    }
    if (searchInput) searchInput.addEventListener('input', applySearch);

    document.querySelectorAll('[data-filter]').forEach((chip) => {
      chip.addEventListener('click', () => {
        activeFilter = chip.dataset.filter;
        document.querySelectorAll('[data-filter]').forEach((c) =>
          c.classList.toggle('is-active', c === chip));
        applySearch();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    // "X of Y photos set · N still need one" — counted from the DESKTOP view,
    // which is the complete list (the mobile view is a subset).
    const countEl = document.getElementById('status-count');
    function updateCount() {
      if (!countEl) return;
      const desktop = document.querySelector('[data-view="desktop"]');
      if (!desktop) return;
      const all = Array.prototype.slice.call(desktop.querySelectorAll('[data-photo-card]'));
      const missing = all.filter((c) => cardState(c) === 'attention').length;
      const mine    = all.filter((c) => cardState(c) === 'mine').length;
      countEl.innerHTML = '<b>' + mine + '</b> of ' + all.length + ' photos replaced by you' +
        (missing
          ? ' · <span class="is-warn"><b>' + missing + '</b> still need' + (missing === 1 ? 's' : '') + ' a photo</span>'
          : ' · nothing missing');
    }

    // ── Gallery caption autosave (delegated) ──────────────────────────
    document.addEventListener('change', async (e) => {
      const el = e.target;
      if (!el || !el.matches || !el.matches('[data-caption-key]')) return;
      const key  = el.getAttribute('data-caption-key');
      const heEl = document.querySelector('[data-caption-key="' + key + '"][data-caption-lang="he"]');
      const enEl = document.querySelector('[data-caption-key="' + key + '"][data-caption-lang="en"]');
      const wrap = el.closest('.card__caption');
      const statusEl = wrap ? wrap.querySelector('[data-caption-status]') : null;
      function setS(m, err) {
        if (!statusEl) return;
        statusEl.textContent = m || '';
        statusEl.classList.toggle('card__caption-status--err', !!err);
      }
      const map = {};
      map[key] = { he: heEl ? heEl.value : '', en: enEl ? enEl.value : '' };
      setS('Saving…', false);
      try {
        const res = await fetch('/admin/content/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ map: map }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || 'Save failed');
        setS('Saved', false);
        try { new BroadcastChannel('zahara-content').postMessage({ action: 'saved' }); } catch (_) {}
        setTimeout(() => setS('', false), 1800);
      } catch (err) {
        setS(String(err.message || err), true);
      }
    });

    // ── "Choose existing" picker ──────────────────────────────────────
    const picker      = document.getElementById('picker');
    const pickerGrid  = document.getElementById('picker-grid');
    const pickerTitle = document.getElementById('picker-title');
    const pickerStat  = document.getElementById('picker-status');
    const pickerClose = document.getElementById('picker-close');
    let pickerCtx = null;

    function setPickerStatus(msg, err) {
      if (!pickerStat) return;
      pickerStat.textContent = msg || '';
      pickerStat.classList.toggle('picker__status--err', !!err);
    }
    function closePicker() {
      if (!picker) return;
      picker.classList.remove('is-open');
      picker.setAttribute('aria-hidden', 'true');
      pickerCtx = null;
      setPickerStatus('');
    }
    if (pickerClose) pickerClose.addEventListener('click', closePicker);
    if (picker) picker.addEventListener('click', (e) => { if (e.target === picker) closePicker(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && picker && picker.classList.contains('is-open')) closePicker();
    });

    window.ZAHARA_PICK = function (opts) {
      if (!picker || !pickerGrid) return;
      pickerCtx = opts;
      if (pickerTitle) {
        pickerTitle.textContent = (opts.mode === 'source' ? 'Reuse a photo for · ' : 'Choose an image for · ')
          + (opts.label || opts.key);
      }
      const lib = (window.PICK_LIBRARY || []).filter((it) => it.key !== opts.key);
      lib.sort((a, b) => (b.has ? 1 : 0) - (a.has ? 1 : 0));
      if (!lib.length) {
        pickerGrid.innerHTML = '<p class="picker__empty">No other images available to reuse yet.</p>';
      } else {
        pickerGrid.innerHTML = lib.map((it) => {
          const thumb = '/photos/' + encodeURIComponent(it.filename) + '?t=' + (window.PICK_VERSION || '') + (window.ADMIN_SITE_SUFFIX || '');
          const flag = it.has
            ? '<span class="picker__item-flag">Uploaded</span>'
            : '<span class="picker__item-flag is-default">Default</span>';
          return '<button type="button" class="picker__item" data-source="' + escA(it.key) + '">' +
            '<img class="picker__item-thumb" src="' + escA(thumb) + '" alt="" loading="lazy" onerror="this.style.opacity=0.2" />' +
            '<span class="picker__item-meta">' +
              '<span class="picker__item-label">' + escA(it.label) + '</span>' + flag +
            '</span>' +
          '</button>';
        }).join('');
      }
      setPickerStatus('');
      picker.classList.add('is-open');
      picker.setAttribute('aria-hidden', 'false');
    };

    if (pickerGrid) {
      pickerGrid.addEventListener('click', async (e) => {
        const btn = e.target.closest('.picker__item');
        if (!btn || !pickerCtx) return;
        const sourceKey = btn.dataset.source;
        const ctx = pickerCtx;

        // Mobile reuse: hand the chosen photo back so the card can open the
        // editor on it (crop to portrait), instead of a straight byte copy.
        if (ctx.mode === 'source') {
          const item = (window.PICK_LIBRARY || []).find((it) => it.key === sourceKey);
          closePicker();
          if (item && ctx.onPickSource) ctx.onPickSource(item);
          return;
        }

        const items = pickerGrid.querySelectorAll('.picker__item');
        items.forEach((b) => { b.disabled = true; });
        setPickerStatus('Applying…', false);
        try {
          const fd = new FormData();
          fd.append('key', ctx.key);
          fd.append('source', sourceKey);
          const res = await fetch('/admin/images/apply', { method: 'POST', body: fd });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || 'Apply failed');
          (window.PICK_LIBRARY || []).forEach((it) => { if (it.key === ctx.key) it.has = true; });
          if (ctx.onChosen) ctx.onChosen(data.size || 0);
          closePicker();
        } catch (err) {
          setPickerStatus(String(err.message || err), true);
          items.forEach((b) => { b.disabled = false; });
        }
      });
    }

    // ── Shared upload helper (canvas blob OR File) ────────────────────
    window.ZAHARA_UPLOAD = async function (key, fileOrBlob, filename, variant) {
      const fd = new FormData();
      fd.append('key', key);
      if (variant) fd.append('variant', variant);
      fd.append('file', fileOrBlob, filename || (fileOrBlob.name || (key + '.jpg')));
      const res  = await fetch('/admin/images/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Upload failed');
      return data;
    };

    // ── Per-card wiring (one card = one image; variant set in dataset) ─
    const cards = document.querySelectorAll('[data-photo-card]');
    cards.forEach((card) => {
      const key      = card.dataset.photoCard;
      const variant  = card.dataset.variant === 'mobile' ? 'mobile' : '';
      const isMobile = variant === 'mobile';
      const label    = card.dataset.label || key;
      const aspect   = parseFloat(card.dataset.aspect) || (isMobile ? (9 / 16) : (16 / 9));
      const fit      = card.dataset.fit || 'cover';
      const isOptional = card.dataset.optional === '1';

      const file   = card.querySelector('[data-input-file]');
      const replace= card.querySelector('[data-btn-replace]');
      const editB  = card.querySelector('[data-btn-edit]');
      const del    = card.querySelector('[data-btn-delete]');
      const choose = card.querySelector('[data-btn-choose]');
      const status = card.querySelector('[data-status]');
      const badge  = card.querySelector('[data-badge]');
      const thumb  = card.querySelector('[data-thumb]');
      const thumbZone = card.querySelector('[data-thumb-zone]');
      const fname  = card.querySelector('[data-file-name]');
      const missingNote  = card.querySelector('[data-missing-note]');
      const optionalNote = card.querySelector('[data-optional-note]');

      function setStatus(msg, err) {
        if (!status) return;
        status.textContent = msg || '';
        status.classList.toggle('card__status--err', !!err);
      }
      /** Lock the card and say what's happening — a slow upload should never
       *  look like nothing happened, or invite a second click. */
      function setBusy(label) {
        if (label) { card.dataset.busy = label; card.classList.add('is-busy'); }
        else       { card.classList.remove('is-busy'); delete card.dataset.busy; }
      }

      // One place decides whether a dropped/picked file is usable, so the
      // message is the same however the file arrived. iPhones shoot HEIC by
      // default and browsers can't decode it, so it gets its own instruction
      // rather than a bare "wrong format".
      const MAX_BYTES = 10 * 1024 * 1024;
      function rejectReason(f) {
        const name = (f.name || '').toLowerCase();
        if (/\\.(heic|heif)$/.test(name) || /^image\\/hei[cf]/.test(f.type)) {
          return 'iPhone photos (HEIC) can\\'t be read here. On the iPhone: ' +
                 'Settings → Camera → Formats → "Most Compatible", then retake or ' +
                 're-send the photo — or email it to yourself and save the JPG.';
        }
        if (!/^image\\/(jpeg|png|webp)$/.test(f.type)) {
          return 'That file isn\\'t a photo we can use. Please pick a JPG, PNG or WebP.';
        }
        if (f.size > MAX_BYTES) {
          return 'That photo is ' + Math.round(f.size / 1024 / 1024) + ' MB — the limit is 10 MB. ' +
                 'Try exporting it a bit smaller.';
        }
        return null;
      }
      /** Accept a file from any source (picker or drop). */
      function takeFile(f) {
        if (!f) return;
        const bad = rejectReason(f);
        if (bad) { setStatus(bad, true); return; }
        if (fname) fname.textContent = f.name + ' · ' + fmtKB(f.size);
        setStatus('', false);
        openEditor(f);
      }
      function refreshThumb() {
        if (thumb) { thumb.style.opacity = 1; thumb.src = thumb.dataset.src + '?t=' + Date.now() + (window.ADMIN_SITE_SUFFIX || ''); }
      }
      function markSaved(sizeBytes) {
        setStatus('Saved · ' + fmtKB(sizeBytes), false);
        refreshThumb();
        if (badge) {
          badge.classList.remove('card__badge--missing', 'card__badge--fallback', 'card__badge--optional');
          badge.textContent = isMobile ? 'Set' : 'Override';
          badge.classList.add(isMobile ? 'card__badge--set' : 'card__badge--override');
        }
        if (missingNote)  missingNote.hidden = true;
        if (optionalNote) optionalNote.hidden = true;
        updateCount();   // the badge just changed — keep the progress line honest
        try { new BroadcastChannel('zahara-images').postMessage({ key: key, action: 'set' }); } catch (_) {}
      }

      function openEditor(source) {
        window.ZAHARA_EDITOR.open({
          key: key,
          variant: variant || undefined,
          label: label + (isMobile ? ' · mobile' : ''),
          source: source,
          aspect: aspect,
          fit: fit,
          onSaved: (size) => {
            markSaved(size);
            if (file) file.value = '';
            if (fname) fname.textContent = '';
          },
        });
      }

      // Picking a file opens the editor straight away (never a raw upload).
      if (file) {
        file.addEventListener('change', () => {
          if (!file.files || !file.files.length) { if (fname) fname.textContent = ''; return; }
          takeFile(file.files[0]);
          file.value = '';   // so re-picking the SAME file still fires change
        });
      }
      if (replace) replace.addEventListener('click', () => { if (file) file.click(); });

      function editCurrent() {
        if (!thumb) return;
        openEditor(thumb.dataset.src + '?t=' + Date.now() + (window.ADMIN_SITE_SUFFIX || ''));
      }
      // Edit the photo currently shown (no new file needed).
      if (editB) editB.addEventListener('click', editCurrent);

      // The thumbnail is the obvious thing to click, so make it work: it opens
      // the editor on what's there, or the file picker when the slot is empty.
      if (thumbZone) {
        thumbZone.addEventListener('click', () => {
          const badge = card.querySelector('[data-badge]');
          const empty = badge && /card__badge--(missing|optional)/.test(badge.className);
          if (empty) { if (file) file.click(); }
          else editCurrent();
        });
      }

      // Drop a file ANYWHERE on the card — aiming at the small thumbnail is
      // a needless precision task. The thumbnail still shows the drop cue.
      ['dragenter', 'dragover'].forEach((ev) => {
        card.addEventListener(ev, (e) => {
          if (!e.dataTransfer || e.dataTransfer.types.indexOf('Files') === -1) return;
          e.preventDefault();
          if (thumbZone) thumbZone.classList.add('is-dragging');
        });
      });
      ['dragleave', 'drop'].forEach((ev) => {
        card.addEventListener(ev, (e) => {
          e.preventDefault();
          // dragleave fires when moving between the card's own children too;
          // only clear when the pointer has actually left the card.
          if (ev === 'dragleave' && card.contains(e.relatedTarget)) return;
          if (thumbZone) thumbZone.classList.remove('is-dragging');
        });
      });
      card.addEventListener('drop', (e) => {
        takeFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
      });

      if (choose) {
        choose.addEventListener('click', () => {
          if (isMobile) {
            // Reuse another photo as this portrait crop: pick a source, then
            // open the editor on its full image to frame it 9:16 and upload.
            window.ZAHARA_PICK({
              key: key, label: label + ' · mobile', mode: 'source',
              onPickSource: (item) => {
                openEditor('/photos/' + encodeURIComponent(item.filename) + '?t=' + Date.now() + (window.ADMIN_SITE_SUFFIX || ''));
              },
            });
          } else {
            window.ZAHARA_PICK({ key: key, label: label, onChosen: (size) => markSaved(size) });
          }
        });
      }

      if (del) {
        del.addEventListener('click', async () => {
          const ask = isMobile
            ? 'Remove the mobile photo? Phones will fall back to the desktop photo.'
            : (isOptional
              ? 'Remove this photo from the gallery? The slot will go back to empty.'
              : 'Remove override and revert to the default photo?');
          if (!confirm(ask)) return;
          if (replace) replace.disabled = true;
          del.disabled = true;
          if (editB) editB.disabled = true;
          setBusy('Removing…');
          setStatus('Removing…', false);
          try {
            const fd = new FormData();
            fd.append('key', key);
            if (variant) fd.append('variant', variant);
            const res = await fetch('/admin/images/delete', { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok || !data.ok) throw new Error(data.error || 'Delete failed');
            if (thumb) { thumb.style.opacity = 1; thumb.src = thumb.dataset.fallback + '?t=' + Date.now() + (window.ADMIN_SITE_SUFFIX || ''); }
            if (isMobile) {
              setStatus('Removed — using desktop', false);
              if (badge) { badge.textContent = 'Using desktop'; badge.classList.remove('card__badge--set'); }
            } else if (badge) {
              badge.classList.remove('card__badge--override', 'card__badge--fallback', 'card__badge--optional', 'card__badge--missing');
              if (card.dataset.fallbackLabel) {
                setStatus('Reverted to ' + card.dataset.fallbackLabel, false);
                badge.textContent = card.dataset.fallbackLabel;
                badge.classList.add('card__badge--fallback');
              } else if (isOptional) {
                setStatus('Removed — slot is empty', false);
                badge.textContent = 'Empty';
                badge.classList.add('card__badge--optional');
                if (optionalNote) optionalNote.hidden = false;
              } else {
                setStatus('Reverted to default', false);
                badge.textContent = 'Missing';
                badge.classList.add('card__badge--missing');
                if (missingNote) missingNote.hidden = false;
              }
            }
            updateCount();
            try { new BroadcastChannel('zahara-images').postMessage({ key: key, action: 'delete' }); } catch (_) {}
          } catch (err) {
            setStatus(String(err.message || err), true);
          } finally {
            setBusy('');
            if (replace) replace.disabled = false;
            del.disabled = false;
            if (editB) editB.disabled = false;
          }
        });
      }
    });

    // ── Image editor ──────────────────────────────────────────────────
    window.ZAHARA_EDITOR = (function () {
      const root    = document.getElementById('editor');
      const canvas  = document.getElementById('ed-canvas');
      const ctx     = canvas.getContext('2d');
      const titleEl = document.getElementById('ed-title');
      const subEl   = document.getElementById('ed-sub');
      const statusEl= document.getElementById('ed-status');
      const metaEl  = document.getElementById('ed-meta');

      const inputs = {
        grayscale:  document.getElementById('ed-grayscale'),
        brightness: document.getElementById('ed-brightness'),
        contrast:   document.getElementById('ed-contrast'),
        saturate:   document.getElementById('ed-saturate'),
        zoom:       document.getElementById('ed-zoom'),
        straighten: document.getElementById('ed-straighten'),
        width:      document.getElementById('ed-width'),
        quality:    document.getElementById('ed-quality'),
      };
      const vals = {
        grayscale:  document.getElementById('ed-grayscale-v'),
        brightness: document.getElementById('ed-brightness-v'),
        contrast:   document.getElementById('ed-contrast-v'),
        saturate:   document.getElementById('ed-saturate-v'),
        zoom:       document.getElementById('ed-zoom-v'),
        straighten: document.getElementById('ed-straighten-v'),
      };
      const bwChip   = document.getElementById('ed-bw');
      const resetB   = document.getElementById('ed-reset');
      const applyB   = document.getElementById('ed-apply');
      const cancelB  = document.getElementById('ed-cancel');
      const compareB = document.getElementById('ed-compare');
      const rotateLB = document.getElementById('ed-rotate-l');
      const rotateRB = document.getElementById('ed-rotate-r');
      const rotateV  = document.getElementById('ed-rotate-v');
      const centerB  = document.getElementById('ed-center');
      const flipHB   = document.getElementById('ed-flip-h');
      const flipVB   = document.getElementById('ed-flip-v');
      const straightenB = document.getElementById('ed-straighten-0');

      let img = null;            // loaded HTMLImageElement
      let work = null;           // { el, w, h } — rotation-applied source
      let ctxState = null;       // open() opts
      let targetAR = 16 / 9;     // crop aspect (the shape used on the site)
      let cropToAR = true;       // false for 'contain' photos (show whole image)
      let cx = 0.5, cy = 0.5;    // crop centre, fraction of the work source
      let dirty = false;
      let comparing = false;
      let rotation = 0;          // 0/90/180/270, baked into export
      let flipH = false, flipV = false;  // mirror, baked into export
      const PREVIEW_MAX = 460;   // px — preview longest edge (a little smaller)

      function markDirty() { dirty = true; }
      function zoom() { return parseFloat(inputs.zoom.value) || 1; }

      function currentOpts() {
        return {
          grayscale:  +inputs.grayscale.value,
          brightness: +inputs.brightness.value,
          contrast:   +inputs.contrast.value,
          saturate:   +inputs.saturate.value,
        };
      }
      function needsAdjust(o) {
        return o.grayscale !== 0 || o.brightness !== 100 || o.contrast !== 100 || o.saturate !== 100;
      }

      // Per-pixel adjustment (baked into export; works on every browser).
      function adjustPixels(data, o) {
        const br = o.brightness / 100, cT = o.contrast / 100, sat = o.saturate / 100, gr = o.grayscale / 100;
        for (let i = 0; i < data.length; i += 4) {
          let r = data[i], g = data[i + 1], b = data[i + 2];
          r *= br; g *= br; b *= br;
          r = ((r / 255 - 0.5) * cT + 0.5) * 255;
          g = ((g / 255 - 0.5) * cT + 0.5) * 255;
          b = ((b / 255 - 0.5) * cT + 0.5) * 255;
          let lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          r = lum + (r - lum) * sat; g = lum + (g - lum) * sat; b = lum + (b - lum) * sat;
          if (gr > 0) {
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            r += (lum - r) * gr; g += (lum - g) * gr; b += (lum - b) * gr;
          }
          data[i]     = r < 0 ? 0 : r > 255 ? 255 : r;
          data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
          data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
        }
      }

      function fineDeg() { return inputs.straighten ? (parseFloat(inputs.straighten.value) || 0) : 0; }

      // Rebuild the working source with every geometric transform baked in:
      // the 90° rotation, horizontal/vertical flip, and the fine straighten
      // angle. The straighten uses a cover-scale (enlarge just enough that the
      // tilted image still fills the frame) so there are never transparent
      // corners — the classic reason to reach for a desktop photo app.
      function buildWork() {
        if (!img) { work = null; return; }
        const rot90 = rotation % 180 !== 0;
        const w = rot90 ? img.naturalHeight : img.naturalWidth;
        const h = rot90 ? img.naturalWidth  : img.naturalHeight;
        const fine = fineDeg() * Math.PI / 180;
        if (rotation === 0 && !flipH && !flipV && fine === 0) {
          work = { el: img, w: img.naturalWidth, h: img.naturalHeight };
          return;
        }
        // Minimal uniform scale so a w×h frame stays covered after rotating by
        // the fine angle (exact for same-frame rotation): |cos| + max(w/h,h/w)*|sin|.
        const cover = Math.abs(Math.cos(fine)) +
          Math.max(w / h, h / w) * Math.abs(Math.sin(fine));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const cc = c.getContext('2d');
        cc.translate(w / 2, h / 2);
        cc.rotate(fine);
        cc.scale(cover, cover);
        cc.scale(flipH ? -1 : 1, flipV ? -1 : 1);
        cc.rotate(rotation * Math.PI / 180);
        cc.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
        work = { el: c, w: w, h: h };
      }

      // The largest target-AR rectangle that fits the work source at zoom 1.
      function baseCrop() {
        const wAR = work.w / work.h;
        if (wAR > targetAR) { const sh = work.h; return { sw: sh * targetAR, sh: sh }; }
        const sw = work.w; return { sw: sw, sh: sw / targetAR };
      }
      // Source-pixel crop rect for the current zoom + centre.
      function cropRect() {
        const z = zoom();
        const b = baseCrop();
        const sw = b.sw / z, sh = b.sh / z;
        const maxX = Math.max(0, work.w - sw), maxY = Math.max(0, work.h - sh);
        let sx = cx * work.w - sw / 2;
        let sy = cy * work.h - sh / 2;
        sx = clamp(sx, 0, maxX);
        sy = clamp(sy, 0, maxY);
        return { sx: sx, sy: sy, sw: sw, sh: sh };
      }

      function previewSize() {
        let pw = PREVIEW_MAX, ph = Math.round(pw / targetAR);
        if (ph > PREVIEW_MAX) { ph = PREVIEW_MAX; pw = Math.round(ph * targetAR); }
        return { pw: pw, ph: ph };
      }

      function syncLabels() {
        vals.grayscale.textContent  = inputs.grayscale.value + '%';
        vals.brightness.textContent = inputs.brightness.value + '%';
        vals.contrast.textContent   = inputs.contrast.value + '%';
        vals.saturate.textContent   = inputs.saturate.value + '%';
        vals.zoom.textContent       = zoom().toFixed(2) + '×';
        if (rotateV) rotateV.textContent = rotation + '\\u00B0';
        if (vals.straighten) vals.straighten.textContent = (fineDeg() > 0 ? '+' : '') + fineDeg().toFixed(1) + '\\u00B0';
        bwChip.classList.toggle('is-on', inputs.grayscale.value === '100');
        if (flipHB) flipHB.classList.toggle('is-on', flipH);
        if (flipVB) flipVB.classList.toggle('is-on', flipV);
      }

      function setRotation(deg) {
        rotation = ((deg % 360) + 360) % 360;
        buildWork();
        markDirty();
        drawPreview();
      }

      function drawPreview() {
        if (!work) return;
        const { pw, ph } = previewSize();
        canvas.width = pw; canvas.height = ph;
        ctx.clearRect(0, 0, pw, ph);

        if (comparing) {
          // Show the whole (un-cropped, un-adjusted) source, letterboxed.
          ctx.fillStyle = '#1a1410';
          ctx.fillRect(0, 0, pw, ph);
          const wAR = work.w / work.h;
          let dw = pw, dh = Math.round(pw / wAR);
          if (dh > ph) { dh = ph; dw = Math.round(ph * wAR); }
          ctx.drawImage(work.el, 0, 0, work.w, work.h, (pw - dw) / 2, (ph - dh) / 2, dw, dh);
          syncLabels();
          return;
        }

        const { sx, sy, sw, sh } = cropRect();
        ctx.drawImage(work.el, sx, sy, sw, sh, 0, 0, pw, ph);

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

      // Build the full-resolution output at the target aspect ratio.
      function exportBlob() {
        const { sx, sy, sw, sh } = cropRect();
        const cap = inputs.width.value === 'orig'
          ? Math.round(sw)
          : Math.min(parseInt(inputs.width.value, 10), Math.round(sw));
        const outW = Math.max(1, Math.round(cap));
        const outH = Math.max(1, Math.round(outW / targetAR));
        const off = document.createElement('canvas');
        off.width = outW; off.height = outH;
        const octx = off.getContext('2d');
        octx.drawImage(work.el, sx, sy, sw, sh, 0, 0, outW, outH);
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
        if (inputs.straighten) inputs.straighten.value = '0';
        cx = 0.5; cy = 0.5;
        rotation = 0;
        flipH = false; flipV = false;
        buildWork();
        dirty = false;
        drawPreview();
      }

      function tryClose() {
        if (dirty && !confirm('Discard unsaved changes to this photo?')) return false;
        close();
        return true;
      }

      function arText(ar) {
        // Friendly ratio label for common shapes.
        const known = [[16/9,'16:9'],[3/2,'3:2'],[4/3,'4:3'],[1,'1:1'],[5/7,'5:7'],[4/5,'4:5'],[2/3,'2:3'],[9/16,'9:16']];
        let best = null, bestD = 1e9;
        known.forEach((k) => { const d = Math.abs(k[0] - ar); if (d < bestD) { bestD = d; best = k[1]; } });
        return (bestD < 0.02 && best) ? best : (Math.round(ar * 100) / 100) + ':1';
      }

      function open(opts) {
        ctxState = opts;
        targetAR = (typeof opts.aspect === 'number' && opts.aspect > 0) ? opts.aspect : (16 / 9);
        cropToAR = opts.fit !== 'contain';
        titleEl.textContent = 'Edit · ' + opts.label;
        if (subEl) {
          subEl.innerHTML = cropToAR
            ? 'Framing to <b>' + arText(targetAR) + '</b> — exactly how it appears on the site. Scroll to zoom toward the cursor, drag to reposition.'
            : 'Shown whole on the site — fit the full image. Scroll to zoom, drag to reposition.';
        }
        setStatus('Loading…', false);
        // Default export size depends on the slot.
        inputs.width.value = opts.variant === 'mobile' ? '1280' : '2000';
        inputs.quality.value = '0.85';
        reset();
        applyB.disabled = true;
        root.classList.add('is-open');

        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => {
          img = im;
          // 'contain' photos are shown whole — frame to the source ratio (no crop).
          if (!cropToAR) targetAR = im.naturalWidth / im.naturalHeight;
          rotation = 0;
          buildWork();
          // Say the size plainly, and warn when the source is too small for the
          // slot — a screenshot or a WhatsApp copy will look soft stretched
          // across a full-bleed band, and there's no way to tell from the
          // thumbnail alone.
          const minW = opts.variant === 'mobile' ? 800 : 1400;
          metaEl.textContent = im.naturalWidth + ' × ' + im.naturalHeight + ' px source';
          metaEl.classList.toggle('editor__meta--warn', im.naturalWidth < minW);
          if (im.naturalWidth < minW) {
            metaEl.textContent += ' — small for this slot (' + minW + ' px+ recommended). ' +
              'It will still upload, but may look soft. A photo straight from a ' +
              'phone camera is usually large enough; a screenshot or a WhatsApp copy often is not.';
          }
          applyB.disabled = false;
          setStatus('', false);
          drawPreview();
        };
        im.onerror = () => setStatus(
          'Could not load this photo. Pick a file to replace it, then edit.', true,
        );
        if (typeof opts.source === 'string') im.src = opts.source;
        else im.src = URL.createObjectURL(opts.source);
      }

      function close() {
        root.classList.remove('is-open');
        img = null; work = null; ctxState = null;
      }

      // ── Wire controls ──
      ['grayscale','brightness','contrast','saturate'].forEach((k) => {
        inputs[k].addEventListener('input', () => { markDirty(); drawPreview(); });
      });
      inputs.zoom.addEventListener('input', () => { markDirty(); drawPreview(); });
      inputs.width.addEventListener('change', markDirty);
      inputs.quality.addEventListener('change', markDirty);
      bwChip.addEventListener('click', () => {
        inputs.grayscale.value = inputs.grayscale.value === '100' ? '0' : '100';
        markDirty(); drawPreview();
      });
      if (rotateLB) rotateLB.addEventListener('click', () => setRotation(rotation - 90));
      if (rotateRB) rotateRB.addEventListener('click', () => setRotation(rotation + 90));
      if (flipHB) flipHB.addEventListener('click', () => { flipH = !flipH; buildWork(); markDirty(); drawPreview(); });
      if (flipVB) flipVB.addEventListener('click', () => { flipV = !flipV; buildWork(); markDirty(); drawPreview(); });
      // Straighten slider — rebuild the (cover-scaled) work on each move, rAF-
      // throttled so dragging stays smooth on large source images.
      if (inputs.straighten) {
        let straightenRaf = 0;
        inputs.straighten.addEventListener('input', () => {
          markDirty();
          if (straightenRaf) return;
          straightenRaf = requestAnimationFrame(() => { straightenRaf = 0; buildWork(); drawPreview(); });
        });
      }
      if (straightenB) straightenB.addEventListener('click', () => {
        if (inputs.straighten) inputs.straighten.value = '0';
        buildWork(); markDirty(); drawPreview();
      });
      if (centerB) centerB.addEventListener('click', () => { cx = 0.5; cy = 0.5; markDirty(); drawPreview(); });
      resetB.addEventListener('click', () => { reset(); markDirty(); });
      cancelB.addEventListener('click', tryClose);
      root.addEventListener('click', (e) => { if (e.target === root) tryClose(); });

      function startCompare() { if (comparing || !work) return; comparing = true; compareB.classList.add('is-on'); drawPreview(); }
      function stopCompare()  { if (!comparing) return; comparing = false; compareB.classList.remove('is-on'); drawPreview(); }
      compareB.addEventListener('pointerdown', (e) => { e.preventDefault(); startCompare(); });
      compareB.addEventListener('pointerup',     stopCompare);
      compareB.addEventListener('pointerleave',  stopCompare);
      compareB.addEventListener('pointercancel', stopCompare);

      document.addEventListener('keydown', (e) => {
        if (!root.classList.contains('is-open')) return;
        const tag = (e.target && e.target.tagName) || '';
        const inField = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
        if (e.key === 'Escape') { e.preventDefault(); tryClose(); return; }
        if (inField) return;
        if (e.key === ' ' && !e.repeat) { e.preventDefault(); startCompare(); return; }
        if (e.key === 's' || e.key === 'S') { e.preventDefault(); if (!applyB.disabled) applyB.click(); return; }
        if (e.key === 'r' || e.key === 'R') { e.preventDefault(); reset(); return; }
        if (e.key === 'b' || e.key === 'B') { e.preventDefault(); bwChip.click(); return; }
      });
      document.addEventListener('keyup', (e) => { if (e.key === ' ') stopCompare(); });

      // Zoom toward the cursor with the wheel — keeps the point under the
      // pointer fixed instead of zooming the whole frame from the centre.
      function zoomToPoint(newZoom, px, py) {
        if (!work) return;
        const before = cropRect();
        const { pw, ph } = previewSize();
        // Absolute source point currently under the cursor.
        const fx = before.sx + (px / pw) * before.sw;
        const fy = before.sy + (py / ph) * before.sh;
        inputs.zoom.value = clamp(newZoom, 1, parseFloat(inputs.zoom.max)).toFixed(2);
        const z = zoom();
        const b = baseCrop();
        const sw = b.sw / z, sh = b.sh / z;
        // Place the crop so the focal point stays under the cursor.
        const sx = fx - (px / pw) * sw;
        const sy = fy - (py / ph) * sh;
        cx = clamp((sx + sw / 2) / work.w, 0, 1);
        cy = clamp((sy + sh / 2) / work.h, 0, 1);
        markDirty();
        drawPreview();
      }
      canvas.addEventListener('wheel', (e) => {
        if (!work) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width  * canvas.width;
        const py = (e.clientY - rect.top)  / rect.height * canvas.height;
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        zoomToPoint(zoom() * factor, px, py);
      }, { passive: false });

      // Drag to pan the crop.
      let dragging = false, lastX = 0, lastY = 0;
      canvas.addEventListener('pointerdown', (e) => {
        if (!work) return;
        dragging = true; lastX = e.clientX; lastY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
      });
      canvas.addEventListener('pointermove', (e) => {
        if (!dragging || !work) return;
        const rect = canvas.getBoundingClientRect();
        const { sw, sh } = cropRect();
        // Move proportionally: dragging right reveals content to the left.
        cx -= ((e.clientX - lastX) / rect.width)  * (sw / work.w);
        cy -= ((e.clientY - lastY) / rect.height) * (sh / work.h);
        cx = clamp(cx, 0, 1); cy = clamp(cy, 0, 1);
        lastX = e.clientX; lastY = e.clientY;
        markDirty();
        drawPreview();
      });
      canvas.addEventListener('pointerup',     () => { dragging = false; });
      canvas.addEventListener('pointercancel', () => { dragging = false; });

      applyB.addEventListener('click', async () => {
        if (!work || !ctxState) return;
        applyB.disabled = true; cancelB.disabled = true;
        setStatus('Rendering…', false);
        try {
          const { blob, w, h } = await exportBlob();
          setStatus('Uploading ' + w + '×' + h + ' · ' + Math.round(blob.size / 1024) + ' KB…', false);
          const fname = ctxState.key + (ctxState.variant === 'mobile' ? '-mobile' : '') + '.jpg';
          const data = await window.ZAHARA_UPLOAD(ctxState.key, blob, fname, ctxState.variant);
          if (ctxState.onSaved) ctxState.onSaved(data.size);
          dirty = false;
          close();
        } catch (err) {
          setStatus(String(err.message || err), true);
        } finally {
          applyB.disabled = false; cancelB.disabled = false;
        }
      });

      return { open: open };
    })();

    // Default view + initial chrome.
    buildJumpnav();
    applySearch();
    updateCount();
  })();
`;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

/** Parse an aspect string like "2 / 3" into a number; default 16/9. */
function aspectToNum(a?: string): number {
  if (!a) return 16 / 9;
  const m = a.split('/');
  if (m.length === 2) {
    const w = parseFloat(m[0]), h = parseFloat(m[1]);
    if (w > 0 && h > 0) return w / h;
  }
  const n = parseFloat(a);
  return n > 0 ? n : 16 / 9;
}

interface CardOpts {
  variant: 'desktop' | 'mobile';
  version: number;
  fallbackFromLabel: string | null;
  hasOverride: boolean;
  hasMobile: boolean;
  caption: ContentValue | null;
  site: Site;
}

function renderCard(p: PhotoMeta, o: CardOpts): string {
  const isMobile = o.variant === 'mobile';
  const route    = isMobile ? 'photos-m' : 'photos';
  // Preview from THIS venue's view: rooftop thumbnails carry &site=rooftop so
  // the /photos route resolves rooftop's own upload → Zahara fallback → static.
  // data-src / data-fallback stay query-less; the client appends ?t=…&site=…
  // (via SITE_SUFFIX) on refresh.
  const siteAmp  = o.site === 'rooftop' ? '&site=rooftop' : '';
  const src      = `/${route}/${p.filename}?t=${o.version}${siteAmp}`;
  const fallback = `/${route}/${p.filename}`;

  const targetAR = isMobile ? (9 / 16) : aspectToNum(p.aspect);
  const fit      = p.fit || 'cover';

  const tags: string[] = [];
  if (!isMobile && p.reused)   tags.push('<span class="card__tag">Shared</span>');
  if (!isMobile && p.reserved) tags.push('<span class="card__tag">Not shown</span>');

  // Badge state.
  let badgeClass = '';
  let badgeText  = 'Default';
  if (isMobile) {
    if (o.hasMobile) { badgeClass = 'card__badge--set'; badgeText = 'Set'; }
    else             { badgeClass = 'card__badge--optional'; badgeText = 'Using desktop'; }
  } else if (o.hasOverride) {
    badgeClass = 'card__badge--override'; badgeText = 'Override';
  } else if (o.fallbackFromLabel) {
    badgeClass = 'card__badge--fallback'; badgeText = 'Using ' + o.fallbackFromLabel;
  } else if (p.optional) {
    badgeClass = 'card__badge--optional'; badgeText = 'Empty';
  } else if (!p.reserved) {
    badgeClass = 'card__badge--missing'; badgeText = 'Missing';
  }

  const showMissingNote  = !isMobile && !o.hasOverride && !o.fallbackFromLabel && !p.reserved && !p.optional;
  const showOptionalNote = !isMobile && !o.hasOverride && !!p.optional;

  // friendly AR label for the corner chip
  const arLabel = isMobile ? '9:16'
    : (p.aspect ? p.aspect.replace(/\s*\/\s*/, ':') : '16:9');

  const where = isMobile
    ? `Portrait crop shown on phones. ${esc(p.where)}`
    : esc(p.where);

  const searchHay = `${p.label} ${p.where} ${p.key}`.toLowerCase();

  const captionBlock = (!isMobile && o.caption) ? `
        <div class="card__caption">
          <p class="card__caption-label">Gallery caption <span>shown on this photo in the home gallery</span></p>
          <input class="card__caption-input" type="text" dir="rtl"
                 data-caption-key="${esc(galleryCaptionKey(p.key))}" data-caption-lang="he"
                 value="${esc(o.caption.he ?? '')}" placeholder="כיתוב (עברית)" />
          <input class="card__caption-input" type="text" dir="ltr"
                 data-caption-key="${esc(galleryCaptionKey(p.key))}" data-caption-lang="en"
                 value="${esc(o.caption.en ?? '')}" placeholder="Caption (English)" />
          <p class="card__caption-status" data-caption-status></p>
        </div>` : '';

  // "Choose existing" reuses another photo. Desktop copies the bytes straight
  // across; mobile opens the editor on the chosen photo so it can be cropped to
  // portrait first (a landscape source can't just be dropped into a 9:16 slot).
  const chooseBtn =
    `<button class="btn btn--ghost" type="button" data-btn-choose>Choose existing</button>`;
  const delLabel = isMobile ? 'Remove' : (p.optional ? 'Remove' : 'Remove override');

  return `
    <article class="card" data-photo-card="${esc(p.key)}" data-variant="${o.variant}"
             data-label="${esc(p.label)}" data-aspect="${targetAR.toFixed(5)}" data-fit="${esc(fit)}"
             data-search="${esc(searchHay)}"
             ${p.optional ? 'data-optional="1"' : ''}
             ${o.fallbackFromLabel ? `data-fallback-label="${esc('Using ' + o.fallbackFromLabel)}"` : ''}>
      <div class="card__thumb" data-thumb-zone>
        <img data-thumb data-src="/${route}/${esc(p.filename)}" data-fallback="${esc(fallback)}"
             src="${esc(src)}" alt="${esc(p.label)}" loading="lazy" decoding="async"
             onerror="this.style.opacity=0.22" />
        <span class="card__badge ${badgeClass}" data-badge>${esc(badgeText)}</span>
        ${tags.length ? `<div class="card__tags">${tags.join('')}</div>` : ''}
        <span class="card__ar">${esc(arLabel)}</span>
      </div>
      <header class="card__head">
        <p class="card__label">${esc(p.label)}</p>
        <p class="card__where">${where}</p>
        <p class="card__token"><code>${esc(p.key)}${isMobile ? ' · mobile' : ''}</code></p>
        <p class="card__missing-note" data-missing-note ${showMissingNote ? '' : 'hidden'}>
          No image stored — visitors see a broken photo here. Replace it to fix.
        </p>
        <p class="card__optional-note" data-optional-note ${showOptionalNote ? '' : 'hidden'}>
          ${esc(p.note ?? 'Optional slot — empty. Add a photo to show it in the home gallery.')}
        </p>
      </header>
      <div class="card__actions">
        <!-- HEIC is listed so an iPhone photo can at least be SELECTED: iOS
             usually converts it on the way out, and when it doesn't we show a
             real explanation instead of the file simply not being selectable. -->
        <input class="card__file" type="file" data-input-file
               accept="image/jpeg,image/png,image/webp,image/heic,image/heif" />
        <div class="card__row">
          <button class="btn" type="button" data-btn-replace>Replace photo…</button>
          <button class="btn btn--ghost" type="button" data-btn-edit>Edit current</button>
        </div>
        <div class="card__row">
          ${chooseBtn}
          <button class="btn btn--ghost" type="button" data-btn-delete>${delLabel}</button>
        </div>
        <p class="card__file-name" data-file-name></p>
        <p class="card__status" data-status></p>
        ${captionBlock}
      </div>
    </article>
  `;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return unauthorized();

  // The venue being edited (site-switch cookie). Its OWN bucket drives the
  // badges (Override/Missing), its OWN captions prefill the inputs, and the
  // preview thumbnails carry ?site so they show THIS venue's real view
  // (its own upload → Zahara fallback → static), not always Zahara's.
  const site   = adminSite(request);
  const bucket = siteScope(env, site).images;

  // Which keys have an override / mobile variant in THIS venue's R2 right now.
  const overrideSet = new Set<string>();
  const mobileSet   = new Set<string>();

  async function collect(from: typeof bucket, into: Set<string>, intoMobile: Set<string>) {
    if (!from) return;
    try {
      const listing = await from.list({ prefix: 'images/' });
      for (const obj of listing.objects) {
        const k = obj.key.replace(/^images\//, '');
        if (k.endsWith('__mobile')) intoMobile.add(k.slice(0, -'__mobile'.length));
        else into.add(k);
      }
    } catch (err) {
      console.warn('[admin/images] R2 list failed', err);
    }
  }

  await collect(bucket, overrideSet, mobileSet);

  // Shared photos (the /reserve/ portal) always live in the shared bucket, so
  // when the rooftop is being edited their badges have to come from THERE —
  // otherwise those slots would read "Missing" while the image is live on the
  // page, and the owner would upload it again to no effect.
  if (site !== 'zahara') {
    const sharedOverride = new Set<string>();
    const sharedMobile   = new Set<string>();
    await collect(siteScope(env, 'zahara').images, sharedOverride, sharedMobile);
    for (const p of PHOTO_CATALOGUE) {
      if (!p.shared) continue;
      overrideSet.delete(p.key);
      mobileSet.delete(p.key);
      if (sharedOverride.has(p.key)) overrideSet.add(p.key);
      if (sharedMobile.has(p.key))   mobileSet.add(p.key);
    }
  }

  const content = await readContentOwn(env, site);
  const v = Date.now();

  const libraryJson = JSON.stringify(
    PHOTO_CATALOGUE
      .filter((p) => !p.reserved)
      .map((p) => ({ key: p.key, filename: p.filename, label: p.label, group: p.group, has: overrideSet.has(p.key) })),
  );

  const labelOf = (key: string) => PHOTO_CATALOGUE.find((p) => p.key === key)?.label ?? key;

  let missingCount = 0;

  const groupKeys = Object.keys(PHOTO_GROUPS) as Array<keyof typeof PHOTO_GROUPS>;

  // Desktop view — every photo, grouped by page.
  const desktopGroups = groupKeys.map((g) => {
    const photos = PHOTO_CATALOGUE.filter((p) => p.group === g);
    if (!photos.length) return '';
    const cards = photos.map((p) => {
      const hasOverride = overrideSet.has(p.key);
      const fallbackFromLabel = !hasOverride && p.fallbackKey && overrideSet.has(p.fallbackKey)
        ? labelOf(p.fallbackKey) : null;
      if (!hasOverride && !fallbackFromLabel && !p.reserved && !p.optional) missingCount++;
      const caption = GALLERY_CAPTION_SET.has(p.key) ? (content[galleryCaptionKey(p.key)] ?? {}) : null;
      return renderCard(p, { variant: 'desktop', version: v, hasOverride, hasMobile: mobileSet.has(p.key), fallbackFromLabel, caption, site });
    }).join('');
    return `
      <section class="group" id="g-desktop-${g}" data-group-label="${esc(PHOTO_GROUPS[g])}">
        <header class="group__head">
          <h2>${esc(PHOTO_GROUPS[g])}</h2>
          <small>${photos.length} photo${photos.length === 1 ? '' : 's'} · in page order</small>
        </header>
        <div class="grid">${cards}</div>
      </section>`;
  }).join('');

  // Mobile view — only photos that support a portrait crop (full-bleed ones).
  const mobileGroups = groupKeys.map((g) => {
    const photos = PHOTO_CATALOGUE.filter((p) => p.group === g && p.mobile);
    if (!photos.length) return '';
    const cards = photos.map((p) =>
      renderCard(p, { variant: 'mobile', version: v, hasOverride: overrideSet.has(p.key), hasMobile: mobileSet.has(p.key), fallbackFromLabel: null, caption: null, site }),
    ).join('');
    return `
      <section class="group" id="g-mobile-${g}" data-group-label="${esc(PHOTO_GROUPS[g])}">
        <header class="group__head">
          <h2>${esc(PHOTO_GROUPS[g])}</h2>
          <small>${photos.length} portrait crop${photos.length === 1 ? '' : 's'}</small>
        </header>
        <div class="grid">${cards}</div>
      </section>`;
  }).join('');

  // The count + a jump-to filter now live in the status strip above the list,
  // so this banner only carries the consequence — no "go hunt for the badge".
  const missingBanner = missingCount > 0
    ? `<p class="lead" style="background:#fbeae6;border-inline-start:3px solid #a53623;padding:0.6rem 0.85rem;color:#6b1a0e;">
         <strong>${missingCount}</strong> photo${missingCount === 1 ? ' has' : 's have'} no image yet — visitors see a broken picture there.
         Press <strong>Needs a photo</strong> above to see just those.
       </p>`
    : '';

  const html = `${adminHead(site, 'Images', `<style>${CHROME_CSS}${STYLE}</style>`)}
<body>
  ${topbar('images', {
    site,
    rightSlot: `<button class="top__action" type="button" id="top-purge"
              title="Force the CDN to refetch every photo (use if you just uploaded and the live site still shows the old image)">
        Refresh cached photos
      </button>`,
    titleSlot: `<div class="toolbar">
      <div class="viewtabs" role="tablist" aria-label="Image set">
        <button class="viewtab is-active" type="button" data-view-tab="desktop">Desktop</button>
        <button class="viewtab"           type="button" data-view-tab="mobile">Mobile (portrait)</button>
      </div>
      <input class="toolbar__search" type="search" id="img-search" placeholder="Search photos by name, page or key…" aria-label="Search photos" />
      <nav class="jumpnav" id="jumpnav" aria-label="Jump to page"></nav>
    </div>`,
  })}
  <main>
    <!-- Progress + one-click filters. The page previously only told the owner
         to "look for the red badge", which on a 30-photo list means scrolling
         the lot. These chips jump straight to what is unfinished. -->
    <div class="status-strip">
      <p class="status-strip__count" id="status-count"></p>
      <div class="status-strip__filters" role="group" aria-label="Filter photos">
        <button type="button" class="filter-chip is-active" data-filter="all">All photos</button>
        <button type="button" class="filter-chip" data-filter="attention">Needs a photo</button>
        <button type="button" class="filter-chip" data-filter="mine">Replaced by you</button>
      </div>
    </div>

    <p class="lead">
      <strong>To change a photo:</strong> drag a picture onto the one you want
      to replace — or click it. It opens in the editor where you frame it, then
      press <strong>Apply&nbsp;&amp;&nbsp;upload</strong>.
      <br />
      <strong>Choose existing</strong> reuses a photo already on the site.
      <strong>Remove</strong> puts the original back.
      Photos from a phone or camera work — JPG, PNG or WebP, up to 10&nbsp;MB.
    </p>

    <div class="view is-active" data-view="desktop">
      ${missingBanner}
      ${desktopGroups}
    </div>

    <div class="view" data-view="mobile">
      <p class="view__intro">
        Portrait crops shown on phones. The phone hero now cycles through the
        gallery photos (Interior · Chef · Bar · Wine) and the standalone gallery
        section is hidden on mobile — so these crops are what visitors see on a
        phone. Leave any empty to fall back to the desktop photo.
      </p>
      ${mobileGroups}
    </div>
  </main>

  <!-- Editor modal -->
  <div class="editor" id="editor" aria-hidden="true">
    <div class="editor__panel" role="dialog" aria-label="Photo editor">
      <div class="editor__stage">
        <canvas class="editor__canvas" id="ed-canvas" width="460" height="345"></canvas>
      </div>
      <div class="editor__side">
        <h2 class="editor__title" id="ed-title">Edit photo</h2>
        <p class="editor__sub" id="ed-sub">Scroll to zoom toward the cursor, drag to reposition.</p>

        <div class="editor__toggles">
          <button type="button" class="chip" id="ed-bw">Black &amp; white</button>
          <button type="button" class="chip" id="ed-compare" title="Hold to see the original, uncropped">Compare (hold)</button>
          <button type="button" class="chip" id="ed-center" title="Recentre the crop">Centre</button>
          <button type="button" class="chip" id="ed-reset">Reset</button>
        </div>

        <div class="ctl">
          <div class="ctl__row"><label for="ed-zoom">Zoom / crop</label><span class="ctl__val" id="ed-zoom-v">1.00×</span></div>
          <input type="range" id="ed-zoom" min="1" max="5" step="0.01" value="1" />
          <p class="ctl__hint">Or scroll over the preview to zoom toward the cursor.</p>
        </div>
        <div class="ctl">
          <div class="ctl__row"><label>Rotate &amp; flip</label><span class="ctl__val" id="ed-rotate-v">0°</span></div>
          <div class="editor__toggles">
            <button type="button" class="chip" id="ed-rotate-l" title="Rotate 90° counter-clockwise">↺ Left</button>
            <button type="button" class="chip" id="ed-rotate-r" title="Rotate 90° clockwise">↻ Right</button>
            <button type="button" class="chip" id="ed-flip-h" title="Mirror left ↔ right">⇋ Flip H</button>
            <button type="button" class="chip" id="ed-flip-v" title="Mirror top ↕ bottom">⇵ Flip V</button>
          </div>
        </div>
        <div class="ctl">
          <div class="ctl__row">
            <label for="ed-straighten">Straighten</label>
            <span class="ctl__val" id="ed-straighten-v">0.0°</span>
            <button type="button" class="ctl__reset" id="ed-straighten-0" title="Reset straighten to 0°">Reset</button>
          </div>
          <input type="range" id="ed-straighten" min="-15" max="15" step="0.5" value="0" />
          <p class="ctl__hint">Level a crooked horizon — the frame auto-fills, no empty corners.</p>
        </div>

        <div class="editor__divider"></div>

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

        <div class="editor__divider"></div>

        <div class="ctl">
          <label for="ed-width">Export size (max width)</label>
          <select id="ed-width">
            <option value="orig">Keep original width</option>
            <option value="2400">2400 px — extra large</option>
            <option value="2000" selected>2000 px — large (recommended)</option>
            <option value="1600">1600 px — medium</option>
            <option value="1280">1280 px — small (good for mobile)</option>
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
          <button type="button" class="btn btn--ghost" id="ed-cancel">Cancel</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Picker modal -->
  <div class="picker" id="picker" aria-hidden="true">
    <div class="picker__panel" role="dialog" aria-label="Choose an existing image">
      <header class="picker__head">
        <h2 class="picker__title" id="picker-title">Choose an existing image</h2>
        <button type="button" class="btn btn--ghost" id="picker-close">Close</button>
      </header>
      <p class="picker__sub">Pick a photo already used elsewhere on the site to reuse it here — no re-upload needed. Photos already replaced by you are marked <em>Uploaded</em>.</p>
      <div class="picker__grid" id="picker-grid"></div>
      <p class="picker__status" id="picker-status"></p>
    </div>
  </div>

  <script>
    window.PICK_LIBRARY = ${libraryJson};
    window.PICK_VERSION = ${v};
    // Suffix appended to every preview URL so admin thumbnails show the venue
    // currently being edited (rooftop → its own image, else the Zahara/static
    // fallback). Empty for Zahara, so its previews are unchanged.
    window.ADMIN_SITE_SUFFIX = ${JSON.stringify(site === 'rooftop' ? '&site=rooftop' : '')};
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
