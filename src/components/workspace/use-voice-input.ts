"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Recording a short spoken request and getting text back.
 *
 * Wraps MediaRecorder, which is the only way to capture audio in a browser, and
 * posts the result to /api/voice for Whisper to transcribe. The API key never
 * touches the browser — that is the whole reason this posts to our own route
 * rather than to OpenAI directly.
 *
 * ---------------------------------------------------------------------------
 * EVERY FAILURE HERE IS SOMEONE'S MICROPHONE, so none of them may throw into a
 * render. The states below are exhaustive on purpose:
 *
 *   unsupported   the browser has no MediaRecorder at all
 *   denied        the person said no to the permission prompt, or has before
 *   idle          ready
 *   recording     capturing
 *   transcribing  uploaded, waiting on Whisper
 *   error         something else went wrong, with a sentence saying what
 *
 * A voice button that silently does nothing is worse than no voice button: the
 * person taps it, waits, and concludes the product is broken. Each state maps
 * to something the UI can actually say.
 * ---------------------------------------------------------------------------
 * IT STOPS THE MICROPHONE TRACKS ON EVERY EXIT PATH. A MediaRecorder that is
 * merely stopped leaves the browser's recording indicator lit, which reads —
 * correctly — as an app still listening to you. `releaseStream` runs on stop,
 * on error, and on unmount.
 */

export type VoiceState =
  | "unsupported"
  | "denied"
  | "idle"
  | "recording"
  | "transcribing"
  | "error";

/**
 * How long a single request may run before it stops itself.
 *
 * Whisper bills per minute, so an open microphone is an open meter. Nobody
 * needs sixty seconds to say a channel name, and a forgotten recording should
 * cost pennies rather than however long a laptop stays open.
 */
const MAX_SECONDS = 60;

/**
 * Whether this browser can record at all, and whether the plan allows it.
 *
 * Returns "unsupported" on the server, where `window` is absent — the button
 * renders nothing until the client says otherwise.
 */
function detectSupport(enabled: boolean): VoiceState {
  if (!enabled) return "unsupported";
  if (typeof window === "undefined") return "unsupported";

  const supported =
    typeof window.MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  return supported ? "idle" : "unsupported";
}

export function useVoiceInput({
  onText,
  enabled = true,
}: {
  /** Called with the transcript once Whisper answers. */
  onText: (text: string) => void;
  /** False on a plan without voice. The hook then reports itself unsupported. */
  enabled?: boolean;
}) {
  /**
   * Feature detection runs ONCE, lazily, on the client's first render.
   *
   * Not in an effect: setting state from an effect costs an extra render and
   * is what the react-hooks rule flags. Not at module scope either — `window`
   * does not exist on the server. A lazy initialiser is the one place this can
   * happen exactly once, on the client, without a second pass.
   *
   * On the server it resolves to "unsupported", which renders nothing, and the
   * client re-resolves it on mount. Rendering nothing then something is not a
   * hydration mismatch here because the button is absent in both trees until
   * the client decides otherwise.
   */
  const [state, setState] = useState<VoiceState>(() => detectSupport(enabled));
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Drop the microphone. Called on every path out of recording. */
  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  // Releasing on unmount matters more than it looks: navigating away mid
  // recording would otherwise leave the browser's microphone indicator lit.
  useEffect(() => releaseStream, [releaseStream]);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setSeconds(0);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // Both "they clicked block" and "a policy blocks it" land here, and the
      // two are indistinguishable from the browser's answer. The message
      // covers both without guessing which.
      setState("denied");
      setError("TubePulse needs microphone access. Allow it in your browser, then try again.");
      return;
    }

    streamRef.current = stream;
    chunksRef.current = [];

    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = async () => {
      releaseStream();

      const audio = new Blob(chunksRef.current, {
        type: recorder.mimeType || "audio/webm",
      });

      // A recording with no audio in it is a tap, not a request. Posting it
      // would spend a Whisper call to be told there were no words.
      if (audio.size < 1024) {
        setState("idle");
        setError("That was too short to hear. Hold the button while you speak.");
        return;
      }

      setState("transcribing");

      try {
        const body = new FormData();
        // The extension matters: Whisper picks its decoder from the filename,
        // and an unlabelled blob is rejected as an unsupported format.
        body.append("audio", audio, `request.${extensionFor(recorder.mimeType)}`);

        const response = await fetch("/api/voice", { method: "POST", body });
        const data = (await response.json()) as { text?: string; error?: string };

        if (!response.ok || typeof data.text !== "string") {
          setState("error");
          setError(data.error ?? "Could not make out that recording.");
          return;
        }

        const text = data.text.trim();
        if (text === "") {
          setState("idle");
          setError("No words came through. Try again a little closer to the mic.");
          return;
        }

        setState("idle");
        onText(text);
      } catch {
        setState("error");
        setError("Could not reach the transcription service.");
      }
    };

    recorder.start();
    setState("recording");

    // The meter, and the ceiling. Both live on the same interval so a
    // recording cannot run past the cap even if the tab is backgrounded.
    tickRef.current = setInterval(() => {
      setSeconds((current) => {
        const next = current + 1;
        if (next >= MAX_SECONDS) stop();
        return next;
      });
    }, 1000);
  }, [onText, releaseStream, stop]);

  return {
    state,
    error,
    seconds,
    maxSeconds: MAX_SECONDS,
    /** True while the microphone is live. */
    recording: state === "recording",
    /** True while waiting on Whisper. */
    busy: state === "transcribing",
    /** False when the browser cannot do this, or the plan does not include it. */
    available: state !== "unsupported",
    start,
    stop,
  };
}

/**
 * The file extension Whisper should see.
 *
 * Browsers disagree about container formats — Chrome and Firefox record webm,
 * Safari records mp4 — and Whisper reads the extension rather than sniffing the
 * bytes. Getting this wrong is a 400 that reads like a corrupt upload.
 */
function extensionFor(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}
