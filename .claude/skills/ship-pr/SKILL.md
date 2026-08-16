---
name: ship-pr
description: Use when opening a pull request in this repo, or when the user says "ship it", "open a PR", or "commit this". Covers branch naming, the required checks, PR size, and what the PR body must contain.
---

# Shipping a pull request

This repo is reviewed by someone who does not read code. The pull request is
therefore not a code review request — it is a claim that the change is already
verified, plus enough context for a human to decide whether it was the right
change to make.

## Before you open anything

Run the gate. Not a subset of it, all of it:

```bash
npm run check
```

That is `typecheck → lint → test → build`, in that order, failing fast. If it is
red, the PR does not exist yet.

If a check fails for a reason you genuinely cannot fix, say so explicitly in the
PR body. Never disable, skip, or `--no-verify` your way past it.

## Branch naming

```
feat/short-description     new capability
fix/short-description      something was broken
chore/short-description    deps, config, tooling
docs/short-description     documentation only
```

Never commit directly to `main`.

## Size

**One concern per PR.** The test: can you describe the change in a single
sentence without using "and"?

- "Add channel scraping" — fine.
- "Add channel scraping and refactor auth and update the theme" — three PRs.

If you notice something unrelated that needs fixing, note it in the PR body
under "Spotted, not fixed" rather than fixing it here.

## The PR body

Follow `.github/pull_request_template.md`. It exists because the reviewer's four
questions are fixed:

1. Does the preview URL do the thing?
2. Is this one concern?
3. Did anything change that requires asking first? (schema, auth, billing, new
   paid service — see AGENTS.md §7)
4. Are the docs updated in this same PR?

Write the body so those four answers are visible without opening the diff.

## Docs in the same PR

Not "later". Later never happens, and stale docs are worse than no docs because
the next agent trusts them.

- Schema changed → `docs/data-model.md` and `src/lib/supabase/types.ts`
- An irreversible call was made → a new file in `docs/decisions/`
- A new trap was discovered → add it to AGENTS.md §6

## After a bug is fixed

Fixing the code is half the job. The other half: what document, test, or lint
rule would have caught this? Add it in the same PR. That is the mechanism that
makes the loop compound instead of just spin.

## Commands

```bash
git checkout -b feat/thing
npm run check
git add -A && git commit -m "Add the thing"
git push -u origin feat/thing
gh pr create --fill
```
