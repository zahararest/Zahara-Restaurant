// Shared admin colour-editor data and tokens.
//
// Two kinds of token live here:
//   • kind 'color'  (the default) — a `#RRGGBB` the owner picks with a swatch.
//   • kind 'scalar' — a bare NUMBER the owner drags on a slider. The CSS that
//     consumes it supplies the unit (`calc(var(--bg-wash-angle) * 1deg)`), so
//     the stored value stays a plain number and the save pipeline can range-
//     check it. Only the background-atmosphere controls use this.
//
// `hint` is written for the owner: WHERE on the site the colour shows, checked
// against the live stylesheets (not what the token was originally meant for).
// `page` is where /admin/colors takes the preview when the colour isn't on the
// page being looked at ('any' = every page has it).
export interface Token {
  token:     string;
  label:     string;
  def:       string;
  hint?:     string;
  shortName: string;
  kind?:     'color' | 'scalar';
  page?:     'any' | 'home' | 'menu' | 'events' | 'about';
  /** scalar only — slider bounds, step, and the suffix shown next to the value. */
  min?:      number;
  max?:      number;
  step?:     number;
  unit?:     string;
}
export interface Group {
  group:     string;
  intro:     string;
  /** Tucked away by default in the editor — rarely the first thing to change. */
  advanced?: boolean;
  tokens:    Token[];
}

export const groups: Group[] = [
  {
    group: 'Backgrounds',
    intro: 'The surfaces everything sits on.',
    tokens: [
      {
        token:     '--paper',
        shortName: 'paper',
        label:     'Page',
        hint:      'Behind every page. Also the header and menu tabs on pages without a top photo, and the label on dark buttons.',
        def:       '#F0E8D2',
        page:      'any',
      },
      {
        token:     '--paper-deep',
        shortName: 'paper-deep',
        label:     'Raised bands',
        hint:      'The footer, the Instagram box, the map placeholder and the scrollbar track.',
        def:       '#E5DCC4',
        page:      'any',
      },
      {
        token:     '--paper-card',
        shortName: 'paper-card',
        label:     'Cards',
        hint:      'Menu cards, the wine list, cocktail cards, form fields, the popup and the accessibility button.',
        def:       '#F7F0DB',
        page:      'menu',
      },
      {
        token:     '--paper-edge',
        shortName: 'paper-edge',
        label:     'Card outline',
        hint:      'The border around the contact form, and the Instagram loading placeholder.',
        def:       '#D8CCAE',
        page:      'about',
      },
    ],
  },
  {
    group: 'Text',
    intro: 'From headlines down to the faintest detail.',
    tokens: [
      {
        token:     '--ink',
        shortName: 'ink',
        label:     'Headings',
        hint:      'Headlines, dish names, active tabs and footer details — and the fill of dark buttons.',
        def:       '#1A1410',
        page:      'any',
      },
      {
        token:     '--ink-soft',
        shortName: 'ink-soft',
        label:     'Body text',
        hint:      'Paragraphs, dish descriptions and the header links.',
        def:       '#3D362E',
        page:      'any',
      },
      {
        token:     '--ink-muted',
        shortName: 'ink-muted',
        label:     'Labels',
        hint:      'The small labels above headings, form labels, inactive tabs and captions.',
        def:       '#6F5E48',
        page:      'any',
      },
      {
        token:     '--ink-faint',
        shortName: 'ink-faint',
        label:     'Faint details',
        hint:      'The small · and / separators in the wine list.',
        def:       '#B6A98C',
        page:      'menu',
      },
    ],
  },
  {
    group: 'Lines',
    intro: 'Borders and dividers.',
    tokens: [
      {
        token:     '--rule',
        shortName: 'rule',
        label:     'Lines',
        hint:      'Form field borders, card and popup borders, and the header line once the page scrolls.',
        def:       '#CFC3A4',
        page:      'menu',
      },
      {
        token:     '--rule-soft',
        shortName: 'rule-soft',
        label:     'Soft lines',
        hint:      'Between menu items, above the footer, under the header and along the cookie banner.',
        def:       '#E2D8BB',
        page:      'menu',
      },
    ],
  },
  {
    group: 'Accent',
    intro: 'The one colour that marks what matters.',
    tokens: [
      {
        token:     '--accent',
        shortName: 'accent',
        label:     'Accent',
        hint:      'Prices, the short line before labels, the active-tab underline, link hovers, button hover fills and the floating Reserve button.',
        def:       '#A88947',
        page:      'menu',
      },
      {
        token:     '--accent-deep',
        shortName: 'accent-deep',
        label:     'Accent — pressed',
        hint:      'Accent links and the floating Reserve button on hover, and the scrollbar handle.',
        def:       '#7A6231',
        page:      'any',
      },
      {
        token:     '--on-accent',
        shortName: 'on-accent',
        label:     'Text on accent',
        hint:      'Labels on accent-coloured fills: button hovers, the floating Reserve button, the accessibility button on hover.',
        def:       '#F4ECCF',
        page:      'any',
      },
      {
        token:     '--accent-soft',
        shortName: 'accent-soft',
        label:     'Text selection',
        hint:      'The highlight behind text a visitor selects.',
        def:       '#EAE0BD',
        page:      'any',
      },
    ],
  },
  {
    group: 'Highlight',
    intro: 'A second, quieter colour used in a few places.',
    tokens: [
      {
        token:     '--gold',
        shortName: 'gold',
        label:     'Highlight',
        hint:      'The scroll progress bar, and the booking and kosher links in the info strip over the story photo.',
        def:       '#B69A52',
        page:      'home',
      },
    ],
  },
  {
    group: 'Over photos',
    intro: 'Words and shade on top of photography.',
    tokens: [
      {
        token:     '--paper-on-photo',
        shortName: 'paper-on-photo',
        label:     'Text over photos',
        hint:      'Every word over a photo — the hero, story boxes, gallery, menu tiles, Instagram — and the header while it sits on a photo.',
        def:       '#F4ECCF',
        page:      'home',
      },
      {
        token:     '--shadow',
        shortName: 'shadow',
        label:     'Photo shade',
        hint:      'The dark wash over photos that keeps text on them readable, and drop shadows.',
        def:       '#0A0806',
        page:      'home',
      },
      {
        token:     '--tile-label',
        shortName: 'tile-label',
        label:     'Menu tile names',
        hint:      'Food · Wine · Cocktails on the home page menu tiles.',
        def:       '#F4ECCF',
        page:      'home',
      },
      {
        token:     '--tile-num',
        shortName: 'tile-num',
        label:     'Menu tile numbers',
        hint:      'The 01–03 numerals on the home page menu tiles.',
        def:       '#C7BCA0',
        page:      'home',
      },
    ],
  },
  {
    group: 'Messages',
    intro: 'Form feedback.',
    tokens: [
      {
        token:     '--ok',
        shortName: 'ok',
        label:     'Success',
        hint:      'The “thanks, we’ll be in touch” line after the contact form is sent.',
        def:       '#4F6B47',
        page:      'about',
      },
      {
        token:     '--err',
        shortName: 'err',
        label:     'Error',
        hint:      'Form errors, and the outline of a field that needs fixing.',
        def:       '#A53623',
        page:      'about',
      },
    ],
  },
  {
    group: 'Page background',
    intro: 'The depth behind every page — a soft gradient wash, ambient glows and a paper grain. Set both strengths to 0 for a flat background.',
    advanced: true,
    tokens: [
      {
        token:     '--bg-wash-from',
        shortName: 'bg-wash-from',
        label:     'Wash — start',
        hint:      'Top of the background gradient. Keep it close to the page colour.',
        def:       '#F0E8D2',
        page:      'any',
      },
      {
        token:     '--bg-wash-to',
        shortName: 'bg-wash-to',
        label:     'Wash — end',
        hint:      'Bottom of the background gradient.',
        def:       '#E5DCC4',
        page:      'any',
      },
      {
        token:     '--bg-wash-angle',
        shortName: 'bg-wash-angle',
        label:     'Wash — direction',
        hint:      '0° runs bottom-to-top, 180° top-to-bottom.',
        def:       '176',
        kind:      'scalar',
        page:      'any',
        min:       0,
        max:       360,
        step:      1,
        unit:      '°',
      },
      {
        token:     '--bg-glow',
        shortName: 'bg-glow',
        label:     'Glow colour',
        hint:      'The soft pools of light in the corners.',
        def:       '#A88947',
        page:      'any',
      },
      {
        token:     '--bg-glow-strength',
        shortName: 'bg-glow-strength',
        label:     'Glow strength',
        hint:      '0 turns the glows off.',
        def:       '10',
        kind:      'scalar',
        page:      'any',
        min:       0,
        max:       40,
        step:      1,
        unit:      '%',
      },
      {
        token:     '--bg-grain-strength',
        shortName: 'bg-grain-strength',
        label:     'Paper grain',
        hint:      '0 turns it off; above ~8 it starts to look like screen noise.',
        def:       '4',
        kind:      'scalar',
        page:      'any',
        min:       0,
        max:       20,
        step:      1,
        unit:      '%',
      },
    ],
  },
  {
    group: 'Events page band',
    intro: 'The coloured band under the photo at the top of the Events page.',
    advanced: true,
    tokens: [
      {
        token:     '--events-band-from',
        shortName: 'events-band-from',
        label:     'Band — top',
        hint:      'Where the band’s gradient starts.',
        def:       '#E8DFC8',
        page:      'events',
      },
      {
        token:     '--events-band-to',
        shortName: 'events-band-to',
        label:     'Band — bottom',
        hint:      'Where the band’s gradient ends.',
        def:       '#F2EAD5',
        page:      'events',
      },
      {
        token:     '--events-band-text',
        shortName: 'events-band-text',
        label:     'Band text',
        hint:      'The title, the intro paragraph and the menu button on the band.',
        def:       '#3D362E',
        page:      'events',
      },
      {
        token:     '--events-band-num',
        shortName: 'events-band-num',
        label:     'Band accents',
        hint:      'The short line, the small diamond and the menu button on hover.',
        def:       '#A88947',
        page:      'events',
      },
      {
        token:     '--events-band-divider',
        shortName: 'events-band-divider',
        label:     'Band bottom line',
        hint:      'The hairline under the band.',
        def:       '#CFC3A4',
        page:      'events',
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
  '--paper-card':     '#221B14',
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
  '--on-accent':      '#F4ECCF',
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
