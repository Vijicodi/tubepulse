---
name: apify-run
description: Use when adding, changing or debugging anything that scrapes via Apify — starting an actor run, handling its webhook, or normalizing its dataset output. Also use when a scrape returns fewer videos than expected.
---

# Working with Apify

## The rule that matters most

**Never block on a run.** `client.actor(...).call()` waits until the actor
finishes. A channel scrape takes 2–6 minutes; the request will die first.

Always `.start()`, always pass a webhook:

```ts
const run = await client.actor(actorId).start(input, {
  webhooks: [{
    eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.ABORTED"],
    requestUrl: `${env.APP_URL}/api/webhooks/apify`,
    payloadTemplate: JSON.stringify({ jobId, secret, runId: "{{resource.id}}", ... }),
  }],
});
```

Full reasoning: `docs/decisions/0002-async-jobs-and-webhooks.md`.

Subscribe to the failure events too, not just `SUCCEEDED`. Without them a failed
run leaves the job stuck on `running` forever and the user watches a spinner
that never resolves.

## The webhook is a public URL

Three requirements, all implemented in `src/app/api/webhooks/apify/route.ts`:

1. **Verify the shared secret before doing anything**, using
   `crypto.timingSafeEqual`. A `===` comparison leaks the secret one character
   at a time to anyone willing to measure.
2. **Be safe to run twice.** Apify re-delivers. Every write is an upsert on
   `(channel_id, video_id)`.
3. **Return 200 once the secret checks out, even on internal failure.** Non-2xx
   makes Apify retry forever. Record the failure on the job row instead — that is
   where the user can see it.

## Never trust the dataset

Actor output goes through `normalizeApifyDataset` before it reaches the
database. Never insert raw items. See
`docs/decisions/0003-normalize-at-the-boundary.md`.

Things real actors do that will surprise you:

- Counts as `1234`, `"1,234"`, or `"1.2K"` — use `countLike`
- Durations as `"PT4M13S"`, `"4:13"`, or seconds — use `durationLike`
- `null` where you expect the key to be absent — raw schemas use `.nullish()`,
  **not** `.optional()`
- New fields appearing without warning — raw schemas are `z.looseObject`

## Fixtures

The first real response from a new actor gets committed to
`tests/fixtures/` and a test written against it. That makes the normalizer
testable forever with no API calls and no cost.

If a scrape starts returning fewer videos than expected, the actor's shape
probably changed. Capture the new response as a second fixture, add a test that
fails, then fix the normalizer.

## Cost

`maxResults` defaults to 100. More videos costs more and adds little signal —
the scoring only needs enough history to compute a stable median. Do not raise
it without a reason you can state.

Also set `maxResultsShorts: 0` and `maxResultStreams: 0`: shorts and streams
have completely different view dynamics and would corrupt the median.
