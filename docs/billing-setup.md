# Billing setup

Everything in this file happens in the Razorpay dashboard or in `.env.local`.
None of it is in the repository, which is why it is written down — the same
reason `docs/auth-setup.md` exists.

Read the whole page before starting. Step 3 charges real money if you use live
keys.

---

## What you are switching on

Two things, using two different Razorpay products:

**Pro — ₹499/month or ₹4,990/year, 20 scrapes a month, with autopay.** A
*Subscription*. The customer authorises a mandate once — UPI Autopay, a card, or
e-mandate — and Razorpay debits them each period until somebody stops it.
Cancelling from `/billing` stops the mandate at Razorpay's end too, so no further
charge can be attempted.

Yearly is two months free. It is a **separate Razorpay plan**, because a plan
hard-codes both its period and its amount — there is no way to bill a monthly
plan annually.

**Refills — ₹149 for 5 scrapes, ₹449 for 15.** *Orders*. Paid once, no mandate,
never expiring. Priced above the plan's per-scrape rate on purpose, so the
subscription always stays the better deal.

There is no invoicing and no plan-switching, because there is only one plan.

---

## 1. Get your API keys

**This is NOT under a page called "Settings".** Razorpay moved it, and hunting
for a Settings → API Keys entry is a dead end.

1. Log in to the Razorpay Dashboard.
2. **Switch the mode first**, using the Test/Live toggle in the top ribbon. Keys
   are per-mode, and generating while in Test gives you a `rzp_test_…` pair.
3. Open **Account & Settings** in the left menu.
4. Find **API Keys**, in the group headed **Website and app settings**.
5. Click **Generate Key**.

You get a **Key Id** (`rzp_live_…` or `rzp_test_…`) and a **Key Secret** in a
pop-up. Download them there and then — **the secret is shown once**. Afterwards
only the Key Id stays visible on the dashboard, and losing the secret means
regenerating the pair, which invalidates the old one.

> **Live mode needs verified website details, not just KYC.** Razorpay asks for
> the site you will collect payments on and verifies it, which takes up to three
> working days, plus an OTP to your registered mobile. If the Live toggle will
> not let you generate a key, that is why — it is not a bug.
>
> Test keys need none of that and behave identically with fake cards. Switching
> later is three lines in `.env.local`, no code change.

Also confirm **Subscriptions** is enabled — it is under **Payment Products** in
the left menu. It is off by default on new accounts and has to be requested.
Without it, step 3 fails with "Subscriptions is not enabled for this account",
which the app shows you verbatim rather than hiding behind a generic error.

## 2. Put the keys in `.env.local`

Never `.env.example` — that file is committed publicly, and `npm run check:env`
will fail the build if a real value lands in it.

```bash
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxx
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxx   # the same value again
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
```

The key id appears twice on purpose. The browser needs it to open Razorpay's
checkout window, and anything the browser needs must carry the `NEXT_PUBLIC_`
prefix. **The secret must never gain that prefix** — it would be published in
the JavaScript bundle on the next deploy.

## 3. Create the plans

Razorpay bills against **Plan** objects that live in your account. There are two
— monthly and yearly — because a plan hard-codes both its period and its amount.
Create both with the script rather than by hand:

```bash
npm run razorpay:plan
```

It reads your keys from `.env.local`, creates both plans, and prints:

```
RAZORPAY_PLAN_ID_PRO=plan_xxxxxxxxxxxx
RAZORPAY_PLAN_ID_PRO_YEARLY=plan_yyyyyyyyyyyy
```

Paste both into `.env.local`.

**Leaving the yearly one blank is fine.** The monthly/yearly toggle simply does
not appear and everything else works. Turn annual on later by adding that one
variable.

The amount comes from `src/lib/billing/plans.ts` — the same file the pricing
page reads — so the plan cannot be created at a price the website does not
advertise. The script refuses to run if those two disagree.

Refill packs need **no** setup step — Orders are created on demand and there is
nothing to register in the dashboard.

> **Plans cannot be edited or deleted at Razorpay.** To change the price later,
> run the script again with a new amount and point `RAZORPAY_PLAN_ID_PRO` at the
> new id. Existing subscribers stay on the old plan until they resubscribe,
> which is the correct behaviour — you cannot silently reprice someone's
> standing mandate.

## 4. Add the webhook

Razorpay Dashboard → **Settings → Webhooks → Add New Webhook**.

| Field         | Value                                    |
| ------------- | ---------------------------------------- |
| Webhook URL   | `https://your-domain/api/webhooks/razorpay` |
| Secret        | anything long and random — see below     |
| Active events | every `subscription.*` event, plus `order.paid` |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put the same value in both the dashboard field and `.env.local`:

```bash
RAZORPAY_WEBHOOK_SECRET=<that value>
```

Subscribe to at least: `subscription.authenticated`, `subscription.activated`,
`subscription.charged`, `subscription.pending`, `subscription.halted`,
`subscription.cancelled`, `subscription.completed` — **and `order.paid`**, which
is what grants a refill pack. Forgetting that last one means refills are only
credited by the browser's confirm call, which works but loses its safety net.

### Localhost

**Razorpay cannot reach `localhost`.** This is not a problem you need to solve
to test: the app polls `/api/billing/sync`, which asks Razorpay's API directly
after checkout and on demand from the **Refresh** button on `/billing`. The same
webhook-plus-polling arrangement as the Apify scrape, for the same reason — see
[decision 0004](decisions/0004-webhook-plus-polling.md).

Set the webhook up when you deploy. Until then, everything works.

## 5. Promo codes (optional)

Codes live in the `promo_codes` table, not in the Razorpay dashboard. Add one
with SQL:

```sql
insert into public.promo_codes (code, kind, value, scope, max_redemptions, expires_at)
values ('LAUNCH20', 'percent', 20, 'topup', 100, '2026-12-31');
```

`kind` is `percent` (1-100) or `flat` (**paise** off — 10000 means ₹100).
`scope` is `topup`, `subscription` or `both`.

> **A code that touches the subscription needs one extra step,** and this is the
> part that surprises people. A refill is an Order and can be created for any
> amount, so the app computes its discount. A subscription bills a fixed-amount
> plan and **cannot** be discounted that way — Razorpay's only supported route
> is an *Offer*.
>
> So for a subscription code:
>
> 1. Razorpay Dashboard → **Subscriptions** → **+ Create New Offer**. Set the
>    discount, then note the offer id (`offer_…`).
> 2. Put that id in the `razorpay_offer_id` column of your promo row.
>
> A `subscription`- or `both`-scoped code with no `razorpay_offer_id` is
> refused with "That code is not set up for subscriptions yet". That refusal is
> deliberate: the alternative is showing someone ₹399 and charging them ₹499.

Useful columns: `max_discount_paise` caps a percentage discount, so "50% off"
cannot take ₹2,495 off the annual plan; `min_amount_paise` sets a floor; and
`repeatable` lets one person use a code more than once — normally false.

To switch a code off, set `active = false`. Redemptions are counted for you by a
trigger, so never increment `redemption_count` by hand.

## 6. Restart and check

```bash
npm run dev
```

Go to `/billing`. If the amber "Razorpay keys are not set" notice is gone, the
values were read correctly. If you set the yearly plan id, `/pricing` now shows
a Monthly / Yearly switch.

---

## Testing the flow

**Test first.** Generate a Test-mode key pair (same page, flip the ribbon to
Test), put those in `.env.local`, and run `npm run razorpay:plan` again — test
mode needs its own plans. Razorpay's test card is `4111 1111 1111 1111`, any
future expiry, any CVV. Nothing is charged and nothing reaches your bank.

UPI Autopay cannot be tested with test keys — use a card. The UPI mandate flow
only appears in live mode, which is worth knowing before you assume it is broken.

`/billing` shows a **test mode** notice while test keys are active, so you always
know which mode you are in.

1. Sign in, go to `/pricing`, click **Go Pro**.
2. Razorpay's window opens. Authorise the mandate.
3. The window closes and a toast says you are on Pro.
4. `/billing` shows the plan, the renewal date and a cancel button.
5. Click **Cancel subscription** → **Yes, cancel**. Razorpay is cancelled first,
   then the page updates. Check the Razorpay dashboard: the subscription should
   read `cancelled` there too.
6. Buy a refill from the same page. The balance rises by the pack size and the
   purchase appears under **Recent purchases**. Buying the same pack twice should
   add twice; a webhook arriving afterwards should add nothing more.
7. If you made a promo code, click **Have a promo code?**, apply it, and check
   the price is struck through before paying — then confirm Razorpay's own window
   shows the discounted amount, not the list price.
8. Try the same code again. It should be refused with "You have already used
   that code."
9. On `/pricing`, switch to **Yearly** and confirm the card shows both the
   per-month figure and the real annual charge.

**With live keys** the same flow charges ₹499 for real. To test end to end
without losing money, subscribe with your own account and cancel immediately —
Razorpay refunds are manual, from Dashboard → Transactions.

---

## Switching from test to live

**Everything at Razorpay is per-mode.** Keys, plans, offers and webhook secrets
all exist separately in Test and Live. A plan created in test mode does not exist
in live mode, so "swap the keys" really means replacing **six** values:

| # | Variable | Where it comes from |
| - | -------- | ------------------- |
| 1 | `RAZORPAY_KEY_ID` | Account & Settings → API Keys, in **Live** mode |
| 2 | `NEXT_PUBLIC_RAZORPAY_KEY_ID` | the same value as 1 |
| 3 | `RAZORPAY_KEY_SECRET` | shown once, alongside 1 |
| 4 | `RAZORPAY_PLAN_ID_PRO` | re-run `npm run razorpay:plan` with live keys |
| 5 | `RAZORPAY_PLAN_ID_PRO_YEARLY` | same command |
| 6 | `RAZORPAY_WEBHOOK_SECRET` | a live webhook is a separate dashboard entry |

Promo codes need attention too: a Razorpay **Offer** is per-mode, so a
subscription code's `razorpay_offer_id` has to be replaced with the live offer's
id. Refill-only codes are unaffected — those discounts are computed by the app.

Two guards exist so a half-finished swap is not silent:

- `/billing` shows a **Razorpay test mode** notice whenever the key is
  `rzp_test_`. If you are expecting real money and see that notice, the swap is
  incomplete.
- A production build **refuses to start** on test keys. Shipping them live would
  otherwise look perfect — checkout opens, mandates authorise — and no money
  would ever arrive. Nobody notices that until a payout is missing.

A test plan id next to a live key fails with "plan not found", which names
nothing useful. If you see that, check 4 and 5.

---

## When something goes wrong

| Symptom | Cause |
| ------- | ----- |
| "Billing is not configured" | One of the four variables is blank. The error names which. |
| "Subscriptions is not enabled for this account" | Request Subscriptions access from the dashboard. |
| Razorpay returns 401 | Key id and secret are from different pairs, or a test secret is sitting next to a live key id. |
| Checkout window never opens | `NEXT_PUBLIC_RAZORPAY_KEY_ID` is missing. It is a *separate* variable from `RAZORPAY_KEY_ID`. |
| Paid, but the app still says free | The webhook could not reach you. Press **Refresh** on `/billing` — that is what it is for. |
| Webhook returns 401 | The dashboard secret and `RAZORPAY_WEBHOOK_SECRET` differ, or a proxy is rewriting the body. The signature is over the *raw* bytes. |
| No Monthly/Yearly switch on /pricing | `RAZORPAY_PLAN_ID_PRO_YEARLY` is blank. Designed behaviour, not a bug. |
| "That code is not set up for subscriptions yet" | The promo row has no `razorpay_offer_id`. Create an Offer in Razorpay and paste its id in. |
| A promo works on refills but not the plan | Same cause as above, or `scope` is set to `topup`. |

Razorpay logs every webhook delivery and its response: Dashboard → Settings →
Webhooks → your webhook → **Recent Deliveries**. That is the first place to
look, the same way Supabase auth problems live in Logs → Auth Logs.

---

## What one unit of the allowance buys

Pro is sold as "20 scrapes a month", and **three different actions spend one**:

| action                     | job kind          | roughly costs      |
| -------------------------- | ----------------- | ------------------ |
| Researching a YouTube channel | `channel_scrape` | ₹6 (Apify + Firecrawl) |
| Researching an Instagram profile | `channel_scrape` | ₹9.50 (40 posts at $0.0027 each) |
| Generating ideas from one  | `idea_generation` | ₹7.50 worst case (Firecrawl + OpenAI) |
| Extracting a transcript    | `transcript`      | ~₹2 (Apify captions + OpenAI summary) |

Both are a paid API call per press, so both are counted. The list is
`BILLABLE_JOB_KINDS` in `src/lib/billing/quota.ts`, and the allowance is counted
from the `jobs` table rather than a stored number — a job row already exists for
every billable action, and a second counter could disagree with it.

**A new job kind is free until it is added to that list**, which is the trap
worth knowing: it fails silently and in the customer's favour, so nothing
complains.

A job marked `failed` is not counted, so work that never produced anything is
never charged for. The idea route marks its own job failed on any error path for
exactly this reason.

## What is deliberately not built yet

Nothing on the landing page is unbuilt any more. Transcripts shipped in 0008,
using an Apify captions actor at about $0.50 per 1,000 — which is a rounding
error beside the ₹2 summary that follows it.

**Invoices, refunds and proration.** Razorpay sends its own payment emails
(`customer_notify: 1`). Refunds are manual from their dashboard. Nobody can
change plan, because there is only one.
