# Zahara — Restaurant Site

Editorial-style brochure site for **Zahara** — a kosher chef restaurant
inside Nucha Hotel, Jerusalem (sister of Angelica). Hebrew + English,
Cloudflare-hosted, ~$10/year operating cost.

## What's in the box

- **Astro static site** (`src/`) — six pages: home, location, events × 2 languages
- **Pages Functions** (`functions/`):
  - `GET /menu.pdf` — serves the latest menu PDF from R2
  - `GET/POST /admin/` — password-protected upload page
  - `POST /api/contact` — sends event inquiries via Resend
- **Sample menu PDF** in `public/menu.pdf` — replace via `/admin/` after deploy
- **Cloudflare config** (`wrangler.toml`) — R2 binding declaration

## Pages

| URL | Language | Description |
|---|---|---|
| `/` | Hebrew (RTL) | Home — hero, story, embedded PDF menu, gallery, events teaser |
| `/location/` | Hebrew | Map, directions, parking & transit |
| `/events/` | Hebrew | Inquiry form for private events |
| `/en/` | English (LTR) | Same structure, English content |
| `/en/location/` | English | Same |
| `/en/events/` | English | Same |
| `/menu.pdf` | — | Live menu PDF, served from R2 by a Pages Function |
| `/admin/` | Hebrew | Password-protected menu upload page |

The language toggle in the header preserves the current page — clicking
EN on `/location/` takes you to `/en/location/`, not back to home.

## Restaurant content

| Field | Value |
|---|---|
| Name | זהרה / Zahara |
| Location | Nucha Hotel, Ben Sira Street, Jerusalem |
| Phone | 077-303-4180 |
| Hours | Daily 18:00–22:00 |
| Chef | Roi Achdut (רועי אחדות) |
| Reservations | https://tabitisrael.co.il/site/noocha-hotel-zahara |
| Cuisine | Kosher Mediterranean, French technique, Asian influences |

## Photos

The site uses Unsplash placeholder photos (free, hot-linkable, commercial use OK).
Each `<Photo>` component takes an Unsplash photo ID:

```astro
<Photo id="photo-1414235077428-338989a2e8c0" alt="..." aspect="3/4" />
```

To swap in real photography:

1. Drop your photos in `public/images/`
2. In each `.astro` file, replace `<Photo id="photo-..." />` with `<img src="/images/your-photo.jpg" alt="..." />`
3. Or modify `Photo.astro` to accept a local path

Photo components used across the site:

- `photo-1414235077428-338989a2e8c0` — hero / signature dish
- `photo-1546833999-b9f581a1996d` — kitchen photo block
- `photo-1517248135467-4c7edcad34c4` — restaurant interior
- `photo-1467003909585-2f8a72700288` — French-inspired plate
- `photo-1559339352-11d035aa65de` — open kitchen / events
- `photo-1551782450-a2132b4ba21d` — plating
- `photo-1577219491135-ce391730fb2c` — chef at work
- `photo-1510812431401-41d2bd2722f3` — wine

## The menu (PDF embed)

The home page embeds `/menu.pdf` inline via `<object>` with an iframe
fallback. On desktop browsers it renders directly in the page; on mobile
(where inline PDFs are flaky) it shows a button that opens the PDF in a
new tab.

The PDF lives in R2 in production and is uploaded by the owner via `/admin/`.
For local development the sample menu in `public/menu.pdf` is used as-is.

## Local development

```bash
npm install
npm run dev          # site at http://localhost:4321
```

For local function testing also install Wrangler:

```bash
npm install -D wrangler
npx wrangler pages dev -- npm run dev
```

## Deployment — full sequence

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin git@github.com:you/zahara.git
git push -u origin main
```

### 2. Buy the domain

Cloudflare Registrar or Spaceship. ~$10/year. Skip every upsell.

### 3. Create the R2 bucket

Cloudflare → R2 → Create bucket → name it `restaurant-menu`.

### 4. Connect Pages to GitHub

Cloudflare → Workers & Pages → Create → Pages → Connect to Git → select repo.

| Setting | Value |
|---|---|
| Framework preset | Astro |
| Build command | `npm run build` |
| Build output directory | `dist` |

### 5. Bind R2 to Pages

Pages project → Settings → Bindings → R2 buckets:

| Variable name | R2 bucket |
|---|---|
| `MENU_BUCKET` | `restaurant-menu` |

### 6. Set up Resend (contact form)

1. Sign up at https://resend.com
2. Domains → Add domain → enter your domain
3. Add Resend's DNS records to Cloudflare DNS
4. Verify, then create an API key

### 7. Add secrets to Pages

Pages → Settings → Environment variables → Production. Add as **Encrypted**:

| Variable | Value |
|---|---|
| `ADMIN_USER` | `owner` (or anything) |
| `ADMIN_PASSWORD` | Long random string |
| `RESEND_API_KEY` | The `re_...` key from step 6 |
| `CONTACT_TO_EMAIL` | The owner's real inbox |
| `CONTACT_FROM_EMAIL` | `noreply@your-domain.com` |

### 8. Connect custom domain

Pages → Custom domains → Set up → enter your domain. SSL provisions automatically.

### 9. Email forwarding

Cloudflare → Email → Email Routing → Enable. Forward `info@your-domain.com`
to the owner's inbox.

### 10. Upload the first real menu

Visit `https://your-domain.com/admin/`, log in, drag the PDF, click upload.

(Note: the sample menu in `public/menu.pdf` is bundled as a fallback for
local development. Once you deploy, the live `/menu.pdf` URL is served
from R2 by the Pages Function and overrides whatever's in `public/`.)

## Day-to-day operation

For the owner (non-developer):
1. Open `your-domain.com/admin/` on any device
2. Enter password (browser remembers)
3. Drag PDF, click upload — the home page reflects it within seconds

For you:
- Push to `main` → Cloudflare auto-deploys in ~60 seconds
- All translatable content lives in the `.astro` files; edit, push, deployed

## Adding more languages

To add a third language (say Russian):

1. Duplicate `src/pages/en/` → `src/pages/ru/`
2. Translate every string in the duplicated files
3. Update `Header.astro` and `Footer.astro` `labels` objects to add a `ru` key
4. Add the route logic to the language toggle

The CSS is direction-aware (uses logical properties throughout), so RTL/LTR
switching just works.

## File map

```
restaurant-site/
├── astro.config.mjs
├── package.json
├── wrangler.toml              # R2 binding
├── .env.example
├── README.md
├── PRICING.md
├── public/
│   ├── menu.pdf               # Sample menu (replace via /admin in prod)
│   └── robots.txt
├── src/
│   ├── styles/global.css
│   ├── layouts/BaseLayout.astro
│   ├── components/
│   │   ├── Header.astro       # Sticky nav + language toggle
│   │   ├── Footer.astro
│   │   ├── Photo.astro        # Unsplash-backed responsive image
│   │   └── MenuEmbed.astro    # Inline PDF viewer with mobile fallback
│   └── pages/
│       ├── index.astro        # Hebrew home
│       ├── location.astro     # Hebrew location
│       ├── events.astro       # Hebrew events form
│       └── en/
│           ├── index.astro    # English home
│           ├── location.astro
│           └── events.astro
└── functions/
    ├── menu.pdf.ts            # GET /menu.pdf (R2)
    ├── admin/index.ts         # GET/POST /admin (R2 upload)
    └── api/contact.ts         # POST /api/contact (Resend)
```

## Troubleshooting

**`/menu.pdf` returns 404 in production** — the R2 binding wasn't set on the
Production environment. Pages → Settings → Bindings → add `MENU_BUCKET`.

**Contact form returns 502** — Resend domain isn't verified, or
`CONTACT_FROM_EMAIL` doesn't match a verified domain.

**Admin page doesn't ask for password** — secrets weren't set on Production.
Add them and redeploy.

**Hebrew shows boxes** — Google Fonts blocked. Self-host Frank Ruhl Libre
and Heebo from `/public/fonts/` and update the `<link>` in `BaseLayout.astro`.

**Photos don't load** — Unsplash URL may have changed. Either swap the
photo ID, or replace with a local image in `public/images/`.
