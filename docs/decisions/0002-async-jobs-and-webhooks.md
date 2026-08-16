# 0002 — Slow work goes through the jobs table, never through the request

**Status:** accepted, 2026-08-16

## Context

A YouTube channel scrape takes 2–6 minutes. A serverless function times out long
before that — and even where it does not, a browser request held open for six
minutes fails at the first flaky connection.

The naive version (`apifyClient.actor(...).call()`, which blocks until the run
finishes) works perfectly on a small test channel and then fails in production,
which is the worst possible failure shape.

## Decision

Requests never wait for slow work.

```
POST /api/research
  → insert jobs row (status: queued)
  → start the Apify run, hand it a webhook URL       (returns a runId at once)
  → update jobs row (status: running, external_run_id)
  → respond 202 with the jobId                       ← under one second
  ...
  2-6 minutes pass. The user can close the tab.
  ...
POST /api/webhooks/apify
  → verify the shared secret (constant-time)
  → fetch the dataset, normalize, upsert videos
  → update jobs row (status: succeeded)
  → Supabase realtime pushes that row change to the browser
```

The browser subscribes to the job row, not to a request.

## Why the jobs table specifically

State in a database survives a page refresh, a crashed tab, a redeployment, and
a user who closed their laptop. State in a running request survives none of
those.

## Why realtime instead of polling

Supabase pushes the row change. No polling loop to write, no interval to tune,
no "check again in 5 seconds" code to debug. The single line
`alter publication supabase_realtime add table public.jobs;` at the bottom of
migration 0001 is what buys this.

## Rules that follow from this, and are implemented

1. **The webhook is public, so verify the secret first** — constant-time
   compare, so the endpoint cannot be probed a character at a time.
2. **The webhook must be safe to run twice.** Apify re-delivers. Every write is
   an upsert on `(channel_id, video_id)`, so a duplicate delivery is a no-op.
3. **Return 200 once the secret checks out, even on internal failure.** A non-2xx
   makes Apify retry forever. Failures are recorded on the job row, where the
   user can actually see them.
4. **The job row is created before the scrape starts**, so the UI has something
   to watch even if starting the actor fails.

## When this applies again

Any operation that could exceed a few seconds. Idea generation currently runs in
seconds and is a normal request — if it creeps past ~30 seconds, move it behind
this pattern rather than raising `maxDuration`.
