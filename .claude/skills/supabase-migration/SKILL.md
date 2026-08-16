---
name: supabase-migration
description: Use whenever the database schema changes in this repo — adding or altering a table, column, index, enum, RLS policy, or trigger. Also use when a query fails with "permission denied" or when Supabase types resolve to never.
---

# Changing the schema

Three files move together or the change is broken:

1. `supabase/migrations/NNNN_description.sql` — a **new** file, never an edit
2. `src/lib/supabase/types.ts` — the TypeScript shape
3. `docs/data-model.md` — the human explanation

All three in the same pull request.

## Never edit an applied migration

Migrations are history. Editing one that has already run means your local
database and the deployed one silently disagree, and nothing will tell you.

Need to change something? New migration. `0002_add_thumbnail_column.sql`.

## Row-level security is not optional

Every new table gets RLS **in the migration that creates it**. Retrofitting
means auditing every existing row and every existing query; doing it now costs
nothing.

The pattern used throughout this repo:

```sql
alter table public.thing enable row level security;

create policy "own things" on public.thing
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
```

For a table that has no `owner_id` of its own, inherit ownership through its
parent — see the `videos` policy in `0001_init.sql`.

**If a query mysteriously returns no rows, the answer is almost always a missing
RLS policy, not a bug in the query.** Do not reach for the service-role client
to make it work; that hides the hole instead of closing it.

## Types must be `type`, not `interface`

This has bitten this repo already and it is invisible when it happens:

```ts
export type ChannelRow = { ... };   // correct
export interface ChannelRow { ... } // WRONG — breaks every query's types
```

Interfaces do not get implicit index signatures, so they fail supabase-js's
`Record<string, unknown>` constraint. The generic silently resolves to `never`
and you get a wall of "Property 'x' does not exist on type 'never'".

Every table in the `Database` type also needs a **`Relationships: []`** key.
Same failure mode.

## Uniqueness constraints that carry meaning

Two in this schema exist for behaviour, not tidiness. Do not drop them:

- `channels (owner_id, handle)` — researching a channel twice updates instead of
  duplicating
- `videos (channel_id, video_id)` — makes the Apify webhook safe to receive
  twice, which it will be

## Realtime

A table the browser needs to watch must be in the publication:

```sql
alter publication supabase_realtime add table public.thing;
```

## Applying a migration

No Supabase CLI is installed in this project. Either:

- paste the SQL into the Supabase dashboard SQL editor and run it, or
- use the Supabase MCP server from your editor

Then verify: run `npm run typecheck` and confirm `src/lib/supabase/types.ts`
matches what you actually created.
