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

export default defineConfig({
  site: SITE,

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
        const p = new URL(url).pathname;
        return !p.startsWith('/admin') &&
               !p.startsWith('/api/');
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
