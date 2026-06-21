// GET /api/instagram — returns the ONE thing to feature in the home strip:
// the account's current story if one is live, otherwise the latest post/reel.
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
//   { item: InstagramItem | null, kind: 'story'|'reel'|'post'|null, configured }
//   When not configured: { item: null, kind: null, configured: false }

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

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const token = env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) return jsonResponse({ item: null, kind: null, configured: false }, 3600);

  try {
    // 1) Live story first. This requires manage_insights perms; if the token
    //    can't read stories the call fails and we just move on to media.
    const story = await firstFrom(`${BASE}/me/stories?fields=${FIELDS}&access_token=${token}`);
    if (story) {
      return jsonResponse({ item: shape(story), kind: 'story', configured: true }, 120);
    }

    // 2) No live story → newest post/reel.
    const latest = await firstFrom(`${BASE}/me/media?fields=${FIELDS}&limit=1&access_token=${token}`);
    if (latest) {
      const kind = latest.media_product_type === 'REELS' ? 'reel' : 'post';
      return jsonResponse({ item: shape(latest), kind, configured: true }, 300);
    }

    return jsonResponse({ item: null, kind: null, configured: true }, 120);
  } catch (err) {
    console.error('Instagram fetch failed:', err);
    return jsonResponse({ item: null, kind: null, configured: true, error: 'fetch_failed' }, 60);
  }
};

/** Fetch a Graph list endpoint and return its first usable item, or null.
 *  Never throws on a Graph error (e.g. stories not permitted) — returns null
 *  so the caller can fall back. */
async function firstFrom(url: string): Promise<InstagramMedia | null> {
  try {
    const res = await fetch(url, { cf: { cacheTtl: 60 } } as RequestInit);
    if (!res.ok) return null;
    const data: GraphResponse = await res.json();
    if (data.error || !Array.isArray(data.data)) return null;
    // Need something we can render as a still image (photo, or a video's
    // thumbnail). Skip anything with neither.
    return data.data.find((m) => m && (m.thumbnail_url || m.media_url)) ?? null;
  } catch {
    return null;
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
