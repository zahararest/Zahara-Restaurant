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
    inlineStylesheets: 'always',
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
        locales: { he: 'he-IL', en: 'en-US' },
      },
    }),
  ],
});
