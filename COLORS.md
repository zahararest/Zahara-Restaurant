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
2. **Three layers** — Surfaces, Ink, Accent (plus rules, gold, status, and the photo/tile/background/Events-band tokens).
3. **One accent.** `--accent` is used *only* for editorial markers: the eyebrow rule, menu prices,
   hover underlines, and the sliding tab/toggle indicator. `--gold` is a restrained secondary highlight.
   Text sitting on an accent fill uses `--on-accent`.
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
| `--paper-card` | `#F7F0DB` | `#221B14` | Filled card surfaces, form inputs, menu section cards |
| `--paper-on-photo` | `#F4ECCF` | `#F4ECCF` | Text/UI over photography; **hover/active glyph** of dark buttons + active menu tab. Stays light in both themes |
| `--ink` | `#1A1410` | `#F0E8D2` | Headings, primary text; **fill** of solid dark buttons + active tab |
| `--ink-soft` | `#3D362E` | `#C4B89A` | Body paragraph text |
| `--ink-muted` | `#6F5E48` | `#908878` | Eyebrows, labels, captions, inactive tab text (AA on paper + paper-deep) |
| `--ink-faint` | `#B6A98C` | `#4A4438` | Decorative detail only (dotted leaders, dim metadata) |
| `--rule` | `#CFC3A4` | `#322818` | Strong section dividers, input borders |
| `--rule-soft` | `#E2D8BB` | `#1E1A14` | Card-internal dividers, between menu items |
| `--accent` | `#A88947` | `#C8A050` | Prices, eyebrow rule, hover underline, tab/toggle indicator |
| `--accent-deep` | `#7A6231` | `#A8853A` | Accent hover / pressed |
| `--accent-soft` | `#EAE0BD` | `#2A2018` | Text-selection highlight |
| `--on-accent` | `#F4ECCF` | `#F4ECCF` | Labels on accent fills: button hover, floating Reserve, accessibility button hover |
| `--gold` | `#B69A52` | `#D0B468` | Secondary highlight (chef-quote word, progress-bar end, card corner glow) |
| `--ok` | `#4F6B47` | `#5BA670` | Form success |
| `--err` | `#A53623` | `#E07060` | Form error |

> The dark column mirrors the `html[data-theme="dark"]` block in `tokens.css` and the `darkDefaults`
> map in `admin-colors.ts` — **keep those two in sync** when editing dark defaults by hand.

## Button contract

Solid (`.btn`, `.scroll-top`, `.a11y-toggle`): fill `--ink`, glyph `--paper`; on hover fill `--accent`,
glyph `--on-accent`. Ghost (`.btn--ghost`, `.header-reserve`): transparent, `--ink` text + border;
on hover fill `--ink`, text `--paper`. Over a photo the ghost flips to `--paper-on-photo`. Defined once
via the `--button-*` tokens in `tokens.css`.

## Editing colours

`/admin/colors/` is the live editor, per venue (the admin venue switch). Toggle **Light / Dark** to
choose which palette you're editing. The preview on the right is the **real site** in a frame
(`?zp=1`, which strips analytics), with the palette being edited injected as the last `<style>` in
its head — so it shows exactly what visitors get. Three ways to change colours:

- **Themes** — 54 presets (lively + calm, light + dark). Hover previews, click applies.
- **Mix** — build a palette part by part; each part can take any colour group of any theme
  (*Adapt* keeps your current brightness, *Exact* uses the colours as they are).
- **Fine-tune** — every token; clicking a name finds every element that uses it by reading the
  frame's stylesheets (var() chains and hover-only rules included) and scrolls to it.

**Save** persists both palettes to KV (via `/admin/colors/save`); the root middleware injects them
into every page. The rooftop's untouched tokens inherit Zahara's saved palette on the live site, and
the editor starts the rooftop from exactly that. Lively presets were generated with contrast
enforced for every pairing the editor checks; run `node scripts/validate-colors.mjs` after any
token, preset or `PRESET_META` edit.
