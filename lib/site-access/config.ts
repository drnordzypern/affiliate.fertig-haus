/**
 * Server-only configuration for the temporary, site-wide pre-launch access
 * boundary (see proxy.ts). This module never reads or exposes anything to
 * the browser and never logs either value.
 *
 * Fail-closed by construction: `getSiteAccessConfig()` returns `null` for
 * anything but two present, sufficiently-long values — a missing, empty,
 * or too-short variable is treated identically to a missing one. Callers
 * must never fall back to granting access when this returns `null`.
 */

/** Deliberately generous — this is a shared password, not a per-user secret. */
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 512;

/** HMAC-SHA-256 key material; 32 chars is a conservative floor, not a target. */
const MIN_SECRET_LENGTH = 32;

export type SiteAccessConfig = {
  password: string;
  secret: string;
};

export function getSiteAccessConfig(): SiteAccessConfig | null {
  const password = process.env.AFFILIATE_SITE_ACCESS_PASSWORD;
  const secret = process.env.AFFILIATE_SITE_ACCESS_SECRET;

  if (
    typeof password !== "string" ||
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    return null;
  }

  if (typeof secret !== "string" || secret.length < MIN_SECRET_LENGTH) {
    return null;
  }

  return { password, secret };
}
