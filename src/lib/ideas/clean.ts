/**
 * Taking YouTube video ids back out of text meant for a person.
 *
 * They get in because the prompt has to show them: the model is handed
 * `[dQw4w9WgXcQ] "How I ..."` and told to cite that id in evidenceVideoIds, so
 * it cheerfully writes it into the reasoning as well. On screen that is a
 * random string in the middle of a sentence — the single most confusing thing
 * on the Idea lab page, and the reason this file exists.
 *
 * The id is plumbing. The card already lists the evidence underneath as titled,
 * clickable links, which is the readable form of the same fact.
 *
 * Telling the model not to do it helps but does not hold, so the prose is
 * cleaned afterwards too. Its own module because `generate.ts` is `server-only`
 * and a test cannot import it — the same reason `lib/auth/messages.ts` is
 * separate from `actions.ts`.
 */

/** Characters that make up a YouTube id. Ids are not word characters. */
const ID_CHARS = "A-Za-z0-9_-";

/** A bracketed token shaped like a YouTube id — 11 chars of that alphabet. */
const BRACKETED_ID = new RegExp(`\\s*\\[[${ID_CHARS}]{11}\\]`, "g");

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripVideoIds(text: string, knownIds: Iterable<string>): string {
  let out = text;

  for (const id of knownIds) {
    if (id === "") continue;
    const pattern = escapeForRegExp(id);

    // Bracketed or parenthesised, taking the space in front of it too.
    out = out.replace(new RegExp(`\\s*[[(]${pattern}[\\])]`, "g"), "");

    // Bare, but only as a whole token. `\b` is wrong here: ids contain - and _,
    // so a word boundary lands in the middle of one.
    out = out.replace(
      new RegExp(`(^|[^${ID_CHARS}])${pattern}(?![${ID_CHARS}])`, "g"),
      "$1",
    );
  }

  return (
    out
      // An id for a video we never sent, still wearing its brackets.
      .replace(BRACKETED_ID, "")
      // Tidy what the removal leaves behind.
      .replace(/\(\s*\)/g, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/ ([,.;:!?])/g, "$1")
      .trim()
  );
}
