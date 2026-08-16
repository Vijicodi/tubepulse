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

| column               | type     | notes                                       |
| -------------------- | -------- | ------------------------------------------- |
| `confidence`         | integer  | 0–100, checked at the database level        |
| `evidence_video_ids` | text[]   | `videos.video_id` values that justify this  |

An idea with an empty `evidence_video_ids` should never exist. The generator
filters out any citation the model invented for a video it was not sent.

## Row-level security

Every table, enabled in migration 0001. `videos` has no `owner_id` of its own
and inherits ownership through its channel.

The service-role key bypasses all of this by design. That is exactly why only
the Apify webhook is permitted to use it — it has no user session to act as.
