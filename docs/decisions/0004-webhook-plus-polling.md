# 0004 — The webhook has a polling twin

**Status:** accepted, 2026-08-16

## Context

Decision 0002 established that slow work goes through the jobs table and a
webhook writes the result. That is correct in production and useless on a
laptop: Apify has to be able to *reach* the webhook, and `localhost:3111` is not
reachable from the internet.

Without a tunnel (ngrok, cloudflared) the first local scrape looks exactly like
a hung app — the job card spins, the scrape actually succeeded minutes ago, and
nothing tells you the difference. That is a terrible first-run experience for a
product whose whole pitch is "watch it work".

Requiring a tunnel before anyone can try the app is a real barrier, especially
for a non-engineer.

## Decision

Two paths to the same outcome, sharing one implementation:

1. **Webhook** (`/api/webhooks/apify`) — the fast path. Fires the moment Apify
   finishes. Needs a public URL.
2. **Sync** (`POST /api/jobs/[id]/sync`) — asks Apify directly whether the run
   finished, and ingests it if so. Works anywhere.

The job card subscribes to Supabase realtime *and* polls sync every 12 seconds
while a job is running. Whichever learns first wins.

## Why this is safe

Both call the same `ingestRun()` in `src/lib/apify/ingest.ts`, and every write
inside it is an upsert on a unique key:

- `videos` on `(channel_id, video_id)`
- the job row is set to `succeeded` idempotently

So it does not matter which path arrives first, or whether both do, or whether
the webhook is re-delivered afterwards. Running the ingest twice produces the
same rows.

**The shared module is the point.** Two copies of this logic would be two
behaviours, and the divergence would only reproduce on one developer's machine.

## Why sync uses the user's client, not the admin client

The webhook has no session — it is Apify calling us — so it must use the
service-role key. Sync is called by a signed-in browser, so it uses the user's
client and row-level security guarantees a user can only sync their own job.
Reaching for the admin client there would have been easier and strictly worse.

## Cost

One extra Apify API call per 12 seconds per running job. Apify's run-status
endpoint is cheap and this only runs while a job is genuinely in flight, with a
typical scrape lasting under six minutes — roughly 30 calls per scrape.

If that ever matters, raise the interval. Do not remove the fallback.

## When to revisit

If the app is only ever run against a deployed URL with working webhooks, the
poll becomes dead weight. It is nine lines in the job card and one route; the
insurance is worth more than the deletion.
