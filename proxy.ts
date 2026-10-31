import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSiteAccessConfig } from "@/lib/site-access/config";
import { isPublicBrandAsset } from "@/lib/site-access/public-assets";
import {
  createSiteAccessCookieValue,
  SITE_ACCESS_COOKIE_NAME,
  SITE_ACCESS_MAX_AGE_SECONDS,
  verifySiteAccessCookieValue,
} from "@/lib/site-access/cookie";
import { verifyPassword } from "@/lib/site-access/password";
import { clientRateLimitKey, readSubmittedPassword } from "@/lib/site-access/request";
import { isRateLimited, recordFailedAttempt, recordSuccess } from "@/lib/site-access/rate-limit";
import {
  ACCESS_DENIED_MESSAGE,
  INVALID_REQUEST_MESSAGE,
  RATE_LIMITED_MESSAGE,
  UNAVAILABLE_MESSAGE,
  renderAccessPageHtml,
  renderContinuePageHtml,
} from "@/lib/site-access/page";
import {
  continueTarget,
  continueUrlFor,
  isCustomerHandoffPath,
  UNLOCK_CONTINUE_PARAM,
  UNLOCK_CONTINUE_PATH,
} from "@/lib/site-access/continue";
import {
  htmlGateResponse,
  jsonDenyResponse,
  redirectAfterUnlockResponse,
} from "@/lib/site-access/response";

/**
 * Temporary, site-wide pre-launch access boundary.
 *
 * The entire Affiliate application — every page, every BFF/API route, and
 * every RSC/Flight or framework data request — is private until the
 * complete SalesChain experience is approved for public launch. This runs
 * before any route is rendered (Next.js 16 Proxy, Node.js runtime by
 * default), so a rejection here never touches the real app: no header,
 * footer, navigation, invitation UI, or portal structure is ever part of
 * an unauthorized response. See docs/architecture.md, "Pre-launch site
 * access boundary" for the full design and adversarial test results.
 *
 * This is entirely separate from, and unrelated to, Partner-session
 * authorization: possessing the cookie this boundary issues never grants
 * access to `/portal` — that still requires its own, independent,
 * backend-confirmed SalesChain session check.
 */
export default async function proxy(request: NextRequest): Promise<Response> {
  const { pathname } = request.nextUrl;
  const isApiPath = pathname.startsWith("/api/");

  // Home-screen icon, favicons and manifest: exact paths only (see public-assets.ts). Kept out of search engines.
  if (isPublicBrandAsset(pathname, request.method)) {
    const asset = NextResponse.next();
    asset.headers.set("X-Robots-Tag", "noindex, nofollow");
    return asset;
  }

  const siteAccessConfig = getSiteAccessConfig();
  if (!siteAccessConfig) {
    // Fail closed: with no valid configuration, no password could ever be
    // correct, so every request is denied — the application never falls
    // back to public access because configuration is missing.
    return isApiPath ? jsonDenyResponse(401) : htmlGateResponse(renderAccessPageHtml(UNAVAILABLE_MESSAGE), 503);
  }

  const cookieValue = request.cookies.get(SITE_ACCESS_COOKIE_NAME)?.value;
  const authorized = verifySiteAccessCookieValue(cookieValue, siteAccessConfig.secret);

  if (authorized) {
    if (pathname === UNLOCK_CONTINUE_PATH) {
      const target = continueTarget(request.nextUrl.searchParams.get(UNLOCK_CONTINUE_PARAM));
      return target
        ? htmlGateResponse(renderContinuePageHtml(target), 200)
        : redirectAfterUnlockResponse(new URL("/", request.nextUrl));
    }
    return NextResponse.next();
  }

  if (isApiPath) {
    // Protected API/BFF/data requests never receive the HTML gate, and a
    // POST here is never treated as a password submission — that only
    // ever happens for the page-shaped surface below.
    return jsonDenyResponse(401);
  }

  if (request.method !== "POST") {
    return htmlGateResponse(renderAccessPageHtml(), 401);
  }

  const rateLimitKey = clientRateLimitKey(request);
  if (isRateLimited(rateLimitKey)) {
    return htmlGateResponse(renderAccessPageHtml(RATE_LIMITED_MESSAGE), 429);
  }

  const password = await readSubmittedPassword(request);
  if (password === null) {
    return htmlGateResponse(renderAccessPageHtml(INVALID_REQUEST_MESSAGE), 400);
  }

  if (!verifyPassword(password, siteAccessConfig.password)) {
    recordFailedAttempt(rateLimitKey);
    return htmlGateResponse(renderAccessPageHtml(ACCESS_DENIED_MESSAGE), 401);
  }

  recordSuccess(rateLimitKey);

  // 303, and the exact original pathname + query — never a fragment,
  // which is never sent to the server — so the follow-up request is a
  // plain GET to the same place the user was trying to reach. See
  // redirectAfterUnlockResponse's own doc comment for why this must not
  // be 307/308. A Partner customer link instead continues through the
  // same-origin continue page, so its cross-origin handoff is not part of
  // this form submission's redirect chain (see continue.ts).
  const response = redirectAfterUnlockResponse(
    isCustomerHandoffPath(pathname) ? continueUrlFor(request.nextUrl) : request.nextUrl
  );
  response.cookies.set({
    name: SITE_ACCESS_COOKIE_NAME,
    value: createSiteAccessCookieValue(siteAccessConfig.secret),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SITE_ACCESS_MAX_AGE_SECONDS,
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
