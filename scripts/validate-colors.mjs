// Validates the colour system is internally consistent. Run after editing
// tokens.css / admin-colors.ts / the presets in admin/colors.astro:
//   node scripts/validate-colors.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

// Strip /* */ comments so `:root{…}` etc. mentioned in prose don't get parsed.
const stripBlock = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const tokensCss = stripBlock(read('src/styles/tokens.css'));
const adminTs   = read('src/data/admin-colors.ts');
const colorsAstro = read('src/pages/admin/colors.astro');
const paletteTs = read('functions/data/palette.ts');

const errors = [];
const warns  = [];
const hex = '#[0-9A-Fa-f]{3,8}';

// ── Parse a `selector { ... }` block's `--token: #hex;` colour decls ─────────
function colourDecls(css, startRe) {
  const m = css.match(startRe);
  if (!m) return {};
  let i = css.indexOf('{', m.index) + 1, depth = 1, end = i;
  for (; end < css.length && depth; end++) {
    if (css[end] === '{') depth++;
    else if (css[end] === '}') depth--;
    if (!depth) break;
  }
  const body = css.slice(i, end);
  const out = {};
  const re = new RegExp(`(--[\\w-]+)\\s*:\\s*(${hex})\\s*;`, 'g');
  let d; while ((d = re.exec(body))) out[d[1]] = d[2].toUpperCase();
  return out;
}

const cssLight = colourDecls(tokensCss, /:root\s*\{/);
const cssDark  = colourDecls(tokensCss, /html\[data-theme="dark"\]\s*\{/);

// ── Editor defaults (light) from the groups' token/def pairs ────────────────
const editorLight = {};
{ const re = new RegExp(`token:\\s*'(--[\\w-]+)'[\\s\\S]*?def:\\s*'(${hex})'`, 'g');
  let m; while ((m = re.exec(adminTs))) editorLight[m[1]] = m[2].toUpperCase(); }

// ── Editor dark defaults from the darkDefaults map ──────────────────────────
const editorDark = {};
{ const block = adminTs.slice(adminTs.indexOf('darkDefaults'));
  const re = new RegExp(`'(--[\\w-]+)':\\s*'(${hex})'`, 'g');
  let m; while ((m = re.exec(block))) editorDark[m[1]] = m[2].toUpperCase(); }

const editorTokens = Object.keys(editorLight);

// ── Check 1: every editor token exists in tokens.css :root, values match ────
for (const t of editorTokens) {
  if (!(t in cssLight)) { errors.push(`LIGHT: ${t} is in the editor but NOT defined in tokens.css :root`); continue; }
  if (cssLight[t] !== editorLight[t]) errors.push(`LIGHT drift: ${t} editor=${editorLight[t]} but tokens.css=${cssLight[t]}`);
}
// :root colour tokens that the editor doesn't expose (typography/spacing excluded — only hexes parsed)
for (const t of Object.keys(cssLight)) if (!(t in editorLight)) warns.push(`LIGHT: ${t} is a colour in tokens.css but not exposed in the editor`);

// ── Check 2: dark — editor darkDefault must equal the RENDERED dark value ────
// rendered dark = tokens.css dark override if present, else inherits :root.
for (const t of editorTokens) {
  const rendered = cssDark[t] ?? cssLight[t];
  if (!(t in editorDark)) { errors.push(`DARK: ${t} missing from darkDefaults map`); continue; }
  if (rendered && editorDark[t] !== rendered)
    errors.push(`DARK drift: ${t} darkDefaults=${editorDark[t]} but site renders=${rendered} (${t in cssDark ? 'dark block' : 'inherited from :root'})`);
}

// ── Check 3: presets — keys must be known tokens; report coverage ───────────
const pStart = colorsAstro.indexOf('const PRESETS');
const pBody  = colorsAstro.slice(pStart, colorsAstro.indexOf('// STATE', pStart));
const presetRe = /\n {4}'?([\w-]+)'?:\s*(\{|defaults)/g;  // top-level preset entries
let pm; const presetSpans = [];
while ((pm = presetRe.exec(pBody))) presetSpans.push({ name: pm[1], idx: pm.index, inline: pm[2] === 'defaults' });
presetSpans.forEach((p, i) => {
  const seg = pBody.slice(p.idx, presetSpans[i + 1]?.idx ?? pBody.length);
  if (p.inline) return; // `default: defaults` — complete by construction
  const keys = new Set();
  const kr = /'(--[\w-]+)'\s*:/g; let k;
  while ((k = kr.exec(seg))) {
    keys.add(k[1]);
    if (!editorLight[k[1]]) errors.push(`PRESET "${p.name}": unknown token key ${k[1]} (typo? removed token?)`);
  }
  // Tokens presets intentionally DON'T set:
  //  • events-band-* — derived from each preset's surfaces/ink/accent at apply.
  //  • tile-*        — the home menu tiles sit over a dark photo in every
  //                    theme, so they stay at their cream default regardless of
  //                    the palette (a preset overriding them would be wrong).
  const EXEMPT = new Set([
    '--events-band-from', '--events-band-to', '--events-band-text', '--events-band-num', '--events-band-divider',
    '--tile-label', '--tile-num', '--tile-fave', '--tile-link',
  ]);
  const missing = editorTokens.filter((t) => !keys.has(t) && !EXEMPT.has(t));
  if (missing.length) warns.push(`PRESET "${p.name}" omits ${missing.length} non-derived token(s): ${missing.join(', ')}`);
});

// ── Check 4: the worker-side save allowlist must match the editor tokens ────
// (functions/data/palette.ts can't import from src/, so it's a hand-kept copy.
//  If it drifts, editor controls silently fail to persist on the live site.)
{
  const block = paletteTs.slice(paletteTs.indexOf('ALLOWED_TOKENS'), paletteTs.indexOf(']', paletteTs.indexOf('ALLOWED_TOKENS')));
  const allow = new Set();
  const re = /'(--[\w-]+)'/g; let m;
  while ((m = re.exec(block))) allow.add(m[1]);
  for (const t of editorTokens) if (!allow.has(t)) errors.push(`palette.ts ALLOWED_TOKENS is MISSING ${t} → its editor control would not save`);
  for (const t of allow) if (!editorLight[t]) errors.push(`palette.ts ALLOWED_TOKENS has stale ${t} (not an editor token)`);
}

// ── Check 5: no leftover --grad-warm references anywhere ─────────────────────
const gradRef = /var\(\s*--grad-warm|['"]--grad-warm/;
for (const [f, s] of [['tokens.css', tokensCss], ['admin-colors.ts', adminTs], ['colors.astro', colorsAstro]])
  if (gradRef.test(s)) errors.push(`Leftover --grad-warm reference in ${f}`);

// ── Report ──────────────────────────────────────────────────────────────────
console.log(`Editor tokens: ${editorTokens.length} | tokens.css light: ${Object.keys(cssLight).length} | presets: ${presetSpans.length}`);
if (warns.length) { console.log(`\n⚠️  ${warns.length} warning(s):`); warns.forEach((w) => console.log('  - ' + w)); }
if (errors.length) { console.log(`\n❌ ${errors.length} ERROR(s):`); errors.forEach((e) => console.log('  - ' + e)); process.exit(1); }
console.log('\n✅ Colour system consistent: editor ↔ tokens.css ↔ presets all agree.');
