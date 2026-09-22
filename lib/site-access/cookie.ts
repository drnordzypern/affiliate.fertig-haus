/**
 * Signed access cookie for the temporary, site-wide pre-launch boundary.
 *
 * Deliberately separate from `lib/saleschain/session-cookie.ts` (the real
 * Partner-session cookie): possessing this cookie only means "this browser
 * passed the pre-launch password gate" — it never grants Partner
 * authorization, and `/portal` still independently requires a real,
 * backend-confirmed SalesChain session regardless of this cookie's state.
 *
 * The cookie value is `<base64url payload>.<base64url HMAC-SHA-256
 * signature>`. The payload is `{ v, exp }` only — a fixed schema version
 * and an expiry timestamp. No password, no Partner data, no identifier of
 * any kind. Verification recomputes the signature with
 * `AFFILIATE_SITE_ACCESS_SECRET` and compares it in constant time before
 * ever trusting the payload; a forged, altered, malformed, or expired
 * value fails closed identically.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SITE_ACCESS_COOKIE_NAME = "af_access";
export const SITE_ACCESS_MAX_AGE_SECONDS = 4 * 60 * 60;

const PAYLOAD_VERSION = 1;

type SiteAccessPayload = {
  v: number;
  exp: number;
};

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function createSiteAccessCookieValue(secret: string, now: number = Date.now()): string {
  const payload: SiteAccessPayload = {
    v: PAYLOAD_VERSION,
    exp: now + SITE_ACCESS_MAX_AGE_SECONDS * 1000,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

function isValidPayload(value: unknown): value is SiteAccessPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 2 &&
    (value as Record<string, unknown>).v === PAYLOAD_VERSION &&
    typeof (value as Record<string, unknown>).exp === "number" &&
    Number.isFinite((value as Record<string, unknown>).exp)
  );
}

export function verifySiteAccessCookieValue(
  value: string | undefined,
  secret: string,
  now: number = Date.now()
): boolean {
  if (!value) return false;

  const separatorIndex = value.indexOf(".");
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) return false;

  const encodedPayload = value.slice(0, separatorIndex);
  const signature = value.slice(separatorIndex + 1);

  const expectedSignature = sign(encodedPayload, secret);
  const signatureBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  if (signatureBuffer.length !== expectedBuffer.length) return false;
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) return false;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return false;
  }
  if (!isValidPayload(payload)) return false;

  return payload.exp > now;
}
