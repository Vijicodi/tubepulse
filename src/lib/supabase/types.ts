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
export type JobKind = "channel_scrape" | "idea_generation";

export type ChannelRow = {
  id: string;
  owner_id: string;
  project_id: string;
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
  title: string;
  url: string;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  view_count: number;
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
      profiles: {
        Row: ProfileRow;
        Insert: Omit<ProfileRow, "created_at"> & { created_at?: string };
        Update: Partial<Omit<ProfileRow, "id" | "created_at">>;
        Relationships: [];
      };
      channels: {
        Row: ChannelRow;
        Insert: Omit<ChannelRow, Timestamps> & { id?: string };
        Update: Partial<Omit<ChannelRow, Timestamps>>;
        Relationships: [];
      };
      videos: {
        Row: VideoRow;
        Insert: Omit<VideoRow, Timestamps> & { id?: string };
        Update: Partial<Omit<VideoRow, Timestamps>>;
        Relationships: [];
      };
      jobs: {
        Row: JobRow;
        Insert: Omit<JobRow, Timestamps | "updated_at"> & {
          id?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<JobRow, Timestamps>>;
        Relationships: [];
      };
      ideas: {
        Row: IdeaRow;
        Insert: Omit<IdeaRow, Timestamps> & { id?: string };
        Update: Partial<Omit<IdeaRow, Timestamps>>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      job_status: JobStatus;
      job_kind: JobKind;
    };
    CompositeTypes: { [_ in never]: never };
  };
}
