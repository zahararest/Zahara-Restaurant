// Builds the admin HTML response by composing the auth-gated shell with
// the inlined stylesheet and SPA script.
//
// English LTR — matches /admin/images/ and /admin/colors/. The Hebrew
// menu data inside the editor stays Hebrew because that's what the
// data is; only the chrome is translated.

import { ADMIN_CSS }    from './styles';
import { adminScript }  from './script';
import { MENU_TYPES }   from './menus';

const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500' +
  '&family=Heebo:wght@300;400;500;600&family=Inter:wght@400;500;600&display=swap';

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
  <link rel="stylesheet" href="${FONTS_HREF}" />
  <style>${ADMIN_CSS}</style>
</head>
<body>
  <header class="topbar">
    <nav class="topbar__nav" aria-label="Admin sections">
      <a class="topbar__brand"                href="/admin/">Zahara · Admin</a>
      <a class="topbar__navlink is-active"    href="/admin/"        aria-current="page">Menu editor</a>
      <a class="topbar__navlink"              href="/admin/images/">Images</a>
      <a class="topbar__navlink"              href="/admin/content/">Content</a>
      <a class="topbar__navlink"              href="/admin/colors/">Colors</a>
      <span class="topbar__spacer"></span>
      <a class="topbar__site" href="/" target="_blank" rel="noopener">View site ↗</a>
    </nav>
    <h1 class="topbar__title">Menu editor</h1>
  </header>

  <div class="layout">
    <nav class="sidebar" id="sidebar" aria-label="Menu list"></nav>
    <main class="main"   id="main-area"></main>
  </div>

  <script>${adminScript(MENU_TYPES)}</script>
</body>
</html>`;
}
