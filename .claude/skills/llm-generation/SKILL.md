---
name: llm-generation
description: Use when changing the idea engine — the prompt, the output schema, the model, the scoring that feeds it, or how ideas are stored. Also use when generated ideas are low quality or the model returns an unusable shape.
---

# The idea engine

Files: `src/lib/ideas/generate.ts` (prompt + call), `src/lib/ideas/score.ts`
(pure scoring), `src/app/api/ideas/route.ts` (orchestration).

## Structured output or it does not ship

The model must return JSON matching `ideasResponseSchema`. Free text cannot be
stored as rows, cannot be ranked, and cannot be cited.

The response is validated with zod. If it is off-shape, that is a **failed job
with a real error** — never a half-written row, never a "best effort" insert.

`safeJsonParse` handles the two things models do despite instructions: wrapping
JSON in code fences, and adding prose around it. Do not delete it.

## Every idea cites its evidence

`evidenceVideoIds` is required, minimum one entry. An idea without evidence is a
guess, and the entire claim of this product is "here is why".

After parsing, citations are filtered against the videos we actually sent:

```ts
const knownIds = new Set(input.outliers.map((v) => v.videoId));
// ...drop any id the model invented, then drop ideas left with no evidence
```

Do not remove this. Models will occasionally cite a plausible-looking id that
does not exist.

## Send outliers, not everything

`selectOutliers` picks up to 12 videos scoring ≥1.5×. Sending all 500 videos is
expensive and *worse*: the signal drowns in noise.

If idea quality drops, the fix is almost always in the selection or the scoring,
not in making the prompt longer.

## Changing the prompt means changing its test

The prompt is code. `buildPrompt` is a pure function and is testable — if you
change it, the test changes in the same commit.

Things the prompt deliberately asks for, do not quietly remove:

- **Honest confidence.** "Be honest; a 40 is more useful than an inflated 90."
  The UI displays low numbers rather than hiding them.
- **Angle, not topic.** "Why X failed" beats "a video about X".
- **No near-duplicates** of videos already in the list — the value is the
  adjacent unmade idea.

## Model

The model is `OPENAI_MODEL` in the environment, not a constant in the code —
provider model names get renamed and deprecated, and that should be a `.env`
edit rather than a deploy. Never scatter model ids through the code.

`response_format: { type: "json_object" }` guarantees valid JSON, **not our
shape**. The zod validation after it is not redundant: a model returning
`{"suggestions": []}` is valid JSON and useless. Never remove that check.

## Cost and time

Idea generation runs in seconds, so it is a normal request/response with
`maxDuration = 60`. If it grows past ~30 seconds, move it behind the jobs table
pattern (`docs/decisions/0002`) rather than raising the timeout.

If you raise the idea count, watch for truncated JSON — a response cut off
mid-object fails validation, which is the correct outcome but an unhelpful
error. Raise the token ceiling alongside it.
