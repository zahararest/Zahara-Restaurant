// Shared HTTP Basic auth for /admin/* endpoints.

export interface AuthEnv {
  ADMIN_USER:     string;
  ADMIN_PASSWORD: string;
}

export function checkAuth(request: Request, env: AuthEnv): boolean {
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Basic ')) return false;

  try {
    const decoded = atob(header.slice(6));
    const idx     = decoded.indexOf(':');
    if (idx === -1) return false;
    return decoded.slice(0, idx)    === env.ADMIN_USER
        && decoded.slice(idx + 1)   === env.ADMIN_PASSWORD;
  } catch {
    return false;
  }
}

export function unauthorized(): Response {
  return new Response('Authentication required', {
    status:  401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Restaurant Admin", charset="UTF-8"',
      'Content-Type':     'text/plain; charset=utf-8',
    },
  });
}
