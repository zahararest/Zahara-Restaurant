// /functions/api/contact.ts
//
// Receives the contact/events form and emails the owner via Resend.
// Handles both JS fetch (returns plain text) and no-JS form submission
// (redirects to the referring page with ?submitted=1).
//
// Cloudflare Pages secrets (Settings → Environment Variables):
//   RESEND_API_KEY     — from resend.com (required)
//   CONTACT_TO_EMAIL   — destination inbox; defaults to info@zahara.rest
//   CONTACT_FROM_EMAIL — must be a Resend-verified sender address
//                        e.g. noreply@zahara.rest (after verifying zahara.rest in Resend)

interface Env {
  RESEND_API_KEY:     string;
  CONTACT_TO_EMAIL:   string;
  CONTACT_FROM_EMAIL: string;
  // Optional: Cloudflare Turnstile secret key. When set, every submission must
  // carry a valid Turnstile token (set the matching PUBLIC site key in
  // src/data/restaurant.ts). When unset, the check is skipped so the form keeps
  // working before Turnstile is configured.
  TURNSTILE_SECRET_KEY?: string;
}

function escape(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function isFetchRequest(request: Request): boolean {
  const mode = request.headers.get('sec-fetch-mode');
  if (mode) return mode !== 'navigate';
  // Fallback: check Accept header — browser form POSTs accept text/html
  const accept = request.headers.get('accept') || '';
  return !accept.includes('text/html');
}

function redirectBack(request: Request, param: string): Response {
  // Return the visitor to the page they submitted from (the form lives on
  // /about/ and /events/, plus their /en/ variants). We only ever use the
  // referer's PATH and rebuild a relative Location, so this can't become an
  // open redirect. /contact/ was folded into /about/ in 2026, so fall back
  // there — never redirect to /contact/, which would just 301 again.
  const referer = request.headers.get('referer');
  const isEn    = (referer || '').includes('/en/');
  let path = isEn ? '/en/about/' : '/about/';
  if (referer) {
    try {
      const p = new URL(referer).pathname;
      if (p && !p.startsWith('/contact')) path = p;
    } catch { /* malformed referer — keep the /about/ fallback */ }
  }
  return new Response(null, {
    status:  303,
    headers: { Location: `${path}?${param}` },
  });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('multipart/form-data') && !ct.includes('application/x-www-form-urlencoded')) {
    return new Response('Invalid content type', { status: 400 });
  }

  const form = await request.formData();

  // Honeypot — silent drop
  if ((form.get('website') as string)?.length) {
    return isFetchRequest(request)
      ? new Response('OK', { status: 200 })
      : redirectBack(request, 'submitted=1');
  }

  const name         = String(form.get('name')         || '').trim();
  const phone        = String(form.get('phone')        || '').trim();
  const email        = String(form.get('email')        || '').trim();
  const event_date   = String(form.get('event_date')   || '').trim();
  const event_type   = String(form.get('event_type')   || '').trim();
  const guests       = String(form.get('guests')       || '').trim();
  const message      = String(form.get('message')      || '').trim();
  const inquiry_type = String(form.get('inquiry_type') || 'general').trim();
  const isEvent      = inquiry_type === 'event' || !!(event_date || event_type || guests);

  const isFetch = isFetchRequest(request);
  const isEn    = (request.headers.get('referer') || '').includes('/en/');

  const err = (msgHe: string, msgEn: string, status: number) =>
    isFetch
      ? new Response(isEn ? msgEn : msgHe, { status })
      : redirectBack(request, 'error=1');

  // Cloudflare Turnstile — enforced only when the secret is configured, so the
  // form works before Turnstile is set up. Reject a missing/invalid token here,
  // before we spend a Resend send on a bot submission.
  if (env.TURNSTILE_SECRET_KEY) {
    const token = String(form.get('cf-turnstile-response') || '');
    let human = false;
    if (token) {
      try {
        const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method:  'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            secret:   env.TURNSTILE_SECRET_KEY,
            response: token,
            remoteip: request.headers.get('CF-Connecting-IP') || '',
          }),
        });
        const outcome = await verify.json() as { success?: boolean };
        human = outcome.success === true;
      } catch {
        human = false;
      }
    }
    if (!human) {
      return err('אימות אנושי נכשל. רעננו את הדף ונסו שוב.',
                 'Human verification failed. Please refresh and try again.', 403);
    }
  }

  if (!name || !phone || !email) {
    return err('שדות חובה חסרים', 'Required fields missing', 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return err('כתובת אימייל לא תקינה', 'Invalid email address', 400);
  }
  if (name.length > 200 || message.length > 5000) {
    return err('שדה ארוך מדי', 'Field too long', 400);
  }

  const heading = isEvent ? 'Event Inquiry — Zahara' : 'Contact — Zahara';
  const subject = isEvent
    ? `Event inquiry — ${name}${event_type ? ` (${event_type})` : ''}`
    : `Contact — ${name}`;

  const html = `
    <div style="font-family:-apple-system,system-ui,sans-serif;max-width:600px;margin:0 auto;color:#111009">
      <h2 style="font-family:Georgia,serif;border-bottom:1px solid #D4C9B0;padding-bottom:0.5rem">
        ${heading}
      </h2>
      <table style="width:100%;border-collapse:collapse;margin:1.5rem 0">
        <tr><td style="padding:0.5rem 0;color:#7B7060;width:30%">Name</td><td style="padding:0.5rem 0"><strong>${escape(name)}</strong></td></tr>
        <tr><td style="padding:0.5rem 0;color:#7B7060">Phone</td><td style="padding:0.5rem 0"><a href="tel:${escape(phone)}">${escape(phone)}</a></td></tr>
        <tr><td style="padding:0.5rem 0;color:#7B7060">Email</td><td style="padding:0.5rem 0"><a href="mailto:${escape(email)}">${escape(email)}</a></td></tr>
        ${event_date ? `<tr><td style="padding:0.5rem 0;color:#7B7060">Date</td><td style="padding:0.5rem 0">${escape(event_date)}</td></tr>` : ''}
        ${event_type ? `<tr><td style="padding:0.5rem 0;color:#7B7060">Type</td><td style="padding:0.5rem 0">${escape(event_type)}</td></tr>` : ''}
        ${guests    ? `<tr><td style="padding:0.5rem 0;color:#7B7060">Guests</td><td style="padding:0.5rem 0">${escape(guests)}</td></tr>` : ''}
      </table>
      ${message ? `<div style="background:#F5F1EB;padding:1rem 1.25rem;border-left:3px solid #4A5E3D"><strong style="display:block;margin-bottom:0.5rem;color:#7B7060">Message</strong>${escape(message).replace(/\n/g, '<br>')}</div>` : ''}
    </div>`;

  const text = [
    heading,
    `Name: ${name}`, `Phone: ${phone}`, `Email: ${email}`,
    event_date ? `Date: ${event_date}` : '',
    event_type ? `Type: ${event_type}` : '',
    guests     ? `Guests: ${guests}`   : '',
    message    ? `\nMessage:\n${message}` : '',
  ].filter(Boolean).join('\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:     env.CONTACT_FROM_EMAIL,
      to:       env.CONTACT_TO_EMAIL || 'info@zahara.rest',
      reply_to: email,
      subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    console.error('Resend error:', res.status, await res.text());
    return err(
      'שגיאת שליחה. אנא חייגו אלינו ישירות.',
      'Send failed. Please call us directly.',
      502,
    );
  }

  return isFetch
    ? new Response('OK', { status: 200 })
    : redirectBack(request, 'submitted=1');
};
