// Shared admin colour-editor data and tokens.
//
// Two kinds of token live here:
//   • kind 'color'  (the default) — a `#RRGGBB` the owner picks with a swatch.
//   • kind 'scalar' — a bare NUMBER the owner drags on a slider. The CSS that
//     consumes it supplies the unit (`calc(var(--bg-wash-angle) * 1deg)`), so
//     the stored value stays a plain number and the save pipeline can range-
//     check it. Only the background-atmosphere controls use this.
export interface Token {
  token:     string;
  label:     string;
  def:       string;
  hint?:     string;
  shortName: string;
  kind?:     'color' | 'scalar';
  /** scalar only — slider bounds, step, and the suffix shown next to the value. */
  min?:      number;
  max?:      number;
  step?:     number;
  unit?:     string;
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
    group: 'Secondary highlight',
    intro: 'A warmer companion to the accent, used sparingly.',
    tokens: [
      {
        token:     '--gold',
        shortName: 'gold',
        label:     'Secondary highlight',
        hint:      'Scroll progress bar, menu-card corner glow, quote emphasis over photos.',
        def:       '#B69A52',
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
    group: 'Home menu tiles',
    intro: 'The menu tiles on the home page. They sit over a dark photo, so they stay light in both themes.',
    tokens: [
      {
        token:     '--tile-label',
        shortName: 'tile-label',
        label:     'Tile label',
        hint:      'The section name on each tile (Food · Wine · Cocktails).',
        def:       '#F4ECCF',
      },
      {
        token:     '--tile-num',
        shortName: 'tile-num',
        label:     'Tile number',
        hint:      'The 01–04 numerals on each tile.',
        def:       '#C7BCA0',
      },
    ],
  },
  {
    group: 'Atmosphere',
    intro: 'Ambient shadow / overlay tone used across the site.',
    tokens: [
      {
        token:     '--shadow',
        shortName: 'shadow',
        label:     'Shadow & overlay tone',
        hint:      'Drop shadows and the dark wash over hero / menu photos.',
        def:       '#0A0806',
      },
    ],
  },
  {
    group: 'Page background',
    intro: 'The depth behind every page — a soft gradient wash, two ambient glows, and a paper grain. Set both strengths to 0 for a completely flat background.',
    tokens: [
      {
        token:     '--bg-wash-from',
        shortName: 'bg-wash-from',
        label:     'Wash — start colour',
        hint:      'Top of the background gradient. Keep it close to the page background.',
        def:       '#F0E8D2',
      },
      {
        token:     '--bg-wash-to',
        shortName: 'bg-wash-to',
        label:     'Wash — end colour',
        hint:      'Bottom of the background gradient. A slightly deeper paper tone reads best.',
        def:       '#E5DCC4',
      },
      {
        token:     '--bg-wash-angle',
        shortName: 'bg-wash-angle',
        label:     'Wash — direction',
        hint:      '0° runs bottom-to-top, 180° top-to-bottom. 176° is a near-vertical fall.',
        def:       '176',
        kind:      'scalar',
        min:       0,
        max:       360,
        step:      1,
        unit:      '°',
      },
      {
        token:     '--bg-glow',
        shortName: 'bg-glow',
        label:     'Ambient glow colour',
        hint:      'The soft pools of light in the top and bottom corners.',
        def:       '#A88947',
      },
      {
        token:     '--bg-glow-strength',
        shortName: 'bg-glow-strength',
        label:     'Ambient glow strength',
        hint:      'How strongly the corner glows show. 0 turns them off.',
        def:       '10',
        kind:      'scalar',
        min:       0,
        max:       40,
        step:      1,
        unit:      '%',
      },
      {
        token:     '--bg-grain-strength',
        shortName: 'bg-grain-strength',
        label:     'Paper grain',
        hint:      'A fine printed-paper texture over the whole page. 0 turns it off; above ~8 it starts to look noisy.',
        def:       '4',
        kind:      'scalar',
        min:       0,
        max:       20,
        step:      1,
        unit:      '%',
      },
    ],
  },
  {
    group: 'Events — benefits band',
    intro: 'The four-up “why book with us” strip on the Events page. Each part is independent so the band can match your scheme (light mode keeps it in the cream family; dark mode is a warm near-black band).',
    tokens: [
      {
        token:     '--events-band-from',
        shortName: 'events-band-from',
        label:     'Band background — start',
        hint:      'Top/start colour of the band’s gradient.',
        def:       '#E8DFC8',
      },
      {
        token:     '--events-band-to',
        shortName: 'events-band-to',
        label:     'Band background — end',
        hint:      'Bottom/end colour of the band’s gradient.',
        def:       '#F2EAD5',
      },
      {
        token:     '--events-band-text',
        shortName: 'events-band-text',
        label:     'Benefit text',
        hint:      'The four benefit lines (e.g. “Private room for intimate groups”).',
        def:       '#3D362E',
      },
      {
        token:     '--events-band-num',
        shortName: 'events-band-num',
        label:     'Benefit numbers (01–04)',
        hint:      'The small numerals beside each benefit.',
        def:       '#A88947',
      },
      {
        token:     '--events-band-divider',
        shortName: 'events-band-divider',
        label:     'Band grid lines',
        hint:      'The hairline rules separating the four cells.',
        def:       '#CFC3A4',
      },
    ],
  },
];

const allTokens = groups.flatMap((g) => g.tokens);
export const defaults = Object.fromEntries(allTokens.map((t) => [t.token, t.def]));

/** Tokens whose value is a bare number, not a hex. Presets never set these
 *  (they carry no colour identity), and the editor renders them as sliders. */
export const scalarTokens: ReadonlySet<string> = new Set(
  allTokens.filter((t) => t.kind === 'scalar').map((t) => t.token),
);

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
  '--ok':             '#5BA670',
  '--err':            '#E07060',

  // Menu tiles sit over a dark photo in both themes → same light values.
  '--tile-label': '#F4ECCF',
  '--tile-num':   '#C7BCA0',

  '--shadow':         '#000000',

  // Page background — the wash tracks the dark surfaces; the glow lifts a
  // little so the warmth still reads against near-black.
  '--bg-wash-from':      '#0F0B07',
  '--bg-wash-to':        '#181410',
  '--bg-wash-angle':     '176',
  '--bg-glow':           '#C8A050',
  '--bg-glow-strength':  '12',
  '--bg-grain-strength': '5',

  // Events band — warm near-black atmosphere in dark mode.
  '--events-band-from':    '#3A2D23',
  '--events-band-to':      '#161009',
  '--events-band-text':    '#F4ECCF',
  '--events-band-num':     '#D0B468',
  '--events-band-divider': '#3A3020',
};
