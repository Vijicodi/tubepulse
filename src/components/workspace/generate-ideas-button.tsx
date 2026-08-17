"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Generate ideas for one channel.
 *
 * ONE BUTTON PER CHANNEL, matching the API — which takes a single channelId —
 * and matching Outliers, which is also one section per channel. A score is
 * views against THAT channel's own median, so ideas drawn from it are about
 * that channel too; a single project-wide button would also fan out into one
 * paid OpenAI call per competitor, making the cost of one press unpredictable.
 *
 * A PRESS SPENDS ONE SCRAPE from the allowance, so a regenerate asks first.
 * Not a modal: the button becomes the question in place, which cannot be
 * dismissed by accident and needs no dialog primitive.
 */
export function GenerateIdeasButton({
  channelId,
  channelName,
  hasIdeas,
}: {
  channelId: string;
  channelName: string;
  /** Ideas already exist here, so this press replaces nothing but costs again. */
  hasIdeas: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function generate() {
    setConfirming(false);
    setPending(true);

    try {
      const response = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId }),
      });

      const data = await response.json();

      if (!response.ok) {
        // 402 means buy something, 429 means wait. Telling someone to come back
        // tomorrow when tomorrow brings nothing is the failure this split
        // avoids, so the out-of-scrapes case gets a link and the other does not.
        if (response.status === 402) {
          toast.error(data.error ?? "You are out of scrapes.", {
            action: { label: "Billing", onClick: () => router.push("/billing") },
          });
        } else {
          toast.error(data.error ?? "Could not generate ideas.");
        }
        return;
      }

      toast.success(
        `${data.count} ${data.count === 1 ? "idea" : "ideas"} from ${channelName}.`,
      );
      router.refresh();
    } catch {
      toast.error("Could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (pending) {
    return (
      <Button disabled className="bg-brand-gradient h-9 text-white">
        <Loader2 className="animate-spin" aria-hidden />
        Thinking
      </Button>
    );
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs">Spend one scrape?</span>
        <Button onClick={generate} className="bg-brand-gradient h-9 text-white">
          Yes, generate
        </Button>
        <Button variant="ghost" className="h-9" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button
      onClick={() => (hasIdeas ? setConfirming(true) : generate())}
      className="bg-brand-gradient h-9 text-white"
    >
      <Sparkles aria-hidden />
      {hasIdeas ? "Generate again" : "Generate ideas"}
    </Button>
  );
}

/** The line under the button that says what a press costs. Honest, not hidden. */
export function GenerateCost({ remaining }: { remaining: number }) {
  return (
    <p className="text-muted-foreground text-xs">
      Each generation spends one of your{" "}
      <Link href="/billing" className="underline underline-offset-2">
        {remaining} remaining {remaining === 1 ? "scrape" : "scrapes"}
      </Link>
      .
    </p>
  );
}
