# Product

## The sentence

You paste in a competitor's YouTube channel or a niche. The app pulls their real
video performance, enriches it with what the wider web is saying, and hands you
a ranked list of video ideas with a reason attached to each one.

## Who it is for

Creators researching a niche they do not already dominate. They know their own
numbers; what they lack is a fast, honest read on somebody else's.

## The one non-obvious idea

**Absolute view counts are meaningless. Relative ones are the product.**

A 500k-view video is a flop on a channel that averages 2M and a breakout on one
that averages 20k. So every video is scored against its own channel's *median*
— not the mean, because a single viral video drags a mean upward far enough to
hide every other outlier.

That choice, implemented in `src/lib/ideas/score.ts`, is most of the accuracy in
this product. It is also why the scoring functions are pure and heavily tested:
they are the part that must not silently drift.

## What "done" looks like for a user

1. They paste `@somechannel` and hit Research.
2. Within a second they see a live status card. The scrape takes 2–6 minutes and
   they can leave the page.
3. When it finishes, they see the channel's videos ranked by outlier score.
4. They click Generate ideas and get up to 8 ideas, each citing the specific
   videos it was derived from, each with an honest confidence number.

## Explicitly out of scope

- Publishing, scheduling, or uploading anything to YouTube
- Thumbnail generation or design tooling
- Multi-user teams, sharing, or permissions beyond "your own rows"
- Analytics on the user's *own* channel — YouTube Studio already does that well

## Honesty rules that are product decisions, not code style

- The progress bar is an elapsed-time estimate, and the UI says so. Apify does
  not report percentages and inventing one would be a lie.
- Idea confidence is shown as the model reported it, including low numbers. The
  prompt asks for honesty; the UI must not hide the result.
- A scrape that returns 480 of 500 videos is a success, not a failure. Dropped
  items are counted and logged rather than sinking the run.
