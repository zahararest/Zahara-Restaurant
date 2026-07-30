// Builds the admin HTML response by composing the auth-gated shell with
// the inlined stylesheet and SPA script.
//
// English LTR — matches /admin/images/ and /admin/colors/. The Hebrew
// menu data inside the editor stays Hebrew because that's what the
// data is; only the chrome is translated.

import { ADMIN_CSS }              from './styles';
import { adminScript }            from './script';
import { MENU_TYPES }             from './menus';
import { CHROME_CSS, adminHead, topbar } from './chrome';
import type { Site }              from '../data/site';

export function adminPage(site: Site = 'zahara', menusOff: string[] = []): string {
  return `${adminHead(site, 'Menu editor', `<style>${CHROME_CSS}${ADMIN_CSS}</style>`)}
<body>
  ${topbar('menu', { site })}

  <div class="layout">
    <nav class="sidebar" id="sidebar" aria-label="Menu list"></nav>
    <main class="main"   id="main-area"></main>
  </div>

  <script>${adminScript(MENU_TYPES, site, menusOff)}</script>
</body>
</html>`;
}
