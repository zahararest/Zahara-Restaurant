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
import { readMediaMap, videoFilename, type MediaEnv } from '../data/media';
import {
  readContentOwn, galleryCaptionKey, GALLERY_CAPTION_KEYS,
  type ContentEnv, type ContentValue,
} from '../data/content';
import { adminSite, siteScope, type Site } from '../data/site';

interface Env extends AuthEnv, ContentEnv, MediaEnv { IMAGES?: R2Bucket; }

const GALLERY_CAPTION_SET = new Set<string>(GALLERY_CAPTION_KEYS);

const STYLE = `
  /* The hidden attribute has to win. Several blocks below set an explicit display, and a
     class rule beats the user-agent's [hidden] { display: none } every time —
     which is how the "behind the photo" control and the video tool row ended
     up visible in states that had nothing to put in them. */
  [hidden] { display: none !important; }
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
  /* ── Page tabs ─────────────────────────────────────────────────────
     These used to be "jump" chips that scrolled a single 30-card page. On a
     list that long, scrolling to a heading still leaves you unsure what you
     are looking at — so they now FILTER, exactly the way the Desktop/Mobile
     tabs above them do. One page at a time, and the two choices compose:
     "Home page" + "Mobile" shows the home page's portrait crops and nothing
     else. */
  .pagetabs { display: flex; gap: 0.3rem; flex-wrap: wrap; }
  .pagetab {
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
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    transition: color 0.2s, background 0.2s, border-color 0.2s;
  }
  .pagetab:hover { color: #1a1410; border-color: #9C4621; background: #ece3d0; }
  .pagetab.is-active {
    background: #1a1410; color: #F4EDDF; border-color: #1a1410;
  }
  .pagetab:focus-visible { outline: 2px solid #9C4621; outline-offset: 2px; }
  /* How many photos on that page still have no image — the reason to go
     there, shown before you do. */
  .pagetab__need {
    font-size: 0.66rem;
    font-weight: 700;
    padding: 0 0.32rem;
    border-radius: 999px;
    background: #a53623;
    color: #fff;
  }
  .pagetab__need[hidden] { display: none; }
  /* While a search is running the page tabs are not in effect — say so
     quietly rather than leaving a tab looking selected while results from
     every page are on screen. */
  .pagetabs.is-suspended { opacity: 0.45; }

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

  /* ── Video slots ───────────────────────────────────────────────────
     The card previews the real thing: the video sits over the still in the
     same frame, so what the owner sees is what a visitor gets, and the still
     underneath is visible the moment the video is removed. */
  .card__video {
    position: absolute; inset: 0;
    width: 100%; height: 100%; object-fit: cover;
    display: block; background: #ece3d0;
  }
  /* A video that is uploaded but NOT currently shown still previews here, at
     half strength, so "hidden" looks like a state rather than like the file
     having gone. */
  .card__thumb[data-video-state="hidden"] .card__video { opacity: 0.38; }
  /* One video the browser refuses is not worth a black rectangle: hide it and
     let the photograph underneath show through, with the reason written out
     in the note below the card. */
  .card__video[hidden] { display: none; }
  .card__video-row {
    display: grid; gap: 0.4rem;
    margin-block-start: 0.55rem; padding-block-start: 0.55rem;
    border-block-start: 1px dashed #D5CBB1;
  }
  .card__video-note { margin: 0; font-size: 0.72rem; color: #6f6457; }
  .card__video-note--err { color: #a53623; }
  .card__video-meta {
    margin: 0; font-size: 0.68rem; color: #9a8d77;
    font-family: 'Inter', monospace; letter-spacing: 0.01em;
  }
  .card__badge--video { background: #1F4E5F; color: #fff; }
  .card__badge--video-off { background: #6f6457; color: #fff; }
  /* Deleting a video is the one button here that cannot be undone, so it is
     the one button that doesn't look like its neighbours. Specificity matched
     to .btn--ghost, which sets its own colour. */
  .btn.card__btn-danger { color: #a53623; border-color: #e3b7ad; }
  .btn.card__btn-danger:hover { color: #fff; background: #a53623; border-color: #a53623; }

  /* ── Video framing ──────────────────────────────────────────────────
     A video can't be cropped in the browser the way a photo can, so what is
     offered instead is where it sits in its frame: which part survives the
     crop, whether it is cropped at all, and how fast the loop runs. Each
     control writes to the card's own preview first, so the owner is looking
     at the answer while they drag. */
  .card__video-adjust {
    display: none; gap: 0.5rem;
    margin-block-start: 0.15rem; padding: 0.55rem 0.65rem;
    background: #f3eddc; border: 1px solid #e6dcc4;
  }
  .card__video-adjust.is-open { display: grid; }
  .card__video-adjust .ctl__row { display: flex; justify-content: space-between;
    align-items: baseline; gap: 0.5rem; }
  .card__video-adjust label { font-size: 0.7rem; font-weight: 600; letter-spacing: 0.04em; }
  .card__video-adjust .ctl__val { font-family: 'Inter', monospace; font-size: 0.68rem; color: #6f6457; }
  .card__video-adjust input[type="range"] { width: 100%; accent-color: #9C4621; }
  .card__video-fit { display: flex; gap: 0.35rem; }
  .card__video-fit button {
    flex: 1 1 0; font: inherit; font-size: 0.68rem; letter-spacing: 0.06em;
    text-transform: uppercase; font-weight: 600; padding: 0.34rem 0.4rem;
    border: 1px solid #D5CBB1; background: #fff; color: #6f6457; cursor: pointer;
  }
  .card__video-fit button.is-on { background: #1a1410; border-color: #1a1410; color: #F4EDDF; }

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
  /* Filtered out by the page tabs — distinct from .is-empty (nothing matched
     the search), so the two can't fight over one class. */
  .group.is-off-page { display: none; }
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
    /* The bitmap and the on-screen size are both set in JS, from the stage's
       measured box — a max-height here would shorten the element without
       narrowing it, and squash the picture. max-width stays as a backstop. */
    max-width: 100%;
    cursor: grab;
    box-shadow: 0 6px 30px rgba(0,0,0,0.3);
    background: #1a1410;
    /* The canvas handles its own drag and pinch, so the browser must not
       also scroll or zoom the page underneath the finger. */
    touch-action: none;
    -webkit-user-select: none; user-select: none;
  }
  .editor__canvas:active { cursor: grabbing; }
  /* A line under the canvas that says, in numbers, what will be uploaded —
     so "how much am I cutting off" is never a guess. */
  .editor__readout {
    margin: 0.5rem 0 0; text-align: center;
    font-family: 'Inter', monospace; font-size: 0.68rem; color: #6f6457;
  }
  .editor__readout b { color: #1a1410; font-weight: 600; }
  .editor__readout--warn { color: #8a4b12; }
  .editor__stagewrap { display: grid; align-content: center; justify-items: center; width: 100%; }
  @media (max-width: 760px) {
    /* On a phone the picture is the whole job — give it the room, and keep
       the controls one thumb-scroll below rather than squeezed beside it. */
    .editor { padding: 0; }
    .editor__panel { width: 100%; }
    .editor__stage { padding: 0.6rem; min-height: 0; }
  }
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

    // ── View tabs (Desktop / Mobile) + page tabs ──────────────────────
    // Two axes, one grid: WHICH SET (desktop photo / phone portrait crop) and
    // WHICH PAGE. Both are tabs, both filter, and they compose — so the list
    // on screen is always one page's photos in one set, never all thirty at
    // once. Search cuts across both: a query looks everywhere, because "where
    // did I put that photo" is exactly when the page filter is in the way.
    const views = Array.prototype.slice.call(document.querySelectorAll('[data-view]'));
    const viewTabs = Array.prototype.slice.call(document.querySelectorAll('[data-view-tab]'));
    const pagetabs = document.getElementById('pagetabs');
    const searchInput = document.getElementById('img-search');
    // The PAGE, not the section element: each view has its own copy of every
    // group (g-desktop-home / g-mobile-home), so keying off the DOM id would
    // drop the selection on every Desktop↔Mobile switch.
    let activePage = '';   // '' until the first buildPageTabs() picks one

    function activeView() {
      return views.find((v) => v.classList.contains('is-active')) || views[0];
    }
    function pageGroups() {
      const v = activeView();
      return v ? Array.prototype.slice.call(v.querySelectorAll('.group')) : [];
    }
    /** Rebuild the page tabs for the current view and make sure the selected
     *  page still exists in it — the mobile set is a subset, so a page with no
     *  portrait crops has no tab there and the selection has to move. */
    function buildPageTabs() {
      if (!pagetabs) return;
      const groups = pageGroups();
      // The mobile set is a subset — a page with no portrait crops has no tab
      // here, so a selection pointing at one has to move rather than filter
      // everything away.
      if (!groups.some((g) => g.dataset.groupKey === activePage)) {
        activePage = groups.length ? groups[0].dataset.groupKey : '';
      }
      pagetabs.innerHTML = groups.map((g) => {
        const key = g.dataset.groupKey;
        const need = Array.prototype.slice.call(g.querySelectorAll('[data-photo-card]'))
          .filter((c) => cardState(c) === 'attention').length;
        return '<button type="button" class="pagetab' +
          (key === activePage ? ' is-active' : '') + '" data-page="' + escA(key) + '"' +
          (key === activePage ? ' aria-current="true"' : '') + '>' +
          escA(g.dataset.groupLabel || '') +
          '<span class="pagetab__need"' + (need ? '' : ' hidden') + '>' + need + '</span>' +
          '</button>';
      }).join('');
    }
    function setPage(id) {
      activePage = id;
      applySearch();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    function setView(name) {
      views.forEach((v) => v.classList.toggle('is-active', v.dataset.view === name));
      viewTabs.forEach((t) => t.classList.toggle('is-active', t.dataset.viewTab === name));
      buildPageTabs();     // may move activePage before the filter runs
      applySearch();
    }
    viewTabs.forEach((t) => t.addEventListener('click', () => setView(t.dataset.viewTab)));
    if (pagetabs) {
      pagetabs.addEventListener('click', (e) => {
        const tab = e.target.closest('[data-page]');
        if (tab) setPage(tab.dataset.page);
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
      // A search is a "find it wherever it is" request, so it suspends the
      // page filter rather than searching inside one page and reporting
      // nothing. Clearing the box drops straight back to the chosen page.
      const searching = q !== '';
      v.querySelectorAll('.group').forEach((group) => {
        const onPage = searching || group.dataset.groupKey === activePage;
        let shown = 0;
        group.querySelectorAll('[data-photo-card]').forEach((card) => {
          const hay = card.dataset.search || '';
          const matchQ = !q || hay.indexOf(q) !== -1;
          const matchF = activeFilter === 'all' || cardState(card) === activeFilter;
          card.classList.toggle('is-hidden', !(matchQ && matchF));
          if (matchQ && matchF) shown++;
        });
        group.classList.toggle('is-empty', shown === 0);
        group.classList.toggle('is-off-page', !onPage);
      });
      if (pagetabs) {
        pagetabs.classList.toggle('is-suspended', searching);
        Array.prototype.slice.call(pagetabs.querySelectorAll('[data-page]')).forEach((t) => {
          t.classList.toggle('is-active', !searching && t.dataset.page === activePage);
        });
      }
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
    // which is the complete list (the mobile view is a subset). Deliberately
    // NOT narrowed to the current page: it is the whole job's progress bar.
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

    // ── Card video previews ───────────────────────────────────────────
    // Why this exists at all: a <video> with preload="metadata" and no poster
    // paints BLACK in Safari until it has decoded a frame, and it will not
    // decode one unprompted. That is what put a black rectangle over every
    // video slot in this panel — the file was fine, the element just had
    // nothing to show. Three things fix it, and all three are needed:
    //
    //   • every preview carries the slot's still as its poster, so the frame
    //     is never empty even before a byte of video arrives;
    //   • it actually PLAYS, muted and looping, while it is on screen, so the
    //     card shows what a visitor sees rather than a frozen first frame;
    //   • a video the browser can't decode hides itself and says why, instead
    //     of sitting there as a black box with no explanation.
    const ZAHARA_VIDEO_PREVIEW = (function () {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

      function start(v) {
        if (v.dataset.previewFailed) return;
        // Under reduced motion, pull a single frame instead of looping. The
        // card still shows the video rather than a black rectangle.
        if (reduce.matches) { try { if (!v.currentTime) v.currentTime = 0.1; } catch (e) {} return; }
        const pr = v.play();
        if (pr && pr.catch) pr.catch(function () {
          // Autoplay refused: fall back to a still frame so the card is never
          // blank, and never treat it as a broken file.
          try { if (!v.currentTime) v.currentTime = 0.1; } catch (e) {}
        });
      }

      const io = 'IntersectionObserver' in window
        ? new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
              if (e.isIntersecting) start(e.target);
              else if (!e.target.paused) e.target.pause();
            });
          }, { rootMargin: '250px 0px' })
        : null;

      function fail(v, why) {
        v.dataset.previewFailed = '1';
        v.hidden = true;
        try { v.pause(); } catch (e) {}
        const card = v.closest('[data-photo-card]');
        const note = card && card.querySelector('[data-video-note]');
        if (note) {
          note.classList.add('card__video-note--err');
          note.textContent = why;
        }
      }

      function watch(v) {
        if (v.dataset.previewWatched) return;
        v.dataset.previewWatched = '1';
        v.addEventListener('error', function () {
          fail(v, 'This video will not play in a browser. Replace it with an H.264 MP4 — ' +
                  'iPhone clips recorded in HEVC look fine on the phone and play nowhere else.');
        });
        // Loads cleanly but carries no picture: an audio-only file, or a video
        // track this browser can't decode. It reports a healthy readyState and
        // fires no error, so nothing else would ever catch it.
        v.addEventListener('loadeddata', function () {
          if (!v.videoWidth || !v.videoHeight) {
            fail(v, 'This file has no picture a browser can show — only sound, or a ' +
                    'video track it cannot decode. Replace it with an H.264 MP4.');
          }
        });
        if (io) io.observe(v);
        else start(v);
      }

      /** Nudge a preview back into motion after its source changed — swapping
       *  src stops playback, and the observer fired long ago. Re-observing asks
       *  it again rather than playing blind, so a card below the fold doesn't
       *  start decoding just because a button was pressed. */
      function resume(v) {
        if (!v) return;
        delete v.dataset.previewFailed;
        v.hidden = false;
        if (io) { io.unobserve(v); io.observe(v); }
        else start(v);
      }

      return { watch: watch, resume: resume };
    })();
    function watchVideo(v) { ZAHARA_VIDEO_PREVIEW.watch(v); }
    document.querySelectorAll('[data-card-video]').forEach(watchVideo);

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
      const videoFile    = card.querySelector('[data-input-video]');
      const videoBtn     = card.querySelector('[data-btn-video]');
      const videoHideBtn = card.querySelector('[data-btn-video-hide]');
      const videoShowBtn = card.querySelector('[data-btn-video-show]');
      const videoDelBtn  = card.querySelector('[data-btn-video-delete]');
      const videoTools   = card.querySelector('[data-video-tools]');
      const videoAdjBtn  = card.querySelector('[data-btn-video-adjust]');
      const videoAdjust  = card.querySelector('[data-video-adjust]');
      const videoNote    = card.querySelector('[data-video-note]');
      const videoMeta    = card.querySelector('[data-video-meta]');

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
        updateCount();     // the badge just changed — keep the progress line honest
        buildPageTabs();   // …and the per-page "needs a photo" counts with it
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
            buildPageTabs();
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

      // ── Video: use one instead of the photo, and switch back freely ──
      // Deliberately NOT routed through the crop editor above. That editor
      // re-encodes whatever it is given as a JPEG through a canvas, which is
      // exactly the wrong thing to do to a video — so a video goes straight to
      // its own endpoint, untouched.
      //
      // Three states, and the card can be in any of them:
      //   no file           → offer to upload one
      //   file, hidden      → preview it at half strength, offer to show it
      //   file, showing     → preview it, offer to go back to the photograph
      // Nothing here deletes the video except the button that says it does.
      if (videoBtn) {
        const MAX_VIDEO = 40 * 1024 * 1024;

        function rejectVideo(f) {
          if (!/^video\\/(mp4|webm|quicktime)$/.test(f.type || '')) {
            return 'That file isn\\'t a video we can use. Please pick an MP4 or a WebM.';
          }
          if (f.size > MAX_VIDEO) {
            return 'That video is ' + Math.round(f.size / 1024 / 1024) + ' MB — the limit is 40 MB. ' +
                   'A 10–20 second clip at 1080p is usually well under it.';
          }
          return null;
        }

        /** Ask THIS browser whether it can actually show the file, before 40 MB
         *  go over a hotel wifi to a bucket. An iPhone records HEVC by default:
         *  it uploads fine, Safari plays it, and Chrome, Edge and Firefox show
         *  the photograph instead with no error anywhere — which is exactly the
         *  "it uploaded but nothing happens" that has no visible cause. A file
         *  that reports no width here will report none to a visitor either. */
        function inspectVideo(f) {
          return new Promise((resolve) => {
            const url = URL.createObjectURL(f);
            const el  = document.createElement('video');
            el.muted = true; el.preload = 'metadata'; el.src = url;
            let settled = false;
            const done = (res) => {
              if (settled) return;
              settled = true;
              URL.revokeObjectURL(url);
              resolve(res);
            };
            el.addEventListener('loadedmetadata', () => done({
              ok: el.videoWidth > 0 && el.videoHeight > 0,
              w: el.videoWidth, h: el.videoHeight, duration: el.duration,
            }));
            el.addEventListener('error', () => done({ ok: false, w: 0, h: 0, duration: 0 }));
            // A browser that never answers shouldn't block the upload — the
            // server checks the file's brands too.
            setTimeout(() => done({ ok: true, unknown: true, w: 0, h: 0, duration: 0 }), 6000);
          });
        }

        async function postVideo(fd) {
          fd.append('key', key);
          if (isMobile) fd.append('variant', 'mobile');
          const res  = await fetch('/admin/images/video', { method: 'POST', body: fd });
          const data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || 'Failed');
          return data;
        }

        function videoEl() { return card.querySelector('[data-card-video]'); }

        /** Redraw the card from the state the SERVER just reported, rather than
         *  from what the button that was pressed hoped would happen. Every video
         *  endpoint answers with the full state for this reason. */
        function applyState(st) {
          const showing = isMobile ? st.showingMobile : st.showing;
          const hasFile = isMobile ? st.hasMobileFile : st.hasFile;

          let el = videoEl();
          if (hasFile && !el) {
            el = document.createElement('video');
            el.className = 'card__video';
            el.setAttribute('data-card-video', '');
            el.muted = true; el.loop = true; el.playsInline = true; el.preload = 'metadata';
            if (thumb) el.poster = thumb.src;
            if (thumbZone) thumbZone.appendChild(el);
            watchVideo(el);
          }
          if (el) {
            el.hidden = !hasFile;
            if (hasFile) {
              el.style.objectFit = st.fit;
              el.style.objectPosition = st.pos;
              const want = '/videos/' + card.dataset.videoFile + '?t=' + Date.now() + (window.ADMIN_SITE_SUFFIX || '');
              if (el.dataset.videoStamp !== String(st.stamp || '')) {
                el.dataset.videoStamp = String(st.stamp || '');
                el.src = want;
                ZAHARA_VIDEO_PREVIEW.resume(el);
              }
              try { el.playbackRate = st.rate || 1; } catch (e) {}
            } else {
              el.removeAttribute('src');
              try { el.load(); } catch (e) {}
            }
          }

          if (thumbZone) {
            if (hasFile) {
              thumbZone.dataset.hasVideo = '1';
              thumbZone.dataset.videoState = showing ? 'shown' : 'hidden';
            } else {
              delete thumbZone.dataset.hasVideo;
              delete thumbZone.dataset.videoState;
            }
          }

          if (badge) {
            if (showing) {
              badge.className = 'card__badge card__badge--video';
              badge.textContent = isMobile ? 'Video · phone' : 'Video';
            } else if (hasFile) {
              badge.className = 'card__badge card__badge--video-off';
              badge.textContent = 'Video hidden';
            }
            // With no file left the badge depends on the fallback chain and the
            // optional flag, which only the server knows — reloadSoon() below
            // gets the honest answer instead of guessing here.
          }

          if (hasFile) {
            if (missingNote)  missingNote.hidden = true;
            if (optionalNote) optionalNote.hidden = true;
          }

          videoBtn.textContent = hasFile
            ? 'Replace video…'
            : (isMobile ? 'Add a phone cut…' : 'Use a video instead…');
          if (videoHideBtn) videoHideBtn.hidden = !showing;
          if (videoShowBtn) videoShowBtn.hidden = !(hasFile && !showing);
          if (videoTools)   videoTools.hidden   = !hasFile;
          if (!hasFile && videoAdjust) videoAdjust.classList.remove('is-open');

          if (videoNote) {
            videoNote.classList.remove('card__video-note--err');
            videoNote.textContent = showing
              ? 'Showing the video. The photo is still here — “Back to the photo” brings it back without deleting anything.'
              : (hasFile
                  ? 'The video is saved but hidden — visitors see the photo. “Show the video” puts it back.'
                  : (isMobile
                      ? 'Optional. A portrait cut of the same clip, used on phones.'
                      : 'MP4 or WebM (H.264), up to 40 MB. Silent and looping — the photo stays as its first frame.'));
          }
          if (videoMeta) {
            const bytes = isMobile ? st.mobileSize : st.size;
            if (hasFile && bytes) {
              videoMeta.hidden = false;
              videoMeta.textContent = (Math.round(bytes / 1024 / 1024 * 10) / 10) + ' MB' +
                (st.type && !isMobile ? ' · ' + st.type.replace('video/', '').toUpperCase() : '');
            } else {
              videoMeta.hidden = true;
              videoMeta.textContent = '';
            }
          }
          syncAdjust(st);
          updateCount();
          buildPageTabs();
          try { new BroadcastChannel('zahara-images').postMessage({ key: key, action: 'video' }); } catch (_) {}
        }

        videoBtn.addEventListener('click', () => { if (videoFile) videoFile.click(); });

        if (videoFile) videoFile.addEventListener('change', async () => {
          const f = videoFile.files && videoFile.files[0];
          videoFile.value = '';
          if (!f) return;
          const bad = rejectVideo(f);
          if (bad) { setStatus(bad, true); return; }

          setBusy('Checking video…');
          setStatus('Checking that this video will play…', false);
          const probe = await inspectVideo(f);
          if (!probe.ok) {
            setBusy('');
            setStatus(
              'This browser can\\'t play that video, so most visitors couldn\\'t either — ' +
              'usually an iPhone HEVC clip. On the iPhone: Settings → Camera → Formats → ' +
              '“Most Compatible”, then re-record or re-export it. An H.264 MP4 always works.',
              true,
            );
            return;
          }

          setBusy('Uploading video…');
          setStatus('Uploading — a video takes longer than a photo.', false);
          try {
            const fd = new FormData();
            fd.append('file', f);
            const st = await postVideo(fd);
            st.stamp = Date.now();
            applyState(st);
            const dims = probe.w ? ' · ' + probe.w + '×' + probe.h : '';
            setStatus('Saved' + dims + '. The preview above is the same file the site serves. ' +
                      'Give the live page up to half a minute to pick it up.', false);
          } catch (err) {
            setStatus(String(err.message || err), true);
          } finally {
            setBusy('');
          }
        });

        /** Run one of the switch actions and redraw. reloadAfter is for the
         *  cases where what the card should say next depends on the fallback
         *  chain, the optional flag and the venue — three things the server
         *  already knows and the browser would have to re-derive. */
        async function videoAction(action, busyLabel, okMsg, reloadAfter) {
          setBusy(busyLabel);
          try {
            const fd = new FormData();
            fd.append('action', action);
            const st = await postVideo(fd);
            st.stamp = Date.now();
            if (reloadAfter) { location.reload(); return; }
            applyState(st);
            setStatus(okMsg, false);
          } catch (err) {
            setStatus(String(err.message || err), true);
          } finally {
            setBusy('');
          }
        }

        if (videoHideBtn) videoHideBtn.addEventListener('click', () => {
          videoAction('hide', 'Switching…',
            'Back to the photo. The video is kept — press “Show the video” any time. ' +
            'The live page can take up to half a minute to catch up.', false);
        });

        if (videoShowBtn) videoShowBtn.addEventListener('click', () => {
          videoAction('show', 'Switching…',
            'Showing the video again. The live page can take up to half a minute to catch up.', false);
        });

        if (videoDelBtn) videoDelBtn.addEventListener('click', () => {
          if (!confirm(
            'Delete this video for good?\\n\\n' +
            'The photograph stays. If you only want visitors to see the photo ' +
            'for now, press “Back to the photo” instead — that keeps the video ' +
            'so you can bring it back later.'
          )) return;
          videoAction('delete', 'Deleting…', 'Video deleted.', true);
        });

        // ── Framing ────────────────────────────────────────────────────────
        // A video can't be re-cropped in a canvas the way a photo can, so what
        // the owner gets is where it sits in its frame. Every control paints
        // the card's own preview immediately and only then offers to save, so
        // the drag is the preview rather than a guess followed by a reload.
        const fitBox  = card.querySelector('[data-video-fit]');
        const posX    = card.querySelector('[data-video-posx]');
        const posY    = card.querySelector('[data-video-posy]');
        const posXV   = card.querySelector('[data-video-posx-v]');
        const posYV   = card.querySelector('[data-video-posy-v]');
        const rateIn  = card.querySelector('[data-video-rate]');
        const rateV   = card.querySelector('[data-video-rate-v]');
        const saveB   = card.querySelector('[data-btn-video-save]');
        const resetB  = card.querySelector('[data-btn-video-reset]');
        let chosenFit = (card.querySelector('[data-video-fit] .is-on') || {}).dataset
          ? card.querySelector('[data-video-fit] .is-on').dataset.fit : 'cover';

        function syncAdjust(st) {
          if (!st || !fitBox) return;
          chosenFit = st.fit;
          Array.prototype.forEach.call(fitBox.querySelectorAll('button'), (b) => {
            b.classList.toggle('is-on', b.dataset.fit === st.fit);
          });
          const m = /^(\\d{1,3})% (\\d{1,3})%$/.exec(st.pos || '50% 50%');
          if (posX) posX.value = m ? m[1] : '50';
          if (posY) posY.value = m ? m[2] : '50';
          if (rateIn) rateIn.value = String(st.rate || 1);
          paintFraming();
        }

        function paintFraming() {
          const x = posX ? posX.value : '50';
          const y = posY ? posY.value : '50';
          const r = rateIn ? parseFloat(rateIn.value) : 1;
          if (posXV) posXV.textContent = x + '%';
          if (posYV) posYV.textContent = y + '%';
          if (rateV) rateV.textContent = r.toFixed(2) + '×';
          const el = videoEl();
          if (el) {
            el.style.objectFit = chosenFit;
            el.style.objectPosition = x + '% ' + y + '%';
            try { el.playbackRate = r; } catch (e) {}
          }
          // The focal point only does anything while the video is being
          // cropped — say so rather than leaving two sliders that appear dead.
          const posLabel = card.querySelector('[data-video-posx-label]');
          if (posLabel) {
            posLabel.textContent = chosenFit === 'contain'
              ? 'Keep this part · across (no crop, so nothing to choose)'
              : 'Keep this part · across';
          }
        }

        if (videoAdjBtn && videoAdjust) {
          videoAdjBtn.addEventListener('click', () => {
            const open = videoAdjust.classList.toggle('is-open');
            videoAdjBtn.textContent = open ? 'Done adjusting' : 'Adjust…';
          });
        }
        if (fitBox) fitBox.addEventListener('click', (e) => {
          const b = e.target.closest('button[data-fit]');
          if (!b) return;
          chosenFit = b.dataset.fit;
          Array.prototype.forEach.call(fitBox.querySelectorAll('button'), (x) => {
            x.classList.toggle('is-on', x === b);
          });
          paintFraming();
        });
        [posX, posY, rateIn].forEach((el) => {
          if (el) el.addEventListener('input', paintFraming);
        });
        if (resetB) resetB.addEventListener('click', () => {
          chosenFit = 'cover';
          if (fitBox) Array.prototype.forEach.call(fitBox.querySelectorAll('button'), (b) => {
            b.classList.toggle('is-on', b.dataset.fit === 'cover');
          });
          if (posX) posX.value = '50';
          if (posY) posY.value = '50';
          if (rateIn) rateIn.value = '1';
          paintFraming();
        });
        if (saveB) saveB.addEventListener('click', async () => {
          setBusy('Saving…');
          try {
            const fd = new FormData();
            fd.append('action', 'options');
            fd.append('fit', chosenFit);
            fd.append('pos', (posX ? posX.value : '50') + '% ' + (posY ? posY.value : '50') + '%');
            fd.append('rate', rateIn ? rateIn.value : '1');
            const st = await postVideo(fd);
            applyState(st);
            setStatus('Framing saved. The live page can take up to half a minute to catch up.', false);
          } catch (err) {
            setStatus(String(err.message || err), true);
          } finally {
            setBusy('');
          }
        });
        paintFraming();
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
      const readout = document.getElementById('ed-readout');

      const inputs = {
        grayscale:  document.getElementById('ed-grayscale'),
        brightness: document.getElementById('ed-brightness'),
        contrast:   document.getElementById('ed-contrast'),
        saturate:   document.getElementById('ed-saturate'),
        zoom:       document.getElementById('ed-zoom'),
        straighten: document.getElementById('ed-straighten'),
        width:      document.getElementById('ed-width'),
        quality:    document.getElementById('ed-quality'),
        edge:       document.getElementById('ed-edge'),
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
      const viewB    = document.getElementById('ed-view');
      const fitAllB  = document.getElementById('ed-fitall');
      const edgeCtl  = document.getElementById('ed-edge-ctl');

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

      // ── Two ways to look at the same crop ─────────────────────────────
      // 'whole' draws the ENTIRE photograph with the crop marked on top of
      // it; 'frame' draws only what will be uploaded. The editor opens in
      // 'whole' because the question being answered is "what am I cutting
      // off", and a preview that shows only the keeper cannot answer it —
      // which is what made a 9:16 phone crop of a landscape photo look like
      // the rest of the picture had gone missing.
      let viewMode = 'whole';
      // Blurred backdrop cache, rebuilt only when the source or the fill
      // changes — not on every frame of a drag.
      let edgeTile = null;

      // Stage sizing. The canvas used to be a fixed 460px box; on a phone that
      // is most of the screen spent on letterboxing. Measure the stage instead.
      function stageBox() {
        const stage = canvas.parentElement && canvas.parentElement.parentElement;
        const w = stage ? Math.max(260, stage.clientWidth - 32) : 460;
        const h = Math.max(300, Math.round(window.innerHeight * (window.innerWidth <= 760 ? 0.5 : 0.7)));
        return { w: Math.min(w, 760), h: h };
      }

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
      // the 90 degree rotation, horizontal/vertical flip, and the fine
      // straighten angle. The straighten uses a cover-scale (enlarge just
      // enough that the tilted image still fills the frame) so there are never
      // transparent corners — the classic reason to reach for a desktop photo
      // app.
      function buildWork() {
        edgeTile = null;
        if (!img) { work = null; return; }
        const rot90 = rotation % 180 !== 0;
        const w = rot90 ? img.naturalHeight : img.naturalWidth;
        const h = rot90 ? img.naturalWidth  : img.naturalHeight;
        const fine = fineDeg() * Math.PI / 180;
        if (rotation === 0 && !flipH && !flipV && fine === 0) {
          work = { el: img, w: img.naturalWidth, h: img.naturalHeight };
          return;
        }
        // Minimal uniform scale so a w x h frame stays covered after rotating
        // by the fine angle (exact for same-frame rotation).
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

      // ── Zooming out past the edges ────────────────────────────────────
      // Zoom 1 is "the biggest crop of this shape that fits inside the
      // photo", which used to also be the floor — so a tall 9:16 slot fed a
      // landscape photo could only ever show a narrow slice of it, and no
      // amount of dragging revealed more. Below 1 the crop grows past the
      // photograph: the whole picture fits in the frame with something behind
      // it, and the export is still exactly the shape and pixel size this slot
      // needs. minZoom is where the picture fits entirely; a little below that
      // leaves breathing room around it.
      function fitWholeZoom() {
        if (!work) return 1;
        const b = baseCrop();
        return Math.min(b.sw / work.w, b.sh / work.h);
      }
      function minZoom() { return Math.max(0.05, fitWholeZoom() * 0.8); }

      function syncZoomBounds() {
        if (!inputs.zoom || !work) return;
        const lo = minZoom();
        inputs.zoom.min = lo.toFixed(3);
        if (zoom() < lo) inputs.zoom.value = lo.toFixed(3);
      }

      // Source-pixel crop rect for the current zoom + centre. Below zoom 1 the
      // rect deliberately extends outside the source; the centre still moves
      // within the photo, so dragging slides the picture inside the frame.
      function cropRect() {
        const z = zoom();
        const b = baseCrop();
        const sw = b.sw / z, sh = b.sh / z;
        let sx = cx * work.w - sw / 2;
        let sy = cy * work.h - sh / 2;
        if (sw <= work.w) sx = clamp(sx, 0, work.w - sw);
        if (sh <= work.h) sy = clamp(sy, 0, work.h - sh);
        return { sx: sx, sy: sy, sw: sw, sh: sh };
      }

      /** True when part of the frame is not photograph — i.e. the fill colour
       *  is actually going to show. */
      function hasMargins() {
        if (!work) return false;
        const c = cropRect();
        return c.sx < -0.5 || c.sy < -0.5 ||
               c.sx + c.sw > work.w + 0.5 || c.sy + c.sh > work.h + 0.5;
      }

      // What the canvas is looking at, in source pixels. In 'frame' view that
      // is exactly the crop; in 'whole' view it is the crop and the whole
      // photograph together, so neither can be dragged out of sight.
      function viewBox() {
        const c = cropRect();
        if (viewMode === 'frame' || comparing) {
          if (comparing) {
            const pad = Math.max(work.w, work.h) * 0.03;
            return { x: -pad, y: -pad, w: work.w + pad * 2, h: work.h + pad * 2 };
          }
          return { x: c.sx, y: c.sy, w: c.sw, h: c.sh };
        }
        const x0 = Math.min(0, c.sx), y0 = Math.min(0, c.sy);
        const x1 = Math.max(work.w, c.sx + c.sw), y1 = Math.max(work.h, c.sy + c.sh);
        const pad = Math.max(x1 - x0, y1 - y0) * 0.05;
        return { x: x0 - pad, y: y0 - pad, w: (x1 - x0) + pad * 2, h: (y1 - y0) + pad * 2 };
      }

      /** Canvas pixel size. In 'crop only' view the canvas IS the crop, so it
       *  carries the slot's aspect ratio exactly and what is on screen is
       *  literally what uploads. In 'whole photo' view it takes the whole
       *  stage and stays that size: the view box inside it grows and shrinks
       *  with the zoom, but the element itself never resizes mid-drag, which
       *  it would if it tracked the content. */
      function sizeCanvas() {
        const box = stageBox();
        const v   = viewBox();
        // Shape the element to what is being looked at, so there is no dead
        // ground around the picture. While the crop sits inside the photo the
        // view box IS the photo, so this is steady through a drag; it only
        // grows once the zoom goes past the edges, which is the moment the
        // frame is supposed to be seen growing.
        const ar = (viewMode === 'frame' && !comparing) ? targetAR : (v.w / v.h);
        let pw = box.w, ph = Math.round(pw / ar);
        if (ph > box.h) { ph = box.h; pw = Math.round(ph * ar); }
        pw = Math.max(1, pw); ph = Math.max(1, ph);
        // Draw at the screen's real pixel density. The crop outline is a
        // one-pixel line and the corner marks are what the owner aims at, so a
        // preview rendered at half the display's resolution reads as blurry
        // guesswork on every retina screen — which is most of them.
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.style.width  = pw + 'px';
        canvas.style.height = ph + 'px';
        canvas.width  = Math.round(pw * dpr);
        canvas.height = Math.round(ph * dpr);
      }

      function syncLabels() {
        vals.grayscale.textContent  = inputs.grayscale.value + '%';
        vals.brightness.textContent = inputs.brightness.value + '%';
        vals.contrast.textContent   = inputs.contrast.value + '%';
        vals.saturate.textContent   = inputs.saturate.value + '%';
        vals.zoom.textContent       = zoom().toFixed(2) + 'x';
        if (rotateV) rotateV.textContent = rotation + '°';
        if (vals.straighten) vals.straighten.textContent = (fineDeg() > 0 ? '+' : '') + fineDeg().toFixed(1) + '°';
        bwChip.classList.toggle('is-on', inputs.grayscale.value === '100');
        if (flipHB) flipHB.classList.toggle('is-on', flipH);
        if (flipVB) flipVB.classList.toggle('is-on', flipV);
        if (viewB) {
          viewB.classList.toggle('is-on', viewMode === 'whole');
          viewB.textContent = viewMode === 'whole' ? 'Whole photo' : 'Crop only';
        }
        if (edgeCtl) edgeCtl.hidden = !hasMargins();
      }

      /** The line under the canvas: the exported size, and how much of the
       *  photograph it keeps. */
      function syncReadout() {
        if (!readout || !work) return;
        const out = outputSize();
        const c   = cropRect();
        // How wide the PHOTOGRAPH itself lands in that file — the number that
        // decides whether it looks sharp, which is not the same as the file's
        // own width once there are margins around it.
        const photoW = Math.round(out.w * Math.min(c.sw, work.w) / c.sw);
        const kept   = Math.round(
          (Math.min(c.sw, work.w) / work.w) * (Math.min(c.sh, work.h) / work.h) * 100);
        const minW = (ctxState && ctxState.variant === 'mobile') ? 700 : 1200;
        readout.innerHTML = hasMargins()
          ? 'Uploads at <b>' + out.w + ' × ' + out.h + '</b> — exactly the shape this slot needs, ' +
            'with the whole photo ' + photoW + ' px wide inside it'
          : 'Uploads at <b>' + out.w + ' × ' + out.h + '</b> — keeping about <b>' + kept + '%</b> of the photo';
        readout.classList.toggle('editor__readout--warn', photoW < minW);
      }

      /** Source pixels → canvas pixels: one uniform scale, centred, so the
       *  picture is never stretched to fill a box of a different shape. */
      function mapper() {
        const v  = viewBox();
        const k  = Math.min(canvas.width / v.w, canvas.height / v.h);
        const ox = (canvas.width  - v.w * k) / 2;
        const oy = (canvas.height - v.h * k) / 2;
        return {
          k: k, kx: k, ky: k,
          x: function (sx) { return ox + (sx - v.x) * k; },
          y: function (sy) { return oy + (sy - v.y) * k; },
          sx: function (px) { return v.x + (px - ox) / k; },
          sy: function (py) { return v.y + (py - oy) / k; },
        };
      }

      function edgeColor() {
        const mode = inputs.edge ? inputs.edge.value : 'blur';
        if (mode === 'paper') return '#F4EDDF';
        if (mode === 'white') return '#ffffff';
        return '#141210';
      }

      /** A blurred copy of the photo, for the frame behind it when zoomed out.
       *  Built by shrinking to a thumbnail and letting the browser's smoothing
       *  do the blurring on the way back up — which works in every browser,
       *  unlike ctx.filter, and costs nothing to redraw. */
      function edgeSource() {
        if (edgeTile) return edgeTile;
        const tw = 28, th = Math.max(1, Math.round(tw * (work.h / work.w)));
        const c = document.createElement('canvas');
        c.width = tw; c.height = th;
        const cc = c.getContext('2d');
        cc.drawImage(work.el, 0, 0, work.w, work.h, 0, 0, tw, th);
        edgeTile = c;
        return c;
      }

      /** Paint the frame's backdrop into a context whose (0,0)-(dw,dh) is the
       *  crop rectangle. Only called when the crop reaches past the photo. */
      function paintEdges(g, dw, dh) {
        const mode = inputs.edge ? inputs.edge.value : 'blur';
        if (mode !== 'blur') {
          g.fillStyle = edgeColor();
          g.fillRect(0, 0, dw, dh);
          return;
        }
        g.fillStyle = '#141210';
        g.fillRect(0, 0, dw, dh);
        const tile = edgeSource();
        const scale = Math.max(dw / tile.width, dh / tile.height);
        const bw = tile.width * scale, bh = tile.height * scale;
        g.save();
        g.imageSmoothingEnabled = true;
        g.globalAlpha = 0.85;
        g.drawImage(tile, (dw - bw) / 2, (dh - bh) / 2, bw, bh);
        g.restore();
      }

      function drawPreview() {
        if (!work) return;
        syncZoomBounds();
        sizeCanvas();
        const m = mapper();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (comparing) {
          // Hold to see the whole, untouched photograph.
          ctx.fillStyle = '#1a1410';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(work.el, 0, 0, work.w, work.h,
            m.x(0), m.y(0), work.w * m.kx, work.h * m.ky);
          syncLabels(); syncReadout();
          return;
        }

        const c = cropRect();
        const cxp = m.x(c.sx), cyp = m.y(c.sy);
        const cwp = c.sw * m.kx, chp = c.sh * m.ky;

        // 1. The ground. In 'whole' view everything outside the crop is still
        //    drawn, only dimmed, which is the whole point of this view.
        ctx.fillStyle = '#2a231c';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (viewMode === 'whole') {
          ctx.save();
          ctx.globalAlpha = 0.3;
          ctx.drawImage(work.el, 0, 0, work.w, work.h,
            m.x(0), m.y(0), work.w * m.kx, work.h * m.ky);
          ctx.restore();
        }

        // 2. The crop itself, at full strength, clipped to its rectangle.
        ctx.save();
        ctx.beginPath();
        ctx.rect(cxp, cyp, cwp, chp);
        ctx.clip();
        if (hasMargins()) {
          ctx.save();
          ctx.translate(cxp, cyp);
          paintEdges(ctx, cwp, chp);
          ctx.restore();
        }
        ctx.drawImage(work.el, 0, 0, work.w, work.h,
          m.x(0), m.y(0), work.w * m.kx, work.h * m.ky);
        ctx.restore();

        // 3. Colour adjustments, over the crop area only — what is outside it
        //    is context, not the picture being graded.
        const o = currentOpts();
        if (needsAdjust(o)) {
          const rx = Math.max(0, Math.floor(cxp)), ry = Math.max(0, Math.floor(cyp));
          const rw = Math.min(canvas.width - rx, Math.ceil(cwp)), rh = Math.min(canvas.height - ry, Math.ceil(chp));
          if (rw > 0 && rh > 0) {
            try {
              const id = ctx.getImageData(rx, ry, rw, rh);
              adjustPixels(id.data, o);
              ctx.putImageData(id, rx, ry);
            } catch (err) {
              setStatus('Cannot adjust this image (security restriction): ' + err.message, true);
            }
          }
        }

        // 4. The crop marks. Only in 'whole' view — in 'crop only' view the
        //    canvas edge already is the crop edge.
        if (viewMode === 'whole') drawCropMarks(cxp, cyp, cwp, chp);

        syncLabels();
        syncReadout();
      }

      /** The crop rectangle, drawn so it reads as a frame over the photo: a
       *  bright outline, corner marks to grab, and thirds guides inside. */
      function drawCropMarks(x, y, w, h) {
        ctx.save();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(26,20,16,0.55)';
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        ctx.strokeStyle = 'rgba(255,255,255,0.92)';
        ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);

        ctx.strokeStyle = 'rgba(255,255,255,0.24)';
        ctx.beginPath();
        for (let i = 1; i < 3; i++) {
          ctx.moveTo(x + (w * i) / 3, y);      ctx.lineTo(x + (w * i) / 3, y + h);
          ctx.moveTo(x, y + (h * i) / 3);      ctx.lineTo(x + w, y + (h * i) / 3);
        }
        ctx.stroke();

        const len = Math.max(10, Math.min(24, Math.min(w, h) * 0.16));
        ctx.strokeStyle = '#F4EDDF';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, y + len);         ctx.lineTo(x, y);         ctx.lineTo(x + len, y);
        ctx.moveTo(x + w - len, y);     ctx.lineTo(x + w, y);     ctx.lineTo(x + w, y + len);
        ctx.moveTo(x, y + h - len);     ctx.lineTo(x, y + h);     ctx.lineTo(x + len, y + h);
        ctx.moveTo(x + w - len, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - len);
        ctx.stroke();
        ctx.restore();
      }

      /** The pixel size of what Apply will upload. Always exactly the slot's
       *  aspect ratio: zooming out changes how much photograph is inside the
       *  frame, never the shape or the size of the file that leaves here. */
      function outputSize() {
        const c = cropRect();
        // Never scale the photograph up: one output pixel per source pixel of
        // the crop is the ceiling, whatever size was picked in the menu.
        const natural = Math.max(1, Math.round(c.sw));
        const chosen  = inputs.width.value === 'orig' ? natural : parseInt(inputs.width.value, 10);
        const outW    = Math.max(1, Math.min(chosen, natural));
        return { w: outW, h: Math.max(1, Math.round(outW / targetAR)) };
      }

      // Build the full-resolution output at the target aspect ratio.
      function exportBlob() {
        const c = cropRect();
        const out = outputSize();
        const off = document.createElement('canvas');
        off.width = out.w; off.height = out.h;
        const octx = off.getContext('2d');
        const kx = out.w / c.sw, ky = out.h / c.sh;
        if (hasMargins()) paintEdges(octx, out.w, out.h);
        octx.drawImage(work.el, 0, 0, work.w, work.h,
          (0 - c.sx) * kx, (0 - c.sy) * ky, work.w * kx, work.h * ky);
        const o = currentOpts();
        if (needsAdjust(o)) {
          const id = octx.getImageData(0, 0, out.w, out.h);
          adjustPixels(id.data, o);
          octx.putImageData(id, 0, 0);
        }
        const q = parseFloat(inputs.quality.value);
        return new Promise((resolve, reject) => {
          off.toBlob((b) => b ? resolve({ blob: b, w: out.w, h: out.h }) : reject(new Error('Export failed')), 'image/jpeg', q);
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
        if (inputs.edge) inputs.edge.value = 'blur';
        cx = 0.5; cy = 0.5;
        rotation = 0;
        flipH = false; flipV = false;
        buildWork();
        syncZoomBounds();
        inputs.zoom.value = '1';
        if (inputs.straighten) inputs.straighten.value = '0';
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
            ? 'The bright rectangle is what the site shows — <b>' + arText(targetAR) + '</b>. ' +
              'Drag the photo to move it, pinch or scroll to zoom. Zoom out past the edges to fit more in.'
            : 'Shown whole on the site — fit the full image. Drag to reposition, pinch or scroll to zoom.';
        }
        setStatus('Loading…', false);
        // Default export size depends on the slot.
        inputs.width.value = opts.variant === 'mobile' ? '1280' : '2000';
        inputs.quality.value = '0.85';
        viewMode = 'whole';
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
          syncZoomBounds();
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
        img = null; work = null; ctxState = null; edgeTile = null;
      }

      // ── Wire controls ──
      ['grayscale','brightness','contrast','saturate'].forEach((k) => {
        inputs[k].addEventListener('input', () => { markDirty(); drawPreview(); });
      });
      inputs.zoom.addEventListener('input', () => { markDirty(); drawPreview(); });
      inputs.width.addEventListener('change', () => { markDirty(); syncReadout(); });
      inputs.quality.addEventListener('change', markDirty);
      if (inputs.edge) inputs.edge.addEventListener('change', () => { markDirty(); drawPreview(); });
      bwChip.addEventListener('click', () => {
        inputs.grayscale.value = inputs.grayscale.value === '100' ? '0' : '100';
        markDirty(); drawPreview();
      });
      if (viewB) viewB.addEventListener('click', () => {
        viewMode = viewMode === 'whole' ? 'frame' : 'whole';
        drawPreview();
      });
      if (fitAllB) fitAllB.addEventListener('click', () => {
        if (!work) return;
        syncZoomBounds();
        inputs.zoom.value = fitWholeZoom().toFixed(3);
        cx = 0.5; cy = 0.5;
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

      function setRotation(deg) {
        rotation = ((deg % 360) + 360) % 360;
        buildWork();
        syncZoomBounds();
        markDirty();
        drawPreview();
      }

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
        if (e.key === 'v' || e.key === 'V') { e.preventDefault(); if (viewB) viewB.click(); return; }
      });
      document.addEventListener('keyup', (e) => { if (e.key === ' ') stopCompare(); });

      /** Canvas pixel coordinates for a pointer event. */
      function canvasPoint(e) {
        const rect = canvas.getBoundingClientRect();
        return {
          x: (e.clientX - rect.left) / rect.width  * canvas.width,
          y: (e.clientY - rect.top)  / rect.height * canvas.height,
        };
      }

      // Zoom toward a point on the canvas — keeps whatever is under the finger
      // or the cursor fixed instead of zooming the whole frame from the centre.
      function zoomToPoint(newZoom, px, py) {
        if (!work) return;
        const m = mapper();
        // Absolute source point currently under the pointer.
        const fx = m.sx(px);
        const fy = m.sy(py);
        const before = cropRect();
        // Where that point sits inside the crop, as a fraction of it.
        const rx = (fx - before.sx) / before.sw;
        const ry = (fy - before.sy) / before.sh;
        inputs.zoom.value = clamp(newZoom, minZoom(), parseFloat(inputs.zoom.max)).toFixed(3);
        const z = zoom();
        const b = baseCrop();
        const sw = b.sw / z, sh = b.sh / z;
        // Put the crop back so the same fraction of it is still that point.
        const sx = fx - rx * sw;
        const sy = fy - ry * sh;
        cx = clamp((sx + sw / 2) / work.w, 0, 1);
        cy = clamp((sy + sh / 2) / work.h, 0, 1);
        markDirty();
        drawPreview();
      }
      canvas.addEventListener('wheel', (e) => {
        if (!work) return;
        e.preventDefault();
        const p = canvasPoint(e);
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        zoomToPoint(zoom() * factor, p.x, p.y);
      }, { passive: false });

      // ── Drag to pan, pinch to zoom ────────────────────────────────────
      // Pointer events cover mouse, pen and touch; two fingers are tracked so
      // a phone gets the pinch it expects instead of only a one-finger drag.
      const points = new Map();
      let pinchDist = 0, pinchMid = null;

      function panBy(dxCanvas, dyCanvas) {
        const k = mapper().k;
        if (!k) return;
        cx -= (dxCanvas / k) / work.w;
        cy -= (dyCanvas / k) / work.h;
        cx = clamp(cx, 0, 1); cy = clamp(cy, 0, 1);
      }

      canvas.addEventListener('pointerdown', (e) => {
        if (!work) return;
        canvas.setPointerCapture(e.pointerId);
        points.set(e.pointerId, canvasPoint(e));
        if (points.size === 2) {
          const [a, b] = Array.from(points.values());
          pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
          pinchMid  = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        }
      });
      canvas.addEventListener('pointermove', (e) => {
        if (!work || !points.has(e.pointerId)) return;
        const prev = points.get(e.pointerId);
        const now  = canvasPoint(e);
        points.set(e.pointerId, now);

        if (points.size >= 2) {
          const [a, b] = Array.from(points.values());
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          const mid  = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          if (pinchDist > 0 && dist > 0) {
            // Pan with the midpoint first, then zoom about it — so two fingers
            // move and scale the picture in one gesture.
            panBy(mid.x - pinchMid.x, mid.y - pinchMid.y);
            zoomToPoint(zoom() * (dist / pinchDist), mid.x, mid.y);
          }
          pinchDist = dist; pinchMid = mid;
          return;
        }

        panBy(now.x - prev.x, now.y - prev.y);
        markDirty();
        drawPreview();
      });
      function endPointer(e) {
        points.delete(e.pointerId);
        if (points.size < 2) { pinchDist = 0; pinchMid = null; }
      }
      canvas.addEventListener('pointerup', endPointer);
      canvas.addEventListener('pointercancel', endPointer);
      canvas.addEventListener('pointerleave', endPointer);

      // The canvas is sized from the stage, so a rotated phone or a resized
      // window has to redraw at the new size rather than keep the old box.
      let resizeRaf = 0;
      window.addEventListener('resize', () => {
        if (!root.classList.contains('is-open') || resizeRaf) return;
        resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; drawPreview(); });
      });

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

    // Default view + initial chrome. The tabs are built first so applySearch
    // has a page to filter to (it would otherwise hide everything).
    buildPageTabs();
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
  /** A video is being SHOWN in THIS card's frame — so the badge says Video and
   *  the card offers to switch back to the photograph. */
  hasVideo: boolean;
  /** A video FILE exists for this card's frame, shown or not. This is what
   *  decides whether the card previews it and offers to show / delete it —
   *  a hidden video is still there, and is meant to be easy to bring back. */
  hasVideoFile: boolean;
  /** A desktop video file exists for this slot. The phone card needs to know:
   *  a portrait cut only makes sense once there is a video to cut. */
  hasDesktopVideo: boolean;
  /** How the video sits in its frame — same values the live page uses, so the
   *  card preview and the site agree. */
  videoFit: 'cover' | 'contain';
  videoPosX: number;
  videoPosY: number;
  videoRate: number;
  /** Bytes and content type of the video file, for the line under the card.
   *  Zero / empty when there is no file (or on the phone card, which shares
   *  the desktop clip's framing and doesn't repeat its details). */
  videoSize: number;
  videoType: string;
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

  // Badge state. A live video outranks every still state: it is what the
  // visitor is actually seeing, and saying "Override" while a video plays
  // would send the owner looking for a photo problem that isn't there.
  let badgeClass = '';
  let badgeText  = 'Default';
  if (o.hasVideo) {
    badgeClass = 'card__badge--video'; badgeText = isMobile ? 'Video · phone' : 'Video';
  } else if (o.hasVideoFile) {
    // The file is there, the slot just isn't showing it. Saying "Missing" or
    // "Default" here would send the owner looking for a video they already
    // uploaded.
    badgeClass = 'card__badge--video-off'; badgeText = 'Video hidden';
  } else if (isMobile) {
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

  // A slot with a video in it is not missing anything, whatever its still says
  // — and that stays true while the video is hidden, since one press brings it
  // back.
  const filled = o.hasVideo || o.hasVideoFile;
  const showMissingNote  = !filled && !isMobile && !o.hasOverride && !o.fallbackFromLabel && !p.reserved && !p.optional;
  const showOptionalNote = !filled && !isMobile && !o.hasOverride && !!p.optional;

  // friendly AR label for the corner chip
  const arLabel = isMobile ? '9:16'
    : (p.aspect ? p.aspect.replace(/\s*\/\s*/, ':') : '16:9');

  const where = esc(p.where);

  // The video URL this card previews. Same route the live site uses, so what
  // the owner sees here is literally what a visitor gets.
  const videoPreviewSrc =
    `/videos/${videoFilename(p.filename, isMobile ? 'mobile' : 'desktop')}?t=${o.version}${siteAmp}`;

  const searchHay = `${p.label} ${p.where} ${p.key}`.toLowerCase();

  const captionBlock = (!isMobile && o.caption) ? `
        <div class="card__caption">
          <p class="card__caption-label">Gallery caption <span>shown on this photo</span></p>
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

  // ── Video ────────────────────────────────────────────────────────────────
  // Offered only where a moving image can actually work: a full-frame slot
  // (see `video` in functions/data/photos-map.ts).
  //
  // Two separate facts drive this block, and keeping them apart is the point:
  //   hasVideoFile — a video has been uploaded for this frame
  //   hasVideo     — visitors are seeing it right now
  // So "back to the photo" is a switch that leaves the file alone, and getting
  // the video back is one press. Only "Delete video" removes anything, and it
  // says so first.
  const videoRow = !p.video ? '' : (() => {
    const canCut  = isMobile && !o.hasDesktopVideo;
    const hasFile = o.hasVideoFile;
    const upLabel = hasFile
      ? 'Replace video…'
      : (isMobile ? 'Add a phone cut…' : 'Use a video instead…');
    const note = canCut
      ? 'Add the main video first — this is its phone cut.'
      : (o.hasVideo
          ? 'Showing the video. The photo is still here — “Back to the photo” brings it back without deleting anything.'
          : (hasFile
              ? 'The video is saved but hidden — visitors see the photo. “Show the video” puts it back.'
              : 'MP4 or WebM (H.264), up to 40&nbsp;MB. Silent and looping — the photo stays as its first frame.'));
    const meta = hasFile && o.videoSize
      ? `${Math.round(o.videoSize / 1024 / 1024 * 10) / 10} MB${o.videoType ? ' · ' + o.videoType.replace('video/', '').toUpperCase() : ''}`
      : '';
    return `
        <div class="card__video-row" data-video-row>
          <input class="card__file" type="file" data-input-video accept="video/mp4,video/webm,video/quicktime" />
          <div class="card__row">
            <button class="btn btn--ghost" type="button" data-btn-video${canCut ? ' disabled' : ''}>${upLabel}</button>
            <button class="btn btn--ghost" type="button" data-btn-video-hide${o.hasVideo ? '' : ' hidden'}>Back to the photo</button>
            <button class="btn btn--ghost" type="button" data-btn-video-show${(hasFile && !o.hasVideo) ? '' : ' hidden'}>Show the video</button>
          </div>
          <div class="card__row" data-video-tools${hasFile ? '' : ' hidden'}>
            <button class="btn btn--ghost" type="button" data-btn-video-adjust${isMobile ? ' hidden' : ''}>Adjust…</button>
            <button class="btn btn--ghost card__btn-danger" type="button" data-btn-video-delete>Delete video</button>
          </div>
          ${isMobile ? '' : `
          <div class="card__video-adjust" data-video-adjust>
            <div class="ctl">
              <div class="ctl__row"><label>How it fills the frame</label></div>
              <div class="card__video-fit" data-video-fit>
                <button type="button" data-fit="cover"${o.videoFit !== 'contain' ? ' class="is-on"' : ''}>Fill (crop)</button>
                <button type="button" data-fit="contain"${o.videoFit === 'contain' ? ' class="is-on"' : ''}>Fit whole</button>
              </div>
            </div>
            <div class="ctl">
              <div class="ctl__row"><label data-video-posx-label>Keep this part · across</label><span class="ctl__val" data-video-posx-v>${o.videoPosX}%</span></div>
              <input type="range" data-video-posx min="0" max="100" step="1" value="${o.videoPosX}" />
            </div>
            <div class="ctl">
              <div class="ctl__row"><label>Keep this part · up and down</label><span class="ctl__val" data-video-posy-v>${o.videoPosY}%</span></div>
              <input type="range" data-video-posy min="0" max="100" step="1" value="${o.videoPosY}" />
            </div>
            <div class="ctl">
              <div class="ctl__row"><label>Speed</label><span class="ctl__val" data-video-rate-v>${o.videoRate.toFixed(2)}×</span></div>
              <input type="range" data-video-rate min="0.25" max="2" step="0.05" value="${o.videoRate}" />
            </div>
            <div class="card__row">
              <button class="btn btn--ghost" type="button" data-btn-video-reset>Reset framing</button>
              <button class="btn" type="button" data-btn-video-save>Save framing</button>
            </div>
            <p class="card__video-note" data-video-adjust-note>Applies to the phone cut too.</p>
          </div>`}
          <p class="card__video-note" data-video-note>${note}</p>
          ${meta ? `<p class="card__video-meta" data-video-meta>${esc(meta)}</p>` : '<p class="card__video-meta" data-video-meta hidden></p>'}
        </div>`;
  })();

  return `
    <article class="card" data-photo-card="${esc(p.key)}" data-variant="${o.variant}"
             data-label="${esc(p.label)}" data-aspect="${targetAR.toFixed(5)}" data-fit="${esc(fit)}"
             data-search="${esc(searchHay)}"
             ${p.video ? `data-video-file="${esc(videoFilename(p.filename, isMobile ? 'mobile' : 'desktop'))}"` : ''}
             ${p.optional ? 'data-optional="1"' : ''}
             ${o.fallbackFromLabel ? `data-fallback-label="${esc('Using ' + o.fallbackFromLabel)}"` : ''}>
      <div class="card__thumb" data-thumb-zone${o.hasVideoFile ? ` data-has-video="1" data-video-state="${o.hasVideo ? 'shown' : 'hidden'}"` : ''}>
        <img data-thumb data-src="/${route}/${esc(p.filename)}" data-fallback="${esc(fallback)}"
             src="${esc(src)}" alt="${esc(p.label)}" loading="lazy" decoding="async"
             onerror="this.style.opacity=0.22" />
        ${o.hasVideoFile ? `<video class="card__video" data-card-video muted loop playsinline preload="metadata"
               poster="${esc(src)}" style="object-fit:${o.videoFit};object-position:${o.videoPosX}% ${o.videoPosY}%"
               src="${esc(videoPreviewSrc)}"></video>` : ''}
        <span class="card__badge ${badgeClass}" data-badge>${esc(badgeText)}</span>
        ${tags.length ? `<div class="card__tags">${tags.join('')}</div>` : ''}
        <span class="card__ar">${esc(arLabel)}</span>
      </div>
      <header class="card__head">
        <p class="card__label">${esc(p.label)}</p>
        <p class="card__where">${where}</p>
        <p class="card__token"><code>${esc(p.key)}${isMobile ? ' · mobile' : ''}</code></p>
        <p class="card__missing-note" data-missing-note ${showMissingNote ? '' : 'hidden'}>
          No image yet — replace it to fix.
        </p>
        <p class="card__optional-note" data-optional-note ${showOptionalNote ? '' : 'hidden'}>
          ${esc(p.note ?? 'Optional — add a photo to show it in the home gallery.')}
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
        ${videoRow}
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

  // Which slots are showing a video right now. Read from the manifest rather
  // than derived from the R2 listing above, because the manifest is what the
  // live site reads — if the two ever disagree, the admin should show what the
  // visitor sees, not what the bucket happens to contain.
  const [content, media] = await Promise.all([
    readContentOwn(env, site),
    readMediaMap(env, site),
  ]);

  // …and which slots HAVE a video file, shown or not. That is a question only
  // the bucket can answer, and it is a different question: a video the owner
  // has switched away from is still there to switch back to, and a card that
  // didn't know would offer to upload it again.
  const videoFiles       = new Set<string>();
  const videoMobileFiles = new Set<string>();
  const videoDetail      = new Map<string, { size: number; type: string }>();

  async function collectVideos(from: typeof bucket, keys: Set<string>, mobileKeys: Set<string>) {
    if (!from) return;
    try {
      // httpMetadata has to be asked for — without it the card can't say what
      // format the video is, which is the first thing to check when one won't
      // play.
      const listing = await from.list({ prefix: 'images/', include: ['httpMetadata' as const] });
      for (const obj of listing.objects) {
        const k = obj.key.replace(/^images\//, '');
        if (k.endsWith('__video_mobile'))    mobileKeys.add(k.slice(0, -'__video_mobile'.length));
        else if (k.endsWith('__video')) {
          const base = k.slice(0, -'__video'.length);
          keys.add(base);
          videoDetail.set(base, { size: obj.size, type: obj.httpMetadata?.contentType ?? '' });
        }
      }
    } catch (err) {
      console.warn('[admin/images] R2 video list failed', err);
    }
  }
  await collectVideos(bucket, videoFiles, videoMobileFiles);
  if (site !== 'zahara') {
    // Shared slots live in Zahara's bucket whichever venue is being edited —
    // the same rule the still overrides follow just above.
    const sharedVideos = new Set<string>();
    const sharedMobile = new Set<string>();
    await collectVideos(siteScope(env, 'zahara').images, sharedVideos, sharedMobile);
    for (const p of PHOTO_CATALOGUE) {
      if (!p.shared) continue;
      videoFiles.delete(p.key);
      videoMobileFiles.delete(p.key);
      if (sharedVideos.has(p.key)) videoFiles.add(p.key);
      if (sharedMobile.has(p.key)) videoMobileFiles.add(p.key);
    }
  }

  /** The framing the owner saved for a slot, split into the numbers the card's
   *  sliders want. */
  function videoFraming(key: string) {
    const slot = media[key] ?? {};
    const m = /^(\d{1,3})% (\d{1,3})%$/.exec(slot.pos ?? '');
    return {
      videoFit:  (slot.fit === 'contain' ? 'contain' : 'cover') as 'cover' | 'contain',
      videoPosX: m ? Number(m[1]) : 50,
      videoPosY: m ? Number(m[2]) : 50,
      videoRate: typeof slot.rate === 'number' ? slot.rate : 1,
    };
  }

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
      if (!hasOverride && !fallbackFromLabel && !p.reserved && !p.optional &&
          !videoFiles.has(p.key)) missingCount++;
      const caption = GALLERY_CAPTION_SET.has(p.key) ? (content[galleryCaptionKey(p.key)] ?? {}) : null;
      const detail  = videoDetail.get(p.key);
      return renderCard(p, {
        variant: 'desktop', version: v, hasOverride, hasMobile: mobileSet.has(p.key),
        fallbackFromLabel, caption, site,
        hasVideo: media[p.key]?.d === 'video',
        hasVideoFile: videoFiles.has(p.key),
        hasDesktopVideo: videoFiles.has(p.key),
        videoSize: detail?.size ?? 0,
        videoType: detail?.type ?? '',
        ...videoFraming(p.key),
      });
    }).join('');
    return `
      <section class="group" id="g-desktop-${g}" data-group-key="${g}" data-group-label="${esc(PHOTO_GROUPS[g])}">
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
      renderCard(p, {
        variant: 'mobile', version: v, hasOverride: overrideSet.has(p.key),
        hasMobile: mobileSet.has(p.key), fallbackFromLabel: null, caption: null, site,
        hasVideo: media[p.key]?.m === 'video',
        hasVideoFile: videoMobileFiles.has(p.key),
        hasDesktopVideo: videoFiles.has(p.key),
        videoSize: 0, videoType: '',
        ...videoFraming(p.key),
      }),
    ).join('');
    return `
      <section class="group" id="g-mobile-${g}" data-group-key="${g}" data-group-label="${esc(PHOTO_GROUPS[g])}">
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
         <strong>${missingCount}</strong> photo${missingCount === 1 ? ' has' : 's have'} no image yet.
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
      <nav class="pagetabs" id="pagetabs" role="tablist" aria-label="Which page's photos"></nav>
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
      Drag a picture onto the one you want to replace, or click it — it opens in
      the editor, which shows the <strong>whole photo</strong> with the part the
      site uses marked out. Drag it to move that frame, pinch or scroll to zoom,
      and zoom out past the edges to fit more of the picture in. Then press
      <strong>Apply&nbsp;&amp;&nbsp;upload</strong>.
      <strong>Choose existing</strong> reuses a photo already on the site;
      <strong>Remove</strong> puts the original back.
      JPG, PNG or WebP, up to 10&nbsp;MB.
    </p>
    <p class="lead">
      Some full-frame slots can show a <strong>video</strong> instead — the
      photo underneath is always kept. <strong>Back to the photo</strong> is a
      switch, not a delete: the video stays saved and
      <strong>Show the video</strong> brings it back. Use an
      <strong>H.264 MP4</strong>; an iPhone recording in its default HEVC format
      plays on the phone and nowhere else. Changes can take up to half a minute
      to appear on the live site.
    </p>

    <div class="view is-active" data-view="desktop">
      ${missingBanner}
      ${desktopGroups}
    </div>

    <div class="view" data-view="mobile">
      <p class="view__intro">
        Portrait crops shown on phones. Leave any empty to fall back to the
        desktop photo. These are tall 9:16 frames cut from wide photographs, so
        the editor shows the whole picture and marks the part that survives —
        zoom out past its edges if you would rather fit all of it in than crop
        a slice out of it.
      </p>
      ${mobileGroups}
    </div>
  </main>

  <!-- Editor modal -->
  <div class="editor" id="editor" aria-hidden="true">
    <div class="editor__panel" role="dialog" aria-label="Photo editor">
      <div class="editor__stage">
        <div class="editor__stagewrap">
          <canvas class="editor__canvas" id="ed-canvas" width="460" height="345"></canvas>
          <p class="editor__readout" id="ed-readout"></p>
        </div>
      </div>
      <div class="editor__side">
        <h2 class="editor__title" id="ed-title">Edit photo</h2>
        <p class="editor__sub" id="ed-sub">Scroll to zoom toward the cursor, drag to reposition.</p>

        <div class="editor__toggles">
          <button type="button" class="chip is-on" id="ed-view" title="Switch between the whole photo with the crop marked, and the crop on its own">Whole photo</button>
          <button type="button" class="chip" id="ed-bw">Black &amp; white</button>
          <button type="button" class="chip" id="ed-compare" title="Hold to see the original, uncropped">Compare (hold)</button>
          <button type="button" class="chip" id="ed-center" title="Recentre the crop">Centre</button>
          <button type="button" class="chip" id="ed-fitall" title="Zoom out until the whole photo is inside the frame">Fit whole photo</button>
          <button type="button" class="chip" id="ed-reset">Reset</button>
        </div>

        <div class="ctl">
          <div class="ctl__row"><label for="ed-zoom">Zoom / crop</label><span class="ctl__val" id="ed-zoom-v">1.00×</span></div>
          <input type="range" id="ed-zoom" min="0.2" max="5" step="0.01" value="1" />
          <p class="ctl__hint" id="ed-zoom-hint">Drag the photo to move the crop. Pinch or scroll to zoom.</p>
        </div>
        <!-- Only reachable once the zoom goes below "fits exactly", which is
             where the frame stops being entirely photograph. -->
        <div class="ctl" id="ed-edge-ctl" hidden>
          <label for="ed-edge">Behind the photo</label>
          <select id="ed-edge">
            <option value="blur" selected>Blurred photo</option>
            <option value="paper">Paper (site background)</option>
            <option value="dark">Near-black</option>
            <option value="white">White</option>
          </select>
          <p class="ctl__hint">Fills the frame around the photo when you zoom out past its edges. The upload is still the exact shape and size this slot needs.</p>
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
          <p class="ctl__hint">Level a crooked horizon.</p>
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
          <p class="ctl__hint">Smaller files load faster.</p>
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
      <p class="picker__sub">Reuse a photo from elsewhere on the site. Ones you replaced are marked <em>Uploaded</em>.</p>
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
