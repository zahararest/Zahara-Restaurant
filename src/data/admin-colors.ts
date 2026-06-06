// Shared admin color editor data and tokens.
export interface Token {
  token:     string;
  label:     string;
  def:       string;
  hint?:     string;
  shortName: string;
}
export interface Group {
  group:  string;
  intro:  string;
  tokens: Token[];
}

export const groups: Group[] = [
  {
    group: 'Paper & surfaces',
    intro: 'Cream background tones. Affects large areas site-wide.',
    tokens: [
      {
        token:     '--paper',
        shortName: 'paper',
        label:     'Page background',
        hint:      'The main background on every page.',
        def:       '#F0E8D2',
      },
      {
        token:     '--paper-deep',
        shortName: 'paper-deep',
        label:     'Raised bands',
        hint:      'Footer and the info-strip below the hero.',
        def:       '#E5DCC4',
      },
      {
        token:     '--paper-edge',
        shortName: 'paper-edge',
        label:     'Card border',
        hint:      'Outer border on menu cards and the form.',
        def:       '#D8CCAE',
      },
      {
        token:     '--paper-card',
        shortName: 'paper-card',
        label:     'Card fill',
        hint:      'Card and form-input backgrounds.',
        def:       '#F7F0DB',
      },
      {
        token:     '--paper-on-photo',
        shortName: 'paper-on-photo',
        label:     'Text over photos',
        hint:      'All text sitting on photos (hero, header, menu strip).',
        def:       '#F4ECCF',
      },
    ],
  },
  {
    group: 'Ink (text)',
    intro: 'Text colours. Note: Ink also fills solid dark buttons.',
    tokens: [
      {
        token:     '--ink',
        shortName: 'ink',
        label:     'Headlines & dark buttons',
        hint:      'Main text, and the fill of solid dark buttons.',
        def:       '#1A1410',
      },
      {
        token:     '--ink-soft',
        shortName: 'ink-soft',
        label:     'Body text',
        hint:      'Paragraph text and item descriptions.',
        def:       '#3D362E',
      },
      {
        token:     '--ink-muted',
        shortName: 'ink-muted',
        label:     'Labels & secondary',
        hint:      'Eyebrows, form labels, footer notes, metadata.',
        def:       '#6F5E48',
      },
      {
        token:     '--ink-faint',
        shortName: 'ink-faint',
        label:     'Decorative details',
        hint:      'Dotted leader lines and faint separators.',
        def:       '#B6A98C',
      },
    ],
  },
  {
    group: 'Rules & dividers',
    intro: 'Lines and borders.',
    tokens: [
      {
        token:     '--rule',
        shortName: 'rule',
        label:     'Strong dividers',
        hint:      'Lines between sections and form-input borders.',
        def:       '#CFC3A4',
      },
      {
        token:     '--rule-soft',
        shortName: 'rule-soft',
        label:     'Soft dividers',
        hint:      'Quiet lines inside cards and between menu items.',
        def:       '#E2D8BB',
      },
    ],
  },
  {
    group: 'Primary accent',
    intro: 'The gold accent used for emphasis.',
    tokens: [
      {
        token:     '--accent',
        shortName: 'accent',
        label:     'Accent (gold)',
        hint:      'Prices, eyebrow marks, tab indicators, hover underlines.',
        def:       '#A88947',
      },
      {
        token:     '--accent-deep',
        shortName: 'accent-deep',
        label:     'Accent — hover',
        hint:      'Hover state for accent links and buttons.',
        def:       '#7A6231',
      },
      {
        token:     '--accent-soft',
        shortName: 'accent-soft',
        label:     'Accent — selection',
        hint:      'Text-selection highlight and pull-quote tint.',
        def:       '#EAE0BD',
      },
    ],
  },
  {
    group: 'Highlights & category accents',
    intro: 'Gold highlight and the four menu-category colours.',
    tokens: [
      {
        token:     '--gold',
        shortName: 'gold',
        label:     'Secondary highlight',
        hint:      'Pull-quote emphasis and the scroll progress bar.',
        def:       '#B69A52',
      },
      {
        token:     '--c-green',
        shortName: 'c-green',
        label:     'Food (green)',
        hint:      'Food section chip on the menu.',
        def:       '#5A786A',
      },
      {
        token:     '--c-teal',
        shortName: 'c-teal',
        label:     'Cocktails (teal)',
        hint:      'Cocktails section chip on the menu.',
        def:       '#3E6D77',
      },
      {
        token:     '--c-slate',
        shortName: 'c-slate',
        label:     'Wine (slate)',
        hint:      'Wine section chip on the menu.',
        def:       '#3E5359',
      },
      {
        token:     '--c-mauve',
        shortName: 'c-mauve',
        label:     'Desserts (mauve)',
        hint:      'Desserts section chip on the menu.',
        def:       '#9D8499',
      },
    ],
  },
  {
    group: 'Status colours',
    intro: 'Form success and error messages.',
    tokens: [
      {
        token:     '--ok',
        shortName: 'ok',
        label:     'Success',
        hint:      'Form-success message colour.',
        def:       '#4F6B47',
      },
      {
        token:     '--err',
        shortName: 'err',
        label:     'Error',
        hint:      'Form-error message colour.',
        def:       '#A53623',
      },
    ],
  },
  {
    group: 'Home menu-cinema strip',
    intro: 'The home-page menu chapters over photos. Independent from the rest of the site.',
    tokens: [
      {
        token:     '--cinema-eyebrow',
        shortName: 'cinema-eyebrow',
        label:     'Cinema — eyebrow label',
        hint:      'The small uppercase eyebrow above the chapter title ("TO BEGIN", "MAINS", …).',
        def:       '#D2C9AF',
      },
      {
        token:     '--cinema-num',
        shortName: 'cinema-num',
        label:     'Cinema — chapter number',
        hint:      'The "01 ·", "02 ·" chapter number and its separator dot.',
        def:       '#A88947',
      },
      {
        token:     '--cinema-title',
        shortName: 'cinema-title',
        label:     'Cinema — chapter title',
        hint:      'The large serif chapter heading ("Something to start", "Cocktails", …).',
        def:       '#F4ECCF',
      },
      {
        token:     '--cinema-item-name',
        shortName: 'cinema-item-name',
        label:     'Cinema — menu item name',
        hint:      'Each dish or drink name listed under a chapter.',
        def:       '#F4ECCF',
      },
      {
        token:     '--cinema-item-desc',
        shortName: 'cinema-item-desc',
        label:     'Cinema — item description',
        hint:      'The short note under each item (ingredients, preparation).',
        def:       '#C2BAA1',
      },
      {
        token:     '--cinema-item-price',
        shortName: 'cinema-item-price',
        label:     'Cinema — item price',
        hint:      'The numerals at the right of each item row.',
        def:       '#A88947',
      },
      {
        token:     '--cinema-divider',
        shortName: 'cinema-divider',
        label:     'Cinema — row & footer divider',
        hint:      'The thin lines between items and above the chapter footer.',
        def:       '#3D372C',
      },
      {
        token:     '--cinema-count',
        shortName: 'cinema-count',
        label:     'Cinema — "01 / 04 Chapters"',
        hint:      'The small count label in the chapter footer.',
        def:       '#ACA388',
      },
      {
        token:     '--cinema-cta',
        shortName: 'cinema-cta',
        label:     'Cinema — "See the full menu" CTA',
        hint:      'The outlined CTA at the bottom of each chapter (text + border).',
        def:       '#F4ECCF',
      },
    ],
  },
  {
    group: 'Atmosphere',
    intro: 'Ambient tones for shadows and the warm gradient on dark sections.',
    tokens: [
      {
        token:     '--shadow',
        shortName: 'shadow',
        label:     'Shadow & overlay tone',
        hint:      'Drop shadows and the dark wash over hero / menu photos.',
        def:       '#0A0806',
      },
      {
        token:     '--grad-warm-from',
        shortName: 'grad-warm-from',
        label:     'Warm gradient — top colour',
        hint:      'Lighter top of the warm gradient on the events section.',
        def:       '#4A3A2D',
      },
      {
        token:     '--grad-warm-to',
        shortName: 'grad-warm-to',
        label:     'Warm gradient — bottom colour',
        hint:      'Deeper bottom of the warm gradient on the events section.',
        def:       '#1F1812',
      },
    ],
  },
];

const allTokens = groups.flatMap((g) => g.tokens);
export const defaults = Object.fromEntries(allTokens.map((t) => [t.token, t.def]));

// Dark-theme defaults. MUST stay in sync with the `html[data-theme="dark"]`
// block in src/styles/tokens.css — that CSS block is the no-JS / no-saved-dark
// fallback, while this map is what the colour editor shows as the dark mode
// "default" (and what it diffs saved dark overrides against).
export const darkDefaults: Record<string, string> = {
  '--paper':          '#0F0B07',
  '--paper-deep':     '#181410',
  '--paper-edge':     '#2A2218',
  '--paper-card':     '#1A1612',
  '--paper-on-photo': '#F4ECCF',
  '--ink':            '#F0E8D2',
  '--ink-soft':       '#C4B89A',
  '--ink-muted':      '#908878',
  '--ink-faint':      '#4A4438',
  '--rule':           '#322818',
  '--rule-soft':      '#1E1A14',
  '--accent':         '#C8A050',
  '--accent-deep':    '#A8853A',
  '--accent-soft':    '#2A2018',
  '--gold':           '#D0B468',
  '--c-green':        '#6A8878',
  '--c-teal':         '#4E7D87',
  '--c-slate':        '#4E6369',
  '--c-mauve':        '#AD9499',
  '--ok':             '#5BA670',
  '--err':            '#E07060',

  // Cinema strip — accent shifts to gold in dark mode, the rest stays
  // light since the strip sits over dark photography in both themes.
  '--cinema-eyebrow':    '#D2C9AF',
  '--cinema-num':        '#C8A050',
  '--cinema-title':      '#F4ECCF',
  '--cinema-item-name':  '#F4ECCF',
  '--cinema-item-desc':  '#C2BAA1',
  '--cinema-item-price': '#C8A050',
  '--cinema-divider':    '#3D372C',
  '--cinema-count':      '#ACA388',
  '--cinema-cta':        '#F4ECCF',

  '--shadow':         '#000000',
  '--grad-warm-from': '#3A2D23',
  '--grad-warm-to':   '#161009',
};
