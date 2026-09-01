"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PLANS } from "@/lib/billing/plans";
import { canUseContentCalendar, nextTierUp } from "@/lib/billing/quota";
import { getBillingState } from "@/lib/billing/store";
import { isValidDateKey } from "@/lib/analytics/calendar";
import { getCurrentProject } from "@/lib/projects/current";
import { createServerClient, getUser } from "@/lib/supabase/server";
import type { CalendarSlotStatus } from "@/lib/supabase/types";

/**
 * Scheduling saved ideas onto dates.
 *
 * ---------------------------------------------------------------------------
 * THE GATE IS HERE, AT THE WRITE, NOT ONLY IN THE UI.
 *
 * Hiding the calendar link from a Creator account is presentation; refusing
 * the insert is enforcement. A server action is a public HTTP endpoint — its
 * id ships in the browser bundle and can be invoked directly — so a check that
 * lives only in a React component is a check that does not exist. Same rule
 * the research, ideas and transcript routes already follow.
 * ---------------------------------------------------------------------------
 * NOTHING HERE SPENDS AN ALLOWANCE, and that is deliberate rather than an
 * oversight. Scheduling calls no API and scrapes nothing — it moves a row the
 * customer already paid to create. So no `jobs` row is written and the kind is
 * absent from BILLABLE_JOB_KINDS. Adding one would charge twice for the same
 * work: once to generate the idea, again to write it on a calendar.
 * ---------------------------------------------------------------------------
 */

export type CalendarFormState = { error: string | null };

const scheduleSchema = z.object({
  ideaId: z.string().uuid("That idea does not look right."),
  scheduledFor: z
    .string()
    .refine(isValidDateKey, "Pick a real date."),
  note: z.string().trim().max(500).optional(),
});

/**
 * The tier check, shared by every action in this file.
 *
 * Returns the refusal message rather than throwing, so a form can render it
 * beside the control the customer just used — and names the tier that would
 * unlock it, because "not available on your plan" without a next step is a
 * dead end.
 */
async function refuseIfNotEntitled(): Promise<string | null> {
  const billing = await getBillingState();
  if (canUseContentCalendar(billing.planKey)) return null;

  const plan = PLANS[billing.planKey];
  const next = nextTierUp(billing.planKey);

  // Walk up to the first tier that actually has it: the tier directly above
  // Scout is Creator, which does not, and pointing someone at an upgrade that
  // would not solve their problem is worse than saying nothing.
  const target =
    next && canUseContentCalendar(next.key)
      ? next
      : (["studio", "agency"] as const)
          .map((key) => PLANS[key])
          .find((candidate) => canUseContentCalendar(candidate.key));

  return target
    ? `The content calendar is on ${target.name} and above. You are on ${plan.name}.`
    : `The content calendar is not available on ${plan.name}.`;
}

/** Put a saved idea on a date. */
export async function scheduleIdea(
  _prev: CalendarFormState,
  formData: FormData,
): Promise<CalendarFormState> {
  const user = await getUser();
  if (!user) redirect("/login");

  const refusal = await refuseIfNotEntitled();
  if (refusal) return { error: refusal };

  const project = await getCurrentProject();
  if (!project) return { error: "Open a project first." };

  const parsed = scheduleSchema.safeParse({
    ideaId: formData.get("ideaId"),
    scheduledFor: formData.get("scheduledFor"),
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const supabase = await createServerClient();

  // Confirm the idea is one this person can actually see. RLS would refuse a
  // foreign id anyway, but the error it returns is a foreign-key violation,
  // which reads as a bug rather than as "that is not yours".
  const { data: idea } = await supabase
    .from("ideas")
    .select("id")
    .eq("id", parsed.data.ideaId)
    .maybeSingle();

  if (!idea) return { error: "That idea could not be found." };

  const { error } = await supabase.from("calendar_slots").insert({
    owner_id: user.id,
    project_id: project.id,
    idea_id: parsed.data.ideaId,
    scheduled_for: parsed.data.scheduledFor,
    note: parsed.data.note ?? null,
  });

  if (error) return { error: `Could not schedule that: ${error.message}` };

  revalidatePath("/calendar");
  revalidatePath("/saved-ideas");
  return { error: null };
}

const moveSchema = z.object({
  slotId: z.string().uuid(),
  scheduledFor: z.string().refine(isValidDateKey, "Pick a real date."),
});

/** Move a slot to a different date. */
export async function moveSlot(
  _prev: CalendarFormState,
  formData: FormData,
): Promise<CalendarFormState> {
  const user = await getUser();
  if (!user) redirect("/login");

  const refusal = await refuseIfNotEntitled();
  if (refusal) return { error: refusal };

  const parsed = moveSchema.safeParse({
    slotId: formData.get("slotId"),
    scheduledFor: formData.get("scheduledFor"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Pick a real date." };
  }

  const supabase = await createServerClient();

  // No owner filter needed — RLS scopes the update to rows this user owns, and
  // adding one here would imply the policy cannot be trusted.
  const { error } = await supabase
    .from("calendar_slots")
    .update({ scheduled_for: parsed.data.scheduledFor })
    .eq("id", parsed.data.slotId);

  if (error) return { error: `Could not move that: ${error.message}` };

  revalidatePath("/calendar");
  return { error: null };
}

const statusSchema = z.object({
  slotId: z.string().uuid(),
  status: z.enum(["planned", "published", "dropped"]),
});

/** Mark a slot published or dropped, or put it back to planned. */
export async function setSlotStatus(
  _prev: CalendarFormState,
  formData: FormData,
): Promise<CalendarFormState> {
  const user = await getUser();
  if (!user) redirect("/login");

  const refusal = await refuseIfNotEntitled();
  if (refusal) return { error: refusal };

  const parsed = statusSchema.safeParse({
    slotId: formData.get("slotId"),
    status: formData.get("status"),
  });

  if (!parsed.success) return { error: "That is not a status." };

  const supabase = await createServerClient();

  const { error } = await supabase
    .from("calendar_slots")
    .update({ status: parsed.data.status as CalendarSlotStatus })
    .eq("id", parsed.data.slotId);

  if (error) return { error: `Could not update that: ${error.message}` };

  revalidatePath("/calendar");
  return { error: null };
}

/** Remove a slot entirely. The idea itself is untouched. */
export async function removeSlot(
  _prev: CalendarFormState,
  formData: FormData,
): Promise<CalendarFormState> {
  const user = await getUser();
  if (!user) redirect("/login");

  const refusal = await refuseIfNotEntitled();
  if (refusal) return { error: refusal };

  const slotId = String(formData.get("slotId") ?? "");
  if (!z.string().uuid().safeParse(slotId).success) {
    return { error: "That slot could not be found." };
  }

  const supabase = await createServerClient();
  const { error } = await supabase.from("calendar_slots").delete().eq("id", slotId);

  if (error) return { error: `Could not remove that: ${error.message}` };

  revalidatePath("/calendar");
  revalidatePath("/saved-ideas");
  return { error: null };
}
