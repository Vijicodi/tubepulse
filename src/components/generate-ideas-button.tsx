"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Idea generation is fast enough (seconds) to be a normal request, so this is a
 * plain button rather than another watched job row. If it ever creeps past ~30
 * seconds, move it behind the jobs pattern instead of raising the timeout.
 */
export function GenerateIdeasButton({
  channelId,
  hasIdeas,
}: {
  channelId: string;
  hasIdeas: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function generate() {
    setLoading(true);
    try {
      const response = await fetch("/api/ideas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId }),
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error ?? "Could not generate ideas.");
        return;
      }

      toast.success(`${data.count} ideas generated.`);
      startTransition(() => router.refresh());
    } catch {
      toast.error("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const busy = loading || isPending;

  return (
    <Button onClick={generate} disabled={busy}>
      {busy ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          Thinking
        </>
      ) : (
        <>
          <Sparkles aria-hidden />
          {hasIdeas ? "Generate more" : "Generate ideas"}
        </>
      )}
    </Button>
  );
}
