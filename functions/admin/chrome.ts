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
/* Venue switch — flip the whole admin between the Zahara restaurant and the
   Nucha Rooftop bar. It writes a cookie (path=/admin) that every /admin/*
   read + write scopes to, so editing one venue never touches the other. */
.topbar__venue { display: inline-flex; border: 1px solid var(--edge); background: var(--card); }
.topbar__venuebtn {
  font: inherit; font-size: .72rem; letter-spacing: .12em; text-transform: uppercase; font-weight: 700;
  padding: .35rem .7rem; background: transparent; color: var(--muted); border: 0;
  border-inline-end: 1px solid var(--edge); cursor: pointer; transition: background .15s, color .15s;
}
.topbar__venuebtn:last-child { border-inline-end: 0; }
.topbar__venuebtn:hover { color: var(--ink); }
.topbar__venuebtn.is-active { background: var(--ink); color: var(--paper); }
.topbar__venuebtn.is-active[data-venue="rooftop"] { background: var(--accent); }
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
 * `site` is the venue currently being edited — it highlights the venue switch
 * and points "View site" at the right place.
 */
export function topbar(
  active: string,
  opts: { rightSlot?: string; titleSlot?: string; siteHref?: string; site?: 'zahara' | 'rooftop' } = {},
): string {
  const links = NAV.map(n =>
    `<a class="topbar__navlink${n.id === active ? ' is-active' : ''}" href="${n.href}"${n.id === active ? ' aria-current="page"' : ''}>${n.label}</a>`,
  ).join('\n      ');

  const title = opts.titleSlot ?? `<h1 class="topbar__title">${TITLES[active] || ''}</h1>`;

  const site      = opts.site === 'rooftop' ? 'rooftop' : 'zahara';
  const viewHref  = opts.siteHref || (site === 'rooftop' ? '/rooftop/' : '/');
  const venueBtn  = (id: 'zahara' | 'rooftop', label: string) =>
    `<button type="button" class="topbar__venuebtn${id === site ? ' is-active' : ''}" data-venue="${id}">${label}</button>`;

  return `<header class="topbar">
    <nav class="topbar__nav" aria-label="Admin sections">
      <a class="topbar__brand" href="/admin/">Zahara · Admin</a>
      ${links}
      <span class="topbar__spacer"></span>
      <div class="topbar__venue" role="group" aria-label="Venue being edited">
        ${venueBtn('zahara', 'Zahara')}${venueBtn('rooftop', 'Rooftop')}
      </div>
      ${opts.rightSlot ?? ''}
      <a class="topbar__site" href="${viewHref}" target="_blank" rel="noopener">View site ↗</a>
    </nav>
    ${title}
  </header>
  <script>(function(){
    var CK='zahara_admin_site';
    function cur(){var m=document.cookie.match(/(?:^|;\\s*)zahara_admin_site=(rooftop|zahara)/);return m?m[1]:'zahara';}
    var now=cur();
    document.querySelectorAll('[data-venue]').forEach(function(b){
      var v=b.getAttribute('data-venue');
      b.classList.toggle('is-active', v===now);
      b.addEventListener('click', function(){
        if(v===cur())return;
        // path=/admin so the cookie rides ONLY /admin/* requests — never the
        // public site or /photos (those get an explicit ?site instead).
        document.cookie=CK+'='+v+';path=/admin;max-age=31536000;samesite=lax';
        location.reload();
      });
    });
  })();</script>`;
}
