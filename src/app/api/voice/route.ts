import { NextResponse } from "next/server";
import OpenAI from "openai";
import { canUseVoice } from "@/lib/billing/quota";
import { getQuota } from "@/lib/billing/store";
import { serverEnv } from "@/lib/env";
import { createServerClient } from "@/lib/supabase/server";

/**
 * POST /api/voice — turn a short recording into text.
 *
 * Whisper, called from the server so the OpenAI key never reaches a browser.
 * That is the entire reason this route exists rather than the client calling
 * OpenAI directly.
 *
 * ---------------------------------------------------------------------------
 * IT DOES NOT SPEND A RUN, DELIBERATELY.
 *
 * Every other billable action writes a `jobs` row, because that row is the
 * charge — see BILLABLE_JOB_KINDS in quota.ts. Transcribing ten seconds of
 * speech costs about a tenth of a cent, against roughly twenty cents for a
 * research run. Charging a full run for it would mean someone who misspoke a
 * channel name paid the same as someone who researched one, which is the kind
 * of arithmetic a customer notices and resents.
 *
 * So it is free at the point of use and paid for by the plan, which is what the
 * pricing page says: voice is listed as a feature of the paid tiers, not as
 * something that consumes an allowance.
 *
 * WHAT STOPS IT BEING ABUSED is the plan gate plus the size cap below. A paid
 * customer holding the button all day costs a few cents; that is a fair trade
 * against making every mis-speak cost a run.
 * ---------------------------------------------------------------------------
 */

export const runtime = "nodejs";

/**
 * The largest upload accepted.
 *
 * The client caps recordings at 60 seconds, which is well under a megabyte of
 * webm. This is the server's own limit rather than a copy of that one: a client
 * cap is a suggestion, and this endpoint takes a file from anyone signed in.
 */
const MAX_BYTES = 8 * 1024 * 1024;

/** Formats Whisper accepts. Anything else is rejected before it is uploaded. */
const ALLOWED_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
];

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to use voice." }, { status: 401 });
  }

  // VOICE IS A PAID FEATURE, checked here rather than only hidden in the UI.
  // A hidden button is not an access control, and this endpoint costs money
  // per press.
  const quota = await getQuota(supabase, user.id);

  if (!canUseVoice(quota.planKey)) {
    return NextResponse.json(
      { error: "Voice input is on the paid plans." },
      // 402: money fixes this, which is more useful than a bare 403.
      { status: 402 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Send the recording as form data." }, { status: 400 });
  }

  const audio = form.get("audio");

  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "No recording was attached." }, { status: 400 });
  }

  if (audio.size > MAX_BYTES) {
    return NextResponse.json({ error: "That recording is too long." }, { status: 413 });
  }

  if (audio.size === 0) {
    return NextResponse.json({ error: "That recording was empty." }, { status: 400 });
  }

  // The browser sets the type from the recorder, so this is a sanity check
  // rather than a security boundary — but sending a video file to Whisper is a
  // slow way to receive an error.
  if (audio.type !== "" && !ALLOWED_TYPES.some((type) => audio.type.startsWith(type))) {
    return NextResponse.json(
      { error: "That audio format is not supported." },
      { status: 415 },
    );
  }

  try {
    const client = new OpenAI({ apiKey: serverEnv().OPENAI_API_KEY });

    const transcription = await client.audio.transcriptions.create({
      file: audio,
      model: "whisper-1",
      // Nudges Whisper towards the vocabulary it will actually hear. Without
      // it, handles and platform names come back mangled — "at em k b h d" for
      // a channel handle is a transcript nobody can use.
      prompt:
        "The speaker is naming a YouTube channel, an Instagram profile, or a content niche. Handles may start with @.",
      // Plain text: this feeds a text input, and the timestamped verbose format
      // would only have to be flattened again here.
      response_format: "text",
    });

    // With response_format "text" the SDK resolves to a string rather than an
    // object, which is why this is not `transcription.text`.
    const text = typeof transcription === "string" ? transcription : "";

    return NextResponse.json({ text: text.trim() });
  } catch (error) {
    // OpenAI's own description is more useful than anything invented here —
    // "Audio file might be corrupted or unsupported" names the real problem.
    const message =
      error instanceof Error ? error.message : "Could not transcribe that recording.";

    console.error("[voice]", message);

    return NextResponse.json(
      { error: "Could not make out that recording. Try again." },
      { status: 502 },
    );
  }
}
