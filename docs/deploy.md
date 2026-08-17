# Deploying TubePulse

Domain: **vidhyaforher.com** — the one Razorpay has already approved, so no new
verification wait.

Do these in order. Steps 1 and 2 can be done now; the rest need the site to
actually be live at the domain.

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
| `APP_URL` | `http://localhost:3111` | `https://vidhyaforher.com` |
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

---

## 4. Razorpay webhook

Razorpay cannot reach a laptop, which is why this waits for deploy.

- **URL:** `https://vidhyaforher.com/api/webhooks/razorpay`
- **Secret:** the value already in `RAZORPAY_WEBHOOK_SECRET`. It is invented by
  us, not issued by Razorpay — paste the same string into their dashboard.
- **Events:** every `subscription.*`, plus `order.paid`.

`RAZORPAY_WEBHOOK_SECRET` also gates the BUTTONS, not just the webhook: with it
blank, `isBillingConfigured()` is false and `/billing` and `/pricing` silently
hide Go Pro. It reads as "the button is missing", never as "a variable is unset".

---

## 5. Supabase auth settings

These live in the dashboard, not in this repo:

- **Site URL:** `https://vidhyaforher.com`
- **Redirect URLs:** add `https://vidhyaforher.com/auth/callback`
- **Google provider:** add the same callback to the Google OAuth client's
  authorised redirect URIs

Miss these and Google sign-in returns to localhost — or nowhere.

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
