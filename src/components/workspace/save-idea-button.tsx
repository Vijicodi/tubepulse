"use client";

import { useFormStatus } from "react-dom";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import { toggleIdeaSaved } from "@/lib/ideas/actions";

/**
 * Shortlist an idea, or take it off the shortlist.
 *
 * A plain form posting to a server action, so it works before any JavaScript
 * has loaded and needs no client state of its own — the row in the database is
 * the state. `useFormStatus` only supplies the pending spinner, which is why
 * this is the one small piece that has to be a client component.
 */
function Submit({ saved }: { saved: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={saved ? "Remove from saved ideas" : "Save this idea"}
      className="text-muted-foreground hover:text-foreground hover:border-border focus-visible:ring-ring inline-flex shrink-0 items-center gap-1.5 rounded-full border border-transparent px-3 py-1.5 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : saved ? (
        <BookmarkCheck className="size-3.5 text-[var(--brand-2)]" aria-hidden />
      ) : (
        <Bookmark className="size-3.5" aria-hidden />
      )}
      {saved ? "Saved" : "Save"}
    </button>
  );
}

export function SaveIdeaButton({ ideaId, saved }: { ideaId: string; saved: boolean }) {
  return (
    <form action={toggleIdeaSaved}>
      <input type="hidden" name="ideaId" value={ideaId} />
      {/* What to become, not what it is — so a double submit cannot toggle twice. */}
      <input type="hidden" name="saved" value={saved ? "false" : "true"} />
      <Submit saved={saved} />
    </form>
  );
}
