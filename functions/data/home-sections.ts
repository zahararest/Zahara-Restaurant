// Which sections of the HOME page a venue shows, and how its galleries show.
//
// The rooftop is built from the same home page as the restaurant, but it is a
// different place: it may have no kitchen to photograph, no story to tell yet,
// no events offer. Rather than fork the page per venue, each venue stores the
// sections it has switched OFF, exactly like the menus it doesn't use — and,
// for the two places that rotate through several photos, whether they should
// show a single photo instead:
//
//   KV `__home__` → { "off": ["story", "kitchen"], "single": ["hero"] }
//
//   off    — sections removed from the page
//   single — gallery places showing ONE photo: "hero" (the phone rotation at
//            the top of the page) and "gallery" (the gallery section)
//
// ── The gallery is two things ──────────────────────────────────────────────
// Computers and phones don't see the same gallery. On a computer (or tablet)
// it is the full-screen gallery SECTION. On a phone that section is hidden by
// design (HomePage.astro, ≤600px) and the gallery is instead the photos the
// top of the page rotates through. So the panel offers the gallery one switch
// per device, and each maps onto a different, independent part of the record:
//
//   computers & tablets hidden   → "gallery" in `off`
//   computers & tablets 1 photo  → "gallery" in `single`
//   phones hidden                → "hero"    in `single` (just the top photo)
//
// Neither touches the other, and — like everything here — each venue has its
// own record, so Zahara and the rooftop never affect each other.
//
// Absent means everything is shown, as a gallery — which is what both venues
// looked like before this existed, so nothing changes until the owner does.
//
// Read by:
//   • functions/admin/home.ts  — the Home sections panel.
//   • functions/_middleware.ts — REMOVES the switched-off sections from the home
//                                page before it is sent, and the extra frames of
//                                a gallery shown as a single photo. Removing
//                                rather than hiding means a visitor never
//                                downloads a photo (or video) they can't see,
//                                and nothing flashes in and out on load.
//
// There is deliberately NO cross-venue fallback: a section Zahara switched off
// stays on at the rooftop until the rooftop switches it off too.

import type { KVNamespace } from '@cloudflare/workers-types';
import { siteScope, type Site, type SiteBindings } from './site';

export type HomeSectionEnv = SiteBindings;

const KEY = '__home__';

/** The home page's sections, in the order they appear on the page. The ids are
 *  the `data-home-section` values in src/components/pages/HomePage.astro — a
 *  section is only switchable if the page marks it. */
export const HOME_SECTIONS = [
  {
    id: 'hero', locked: true,
    label: 'Top of the page',
    note:  'The full-screen photo (or video) with the name and the booking button. Always shown — it is the first thing every visitor sees, and it carries the page title. On phones it can also rotate through the gallery photos: that is the phone gallery, switched under Gallery below.',
  },
  {
    id: 'info', locked: false,
    label: 'Info strip',
    note:  'Opening hours, address, phone and booking link, and the kosher certificate — the band across the top of the dark photo.',
  },
  {
    id: 'story', locked: false,
    label: 'Our story',
    note:  'The two text boxes on the dark dining-room photo.',
  },
  {
    id: 'kitchen', locked: false,
    label: 'Kitchen photo',
    note:  'The full-screen photo straight after the story.',
  },
  {
    id: 'menu', locked: false,
    label: 'The menu',
    note:  'The full-screen photo with the Food, Wine and Cocktails tiles. Which tiles appear is set in the Menu editor.',
  },
  {
    id: 'events', locked: false,
    label: 'Events',
    note:  'The photo beside the events text, with the Events and Contact buttons.',
  },
  {
    id: 'gallery', locked: false,
    label: 'Gallery',
    note:  'Computers and phones show the gallery in different places, so each has its own switch — turning one off never changes the other.',
    devices: {
      desktop: {
        label: 'Computers & tablets',
        note:  'The full-screen gallery section, with arrows, moving on by itself.',
        choice: {
          label:   'Show as',
          gallery: 'Gallery',
          single:  'Single photo',
          note:    'A single photo shows only “Gallery 1” from Images, full screen and still.',
        },
      },
      phone: {
        label: 'Phones',
        note:  'On phones the gallery is the photos rotating at the top of the page, with arrows (the gallery section itself is never shown on phones). Hidden: phones show just the top photo, still.',
      },
    },
  },
  {
    id: 'instagram', locked: false,
    label: 'Instagram',
    note:  'The latest Instagram posts.',
  },
] as const;

export type HomeSectionId = (typeof HOME_SECTIONS)[number]['id'];

const SWITCHABLE = new Set<string>(HOME_SECTIONS.filter((s) => !s.locked).map((s) => s.id));
/** The places that can be a gallery or a single photo — the `data-gallery-place`
 *  values on the page. "hero" is the phone gallery (see the note at the top). */
const GALLERIES  = new Set<string>(['hero', 'gallery']);

export interface HomeLayout {
  /** Sections switched off, in page order. */
  off:    string[];
  /** Gallery places showing a single photo, in page order. */
  single: string[];
}

/** Keep the ids from `allowed`, once each, in page order — so the stored record
 *  reads like the page and an unknown id can never be switched. */
function clean(input: unknown, allowed: Set<string>): string[] {
  if (!Array.isArray(input)) return [];
  const ids = input.filter((x): x is string => typeof x === 'string' && allowed.has(x));
  return HOME_SECTIONS.map((s) => s.id as string).filter((id) => ids.includes(id));
}

export function sanitiseHomeLayout(input: unknown): HomeLayout {
  const raw = (input && typeof input === 'object' ? input : {}) as { off?: unknown; single?: unknown };
  return { off: clean(raw.off, SWITCHABLE), single: clean(raw.single, GALLERIES) };
}

async function readFrom(kv: KVNamespace | null): Promise<HomeLayout | null> {
  if (!kv) return null;
  try {
    const raw = await kv.get(KEY);
    return raw ? sanitiseHomeLayout(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** This venue's home page layout (empty lists = everything shown, as galleries). */
export async function readHomeLayout(env: HomeSectionEnv, site: Site = 'zahara'): Promise<HomeLayout> {
  return (await readFrom(siteScope(env, site).kv)) ?? { off: [], single: [] };
}

/** Store the layout and return what was actually stored. */
export async function writeHomeLayout(env: HomeSectionEnv, site: Site, input: unknown): Promise<HomeLayout | null> {
  const kv = siteScope(env, site).kv;
  if (!kv) return null;
  const layout = sanitiseHomeLayout(input);
  await kv.put(KEY, JSON.stringify(layout));
  return layout;
}
