/**
 * Can Apify actually call this address?
 *
 * Pure, and in its own file rather than in `client.ts`, because that module is
 * `server-only` and cannot be imported by a test — the same reason
 * `lib/auth/messages.ts` sits apart from `actions.ts`. This rule decides
 * whether a scrape starts at all, so it needs to be testable.
 *
 * Apify validates `requestUrl` when the run is created and REJECTS the entire
 * run for an address it cannot reach; it does not simply skip the webhook. A
 * laptop has no public hostname, so on a dev machine no webhook is registered
 * and the polling fallback at `/api/jobs/[id]/sync` finishes the job instead.
 * See docs/decisions/0002.
 */
export function webhooksCanReachUs(appUrl: string): boolean {
  let host: string;

  try {
    const url = new URL(appUrl);
    // Apify will not call a plain http:// address either.
    if (url.protocol !== "https:") return false;
    host = url.hostname;
  } catch {
    return false;
  }

  return (
    host !== "localhost" &&
    host !== "127.0.0.1" &&
    host !== "0.0.0.0" &&
    host !== "::1" &&
    !host.endsWith(".local") &&
    !host.endsWith(".localhost")
  );
}
