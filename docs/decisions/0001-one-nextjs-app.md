# 0001 — One Next.js app, not a separate frontend and backend

**Status:** accepted, 2026-08-16

## Context

The original sketch had "Frontend" and "Backend" as two boxes. That is the
default mental model, and at a large enough team it is the right one.

## Decision

One Next.js application. Server work happens in Route Handlers
(`src/app/api/**`) and server components, in the same repository and the same
deploy as the UI.

## Why

- **One deploy, one set of environment variables, one auth story.** A split
  would double all three for a project with a single developer.
- **One set of conventions for the agent to learn.** The whole point of the
  repository structure is that an agent can pick up any task; two projects means
  two AGENTS.md files and two ways of doing everything.
- **Type safety across the boundary for free.** The page and the query that
  feeds it share types without a generated client in between.

## What we give up

- Cannot scale the API independently of the UI. Not a real constraint until
  there is meaningful traffic, and Vercel scales functions per-route anyway.
- Cannot swap the frontend framework without touching the backend. We are not
  going to do that.

## When to revisit

If a non-Next consumer appears — a mobile app, a public API for third parties —
extract the `src/lib/` modules behind a real API then. They are already written
as framework-independent functions, which is what makes that extraction cheap.
