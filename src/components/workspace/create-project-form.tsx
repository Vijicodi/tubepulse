"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { ArrowUpRight, Loader2, Lock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProject, type ProjectFormState } from "@/lib/projects/actions";
import { PROJECT_NAME_MAX, type ProjectCap } from "@/lib/projects/limit";

const initial: ProjectFormState = { error: null };

export function CreateProjectForm({
  heading = "Create your first project",
  description = "Give your agent a private research workspace to organise competitors and evidence.",
  cap,
}: {
  heading?: string;
  description?: string;
  /**
   * The plan's project cap, read by the page. When it is reached the form is
   * not offered at all: a Scout used to fill it in and only learn on submit.
   */
  cap?: ProjectCap;
}) {
  const [state, action] = useActionState(createProject, initial);

  if (cap?.reached) {
    return (
      <div className="surface-raised flex flex-col items-start gap-3 rounded-2xl p-6">
        <Lock className="text-muted-foreground/60 size-5" aria-hidden />
        <h3 className="text-lg font-semibold tracking-tight">Project limit reached</h3>
        <p className="text-muted-foreground text-sm">{cap.message}</p>
        {cap.upgradeTo && <UpgradeLink planName={cap.upgradeTo} />}
      </div>
    );
  }

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
          {state.upgrade && (
            <>
              {" "}
              <Link href="/billing" className="text-foreground underline underline-offset-4">
                See plans
              </Link>
            </>
          )}
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
            maxLength={PROJECT_NAME_MAX}
            defaultValue={state.values?.name}
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
            defaultValue={state.values?.niche}
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
            defaultValue={state.values?.description}
            placeholder="What you want this workspace to figure out."
            className="border-input bg-transparent dark:bg-input/30 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/40 w-full resize-y rounded-lg border px-3 py-2.5 text-sm outline-none focus-visible:ring-[3px]"
          />
        </div>

        <SubmitButton />
      </form>
    </div>
  );
}

function UpgradeLink({ planName }: { planName: string }) {
  return (
    <Link
      href="/billing"
      className="text-foreground inline-flex items-center gap-1 text-sm underline underline-offset-4"
    >
      See {planName}
      <ArrowUpRight className="size-3.5" aria-hidden />
    </Link>
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
