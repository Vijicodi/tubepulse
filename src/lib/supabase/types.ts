/**
 * Database types.
 *
 * Hand-maintained to match `supabase/migrations/`. When you change the schema,
 * you change this file in the SAME pull request — that rule is in the
 * `supabase-migration` skill, and it is the thing that keeps the agent from
 * writing queries against columns that do not exist.
 *
 * Once you have the Supabase CLI installed you can replace this file with
 * generated output:
 *   supabase gen types typescript --project-id <id> > src/lib/supabase/types.ts
 */

export type JobStatus = "queued" | "running" | "succeeded" | "failed";
export type Platform = "youtube" | "instagram";
/** A YouTube upload, or the two things an Instagram grid holds. */
export type VideoKind = "video" | "reel" | "post";
export type JobKind = "channel_scrape" | "idea_generation" | "transcript";

/**
 * Razorpay's subscription vocabulary, kept verbatim. See migration 0003 for
 * what each one means and why we did not invent friendlier names.
 */
export type SubscriptionStatus =
  | "created"
  | "authenticated"
  | "active"
  | "pending"
  | "halted"
  | "cancelled"
  | "completed"
  | "expired";

export type ChannelRow = {
  id: string;
  owner_id: string;
  project_id: string;
  platform: Platform;
  handle: string;
  channel_url: string;
  title: string | null;
  subscriber_count: number | null;
  thumbnail_url: string | null;
  last_scraped_at: string | null;
  created_at: string;
}

export type VideoRow = {
  id: string;
  channel_id: string;
  video_id: string;
  kind: VideoKind;
  title: string;
  url: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  /**
   * Plays, for anything watchable. NULL for a static Instagram post, which has
   * no view count at all — zero would be a claim that nobody watched something
   * that is not watchable. `like_count` is that kind's metric instead.
   */
  view_count: number | null;
  like_count: number | null;
  comment_count: number | null;
  published_at: string;
  /** view_count / channel median. 1.0 == typical. 3.0 == a 3x outlier. */
  outlier_score: number | null;
  /** Views per day since publication. */
  velocity: number | null;
  created_at: string;
}

export type JobRow = {
  id: string;
  owner_id: string;
  kind: JobKind;
  status: JobStatus;
  project_id: string | null;
  channel_id: string | null;
  /** Apify run id, so a webhook can find the job it belongs to. */
  external_run_id: string | null;
  /** What the job was asked to do. A transcript's video URL lives here. */
  payload: { videoUrl?: string } | null;
  /**
   * What this run consumed — counts, never money. The cost is computed at read
   * time from the rate table in lib/billing/cost.ts, so a stored breakdown can
   * never disagree with current rates. Null on jobs that ran before 0012.
   */
  usage: {
    videosScraped?: number;
    postsScraped?: number;
    pagesEnriched?: number;
    llmTier?: "mini" | "premium";
    llmInputTokens?: number;
    llmOutputTokens?: number;
    audioMinutes?: number;
  } | null;
  /**
   * What the agent did, in order. Recorded for every run and shown only on the
   * tiers that pay for it — see lib/jobs/trail.ts for why the gate is at read
   * time rather than write time.
   */
  trail: { step: string; detail: string; ms: number; error?: string }[] | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export type IdeaRow = {
  id: string;
  owner_id: string;
  channel_id: string;
  project_id: string | null;
  title: string;
  angle: string;
  reasoning: string;
  /** 0-100, how strongly the evidence supports this idea. */
  confidence: number;
  /** video_id values from `videos` that justify this idea. */
  evidence_video_ids: string[];
  /** When this idea was shortlisted. Null means it never was. */
  saved_at: string | null;
  /** The beat sheet: hook, beats with timings, close. Null on older ideas. */
  script: string | null;
  /**
   * Paid-tier extras, nullable because Scout gets neither and a model may omit
   * one. See migration 0011 for why these are jsonb rather than a child table.
   */
  title_variants: string[] | null;
  thumbnail_concepts: { text: string; visual: string }[] | null;
  created_at: string;
}

/** Where a scheduled slot is in its life. See 0014. */
export type CalendarSlotStatus = "planned" | "published" | "dropped";

export type CalendarSlotRow = {
  id: string;
  owner_id: string;
  project_id: string;
  idea_id: string;
  /**
   * A plain calendar date (YYYY-MM-DD), not a timestamp. A calendar answers
   * "what am I making this week", and a timestamptz would show a Tuesday slot
   * as Monday for anyone west of UTC.
   */
  scheduled_for: string;
  status: CalendarSlotStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type TranscriptRow = {
  id: string;
  owner_id: string;
  project_id: string | null;
  /** The YouTube id — the same identifier ideas cite, not our row id. */
  video_id: string;
  video_url: string;
  title: string | null;
  /** BCP-47 where the actor reports one. Null when it does not. */
  language: string | null;
  text: string;
  /** The short LLM pass. Null if summarising failed — the transcript stands alone. */
  summary: string | null;
  word_count: number;
  created_at: string;
}

export type ProjectRow = {
  id: string;
  owner_id: string;
  name: string;
  niche: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingCycleValue = "monthly" | "yearly";
export type PromoKindValue = "percent" | "flat";
export type PromoScopeValue =
  | "subscription"
  | "subscription_yearly"
  | "subscription_monthly"
  | "topup"
  | "both";

/** How many billing cycles the linked Razorpay offer discounts. See 0010, 0013. */
export type PromoDurationValue =
  | "first_cycle_only"
  | "first_two_cycles"
  | "forever";

export type PromoCodeRow = {
  id: string;
  /** Always upper-case; the app upper-cases input before looking it up. */
  code: string;
  kind: PromoKindValue;
  /** Percent (1-100) or cents off, depending on `kind`. */
  value: number;
  scope: PromoScopeValue;
  max_discount_cents: number | null;
  min_amount_cents: number;
  /**
   * The pre-USD columns. Nullable since 0010 and never written any more — they
   * hold the history of codes priced before the currency switch.
   */
  max_discount_paise: number | null;
  min_amount_paise: number | null;
  /** Required for subscription-scoped codes — Razorpay plans are fixed-amount. */
  razorpay_offer_id: string | null;
  /** What the linked offer does. A record of Razorpay's config, not a control. */
  applies_to_cycles: PromoDurationValue;
  /** What the customer pays once the discount stops, in cents. */
  renews_at_cents: number | null;
  /** Percent off per plan key, overriding `value` for that tier. See 0013. */
  tier_percents: Record<string, number> | null;
  /** Razorpay offer id per plan key. Each needs a 2-cycle limit. See 0013. */
  tier_offer_ids: Record<string, string> | null;
  active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  max_redemptions: number | null;
  redemption_count: number;
  repeatable: boolean;
  description: string | null;
  created_at: string;
};

export type PromoRedemptionRow = {
  id: string;
  promo_id: string;
  owner_id: string;
  target: "subscription" | "topup";
  discount_cents: number;
  /** Pre-USD. Nullable since 0010, never written any more. */
  discount_paise: number | null;
  razorpay_reference: string | null;
  created_at: string;
};

export type SubscriptionRow = {
  id: string;
  owner_id: string;
  plan_key: string;
  razorpay_subscription_id: string | null;
  razorpay_customer_id: string | null;
  razorpay_plan_id: string | null;
  status: SubscriptionStatus;
  /** Monthly or yearly. Not derivable from razorpay_plan_id, which is opaque. */
  billing_cycle: BillingCycleValue;
  /** End of the period already paid for. Access survives until this moment. */
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  /** The code used at checkout, if any. Drives the discount countdown. See 0013. */
  promo_code: string | null;
  /** Discounted cycles the promo covered in total. */
  promo_cycles_total: number | null;
  /** Discounted cycles still to come. Decremented as invoices are paid. */
  promo_cycles_remaining: number | null;
  /** Price once the discount stops, frozen at checkout. */
  promo_renews_at_cents: number | null;
  created_at: string;
  updated_at: string;
};

export type ScrapeCreditRow = {
  id: string;
  owner_id: string;
  /** Positive for a purchase, negative for a spend once quotas exist. */
  credits: number;
  /** 'topup_small' | 'topup_large' | 'manual'. */
  source: string;
  razorpay_order_id: string | null;
  /** Unique — this is what makes crediting a paid pack idempotent. */
  razorpay_payment_id: string | null;
  amount_paise: number;
  note: string | null;
  created_at: string;
};

/** The sum of a user's ledger rows. A view, so it is read-only. */
export type ScrapeCreditBalanceRow = {
  owner_id: string;
  balance: number;
};

export type BillingEventRow = {
  /** Razorpay's own event id — the primary key, so a re-delivery collides. */
  id: string;
  event: string;
  owner_id: string | null;
  payload: unknown;
  created_at: string;
};

export type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
};

type Timestamps = "id" | "created_at";

/**
 * The `Relationships` key on each table is required by supabase-js. Without it
 * the generic silently resolves to `never` and every query loses its types —
 * which typechecks as a wall of "Property does not exist on type 'never'".
 */
export type Database = {
  public: {
    Tables: {
      projects: {
        Row: ProjectRow;
        Insert: Omit<ProjectRow, Timestamps | "updated_at"> & {
          id?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<ProjectRow, Timestamps>>;
        Relationships: [];
      };
      subscriptions: {
        Row: SubscriptionRow;
        /**
         * Everything with a database default is optional here. That is not
         * cosmetic: an upsert that reacts to a webhook must be able to leave
         * `cancel_at_period_end` alone, because Razorpay has no such field and
         * writing a default over it would silently un-cancel someone.
         */
        Insert: Omit<
          SubscriptionRow,
          | Timestamps
          | "updated_at"
          | "plan_key"
          | "status"
          | "billing_cycle"
          | "cancel_at_period_end"
          | "cancelled_at"
          // The promo columns follow the same rule as cancel_at_period_end:
          // Razorpay's webhook payload knows nothing about them, so an upsert
          // reacting to one must be able to omit them rather than write nulls
          // over a live discount and reset a customer's countdown.
          | "promo_code"
          | "promo_cycles_total"
          | "promo_cycles_remaining"
          | "promo_renews_at_cents"
        > & {
          id?: string;
          updated_at?: string;
          plan_key?: string;
          status?: SubscriptionStatus;
          billing_cycle?: BillingCycleValue;
          cancel_at_period_end?: boolean;
          cancelled_at?: string | null;
          promo_code?: string | null;
          promo_cycles_total?: number | null;
          promo_cycles_remaining?: number | null;
          promo_renews_at_cents?: number | null;
        };
        Update: Partial<Omit<SubscriptionRow, Timestamps>>;
        Relationships: [];
      };
      promo_codes: {
        Row: PromoCodeRow;
        /**
         * The legacy paise columns and the 0010 additions all have database
         * defaults or are nullable, so none of them belong in a required
         * insert — a new code is written entirely in cents.
         */
        Insert: Omit<
          PromoCodeRow,
          | Timestamps
          | "max_discount_paise"
          | "min_amount_paise"
          | "applies_to_cycles"
          | "renews_at_cents"
        > & {
          id?: string;
          max_discount_paise?: number | null;
          min_amount_paise?: number | null;
          applies_to_cycles?: PromoDurationValue;
          renews_at_cents?: number | null;
        };
        Update: Partial<Omit<PromoCodeRow, Timestamps>>;
        Relationships: [];
      };
      promo_redemptions: {
        Row: PromoRedemptionRow;
        Insert: Omit<
          PromoRedemptionRow,
          Timestamps | "razorpay_reference" | "discount_paise"
        > & {
          id?: string;
          discount_paise?: number | null;
          razorpay_reference?: string | null;
        };
        Update: Partial<Omit<PromoRedemptionRow, Timestamps>>;
        Relationships: [];
      };
      scrape_credits: {
        Row: ScrapeCreditRow;
        Insert: Omit<
          ScrapeCreditRow,
          Timestamps | "razorpay_order_id" | "razorpay_payment_id" | "amount_paise" | "note"
        > & {
          id?: string;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          amount_paise?: number;
          note?: string | null;
        };
        Update: Partial<Omit<ScrapeCreditRow, Timestamps>>;
        Relationships: [];
      };
      billing_events: {
        Row: BillingEventRow;
        Insert: Omit<BillingEventRow, "created_at"> & { created_at?: string };
        Update: Partial<Omit<BillingEventRow, "id" | "created_at">>;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: Omit<ProfileRow, "created_at"> & { created_at?: string };
        Update: Partial<Omit<ProfileRow, "id" | "created_at">>;
        Relationships: [];
      };
      channels: {
        Row: ChannelRow;
        // `platform` has a database default of 'youtube'.
        Insert: Omit<ChannelRow, Timestamps | "platform"> & {
          id?: string;
          platform?: Platform;
        };
        Update: Partial<Omit<ChannelRow, Timestamps>>;
        Relationships: [];
      };
      videos: {
        Row: VideoRow;
        // `kind` has a database default of 'video'.
        Insert: Omit<VideoRow, Timestamps | "kind"> & {
          id?: string;
          kind?: VideoKind;
        };
        Update: Partial<Omit<VideoRow, Timestamps>>;
        Relationships: [];
      };
      jobs: {
        Row: JobRow;
        // `payload` is optional: it has a database default of null and only a
        // transcript job sets it. Requiring it would make every existing
        // insert pass an explicit null for a column it does not use.
        // `payload`, `usage` and `trail` are all optional: each has a database
        // default of null and is written by only some job kinds, or only on
        // completion. Requiring them would make every insert pass explicit
        // nulls for columns it does not use.
        Insert: Omit<
          JobRow,
          Timestamps | "updated_at" | "payload" | "usage" | "trail"
        > & {
          id?: string;
          updated_at?: string;
          payload?: JobRow["payload"];
          usage?: JobRow["usage"];
          trail?: JobRow["trail"];
        };
        Update: Partial<Omit<JobRow, Timestamps>>;
        Relationships: [];
      };
      transcripts: {
        Row: TranscriptRow;
        Insert: Omit<TranscriptRow, Timestamps | "word_count"> & {
          id?: string;
          word_count?: number;
        };
        Update: Partial<Omit<TranscriptRow, Timestamps>>;
        Relationships: [];
      };
      ideas: {
        Row: IdeaRow;
        Insert: Omit<
          IdeaRow,
          Timestamps | "title_variants" | "thumbnail_concepts"
        > & {
          id?: string;
          title_variants?: string[] | null;
          thumbnail_concepts?: { text: string; visual: string }[] | null;
        };
        Update: Partial<Omit<IdeaRow, Timestamps>>;
        Relationships: [];
      };
      calendar_slots: {
        Row: CalendarSlotRow;
        Insert: Omit<
          CalendarSlotRow,
          Timestamps | "updated_at" | "status" | "note"
        > & {
          id?: string;
          updated_at?: string;
          status?: CalendarSlotStatus;
          note?: string | null;
        };
        Update: Partial<Omit<CalendarSlotRow, Timestamps>>;
        Relationships: [];
      };
    };
    Views: {
      scrape_credit_balance: {
        Row: ScrapeCreditBalanceRow;
        Relationships: [];
      };
    };
    Functions: { [_ in never]: never };
    Enums: {
      job_status: JobStatus;
      job_kind: JobKind;
      platform: Platform;
      video_kind: VideoKind;
      subscription_status: SubscriptionStatus;
      billing_cycle: BillingCycleValue;
      promo_kind: PromoKindValue;
      promo_scope: PromoScopeValue;
      promo_duration: PromoDurationValue;
    };
    CompositeTypes: { [_ in never]: never };
  };
}
