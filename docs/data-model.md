# Data model

Six tables. Schema lives in `supabase/migrations/`, types in
`src/lib/supabase/types.ts`. Those two files change together, in the same pull
request, always.

## projects

The spine. Competitors, outliers, ideas and jobs all belong to a project, and a
project belongs to a user. Which project you are "in" is held in the
`tp_project` cookie — see `src/lib/projects/current.ts`.

The cookie is only a hint. It is always re-resolved against the database under
RLS, so a tampered cookie naming someone else's project resolves to nothing and
falls back to the user's own most recent project.

| column        | type          | notes                          |
| ------------- | ------------- | ------------------------------ |
| `owner_id`    | uuid          | → `auth.users`, cascade delete |
| `name`        | text          | non-empty, checked in SQL      |
| `niche`       | text \| null  |                                |
| `description` | text \| null  |                                |

## profiles

Mirrors the bits of `auth.users` the UI needs. `auth.users` is managed by
Supabase and must not be written to directly.

Rows are created by the `on_auth_user_created` trigger, which fires for
email/password **and** Google sign-ups. Doing it in a trigger means no code path
can forget — a route that creates users without a profile is not possible.

## channels

One row per channel *per project*. `unique (project_id, handle)` means
researching a channel twice updates the row rather than creating a duplicate,
while the same channel can still be tracked in two different projects.

| column             | type          | notes                                    |
| ------------------ | ------------- | ---------------------------------------- |
| `id`               | uuid          | primary key                              |
| `owner_id`         | uuid          | → `auth.users`, cascade delete           |
| `project_id`       | uuid          | → `projects`, cascade delete             |
| `handle`           | text          | canonical, e.g. `@mkbhd`                 |
| `channel_url`      | text          | what we hand the scraper                 |
| `title`            | text \| null  | null until the first scrape fills it in  |
| `subscriber_count` | bigint \| null|                                          |
| `last_scraped_at`  | timestamptz   | null means never successfully scraped    |

## videos

| column             | type            | notes                                     |
| ------------------ | --------------- | ----------------------------------------- |
| `channel_id`       | uuid            | → `channels`, cascade delete              |
| `video_id`         | text            | YouTube's id                              |
| `view_count`       | bigint          | never null; missing counts normalize to 0 |
| `published_at`     | timestamptz     | required — items without one are dropped  |
| `outlier_score`    | numeric \| null | views ÷ channel median                    |
| `velocity`         | numeric \| null | views per day since publication           |

`unique (channel_id, video_id)` is load-bearing: it is what makes the Apify
webhook safe to receive twice. Apify re-delivers webhooks, and an upsert on this
key turns a duplicate delivery into a no-op.

## jobs

The row the browser watches while a scrape runs. This table is why a 6-minute
scrape does not need a 6-minute request.

| column            | type       | notes                                        |
| ----------------- | ---------- | -------------------------------------------- |
| `kind`            | enum       | `channel_scrape` \| `idea_generation`         |
| `status`          | enum       | `queued` → `running` → `succeeded`/`failed`  |
| `external_run_id` | text       | Apify run id, so a webhook can find its job  |
| `error`           | text       | shown to the user verbatim — write it for them |

`jobs` is in the `supabase_realtime` publication. That single line at the bottom
of migration 0001 is what makes the UI update by itself.

Realtime is not the only path: the job card also polls `/api/jobs/[id]/sync`,
so a scrape completes correctly on a laptop with no public webhook URL. Both
paths share one ingest function — see
[decision 0004](decisions/0004-webhook-plus-polling.md).

## ideas

| column               | type             | notes                                      |
| -------------------- | ---------------- | ------------------------------------------ |
| `confidence`         | integer          | 0–100, checked at the database level       |
| `evidence_video_ids` | text[]           | `videos.video_id` values that justify this |
| `saved_at`           | timestamptz\|null | when shortlisted; null means never         |

An idea with an empty `evidence_video_ids` should never exist. The generator
filters out any citation the model invented for a video it was not sent.

`evidence_video_ids` holds **YouTube ids, not our row ids**, because that is
what the model was shown and what it cites back. The join to `videos` therefore
happens in `src/lib/ideas/evidence.ts` rather than in SQL. A cited video that is
no longer stored — re-researching a channel replaces its videos — is dropped and
the card says the evidence is missing, rather than showing an idea as supported
by something that is not there.

### saved_at, added in migration 0006

The Saved ideas page is simply `ideas where saved_at is not null`, newest first.
A timestamp rather than a boolean because "when did I shortlist this" is the
order the page is read in, and a boolean cannot answer it.

A column rather than a `saved_ideas` table: a saved idea is the same idea with a
decision attached. A second table would duplicate every field and then the two
copies could disagree about what was actually saved — the one thing a shortlist
exists to be certain about. It also keeps the evidence attached for free.

No new policy was needed. `ideas` already carries an owner-scoped `for all`
policy from 0001, and a new column on an existing table inherits it.

## transcripts

Added in migration 0008. One row per video per user.

| column       | type          | notes                                        |
| ------------ | ------------- | -------------------------------------------- |
| `video_id`   | text          | the YouTube id — the same one ideas cite     |
| `text`       | text          | the spoken words, captions joined into prose |
| `summary`    | text \| null  | the short LLM pass; null if it failed         |
| `language`   | text \| null  | BCP-47 where the actor reports one            |
| `word_count` | integer       | computed at ingest, not derived on read       |

**Unique on `(owner_id, video_id)`** — behaviour, not tidiness. Extracting the
same video twice updates the row instead of stacking copies, and it makes the
Apify webhook safe to receive twice, which it will be.

`summary` is nullable on purpose. The transcript is what the user pressed the
button for, and it is already extracted by the time summarising runs — losing it
because an LLM call failed would trade the thing they asked for against a
convenience. A failed summary degrades to null and the page says so.

## jobs.payload

Also 0008. What a job was asked to do, as jsonb. A scrape does not need it — its
target is `channel_id` — but a transcript's target is a video URL and there was
nowhere to put one. Reading the URL back out of the actor's output instead fails
silently for any actor that does not echo it.

## platform and kind, added in migration 0009

Instagram reuses `channels` and `videos` rather than getting tables of its own.

| column               | type       | notes                                    |
| -------------------- | ---------- | ---------------------------------------- |
| `channels.platform`  | enum       | `youtube` \| `instagram`, default youtube |
| `videos.kind`        | enum       | `video` \| `reel` \| `post`, default video |

`videos.view_count` became NULLABLE in the same migration. A static Instagram
post has no view count — it is not something you watch — and storing 0 would be
a claim that nobody saw it, as well as dragging down any median it touched. Its
metric is `like_count`.

**Scoring reads one median per `kind`, on one metric per `kind`.** Reels on
plays, posts on likes, videos on views. Pooling them would let a reel at 11
million plays make every photo on the account look like a failure — the same
damage YouTube Shorts do to a channel median, which is why the scraper excludes
those too.

## Row-level security

Every table, enabled in migration 0001. `videos` has no `owner_id` of its own
and inherits ownership through its channel.

The service-role key bypasses all of this by design. That is exactly why only
the Apify webhook is permitted to use it — it has no user session to act as.

## subscriptions

One row per user — `owner_id` is unique — added in migration 0003.

| column                     | type   | notes                                          |
| -------------------------- | ------ | ---------------------------------------------- |
| `status`                   | enum   | Razorpay's own vocabulary, kept verbatim       |
| `current_period_end`       | timestamptz | end of the period already paid for        |
| `cancel_at_period_end`     | boolean | OURS, not Razorpay's — see below              |
| `razorpay_subscription_id` | text   | unique; what `/api/billing/sync` asks about    |

`cancel_at_period_end` has no equivalent in Razorpay's subscription object: a
cancelled-at-cycle-end subscription simply stays `active` there until the cycle
ends. So the flag is written by `/api/billing/cancel` and deliberately left
alone by webhook upserts, which would otherwise reset it and un-cancel someone.

**Access is a date, not a status.** `hasProAccess()` checks
`current_period_end`, so cancelling on the 2nd keeps Pro through the 30th. Two
statuses never grant access whatever the date says: `created`, because the row
exists from the moment checkout opens and before any mandate is authorised, and
`halted`, because the retries ran out and the money did not arrive.

RLS is **select-only for the owner**. There is no insert, update or delete
policy at all — nothing a browser sends can grant the paid tier. Writes go
through the service-role client and only from a signature-verified Razorpay
payload. See [decision 0005](decisions/0005-razorpay-subscriptions.md).

`subscriptions` is in the `supabase_realtime` publication, so `/billing` flips
to Pro the moment the webhook lands rather than making the user reload.

## billing_events

Every Razorpay webhook we have processed, keyed by **Razorpay's own event id**.
A re-delivery collides on the primary key and the webhook stops instead of
writing twice — Razorpay retries on any non-2xx, and the polling fallback can
reach the same state change first.

RLS is enabled with **no policy whatsoever**, which means the anon and
authenticated roles can read nothing. Raw payloads carry contact details and
payment metadata that no browser needs.

## scrape_credits

Refill packs, bought outright. Added in migration 0004, and deliberately a
separate table from `subscriptions`: a pack survives cancelling Pro, because it
was paid for outright.

| column                | type    | notes                                        |
| --------------------- | ------- | -------------------------------------------- |
| `credits`             | integer | positive for a purchase, negative for a spend |
| `source`              | text    | `topup_small` \| `topup_large` \| `manual`  |
| `razorpay_payment_id` | text    | **unique** — this is what makes granting idempotent |
| `amount_paise`        | integer | what was actually charged, stored not derived |

**A ledger, not a balance column.** A single `credits_remaining` integer would
be one row that every purchase and every scrape races to update, and the first
lost update silently gives away or steals scrapes with no way to find out which.
Append-only rows cannot lose history: the balance is their sum, exposed as the
`scrape_credit_balance` view.

That view is declared `security_invoker = on`. Without it the view would run as
its owner and bypass RLS, handing every user everyone else's balance.

Granting is idempotent **by the unique index**, not by checking first. Three
paths can learn the same pack was paid for — the browser's confirm call, the
`order.paid` webhook, and a manual sync — and a read-then-write would let two
of them interleave and grant it twice. All three insert; the constraint decides.

Nothing spends these yet. The app still counts no scrapes; purchases are
recorded correctly so nobody loses money they have already paid, and the
spending half arrives with the quota work.

## promo_codes

Discount codes, added in migration 0005.

| column              | type    | notes                                            |
| ------------------- | ------- | ------------------------------------------------ |
| `code`              | text    | unique, stored upper-case                        |
| `kind`              | enum    | `percent` (1-100) or `flat` (paise off)          |
| `scope`             | enum    | `subscription` \| `topup` \| `both`              |
| `razorpay_offer_id` | text    | **required for subscription scope** — see below  |
| `max_discount_paise`| integer | ceiling on a percentage discount                 |
| `max_redemptions`   | integer | null for unlimited; counted by trigger           |

**RLS is on with no policy at all.** Nobody reads this table with their own
credentials, so a signed-in visitor cannot list it and discover unreleased
codes. Validation happens server-side and returns only a verdict for the single
code that was typed.

**Why `razorpay_offer_id` exists.** A refill is a Razorpay *Order* and is created
for whatever amount we say, so its discount is ours to compute. A subscription
bills a fixed-amount *Plan* and cannot be discounted directly — the only
supported route is a Razorpay Offer created in their dashboard and passed as
`offer_id` at subscription creation. A subscription-scoped code with no offer
behind it is rejected at validation rather than showing a discount and then
charging full price.

## promo_redemptions

One row per use. The partial unique index on `(promo_id, owner_id)` is what makes
"once per person" a database guarantee rather than a check two simultaneous
requests can both pass. Codes flagged `repeatable` opt out via a sentinel in
`razorpay_reference`.

`promo_codes.redemption_count` is bumped by an `after insert` trigger, not by the
app, for the same reason: two checkouts landing together must not both squeeze
past a `max_redemptions` limit.

Users may read their own redemptions; writes stay with the service role.

## subscriptions.billing_cycle

Added in 0005. Pro can be paid `monthly` or `yearly`, and the two are separate
Razorpay plan objects because a plan hard-codes both its period and its amount.
Which one a subscriber is on is not derivable from anything else stored —
`razorpay_plan_id` is opaque — so without this column the billing page could not
say "renews yearly". It is set at checkout, and recovered from the
subscription's own notes on the webhook and sync paths.
