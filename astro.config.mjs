import { defineConfig } from 'astro/config';
import sitemap          from '@astrojs/sitemap';

// ── IMPORTANT ───────────────────────────────────────────────────────────────
// Set `site` to your production domain. This value is used for:
//   • All <link rel="canonical"> tags
//   • Open Graph / Twitter Card image URLs
//   • hreflang alternate URLs (en ↔ he)
//   • The generated sitemap
//   • Schema.org markup (hasMenu, etc.)
//
// Update this before deploying and commit the change.
// ────────────────────────────────────────────────────────────────────────────
const SITE = import.meta.env.SITE || 'https://zahara.rest';

// Dual-base build: the SAME source is built twice (see package.json `build`).
//   • Zahara  — no BUILD_BASE       → base '/'         → dist/
//   • Rooftop — BUILD_BASE=/rooftop → base '/rooftop'  → dist/rooftop/
// Astro prefixes its own asset URLs + page links with the base; the hand-built
// URLs (nav, images) go through src/lib/base.ts. Same domain, one Pages project.
const BASE = process.env.BUILD_BASE || undefined;

export default defineConfig({
  site: SITE,
  base: BASE,

  build: {
    // 'auto' inlines only small (critical) stylesheets and emits the bulk as
    // ONE hashed, immutable file under /_astro/ (cached a year via _headers,
    // shared across every page). Previously 'always' inlined ~103KB of CSS
    // into EVERY page — most unused per page (PageSpeed "reduce unused CSS")
    // and bloating each HTML doc to ~213KB, which delayed the document parse
    // and the LCP. The hero LCP image is preloaded with fetchpriority=high,
    // so the one render-blocking CSS request doesn't gate it.
    inlineStylesheets: 'auto',
  },

  integrations: [
    sitemap({
      // Exclude admin, API, and alternate menu paths now redirected
      filter: (url) => {
        // Compare on the path WITHOUT the venue base. Every rule below was
        // written as a root path, so on the rooftop build (base '/rooftop')
        // none of them matched: its sitemap was publishing /rooftop/admin/
        // and /rooftop/reserve/ to Google, which are exactly the two pages
        // the rules exist to keep out.
        const full = new URL(url).pathname;
        const p = BASE && full.startsWith(BASE) ? (full.slice(BASE.length) || '/') : full;

        // /reserve/ is the unlisted venue portal — handed out directly (bio
        // link, QR, ads), never crawled or linked. See src/pages/reserve.astro.
        //
        // The rooftop also drops /events/: the page is built for both venues
        // from one source, but the rooftop does not take event enquiries, so
        // it is unlinked (src/lib/paths.ts), redirected (public/_redirects)
        // and must not be offered to crawlers either.
        const rooftopEvents = BASE === '/rooftop' && /^\/(en\/)?events\/?$/.test(p);
        return !p.startsWith('/admin') &&
               !p.startsWith('/api/') &&
               !p.startsWith('/reserve') &&
               !rooftopEvents;
      },
      // Custom priority / changefreq per section
      customPages: [],
      serialize(item) {
        // Home page gets highest priority
        if (item.url === `${SITE}/` || item.url === `${SITE}/en/`) {
          return { ...item, priority: 1.0, changefreq: 'daily' };
        }
        if (item.url.includes('/menu')) {
          return { ...item, priority: 0.9, changefreq: 'daily' };
        }
        return { ...item, priority: 0.7, changefreq: 'weekly' };
      },
      i18n: {
        defaultLocale: 'he',
        // Bare language codes to match the on-page <link hreflang> tags in
        // BaseLayout.astro (he / en). Mixing he-IL here with he on the page is
        // an avoidable inconsistency; we don't target regional variants.
        locales: { he: 'he', en: 'en' },
      },
    }),
  ],
});
