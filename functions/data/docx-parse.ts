// Server-side .docx → { date, sections } parser.
//
// This is the worker-runtime twin of the browser parser in
// functions/admin/script.ts (handleDocx + helpers). It produces the SAME
// shape the admin editor saves and /api/menu/[slug] serves:
//   { date: string|null, sections: [{ title, items: [{ name, description, price }] }] }
//
// Two differences from the browser version, both forced by the Workers
// runtime (no DOM):
//   • ZIP inflate uses DecompressionStream('deflate-raw') — same as the
//     browser path, which Workers also support.
//   • XML is walked with regex instead of DOMParser. The Word document
//     model we care about is shallow (w:p → w:r → w:t / w:br), so a regex
//     pass over each <w:p> block reproduces xmlToPagedLines exactly.
//
// Keep the parsing heuristics (detectSep / isLikelyHeader / parseLines /
// findDate) in lockstep with script.ts so an OneDrive sync and a manual
// upload of the same file yield identical data.

import type { MenuSection } from './menu-defaults';

export interface ParsedMenu { date: string | null; sections: MenuSection[]; }
interface PagedLine { text: string; page: number; }

// ── ZIP reading (central-directory walk + inflate) ───────────────────────
async function readZipEntries(buffer: ArrayBuffer): Promise<Record<string, string>> {
  const bytes = new Uint8Array(buffer);
  const dec   = new TextDecoder();
  const entries: Record<string, string> = {};

  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4B && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      eocdOffset = i; break;
    }
  }
  if (eocdOffset === -1) throw new Error('Not a ZIP file');

  const cdOffset = new DataView(buffer, eocdOffset + 16, 4).getUint32(0, true);
  const cdSize   = new DataView(buffer, eocdOffset + 12, 4).getUint32(0, true);
  let pos = cdOffset;

  while (pos < cdOffset + cdSize) {
    const sig = new DataView(buffer, pos, 4).getUint32(0, true);
    if (sig !== 0x02014B50) break;
    const compression = new DataView(buffer, pos + 10, 2).getUint16(0, true);
    const compSize    = new DataView(buffer, pos + 20, 4).getUint32(0, true);
    const nameLen     = new DataView(buffer, pos + 28, 2).getUint16(0, true);
    const extraLen    = new DataView(buffer, pos + 30, 2).getUint16(0, true);
    const commentLen  = new DataView(buffer, pos + 32, 2).getUint16(0, true);
    const localOffset = new DataView(buffer, pos + 42, 4).getUint32(0, true);
    const name        = dec.decode(bytes.slice(pos + 46, pos + 46 + nameLen));
    pos += 46 + nameLen + extraLen + commentLen;

    // We only need the body + headers; skip everything else to save inflate work.
    if (!/^word\/(document|header\d*)\.xml$/.test(name)) continue;

    const localExtraLen = new DataView(buffer, localOffset + 28, 2).getUint16(0, true);
    const localNameLen  = new DataView(buffer, localOffset + 26, 2).getUint16(0, true);
    const dataStart     = localOffset + 30 + localNameLen + localExtraLen;
    const compData      = bytes.slice(dataStart, dataStart + compSize);

    if (compression === 0) {
      entries[name] = new TextDecoder('utf-8').decode(compData);
    } else if (compression === 8) {
      const ds     = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(compData); writer.close();
      const chunks: Uint8Array[] = [];
      const reader = ds.readable.getReader();
      while (true) {
        const r = await reader.read();
        if (r.done) break;
        chunks.push(r.value as Uint8Array);
      }
      const total = chunks.reduce((s, c) => s + c.length, 0);
      const out   = new Uint8Array(total);
      let offset  = 0;
      for (const c of chunks) { out.set(c, offset); offset += c.length; }
      entries[name] = new TextDecoder('utf-8').decode(out);
    }
  }
  return entries;
}

// ── XML → paged lines (regex twin of DOMParser xmlToPagedLines) ──────────
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g,  '<')
    .replace(/&gt;/g,  '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g,           (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&'); // last, so "&amp;lt;" survives intact
}

function xmlToPagedLines(xmlStr: string): PagedLine[] {
  const lines: PagedLine[] = [];
  let page = 0;

  const paras = xmlStr.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>|<w:p(?:\s[^>]*)?\/>/g) || [];
  for (const p of paras) {
    // Walk runs in document order so a page break flushes text before it,
    // matching the browser's node-order traversal.
    const runs = p.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g) || [];
    let text = '';
    for (const r of runs) {
      if (/<w:br\b[^>]*\bw:type="page"/.test(r)) {
        if (text.trim()) lines.push({ text: text.trim(), page });
        text = '';
        page++;
      }
      const t = r.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g);
      if (t) for (const tag of t) {
        const inner = tag.replace(/^<w:t(?:\s[^>]*)?>/, '').replace(/<\/w:t>$/, '');
        text += decodeXmlEntities(inner);
      }
    }
    if (text.trim()) lines.push({ text: text.trim(), page });
  }
  return lines;
}

// ── Date detection (ports of script.ts helpers) ──────────────────────────
function stripXmlTags(xml: string): string {
  return xml ? xml.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

function extractDate(s: string): string | null {
  if (!s) return null;
  let m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    let yy = m[3];
    if (yy.length === 2) yy = (parseInt(yy, 10) > 50 ? '19' : '20') + yy;
    const dd = m[1].padStart(2, '0'), mm2 = m[2].padStart(2, '0');
    return yy + '-' + mm2 + '-' + dd;
  }
  m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  return null;
}

const HE_MONTHS = ['ינואר','פברואר','מרץ','מרס','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];
const EN_MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

function extractMonthYear(s: string): string | null {
  if (!s) return null;
  for (let i = 0; i < HE_MONTHS.length; i++) {
    let m = s.match(new RegExp(HE_MONTHS[i] + '\\s*(\\d{4})'));
    if (m) return m[1] + '-' + String(i + 1).padStart(2, '0') + '-01';
    m = s.match(new RegExp('(\\d{4})\\s*' + HE_MONTHS[i]));
    if (m) return m[1] + '-' + String(i + 1).padStart(2, '0') + '-01';
  }
  const lower = s.toLowerCase();
  for (let i = 0; i < EN_MONTHS.length; i++) {
    let m = lower.match(new RegExp(EN_MONTHS[i] + '\\s*(\\d{4})'));
    if (m) return m[1] + '-' + String(i + 1).padStart(2, '0') + '-01';
    m = lower.match(new RegExp('(\\d{4})\\s*' + EN_MONTHS[i]));
    if (m) return m[1] + '-' + String(i + 1).padStart(2, '0') + '-01';
  }
  return null;
}

function findDate(headersXml: string[], allLines: PagedLine[], filename: string): string | null {
  for (const xml of headersXml) {
    const text = stripXmlTags(xml);
    const d = extractDate(text) || extractMonthYear(text);
    if (d) return d;
  }
  for (let i = 0; i < Math.min(8, allLines.length); i++) {
    const d = extractDate(allLines[i].text) || extractMonthYear(allLines[i].text);
    if (d) return d;
  }
  const fm = filename.match(/(\d{2})(\d{2})(\d{2})/);
  if (fm) return '20' + fm[3] + '-' + fm[2] + '-' + fm[1];
  return null;
}

// ── Line parsing (ports of script.ts heuristics) ─────────────────────────
function detectSep(lines: string[]): string {
  const countOf = (sep: string) => lines.filter(l => l.includes(sep)).length;
  const pipe   = countOf('|');
  const bslash = lines.filter(l => l.includes('\\')).length;
  const slash  = countOf('/');
  if (pipe   > slash / 2) return '|';
  if (bslash > slash / 2) return '\\';
  return '/';
}

const HEADER_HINTS = new RegExp(
  '^(?:' +
    'מבעבע|לבן|אדום|רוזה|מתיישנים|קוקטיילים|יין|דגים|בשרים|קינוחים|' +
    'sparkling|white|red|ros[eé]|cellar|signature ?cocktails?|aged|premium|wines?' +
  ')\\s*:?$',
  'i',
);

function isLikelyHeader(line: string): boolean {
  const t = (line || '').trim();
  if (!t) return false;
  if (t.length > 32) return false;
  if (/[/|]/.test(t))   return false;
  if (/\d{2,}/.test(t)) return false;
  if (HEADER_HINTS.test(t)) return true;
  const wc = t.split(/\s+/).length;
  if (wc <= 3 && !/[,.]$/.test(t)) return true;
  return false;
}

function joinPair(a: string, b: string): string | null {
  const isNum = (s: string) => /^\d+(?:\.\d+)?$/.test(String(s || '').trim());
  if (isNum(a) && isNum(b)) return a.trim() + '/' + b.trim();
  return null;
}

function parseLines(lines: string[], sep: string): MenuSection[] {
  const sections: MenuSection[] = [];
  let current: MenuSection | null = null;
  const skip = /^(שף|Chef)[:\s]/;

  function ensureSection() {
    if (!current) { current = { title: '', items: [] }; sections.push(current); }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || skip.test(line)) continue;
    if (extractDate(line) && line.length < 16) continue;

    if (line.startsWith('(') && line.endsWith(')') && current?.items.length) {
      current.items[current.items.length - 1].description = line.slice(1, -1);
      continue;
    }

    const hasSep = line.includes(sep);

    if (hasSep && !line.endsWith(':')) {
      const parts = line.split(sep).map(p => p.trim()).filter(Boolean);

      if (parts.length === 2) {
        const name  = parts[0];
        const price = parts[1];
        const descLines: string[] = [];
        let j = i + 1;
        while (j < lines.length && j < i + 3 && !lines[j].includes(sep) && lines[j].trim()) {
          if (isLikelyHeader(lines[j])) break;
          descLines.push(lines[j].trim()); j++;
        }
        ensureSection();
        current!.items.push({ name, description: descLines.join(' · '), price });
        i = j - 1;
        continue;
      }

      if (parts.length === 3) {
        const pair = joinPair(parts[1], parts[2]);
        if (pair) {
          ensureSection();
          current!.items.push({ name: parts[0], description: '', price: pair });
          continue;
        }
      }

      const pairTail = parts.length >= 3
        ? joinPair(parts[parts.length - 2], parts[parts.length - 1])
        : null;
      const name      = parts[0];
      const price     = pairTail ?? parts[parts.length - 1];
      const descParts = pairTail ? parts.slice(1, -2) : parts.slice(1, -1);
      ensureSection();
      current!.items.push({ name, description: descParts.join(' / '), price });
    } else if (!hasSep) {
      const title = line.replace(/:$/, '').trim();
      if (title) { current = { title, items: [] }; sections.push(current); }
    }
  }
  return sections.filter(s => s.items.length > 0 || s.title);
}

/**
 * Parse a .docx into { date, sections }.
 *
 * One file = one language (OneDrive stores each language as its own file),
 * so this returns a single section list. If a file happens to contain a
 * page break (legacy bilingual doc), `page` is set to which side a line is
 * on; pass `page: 1` to read the second language. Defaults to page 0.
 */
export async function parseDocx(
  buffer: ArrayBuffer,
  filename = '',
  page = 0,
): Promise<ParsedMenu> {
  const entries = await readZipEntries(buffer);
  const docXml  = entries['word/document.xml'];
  if (!docXml) throw new Error('word/document.xml not found');

  const headerXmls = Object.keys(entries)
    .filter(k => /^word\/header\d*\.xml$/.test(k))
    .map(k => entries[k]);

  const allLines = xmlToPagedLines(docXml);
  const date     = findDate(headerXmls, allLines, filename);

  const text     = allLines.filter(l => l.page === page).map(l => l.text);
  const sep      = detectSep(text);
  const sections = parseLines(text, sep);
  return { date, sections };
}

/** True when the document contains a page break (legacy bilingual doc). */
export async function docxPageCount(buffer: ArrayBuffer): Promise<number> {
  const entries = await readZipEntries(buffer);
  const docXml  = entries['word/document.xml'];
  if (!docXml) return 0;
  const lines = xmlToPagedLines(docXml);
  return lines.reduce((max, l) => Math.max(max, l.page), 0) + 1;
}
