// GET /api/instagram — returns recent Instagram posts for the feed section.
//
// Requires Cloudflare Pages secret:
//   INSTAGRAM_ACCESS_TOKEN — a long-lived token from the Instagram Graph API.
//
// To obtain a token:
//   1. Go to developers.facebook.com → Create App → Consumer
//   2. Add "Instagram Basic Display" product
//   3. Connect the restaurant's Instagram account
//   4. Generate a long-lived token (valid 60 days, renewable)
//   5. Add it as a Pages secret: wrangler pages secret put INSTAGRAM_ACCESS_TOKEN
//
// Response shape:
//   { posts: InstagramPost[], configured: boolean }
//   When not configured: { posts: [], configured: false }
//
// Posts are cached at Cloudflare edge for 5 minutes. The feed typically
// updates once a day, so this is very conservative.

import type { PagesFunction } from '@cloudflare/workers-types';

interface Env {
  INSTAGRAM_ACCESS_TOKEN?: string;
}

interface InstagramPost {
  id:            string;
  media_type:    'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url:     string;
  thumbnail_url?: string;
  permalink:     string;
  caption?:      string;
  timestamp:     string;
}

interface GraphResponse {
  data?: InstagramPost[];
  error?: { message: string };
}

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const token = env.INSTAGRAM_ACCESS_TOKEN;

  if (!token) {
    return jsonResponse({ posts: [], configured: false }, 3600);
  }

  try {
    const fields = 'id,media_type,media_url,thumbnail_url,permalink,caption,timestamp';
    const url    = `https://graph.instagram.com/me/media?fields=${fields}&limit=12&access_token=${token}`;
    const res    = await fetch(url, { cf: { cacheTtl: 300 } } as RequestInit);

    if (!res.ok) {
      const body = await res.text();
      console.error('Instagram Graph API error:', res.status, body);
      return jsonResponse({ posts: [], configured: true, error: 'api_error' }, 60);
    }

    const data: GraphResponse = await res.json();
    if (data.error) {
      console.error('Instagram API returned error:', data.error.message);
      return jsonResponse({ posts: [], configured: true, error: data.error.message }, 60);
    }

    const posts = (data.data ?? []).filter(
      (p) => p.media_type === 'IMAGE' || p.media_type === 'CAROUSEL_ALBUM' || p.media_type === 'VIDEO',
    );

    return jsonResponse({ posts, configured: true }, 300);
  } catch (err) {
    console.error('Instagram fetch failed:', err);
    return jsonResponse({ posts: [], configured: true, error: 'fetch_failed' }, 60);
  }
};

function jsonResponse(body: object, maxAge: number): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type':  'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 2}`,
    },
  });
}
