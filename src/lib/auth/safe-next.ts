/**
 * Only ever redirect within this app — never to a URL an attacker supplied.
 *
 * A prefix check (`startsWith("/") && !startsWith("//")`) is not enough:
 * browsers treat a backslash as a slash, so `/\example.com` — or its encoded
 * form `/%5Cexample.com`, which arrives decoded — is a protocol-relative URL
 * to another site. That got through on 2026-10-04. So the path is resolved
 * the way a browser would, and kept only if it is still on our own origin.
 */
const BASE = "https://tube-pulse.invalid";
const FALLBACK = "/projects";

export function safeNext(next: string, fallback: string = FALLBACK): string {
  let decoded = next;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return fallback;
  }
  // Backslashes and control characters (tab, newline) are how browsers get
  // talked into leaving the origin; nothing legitimate here uses them.
  if (!next.startsWith("/") || /[\\\u0000-\u001f]/.test(decoded) || decoded.startsWith("//")) {
    return fallback;
  }
  try {
    const url = new URL(next, BASE);
    return url.origin === BASE ? next : fallback;
  } catch {
    return fallback;
  }
}
