# 0005 — Razorpay subscriptions, and the database decides who is Pro

**Status:** accepted, 2026-08-17

## Context

TubePulse needed to charge money. Three questions had to be answered at once and
each of them is hard to reverse later: which gateway, what shape of payment, and
what is allowed to grant someone the paid tier.

Prices are in rupees and settle to an Indian bank account. Costs are per scrape
and recur, so the revenue has to recur too. And the thing being sold — API spend
at Apify and OpenAI — is money we lose the moment access is granted incorrectly.

## Decision

### Razorpay, not Stripe

Stripe India requires an entity setup that does not exist here, and its rupee
support is not the point anyway. Razorpay settles to an Indian account, supports
UPI Autopay — which is how most Indian consumers actually pay recurring bills —
and needs no separate merchant of record.

This is not a close call and does not need revisiting.

### Subscriptions with a mandate, not repeated one-off charges

Razorpay's Subscriptions product takes an autopay mandate once and then debits
monthly on its own. The alternative, emailing a payment link every month, has a
churn rate that is a business model rather than a bug.

The consequence to remember: **`total_count` is mandatory.** Razorpay has no
"until cancelled". We request 100 monthly cycles, which is eight years — see
`PRO_TOTAL_CYCLES` in `src/lib/billing/plans.ts`.

### Refill packs are a second, separate flow

₹149 for 5 scrapes and ₹449 for 15, alongside the subscription. They are
Razorpay **Orders**, not Subscriptions: paid once, no mandate, never expiring.

That difference is why they get their own route, their own webhook event, their
own signature format (`order|payment`, the reverse of the subscription flow) and
their own ledger table, rather than a branch inside the subscription code. One
function full of `if (isSubscription)` is how the wrong branch ends up taking
somebody's money.

**They are priced above the plan on purpose.** Pro works out at ₹24.95 a scrape;
the packs at about ₹30. A refill that undercuts the subscription teaches people
to cancel the subscription and buy packs instead. The pricing page shows the
arithmetic rather than asserting it, and a test enforces the relationship so it
cannot be lost to someone rounding the prices nicely.

They also carry a *better* margin than the subscription — 57% each against the
plan's 49% — because they are bought by people already getting value from it.

### Annual billing is a second plan, not a discount

A Razorpay plan hard-codes both its period and its amount, so "bill this monthly
plan yearly" does not exist. Monthly and yearly are two plan objects, created
together by `npm run razorpay:plan`, and `subscriptions.billing_cycle` records
which one a subscriber is on because `razorpay_plan_id` is opaque.

Yearly is **two months free** — ₹4,990 against ₹5,988 — because that is the
framing everyone already understands and the easiest promise to verify.

The cost is nine points of margin: 49% monthly against 40% yearly, worst case,
since costs do not fall when somebody prepays. What is bought with them is a
year of cash up front and a year without churn. A test fails below 35%, so the
discount cannot quietly deepen.

`RAZORPAY_PLAN_ID_PRO_YEARLY` is deliberately NOT required. Monthly is the core
product and must work alone; annual is an upsell switched on by adding one
variable, and the toggle simply does not render without it. A switch that
produces an error is worse than no switch.

### Promo codes: ours for refills, Razorpay's for subscriptions

The same asymmetry, one layer up. A refill is an Order created for whatever
amount we say, so its discount is arithmetic we own. A subscription bills a
fixed-amount plan and can only be discounted through a Razorpay **Offer**,
created in their dashboard and referenced by `offer_id`.

So a subscription promo needs two things that must agree: a row in `promo_codes`
and an offer in Razorpay. `razorpay_offer_id` links them, and a subscription code
without one is **rejected loudly**. Showing a discount and then charging full
price is the one outcome worth failing a checkout to avoid.

Everything else follows the rules already established here. The preview endpoint
grants nothing and checkout re-validates from scratch, because a discount figure
that arrived from a browser is a suggestion. Once-per-person is a unique index
rather than a read-then-write, and the redemption count is a trigger, so two
simultaneous checkouts cannot both slip past a redemption limit.

One trade-off taken knowingly: a subscription code is marked redeemed when
checkout is created, not when payment lands, because the discount is applied by
Razorpay's offer at charge time and there is no later moment we are guaranteed
to see. Abandoning the popup therefore consumes the code. The alternative is a
code that can be reused indefinitely by opening checkout and closing it.

### The `subscriptions` table is the only authority

Nothing in the browser can grant Pro. The table has a `select` policy for its
owner and **no insert, update or delete policy at all**. Every write goes through
the service-role client, and only from a payload whose HMAC signature has been
verified against `RAZORPAY_WEBHOOK_SECRET`.

The success payload Razorpay's checkout hands the browser is *not* trusted
either. It is a message from a client; the app ignores it and asks Razorpay's
API directly through `/api/billing/sync` instead.

This is the whole security design, and it is one sentence: **the paid tier is
decided by a row that only a verified Razorpay payload can write.**

### Access is a date, not a status

`hasProAccess()` in `src/lib/billing/status.ts` is a pure function, unit tested,
and it checks the period end rather than the word "cancelled". Somebody who
cancels on the 2nd has paid through the 30th and keeps Pro until then.

Two statuses are deliberately *not* access: `created`, because a row exists from
the moment checkout opens and before any mandate is authorised, and `halted`,
because the retries were exhausted and the money did not arrive.

### Cancel calls Razorpay first

`/api/billing/cancel` cancels at Razorpay and only updates the local row if that
succeeds. The reverse order produces the worst bug a billing system can have: an
app that says "cancelled" while the customer's mandate keeps debiting ₹499 every
month. Every complaint about that would arrive as "your app is stealing from
me", and every one would be right.

### The webhook has a polling twin, again

Exactly as decision 0004 established for Apify. Razorpay cannot reach
`localhost`, so `/api/billing/sync` asks their API directly — after checkout, and
from a **Refresh** button on `/billing`. Both paths write through one shared
function in `src/lib/billing/store.ts`, because the Apify ingest already proved
what happens when the same procedure is written twice.

In production it doubles as the recovery path: a user repairs their own account
after a missed delivery instead of emailing support.

### No `razorpay` npm package

Six endpoints, reached with `fetch` and validated with zod at the boundary. The
official package is CommonJS with loose types and we would be validating its
output anyway — so it adds a dependency and changes nothing about the safety.

## Consequences

**Payments work; quotas do not.** A subscriber can today run more than the 20
scrapes they paid for, and a bought refill is never spent, because the app
counts none. This is stated on the pricing page's source comment, in
`docs/billing-setup.md`, and here. Quota enforcement is the next piece of work:
spend rows in `scrape_credits`, checks in the research route, and the paywall.

**Plans are immutable at Razorpay.** Repricing means creating a new plan and
repointing `RAZORPAY_PLAN_ID_PRO`. Existing subscribers stay on the old one until
they resubscribe — which is correct, and also means the price cannot be changed
retroactively by editing a file.

**The service-role client's permitted callers have grown, deliberately.** It was
the Apify webhook alone. It is now that, plus every write in
`src/lib/billing/store.ts` — which is where the Razorpay webhook, the sync
route, the cancel route and the refill confirm route all funnel.

That is not a loosening of the rule; it is what the rule demands. Because
`subscriptions` and `scrape_credits` grant no write permission to anyone, a
user's own session physically cannot write them, and the alternative — adding an
insert policy so the app "just works" — is exactly the hole this decision exists
to close. The elevated writes are confined to one module, and every one of them
happens only after a signature check or a direct confirmation from Razorpay.

Anywhere else, reaching for the admin client still means an RLS policy is
missing.

**`OPENAI_MODEL` is no longer a pricing decision.** The old ₹399/30 plan only
worked on a mini-tier model. At ₹499 for 20, the margin holds on gpt-4o too
(49%, against 74% on a mini tier), and a test in `tests/billing-status.test.ts`
fails below 45% if that ever stops being true.

**20 scrapes is the ceiling at ₹499.** Each extra scrape costs ₹12 and earns
nothing, so 25 would fall to 37% and 30 to 25%. More generosity means a higher
price, not a bigger allowance.

**The daily cap no longer bounds the month.** At 7 a day against a monthly 20,
three enthusiastic days exhaust the allowance — the cap is a burst limit, not a
spend guard. It was raised from 5 knowingly. A hard "cannot drain the month in a
weekend" guarantee needs the cap below scrapes/3.

## Amendment, 17 Aug 2026 — voice dropped

*Code caught up the same day: `components/workspace/voice-panel.tsx` is
deleted and the shell is a single content column again, roughly 400px wider.*

The voice agent was priced here before it was built: 30 minutes a month on Pro,
funded out of the margin. It has since been **dropped from the product**, so the
allowance, the per-minute cost constant and their tests are gone.

The reasoning is kept because the shape of the problem outlives this feature.
Voice was a **second meter**: a scrape is discrete and deliberate, while voice is
continuous time spent by accident, and one cannot be expressed in the other. Any
future feature billed by duration rather than by action — video rendering, live
monitoring, long-running agents — has the same structure and needs the same
treatment: its own allowance, a hard cap, and its costs written into
`plans.ts` before launch rather than after.

Dropping it returns Pro to a 49% worst-case margin.
