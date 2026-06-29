// Admin menu-editor stylesheet (layout, panels, sections, item rows, and the
// OneDrive sync panel). Inlined into the HTML response so we don't ship a
// separate asset for a private, password-protected page.
//
// The palette tokens, base typography, and the shared `.topbar` header live in
// ./chrome.ts (CHROME_CSS) — included alongside this on every admin page so
// they all share one look. This file is editor-specific styling only.

export const ADMIN_CSS = String.raw`
/* ── Layout ── */
.layout  { display: flex; min-height: calc(100vh - var(--topbar-h, 86px)); }
.sidebar {
  width: 240px;
  flex-shrink: 0;
  border-inline-end: 1px solid var(--line-soft);
  padding: 2rem 0;
  background: var(--deep);
  position: sticky;
  top: var(--topbar-h, 86px);
  height: calc(100vh - var(--topbar-h, 86px));
  overflow-y: auto;
}
.sidebar__group {
  font-size: .62rem;
  letter-spacing: .28em;
  color: var(--muted);
  text-transform: uppercase;
  padding: 0 1.75rem .75rem;
  font-weight: 600;
}
.sidebar__item {
  display: block;
  padding: .75rem 1.75rem;
  font-size: .82rem;
  letter-spacing: .06em;
  color: var(--soft);
  cursor: pointer;
  border: none;
  background: none;
  width: 100%;
  text-align: start;
  border-inline-start: 2px solid transparent;
  transition: color .18s, border-color .18s, background .18s;
  font-weight: 400;
}
.sidebar__item:hover {
  color: var(--ink);
  background: rgba(255,255,255,.35);
}
.sidebar__item.is-active {
  color: var(--ink);
  border-inline-start-color: var(--accent);
  font-weight: 600;
  background: var(--paper);
}
.main {
  flex: 1;
  padding: 2.75rem clamp(1.75rem, 4vw, 3rem);
  max-width: 1080px;
  width: 100%;
}

/* ── Panel ── */
.panel             { display: none; }
.panel.is-active   { display: block; }
.panel__head {
  margin-bottom: 2rem;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: .75rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--line-soft);
}
.panel__title {
  font-family: 'Frank Ruhl Libre', serif;
  font-size: 1.9rem;
  font-weight: 500;
  margin: 0;
  letter-spacing: -.015em;
  line-height: 1.05;
}
.panel__sub {
  color: var(--muted);
  font-size: .68rem;
  margin: .4rem 0 0;
  letter-spacing: .24em;
  text-transform: uppercase;
  font-weight: 600;
}

/* ── Sub-tabs ── */
.subtabs {
  display: inline-flex;
  gap: 0;
  margin-bottom: 1.75rem;
  padding: .25rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #fff;
}
.subtab {
  padding: .5rem 1.3rem;
  font-size: .7rem;
  letter-spacing: .22em;
  text-transform: uppercase;
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  border-radius: 999px;
  transition: color .18s, background .18s;
  font-weight: 600;
}
.subtab:hover           { color: var(--ink); }
.subtab.is-active       { color: #fff; background: var(--ink); }

/* ── Toolbar (upload + date) ── */
.toolbar {
  display: grid;
  grid-template-columns: 1fr;
  gap: .85rem;
  margin-bottom: 2rem;
}
@media (min-width: 720px) {
  .toolbar { grid-template-columns: 1.4fr 1fr; }
}
.tile {
  background: #fff;
  border: 1px solid var(--line-soft);
  padding: 1.1rem 1.25rem;
}
.tile__label {
  font-size: .62rem;
  letter-spacing: .28em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 600;
  margin: 0 0 .55rem;
}
.tile__body {
  display: flex;
  align-items: center;
  gap: .85rem;
  flex-wrap: wrap;
}
.file-btn { position: relative; display: inline-block; }
.file-btn input[type=file] {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
  font-size: 0;
}
.file-btn span {
  display: inline-block;
  padding: .6rem 1.3rem;
  background: var(--ink);
  color: #fff;
  font-size: .68rem;
  letter-spacing: .22em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background .18s;
  font-weight: 600;
  border: 1px solid var(--ink);
}
.file-btn:hover span {
  background: var(--accent);
  border-color: var(--accent);
}
.upload-info {
  font-size: .82rem;
  color: var(--muted);
  flex: 1;
  min-width: 0;
  line-height: 1.4;
}
.date-input {
  font: inherit;
  padding: .5rem .65rem;
  border: 1px solid var(--line);
  background: #fff;
  border-radius: 0;
  color: var(--ink);
  min-width: 11rem;
  flex: 1;
}
.date-input:focus { outline: none; border-color: var(--accent); }

/* ── Save bar ── */
.save-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 0;
  margin-bottom: 1.75rem;
  border-bottom: 1px solid var(--line-soft);
  position: sticky;
  top: var(--topbar-h, 86px);
  background: color-mix(in srgb, var(--paper) 92%, transparent);
  backdrop-filter: blur(8px);
  z-index: 5;
}
.btn-save {
  padding: .7rem 2rem;
  background: var(--ink);
  color: var(--paper);
  border: 1px solid var(--ink);
  font-size: .7rem;
  letter-spacing: .22em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background .18s;
  font-weight: 600;
}
.btn-save:hover    { background: var(--accent); border-color: var(--accent); }
.btn-save:disabled { opacity: .5; cursor: default; }
.save-status       { font-size: .82rem; font-weight: 500; }
.save-status.ok    { color: var(--ok); }
.save-status.err   { color: var(--err); }

/* ── Sections ── */
.section-block { border: 1px solid var(--line-soft); background: #fff; margin-bottom: .85rem; }
.section-head-row {
  display: flex;
  align-items: center;
  gap: .6rem;
  padding: .7rem .95rem;
  background: var(--deep);
  border-bottom: 1px solid var(--line-soft);
}
.section-block.is-collapsed .section-head-row { border-bottom: none; }
.section-toggle {
  border: none;
  background: none;
  color: var(--muted);
  font-size: .75rem;
  padding: .25rem .35rem;
  cursor: pointer;
  line-height: 1;
  transition: color .15s, transform .25s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.7rem;
  height: 1.7rem;
}
.section-toggle:hover { color: var(--ink); }
.section-block.is-collapsed .section-toggle              { transform: rotate(-90deg); }
html[dir="rtl"] .section-block.is-collapsed .section-toggle { transform: rotate(90deg); }
.section-title-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  font-family: 'Frank Ruhl Libre', serif;
  font-size: 1.1rem;
  color: var(--ink);
  padding: .25rem 0;
  font-weight: 500;
}
.panel[dir="ltr"] .section-title-input {
  font-family: 'Inter', sans-serif;
  font-weight: 600;
}
.section-title-input:focus { outline: none; border-bottom: 1px solid var(--accent); }
.section-count {
  font-size: .66rem;
  color: var(--muted);
  letter-spacing: .18em;
  padding-inline: .5rem;
  white-space: nowrap;
  text-transform: uppercase;
  font-weight: 600;
}
.section-featured {
  font-size: .66rem;
  color: var(--muted);
  letter-spacing: .08em;
  padding-inline: .4rem;
  white-space: nowrap;
}
.section-featured.is-max { color: var(--accent); font-weight: 700; }
.featured-hint {
  margin: 0 0 1.1rem;
  font-size: .76rem;
  color: var(--soft);
  padding: .55rem .75rem;
  background: var(--accent-soft);
  border-inline-start: 2px solid var(--accent);
}
.btn-icon {
  border: none;
  background: none;
  color: var(--muted);
  font-size: .9rem;
  cursor: pointer;
  padding: .35rem .5rem;
  border-radius: 0;
  transition: color .15s, background .15s;
  line-height: 1;
}
.btn-icon:hover     { color: var(--err); background: var(--err-bg); }
.btn-icon.add:hover { color: var(--ok);  background: var(--ok-bg); }
.section-body                                  { display: block; }
.section-block.is-collapsed .section-body      { display: none; }

/* ── Item rows ── */
.items-list { padding: .4rem .75rem; }
.item-row {
  display: grid;
  grid-template-columns: auto minmax(8rem, 1.3fr) minmax(14rem, 3fr) minmax(4.5rem, 6rem) auto;
  gap: .6rem;
  align-items: start;
  padding: .55rem 0;
  border-bottom: 1px solid var(--line-soft);
}
.item-row.is-featured { background: color-mix(in srgb, var(--accent-soft) 50%, transparent); }

/* Star toggle — feature an item on the home page. */
.btn-star {
  border: none;
  background: none;
  cursor: pointer;
  color: var(--muted);
  font-size: 1rem;
  line-height: 1;
  padding: .4rem .35rem;
  align-self: start;
  margin-top: .15rem;
  transition: color .15s, transform .12s;
}
.btn-star:hover                  { color: var(--accent); }
.btn-star[aria-pressed="true"]   { color: var(--accent); }
.btn-star.is-blocked             { animation: starShake .5s ease; color: var(--err); }
@keyframes starShake {
  0%, 100% { transform: translateX(0); }
  25%      { transform: translateX(-2px); }
  75%      { transform: translateX(2px); }
}
.item-row:last-child { border-bottom: none; }
.item-input {
  border: 1px solid transparent;
  background: transparent;
  padding: .4rem .55rem;
  width: 100%;
  color: var(--ink);
  transition: border-color .15s, background .15s;
  border-radius: 0;
  font-family: inherit;
  font-size: .94rem;
  line-height: 1.45;
  display: block;
}
.item-input:focus { outline: none; border-color: var(--accent); background: #fafaf7; }
textarea.item-input { resize: none; overflow: hidden; min-height: 2.4rem; }
.item-input.name  { font-weight: 600; }
.item-input.price {
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: var(--accent);
  font-weight: 600;
}
@media (max-width: 720px) {
  .item-row {
    grid-template-columns: auto 1fr auto;
    grid-template-areas: "star name del" "desc desc desc" "price price price";
  }
  .item-input.name  { grid-area: name; }
  .item-input.desc  { grid-area: desc; }
  .item-input.price { grid-area: price; text-align: start; max-width: 8rem; }
  .item-row > .btn-star { grid-area: star; }
  .item-row > .btn-icon { grid-area: del; }
}

.section-footer { padding: .55rem .75rem; border-top: 1px solid var(--line-soft); }
.btn-add-item {
  border: none;
  background: none;
  color: var(--accent);
  font-size: .7rem;
  letter-spacing: .22em;
  text-transform: uppercase;
  cursor: pointer;
  padding: .4rem 0;
  font-weight: 600;
}
.btn-add-item:hover { color: var(--accent-d); }

/* ── Add section / empty state ── */
.btn-add-section {
  display: block;
  width: 100%;
  padding: .95rem;
  border: 1.5px dashed var(--line);
  background: none;
  color: var(--muted);
  font-size: .7rem;
  letter-spacing: .22em;
  text-transform: uppercase;
  cursor: pointer;
  margin-top: .85rem;
  transition: border-color .15s, color .15s, background .15s;
  font-weight: 600;
}
.btn-add-section:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: #fff;
}
.empty {
  padding: 3rem 1.5rem;
  text-align: center;
  color: var(--muted);
  font-size: .88rem;
  border: 1.5px dashed var(--line);
  background: #fff;
}
.empty p { margin: 0 0 .35rem; }

/* ── OneDrive sync panel ── */
.sync-toggle { display: inline-flex; align-items: center; gap: .55rem; font-weight: 600; cursor: pointer; }
.sync-hours  { display: flex; flex-wrap: wrap; align-items: center; gap: .6rem; }
.hour-chip {
  display: inline-flex; align-items: center; gap: .2rem;
  background: var(--deep); border: 1px solid var(--line-soft); padding: .2rem .35rem .2rem .25rem;
}
.sync-hour { border: none; background: transparent; color: var(--ink); font-variant-numeric: tabular-nums; padding: .15rem .25rem; }
.sync-hour:focus { outline: none; }
.sync-menu-row {
  display: grid;
  grid-template-columns: minmax(9rem, 1fr) 2.4fr auto;
  gap: .85rem; align-items: center;
  padding: .85rem .95rem;
  border: 1px solid var(--line-soft); border-top: none; background: #fff;
}
.sync-menu-row:first-child { border-top: 1px solid var(--line-soft); }
.sync-menu-label { font-weight: 600; }
.sync-link {
  width: 100%; padding: .5rem .6rem; border: 1px solid var(--line);
  background: var(--paper); color: var(--ink); border-radius: 0;
}
.sync-link:focus { outline: none; border-color: var(--accent); background: #fff; }
.sync-row-status { font-size: .76rem; color: var(--muted); margin-top: .3rem; min-height: .9rem; }
.sync-row-status.ok  { color: var(--ok); }
.sync-row-status.err { color: var(--err); }
@media (max-width: 720px) {
  .sync-menu-row { grid-template-columns: 1fr; }
}
`;
