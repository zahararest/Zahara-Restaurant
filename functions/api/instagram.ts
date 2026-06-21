// GET /api/instagram — feeds the home Instagram moment:
//   • `item`  — the account's current story if one is live, else the latest
//               post/reel. Rendered as one small box.
//   • `reels` — recent reels, revealed under a button on the box.
//
// Requires Cloudflare Pages secret:
//   INSTAGRAM_ACCESS_TOKEN — a long-lived token from the Instagram Graph API
//   for a Business/Creator account. Reading stories needs the
//   `instagram_basic` + `instagram_manage_insights` permissions; without them
//   the stories call 4xxs and we transparently fall back to the latest post.
//
// To obtain a token:
//   1. developers.facebook.com → Create App → Business
//   2. Add the Instagram product, connect the restaurant's Business/Creator IG
//   3. Generate a long-lived token (valid 60 days, renewable)
//   4. wrangler pages secret put INSTAGRAM_ACCESS_TOKEN
//
// Response shape:
//   { stories: [...], item, kind: 'story'|'reel'|'post'|null, reels: [...], configured }
//   `stories` holds EVERY live frame (the box lets the visitor switch between
//   them); `item` is the latest post/reel used only when no story is live.
//   When not configured: everything empty/null + configured:false.

import type { PagesFunction } from '@cloudflare/workers-types';

interface Env {
  INSTAGRAM_ACCESS_TOKEN?: string;
}

type MediaType = 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';

interface InstagramMedia {
  id:                  string;
  media_type:          MediaType;
  media_product_type?: 'FEED' | 'REELS' | 'STORY' | 'AD';
  media_url?:          string;
  thumbnail_url?:      string;
  permalink:           string;
  caption?:            string;
  timestamp:           string;
}

interface GraphResponse {
  data?:  InstagramMedia[];
  error?: { message: string };
}

const FIELDS = 'id,media_type,media_product_type,media_url,thumbnail_url,permalink,caption,timestamp';
const BASE   = 'https://graph.instagram.com';
const MAX_REELS = 9;

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const token = env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) {
    return jsonResponse({ stories: [], item: null, kind: null, reels: [], configured: false }, 3600);
  }

  try {
    // Live stories (needs manage_insights perms) and the recent-media list run
    // in parallel; the media list feeds both the post fallback and the reels.
    const [storyList, media] = await Promise.all([
      listFrom(`${BASE}/me/stories?fields=${FIELDS}&access_token=${token}`),
      listFrom(`${BASE}/me/media?fields=${FIELDS}&limit=25&access_token=${token}`),
    ]);

    const stories = storyList.filter((m) => m.thumbnail_url || m.media_url).map(shape);

    const reels = media
      .filter((m) => m.media_product_type === 'REELS' && (m.thumbnail_url || m.media_url))
      .slice(0, MAX_REELS)
      .map(shape);

    let item = null;
    let kind: 'story' | 'reel' | 'post' | null = null;
    if (stories.length) {
      kind = 'story';
    } else {
      const latest = media.find((m) => m.thumbnail_url || m.media_url);
      if (latest) {
        item = shape(latest);
        kind = latest.media_product_type === 'REELS' ? 'reel' : 'post';
      }
    }

    return jsonResponse({ stories, item, kind, reels, configured: true }, 120);
  } catch (err) {
    console.error('Instagram fetch failed:', err);
    return jsonResponse({ stories: [], item: null, kind: null, reels: [], configured: true, error: 'fetch_failed' }, 60);
  }
};

/** Fetch a Graph list endpoint, returning its raw items (or [] on any error —
 *  e.g. stories not permitted — so callers can fall back). */
async function listFrom(url: string): Promise<InstagramMedia[]> {
  try {
    const res = await fetch(url, { cf: { cacheTtl: 60 } } as RequestInit);
    if (!res.ok) return [];
    const data: GraphResponse = await res.json();
    if (data.error || !Array.isArray(data.data)) return [];
    return data.data;
  } catch {
    return [];
  }
}

/** Trim a Graph media object to just the fields the client renders. */
function shape(m: InstagramMedia) {
  return {
    id:         m.id,
    media_type: m.media_type,
    image:      m.thumbnail_url || m.media_url,
    permalink:  m.permalink,
    caption:    m.caption,
    timestamp:  m.timestamp,
  };
}

function jsonResponse(body: object, maxAge: number): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type':  'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 2}`,
    },
  });
}
