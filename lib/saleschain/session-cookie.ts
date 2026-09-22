/**
 * Server-only cookie helpers for the SalesChain Partner session.
 *
 * The cookie holds only the opaque `partnerSessionToken` issued by
 * SalesChain's bootstrap-redemption endpoint. It is never readable from
 * client JavaScript (`httpOnly: true`) and is deliberately given no
 * `domain` attribute (host-only cookie).
 *
 * Important boundary, documented here because there is nowhere else in
 * the codebase to enforce it in code yet: the *presence* of this cookie is
 * not proof of a live, authenticated SalesChain session. SalesChain has no
 * `whoami` endpoint today. A future protected Partner-resource request
 * must still authorize itself against SalesChain using this cookie's
 * bearer token on every call — this module only manages local cookie
 * storage, not session validity.
 */
import type { cookies } from "next/headers";
import { SALESCHAIN_TOKEN_PATTERN } from "./client";

export const PARTNER_SESSION_COOKIE_NAME = "partner_session";
export const PARTNER_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

type CookieStore = Awaited<ReturnType<typeof cookies>>;

function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === "production";
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: isProductionEnvironment(),
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function setPartnerSessionCookie(store: CookieStore, partnerSessionToken: string): void {
  store.set(
    PARTNER_SESSION_COOKIE_NAME,
    partnerSessionToken,
    cookieOptions(PARTNER_SESSION_MAX_AGE_SECONDS)
  );
}

export function clearPartnerSessionCookie(store: CookieStore): void {
  store.set(PARTNER_SESSION_COOKIE_NAME, "", cookieOptions(0));
}

export function getPartnerSessionToken(store: CookieStore): string | undefined {
  const value = store.get(PARTNER_SESSION_COOKIE_NAME)?.value;
  return value && SALESCHAIN_TOKEN_PATTERN.test(value) ? value : undefined;
}
