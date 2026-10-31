/**
 * The same-origin continue step after unlocking a Partner customer link.
 *
 * The gate page's CSP keeps `form-action 'self'`, and browsers apply
 * `form-action` to every redirect that follows a form submission. After a
 * successful unlock on `/r/<code>`, the old `303` back to `/r/<code>` made
 * that page's own cross-origin handoff redirect (to the customer site) part
 * of the password form's redirect chain, so the browser cancelled it
 * silently and the gate page stayed visible. Unlocking a `/r/` path now
 * ends the form submission on this same-origin page instead; its plain
 * meta-refresh navigation is not a form submission, so the handoff runs.
 *
 * Only `/r/<code>` (with its query) is ever accepted as the target, so this
 * can never become an open redirect. Every other path keeps the existing
 * `303` to itself, which also keeps an address-bar fragment (for example an
 * invitation token) that a meta refresh would drop.
 */
export const UNLOCK_CONTINUE_PATH = "/zugang/weiter";
export const UNLOCK_CONTINUE_PARAM = "ziel";

const MAX_TARGET_LENGTH = 1024;
// Referral codes are letters, digits, "-" and "_" (for example FH-2D72...).
const HANDOFF_PATH = /^\/r\/[A-Za-z0-9_-]{1,128}$/;

/** True for a Partner customer link path (`/r/<code>`). */
export function isCustomerHandoffPath(pathname: string): boolean {
  return HANDOFF_PATH.test(pathname);
}

/** The continue URL for an unlocked customer link: same origin, original path and query as `ziel`. */
export function continueUrlFor(original: URL): URL {
  const url = new URL(UNLOCK_CONTINUE_PATH, original);
  url.searchParams.set(UNLOCK_CONTINUE_PARAM, `${original.pathname}${original.search}`);
  return url;
}

/** The validated same-origin `/r/<code>[?query]` target, or null for anything else. */
export function continueTarget(raw: string | null): string | null {
  if (!raw || raw.length > MAX_TARGET_LENGTH || !raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.includes("\\") || raw.includes("#") || /[\u0000-\u001F\u007F]/.test(raw)) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw, "http://same-origin.invalid");
  } catch {
    return null;
  }
  if (parsed.origin !== "http://same-origin.invalid" || !isCustomerHandoffPath(parsed.pathname)) return null;
  return `${parsed.pathname}${parsed.search}`;
}
