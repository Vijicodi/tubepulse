---
name: firecrawl-enrich
description: Use when adding or changing web enrichment via Firecrawl — searching, scraping or crawling pages to give the idea generator context beyond YouTube. Also use when Firecrawl costs or timeouts need attention.
---

# Web enrichment with Firecrawl

## What it is for here

Apify tells us what **performed**. Firecrawl tells us what is being
**discussed**. The idea generator is better with both and still works with only
the first.

That last clause is a design rule, not an accident.

## Enrichment is optional, and the code must prove it

`gatherWebContext` returns `[]` on any failure and logs a warning. It never
throws. A Firecrawl outage, a rate limit, or a slow page must degrade the result,
never fail the job.

If you add a second enrichment source, it follows the same shape: try, fail
quietly, return nothing useful rather than nothing at all.

## Two rules, both about money

1. **Cap the result count.** `MAX_RESULTS = 5`. An unbounded crawl bills like
   one. Never call `crawl` on a domain without a page limit.
2. **Cap the text you keep.** `EXCERPT_CHARS = 1200` per result. The excerpt
   goes into an LLM prompt, so unbounded markdown is billed twice — once by
   Firecrawl and once by Anthropic.

## Prefer `search` over `crawl`

`search` with `scrapeOptions` gets you relevant pages plus their content in one
call. `crawl` walks a whole site and is the wrong tool for "what is the internet
saying about this niche" — it is for "I need this specific site, exhaustively".

## Build the query from the data, not the channel name

A query of just the channel name returns that channel's own social profiles,
which tells the generator nothing it does not already know. Build the query from
what actually broke out:

```ts
`${channelTitle} audience discussion trends — topics: ${topOutlierTitles}`
```

## Caching

Not yet implemented — it is Phase 4. When you add it, key on the query string
with a short TTL (an hour is plenty). Researching the same channel twice in one
session should not bill twice.
