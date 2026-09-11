// GET /admin/popup — Cloudflare Access gated. The entry popup, on its own.
//
// The popup is the one piece of copy on this site with a SCHEDULE: it goes up
// for a holiday closure or a new opening, then comes down. Living as the
// seventh tab of /admin/content, it sat behind pages the owner edits once a
// year, and "switch the popup off" meant remembering which page tab it hid on.
//
// So it gets a top-level admin section of its own. There is no second editor:
// this route calls the SAME renderer as /admin/content with the scope narrowed
// to one page, so the fields, the styling controls, the save endpoint and the
// keyboard shortcuts are all literally the same code.

import type { PagesFunction } from '@cloudflare/workers-types';
import { renderEditor, POPUP_SCOPE, type ContentPageEnv } from './content';

export const onRequestGet: PagesFunction<ContentPageEnv> = ({ request, env }) =>
  renderEditor(request as unknown as Request, env, POPUP_SCOPE);
