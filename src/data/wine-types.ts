// Wine taxonomy for the public menu.
//
// The wine list arrives from OneDrive as a flat section list in document
// order: a wine-type heading ("אדום"), then the wines poured by the glass,
// then a tasting-note subsection heading ("רענן, פירותי וקטיפתי") for each
// block of bottle-only wines, and so on for the next type.
//
// The parser deliberately doesn't label those headings — it stays
// language-agnostic (see functions/data/docx-parse.ts). This is where the
// four types get recognised, so the menu can offer them as a switcher and
// show them in OUR order rather than the document's: red first, because
// that's the list people actually reach for.
//
// A section whose title doesn't name a type belongs to the type above it.

export interface WineType {
  /** Stable id — used for the chip's data attribute and the display order. */
  id: 'red' | 'white' | 'rose' | 'sparkling' | 'aged';
  /** Matched against the section title, case-insensitively, in either
   *  language. Hebrew plurals are prefix matches ("לבן" ⊂ "לבנים"), so the
   *  singular is enough. */
  test: string;
  /** Fallback chip label. The real label is the document's own heading, so
   *  this only shows if a type is somehow present without one. */
  label: { he: string; en: string };
}

/** Display order on the menu — red first, then white, rosé, sparkling. */
export const WINE_TYPES: readonly WineType[] = [
  { id: 'red',       test: 'אדום|אדומ|red',                       label: { he: 'אדום',     en: 'Red'       } },
  { id: 'white',     test: 'לבן|לבנ|white|blanc',                 label: { he: 'לבן',      en: 'White'     } },
  { id: 'rose',      test: 'רוזה|רוז|ros[eé]',                    label: { he: 'רוזה',     en: 'Rosé'      } },
  { id: 'sparkling', test: 'מבעבע|שמפניה|sparkling|champagne',    label: { he: 'מבעבעים',  en: 'Sparkling' } },
  { id: 'aged',      test: 'מתייש|בוגר|aged|cellar|reserve',      label: { he: 'מתיישנים', en: 'Aged'      } },
] as const;
