"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DeleteAction = (
  prev: { error: string | null },
  formData: FormData,
) => Promise<{ error: string | null }>;

const INITIAL = { error: null };

/**
 * A small bin icon that turns the card it sits on into the question.
 *
 * The confirm COVERS the card rather than squeezing into its header: the
 * sentence has to say what else goes ("its videos and ideas"), which does not
 * fit beside a title, and covering the card makes it unmistakable which thing
 * is about to be deleted. No dialog primitive — same reasoning as the
 * regenerate confirm in generate-ideas-button.
 *
 * The overlay is positioned against the nearest `relative` ancestor, so the
 * card that holds this must be `relative`.
 *
 * Cancel takes focus when the question opens, so an Enter pressed out of habit
 * backs out instead of deleting.
 */
export function ConfirmDelete({
  action,
  fields,
  label,
  question,
  detail,
  confirmLabel = "Delete",
  className,
}: {
  action: DeleteAction;
  /** Hidden inputs posted with the form, e.g. { channelId }. */
  fields: Record<string, string>;
  /** The trigger's accessible name, e.g. "Remove @nasa". */
  label: string;
  question: string;
  /** What else goes, and what does not come back. */
  detail: string;
  confirmLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState(action, INITIAL);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        // Always visible: a touchscreen has no hover, so a bin that only
        // appears on hover could never be pressed on a phone.
        className={cn(
          "text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 focus-visible:ring-ring inline-flex size-7 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none",
          className,
        )}
      >
        <Trash2 className="size-3.5" aria-hidden />
      </button>

      {open && (
        <div
          role="alertdialog"
          aria-label={question}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !pending) setOpen(false);
          }}
          className="border-destructive/40 bg-card/95 absolute inset-x-0 top-0 z-10 flex min-h-full flex-col gap-3 rounded-xl border p-5 backdrop-blur-sm"
        >
          <div>
            <p className="font-semibold tracking-tight text-pretty">{question}</p>
            <p className="text-muted-foreground mt-1 text-sm text-pretty">{detail}</p>
          </div>

          <form action={submit} className="flex flex-wrap items-center gap-2">
            {Object.entries(fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <Button type="submit" variant="destructive" size="sm" disabled={pending}>
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Trash2 aria-hidden />
              )}
              {pending ? "Deleting" : confirmLabel}
            </Button>
            <Button
              ref={cancelRef}
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </form>

          {state.error && (
            <p className="text-destructive text-xs" role="alert">
              {state.error}
            </p>
          )}
        </div>
      )}
    </>
  );
}
