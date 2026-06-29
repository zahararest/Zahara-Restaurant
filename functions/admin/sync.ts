// GET /admin/sync — Access-gated. Self-contained page for the OneDrive menu
// sync: schedule (how many times / what hours), per-menu OneDrive links, a
// "Sync now" per menu and "Sync all now", plus last-run status.
//
// Reads/writes config via /admin/sync/config and triggers /admin/sync/run.
// Storage format of the menus themselves is untouched — sync writes the same
// MENU_DATA keys the editor uses.

import type { PagesFunction } from '@cloudflare/workers-types';
import { checkAccess, unauthorized, type AuthEnv } from './auth';
import { MENU_TYPES, type MenuType } from './menus';

const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500' +
  '&family=Inter:wght@400;500;600&display=swap';

/** Flatten MENU_TYPES → [{ slug, label }], one row per syncable menu.
 *  Events are managed elsewhere (no OneDrive doc), so they're excluded. */
function syncableMenus(): { slug: string; label: string }[] {
  const out: { slug: string; label: string }[] = [];
  for (const m of MENU_TYPES as MenuType[]) {
    if (m.id === 'events') continue;
    if ('variants' in m) {
      for (const v of m.variants) out.push({ slug: v.slug, label: `${m.label} · ${v.label}` });
    } else {
      out.push({ slug: m.slug, label: m.label });
    }
  }
  return out;
}

const STYLE = `
  *,*::before,*::after{box-sizing:border-box}
  :root{--ink:#1A1410;--paper:#FBF7F0;--line:#E4DACB;--accent:#9C4621;--muted:#7A6E5D}
  body{margin:0;background:var(--paper);color:var(--ink);font-family:Inter,system-ui,sans-serif;font-size:15px;line-height:1.5}
  .topbar{position:sticky;top:0;z-index:10;background:var(--paper);border-bottom:1px solid var(--line)}
  .topbar__nav{display:flex;align-items:center;gap:18px;padding:12px 22px;flex-wrap:wrap}
  .topbar__brand{font-family:'Frank Ruhl Libre',serif;font-weight:500;text-decoration:none;color:var(--ink);font-size:17px}
  .topbar__navlink{text-decoration:none;color:var(--muted);font-size:14px}
  .topbar__navlink.is-active{color:var(--accent);font-weight:600}
  .topbar__spacer{flex:1}
  .topbar__site{text-decoration:none;color:var(--muted);font-size:13px}
  .wrap{max-width:860px;margin:0 auto;padding:26px 22px 80px}
  h1{font-family:'Frank Ruhl Libre',serif;font-weight:500;font-size:26px;margin:0 0 4px}
  .lede{color:var(--muted);margin:0 0 26px;font-size:14px}
  .card{background:#fff;border:1px solid var(--line);border-radius:12px;padding:20px 22px;margin-bottom:20px}
  .card h2{font-family:'Frank Ruhl Libre',serif;font-weight:500;font-size:19px;margin:0 0 14px}
  .row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
  .hours{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0}
  .hour-chip{display:inline-flex;align-items:center;gap:6px;background:var(--paper);border:1px solid var(--line);border-radius:999px;padding:4px 6px 4px 12px}
  .hour-chip select{border:none;background:transparent;font:inherit;color:var(--ink);padding:2px}
  .hour-chip button{border:none;background:transparent;cursor:pointer;color:var(--muted);font-size:15px;line-height:1;padding:2px 4px}
  .hour-chip button:hover{color:var(--accent)}
  .btn{border:1px solid var(--line);background:#fff;border-radius:8px;padding:8px 14px;font:inherit;cursor:pointer;color:var(--ink)}
  .btn:hover{border-color:var(--accent)}
  .btn--primary{background:var(--accent);color:#fff;border-color:var(--accent)}
  .btn--ghost{background:transparent}
  .btn:disabled{opacity:.5;cursor:default}
  .toggle{display:inline-flex;align-items:center;gap:8px;cursor:pointer}
  .menu-row{display:grid;grid-template-columns:170px 1fr auto;gap:12px;align-items:center;padding:12px 0;border-top:1px solid var(--line)}
  .menu-row:first-of-type{border-top:none}
  .menu-row .label{font-weight:500}
  .menu-row input[type=text]{width:100%;padding:8px 10px;border:1px solid var(--line);border-radius:8px;font:inherit;background:var(--paper)}
  .status{font-size:12px;color:var(--muted);margin-top:3px;min-height:14px}
  .status.ok{color:#2e7d32}.status.err{color:#b3261e}
  .savebar{display:flex;align-items:center;gap:14px;margin-top:8px}
  .save-msg{font-size:13px;color:var(--muted)}.save-msg.ok{color:#2e7d32}.save-msg.err{color:#b3261e}
  .hint{font-size:12.5px;color:var(--muted);margin:6px 0 0}
  @media(max-width:640px){.menu-row{grid-template-columns:1fr}.menu-row>div:last-child{justify-self:start}}
`;

function script(menus: { slug: string; label: string }[]): string {
  return String.raw`
const MENUS = ${JSON.stringify(menus)};
let config = { enabled:true, hours:[12,16,18], menus:{} };

const $ = (s,r=document)=>r.querySelector(s);
function el(tag,attrs,...kids){const n=document.createElement(tag);attrs=attrs||{};for(const k in attrs){const v=attrs[k];if(v==null||v===false)continue;if(k==='class')n.className=v;else if(k.startsWith('on'))n.addEventListener(k.slice(2),v);else n.setAttribute(k,v);}for(const c of kids){if(c==null||c===false)continue;n.appendChild(typeof c==='string'?document.createTextNode(c):c);}return n;}

function hourOptions(sel){
  const s = el('select');
  for(let h=0;h<24;h++){const o=el('option',{value:String(h)}, String(h).padStart(2,'0')+':00'); if(h===sel)o.setAttribute('selected','');s.appendChild(o);}
  s.value=String(sel);
  return s;
}

function renderHours(){
  const box = $('#hours'); box.innerHTML='';
  config.hours.forEach((h,i)=>{
    const sel = hourOptions(h);
    sel.addEventListener('change',()=>{config.hours[i]=parseInt(sel.value,10);});
    const chip = el('span',{class:'hour-chip'}, sel, el('button',{title:'Remove',onclick:()=>{config.hours.splice(i,1);renderHours();}},'✕'));
    box.appendChild(chip);
  });
  box.appendChild(el('button',{class:'btn btn--ghost',onclick:()=>{config.hours.push(12);renderHours();}},'+ Add time'));
  $('#count').textContent = config.hours.length + (config.hours.length===1?' time/day':' times/day');
}

function statusText(m){
  if(!m||!m.lastSync) return '';
  const when = new Date(m.lastSync).toLocaleString();
  return (m.lastStatus==='ok' ? '✓ '+(m.lastItems??'?')+' items · '+when : '✕ '+(m.lastStatus||'error')+' · '+when);
}

function renderMenus(){
  const box = $('#menus'); box.innerHTML='';
  for(const def of MENUS){
    const m = config.menus[def.slug] || {};
    const input = el('input',{type:'text',value:m.link||'',placeholder:'Paste OneDrive link for this menu','data-slug':def.slug});
    const statusEl = el('div',{class:'status '+(m.lastStatus==='ok'?'ok':(m.lastStatus?'err':'')),'data-status':def.slug}, statusText(m));
    const syncBtn = el('button',{class:'btn',onclick:()=>syncOne(def.slug,syncBtn)}, 'Sync now');
    box.appendChild(el('div',{class:'menu-row'},
      el('div',{class:'label'}, def.label),
      el('div',{}, input, statusEl),
      el('div',{}, syncBtn),
    ));
  }
}

function collectMenus(){
  const out={};
  for(const inp of document.querySelectorAll('#menus input[data-slug]')) out[inp.getAttribute('data-slug')]={link:inp.value.trim()};
  return out;
}

async function loadConfig(){
  try{
    const r = await fetch('/admin/sync/config',{cache:'no-store'});
    const j = await r.json();
    if(j.ok) config = j.config;
  }catch(e){}
  $('#enabled').checked = config.enabled!==false;
  renderHours(); renderMenus();
}

async function saveConfig(msgEl){
  msgEl.textContent='Saving…'; msgEl.className='save-msg';
  const body={enabled:$('#enabled').checked,hours:config.hours,menus:collectMenus()};
  try{
    const r=await fetch('/admin/sync/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const j=await r.json();
    if(j.ok){config=j.config;renderMenus();msgEl.textContent='✓ Saved';msgEl.className='save-msg ok';}
    else{msgEl.textContent='Error: '+(j.error||'failed');msgEl.className='save-msg err';}
  }catch(e){msgEl.textContent='Network error';msgEl.className='save-msg err';}
}

function applyResults(results){
  for(const r of results||[]){
    config.menus[r.slug]=config.menus[r.slug]||{};
    config.menus[r.slug].lastSync=new Date().toISOString();
    config.menus[r.slug].lastStatus=r.ok?'ok':(r.error||'error');
    config.menus[r.slug].lastItems=r.items;
    const s=document.querySelector('[data-status="'+r.slug+'"]');
    if(s){s.textContent=statusText(config.menus[r.slug]);s.className='status '+(r.ok?'ok':'err');}
  }
}

// Save first so the latest pasted link is used, then run.
async function syncOne(slug,btn){
  const msg=$('#save-msg'); await saveConfig(msg);
  btn.disabled=true; const old=btn.textContent; btn.textContent='Syncing…';
  try{
    const r=await fetch('/admin/sync/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug})});
    const j=await r.json(); applyResults(j.results);
  }catch(e){}
  btn.disabled=false; btn.textContent=old;
}

async function syncAll(btn){
  const msg=$('#save-msg'); await saveConfig(msg);
  btn.disabled=true; const old=btn.textContent; btn.textContent='Syncing all…';
  try{
    const r=await fetch('/admin/sync/run',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    const j=await r.json(); applyResults(j.results);
    msg.textContent=j.ok?'✓ Synced all':'Some menus failed — see each row'; msg.className='save-msg '+(j.ok?'ok':'err');
  }catch(e){msg.textContent='Network error';msg.className='save-msg err';}
  btn.disabled=false; btn.textContent=old;
}

document.addEventListener('DOMContentLoaded',()=>{
  $('#save-btn').addEventListener('click',()=>saveConfig($('#save-msg')));
  $('#syncall-btn').addEventListener('click',e=>syncAll(e.currentTarget));
  loadConfig();
});
`;
}

export function syncPage(): string {
  const menus = syncableMenus();
  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>Menu sync · Zahara</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="${FONTS_HREF}" />
  <style>${STYLE}</style>
</head>
<body>
  <header class="topbar">
    <nav class="topbar__nav" aria-label="Admin sections">
      <a class="topbar__brand"             href="/admin/">Zahara · Admin</a>
      <a class="topbar__navlink"           href="/admin/">Menu editor</a>
      <a class="topbar__navlink"           href="/admin/images/">Images</a>
      <a class="topbar__navlink"           href="/admin/content/">Content</a>
      <a class="topbar__navlink"           href="/admin/colors/">Colors</a>
      <a class="topbar__navlink is-active" href="/admin/sync/" aria-current="page">Sync</a>
      <span class="topbar__spacer"></span>
      <a class="topbar__site" href="/" target="_blank" rel="noopener">View site ↗</a>
    </nav>
  </header>

  <main class="wrap">
    <h1>OneDrive menu sync</h1>
    <p class="lede">Pull menus from OneDrive automatically. Synced menus are written exactly like the editor saves them, so the public site and the editor see the same data.</p>

    <section class="card">
      <h2>Schedule</h2>
      <label class="toggle"><input type="checkbox" id="enabled" /> Auto-sync enabled</label>
      <div class="hours" id="hours"></div>
      <p class="hint"><span id="count"></span> · times are Israel local time. Add or remove times to change how often menus refresh.</p>
      <div class="savebar">
        <button class="btn btn--primary" id="save-btn">Save settings</button>
        <button class="btn" id="syncall-btn">Sync all now</button>
        <span class="save-msg" id="save-msg"></span>
      </div>
    </section>

    <section class="card">
      <h2>Menus</h2>
      <div id="menus"></div>
      <p class="hint">Paste each menu's OneDrive link. The link is saved automatically before a sync runs. Editing a menu by hand still works — the next sync will overwrite it.</p>
    </section>
  </main>

  <script>${script(menus)}</script>
</body>
</html>`;
}

export const onRequestGet: PagesFunction<AuthEnv> = async ({ request, env }) => {
  if (!(await checkAccess(request, env))) return unauthorized();
  return new Response(syncPage(), {
    headers: {
      'Content-Type':  'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag':  'noindex, nofollow',
    },
  });
};
