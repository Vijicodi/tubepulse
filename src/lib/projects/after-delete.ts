/**
 * Which project the workspace should point at after one is deleted.
 *
 * Pure, so the cookie decision is testable without a request. `remaining` is
 * the user's projects AFTER the delete, newest first — the same order
 * `getCurrentProject()` falls back to, so an explicit choice here and the
 * implicit fallback never disagree.
 *
 *   - the deleted one was not current: keep the cookie as it is
 *   - it was current and others remain: the newest remaining one
 *   - it was the last one: null, meaning clear the cookie, and every page
 *     shows its "create a project" state
 */
export function projectAfterDelete({
  deletedId,
  currentId,
  remaining,
}: {
  deletedId: string;
  /** The cookie's value, if any. */
  currentId: string | null;
  remaining: string[];
}): { keep: true } | { keep: false; next: string | null } {
  // No cookie means "newest" already, which the fallback re-resolves; only a
  // cookie naming the deleted row needs changing.
  if (currentId !== deletedId) return { keep: true };

  const next = remaining.find((id) => id !== deletedId) ?? null;
  return { keep: false, next };
}
