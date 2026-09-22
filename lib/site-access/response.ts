/**
 * Shared response construction for the pre-launch access boundary —
 * every response this boundary produces (the gate page, the success
 * page, and the generic API denial) goes through this module so the
 * privacy/security headers are applied exactly once, consistently.
 */
import { NextResponse } from "next/server";

/**
 * Conservative, pragmatic CSP for the neutral gate/success pages only —
 * they load no external resource and use exactly one inline script (the
 * post-success reload), so `'unsafe-inline'` on `script-src` is scoped to
 * a page with no user-controlled content, not to the real application.
 */
const GATE_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
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
