import {
  BILLABLE_JOB_KINDS,
  computeQuota,
  periodEndFor,
  periodStartFor,
  type Quota,
} from "@/lib/billing/quota";
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient, getUser } from "@/lib/supabase/server";
import type { PayPalSubscription } from "@/lib/paypal/client";
import type {
  Database,
  JobKind,
  ScrapeCreditRow,
  SubscriptionRow,
  SubscriptionStatus,
} from "@/lib/supabase/types";
import { toSubscriptionStatus, type RazorpaySubscription } from "@/lib/razorpay/schemas";
import { toPaidPlanKey, type BillingCycle, type PaidPlanKey } from "./plans";
import { billingStateFrom, FREE_STATE, type BillingState } from "./status";

/**
 * The one place a subscription row is written.
 *
 * Three callers reach the same state change — the Razorpay webhook, the polling
 * fallback at /api/billing/sync, and the cancel route — and they must agree.
 * The Apify ingest learned this the hard way: a second inlined copy diverged and
 * only reproduced on one machine. So: one module, imported everywhere.
 *
 * EVERY WRITE IN HERE USES THE SERVICE-ROLE CLIENT, and that is not a shortcut.
 * `subscriptions` and `scrape_credits` deliberately have a select policy and no
 * insert, update or delete policy at all — if a browser's own credentials could
 * write them, a user could grant themselves Pro with one request. So the tables
 * are unwritable by design and this module is the only door, reached only after
 * a Razorpay signature has been verified or Razorpay's own API has confirmed the
 * payment.
 *
 * This is the exception the AGENTS.md rule names, not a hole in it. Reaching for
 * the admin client anywhere else still means an RLS policy is missing.
 *
 * Reads are the opposite: they use the caller's session so RLS decides what is
 * visible, which is why a user can only ever see their own row.
 */

type Client = SupabaseClient<Database>;

/** How a spend reads on a receipt. "scrape" for an idea run is a support ticket. */
const SPEND_LABELS: Record<JobKind, string> = {
  channel_scrape: "Scrape",
  idea_generation: "Idea generation",
  transcript: "Transcript",
};

/** The service-role client. See the note above for why writes need it. */
function writeClient(): Client {
  return createAdminClient();
}

/**
 * Which TubePulse user a Razorpay subscription belongs to.
 *
 * Preference order matters. `notes.owner_id` is stamped by us at creation and
 * is authoritative. The lookup by subscription id is the fallback for rows
 * created before the note existed, or by hand in the dashboard.
 */
export async function resolveOwnerId(
  subscription: RazorpaySubscription,
): Promise<string | null> {
  const fromNotes = subscription.notes?.owner_id;
  if (typeof fromNotes === "string" && fromNotes !== "") return fromNotes;

  // Service role: a webhook has no session, and the lookup must find the row
  // whoever it belongs to.
  const { data } = await writeClient()
    .from("subscriptions")
    .select("owner_id")
    .eq("razorpay_subscription_id", subscription.id)
    .maybeSingle();

  return data?.owner_id ?? null;
}

/**
 * Write what Razorpay says onto the user's row.
 *
 * Idempotent by construction: an upsert keyed on owner_id, so a re-delivered
 * webhook and a poll that arrived first produce exactly the same row.
 *
 * NOTE ON `cancel_at_period_end`. Razorpay's subscription object has no field
 * for it — the subscription simply stays `active` until the cycle ends. So that
 * flag is ours, set by the cancel route and deliberately NOT overwritten here.
 * Only a status of `cancelled`, `completed` or `expired` clears it, because at
 * that point the cancellation has actually happened and "cancelling soon" would
 * be a stale sentence on the billing page.
 */
export async function recordSubscription(
  ownerId: string,
  subscription: RazorpaySubscription,
  /**
   * Which TIER this is. Passed at checkout, where we know; read back from the
   * subscription's own notes on webhook and sync paths, where we do not.
   * Razorpay's plan id is opaque — mapping it back would mean six env lookups
   * and a wrong answer the moment a plan object is recreated.
   */
  planKey?: PaidPlanKey,
  /**
   * Which cycle this is. Same story as the tier: known at checkout, recovered
   * from the notes elsewhere. Without one of those the billing page could never
   * say "renews yearly".
   */
  cycle?: BillingCycle,
  /**
   * The discount attached at checkout, when there was one.
   *
   * Known ONLY on the checkout path. Webhooks and sync carry no promo data, so
   * this is spread in conditionally like `plan_key` — writing nulls from a
   * webhook would wipe a live discount and reset the customer's countdown to
   * nothing halfway through their two months.
   */
  promo?: {
    code: string;
    cycles: number;
    renewsAtCents: number | null;
  },
): Promise<void> {
  const status = toSubscriptionStatus(subscription.status);
  const resolvedCycle = cycle ?? cycleFromNotes(subscription);
  const resolvedPlan = planKey ?? planKeyFromNotes(subscription);
  const settled = status === "cancelled" || status === "completed" || status === "expired";

  const { error } = await writeClient().from("subscriptions").upsert(
    {
      owner_id: ownerId,
      /*
       * Claim the row for Razorpay, and DROP any PayPal ids on it.
       *
       * The upsert keys on owner_id, so one person has exactly one row and
       * whichever provider they last touched overwrites it. Writing only our
       * own ids left the other provider's behind: a real row here ended up
       * `provider: paypal` while still carrying `razorpay_subscription_id`,
       * which made the billing page ask whether PAYPAL was configured and
       * report five PAYPAL_* variables missing on a rupee-only deploy.
       *
       * The 0016 constraint is meant to catch exactly this, but it exempts
       * `status = 'created'` — a row legitimately holds no id between checkout
       * opening and approval — and an abandoned checkout stays at 'created'
       * forever. That is the gap this closes.
       */
      provider: "razorpay",
      paypal_subscription_id: null,
      paypal_plan_id: null,
      paypal_payer_id: null,
      // Only write the tier when it is actually known. Defaulting here would
      // silently move a paying Max customer onto Creator the first time a
      // webhook arrived without its note — the column's own default covers a
      // genuinely new row.
      ...(resolvedPlan ? { plan_key: resolvedPlan } : {}),
      razorpay_subscription_id: subscription.id,
      razorpay_customer_id: subscription.customer_id ?? null,
      razorpay_plan_id: subscription.plan_id ?? null,
      status,
      ...(resolvedCycle ? { billing_cycle: resolvedCycle } : {}),
      current_period_end: subscription.current_end ?? subscription.ended_at ?? null,
      ...(settled
        ? { cancel_at_period_end: false, cancelled_at: subscription.ended_at ?? new Date().toISOString() }
        : {}),
      ...(promo
        ? {
            promo_code: promo.code,
            promo_cycles_total: promo.cycles,
            promo_cycles_remaining: promo.cycles,
            promo_renews_at_cents: promo.renewsAtCents,
          }
        : {}),
    },
    { onConflict: "owner_id" },
  );

  if (error) throw new Error(`Could not record the subscription: ${error.message}`);
}

/**
 * The PayPal half of `recordSubscription`.
 *
 * A SEPARATE FUNCTION rather than a branch inside that one, because almost
 * nothing is shared: different id columns, a different status vocabulary, and
 * no `notes` — PayPal carries our owner id in `custom_id` and nothing else, so
 * the tier and cycle must be passed in rather than recovered from the payload.
 *
 * `provider: "paypal"` is written explicitly on every upsert. The database
 * constraint added in 0016 refuses a row that carries one provider's id while
 * claiming the other, so a mistake here fails at the write instead of producing
 * a subscription that nothing can cancel.
 */
export async function recordPaypalSubscription(
  ownerId: string,
  subscription: PayPalSubscription,
  planKey?: PaidPlanKey,
  cycle?: BillingCycle,
): Promise<void> {
  const status = toPaypalSubscriptionStatus(subscription.status);
  const settled = status === "cancelled" || status === "completed" || status === "expired";

  const { error } = await writeClient().from("subscriptions").upsert(
    {
      owner_id: ownerId,
      // Claim the row for PayPal and drop any Razorpay ids on it — the mirror
      // of the Razorpay path above, and for the same reason: the upsert keys
      // on owner_id, so a switch of provider must not leave the other one's
      // ids behind. See the long note there.
      provider: "paypal",
      razorpay_subscription_id: null,
      razorpay_customer_id: null,
      razorpay_plan_id: null,
      // Same rule as the Razorpay path: only write the tier when it is known.
      // Defaulting would silently move a paying customer onto another plan the
      // first time a webhook arrived without one.
      ...(planKey ? { plan_key: planKey } : {}),
      paypal_subscription_id: subscription.id,
      paypal_plan_id: subscription.plan_id ?? null,
      paypal_payer_id: subscription.subscriber?.payer_id ?? null,
      status,
      ...(cycle ? { billing_cycle: cycle } : {}),
      // PayPal reports the NEXT billing time, which is exactly the moment the
      // paid period ends — the same meaning as Razorpay's `current_end`.
      current_period_end: subscription.billing_info?.next_billing_time ?? null,
      ...(settled
        ? { cancel_at_period_end: false, cancelled_at: new Date().toISOString() }
        : {}),
    },
    { onConflict: "owner_id" },
  );

  if (error) {
    throw new Error(`Could not record the PayPal subscription: ${error.message}`);
  }
}

/**
 * PayPal's subscription status vocabulary, mapped onto ours.
 *
 * PayPal:  APPROVAL_PENDING | APPROVED | ACTIVE | SUSPENDED | CANCELLED | EXPIRED
 * Ours:    created | authenticated | active | halted | cancelled | expired
 *
 * The mapping that matters is SUSPENDED -> halted. A suspended PayPal
 * subscription is one whose payment has failed, which is exactly what Razorpay
 * calls halted, so both providers land on the same status and the same rule.
 *
 * NOTE WHAT `halted` MEANS FOR ACCESS: it is in neither PAYING nor GRACE in
 * `status.ts`, so access STOPS — unlike `cancelled`, which keeps the tier until
 * the paid period ends. That is deliberate and predates PayPal: a cancelled
 * customer has paid for the period they are in, whereas a halted one's payment
 * did not go through, so there is no paid period to honour.
 *
 * APPROVED (authorised but not yet billed) maps to `authenticated`, which is
 * already in the PAYING set, because the mandate exists at that point.
 */
function toPaypalSubscriptionStatus(status: string): SubscriptionStatus {
  switch (status.toUpperCase()) {
    case "APPROVAL_PENDING":
      return "created";
    case "APPROVED":
      return "authenticated";
    case "ACTIVE":
      return "active";
    case "SUSPENDED":
      return "halted";
    case "CANCELLED":
      return "cancelled";
    case "EXPIRED":
      return "expired";
    default:
      // An unrecognised status must not silently grant access.
      return "created";
  }
}

/** The cycle stamped in the subscription's notes at creation, if it is there. */
function cycleFromNotes(subscription: RazorpaySubscription): BillingCycle | null {
  const note = subscription.notes?.billing_cycle;
  return note === "monthly" || note === "yearly" ? note : null;
}

/**
 * The tier stamped in the subscription's notes at creation, if it is there.
 *
 * Returns null rather than a default for anything unrecognised: a subscription
 * created before four-tier pricing carries `plan_key: "pro"`, which is not a
 * plan any more, and guessing which of the four it meant would be inventing a
 * price somebody is being charged.
 */
function planKeyFromNotes(subscription: RazorpaySubscription): PaidPlanKey | null {
  // Notes come back as unknown values — Razorpay will echo whatever was sent.
  const note = subscription.notes?.plan_key;
  return typeof note === "string" ? toPaidPlanKey(note) : null;
}

/** Flag a row as cancelling. Called only after Razorpay confirms the cancel. */
export async function markCancelling(
  ownerId: string,
  endsAt: string | null,
): Promise<void> {
  const { error } = await writeClient()
    .from("subscriptions")
    .update({
      cancel_at_period_end: true,
      cancelled_at: new Date().toISOString(),
      ...(endsAt ? { current_period_end: endsAt } : {}),
    })
    .eq("owner_id", ownerId);

  if (error) throw new Error(`Could not flag the cancellation: ${error.message}`);
}

/**
 * Remember a webhook we have already processed.
 *
 * Returns false if this event id was seen before, which is the caller's cue to
 * stop. Razorpay retries on any non-2xx and can also deliver the same event
 * twice on its own; without this, a `subscription.charged` replay would rewrite
 * a row the user had since cancelled.
 */
export async function claimEvent({
    id,
    event,
    ownerId,
    payload,
}: {
  id: string;
  event: string;
  ownerId: string | null;
  payload: unknown;
}): Promise<boolean> {
  const { error } = await writeClient()
    .from("billing_events")
    .insert({ id, event, owner_id: ownerId, payload });

  // 23505 = unique_violation. Seen before, so this is a replay.
  if (error && error.code === "23505") return false;
  if (error) throw new Error(`Could not record the billing event: ${error.message}`);
  return true;
}

/**
 * Undo a claim whose work then failed, so Razorpay's retry is processed rather
 * than dismissed as a replay. Without this, a claimed event whose row write
 * failed was answered 200 and lost for good.
 */
export async function releaseEvent(id: string): Promise<void> {
  await writeClient().from("billing_events").delete().eq("id", id);
}

/** The signed-in user's subscription row, or null. Respects RLS. */
export async function getSubscriptionRow(): Promise<SubscriptionRow | null> {
  const supabase = await createServerClient();
  const { data } = await supabase.from("subscriptions").select("*").maybeSingle();
  return data ?? null;
}

/** What the billing page and any future quota check should ask. */
export async function getBillingState(): Promise<BillingState> {
  const user = await getUser();
  if (!user) return FREE_STATE;
  return billingStateFrom(await getSubscriptionRow());
}

/**
 * The billing page's state, re-checked with Razorpay when the row is still
 * settling.
 *
 * Only one Razorpay webhook has ever reached production, so a payment can sit
 * as 'created' in our table while Razorpay already says 'active'. Asking
 * Razorpay on load means the customer who just paid sees their plan without
 * having to find a Refresh button. Settled rows (active, cancelled…) are not
 * re-fetched, so a normal visit costs no API call.
 */
export async function getReconciledBillingState(): Promise<BillingState> {
  const user = await getUser();
  if (!user) return FREE_STATE;
  const row = await getSubscriptionRow();
  // An 'active' row past its period end means a renewal (or a halt) never
  // reached us — ask Razorpay, so a paying customer is not locked out by a
  // lost webhook and a lapsed one stops being treated as paid.
  const overdue =
    row?.status === "active" &&
    !!row.current_period_end &&
    new Date(row.current_period_end).getTime() < Date.now();
  const settling = row?.status === "created" || row?.status === "pending" || overdue;

  if (row && settling && row.provider !== "paypal" && row.razorpay_subscription_id) {
    try {
      const { fetchSubscription } = await import("@/lib/razorpay/client");
      await recordSubscription(user.id, await fetchSubscription(row.razorpay_subscription_id));
      return billingStateFrom(await getSubscriptionRow());
    } catch {
      // Razorpay unreachable: show what we have rather than failing the page.
    }
  }
  return billingStateFrom(row);
}

/** How many bought scrapes the signed-in user has left. Respects RLS. */
export async function getCreditBalance(): Promise<number> {
  const user = await getUser();
  if (!user) return 0;

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("scrape_credit_balance")
    .select("balance")
    .maybeSingle();

  return data?.balance ?? 0;
}

/** The signed-in user's purchase history, newest first. */
export async function getCreditHistory(limit = 10): Promise<ScrapeCreditRow[]> {
  const user = await getUser();
  if (!user) return [];

  const supabase = await createServerClient();
  const { data } = await supabase
    .from("scrape_credits")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  return data ?? [];
}

/**
 * Read someone's scrape quota: allowance used, refills left, daily count.
 *
 * Takes a caller-supplied client so the research route can reuse its own
 * request-scoped one, and so this runs under RLS like everything else.
 */
const STALE_IDEA_JOB_MS = 10 * 60 * 1000;
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export async function getQuota(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  ownerId: string,
  now: Date = new Date(),
  /** Leave one job out of the count — the one this request just reserved. */
  options: { excludeJobId?: string } = {},
): Promise<Quota> {
  const { data: row } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();

  const state = billingStateFrom(row ?? null);

  // The allowance is anchored to the day the subscription started, so a late
  // signup does not get two months of scrapes for one payment.
  const subscriptionStart = state.isPaid && row?.created_at ? new Date(row.created_at) : null;
  const periodStart = periodStartFor(now, subscriptionStart);
  const resetsAt = subscriptionStart
    ? periodEndFor(periodStart, new Date(subscriptionStart).getUTCDate())
    : null;

  // The daily cap resets at midnight IST, not UTC (which is 05:30 IST — a
  // customer at 1am was still on "yesterday"). IST has no DST, so a fixed
  // +05:30 offset is exact.
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const startOfToday = new Date(
    Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - IST_OFFSET_MS,
  );

  // A job that never ran is not a job someone should pay for.
  //
  // BOTH BILLABLE KINDS ARE COUNTED, not just scrapes. An idea generation is an
  // OpenAI call plus Firecrawl — real money per press — so it spends from the
  // same pool rather than being free and unbounded. Counting it here rather
  // than inventing a second allowance is what keeps the promise on the pricing
  // page arithmetically true: one number, one pool, and the daily cap applies
  // to both. Adding a third billable job kind means adding it to this list too,
  // or it silently becomes free.
  const countBillableJobs = async (since: Date) => {
    let query = supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId)
      .in("kind", BILLABLE_JOB_KINDS)
      .neq("status", "failed")
      .gte("created_at", since.toISOString());
    if (options.excludeJobId) query = query.neq("id", options.excludeJobId);
    const { count } = await query;
    return count ?? 0;
  };

  // An idea generation is one request that ends within the route's 180s
  // ceiling. One still "running" ten minutes later was killed mid-flight and
  // will never finish — release it so it stops counting against the user.
  await writeClient()
    .from("jobs")
    .update({ status: "failed", error: "Timed out before finishing. Not charged." })
    .eq("owner_id", ownerId)
    .eq("kind", "idea_generation")
    .in("status", ["queued", "running"])
    .lt("created_at", new Date(now.getTime() - STALE_IDEA_JOB_MS).toISOString());

  const [scrapesThisPeriod, scrapesToday, balance] = await Promise.all([
    countBillableJobs(periodStart),
    countBillableJobs(startOfToday),
    supabase.from("scrape_credit_balance").select("balance").maybeSingle(),
  ]);

  return computeQuota({
    planKey: state.planKey,
    scrapesThisPeriod,
    scrapesToday,
    refills: balance.data?.balance ?? 0,
    periodStart,
    resetsAt,
  });
}

/**
 * Spend one bought scrape, as a NEGATIVE ledger row.
 *
 * Called only when the plan allowance is already exhausted — allowance use is
 * counted from `jobs`, so writing a row for it too would double-count. Service
 * role, because `scrape_credits` has no insert policy by design: nothing a
 * browser sends may mint or burn credit.
 */
export async function spendRefill(
  ownerId: string,
  jobId: string,
  /**
   * What the credit was spent on. Only ever appears in the ledger note, but a
   * receipt that says "scrape" for an idea generation is a support ticket.
   */
  kind: JobKind = "channel_scrape",
): Promise<void> {
  const { error } = await writeClient().from("scrape_credits").insert({
    owner_id: ownerId,
    credits: -1,
    source: "scrape",
    razorpay_order_id: null,
    razorpay_payment_id: null,
    amount_paise: 0,
    note: `${SPEND_LABELS[kind]} job ${jobId}`,
  });

  if (error) throw new Error(`Could not record the scrape spend: ${error.message}`);
}


/**
 * One discounted invoice has been paid — count it down.
 *
 * Called ONLY from the `subscription.charged` webhook, and only after that
 * delivery has won its idempotency claim. Razorpay retries aggressively, and a
 * decrement that ran per delivery rather than per claimed event would burn a
 * customer's two discounted months in an afternoon of retries.
 *
 * Floors at zero rather than going negative: the countdown reads `<= 0` as
 * "over", and a negative would render as nonsense on the billing page.
 *
 * Deliberately does NOT clear `promo_code`. Knowing which code somebody used
 * stays useful after the discount ends — for support, and for counting what a
 * launch actually converted.
 */
export async function consumePromoCycle(ownerId: string): Promise<void> {
  const supabase = writeClient();

  const { data } = await supabase
    .from("subscriptions")
    .select("promo_cycles_remaining")
    .eq("owner_id", ownerId)
    .maybeSingle();

  const remaining = data?.promo_cycles_remaining ?? null;
  if (remaining === null || remaining <= 0) return;

  const { error } = await supabase
    .from("subscriptions")
    .update({ promo_cycles_remaining: remaining - 1 })
    .eq("owner_id", ownerId);

  // A failed decrement must not fail the webhook: Razorpay would retry the
  // whole delivery, and the subscription row itself is already correct. The
  // worst case is a countdown one cycle behind, which is visible and harmless
  // next to a retry storm.
  if (error) {
    console.error("[promo] could not decrement the cycle count", error.message);
  }
}

/**
 * Record that a plan switch has started: the NEW subscription waits in
 * switch_subscription_id while the customer keeps the plan they pay for now.
 * If they abandon the popup, nothing about their current plan has changed.
 */
export async function recordPendingSwitch(ownerId: string, subscriptionId: string): Promise<void> {
  // A switch already pending (popup closed, then a different plan picked)
  // must not be forgotten while still live at Razorpay — authorised later
  // from an old tab, it would charge every month with nothing tracking it.
  const { data: current } = await writeClient()
    .from("subscriptions")
    .select("switch_subscription_id")
    .eq("owner_id", ownerId)
    .maybeSingle();
  const previous = current?.switch_subscription_id;
  if (previous && previous !== subscriptionId) {
    const { cancelSubscription } = await import("@/lib/razorpay/client");
    await cancelSubscription(previous, { immediately: true }).catch((error) =>
      // A never-authorised subscription may refuse a cancel; it then simply
      // expires, and the webhook's cancel-stray rule covers a late approval.
      console.warn("[plan switch] could not cancel previous pending switch", previous, error),
    );
  }

  const { error } = await writeClient()
    .from("subscriptions")
    .update({ switch_subscription_id: subscriptionId })
    .eq("owner_id", ownerId);
  if (error) throw new Error(`Could not record the plan switch: ${error.message}`);
}

/**
 * The new plan of a switch has been paid for (Razorpay says authenticated or
 * active). Make it the customer's plan, cancel the old subscription now, and
 * refund the old plan's unused days.
 *
 * Idempotent: the webhook and the sync route can both arrive here. The row is
 * CLAIMED first — switch_subscription_id is cleared only where it still holds
 * this id — so exactly one caller does the cancel and the refund.
 *
 * Returns the refund in paise (0 when there was nothing to refund).
 */
export async function completeSwitch(
  ownerId: string,
  newSubscription: RazorpaySubscription,
): Promise<number> {
  const { data: claimed } = await writeClient()
    .from("subscriptions")
    .update({ switch_subscription_id: null })
    .eq("owner_id", ownerId)
    .eq("switch_subscription_id", newSubscription.id)
    .select("razorpay_subscription_id")
    .maybeSingle();

  if (!claimed) {
    // Someone else completed it already. Just make sure the row is current.
    await recordSubscription(ownerId, newSubscription);
    return 0;
  }

  const oldId = claimed.razorpay_subscription_id;
  let refunded = 0;

  // The new plan becomes the plan FIRST, so a failure below can never leave
  // a paying customer without access. Promo fields belonged to the old
  // subscription's offer and do not carry over.
  await recordSubscription(ownerId, newSubscription);
  await writeClient()
    .from("subscriptions")
    .update({
      cancel_at_period_end: false,
      cancelled_at: null,
      promo_code: null,
      promo_cycles_total: null,
      promo_cycles_remaining: null,
      promo_renews_at_cents: null,
    })
    .eq("owner_id", ownerId);

  if (oldId && oldId !== newSubscription.id) {
    const { cancelSubscription, latestPaidInvoice, refundPayment } = await import(
      "@/lib/razorpay/client"
    );
    const { unusedRefundPaise } = await import("./switch");

    try {
      await cancelSubscription(oldId, { immediately: true });
    } catch (error) {
      // Already cancelled/completed is fine. Anything else is logged loudly:
      // a still-live old mandate could charge again next month.
      console.error("[plan switch] could not cancel old subscription", oldId, error);
    }

    try {
      const invoice = await latestPaidInvoice(oldId);
      if (invoice) {
        const amount = unusedRefundPaise({ ...invoice, now: new Date() });
        if (amount > 0) {
          await refundPayment(invoice.paymentId, amount, {
            reason: "plan switch: unused days",
            owner_id: ownerId,
            replaced_by: newSubscription.id,
          });
          refunded = amount;
        }
      }
    } catch (error) {
      console.error("[plan switch] refund failed — refund manually", oldId, error);
    }
  }

  return refunded;
}

/** The owner's subscription row, read with the service role (webhooks have no session). */
export async function subscriptionRowFor(ownerId: string): Promise<SubscriptionRow | null> {
  const { data } = await writeClient()
    .from("subscriptions")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();
  return data ?? null;
}

/** A switch whose new subscription failed or was abandoned: forget it, keep the current plan. */
export async function clearPendingSwitch(ownerId: string, subscriptionId: string): Promise<void> {
  await writeClient()
    .from("subscriptions")
    .update({ switch_subscription_id: null })
    .eq("owner_id", ownerId)
    .eq("switch_subscription_id", subscriptionId);
}

/**
 * A paid subscription that no row points at (see "cancel-stray" in
 * switch.ts). Cancel it now and refund its last payment IN FULL — the customer
 * is already on another plan, so this one bought them nothing.
 */
export async function cancelStraySubscription(ownerId: string, subscriptionId: string): Promise<void> {
  const { cancelSubscription, fetchSubscription, latestPaidInvoice, refundPayment } = await import(
    "@/lib/razorpay/client"
  );

  // A webhook payload is a snapshot from when the event happened. A late or
  // retried event can describe a plan that has since been cancelled (e.g. the
  // one a switch replaced) as "active". Act only on what Razorpay says NOW.
  const live = await fetchSubscription(subscriptionId).catch(() => null);
  const liveStatus = live ? toSubscriptionStatus(live.status) : null;
  if (liveStatus !== "authenticated" && liveStatus !== "active") return;

  console.error("[billing] stray paid subscription — cancelling and refunding", ownerId, subscriptionId);
  try {
    await cancelSubscription(subscriptionId, { immediately: true });
  } catch (error) {
    console.error("[billing] could not cancel stray subscription", subscriptionId, error);
  }
  try {
    const invoice = await latestPaidInvoice(subscriptionId);
    if (invoice && invoice.amountPaidPaise > 0) {
      await refundPayment(invoice.paymentId, invoice.amountPaidPaise, {
        reason: "stray subscription: not the customer's active plan",
        owner_id: ownerId,
      });
    }
  } catch (error) {
    console.error("[billing] stray subscription refund failed — refund manually", subscriptionId, error);
  }
}
