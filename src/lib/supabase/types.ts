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
  created_at: string;
}

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
export type PromoScopeValue = "subscription" | "topup" | "both";

export type PromoCodeRow = {
  id: string;
  /** Always upper-case; the app upper-cases input before looking it up. */
  code: string;
  kind: PromoKindValue;
  /** Percent (1-100) or paise off, depending on `kind`. */
  value: number;
  scope: PromoScopeValue;
  max_discount_paise: number | null;
  min_amount_paise: number;
  /** Required for subscription-scoped codes — Razorpay plans are fixed-amount. */
  razorpay_offer_id: string | null;
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
  discount_paise: number;
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
        > & {
          id?: string;
          updated_at?: string;
          plan_key?: string;
          status?: SubscriptionStatus;
          billing_cycle?: BillingCycleValue;
          cancel_at_period_end?: boolean;
          cancelled_at?: string | null;
        };
        Update: Partial<Omit<SubscriptionRow, Timestamps>>;
        Relationships: [];
      };
      promo_codes: {
        Row: PromoCodeRow;
        Insert: Omit<PromoCodeRow, Timestamps> & { id?: string };
        Update: Partial<Omit<PromoCodeRow, Timestamps>>;
        Relationships: [];
      };
      promo_redemptions: {
        Row: PromoRedemptionRow;
        Insert: Omit<PromoRedemptionRow, Timestamps | "razorpay_reference"> & {
          id?: string;
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
        Insert: Omit<JobRow, Timestamps | "updated_at" | "payload"> & {
          id?: string;
          updated_at?: string;
          payload?: JobRow["payload"];
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
        Insert: Omit<IdeaRow, Timestamps> & { id?: string };
        Update: Partial<Omit<IdeaRow, Timestamps>>;
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
    };
    CompositeTypes: { [_ in never]: never };
  };
}
