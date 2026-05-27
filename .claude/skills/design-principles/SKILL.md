---
name: design-principles
description: Use when designing, reviewing, or adding any UI / motion / typography / layout to this Zahara site, or to a similar warm editorial photo-driven restaurant site in the lineage of gurras.se, 1868.co.il, and restaurantfrantzen.com. Encodes the project's design DNA — paper palette, serif display + sans body, full-bleed photography, restrained motion, editorial rhythm — and flags "SaaS drift" (slick UI patterns that fight the editorial aesthetic). Invoke proactively before adding decorative effects, hover tricks, gradients, badges, cards, modals, scroll gimmicks, or any motion beyond fade/lift.
---

# Design principles — Zahara editorial

The reference vocabulary is **gurras.se**, **1868.co.il**, **restaurantfrantzen.com**. These sites are *restaurants pretending to be magazines*: they assume the reader will pause on a photo, read a paragraph, then scroll. They are not apps. They do not gamify scrolling. Their motion is the motion of a camera, not a UI.

The goal here is to read like one of those sites — never like a SaaS landing page.

## The seven pillars

### 1. Layout — full-bleed photography, sparse rhythm
- Hero is a **single full-bleed photograph** behind the floating header. No half-and-half splits, no glass cards floating on it.
- Sections **alternate** photograph and editorial text. A photo speaks, then a paragraph speaks back.
- **One column** of reading width (`--prose-max`, `--readable-max`). No sidebars, no aside panels, no "related content" rails.
- **Generous vertical space** between sections (`--space-xl`+). Whitespace is the most important element on the page.
- Header is **floating + transparent over the hero**, swaps to paper-translucent once the hero scrolls past. Never a solid coloured bar over a photo.

### 2. Typography — serif display, sans body, italic for warmth
- Display: **serif** (`Frank Ruhl Libre` HE, `Fraunces` EN). Used for H1/H2/H3 and pull quotes.
- Body: **sans** (`Heebo` HE, `Inter` EN). Used for paragraphs, nav, UI.
- **Italic is rare and emotional** — chef quotes, signature dish names, the second line of a hero headline. Never italicise whole paragraphs.
- **Eyebrow labels** above headings: tiny, uppercase Latin or sentence-case Hebrew, wide tracking (`0.3em`), muted colour, prefixed with a 1.6rem accent rule. They signal the section like a magazine kicker.
- **Tracking**: wide on small caps (eyebrows, nav, buttons). Tight (`-0.018em`) on large display.
- **Drop cap** on the first paragraph of editorial blocks — a magazine touch, used sparingly (one per page max).
- Line-height **generous** (1.65 body, 1.85 editorial prose).

### 3. Colour — paper, ink, one accent, photos as the rest
- Background: `--paper` (`#F4EDDF`) and its deeper siblings. Always warm, never grey, never pure white.
- Text: `--ink` (`#1A1410`). Almost-black with a hint of brown.
- **One accent**: `--accent` terracotta (`#9C4621`). Used for the eyebrow rule, hover underlines, the menu price, the section-heading underline, link borders. Nothing else.
- **Photographs are the colour palette**. Saturate them slightly *down* (`filter: saturate(0.92)`) so they read as documentary, not catalogue.
- Forbidden: blue, green, purple, neon anything, multi-stop colour gradients on UI, bright validation colours (use the deep terracotta `--err` and muted olive `--ok` instead).

### 4. Photography — documentary, not styled
- **Colour photos**, not B&W.
- Mix: hero environment shot → kitchen action → plated dish → bar/wine → interior again. Never six dishes in a row (catalogue feel).
- **Tight crops on dishes, environmental on rooms.** Don't crop people to the eyes.
- **Faces welcome** (chef, team, guests) — they prove a restaurant is human.
- No drop shadows on photos. No rounded corners over `2px`. No filter stylisation beyond a slight saturate-down.

### 5. Motion — the camera, not the interface
Motion should feel like the photographer panned, dollied, or refocused. Not like a Lottie file.

- **Allowed**: fade-up on enter, slow ken-burns drift, parallax (subtle, <0.3×), photo cross-fade for category swap, mask reveal (clip-path uncovering a picture top→bottom), word-mask reveal for one big headline per page.
- **Use sparingly**: tab/panel sweep, button magnetism, sliding tab indicator. One or two per page, never as the whole vocabulary.
- **Forbidden**: bouncing easings, springs that overshoot, particle effects, cursor trails, animated background gradients, marquee tickers, parallax on everything, scroll-jacking, custom smooth-scroll libraries that fight the OS, animated logos, typewriter effects.
- **Honour `prefers-reduced-motion`** at every step. Always provide a static fallback.
- **Speed**: most transitions `0.8s–1.2s`, easing `cubic-bezier(0.2, 0.7, 0.2, 1)` (`--ease-out`). Faster than that reads like a notification; slower reads like a stuck page.
- **Direction-aware reveals**: when an element re-enters from above (user scrolling back up), the entrance should come *from* above, not repeat the upward slide. Motion follows the reader's eye.

### 6. Restraint — what is deliberately absent
If you reach for one of these, stop and justify it before adding:

- ❌ Drop shadows on cards (use a 1px paper-edge border instead).
- ❌ Rounded corners > 2px on photos / sections.
- ❌ Icon library in the nav. Use words.
- ❌ Badges, tags, pills (except the menu category tabs, which are intentional).
- ❌ Toast notifications, modals, popovers, tooltips on hover.
- ❌ Cards with hover-lift > 4px or scale > 1.03.
- ❌ "View more" accordions on editorial copy. Show the paragraph.
- ❌ Testimonial carousels with auto-rotation.
- ❌ Newsletter modal on page entry.
- ❌ Video backgrounds on the hero.
- ❌ Animated counters ("0 → 1868 customers served!").
- ❌ Social media follower counts in the header.
- ❌ "Powered by" badges in the footer.

### 7. Voice — humble, sensory, direct
- **First-person occasionally** for the chef, never for the restaurant ("we believe in...").
- **Concrete ingredients** beat marketing words. "Lemon-burnt aioli, jalapeño honey, smoked aubergine" reads like a menu. "An unforgettable culinary journey" reads like a brochure.
- **Sentences, not bullet lists**, for prose. Bullets are for hours, addresses, and menus.
- **One exclamation mark per page, maximum.** (Gurras gets away with "HELLO!" — that's the limit.)
- **Hebrew + English are co-equal**, not translation pairs. The Hebrew copy should read as if written in Hebrew, the English as if written in English. RTL/LTR layout mirrors automatically; copy does not.
- **No call-to-action verbs** for the sake of having them. "Book a table" once in the hero, once in the footer, period. Never "Don't miss out!", never "Limited seats!".

## Drift watch — the temptations to refuse

When working on this site, you will be tempted to add things. Most of them violate the principles above. Common drifts to refuse on sight:

| Tempting | Refuse because |
|---|---|
| "Let me add a hero video" | Photos are the medium. Video competes with the rest of the page. |
| "Floating reserve button that follows scroll" | We already have a header. One reserve link, one place. |
| "Particle confetti when form submits" | The user just gave us a private booking. Confirm it with a paragraph, not a party. |
| "Auto-rotating photo carousel in the hero" | The reader decides when to move. |
| "Gradient overlay so the photo matches the brand" | The photo *is* the brand. |
| "Sticky bar with hours / phone always visible" | That's what the info-strip and footer are for. |
| "Animated SVG icon next to every heading" | Eyebrows are the icon. |
| "Skeleton loaders on the menu" | The HE food menu is server-rendered. The rest says "coming soon". |
| "Reduce vertical spacing so more fits above the fold" | The fold is a print concept. Whitespace is the design. |

## Self-audit checklist

Before declaring any UI work done, walk this list:

1. **Photography** — Is there at least one full-bleed photo on this page? Are dishes mixed with environments and people, not all-dishes?
2. **Typography** — Display in serif? Body in sans? Eyebrow with wide tracking and accent rule? Italic only where emotional?
3. **Colour** — Background paper, text ink, accent used for *just* the editorial markers (rule, underline, price)?
4. **Motion** — Does every animation feel like a camera move (fade, lift, drift, cross-fade, mask)? Anything that bounces, springs, or jiggles?
5. **Restraint** — Walk the "deliberately absent" list. Anything sneaking in?
6. **Reduced motion** — Does the page still make sense with `prefers-reduced-motion: reduce`?
7. **RTL** — Does the Hebrew page mirror the English correctly? Logical properties only (`margin-inline-start`, `justify-self: start`)?
8. **Read it cold** — Re-read the prose. Would Gustav Trägårdh or the 1868 owner say this with a straight face?

If any answer is *no* or *not sure*, fix it before shipping.

## How to apply this skill

When invoked, your job is to:

1. **Audit** the proposed change (or current state) against the seven pillars and the drift watch.
2. **Name the principle being honoured or violated**, by number ("violates pillar 5 — bouncing easing").
3. **Propose the editorial alternative** when refusing something. "Don't add the toast — show the confirmation as a paragraph under the form, the same way 1868 confirms a reservation."
4. **Be specific about restraint**. "Remove the drop shadow, replace with `1px solid var(--rule-soft)`."
5. **Don't be precious**. Some drift is fine if the user explicitly asks for it. Flag it, then do it. Note the trade-off in the response.
