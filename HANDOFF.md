# Zahara Restaurant Site — Project Handoff

**Path:** `/Users/shr3kt/Downloads/restaurant-site-2`
**Stack:** Astro 5 (SSG) + Cloudflare Pages Functions (TS) + Cloudflare KV
**Languages:** Bilingual HE (default, RTL) + EN (`/en/*`)
**Auth:** HTTP Basic Auth on `/admin/*` (env: `ADMIN_USER`, `ADMIN_PASSWORD`)
**Storage:** KV namespace `MENU_DATA` (binding in `wrangler.toml`)

## Architecture

- **Pages:** `src/pages/{index,location,events,menu}.astro` (+ `/en/` mirrors)
- **Components:** `Header`, `Footer`, `Photo` (local-only, no Unsplash), `MenuEmbed`
- **Data:** `src/data/{i18n,restaurant,photos,menu-he}.ts`
- **Functions:**
  - `functions/admin/index.ts` — SPA admin editor (HTML embedded in TS)
  - `functions/admin/save.ts` — POST writes to KV (Basic Auth)
  - `functions/api/menu/[slug].ts` — public GET, returns `{date, sections}`, falls back to hardcoded DEFAULTS
- **TSConfig split:** root `tsconfig.json` (DOM lib, src/ only) + `functions/tsconfig.json` (workers-types only)

## Menu data model

```ts
type MenuPayload = { date?: string|null; sections: MenuSection[] };
type MenuSection = { title: string; items: { name; description; price }[] };
```

KV stores `{date, sections}`. API auto-coerces legacy raw-array data on read.

**Valid slugs:** `he`, `en`, `dessert`, `dessert_en`, `wine`, `events`

## Admin features (`/admin/`)

- Sidebar with 5 menu types. Dessert tab has HE/EN **sub-tabs** (one .docx upload splits on page break: page 1 → `dessert`, page 2 → `dessert_en`).
- **DOCX upload** parsed entirely browser-side (no libs): manual ZIP central-directory walk + `DecompressionStream('deflate-raw')` + `DOMParser` on `word/document.xml`. Detects separator (`/`, `\`, `|`).
- **Date capture** from docx header XML → first lines of body → filename `DDMMYY` fallback. Editable date input per slug.
- **Collapsible sections** with item count badges.
- **Auto-resize textareas** for both name + description (no truncation on long names).
- **Direction per panel:** `en` / `dessert_en` render LTR with Inter; HE menus render RTL with Heebo.
- **Live updates** to public menu via `BroadcastChannel('zahara-menu')` (same-origin tabs only — free, no API polling).

## Public menu (`/menu/`, `/en/menu/`)

- 4 tabs: Food, Desserts, Wine, Events
- EN menu fetches `en` + `dessert_en`; HE fetches `he` + `dessert`
- Date displayed above each panel as "עודכן · 22 במאי 2026" / "Updated · 22 May 2026"
- Server-renders HE food from `src/data/menu-he.ts` for fast first paint, then refreshes from `/api/menu/[slug]`

## Design system (recent overhaul)

Inspired by restaurantfrantzen.com + gurras.se:

- Fonts: Frank Ruhl Libre (HE display), Fraunces (EN display, italic enabled), Inter (body EN), Heebo (body HE)
- Sticky header (72px, blur backdrop), always visible
- Full-bleed photo banner, asymmetric editorial gallery
- Pill-style menu tabs, accent-colored prices

## Photos

- All 17 site photos live at `/public/photos/MOYAL-*.jpg` (resized to ≤2000px, q82, ~8MB total)
- Original 1.2 GB folder at `/photos/` is **not deployed** (outside public/)
- Swap an image: drop new file at `/public/photos/<name>.jpg` or edit `src/data/photos.ts`
- `Photo` component takes `src`, `alt`, `aspect`, `loading`

## Local dev / deploy

```bash
npm run build
npx wrangler pages dev ./dist --kv MENU_DATA
# Admin login: see .dev.vars (ADMIN_USER / ADMIN_PASSWORD)
```

For production: create KV via `wrangler kv namespace create MENU_DATA`, update `id` in `wrangler.toml`, push to Cloudflare Pages.

## Known good state

- `npm run build` ✅ 8 pages
- `npx tsc -p tsconfig.json --noEmit` ✅
- `npx tsc -p functions/tsconfig.json --noEmit` ✅
- Not a git repository

## Recent user-stated preferences

- Wants minimalistic, modern, polished, easy-to-navigate UI
- Uses **only** local photos from `/photos` (no stock/external)
- Header always sticky like gurras.se
- English menus in admin must render LTR (fixed)
- Item names must wrap/grow, never truncate (fixed via textarea)
- Free Cloudflare tier — avoid API-heavy patterns (already using BroadcastChannel + cache: no-store)
