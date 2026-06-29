// Builds the admin HTML response by composing the auth-gated shell with
// the inlined stylesheet and SPA script.
//
// English LTR — matches /admin/images/ and /admin/colors/. The Hebrew
// menu data inside the editor stays Hebrew because that's what the
// data is; only the chrome is translated.

import { ADMIN_CSS }              from './styles';
import { adminScript }            from './script';
import { MENU_TYPES }             from './menus';
import { CHROME_CSS, ADMIN_FONTS_HREF, topbar } from './chrome';

export function adminPage(): string {
  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots"   content="noindex,nofollow" />
  <title>Menu editor · Zahara</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="${ADMIN_FONTS_HREF}" />
  <style>${CHROME_CSS}${ADMIN_CSS}</style>
</head>
<body>
  ${topbar('menu')}

  <div class="layout">
    <nav class="sidebar" id="sidebar" aria-label="Menu list"></nav>
    <main class="main"   id="main-area"></main>
  </div>

  <script>${adminScript(MENU_TYPES)}</script>
</body>
</html>`;
}
