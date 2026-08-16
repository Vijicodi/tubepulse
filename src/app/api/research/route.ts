import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { startChannelScrape } from "@/lib/apify/client";
import { InvalidChannelInputError, parseChannelInput } from "@/lib/youtube/channel-url";

/**
 * POST /api/research — start researching a channel.
 *
 * Returns in under a second with a job id. It does NOT wait for the scrape:
 * that takes minutes and the request would time out. The browser subscribes to
 * the job row and the Apify webhook finishes the work later.
 *
 * See `docs/decisions/0002-async-jobs-and-webhooks.md`.
 */

const bodySchema = z.object({
  channel: z.string().min(1, "Enter a channel handle or URL"),
  projectId: z.uuid("Pick a project to research in."),
});

export async function POST(request: Request) {
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to research a channel." }, { status: 401 });
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: body.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  let parsed;
  try {
    parsed = parseChannelInput(body.data.channel);
  } catch (error) {
    if (error instanceof InvalidChannelInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  // RLS means this returns nothing unless the project belongs to this user,
  // so it doubles as the ownership check.
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", body.data.projectId)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  // Upsert the channel so re-researching updates rather than duplicating.
  const { data: channel, error: channelError } = await supabase
    .from("channels")
    .upsert(
      {
        owner_id: user.id,
        project_id: project.id,
        handle: parsed.handle,
        channel_url: parsed.channelUrl,
        title: null,
        subscriber_count: null,
        thumbnail_url: null,
        last_scraped_at: null,
      },
      { onConflict: "project_id,handle" },
    )
    .select()
    .single();

  if (channelError || !channel) {
    return NextResponse.json(
      { error: `Could not save the channel: ${channelError?.message ?? "unknown error"}` },
      { status: 500 },
    );
  }

  // The job row exists BEFORE the scrape starts, so the UI has something to
  // watch even if starting the actor fails.
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      owner_id: user.id,
      kind: "channel_scrape",
      status: "queued",
      project_id: project.id,
      channel_id: channel.id,
      external_run_id: null,
      error: null,
    })
    .select()
    .single();

  if (jobError || !job) {
    return NextResponse.json(
      { error: `Could not queue the job: ${jobError?.message ?? "unknown error"}` },
      { status: 500 },
    );
  }

  try {
    const run = await startChannelScrape({
      channelUrl: parsed.channelUrl,
      jobId: job.id,
    });

    await supabase
      .from("jobs")
      .update({ status: "running", external_run_id: run.runId })
      .eq("id", job.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start the scrape.";
    await supabase.from("jobs").update({ status: "failed", error: message }).eq("id", job.id);

    return NextResponse.json({ error: message, jobId: job.id }, { status: 502 });
  }

  // 202: accepted, not finished.
  return NextResponse.json(
    { jobId: job.id, channelId: channel.id, handle: parsed.handle },
    { status: 202 },
  );
}
