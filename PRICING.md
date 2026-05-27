# Pricing & Plan — Restaurant Site

Final, honest accounting of what this site costs to run, where every
dollar goes, and what you'd pay if scope changes.

## TL;DR — annual cost

| Tier | Year 1 | Year 2+ | What you get |
|---|---|---|---|
| **Bare minimum** | **~$10** | **~$10** | Everything — site, admin, contact form, custom domain |
| Recommended | ~$94 | ~$94 | Above + Google Workspace (real `info@` mailbox) |
| Optional pro | ~$202 | ~$202 | Above + Plausible Analytics for proper traffic insight |

That's it. There is no hidden monthly bill that creeps in later.

## Line-item breakdown

### 1. Domain — $10/year (mandatory)

Buy from **Cloudflare Registrar** at cost (~$10.46/year for `.com`,
no markup, no renewal trap). Privacy is included free.

Alternative: Spaceship (Namecheap-owned) at ~$9.98/year, also at-cost.

**Skip:** GoDaddy, Wix domains, anything that throws upsells at checkout.

If you want `.co.il` instead, expect ~₪50–80/year via an Israeli reseller
(ISOC.org.il is the registry). You can still use Cloudflare for everything
else; just point the nameservers there.

### 2. Hosting — $0/year

**Cloudflare Pages free tier.** Unlimited bandwidth, unlimited requests
to static assets, custom domain, free SSL, free DDoS protection,
free CDN at 300+ edge locations.

A restaurant site does maybe 5,000 visits a month. The free tier is
designed for projects 1,000× that size. You will never come close.

### 3. Functions (admin, contact, menu serving) — $0/year

**Cloudflare Pages Functions free tier:** 100,000 requests per day.

Realistic usage:
- Owner uploads menu: ~30 requests/month
- Visitors hitting `/menu.pdf`: ~5,000/month
- Contact form submissions: ~50/month

Total: ~5,100 requests/month against a budget of 3,000,000/month.
You'd have to grow ~600× before this matters.

### 4. Menu storage — $0/year

**Cloudflare R2 free tier:** 10 GB storage, 1M Class A ops/month, 10M Class B ops/month.

A daily menu PDF is ~500 KB. After a year of daily uploads (and overwriting
the same key), you have... 500 KB. The free tier covers thousands of restaurants.

R2 also has **zero egress fees** — unlike S3, downloading the PDF doesn't cost anything.

### 5. Email forwarding (info@ → personal inbox) — $0/year

**Cloudflare Email Routing free.** Catches `info@your-restaurant.com` and
forwards to the owner's Gmail (or wherever). Setup takes 5 minutes.

The owner can read incoming mail. Replies go from their personal address
unless you upgrade to a real mailbox (next item).

### 6. Real mailbox (so owner can SEND as info@) — $0–$84/year

Three options, ranked:

| Option | Cost | Verdict |
|---|---|---|
| **Cloudflare forwarding only** | $0 | Owner reads at info@, replies from personal Gmail. Looks unprofessional but works. |
| **Zoho Mail Free** | $0 | Real mailbox `info@your-restaurant.com`, send + receive. 5 GB, ad-free. ~30 min setup with DNS records. |
| **Google Workspace** | $7/user/month = $84/year | Cleanest. Calendar, Drive, all included. What I'd pick for a real business. |

For a paying restaurant, **do Google Workspace.** For a personal/learning
project, the Cloudflare forwarder is fine.

### 7. Contact form email delivery — $0/year

**Resend free tier:** 3,000 emails/month, 100/day. The contact form sends
~50/month at most. Will never hit a limit. DKIM/SPF handled automatically
once you verify the domain.

Alternative if you grow past it: same provider $20/month for 50,000 emails,
or move to MailChannels / Postmark.

### 8. Analytics — $0–$108/year

**Free option: Cloudflare Web Analytics.** Built into the dashboard, no
cookie banner needed (no cookies, no PII), gives you visits, top pages,
referrers, browser/country breakdown. Sufficient for a restaurant.

**Pro option: Plausible Analytics — $9/month = $108/year.** Better UI,
goal tracking, weekly email summaries. Worth it if you're running paid
ads or want to track a campaign. Skippable otherwise.

### 9. Reservations — $0 to your wallet

The restaurant already pays Tabit; that's their POS/ops cost, not a website
cost. Your site links out to their Tabit page. Zero impact on this budget.

## Total scenarios

### Scenario A: Personal / portfolio / learning project
You're building this to show what you can do, or for a friend, or to learn.

- Domain: $10
- Everything else: $0
- **Total: ~$10/year (less than $1/month)**

### Scenario B: Real restaurant business, professional setup
You're charging a client, or it's your family's restaurant.

- Domain: $10
- Google Workspace: $84
- (Optional) Plausible Analytics: $108
- **Total: $94 — $202/year ($8 — $17/month)**

### Scenario C: Compared to alternatives

For perspective, the same brochure-style restaurant site on:

| Stack | Year 1 | Year 2+ | Notes |
|---|---|---|---|
| **Our stack** | $10 | $10 | What we built |
| Wix Core | ~$348 | ~$348 | $29/mo, restaurant template, owner-editable everything |
| Squarespace Core | ~$240 | ~$240 | $20/mo, similar |
| WordPress + Elementor | ~$130–250 | ~$120–200 | Hosting + Elementor Pro license; lots of ongoing maintenance |
| Custom dev agency | ~$3,000–10,000 | ~$500–2,000 | One-time build + retainer |

Building it yourself on Cloudflare is **24–35× cheaper than Wix**, with
better performance and zero lock-in.

## Where costs would actually grow

Realistic scenarios that bump the bill:

1. **Owner needs to edit story / hours / events themselves.** Add Decap CMS — still free, but worth a couple hours of your setup time. No new bill.
2. **Multiple locations.** Same site can serve them all; if the owner wants a separate site per location, multiply hosting by 1 (still free) and domain by N.
3. **Online ordering bypassing Wolt.** Now you need real payments (Stripe), inventory state, order management. Different category of project; budget $5,000–20,000 build + $30–100/month operating.
4. **Newsletter (1,000+ subscribers).** Mailchimp / Beehiiv free tiers cover the first 500–2,500. Past that ~$10–30/month.
5. **A lot of food photography.** R2 free tier handles ~10,000 photos at typical web-optimized sizes. Past that, $0.015/GB/month — still trivial.

None of these come for free as latent surprises. They only happen if the
project actively grows in scope.

## Operational plan — first 6 months

| When | Task | Owner | Time |
|---|---|---|---|
| Week 1 | Buy domain, deploy site, fill in real content | You | 4–8 hours |
| Week 1 | Set up R2, secrets, email forwarding | You | 1 hour |
| Week 1 | Verify Resend domain, test contact form | You | 30 min |
| Week 1 | Train owner on `/admin` (literally show them once) | You | 10 min |
| Week 2 | Submit to Google Search Console + set up Google Business Profile | You | 30 min |
| Ongoing | Daily: owner uploads menu | Owner | 15 sec/day |
| Ongoing | Monthly: glance at analytics, check forms working | You | 5 min/month |
| Yearly | Domain renewal (auto) | Cloudflare | 0 min |

After week 1, this site requires effectively zero of your time. The owner's
daily flow is shorter than sending a WhatsApp.

## What to do if you ever want out

Everything is portable:

- **Code** → it's in your GitHub repo, take it anywhere
- **Domain** → transfer to any registrar, Cloudflare doesn't lock you in
- **Menu PDFs** → export R2 with `wrangler r2 object get` or the dashboard
- **Email** → Cloudflare forwarding rules export, Resend lets you take API history

No hostage data. No proprietary formats. No multi-year contracts. This is
the part of the build that actually matters long-term, and it's why this
stack beats the alternatives even at the same price.
