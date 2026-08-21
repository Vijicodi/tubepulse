# Deploying TubePulse

Domain: **tube-pulse.org**, registered at **Cloudflare** (a different Cloudflare
account, not the one this deploy runs from — DNS edits happen there). Host is
Vercel. GitHub is public at `VishruthVijay/tubepulse`; a second machine deploys
by forking that repo into its own GitHub account and importing the fork into
Vercel.

**Razorpay approved `vidhyaforher.com`, not this domain.** A new website on the
account is submitted under Account & Settings → Website and app settings and
reviewed in roughly 1–2 business days. Everything except paid checkout works the
moment DNS resolves, so deploy first and let the approval land behind you — but
do not promise anyone a working Go Pro button until it does.

Nothing in the code contains the domain. Changing it again means five settings
and no commits: Vercel `APP_URL`, Vercel Domains, Cloudflare DNS, the Supabase
URL configuration and the Razorpay webhook.

Do these in order. Steps 1 and 2 can be done now; the rest need the site to
actually be live at the domain.

A click-by-click version for a non-engineer, written for doing all of this from
a second machine with only a browser, is published at
<https://claude.ai/code/artifact/f4849507-1cce-4a97-ae6d-996ef0a65802>.

---

## 0. Get the code onto the new laptop's accounts

The code, GitHub account, Vercel account and Cloudflare account involved here
are four different logins across two machines. Order matters because Vercel
needs a repo to import before it needs env vars.

1. **On this machine:** push everything to `main` on
   `github.com/VishruthVijay/tubepulse` (already the origin). The repo is
   public, so no invite is needed for the next step.
2. **On the new laptop, in the new GitHub account:** open
   `github.com/VishruthVijay/tubepulse` and click **Fork**. This copies the
   repo (not the secrets — `.env.local` is git-ignored and was never in the
   repo) into the new account.
3. **In the new Vercel account:** **Add New → Project**, choose **Import Git
   Repository**, authorize Vercel's GitHub App for the new account if asked,
   and pick the fork. Leave build settings on their Next.js defaults.
4. **Before the first deploy finishes being useful,** paste the environment
   variables (step 3 below) into that same import screen, or add them under
   **Settings → Environment Variables** and redeploy — a build with no env
   vars will succeed but the app will be non-functional.
5. `.env.local` itself has to cross machines some other way — it is
   git-ignored on purpose and cannot come from GitHub. Send it over anything
   you already trust with the Razorpay live keys (a password manager's secure
   note, AirDrop, a private message to yourself) — never a commit, an issue,
   or a public paste.

---

## 1. Run the outstanding migrations

Three are outstanding: **0007, 0008, 0009**. (0006 is already applied.)

**Paste them one at a time, not as one block.** `ALTER TYPE ... ADD VALUE` —
which 0008 and 0009 both use — can be rejected by Postgres with *"cannot run
inside a transaction block"*, and the Supabase SQL editor sends a pasted block
as a single string. One at a time sidesteps it entirely.

```bash
npm.cmd run db:sql -- --only 0007   # ideas.script (the beat sheet)
npm.cmd run db:sql -- --only 0008   # transcripts + jobs.payload
npm.cmd run db:sql -- --only 0009   # platform + video kind (Instagram)
```

Copy each, paste into **Supabase → SQL editor → Run**, confirm success, then do
the next.

All three are additive: no column is dropped or renamed, and every existing row
stays valid.

**If you see `42P07: relation ... already exists`,** that migration is already
applied and you are re-running it — skip to the next one. Nothing is broken.
0009 is written defensively so a re-run is a no-op; 0007 and 0008 are not,
because they were already applied by the time it came up.

### Then verify

Paste `scripts/verify-schema.sql` into the SQL editor. Every row should read
`ok`. It reads the catalogue only and changes nothing, and it also confirms
row-level security is on for all twelve tables — worth doing once before you
point a domain at this.

---

## 2. Verify nothing is a placeholder

`npm run check:env` guards `.env.example` only — it has never looked at
`.env.local`. A placeholder there has already broken this app once:
`NEXT_PUBLIC_SUPABASE_URL` sat at `https://yourproject.supabase.co` while
`SUPABASE_URL` was correct, and Node reported it only as `fetch failed`.

Both the browser and the server read the **public** URL, so one wrong value
breaks sign-in on both sides.

---

## 3. Environment variables on the host

Copy every key from `.env.local`, with these differences:

| variable | local | production |
| -------- | ----- | ---------- |
| `APP_URL` | `http://localhost:3111` | `https://tube-pulse.org` |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | live key | same live key |

**`APP_URL` is the one that changes behaviour, not just text.** `webhooksCanReachUs()`
reads it to decide whether to hand Apify a webhook URL at all. On localhost it
sends none — Apify *rejects a run whose webhook URL it cannot reach*, which
would fail every scrape. Once `APP_URL` is a public https domain, webhooks are
sent and scrapes finish in seconds rather than waiting for the polling fallback.

`RAZORPAY_KEY_SECRET` must **never** gain a `NEXT_PUBLIC_` prefix — that would
ship it in the JavaScript bundle.

Keys are already **live** (`rzp_live_…`). A production build refuses to start on
test keys, deliberately: shipping test keys live looks perfect and earns nothing.

**Editing a variable on Vercel does nothing to the deployment already serving
traffic.** They are baked in at build time, so every env fix needs a Redeploy
(Deployments → ⋯ → Redeploy, cache off). A corrected `APP_URL` that was never
redeployed looks identical to one that was never corrected.

---

### DNS at Cloudflare

Add `tube-pulse.org` in Vercel → Settings → Domains first, choosing to redirect
`www` to the bare domain, then set the records in the Cloudflare account that
owns the domain (DNS → Records). **Edit the existing records, do not add a
second copy** — two `A` records on `@` send half of all visitors to whichever
resolves first.

| type | name | value | proxy status |
| ---- | ---- | ----- | ------------ |
| A | `@` | `76.76.21.21` | **DNS only** (grey cloud) |
| CNAME | `www` | `cname.vercel-dns.com` | **DNS only** (grey cloud) |

**The proxy toggle matters.** Cloudflare's default for a new record is
"Proxied" (orange cloud) — that routes traffic through Cloudflare's own edge
and its own certificate, which fights Vercel's automatic HTTPS and can leave
the site permanently on a Cloudflare error page or cert mismatch. Click the
cloud icon so it turns grey before saving each record.

Vercel prints the authoritative values on the Domains screen and occasionally
issues a project-specific CNAME target; that screen wins over this table.

Nameservers stay Cloudflare's — this is a records change, not a transfer.
Cloudflare's **SSL/TLS → Overview** mode does not need to change (Vercel issues
its own cert once the grey-cloud records resolve), and any existing MX records
should be left alone or email on the domain dies.

---

## 4. Razorpay webhook

Razorpay cannot reach a laptop, which is why this waits for deploy.

- **URL:** `https://tube-pulse.org/api/webhooks/razorpay`
- **Secret:** the value already in `RAZORPAY_WEBHOOK_SECRET`. It is invented by
  us, not issued by Razorpay — paste the same string into their dashboard.
- **Events:** every `subscription.*`, plus `order.paid`.

`RAZORPAY_WEBHOOK_SECRET` also gates the BUTTONS, not just the webhook: with it
blank, `isBillingConfigured()` is false and `/billing` and `/pricing` silently
hide Go Pro. It reads as "the button is missing", never as "a variable is unset".

---

## 5. Supabase auth settings

These live in the dashboard, not in this repo:

- **Site URL:** `https://tube-pulse.org`
- **Redirect URLs:** add `https://tube-pulse.org/auth/callback` and
  `https://tube-pulse.org/**`, keeping the existing localhost entry so the dev
  machine still works

Miss these and Google sign-in returns to localhost — or nowhere.

**The Google Cloud Console needs no change.** `signInWithGoogle` sends users to
Supabase, and Google's authorised redirect URI is Supabase's own
`/auth/v1/callback`, which does not move when our domain does. The Supabase
redirect allow-list above is the only thing gating it. Note also that the
`redirectTo` is built from the request's `origin` header, so signing in through
a `*.vercel.app` preview URL fails unless that origin is allow-listed too —
test at the real domain.

SMTP must stay on **port 587**. 465 is implicit TLS, which Supabase's auth
service handles badly and free Gmail rejects outright; the only symptom is a
generic `Error sending confirmation email`.

---

## 6. After the first deploy, check these three

1. **Sign in with Google.** Proves the callback and Site URL.
2. **Run one scrape.** Proves `APIFY_TOKEN`, the webhook URL, and that
   `APP_URL` is public — the job should finish without the polling fallback.
3. **Open `/billing`.** If Go Pro is missing, read the dev log line
   `[billing] Upgrade UI is HIDDEN. …` — it names the actual missing variable.
   Do not verify this by writing a script that checks the four Razorpay names:
   one was written once, reported "all set", and was wrong, because it never
   called `serverEnv()` and so never hit the throw.

---

## Known cost, per press

| action | cost |
| ------ | ---- |
| YouTube scrape, 100 videos | ~₹6 |
| Instagram scrape, 40 posts | ~₹9.50 |
| Idea generation | ~₹7.50 worst case |
| Transcript + summary | ~₹2 |

All four spend one unit of the 20-a-month allowance. See `docs/billing-setup.md`.
