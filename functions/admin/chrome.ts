// Shared admin chrome — the single source of truth for the header bar,
// colour palette, and fonts used by EVERY /admin/* page (menu editor,
// images, content, colors). Each page used to ship its own near-but-not-quite
// header and palette (gold vs terracotta accent, slightly different paper),
// which made the admin feel like four different tools. This unifies them.
//
// Pages compose: <style>${CHROME_CSS}${pageSpecificCss}</style> and drop in
// ${topbar('images')} for the header. The palette tokens (--paper/--ink/
// --accent/…) mirror the public site, matching functions/admin/styles.ts.

export const ADMIN_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500' +
  '&family=Heebo:wght@300;400;500;600&family=Inter:wght@400;500;600&display=swap';

/** Palette tokens + base body + the shared `.topbar` header styles. */
export const CHROME_CSS = String.raw`
:root {
  --paper:#F4EDDF; --deep:#ECE3D0; --edge:#DFD4BB; --card:#FBF7EE;
  --ink:#1A1410;   --soft:#3D362E; --muted:#857C6C;
  --line:#D5CBB1;  --line-soft:#E5DCC4;
  --accent:#9C4621; --accent-d:#6F2F12; --accent-soft:#F2DFCF;
  --ok:#4F6B47;    --err:#A53623;
  --ok-bg:rgba(79,107,71,.08); --err-bg:rgba(165,54,35,.08);
}
*,*::before,*::after { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: 'Inter', 'Heebo', sans-serif;
  font-size: .94rem;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
html[dir="rtl"] body { font-family: 'Heebo', 'Inter', sans-serif; }
a { color: inherit; text-decoration: none; }
button, input, select, textarea { font: inherit; }
::selection { background: var(--accent-soft); color: var(--ink); }

.topbar {
  background: color-mix(in srgb, var(--paper) 88%, transparent);
  border-bottom: 1px solid var(--line-soft);
  padding: .7rem 1.75rem .9rem;
  display: grid; gap: .55rem;
  position: sticky; top: 0; z-index: 30;
  backdrop-filter: blur(10px);
}
.topbar__nav { display: flex; align-items: center; gap: .35rem; flex-wrap: wrap; }
.topbar__brand {
  font-size: .78rem; font-weight: 700; letter-spacing: .24em; text-transform: uppercase;
  color: var(--ink); padding-inline-end: .4rem; border-inline-end: 1px solid var(--edge); margin-inline-end: .4rem;
}
.topbar__navlink {
  font-size: .78rem; letter-spacing: .18em; text-transform: uppercase; font-weight: 600;
  color: var(--muted); padding: .35rem .65rem; border: 1px solid transparent;
  transition: color .15s, border-color .15s, background .15s;
}
.topbar__navlink:hover { color: var(--ink); border-color: var(--edge); }
.topbar__navlink.is-active { color: var(--ink); background: var(--deep); border-color: var(--edge); pointer-events: none; }
.topbar__site { font-size: .78rem; letter-spacing: .18em; color: var(--accent); text-transform: uppercase; font-weight: 600; padding: .35rem .5rem; }
.topbar__site:hover { text-decoration: underline; }
.topbar__spacer { flex: 1; }
.topbar__title { margin: 0; font-size: .85rem; font-weight: 700; letter-spacing: .22em; text-transform: uppercase; color: var(--muted); }
`;

interface NavItem { id: string; href: string; label: string; }
const NAV: NavItem[] = [
  { id: 'menu',    href: '/admin/',         label: 'Menu editor' },
  { id: 'images',  href: '/admin/images/',  label: 'Images' },
  { id: 'content', href: '/admin/content/', label: 'Content' },
  { id: 'colors',  href: '/admin/colors/',  label: 'Colors' },
];

const TITLES: Record<string, string> = {
  menu: 'Menu editor', images: 'Images', content: 'Content', colors: 'Colors',
};

/**
 * The shared admin header. `active` is the current page id (menu/images/
 * content/colors). `rightSlot` lets a page inject controls (e.g. the images
 * "Refresh cached photos" button) before the "View site" link; `titleSlot`
 * overrides the plain title row (the colors page packs tools into it).
 */
export function topbar(active: string, opts: { rightSlot?: string; titleSlot?: string; siteHref?: string } = {}): string {
  const links = NAV.map(n =>
    `<a class="topbar__navlink${n.id === active ? ' is-active' : ''}" href="${n.href}"${n.id === active ? ' aria-current="page"' : ''}>${n.label}</a>`,
  ).join('\n      ');

  const title = opts.titleSlot ?? `<h1 class="topbar__title">${TITLES[active] || ''}</h1>`;

  return `<header class="topbar">
    <nav class="topbar__nav" aria-label="Admin sections">
      <a class="topbar__brand" href="/admin/">Zahara · Admin</a>
      ${links}
      <span class="topbar__spacer"></span>
      ${opts.rightSlot ?? ''}
      <a class="topbar__site" href="${opts.siteHref || '/'}" target="_blank" rel="noopener">View site ↗</a>
    </nav>
    ${title}
  </header>`;
}
