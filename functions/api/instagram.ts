// GET /api/instagram — feeds the home Instagram moment:
//   • `item`  — the account's current story if one is live, else the latest
//               post/reel. Rendered as one small box.
//   • `reels` — recent reels, revealed under a button on the box.
//
// Requires Cloudflare Pages secret:
//   INSTAGRAM_ACCESS_TOKEN — a long-lived EAA... token from the Meta Graph API
//
// Response shape:
//   { profile, stories: [...], item, kind: 'story'|'reel'|'post'|null, reels: [...], configured }

import type { PagesFunction } from '@cloudflare/workers-types';

interface Env {
  INSTAGRAM_ACCESS_TOKEN?: string;
  INSTAGRAM_USER_ID?: string;
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

interface GraphExpandedResponse {
  username?:            string;
  profile_picture_url?: string;
  stories?:             { data: InstagramMedia[] };
  media?:               { data: InstagramMedia[] };
  error?:               { message: string };
}

const BASE = 'https://graph.instagram.com/v25.0';
const MAX_REELS = 9;

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const token = env.INSTAGRAM_ACCESS_TOKEN;
  // Target the account by its numeric id when provided, else the token's own
  // account via `me`. Falling back to `me` matters: if INSTAGRAM_USER_ID is
  // unset the URL would otherwise become `/undefined` and Meta rejects it
  // (the api_error we were seeing). `me` works for the token's own account.
  const target = env.INSTAGRAM_USER_ID || 'me';

  if (!token) {
    return emptyFallback(false);
  }

  try {
    // Your exact query structure
    const query = 'profile_picture_url,username,stories.limit(25){id,media_type,media_url,thumbnail_url,permalink,timestamp},media.limit(30){id,media_type,media_product_type,media_url,thumbnail_url,permalink,caption,timestamp}';

    // We encode the query so the {} brackets pass safely through all HTTP protocols
    const url = `${BASE}/${target}?fields=${encodeURIComponent(query)}&access_token=${token}`;
    
    const res = await fetch(url, { cf: { cacheTtl: 60 } } as RequestInit);
    
    if (!res.ok) {
        const errorBody = await res.text();
        console.error('\n🚨 META API REJECTION DETAILS 🚨');
        console.error('URL Attempted:', url.replace(token, '***'));
        console.error('Status:', res.status);
        console.error('Reason:', errorBody);
        console.error('----------------------------------\n');
        // Meta error code 190 = expired/invalid access token → owner must
        // refresh the long-lived token. Surface it so the cause is visible.
        const expired = res.status === 401 || /"code":\s*190|expired|OAuthException/i.test(errorBody);
        return emptyFallback(true, expired ? 'token_expired' : 'api_error');
    }

    const data = await res.json() as GraphExpandedResponse;

    if (data.error) {
      console.error('Meta API returned error:', data.error.message);
      return emptyFallback(true, 'meta_internal_error');
    }

    // Safely extract the nested arrays (Meta omits the edge completely if empty)
    const rawStories = data.stories?.data || [];
    const rawMedia = data.media?.data || [];

    // Structure the profile data for the Zahara logo
    const profile = data.profile_picture_url ? {
      username: data.username || '',
      avatarUrl: data.profile_picture_url
    } : null;

    // Process Stories
    const stories = rawStories.filter((m) => m.thumbnail_url || m.media_url).map(shape);

    // Process Reels
    const reels = rawMedia
      .filter((m) => m.media_product_type === 'REELS' && (m.thumbnail_url || m.media_url))
      .slice(0, MAX_REELS)
      .map(shape);

    // Determine the primary item to show (Story fallback logic)
    let item = null;
    let kind: 'story' | 'reel' | 'post' | null = null;
    
    if (stories.length) {
      kind = 'story';
    } else {
      const latest = rawMedia.find((m) => m.thumbnail_url || m.media_url);
      if (latest) {
        item = shape(latest);
        kind = latest.media_product_type === 'REELS' ? 'reel' : 'post';
      }
    }

    return jsonResponse({ profile, stories, item, kind, reels, configured: true }, 120);
  } catch (err) {
    console.error('Instagram fetch failed natively:', err);
    return emptyFallback(true, 'fetch_failed');
  }
};

/** Helper to return a safe empty state on failure */
function emptyFallback(configured: boolean = true, error: string | null = null) {
    const body: any = { profile: null, stories: [], item: null, kind: null, reels: [], configured };
    if (error) body.error = error;
    return jsonResponse(body, 60);
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