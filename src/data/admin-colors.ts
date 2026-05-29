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
    intro: 'Cream / paper tones. <code>--paper</code> is the page background everywhere. The others are progressively raised surfaces. Changing any of these shifts large background areas across the whole site.',
    tokens: [
      {
        token:     '--paper',
        shortName: 'paper',
        label:     'Paper — page background',
        hint:      'Full page background on every page (home, menu, contact, location). Also the mobile nav drawer, gallery background, and the scrollbar track tint. It is ALSO the rest-state text/glyph colour of solid dark buttons (.btn, Reserve, scroll-to-top, accessibility toggle) — the inverse of --ink.',
        def:       '#F0E8D2',
      },
      {
        token:     '--paper-deep',
        shortName: 'paper-deep',
        label:     'Paper deep — raised bands',
        hint:      'Footer background. Info-strip band below the hero. Issue-stamp masthead band. Menu section group card gradient base. Scrollbar track background.',
        def:       '#E5DCC4',
      },
      {
        token:     '--paper-edge',
        shortName: 'paper-edge',
        label:     'Paper edge — card outer border',
        hint:      'Strong outer borders on raised cards: /menu/ cocktail cards and the /contact/ form-card edge.',
        def:       '#D8CCAE',
      },
      {
        token:     '--paper-card',
        shortName: 'paper-card',
        label:     'Paper card — card fill',
        hint:      'Filled card surfaces on /menu/ (cocktail cards) and /contact/ (form panel + reach-us card). Also form input backgrounds, the contact-page tab toggle, and the section-HUD pill.',
        def:       '#F7F0DB',
      },
      {
        token:     '--paper-on-photo',
        shortName: 'paper-on-photo',
        label:     'Paper on photo — text over photography',
        hint:      '⚠ Wide-impact token. ALL text and UI over photographs: floating header text (brand, nav, reserve) when on a hero page, hero eyebrow/title/CTA buttons, intro-photo page titles, home cinematic-strip text + prices, skip-link background. Also the active menu-tab label (which sits on an --ink fill) and the HOVER text/glyph colour of solid dark buttons + the scroll-to-top / accessibility buttons. Changing it shifts on-photo reading text and those hover/active labels.',
        def:       '#F4ECCF',
      },
    ],
  },
  {
    group: 'Ink (text)',
    intro: 'Text colours from solid through faint. <strong>Important:</strong> <code>--ink</code> is dual-role — it colours both <em>text</em> and the <em>background of solid dark buttons</em>. Lightening it will also lighten those button fills.',
    tokens: [
      {
        token:     '--ink',
        shortName: 'ink',
        label:     'Ink — text & dark-button background',
        hint:      '⚠ Dual-role token. (1) All headlines, primary body text on paper. (2) Fill of all solid dark buttons (Reserve, body CTAs, active menu tabs, scroll-to-top + accessibility corner buttons). (3) Form input text + select arrows. (4) Footer text. Changing from near-black affects both reading text AND button fills simultaneously.',
        def:       '#1A1410',
      },
      {
        token:     '--ink-soft',
        shortName: 'ink-soft',
        label:     'Ink soft — body paragraph text',
        hint:      'Long-form paragraph text: home story editorial body, photo-block paragraphs, hero lede, menu item descriptions, cocktail card descriptions, form card intro text.',
        def:       '#3D362E',
      },
      {
        token:     '--ink-muted',
        shortName: 'ink-muted',
        label:     'Ink muted — labels & secondary',
        hint:      'All eyebrow labels, form field labels, footer section heads, info-strip cell labels, footer copyright/meta, menu metadata bar, inactive menu-tab text, wine legend, section-HUD label, the contact toggle inactive button. Darkened to clear WCAG AA on both --paper and --paper-deep.',
        def:       '#6F5E48',
      },
      {
        token:     '--ink-faint',
        shortName: 'ink-faint',
        label:     'Ink faint — decorative details',
        hint:      'TOC dotted leader lines (the dots between chapter title and caption), wine price separator between bottle / glass, secondary footnote metadata.',
        def:       '#B6A98C',
      },
    ],
  },
  {
    group: 'Rules & dividers',
    intro: 'Horizontal rules and borders. Strong rules separate major sections; soft rules live inside cards and between items.',
    tokens: [
      {
        token:     '--rule',
        shortName: 'rule',
        label:     'Rule — strong dividers',
        hint:      'Strong dividers between major sections, form input borders (unfocused state), the accessibility-panel border, menu-tab hover border, section-HUD border.',
        def:       '#CFC3A4',
      },
      {
        token:     '--rule-soft',
        shortName: 'rule-soft',
        label:     'Rule soft — card internals',
        hint:      'Quiet dividers inside cards and form rows, between menu items, footer bottom border, footer top border, cocktail card row dividers, wine legend border, form submit row border, mobile nav CTA divider, info-strip top/bottom border.',
        def:       '#E2D8BB',
      },
    ],
  },
  {
    group: 'Primary accent',
    intro: 'The single accent the site uses for emphasis — prices, hover underlines, tab indicators, eyebrow rules, the scroll progress bar, the scrollbar thumb.',
    tokens: [
      {
        token:     '--accent',
        shortName: 'accent',
        label:     'Accent — primary (gold/mustard)',
        hint:      'Every menu price (home + /menu/ page), eyebrow rule mark (the short line before eyebrow labels), the sliding tab indicator on /menu/ and /contact/, nav link hover underline, scroll progress bar gradient start, info-strip sub-labels hover, wine legend dot, editorial drop-cap, draw-rule underlines, menu item hover accent bar, section diamond flourish, active menu tab ping ring, scrollbar thumb gradient.',
        def:       '#A88947',
      },
      {
        token:     '--accent-deep',
        shortName: 'accent-deep',
        label:     'Accent deep — pressed / hover',
        hint:      'Hover state for accent-coloured links, the reach-us email/phone underline hover on /contact/, hero CTA button hover background, scrollbar thumb hover, menu-item name hover colour.',
        def:       '#7A6231',
      },
      {
        token:     '--accent-soft',
        shortName: 'accent-soft',
        label:     'Accent soft — selection & pull-quote',
        hint:      'Text selection highlight background (the highlight you see when dragging to select text across the entire site). Pull-quote background tint on the home page.',
        def:       '#EAE0BD',
      },
    ],
  },
  {
    group: 'Highlights & category accents',
    intro: 'Gold highlight plus four category accents pulled from the printed-menu bands. The category colours mark the /menu/ chapter chips and section identifiers.',
    tokens: [
      {
        token:     '--gold',
        shortName: 'gold',
        label:     'Gold — secondary highlight',
        hint:      'Italic emphasis word inside the chef pull-quote, scroll progress bar gradient end, menu-section-group corner glow, scrollbar thumb gradient end.',
        def:       '#B69A52',
      },
      {
        token:     '--c-green',
        shortName: 'c-green',
        label:     'Category — green (food)',
        hint:      'Sage green band for the food / starters section chip on /menu/.',
        def:       '#5A786A',
      },
      {
        token:     '--c-teal',
        shortName: 'c-teal',
        label:     'Category — teal (cocktails)',
        hint:      'Deep teal band. Cocktails section chip on /menu/.',
        def:       '#3E6D77',
      },
      {
        token:     '--c-slate',
        shortName: 'c-slate',
        label:     'Category — slate (wine)',
        hint:      'Slate / petrol band. Wine section chip on /menu/.',
        def:       '#3E5359',
      },
      {
        token:     '--c-mauve',
        shortName: 'c-mauve',
        label:     'Category — mauve (desserts)',
        hint:      'Dusty mauve band. Desserts section chip on /menu/.',
        def:       '#9D8499',
      },
    ],
  },
  {
    group: 'Status colours',
    intro: 'Used by the contact/events form feedback messages and the accessibility statement page.',
    tokens: [
      {
        token:     '--ok',
        shortName: 'ok',
        label:     'Success — form OK',
        hint:      'Successful contact-form submission message colour (text + tinted background).',
        def:       '#4F6B47',
      },
      {
        token:     '--err',
        shortName: 'err',
        label:     'Error — form failure',
        hint:      'Form validation failures and network-error messages (text + tinted background).',
        def:       '#A53623',
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
};
