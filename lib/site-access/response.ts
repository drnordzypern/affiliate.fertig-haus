/**
 * Shared response construction for the pre-launch access boundary —
 * every response this boundary produces (the gate page, the post-unlock
 * redirect, and the generic API denial) goes through this module so the
 * privacy/security headers are applied exactly once, consistently.
 */
import { NextResponse } from "next/server";

/**
 * Conservative, pragmatic CSP for the neutral gate page only — it loads
 * no external resource and uses no script at all, so this is stricter
 * than the real application's own CSP (`next.config.ts`), not looser.
 */
const GATE_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

function applyCommonHeaders(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  response.headers.set(
    "X-Robots-Tag",
    "noindex, nofollow, noarchive, nosnippet, noimageindex"
  );
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Content-Security-Policy", GATE_CSP);
  return response;
}

export function htmlGateResponse(html: string, status: number): NextResponse {
  const response = new NextResponse(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
  return applyCommonHeaders(response);
}

export function jsonDenyResponse(status: number): NextResponse {
  const response = NextResponse.json({ status: "UNAUTHORIZED" }, { status });
  return applyCommonHeaders(response);
}

/**
 * The response to a successful password submission: an HTTP `303 See
 * Other` back to the exact URL that was originally requested (pathname +
 * query only — a fragment is never sent to the server and is not part of
 * `url`). `303` is deliberate, not `307`/`308`: those preserve the
 * original request's method, so a POST-triggered reload of a page reached
 * through one would itself be a POST — which is exactly the defect this
 * fixes (a client-side `location.reload()` after a POST replays that POST
 * with its body, cascading into a same-method internal redirect and a
 * `405` on a page route with no POST handler). `303` explicitly switches
 * the follow-up request to GET regardless of the original method, and the
 * browser's own redirect handling re-attaches the current address bar's
 * fragment (never transmitted, never known to this server) once the GET
 * completes — see docs/architecture.md, "Pre-launch site access boundary"
 * for the full explanation.
 */
export function redirectAfterUnlockResponse(url: URL): NextResponse {
  const response = NextResponse.redirect(url, 303);
  return applyCommonHeaders(response);
}
