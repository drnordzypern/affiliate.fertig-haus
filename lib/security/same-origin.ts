/**
 * Minimal same-origin (CSRF) guard for this app's own state-changing BFF
 * routes. Every modern browser attaches an `Origin` header to same-origin
 * `fetch()` requests for non-GET/HEAD methods, not only cross-origin ones —
 * so comparing it against the request's own resolved URL origin is a
 * reliable, config-free defense that needs no separate allowed-origin list
 * and works unchanged on any deployment host. A missing or mismatched
 * Origin header fails closed.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
