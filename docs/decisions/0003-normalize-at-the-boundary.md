# 0003 — Scraper output is normalized before it touches the database

**Status:** accepted, 2026-08-16

## Context

The original sketch had an arrow from Apify straight to the database. It is the
tempting shortcut: the actor already returns JSON, the database already takes
JSON, why write a translation layer?

Because scraper output is not a stable contract. Apify actors change their
output shape when YouTube changes underneath them, and they do it without a
version bump. Counts arrive as `1234`, `"1,234"`, or `"1.2K"` depending on where
the actor scraped them from. Fields you rely on arrive as `null` rather than
being absent.

Store that directly and the database rots within a month: half your rows have
`"1.2K"` in a numeric column and nothing downstream can be trusted.

## Decision

Every item passes through a zod schema in `src/lib/schemas/` before it is
stored. `src/lib/apify/normalize.ts` owns the translation.

```
Apify dataset  →  rawApifyVideoSchema  →  coercion  →  videoSchema  →  database
   untrusted         tolerant              messy        strict         trusted
```

Two schemas, deliberately:

- **`rawApifyVideoSchema`** is permissive. Unknown extra keys are fine (the actor
  adds fields), and string fields are `.nullish()` because actors return `null`
  where you expect absence. This schema's job is to not reject things wrongly.
- **`videoSchema`** is strict. This is what the database gets.

## The rule that keeps a bad item from sinking a run

A single malformed item must never fail the whole scrape. Bad items are dropped,
their reasons deduplicated and logged, and the good items proceed. A scrape
returning 480 of 500 videos is a useful result.

`normalizeApifyDataset` returns `{ channel, videos, rejected }` — the rejections
are part of the return value, not swallowed.

## Why this is worth the file

The first test run of this code caught a real bug: `thumbnailUrl: null` failed
`z.string().optional()`, silently dropping a perfectly valid video. That is
exactly the class of error that, stored directly, would have been discovered
weeks later as "some videos are missing" with no way to trace it.

## Fixtures

`tests/fixtures/apify-channel-videos.json` is a real-shaped response including
the messy cases: abbreviated counts, ISO durations, a null thumbnail, an item
with no date, and an item that is a bare string. Commit the first real response
you get from a new actor as a fixture — it makes the normalizer testable for
free, forever, with no API calls.
