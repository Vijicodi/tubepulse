"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProject, type ProjectFormState } from "@/lib/projects/actions";

const initial: ProjectFormState = { error: null };

export function CreateProjectForm({
  heading = "Create your first project",
  description = "Give your agent a private research workspace to organise competitors and evidence.",
}: {
  heading?: string;
  description?: string;
}) {
  const [state, action] = useActionState(createProject, initial);

  return (
    <div className="surface-raised rounded-2xl p-6">
      <h3 className="text-lg font-semibold tracking-tight">{heading}</h3>
      <p className="text-muted-foreground mt-1.5 text-sm">{description}</p>

      {state.error && (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive mt-4 rounded-lg border px-3 py-2 text-sm"
        >
          {state.error}
        </p>
      )}

      <form action={action} className="mt-5 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="text-xs">
            Project name
          </Label>
          <Input
            id="name"
            name="name"
            required
            maxLength={80}
            placeholder="AI tooling channel"
            className="h-11"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="niche" className="text-xs">
            Niche
          </Label>
          <Input
            id="niche"
            name="niche"
            maxLength={120}
            placeholder="AI coding tools for solo builders"
            className="h-11"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description" className="text-xs">
            Description
          </Label>
          <textarea
            id="description"
            name="description"
            maxLength={600}
            rows={4}
            placeholder="What you want this workspace to figure out."
            className="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/40 w-full resize-y rounded-lg border px-3 py-2.5 text-sm outline-none focus-visible:ring-[3px]"
          />
        </div>

        <SubmitButton />
      </form>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      className="bg-brand-gradient h-11 text-white"
    >
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          Creating
        </>
      ) : (
        <>
          <Plus aria-hidden />
          Create project
        </>
      )}
    </Button>
  );
}
