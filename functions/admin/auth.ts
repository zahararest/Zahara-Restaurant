// Admin gate — Cloudflare Access JWT verification.
//
// /admin/* sits behind a Cloudflare Access application on https://zahara.rest.
// Access authenticates the user at Cloudflare's edge and forwards a signed JWT
// in the `Cf-Access-Jwt-Assertion` header (also mirrored in the CF_Authorization
// cookie). We verify that JWT's signature + claims here, which means these
// endpoints are reachable ONLY through Access.
//
// Why verify in-app instead of trusting Access alone: the same Pages project is
// also served at its *.pages.dev URL (and could be at www.), which the Access
// application does NOT cover. Requests arriving there carry no valid Access JWT,
// so this check rejects them — closing that bypass.
//
// Config — set in Pages → Settings → Variables (plaintext; these are NOT secrets):
//   ACCESS_TEAM_DOMAIN  e.g. "zahara.cloudflareaccess.com"
//   ACCESS_AUD          the Access application's Audience (AUD) tag
//                       (Access → Applications → Zahara Admin → Overview)
//
// Local dev: `wrangler pages dev` has no Access in front, so requests from
// localhost / 127.0.0.1 are allowed through for convenience. Production never
// sees those hostnames, so this is safe.

export interface AuthEnv {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?:         string;
}

interface Jwk { kid: string; n: string; e: string; kty: string; alg?: string }

// Best-effort in-isolate cache of the team's signing keys (rotated rarely).
let jwksCache: { domain: string; keys: Map<string, CryptoKey>; at: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000; // 1 hour

function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function signingKeys(teamDomain: string): Promise<Map<string, CryptoKey>> {
  const now = Date.now();
  if (jwksCache && jwksCache.domain === teamDomain && now - jwksCache.at < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const res  = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  const data = await res.json() as { keys?: Jwk[] };
  const map  = new Map<string, CryptoKey>();
  for (const jwk of data.keys ?? []) {
    try {
      const key = await crypto.subtle.importKey(
        'jwk',
        { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      );
      map.set(jwk.kid, key);
    } catch { /* skip a malformed key, keep the rest */ }
  }
  jwksCache = { domain: teamDomain, keys: map, at: now };
  return map;
}

/** True when the request carries a valid Cloudflare Access JWT for this
 *  application. Fails closed on any error or missing config. */
export async function checkAccess(request: Request, env: AuthEnv): Promise<boolean> {
  // Local-dev convenience: no Access in front of `wrangler pages dev`.
  try {
    const host = new URL(request.url).hostname;
    if (host === 'localhost' || host === '127.0.0.1') return true;
  } catch { /* fall through to JWT check */ }

  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return false; // not configured → deny

  try {
    // Token: header (set by Access) first, then the CF_Authorization cookie.
    let token = request.headers.get('Cf-Access-Jwt-Assertion') || '';
    if (!token) {
      const m = (request.headers.get('Cookie') || '').match(/CF_Authorization=([^;]+)/);
      if (m) token = m[1];
    }
    if (!token) return false;

    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const header  = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0]))) as { kid?: string; alg?: string };
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1]))) as { aud?: string | string[]; exp?: number; iss?: string };
    if (header.alg !== 'RS256' || !header.kid) return false;

    // Verify the signature against the team's published keys.
    const key = (await signingKeys(env.ACCESS_TEAM_DOMAIN)).get(header.kid);
    if (!key) return false;
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      b64urlToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!ok) return false;

    // Verify claims: not expired, right issuer, audience matches this app.
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return false;
    if (payload.iss && payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return false;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    return aud.includes(env.ACCESS_AUD);
  } catch {
    return false;
  }
}

/** 403 for requests that didn't come through Cloudflare Access. */
export function unauthorized(): Response {
  return new Response('Forbidden', {
    status:  403,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
