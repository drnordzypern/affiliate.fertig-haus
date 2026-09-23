/**
 * Best-effort, in-memory brute-force mitigation for the pre-launch
 * password boundary — the only kind of rate limiting this repository can
 * honestly build today.
 *
 * This is NOT globally durable. This repository has no database, cache,
 * or other shared-state layer by design (see docs/architecture.md), and
 * none should be added solely for this. On Vercel, serverless/edge
 * function instances do not share memory across instances, regions, or
 * cold starts, so this `Map` only bounds attempts within a single warm
 * instance's lifetime — an attacker spreading requests across many
 * instances is not fully stopped by this alone. Real, durable protection
 * requires an infrastructure-level control: see docs/architecture.md,
 * "Rate limiting" for the recommendation to enable Vercel Firewall or
 * native Deployment Protection.
 */

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000;

type Entry = { count: number; windowStart: number };

const attempts = new Map<string, Entry>();

function currentEntry(key: string, now: number): Entry | undefined {
  const entry = attempts.get(key);
  if (!entry || now - entry.windowStart > WINDOW_MS) return undefined;
  return entry;
}

export function isRateLimited(key: string, now: number = Date.now()): boolean {
  const entry = currentEntry(key, now);
  return entry !== undefined && entry.count >= MAX_ATTEMPTS;
}

export function recordFailedAttempt(key: string, now: number = Date.now()): void {
  const entry = currentEntry(key, now);
  if (!entry) {
    attempts.set(key, { count: 1, windowStart: now });
    return;
  }
  entry.count += 1;
}

export function recordSuccess(key: string): void {
  attempts.delete(key);
}
