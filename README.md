# TubePulse

A voice-first workspace for YouTube competitor research. Paste a competitor's
channel, get their real video performance enriched with web context, turned into
ranked video ideas with the evidence attached.

MIT licensed. Built by Vishruth Vijay.

---

## The idea that makes it work

Absolute view counts are meaningless. A 500k-view video is a flop on a channel
that averages 2M and a breakout on one that averages 20k.

So every video is scored against **its own channel's median** — not the mean,
because a single viral video drags a mean upward far enough to hide every other
outlier. Those relative scores are what the idea generator reasons over.

## How it is built

| Layer      | Choice                              |
| ---------- | ----------------------------------- |
| App        | Next.js 16 (App Router), React 19    |
| Auth       | Supabase email + 6-digit code, Google OAuth |
| UI         | Tailwind v4, shadcn/ui, TweakCN theme |
| Database   | Supabase (Postgres, auth, realtime)  |
| Scraping   | Apify                                |
| Web context| Firecrawl                            |
| Generation | OpenAI, JSON-mode + zod validation    |
| Validation | Zod at every external boundary       |

One Next.js app, not a separate frontend and backend —
[why](docs/decisions/0001-one-nextjs-app.md).

### The part worth copying

A channel scrape takes 2–6 minutes, which is far longer than a request can live.
So requests never wait for it:

```
POST /api/research  →  insert a job row  →  start the Apify run  →  202 in <1s
                                                     ↓
                                        (2-6 minutes; user can close the tab)
                                                     ↓
POST /api/webhooks/apify  →  verify secret  →  normalize  →  upsert  →  job done
                                                     ↓
                                    Supabase realtime pushes it to the browser
```

The browser watches a database row, not a request.
[Full reasoning](docs/decisions/0002-async-jobs-and-webhooks.md).

## Running it

```bash
npm install
cp .env.example .env.local     # then fill it in
npm run dev
```

Apply the database schema by pasting each file in `supabase/migrations/` into
the Supabase dashboard SQL editor, in order. Two Supabase dashboard settings are
required for sign-up and Google login — see [docs/auth-setup.md](docs/auth-setup.md).

For webhooks to reach you locally, `APP_URL` must be publicly reachable — use a
tunnel (ngrok, cloudflared), not `localhost`.

### Checks

```bash
npm run check    # typecheck → lint → test → build
```

That single command is the gate. It runs locally and again in CI on every pull
request, where it cannot be skipped.

## Repository layout

```
src/app/                routes — folder name is the URL
  api/research/         start a scrape (returns immediately)
  api/webhooks/apify/   where finished scrapes land
  api/ideas/            generate ideas from stored videos
  index.css             the TweakCN theme — the only place colours are defined
src/lib/
  apify/                client + normalizer
  firecrawl/            web enrichment (optional; failures degrade, not break)
  ideas/                scoring (pure, tested) + generation (LLM)
  schemas/              zod — the trust boundary
  supabase/             clients + Database types
supabase/migrations/    schema history, never edited after being applied
tests/                  vitest + committed fixtures
```

## How this repo is meant to be worked on

It is built for AI coding agents to extend safely, which mostly means the
repository can verify itself:

- **[AGENTS.md](AGENTS.md)** — the constitution. Commands, non-negotiables,
  known traps, and when to stop and ask.
- **[.claude/skills/](.claude/skills/)** — procedures for the recurring jobs:
  shipping a PR, changing the schema, adding a scrape, building UI, touching the
  prompt.
- **[docs/decisions/](docs/decisions/)** — why the irreversible calls were made,
  so nobody has to re-litigate them.

The rule the whole setup rests on: **if a mistake can only be caught by a human
reading code, it will eventually ship.** So every rule that matters is a check
that runs in a terminal.

## Licence

[MIT](LICENSE) © 2026 Vishruth Vijay
