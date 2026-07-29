# Brand Alignment Audit — deployable version

This is the standalone version of the Fuzz Tax audit tool, built to run on
Cloudflare Pages. Everything that used to call the Anthropic API directly
from the browser now runs through small server-side functions instead, so
no API key is ever exposed to a visitor's browser.

## What's in here

```
index.html                   the tool itself (frontend, no build step)
functions/_shared.js         shared helpers, not a route
functions/api/followup.js    generates clarifying follow-up questions
functions/api/report.js      runs the two analysis calls, returns the report
functions/api/screenshot.js  live screenshot preview + capture
functions/api/lead.js        creates the HubSpot contact at the email gate
```

Cloudflare Pages automatically turns anything in `functions/api/` into a
route at `/api/...`. Nothing needs to be built or bundled, this can be
deployed as-is.

## 1. Deploy to Cloudflare Pages

**Easiest path (dashboard):**
1. Push this folder to a GitHub or GitLab repo.
2. In the Cloudflare dashboard, go to Workers & Pages > Create > Pages >
   Connect to Git, and pick the repo.
3. Leave the build command empty and set the build output directory to `/`
   (this is a static site, there's nothing to build).
4. Deploy. You'll get a `*.pages.dev` URL immediately, and can attach a
   custom domain or subdomain afterward under the project's Custom domains
   tab.

**Or from the command line**, if you'd rather not connect a repo:
```
npm install -g wrangler
wrangler login
wrangler pages deploy .
```

## 2. Set your secrets

In the Pages project, go to Settings > Environment variables (do this for
both Production and Preview) and add:

| Variable | What it's for |
|---|---|
| `ANTHROPIC_API_KEY` | Your Claude API key, from the [Claude Console](https://console.anthropic.com) |
| `CF_ACCOUNT_ID` | Your Cloudflare account ID, shown on the right side of any dashboard page |
| `CF_API_TOKEN` | A Cloudflare API token with **Browser Rendering - Edit** permission. Create one at My Profile > API Tokens > Create Token |
| `HUBSPOT_TOKEN` | A HubSpot private app access token with `crm.objects.contacts.write` and `crm.objects.contacts.read` scopes. Create one under Settings > Integrations > Private Apps in HubSpot |

Mark all four as **secret**, not plaintext, so they don't show up in logs.

Cloudflare's Browser Rendering API is included on the Workers Free plan
with limited concurrent sessions, and gets more headroom on Workers Paid
($5/mo). For a lead-gen tool like this, the free tier is likely enough to
start.

## 3. Test locally

```
npm install -g wrangler
wrangler pages dev .
```

This runs the whole thing, frontend and functions, on `localhost:8788`.
Screenshot capture and browser rendering require `--remote` mode:

```
wrangler pages dev . --remote
```

## 4. Embed it on your site

Once deployed, either link to the `*.pages.dev` URL (or your custom
domain) directly, or drop it into an existing page with an iframe:

```html
<iframe
  src="https://your-audit-domain.pages.dev"
  style="width:100%; min-height:900px; border:none;"
  title="Brand Alignment Audit">
</iframe>
```

If you embed it, add a bit of JS to resize the iframe to the content's
actual height (the tool's content height changes a lot between screens),
or just give it a generous fixed height.

## About the HubSpot integration

`functions/api/lead.js` creates a Contact (or updates one, if that email
has filled this out before) the moment someone passes the email gate,
before the report generates. It also attaches a note to the contact with
their full survey answers, so whoever follows up has context without
digging through the audit output.

It does **not** create a Deal. Since audits are a flat $500 and your
pipeline starts at "Lead," there's a commented-out `createDeal()` function
at the bottom of that file ready to go, it just needs your pipeline ID,
the "Lead" stage ID, and (optionally) your audit product's ID filled in.
You can find pipeline and stage IDs under Settings > Objects > Deals >
Pipelines in HubSpot, or via `GET /crm/v3/pipelines/deals` in the API.

## Worth adding before this goes fully public

This form is unauthenticated and wired directly to a paid Claude API key
and your CRM, so it's worth a light spam guard before it's linked from
real traffic. [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/)
is a free, no-friction fit here since you're already on Cloudflare: add
the widget to the lead-gate screen in `index.html`, and verify the token
server-side at the top of `functions/api/lead.js` before creating the
contact or triggering the report. Happy to wire this in when you're ready.

## About the screenshot capture

The old version used a free third-party service (mshots.wp.com) that
rendered asynchronously and often needed several retries to get past a
placeholder image. This version calls Cloudflare's own Browser Rendering
API server-side (`functions/_shared.js` → `captureScreenshot`), which
renders synchronously and returns the finished image in one request, no
polling needed. Logged-in social platforms and sites with bot protection
can still block automated rendering entirely, that's a limitation of any
headless-browser approach, not something specific to this implementation,
which is why the manual "upload instead" fallback is still there on both
the site and social fields.
