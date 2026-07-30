// GET /admin/reserve/ — the venue portal's numbers.
//
// Reads the first-party hits written by /api/reserve-track (see
// functions/data/reserve-track.ts) and answers three questions: how many
// people opened /reserve/, how many went on to book, and which venue they
// picked.
//
// WRITTEN FOR SOMEONE WHO IS NOT A COMPUTER PERSON. That constraint drives
// every choice here: the headline is a SENTENCE in plain words before it is a
// number, the controls are big labelled buttons rather than dropdowns or a
// query string to edit, "Today" and "Yesterday" are one click each, and every
// table says what it counts in words. No charts to interpret, no jargon
// ("sessions", "conversion", "bounce"), no state that has to be set up before
// the page is useful. It works with JavaScript switched off apart from the
// reset confirmation.
//
// This is the ONE admin page that is not venue-scoped. The portal sits above
// both venues — it is the fork in the road — so the venue switch in the topbar
// only re-tints the tool here; the numbers are the same either way. The Zahara
// and Rooftop tabs BELOW are the real split, and they filter the whole report
// to the people who chose that venue.

import type { PagesFunction } from '@cloudflare/workers-types';
import { checkAccess, unauthorized, type AuthEnv } from './auth';
import { CHROME_CSS, adminHead, topbar } from './chrome';
import { adminSite } from '../data/site';
import {
  readHits, readResetAt, summarise, trackKv, israelDay, recentDays, RETENTION_DAYS,
  type Breakdown, type Hit, type Summary, type ReserveTrackEnv, type ReserveVenue,
} from '../data/reserve-track';

type Env = AuthEnv & ReserveTrackEnv;

const VENUE_LABEL: Record<ReserveVenue, string> = {
  zahara: 'Zahara', rooftop: 'Nucha Rooftop',
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

const TIME_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false,
});
const SHORT_DAY_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jerusalem', weekday: 'short', day: '2-digit', month: 'short',
});
const LONG_DAY_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

/** A day key ('2026-07-28') as a Date fixed at midday, so formatting it in
 *  Israel time can never land on the day before. */
function dayDate(day: string): Date {
  return new Date(`${day}T12:00:00Z`);
}

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const PAGE_CSS = String.raw`
.wrap { max-width: 1100px; margin: 0 auto; padding: 1.5rem 1.75rem 4rem; }

/* ── Controls ─────────────────────────────────────────────────────────── */
.bar {
  display: flex; flex-wrap: wrap; align-items: center; gap: .5rem;
  margin: 0 0 1rem;
}
.bar__label {
  font-size: .7rem; letter-spacing: .16em; text-transform: uppercase;
  font-weight: 700; color: var(--muted); min-width: 5.5rem;
}
/* Big, obvious, finger-sized. These are the only things on the page that get
   clicked, so they are the only things that look clickable. */
.btn {
  font-size: .88rem; font-weight: 600; line-height: 1;
  padding: .65rem 1.05rem; border: 1px solid var(--line);
  background: var(--card); color: var(--soft); cursor: pointer;
}
.btn:hover { color: var(--ink); border-color: var(--accent); }
.btn.is-active {
  background: var(--accent); border-color: var(--accent); color: #fff;
}
.btn--zahara.is-active  { background: #9C4621; border-color: #9C4621; }
.btn--rooftop.is-active { background: #1F6260; border-color: #1F6260; }

.pick { display: flex; align-items: center; gap: .4rem; }
.pick input[type="date"] {
  padding: .55rem .6rem; border: 1px solid var(--line);
  background: var(--card); color: var(--ink); font-size: .88rem;
}

/* ── The sentence ─────────────────────────────────────────────────────── */
.headline {
  border: 1px solid var(--line); border-inline-start: 4px solid var(--accent);
  background: var(--card); padding: 1.1rem 1.25rem; margin: 1.5rem 0;
  font-size: 1.08rem; line-height: 1.65; color: var(--ink);
}
.headline b { font-weight: 700; }
.headline .za   { color: #9C4621; font-weight: 700; }
.headline .roof { color: #1F6260; font-weight: 700; }
.headline__when {
  display: block; font-size: .7rem; letter-spacing: .16em; text-transform: uppercase;
  font-weight: 700; color: var(--muted); margin-bottom: .5rem;
}

/* ── Tiles ────────────────────────────────────────────────────────────── */
.tiles {
  display: grid; gap: 1px; background: var(--line);
  border: 1px solid var(--line); margin: 0 0 2rem;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
}
.tile { background: var(--card); padding: 1.1rem 1.2rem; }
.tile__label {
  font-size: .74rem; font-weight: 600; color: var(--muted); margin: 0 0 .4rem;
}
.tile__value { font-size: 2.3rem; line-height: 1; font-weight: 500; color: var(--ink); }
.tile__value--zahara  { color: #9C4621; }
.tile__value--rooftop { color: #1F6260; }
.tile__hint { font-size: .78rem; color: var(--muted); margin-top: .4rem; }

/* ── Sections + tables ────────────────────────────────────────────────── */
h2 {
  font-size: 1rem; font-weight: 700; color: var(--ink);
  margin: 2.2rem 0 .2rem;
}
h2 + .sub { margin: 0 0 .8rem; font-size: .8rem; color: var(--muted); }
.grid { display: grid; gap: 1.8rem; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }

table { width: 100%; border-collapse: collapse; font-size: .88rem; }
th, td { text-align: start; padding: .55rem .5rem; border-bottom: 1px solid var(--line-soft); }
th { font-size: .74rem; color: var(--muted); font-weight: 600; }
td.num, th.num { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
tbody tr:hover { background: var(--deep); }
tbody tr.is-today td { font-weight: 700; }

/* A proportional rule under the label — enough to see the shape at a glance
   without asking anyone to read a chart. */
.bar-rule { display: block; height: 3px; background: var(--accent); margin-top: .35rem; min-width: 1px; }
.bar-split { display: flex; height: 4px; margin-top: .35rem; }
.bar-split i { display: block; height: 100%; }
.bar-za   { background: #9C4621; }
.bar-roof { background: #1F6260; }
.bar-rest { background: var(--line); }

.key { display: flex; flex-wrap: wrap; gap: 1rem; font-size: .78rem; color: var(--muted); margin: .6rem 0 0; }
.key span { display: inline-flex; align-items: center; gap: .35rem; }
.key i { width: .8rem; height: .8rem; display: inline-block; }

.tag {
  display: inline-block; font-size: .72rem; font-weight: 600;
  padding: .15rem .45rem; border: 1px solid var(--line); color: var(--muted);
}
.tag--zahara  { color: #9C4621; border-color: #9C4621; }
.tag--rooftop { color: #1F6260; border-color: #1F6260; }

.empty {
  border: 1px dashed var(--line); background: var(--card);
  padding: 2.8rem 1.5rem; text-align: center; color: var(--soft); font-size: 1rem; line-height: 1.7;
}
.ok {
  border: 1px solid var(--ok); background: var(--ok-bg); color: var(--ok);
  padding: .8rem 1rem; margin: 0 0 1.2rem; font-size: .92rem; font-weight: 600;
}
.muted { color: var(--muted); }
.scroll { overflow-x: auto; }

/* ── Reset ────────────────────────────────────────────────────────────── */
.danger {
  margin-top: 3.5rem; border: 1px solid var(--line); background: var(--card);
  padding: 1.2rem 1.25rem;
}
.danger h2 { margin-top: 0; }
.danger p { font-size: .88rem; color: var(--soft); margin: .2rem 0 1rem; max-width: 60ch; }
.btn--danger {
  background: var(--card); border-color: var(--err); color: var(--err); font-weight: 700;
}
.btn--danger:hover { background: var(--err); border-color: var(--err); color: #fff; }
`;

// ── Period ──────────────────────────────────────────────────────────────────

interface Period { id: string; label: string; days: string[]; phrase: string }

/** Turn the query string into a set of Israel-local days plus the words used
 *  to describe it. `day=YYYY-MM-DD` beats `period=…` when both are present. */
function resolvePeriod(url: URL): Period {
  const today = israelDay(Date.now());

  const asked = url.searchParams.get('day') || '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(asked) && asked <= today) {
    return {
      id: `day:${asked}`,
      label: LONG_DAY_FMT.format(dayDate(asked)),
      days: [asked],
      phrase: asked === today ? 'Today' : `On ${LONG_DAY_FMT.format(dayDate(asked))}`,
    };
  }

  switch (url.searchParams.get('period')) {
    case 'today':
      return { id: 'today', label: 'Today', days: [today], phrase: 'Today' };
    case 'yesterday': {
      const y = israelDay(Date.now() - 86_400_000);
      return { id: 'yesterday', label: 'Yesterday', days: [y], phrase: 'Yesterday' };
    }
    case '30':
      return { id: '30', label: 'Last 30 days', days: recentDays(30), phrase: 'In the last 30 days' };
    case '90':
      return { id: '90', label: 'Last 90 days', days: recentDays(90), phrase: 'In the last 90 days' };
    default:
      return { id: '7', label: 'Last 7 days', days: recentDays(7), phrase: 'In the last 7 days' };
  }
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function controls(period: Period, venue: ReserveVenue | null, today: string): string {
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams(extra);
    if (venue) p.set('venue', venue);
    return `?${p.toString()}`;
  };
  const periodBtn = (id: string, label: string, params: Record<string, string>) =>
    `<a class="btn${period.id === id ? ' is-active' : ''}" href="${qs(params)}">${label}</a>`;

  const venueBtn = (id: ReserveVenue | null, label: string, cls: string) => {
    const p = new URLSearchParams(
      period.id.startsWith('day:') ? { day: period.days[0] } : { period: period.id },
    );
    if (id) p.set('venue', id);
    return `<a class="btn ${cls}${venue === id ? ' is-active' : ''}" href="?${p.toString()}">${label}</a>`;
  };

  const dayValue = period.id.startsWith('day:') ? period.days[0] : '';

  return `
  <div class="bar">
    <span class="bar__label">When</span>
    ${periodBtn('today',     'Today',        { period: 'today' })}
    ${periodBtn('yesterday', 'Yesterday',    { period: 'yesterday' })}
    ${periodBtn('7',         'Last 7 days',  { period: '7' })}
    ${periodBtn('30',        'Last 30 days', { period: '30' })}
    ${periodBtn('90',        'Last 90 days', { period: '90' })}
    <form class="pick" method="get" action="/admin/reserve/">
      ${venue ? `<input type="hidden" name="venue" value="${venue}" />` : ''}
      <label class="muted" for="day" style="font-size:.82rem">or pick a day</label>
      <input type="date" id="day" name="day" max="${today}" value="${dayValue}" />
      <button class="btn" type="submit">Show</button>
    </form>
  </div>

  <div class="bar">
    <span class="bar__label">Who</span>
    ${venueBtn(null,      'Everyone',      'btn--all')}
    ${venueBtn('zahara',  'Zahara only',   'btn--zahara')}
    ${venueBtn('rooftop', 'Rooftop only',  'btn--rooftop')}
  </div>`;
}

/** The plain-words summary. This is the part most people will read and then
 *  stop, so it has to be true and complete on its own. */
function headline(period: Period, all: Summary, venue: ReserveVenue | null, since: string): string {
  const when = `<span class="headline__when">${esc(period.label)}${since}</span>`;

  if (venue) {
    const n = venue === 'zahara' ? all.zahara : all.rooftop;
    const cls = venue === 'zahara' ? 'za' : 'roof';
    return `<div class="headline">${when}
      ${esc(period.phrase)}, <span class="${cls}">${plural(n, 'person', 'people')}</span>
      went to <b>${VENUE_LABEL[venue]}</b>'s booking page —
      that is <b>${pct(n, all.visits)}%</b> of the ${plural(all.visits, 'person', 'people')}
      who opened the page, and <b>${pct(n, all.clicks)}%</b> of everyone who picked a venue.
    </div>`;
  }

  if (!all.visits) {
    return `<div class="headline">${when}Nobody opened the page ${esc(period.phrase.toLowerCase())}.</div>`;
  }

  const chose = all.clicks
    ? `<b>${plural(all.clicks, 'of them', 'of them')}</b> went on to book (<b>${Math.round(all.ctr * 100)}%</b>) —
       <span class="za">${all.zahara}</span> at Zahara and
       <span class="roof">${all.rooftop}</span> at Nucha Rooftop.`
    : 'Nobody has picked a venue yet.';

  return `<div class="headline">${when}
    ${esc(period.phrase)}, <b>${plural(all.visits, 'person', 'people')}</b> opened the page. ${chose}
  </div>`;
}

function tiles(all: Summary, venue: ReserveVenue | null): string {
  if (venue) {
    const n   = venue === 'zahara' ? all.zahara : all.rooftop;
    const cls = venue === 'zahara' ? 'zahara' : 'rooftop';
    return `<div class="tiles">
      <div class="tile">
        <p class="tile__label">Went to ${VENUE_LABEL[venue]}</p>
        <div class="tile__value tile__value--${cls}">${n}</div>
        <p class="tile__hint">clicks on the booking link</p>
      </div>
      <div class="tile">
        <p class="tile__label">Share of everyone who opened the page</p>
        <div class="tile__value">${pct(n, all.visits)}%</div>
        <p class="tile__hint">out of ${all.visits}</p>
      </div>
      <div class="tile">
        <p class="tile__label">Share of everyone who picked a venue</p>
        <div class="tile__value">${pct(n, all.clicks)}%</div>
        <p class="tile__hint">out of ${all.clicks}</p>
      </div>
    </div>`;
  }

  return `<div class="tiles">
    <div class="tile">
      <p class="tile__label">Opened the page</p>
      <div class="tile__value">${all.visits}</div>
      <p class="tile__hint">${all.views} page open${all.views === 1 ? '' : 's'} in total</p>
    </div>
    <div class="tile">
      <p class="tile__label">Picked a venue</p>
      <div class="tile__value">${all.clicks}</div>
      <p class="tile__hint">${Math.round(all.ctr * 100)}% of everyone who opened it</p>
    </div>
    <div class="tile">
      <p class="tile__label">Zahara</p>
      <div class="tile__value tile__value--zahara">${all.zahara}</div>
      <p class="tile__hint">${pct(all.zahara, all.clicks)}% of the choices</p>
    </div>
    <div class="tile">
      <p class="tile__label">Nucha Rooftop</p>
      <div class="tile__value tile__value--rooftop">${all.rooftop}</div>
      <p class="tile__hint">${pct(all.rooftop, all.clicks)}% of the choices</p>
    </div>
  </div>`;
}

function dayTable(s: Summary, today: string, venue: ReserveVenue | null): string {
  if (s.days.length < 2) return '';
  const max = Math.max(1, ...s.days.map((d) => d.views));
  const w = (n: number) => `${Math.round((n / max) * 100)}%`;

  const rows = s.days.slice().reverse().map((d) => {
    const clicks = d.zahara + d.rooftop;
    const label  = esc(SHORT_DAY_FMT.format(dayDate(d.day)));
    // Each day links to its own single-day view — the fastest way to answer
    // "what happened on the day we posted the story?".
    const href = `?day=${d.day}${venue ? `&venue=${venue}` : ''}`;
    return `
      <tr class="${d.day === today ? 'is-today' : ''}">
        <td>
          <a href="${href}">${label}</a>${d.day === today ? ' <span class="muted">(today)</span>' : ''}
          <span class="bar-split">
            <i class="bar-za"   style="width:${w(d.zahara)}"></i>
            <i class="bar-roof" style="width:${w(d.rooftop)}"></i>
            <i class="bar-rest" style="width:${w(Math.max(0, d.views - clicks))}"></i>
          </span>
        </td>
        <td class="num">${d.views}</td>
        <td class="num">${d.zahara}</td>
        <td class="num">${d.rooftop}</td>
        <td class="num muted">${pct(clicks, d.views)}%</td>
      </tr>`;
  }).join('');

  return `<h2>Day by day</h2>
    <p class="sub">Click a date to see just that day.</p>
    <div class="scroll"><table>
      <thead><tr>
        <th>Day</th><th class="num">Opened</th>
        <th class="num">Zahara</th><th class="num">Rooftop</th><th class="num">Booked</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="key">
      <span><i class="bar-za"></i> chose Zahara</span>
      <span><i class="bar-roof"></i> chose Rooftop</span>
      <span><i class="bar-rest"></i> left without choosing</span>
    </p>`;
}

function breakdownTable(title: string, sub: string, rows: Breakdown[], total: number): string {
  if (!rows.length) return `<div><h2>${title}</h2><p class="sub">${sub}</p><p class="muted">Nothing yet.</p></div>`;
  const max = rows[0].count || 1;
  const body = rows.map((r) => `
    <tr>
      <td>${esc(r.label)}<span class="bar-rule" style="width:${Math.round((r.count / max) * 100)}%"></span></td>
      <td class="num">${r.count}</td>
      <td class="num muted">${pct(r.count, total)}%</td>
    </tr>`).join('');
  return `<div><h2>${title}</h2><p class="sub">${sub}</p>
    <table><tbody>${body}</tbody></table></div>`;
}

function hourTable(hours: number[]): string {
  const max = Math.max(1, ...hours);
  if (!max) return '';
  const rows = hours.map((n, h) => `
    <tr>
      <td>${String(h).padStart(2, '0')}:00<span class="bar-rule" style="width:${Math.round((n / max) * 100)}%"></span></td>
      <td class="num">${n}</td>
    </tr>`).join('');
  return `<div><h2>Time of day</h2><p class="sub">When people opened the page (Israel time).</p>
    <table><tbody>${rows}</tbody></table></div>`;
}

function recentTable(hits: Hit[]): string {
  if (!hits.length) return '';
  const rows = hits.map((h) => {
    const what = h.e === 'click'
      ? `<span class="tag tag--${h.v === 'rooftop' ? 'rooftop' : 'zahara'}">Booked ${h.v === 'rooftop' ? 'Rooftop' : 'Zahara'}</span>`
      : '<span class="tag">Opened the page</span>';
    return `
      <tr>
        <td class="muted">${esc(SHORT_DAY_FMT.format(new Date(h.t)))} ${esc(TIME_FMT.format(new Date(h.t)))}</td>
        <td>${what}</td>
        <td>${esc([h.ct, h.c].filter(Boolean).join(', ') || '—')}</td>
        <td>${esc(h.d || '—')}</td>
        <td>${esc(h.r || (h.e === 'view' ? 'opened it directly' : '—'))}</td>
        <td>${esc(h.uc || h.us || '—')}</td>
      </tr>`;
  }).join('');
  return `<h2>Latest activity</h2>
    <p class="sub">The most recent ${hits.length} things that happened, newest first.</p>
    <div class="scroll"><table>
      <thead><tr>
        <th>When</th><th>What</th><th>Where from</th>
        <th>Device</th><th>Arrived via</th><th>Link tag</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

function dangerZone(resetAt: number): string {
  const since = resetAt
    ? `Counting restarted on ${esc(LONG_DAY_FMT.format(new Date(resetAt)))}.`
    : 'The counter has never been reset.';
  return `<section class="danger">
    <h2>Start counting again</h2>
    <p>
      ${since}
      This sets every number on this page back to zero and starts fresh from right now.
      It cannot be undone, and it does not affect the page itself — <code>/reserve/</code>
      keeps working exactly as before.
    </p>
    <form method="post" action="/admin/reserve/reset"
          onsubmit="return confirm('Set all the reserve numbers back to zero and start counting again from now?\\n\\nThis cannot be undone.');">
      <button class="btn btn--danger" type="submit">Reset all numbers to zero</button>
    </form>
  </section>`;
}

// ── Handler ─────────────────────────────────────────────────────────────────

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return unauthorized();

  const url   = new URL(request.url);
  const site  = adminSite(request);
  const today = israelDay(Date.now());

  const period   = resolvePeriod(url);
  const venueRaw = url.searchParams.get('venue');
  const venue: ReserveVenue | null =
    venueRaw === 'zahara' || venueRaw === 'rooftop' ? venueRaw : null;

  const banner = url.searchParams.has('reset')
    ? '<p class="ok">Done — everything is back to zero and counting again from now.</p>'
    : url.searchParams.has('error')
      ? '<p class="ok" style="color:var(--err);background:var(--err-bg);border-color:var(--err)">Could not reset — no KV namespace is bound.</p>'
      : '';

  let body: string;

  if (!trackKv(env)) {
    body = `<div class="empty">
      Nothing can be recorded yet, because no storage is connected.<br />
      <span class="muted">Bind <code>MENU_DATA</code> in <code>wrangler.toml</code> and deploy again.</span>
    </div>`;
  } else {
    const [hits, resetAt] = await Promise.all([
      readHits(env, period.days),
      readResetAt(env),
    ]);

    const since = resetAt ? ` · counting since ${esc(LONG_DAY_FMT.format(new Date(resetAt)))}` : '';

    if (!hits.length) {
      body = headline(period, summarise([], period.days), venue, since) + `
        <div class="empty">
          Nothing happened in this period.<br />
          <span class="muted">Try a longer range above, or open
          <a href="/reserve/" target="_blank" rel="noopener">the reserve page</a>
          yourself — it shows up here within a few seconds.</span>
        </div>` + dangerZone(resetAt);
    } else {
      // The unfiltered roll-up is always needed: the venue tabs quote their
      // share of ALL visitors, so the denominators come from here.
      const all      = summarise(hits, period.days);
      const filtered = venue ? summarise(hits, period.days, venue) : all;

      body = [
        headline(period, all, venue, since),
        tiles(all, venue),
        dayTable(filtered, today, venue),
        `<div class="grid">
          ${breakdownTable('Arrived via', 'The site or app they came from.', filtered.referrers, filtered.views)}
          ${breakdownTable('Link tag', 'Set by adding <code>?utm_source=…</code> to the link you share.', filtered.campaigns, filtered.views)}
          ${breakdownTable('Country', 'Where they were.', filtered.countries, filtered.views)}
          ${breakdownTable('City', 'Where they were, more precisely.', filtered.cities, filtered.views)}
          ${breakdownTable('Phone or computer', 'What they were using.', filtered.devices, filtered.views)}
          ${breakdownTable('Browser', 'Instagram and Facebook open links in their own browser.', filtered.browsers, filtered.views)}
          ${hourTable(filtered.hours)}
        </div>`,
        recentTable(filtered.recent),
        dangerZone(resetAt),
      ].join('\n');
    }
  }

  const html = `${adminHead(site, 'Reserve portal', `<style>${CHROME_CSS}${PAGE_CSS}</style>`)}
<body>
  ${topbar('reserve', { site, siteHref: '/reserve/' })}
  <div class="wrap">
    ${banner}
    <p class="sub" style="margin:0 0 1.2rem">
      Everyone who opens <a href="/reserve/" target="_blank" rel="noopener">the reserve page</a>
      and which venue they picked. Counted on our own server, so ad blockers and
      cookie choices do not hide anyone. Records are kept for ${RETENTION_DAYS} days.
    </p>

    ${controls(period, venue, today)}
    ${body}
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
};
