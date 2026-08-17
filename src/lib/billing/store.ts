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
import type {
  Database,
  JobKind,
  ScrapeCreditRow,
  SubscriptionRow,
} from "@/lib/supabase/types";
import { toSubscriptionStatus, type RazorpaySubscription } from "@/lib/razorpay/schemas";
import type { BillingCycle, Topup } from "./plans";
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
   * Which cycle this is. Passed at checkout, where we know; read back from the
   * subscription's own notes on webhook and sync paths, where we do not.
   * Razorpay's plan id is opaque, so without one of those two the billing page
   * could never say "renews yearly".
   */
  cycle?: BillingCycle,
): Promise<void> {
  const status = toSubscriptionStatus(subscription.status);
  const resolvedCycle = cycle ?? cycleFromNotes(subscription);
  const settled = status === "cancelled" || status === "completed" || status === "expired";

  const { error } = await writeClient().from("subscriptions").upsert(
    {
      owner_id: ownerId,
      plan_key: "pro",
      razorpay_subscription_id: subscription.id,
      razorpay_customer_id: subscription.customer_id ?? null,
      razorpay_plan_id: subscription.plan_id ?? null,
      status,
      ...(resolvedCycle ? { billing_cycle: resolvedCycle } : {}),
      current_period_end: subscription.current_end ?? subscription.ended_at ?? null,
      ...(settled
        ? { cancel_at_period_end: false, cancelled_at: subscription.ended_at ?? new Date().toISOString() }
        : {}),
    },
    { onConflict: "owner_id" },
  );

  if (error) throw new Error(`Could not record the subscription: ${error.message}`);
}

/** The cycle stamped in the subscription's notes at creation, if it is there. */
function cycleFromNotes(subscription: RazorpaySubscription): BillingCycle | null {
  const note = subscription.notes?.billing_cycle;
  return note === "monthly" || note === "yearly" ? note : null;
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
 * Grant a paid refill pack.
 *
 * IDEMPOTENT BY DATABASE CONSTRAINT, not by checking first. Three paths can
 * learn that the same pack was paid for — the browser handler, the `order.paid`
 * webhook, and a manual sync — and a read-then-write would let two of them
 * interleave and grant the pack twice. Instead all three insert, and the unique
 * index on `razorpay_payment_id` makes the second and third collide.
 *
 * Returns true if this call is the one that actually granted the credits.
 *
 * `amountPaise` is what Razorpay says was charged, stored rather than derived:
 * the catalogue price can change later and a receipt must not change with it.
 */
export async function grantTopupCredits(
  {
    ownerId,
    topup,
    orderId,
    paymentId,
    amountPaise,
  }: {
    ownerId: string;
    topup: Topup;
    orderId: string | null;
    paymentId: string;
    amountPaise: number;
  },
): Promise<boolean> {
  const { error } = await writeClient().from("scrape_credits").insert({
    owner_id: ownerId,
    credits: topup.scrapes,
    source: topup.key,
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    amount_paise: amountPaise,
  });

  // 23505 = unique_violation on razorpay_payment_id. Already granted.
  if (error && error.code === "23505") return false;
  if (error) throw new Error(`Could not grant the refill: ${error.message}`);
  return true;
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
export async function getQuota(
  supabase: Awaited<ReturnType<typeof createServerClient>>,
  ownerId: string,
  now: Date = new Date(),
): Promise<Quota> {
  const { data: row } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();

  const state = billingStateFrom(row ?? null);

  // The allowance is anchored to the day the subscription started, so a late
  // signup does not get two months of scrapes for one payment.
  const subscriptionStart = state.isPro && row?.created_at ? new Date(row.created_at) : null;
  const periodStart = periodStartFor(now, subscriptionStart);
  const resetsAt = subscriptionStart
    ? periodEndFor(periodStart, new Date(subscriptionStart).getUTCDate())
    : null;

  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
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
    const { count } = await supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId)
      .in("kind", BILLABLE_JOB_KINDS)
      .neq("status", "failed")
      .gte("created_at", since.toISOString());
    return count ?? 0;
  };

  const [scrapesThisPeriod, scrapesToday, balance] = await Promise.all([
    countBillableJobs(periodStart),
    countBillableJobs(startOfToday),
    supabase.from("scrape_credit_balance").select("balance").maybeSingle(),
  ]);

  return computeQuota({
    isPro: state.isPro,
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
