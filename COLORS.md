# Zahara — colour system

One palette drives the whole site **and** the `/admin/colors/` editor. Change a token in one
place and it cascades everywhere. This document is the reference; the canonical definitions live in
[`src/styles/tokens.css`](src/styles/tokens.css), the editor metadata in
[`src/data/admin-colors.ts`](src/data/admin-colors.ts).

## The rules

1. **One source of truth.** Every colour resolves to a `--token`. No raw hex in component CSS —
   always `var(--token)`. Sanctioned exceptions: the `html.a11y-contrast` block in
   [`components.css`](src/styles/components.css) (a legal max-contrast override), and
   `var(--token, #fallback)` fallbacks inside the admin preview.
2. **Three layers** — Surfaces, Ink, Accent (plus rules, gold, category accents, status).
3. **One accent.** `--accent` is used *only* for editorial markers: the eyebrow rule, menu prices,
   hover underlines, and the sliding tab/toggle indicator. Never for backgrounds, never as a second
   brand colour. `--gold` is a restrained secondary highlight; the `--c-*` set marks menu categories.
4. **Contrast pairings keep WCAG AA.** Ink shades sit on paper shades; `--paper-on-photo` sits on
   photography and on accent button-hover fills. The editor shows a live contrast badge per text token.
5. **Buttons are token-driven** (`--button-*`). `.btn`, `.scroll-top` and `.a11y-toggle` all consume
   the same contract, so they follow the rules together.
6. **Two themes, same names.** Light = `:root`; dark = `html[data-theme="dark"]`. Both are editable in
   `/admin/colors/` and ship as `:root{…}` + `html[data-theme="dark"]{…}`.

## Tokens

| Token | Light | Dark | Role |
|---|---|---|---|
| `--paper` | `#F0E8D2` | `#0F0B07` | Page background everywhere; also the **rest-state glyph** of solid dark buttons |
| `--paper-deep` | `#E5DCC4` | `#181410` | Raised bands — footer, info strip, issue stamp |
| `--paper-edge` | `#D8CCAE` | `#2A2218` | Strong outer borders on raised cards |
| `--paper-card` | `#F7F0DB` | `#1A1612` | Filled card surfaces, form inputs, menu section cards |
| `--paper-on-photo` | `#F4ECCF` | `#F4ECCF` | Text/UI over photography; **hover/active glyph** of dark buttons + active menu tab. Stays light in both themes |
| `--ink` | `#1A1410` | `#F0E8D2` | Headings, primary text; **fill** of solid dark buttons + active tab |
| `--ink-soft` | `#3D362E` | `#C4B89A` | Body paragraph text |
| `--ink-muted` | `#6F5E48` | `#908878` | Eyebrows, labels, captions, inactive tab text (AA on paper + paper-deep) |
| `--ink-faint` | `#B6A98C` | `#4A4438` | Decorative detail only (dotted leaders, dim metadata) |
| `--rule` | `#CFC3A4` | `#322818` | Strong section dividers, input borders |
| `--rule-soft` | `#E2D8BB` | `#1E1A14` | Card-internal dividers, between menu items |
| `--accent` | `#A88947` | `#C8A050` | Prices, eyebrow rule, hover underline, tab/toggle indicator |
| `--accent-deep` | `#7A6231` | `#A8853A` | Accent hover / pressed |
| `--accent-soft` | `#EAE0BD` | `#2A2018` | Text-selection highlight, pull-quote tint |
| `--gold` | `#B69A52` | `#D0B468` | Secondary highlight (chef-quote word, progress-bar end, card corner glow) |
| `--c-green` | `#5A786A` | `#6A8878` | Category — food |
| `--c-teal` | `#3E6D77` | `#4E7D87` | Category — cocktails |
| `--c-slate` | `#3E5359` | `#4E6369` | Category — wine |
| `--c-mauve` | `#9D8499` | `#AD9499` | Category — desserts |
| `--ok` | `#4F6B47` | `#5BA670` | Form success |
| `--err` | `#A53623` | `#E07060` | Form error |

> The dark column mirrors the `html[data-theme="dark"]` block in `tokens.css` and the `darkDefaults`
> map in `admin-colors.ts` — **keep those two in sync** when editing dark defaults by hand.

## Button contract

Solid (`.btn`, `.scroll-top`, `.a11y-toggle`): fill `--ink`, glyph `--paper`; on hover fill `--accent`,
glyph `--paper-on-photo`. Ghost (`.btn--ghost`, `.header-reserve`): transparent, `--ink` text + border;
on hover fill `--ink`, text `--paper`. Over a photo the ghost flips to `--paper-on-photo`. Defined once
via the `--button-*` tokens in `tokens.css`.

## Editing colours

`/admin/colors/` is the live editor. Toggle **Light / Dark** to choose which palette you're editing; the
preview pane reflects the active mode. **Save** persists both palettes to KV (via `/admin/colors/save`),
which the root middleware injects into every page on first paint, and which the pre-paint script in
`BaseLayout.astro` mirrors from `localStorage` for instant, FOUC-free application across the site.
