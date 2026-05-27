// Client-side SPA script for the admin menu editor.
// Exported as a function so the caller can inject the menu-type config
// at HTML-template time, avoiding a second fetch.

import type { MenuType } from './menus';

export function adminScript(menuTypes: MenuType[]): string {
  return String.raw`
const MENUS = ${JSON.stringify(menuTypes)};

let bc = null;
try { bc = new BroadcastChannel('zahara-menu'); } catch {}

const state = {
  menuId:        MENUS[0].id,
  data:          {},
  collapsed:     {},
  activeVariant: {},
};

// ── DOM helpers ──────────────────────────────────────────────
function el(tag, attrs, ...children) {
  attrs = attrs || {};
  const node = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (v === false || v == null) continue;
    if      (k === 'class')         node.className = v;
    else if (k.startsWith('on'))    node.addEventListener(k.slice(2), v);
    else                            node.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null || c === false) continue;
    if (typeof c === 'string') node.appendChild(document.createTextNode(c));
    else                       node.appendChild(c);
  }
  return node;
}

// ── Menu / variant lookups ───────────────────────────────────
function activeMenu()           { return MENUS.find(m => m.id === state.menuId); }
function activeVariant(menu) {
  if (!menu.variants) return null;
  const key = state.activeVariant[menu.id] || menu.variants[0].key;
  return menu.variants.find(v => v.key === key) || menu.variants[0];
}
function currentSlug() {
  const m = activeMenu();
  return m.variants ? activeVariant(m).slug : m.slug;
}
function currentDir() {
  const m = activeMenu();
  return m.variants ? activeVariant(m).dir : m.dir;
}
function ensureData(slug) {
  if (!state.data[slug])      state.data[slug]      = { date: null, sections: [] };
  if (!state.collapsed[slug]) state.collapsed[slug] = new Set();
  return state.data[slug];
}

// ── Sidebar ──────────────────────────────────────────────────
function renderSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.innerHTML = '';
  sidebar.appendChild(el('div', { class: 'sidebar__group' }, 'Menus'));
  for (const m of MENUS) {
    sidebar.appendChild(el('button', {
      class:   'sidebar__item' + (m.id === state.menuId ? ' is-active' : ''),
      onclick: () => switchMenu(m.id),
    }, m.label));
  }
}

// ── State serialization ──────────────────────────────────────
function readFormData(slug) {
  const sections   = [];
  const sectionEls = document.querySelectorAll('.section-block[data-slug="'+slug+'"]');
  for (const sec of sectionEls) {
    const title = sec.querySelector('.section-title-input')?.value ?? '';
    const items = [];
    for (const row of sec.querySelectorAll('.item-row')) {
      const name  = (row.querySelector('.item-input.name')?.value  ?? '').trim();
      const desc  = (row.querySelector('.item-input.desc')?.value  ?? '').trim();
      const price = (row.querySelector('.item-input.price')?.value ?? '').trim();
      if (name) items.push({ name, description: desc, price });
    }
    sections.push({ title, items });
  }
  const dateEl = document.querySelector('.date-input[data-slug="'+slug+'"]');
  const date   = dateEl ? (dateEl.value || null) : (state.data[slug]?.date ?? null);
  return {
    date,
    sections: sections.filter(s => s.items.length > 0 || s.title.trim()),
  };
}

async function loadSlug(slug) {
  try {
    const res = await fetch('/api/menu/' + slug, { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json)) state.data[slug] = { date: null, sections: json };
      else                     state.data[slug] = { date: json.date ?? null, sections: json.sections ?? [] };
    } else {
      state.data[slug] = { date: null, sections: [] };
    }
  } catch {
    state.data[slug] = { date: null, sections: [] };
  }
  if (!state.collapsed[slug]) state.collapsed[slug] = new Set();
}

// ── Rendering ────────────────────────────────────────────────
function autosize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

function uploadHintFor(menu) {
  if (menu.variants) return 'Choose a .docx file — single-language uploads land in the active tab; a file with a page break between Hebrew and English loads both at once.';
  if (menu.id === 'cocktails') return 'Cocktails: name in English; description in English · Hebrew separated by "·".';
  return 'Choose a .docx file to auto-import sections and items.';
}

function renderPanel() {
  const menu = activeMenu();
  const slug = currentSlug();
  const dir  = currentDir();
  ensureData(slug);
  const data = state.data[slug];

  const main = document.getElementById('main-area');
  main.innerHTML = '';

  const panel = el('div', { class: 'panel is-active', dir });

  // Sub-line shows the current variant in friendly form ("Hebrew · he")
  // rather than the raw KV slug.
  const subLine = menu.variants
    ? activeVariant(menu).label + ' · ' + slug
    : slug;
  panel.appendChild(el('div', { class: 'panel__head' },
    el('div', {},
      el('h1', { class: 'panel__title' }, menu.label),
      el('p',  { class: 'panel__sub'   }, subLine),
    ),
  ));

  // Sub-tabs (HE / EN variants)
  if (menu.variants) {
    const activeKey = state.activeVariant[menu.id] || menu.variants[0].key;
    const subtabs   = el('div', { class: 'subtabs' });
    for (const v of menu.variants) {
      subtabs.appendChild(el('button', {
        class:   'subtab' + (v.key === activeKey ? ' is-active' : ''),
        onclick: () => switchVariant(menu.id, v.key),
      }, v.label));
    }
    panel.appendChild(subtabs);
  }

  // Toolbar: upload + date
  const fileInput  = el('input', {
    type:   'file',
    accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const uploadInfo = el('span', { class: 'upload-info' }, uploadHintFor(menu));
  fileInput.addEventListener('change', () => handleDocx(fileInput, menu, uploadInfo));

  const uploadTile = el('div', { class: 'tile' },
    el('p', { class: 'tile__label' }, 'Import .docx'),
    el('div', { class: 'tile__body' },
      el('div', { class: 'file-btn' }, fileInput, el('span', {}, 'Choose file')),
      uploadInfo,
    ),
  );

  const dateInput = el('input', {
    type:        'date',
    class:       'date-input',
    'data-slug': slug,
    value:       data.date || '',
  });
  const dateTile = el('div', { class: 'tile' },
    el('p', { class: 'tile__label' }, 'Menu date'),
    el('div', { class: 'tile__body' },
      dateInput,
      el('span', { class: 'upload-info' }, "Shown as the menu's date on the public page."),
    ),
  );

  panel.appendChild(el('div', { class: 'toolbar' }, uploadTile, dateTile));

  // Save bar
  const saveStatus = el('span',   { class: 'save-status' });
  const saveBtn    = el('button', { class: 'btn-save', onclick: () => saveCurrent(saveStatus) }, 'Save changes');
  panel.appendChild(el('div', { class: 'save-bar' }, saveBtn, saveStatus));

  // Sections
  const sectionsEl = el('div', { class: 'sections', id: 'sections-' + slug });
  if (data.sections.length === 0) {
    sectionsEl.appendChild(el('div', { class: 'empty' },
      el('p', {}, 'No sections yet.'),
      el('p', {}, 'Upload a .docx file or add a category manually below.'),
    ));
  } else {
    for (let si = 0; si < data.sections.length; si++) {
      sectionsEl.appendChild(buildSectionBlock(slug, data.sections[si], si));
    }
  }
  panel.appendChild(sectionsEl);

  panel.appendChild(el('button', {
    class:   'btn-add-section',
    onclick: () => addSection(slug),
  }, '+ Add category'));

  main.appendChild(panel);

  requestAnimationFrame(() => {
    panel.querySelectorAll('textarea.item-input').forEach(autosize);
  });
}

function updateSectionCount(block) {
  const rows = block.querySelectorAll('.item-row').length;
  const c    = block.querySelector('.section-count');
  if (c) c.textContent = rows + ' items';
}

// Placeholders adapt to the active variant's direction so Hebrew tabs
// suggest Hebrew copy and English tabs suggest English copy.
function placeholdersFor(menuId, dir) {
  if (menuId === 'cocktails') {
    return {
      name:  'Cocktail name',
      desc:  'EN ingredients · רכיבים בעברית',
      price: '₪',
    };
  }
  const isHe = dir === 'rtl';
  if (menuId === 'wine') {
    return {
      name:  isHe ? 'שם היין' : 'Wine name',
      desc:  isHe ? 'אזור · יצרן' : 'Region · maker',
      price: '200 or 200/52',
    };
  }
  return {
    name:  isHe ? 'שם המנה' : 'Item name',
    desc:  isHe ? 'תיאור'    : 'Description',
    price: '₪',
  };
}

function buildSectionBlock(slug, section, si) {
  const items     = section.items || [];
  const itemsList = el('div', { class: 'items-list' });
  const ph        = placeholdersFor(state.menuId, currentDir());

  function addItemRow(item) {
    item = item || { name: '', description: '', price: '' };

    const nameI = el('textarea', { class: 'item-input name', rows: '1', placeholder: ph.name });
    nameI.value = item.name || '';
    nameI.addEventListener('input', () => autosize(nameI));

    const descI = el('textarea', { class: 'item-input desc', rows: '1', placeholder: ph.desc });
    descI.value = item.description || '';
    descI.addEventListener('input', () => autosize(descI));

    const priceI = el('input', {
      class:       'item-input price',
      type:        'text',
      value:       item.price || '',
      placeholder: ph.price,
    });
    const delBtn = el('button', {
      class:   'btn-icon',
      title:   'Delete item',
      onclick: () => { row.remove(); updateSectionCount(block); },
    }, '✕');

    const row = el('div', { class: 'item-row' }, nameI, descI, priceI, delBtn);
    itemsList.appendChild(row);
    requestAnimationFrame(() => { autosize(nameI); autosize(descI); });
    return row;
  }

  for (const item of items) addItemRow(item);

  const sectionBody = el('div', { class: 'section-body' }, itemsList,
    el('div', { class: 'section-footer' },
      el('button', {
        class:   'btn-add-item',
        onclick: () => { addItemRow(); updateSectionCount(block); },
      }, '+ Add item'),
    ),
  );

  const titleInput = el('input', {
    class:       'section-title-input',
    type:        'text',
    value:       section.title || '',
    placeholder: currentDir() === 'rtl' ? 'שם הקטגוריה' : 'Category name',
  });
  const count     = el('span',   { class: 'section-count' }, items.length + ' items');
  const toggleBtn = el('button', { class: 'section-toggle', title: 'Collapse / expand', type: 'button' }, '▾');
  const delSec    = el('button', { class: 'btn-icon', title: 'Delete category',
    onclick: () => block.remove() }, '🗑');
  const sHead     = el('div', { class: 'section-head-row' }, toggleBtn, titleInput, count, delSec);

  const isCollapsed = state.collapsed[slug] && state.collapsed[slug].has(si);
  const block = el('div', {
    class:       'section-block' + (isCollapsed ? ' is-collapsed' : ''),
    'data-slug': slug,
  }, sHead, sectionBody);

  toggleBtn.addEventListener('click', () => {
    block.classList.toggle('is-collapsed');
    const idx = Array.from(block.parentElement.children).indexOf(block);
    if (!state.collapsed[slug]) state.collapsed[slug] = new Set();
    if (block.classList.contains('is-collapsed')) state.collapsed[slug].add(idx);
    else                                          state.collapsed[slug].delete(idx);
  });

  return block;
}

function addSection(slug) {
  const container = document.getElementById('sections-' + slug);
  const empty = container.querySelector('.empty');
  if (empty) container.removeChild(empty);
  const block = buildSectionBlock(slug, { title: '', items: [] }, container.children.length);
  container.appendChild(block);
  block.querySelector('.section-title-input')?.focus();
}

// ── Save ─────────────────────────────────────────────────────
async function saveSlug(slug) {
  const payload = readFormData(slug);
  try {
    const res = await fetch('/admin/save', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ slug, data: payload }),
    });
    const json = await res.json();
    if (json.ok) {
      state.data[slug] = payload;
      try { bc?.postMessage({ slug, ts: Date.now() }); } catch {}
      return { ok: true };
    }
    return { ok: false, error: json.error || 'Save failed' };
  } catch {
    return { ok: false, error: 'Network error' };
  }
}

async function saveCurrent(statusEl) {
  statusEl.textContent = 'Saving…';
  statusEl.className   = 'save-status';

  const slug = currentSlug();
  const res  = await saveSlug(slug);
  if (res.ok) {
    statusEl.textContent = '✓ Saved';
    statusEl.className   = 'save-status ok';
  } else {
    statusEl.textContent = 'Error: ' + res.error;
    statusEl.className   = 'save-status err';
  }
}

// ── DOCX parsing ─────────────────────────────────────────────
async function readZipEntries(buffer) {
  const bytes = new Uint8Array(buffer);
  const dec   = new TextDecoder();
  const entries = {};

  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (bytes[i]===0x50 && bytes[i+1]===0x4B && bytes[i+2]===0x05 && bytes[i+3]===0x06) {
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

    const localExtraLen = new DataView(buffer, localOffset + 28, 2).getUint16(0, true);
    const localNameLen  = new DataView(buffer, localOffset + 26, 2).getUint16(0, true);
    const dataStart     = localOffset + 30 + localNameLen + localExtraLen;
    const compData      = bytes.slice(dataStart, dataStart + compSize);

    if (compression === 0) {
      entries[name] = new TextDecoder('utf-8').decode(compData);
    } else if (compression === 8) {
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(compData); writer.close();
      const chunks = [];
      const reader = ds.readable.getReader();
      while (true) {
        const r = await reader.read();
        if (r.done) break;
        chunks.push(r.value);
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

function xmlToPagedLines(xmlStr) {
  const parser = new DOMParser();
  const doc    = parser.parseFromString(xmlStr, 'application/xml');
  const W      = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const paras  = doc.getElementsByTagNameNS(W, 'p');
  const lines  = [];
  let page = 0;

  for (const p of paras) {
    const runs = p.getElementsByTagNameNS(W, 'r');
    let text = '';
    for (const r of runs) {
      const brs = r.getElementsByTagNameNS(W, 'br');
      for (const br of brs) {
        if (br.getAttributeNS(W, 'type') === 'page' || br.getAttribute('w:type') === 'page') {
          if (text.trim()) lines.push({ text: text.trim(), page });
          text = '';
          page++;
        }
      }
      const t = r.getElementsByTagNameNS(W, 't')[0];
      if (t) text += t.textContent;
    }
    if (text.trim()) lines.push({ text: text.trim(), page });
  }
  return lines;
}

function extractDate(s) {
  if (!s) return null;
  let m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    let yy = m[3];
    if (yy.length === 2) yy = (parseInt(yy, 10) > 50 ? '19' : '20') + yy;
    const dd = m[1].padStart(2,'0'), mm = m[2].padStart(2,'0');
    return yy + '-' + mm + '-' + dd;
  }
  m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  return null;
}

function findDate(headersXml, allLines, filename) {
  for (const xml of headersXml) {
    const m = extractDate(xml);
    if (m) return m;
  }
  for (let i = 0; i < Math.min(6, allLines.length); i++) {
    const m = extractDate(allLines[i].text);
    if (m) return m;
  }
  const fm = filename.match(/(\d{2})(\d{2})(\d{2})/);
  if (fm) return '20' + fm[3] + '-' + fm[2] + '-' + fm[1];
  return null;
}

function detectSep(lines) {
  const countOf = sep => lines.filter(l => l.includes(sep)).length;
  const pipe   = countOf('|');
  const bslash = lines.filter(l => l.includes('\\')).length;
  const slash  = countOf('/');
  if (pipe   > slash / 2) return '|';
  if (bslash > slash / 2) return '\\';
  return '/';
}

// Lines that look like section headers — used to halt description-consumption.
const HEADER_HINTS = new RegExp(
  '^(?:' +
    'מבעבע|לבן|אדום|רוזה|מתיישנים|קוקטיילים|יין|דגים|בשרים|קינוחים|' +
    'sparkling|white|red|ros[eé]|cellar|signature ?cocktails?|aged|premium|wines?' +
  ')\\s*:?$',
  'i'
);

function isLikelyHeader(line) {
  const t = (line || '').trim();
  if (!t) return false;
  if (t.length > 32) return false;
  if (/[/|]/.test(t))    return false;
  if (/\d{2,}/.test(t))  return false;
  if (HEADER_HINTS.test(t)) return true;
  const wc = t.split(/\s+/).length;
  if (wc <= 3 && !/[,.]$/.test(t)) return true;
  return false;
}

function joinPair(a, b) {
  const isNum = s => /^\d+(?:\.\d+)?$/.test(String(s || '').trim());
  if (isNum(a) && isNum(b)) return a.trim() + '/' + b.trim();
  return null;
}

function parseLines(lines, sep) {
  const sections = [];
  let current = null;
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

      // name / price — possibly with continuation description lines
      if (parts.length === 2) {
        const name  = parts[0];
        const price = parts[1];
        const descLines = [];
        let j = i + 1;
        while (j < lines.length && j < i + 3 && !lines[j].includes(sep) && lines[j].trim()) {
          if (isLikelyHeader(lines[j])) break;
          descLines.push(lines[j].trim()); j++;
        }
        ensureSection();
        current.items.push({ name, description: descLines.join(' · '), price });
        i = j - 1;
        continue;
      }

      // name / bottle / glass
      if (parts.length === 3) {
        const pair = joinPair(parts[1], parts[2]);
        if (pair) {
          ensureSection();
          current.items.push({ name: parts[0], description: '', price: pair });
          continue;
        }
      }

      // name / [desc parts...] / price (last)  — collapse trailing bottle/glass pair
      const pairTail  = parts.length >= 3
        ? joinPair(parts[parts.length - 2], parts[parts.length - 1])
        : null;
      const name      = parts[0];
      const price     = pairTail ?? parts[parts.length - 1];
      const descParts = pairTail ? parts.slice(1, -2) : parts.slice(1, -1);
      ensureSection();
      current.items.push({ name, description: descParts.join(' / '), price });
    } else if (!hasSep) {
      const title = line.replace(/:$/, '').trim();
      if (title) { current = { title, items: [] }; sections.push(current); }
    }
  }
  return sections.filter(s => s.items.length > 0 || s.title);
}

async function handleDocx(input, menu, infoEl) {
  const file = input.files?.[0];
  if (!file) return;
  infoEl.textContent = 'Processing…';
  try {
    const buffer  = await file.arrayBuffer();
    const entries = await readZipEntries(buffer);
    const docXml  = entries['word/document.xml'];
    if (!docXml) throw new Error('word/document.xml not found');

    const headerXmls = Object.keys(entries)
      .filter(k => /^word\/header\d*\.xml$/.test(k))
      .map(k => entries[k]);

    const allLines = xmlToPagedLines(docXml);
    const date     = findDate(headerXmls, allLines, file.name);

    if (menu.variants) {
      const hasBreak = allLines.some(l => l.page > 0);
      if (hasBreak) {
        const groups = [[], []];
        for (const l of allLines) groups[l.page > 0 ? 1 : 0].push(l.text);
        menu.variants.forEach((v, idx) => {
          const lv     = groups[idx] || [];
          const sep    = detectSep(lv);
          const parsed = parseLines(lv, sep);
          state.data[v.slug]      = { date, sections: parsed };
          state.collapsed[v.slug] = new Set();
        });
        const a = state.data[menu.variants[0].slug].sections.length;
        const b = state.data[menu.variants[1].slug].sections.length;
        renderPanel();
        infoEl.textContent = 'Imported both languages — ' + a + ' / ' + b + ' categories' +
                             (date ? ' · ' + date : '');
      } else {
        const v       = activeVariant(menu);
        const text    = allLines.map(l => l.text);
        const sep     = detectSep(text);
        const parsed  = parseLines(text, sep);
        state.data[v.slug]      = { date, sections: parsed };
        state.collapsed[v.slug] = new Set();
        renderPanel();
        const items = parsed.reduce((n, s) => n + s.items.length, 0);
        infoEl.textContent = 'Imported to ' + v.label + ' — ' + parsed.length +
                             ' categories, ' + items + ' items' +
                             (date ? ' · ' + date : '');
      }
    } else {
      const slug    = menu.slug;
      const text    = allLines.map(l => l.text);
      const sep     = detectSep(text);
      const parsed  = parseLines(text, sep);
      state.data[slug]      = { date, sections: parsed };
      state.collapsed[slug] = new Set();
      renderPanel();
      const items = parsed.reduce((n, s) => n + s.items.length, 0);
      infoEl.textContent = 'Imported — ' + parsed.length + ' categories, ' +
                           items + ' items' + (date ? ' · ' + date : '');
    }
  } catch (e) {
    infoEl.textContent = 'Error: ' + e.message;
    console.error(e);
  } finally {
    input.value = '';
  }
}

// ── Switching ────────────────────────────────────────────────
async function switchMenu(menuId) {
  state.menuId = menuId;
  const menu = MENUS.find(m => m.id === menuId);
  renderSidebar();
  const slugs = menu.variants ? menu.variants.map(v => v.slug) : [menu.slug];
  await Promise.all(slugs.filter(s => !state.data[s]).map(loadSlug));
  renderPanel();
}

async function switchVariant(menuId, variantKey) {
  state.activeVariant[menuId] = variantKey;
  const menu = MENUS.find(m => m.id === menuId);
  const v    = menu.variants.find(x => x.key === variantKey);
  if (v && !state.data[v.slug]) await loadSlug(v.slug);
  renderPanel();
}

// ── Init ─────────────────────────────────────────────────────
async function init() {
  renderSidebar();
  await loadSlug(currentSlug());
  renderPanel();
}

init();
`;
}
