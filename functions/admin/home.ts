// GET/POST /admin/home — Cloudflare Access gated. Which sections of the home
// page the venue being edited shows, and whether its galleries are galleries.
//
// GET  → the panel.
// POST   JSON { off: ["story", …], single: ["hero", …] } → { ok, off, single }
//        — the sections switched OFF, and the gallery places showing ONE photo.
//
// The two venues are built from ONE home page, and the rooftop is not the
// restaurant: it may have no kitchen photo or story to tell. So each venue
// keeps its own list, and the middleware drops the switched-off sections from
// the page before it is sent. See functions/data/home-sections.ts.
//
// A flip saves at once, with no save bar — the same rule as the optional
// section switch in /admin/content: whether a part of the page is on the site
// is a publishing decision, not a draft to finish later.

import type { PagesFunction } from '@cloudflare/workers-types';
import { checkAccess, unauthorized, type AuthEnv } from './auth';
import { CHROME_CSS, VENUE_NAME, adminHead, topbar } from './chrome';
import {
  HOME_SECTIONS, readHomeLayout, writeHomeLayout, type HomeLayout, type HomeSectionEnv,
} from '../data/home-sections';
import { adminSite, type Site } from '../data/site';

type Env = AuthEnv & HomeSectionEnv;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

const STYLE = String.raw`
  main { max-inline-size: 48rem; margin: 0 auto; padding: 1.6rem 1.75rem 4rem; }
  .lead { margin: 0 0 .6rem; font-size: .92rem; color: var(--soft); max-inline-size: 62ch; }
  .lead strong { color: var(--ink); }
  .lead--minor { font-size: .8rem; color: var(--muted); }
  .summary {
    display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; flex-wrap: wrap;
    margin: 1.6rem 0 .7rem; padding-block-end: .55rem; border-block-end: 1px solid var(--line);
  }
  .summary__title { margin: 0; font-size: .74rem; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; }
  .summary__count { margin: 0; font-size: .8rem; color: var(--muted); }
  .summary a { color: var(--accent); font-weight: 600; font-size: .8rem; }
  .summary a:hover { text-decoration: underline; }

  /* The page, top to bottom — one row per section. */
  .sections { list-style: none; margin: 0; padding: 0; display: grid; gap: .55rem; }
  .sec {
    display: grid; grid-template-columns: 2.4rem 1fr auto; gap: .2rem 1rem; align-items: start;
    background: var(--card); border: 1px solid var(--line-soft);
    border-inline-start: 3px solid var(--ok);
    padding: .95rem 1.1rem 1rem .9rem;
    transition: background .15s, border-color .15s;
  }
  .sec.is-off { background: var(--deep); border-inline-start-color: var(--edge); }
  .sec.is-locked { border-inline-start-color: var(--line); }
  .sec__num {
    font-size: .78rem; font-weight: 700; letter-spacing: .08em; color: var(--muted);
    padding-block-start: .15rem; font-variant-numeric: tabular-nums;
  }
  .sec__body { min-inline-size: 0; }
  .sec__title { margin: 0; font-size: .95rem; font-weight: 600; color: var(--ink); }
  .sec.is-off .sec__title { color: var(--muted); text-decoration: line-through; text-decoration-color: var(--edge); }
  .sec__note { margin: .15rem 0 0; font-size: .8rem; color: var(--muted); max-inline-size: 56ch; }
  .sec__other { margin: .45rem 0 0; font-size: .72rem; color: var(--muted); letter-spacing: .02em; }
  .sec__other b { font-weight: 600; color: var(--soft); }
  .sec__status { margin: .35rem 0 0; min-block-size: 1.1em; font-size: .76rem; color: var(--ok); }
  .sec__status.is-err { color: var(--err); }
  .sec__side { display: grid; justify-items: end; gap: .25rem; padding-block-start: .1rem; }
  .sec__lock {
    font-size: .64rem; font-weight: 700; letter-spacing: .16em; text-transform: uppercase;
    color: var(--muted); border: 1px solid var(--line); padding: .25rem .5rem; background: var(--paper);
  }

  /* On/off switch — the same one /admin/content uses. */
  .switch { display: inline-flex; align-items: center; gap: .55rem; cursor: pointer;
    font-size: .74rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--ok); }
  .switch.is-off { color: var(--muted); }
  .switch input { position: absolute; opacity: 0; width: 0; height: 0; }
  .switch__track { inline-size: 2.6rem; block-size: 1.4rem; background: var(--edge);
    border: 1px solid var(--line); position: relative; transition: background .18s; flex: none; }
  .switch__track::after { content: ''; position: absolute; inset-block-start: 2px; inset-inline-start: 2px;
    inline-size: 1rem; block-size: 1rem; background: #fff; transition: transform .18s; }
  .switch input:checked + .switch__track { background: var(--ok); border-color: var(--ok); }
  .switch input:checked + .switch__track::after { transform: translateX(1.2rem); }
  .switch input:focus-visible + .switch__track { outline: 2px solid var(--accent); outline-offset: 2px; }
  .switch input:disabled + .switch__track { opacity: .6; }

  /* Gallery or single photo — two options, one chosen. */
  .choice { margin: .8rem 0 0; padding: .7rem .8rem .75rem; background: var(--paper); border: 1px solid var(--line-soft); }
  .sec.is-off .choice { opacity: .6; }
  .choice__head { display: flex; align-items: center; gap: .7rem; flex-wrap: wrap; }
  .choice__label { font-size: .66rem; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
  .choice__opts { display: inline-flex; border: 1px solid var(--line); background: var(--card); }
  .choice__opt { position: relative; cursor: pointer; }
  .choice__opt input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
  .choice__opt span {
    display: block; padding: .32rem .75rem; font-size: .74rem; font-weight: 600; color: var(--muted);
    border-inline-end: 1px solid var(--line); transition: background .15s, color .15s;
  }
  .choice__opt:last-child span { border-inline-end: 0; }
  .choice__opt input:checked + span { background: var(--ink); color: var(--paper); }
  .choice__opt input:focus-visible + span { outline: 2px solid var(--accent); outline-offset: 1px; }
  .choice__opt input:disabled + span { opacity: .6; }
  .choice__note { margin: .45rem 0 0; font-size: .74rem; color: var(--muted); max-inline-size: 58ch; }

  @media (max-width: 560px) {
    main { padding-inline: 1rem; }
    .sec { grid-template-columns: 1.8rem 1fr; }
    .sec__side { grid-column: 2; justify-items: start; padding-block-start: .5rem; }
  }
`;

function renderPage(site: Site, layout: HomeLayout, other: HomeLayout): string {
  const otherSite = site === 'rooftop' ? 'zahara' : 'rooftop';
  const venue     = VENUE_NAME[site];
  const otherName = otherSite === 'rooftop' ? 'the rooftop' : 'Zahara';
  const homeHref  = site === 'rooftop' ? '/rooftop/' : '/';
  const shown     = HOME_SECTIONS.filter((s) => !layout.off.includes(s.id)).length;

  const rows = HOME_SECTIONS.map((s, i) => {
    const isOff   = layout.off.includes(s.id);
    const num     = String(i + 1).padStart(2, '0');
    const gallery = 'gallery' in s ? s.gallery : null;
    const single  = layout.single.includes(s.id);

    // What the other venue does with this section, in the same words.
    const otherBits: string[] = [];
    if (!s.locked) otherBits.push(other.off.includes(s.id) ? 'hidden' : 'shown');
    if (gallery)   otherBits.push((other.single.includes(s.id) ? gallery.single : gallery.gallery).toLowerCase());

    const side = s.locked
      ? `<span class="sec__lock">Always shown</span>`
      : `<label class="switch${isOff ? ' is-off' : ''}">
           <input type="checkbox" data-home-toggle="${esc(s.id)}"${isOff ? '' : ' checked'}
                  aria-label="Show ${esc(s.label)} on the ${esc(venue)} home page" />
           <span class="switch__track" aria-hidden="true"></span>
           <span data-home-state>${isOff ? 'Hidden' : 'Shown'}</span>
         </label>`;

    const choice = !gallery ? '' : `
          <div class="choice">
            <div class="choice__head" role="radiogroup" aria-label="${esc(s.label)} · ${esc(gallery.label)}">
              <span class="choice__label">${esc(gallery.label)}</span>
              <span class="choice__opts">
                <label class="choice__opt"><input type="radio" name="single-${esc(s.id)}" value="gallery"
                       data-home-choice="${esc(s.id)}"${single ? '' : ' checked'} /><span>${esc(gallery.gallery)}</span></label>
                <label class="choice__opt"><input type="radio" name="single-${esc(s.id)}" value="single"
                       data-home-choice="${esc(s.id)}"${single ? ' checked' : ''} /><span>${esc(gallery.single)}</span></label>
              </span>
            </div>
            <p class="choice__note">${esc(gallery.note)}</p>
          </div>`;

    return `
      <li class="sec${isOff ? ' is-off' : ''}${s.locked ? ' is-locked' : ''}" data-home-row="${esc(s.id)}">
        <span class="sec__num" aria-hidden="true">${num}</span>
        <div class="sec__body">
          <h2 class="sec__title">${esc(s.label)}</h2>
          <p class="sec__note">${esc(s.note)}</p>
          ${choice}
          <p class="sec__other">At ${esc(otherName)}: <b>${esc(otherBits.join(' · ') || 'shown')}</b></p>
          <p class="sec__status" data-home-status role="status"></p>
        </div>
        <div class="sec__side">${side}</div>
      </li>`;
  }).join('');

  return `${adminHead(site, 'Home sections', `<style>${CHROME_CSS}${STYLE}</style>`)}
<body>
  ${topbar('home', { site })}
  <main>
    <p class="lead">
      Choose which parts of the <strong>${esc(venue)}</strong> home page visitors see,
      and whether its galleries show several photos or just one. Each venue has its
      own settings, so changing one here leaves ${esc(otherName)} exactly as it is.
    </p>
    <p class="lead lead--minor">
      Every change saves the moment you make it. The live page catches up within half
      a minute. A hidden section is removed from the page — nothing in it loads —
      and its copy and photos stay saved for when you switch it back on.
    </p>

    <div class="summary">
      <p class="summary__title">${esc(venue)} home page, top to bottom</p>
      <p class="summary__count"><span data-home-count>${shown}</span> of ${HOME_SECTIONS.length} shown ·
        <a href="${homeHref}" target="_blank" rel="noopener">View the page ↗</a></p>
    </div>

    <ol class="sections">${rows}</ol>
  </main>

  <script>
  (function () {
    var boxes   = Array.prototype.slice.call(document.querySelectorAll('[data-home-toggle]'));
    var radios  = Array.prototype.slice.call(document.querySelectorAll('[data-home-choice]'));
    var inputs  = boxes.concat(radios);
    var count   = document.querySelector('[data-home-count]');
    var total   = ${HOME_SECTIONS.length};

    /** The layout exactly as the controls show it. */
    function current() {
      return {
        off: boxes.filter(function (b) { return !b.checked; })
                  .map(function (b) { return b.getAttribute('data-home-toggle'); }),
        single: radios.filter(function (r) { return r.checked && r.value === 'single'; })
                      .map(function (r) { return r.getAttribute('data-home-choice'); }),
      };
    }

    function paint() {
      boxes.forEach(function (box) {
        var on = box.checked;
        box.closest('[data-home-row]').classList.toggle('is-off', !on);
        var label = box.closest('.switch');
        label.classList.toggle('is-off', !on);
        label.querySelector('[data-home-state]').textContent = on ? 'Shown' : 'Hidden';
      });
      if (count) count.textContent = String(total - current().off.length);
    }

    /** Set every control from a layout — the one the server STORED, so the
     *  panel never claims more than the site will do. */
    function apply(layout) {
      boxes.forEach(function (b) { b.checked = layout.off.indexOf(b.getAttribute('data-home-toggle')) === -1; });
      radios.forEach(function (r) {
        var single = layout.single.indexOf(r.getAttribute('data-home-choice')) !== -1;
        r.checked = (r.value === 'single') === single;
      });
      paint();
    }

    function statusFor(input) {
      return input.closest('[data-home-row]').querySelector('[data-home-status]');
    }
    function say(el, msg, err) {
      if (!el) return;
      el.textContent = msg || '';
      el.classList.toggle('is-err', !!err);
    }

    var saved = current();

    inputs.forEach(function (input) {
      input.addEventListener('change', async function () {
        var status = statusFor(input);
        var wanted = current();
        paint();
        inputs.forEach(function (i) { i.disabled = true; });
        say(status, 'Saving…', false);
        try {
          // The whole layout goes every time, so two quick changes can't
          // leave the stored record describing only the second one.
          var res  = await fetch('/admin/home', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(wanted),
          });
          var data = await res.json();
          if (!res.ok || !data.ok) throw new Error(data.error || 'Could not save');
          saved = { off: data.off, single: data.single };
          apply(saved);
          var msg;
          if (input.type === 'checkbox') {
            msg = input.checked ? 'Shown — visitors will see it.' : 'Hidden — removed from the page.';
          } else {
            msg = input.value === 'single' ? 'Saved — a single photo.' : 'Saved — a gallery.';
          }
          say(status, msg, false);
        } catch (err) {
          apply(saved);   // a control must never lie about the site
          say(status, String((err && err.message) || err), true);
        } finally {
          inputs.forEach(function (i) { i.disabled = false; });
        }
      });
    });
  })();
  </script>
</body>
</html>`;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return unauthorized();
  const site  = adminSite(request);
  const other: Site = site === 'rooftop' ? 'zahara' : 'rooftop';
  const [layout, otherLayout] = await Promise.all([readHomeLayout(env, site), readHomeLayout(env, other)]);
  return new Response(renderPage(site, layout, otherLayout), {
    headers: {
      'Content-Type':  'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag':  'noindex, nofollow',
    },
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return json({ ok: false, error: 'Unauthorized' }, 401);

  let body: unknown;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'Expected JSON body' }, 400); }

  const layout = await writeHomeLayout(env, adminSite(request), body);
  if (!layout) return json({ ok: false, error: 'No KV namespace bound for this venue' }, 500);
  return json({ ok: true, ...layout });
};
