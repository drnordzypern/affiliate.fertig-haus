import type { NextConfig } from "next";

/**
 * DNL1-63 / pre-launch access boundary: this repository is private
 * end-to-end — no route here is meant to be indexed, cached by a shared
 * cache, or served identically regardless of cookie. `X-Robots-Tag` and
 * the conservative security headers below are defense-in-depth on top of
 * `robots.txt`, page-level `robots` metadata, and `proxy.ts`'s own
 * per-response headers on the pre-launch gate itself (search/AI/preview
 * crawlers that ignore metadata still see these HTTP headers); applied
 * site-wide deliberately, including to routes not yet built, so a future
 * route can never accidentally ship without them. `/portal` additionally
 * gets `Cache-Control: private, no-store` and `Vary: Cookie` because it is
 * the one route whose response depends on Partner session state.
 *
 * The CSP intentionally allows `'unsafe-inline'` for scripts: this app's
 * pages rely on Next.js's own inline React Server Component hydration
 * payload, and no nonce-based CSP infrastructure exists in this
 * repository yet. This is a known, documented trade-off, not a claim of a
 * strict CSP — it still blocks framing, restricts script/style/connection
 * origins to this app and the Turnstile widget, and blocks arbitrary
 * external resource loading.
 */
const CSP =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; " +
  "font-src 'self'; " +
  "connect-src 'self'; " +
  "frame-src https://challenges.cloudflare.com; " +
  "frame-ancestors 'none'; " +
  "base-uri 'none'; " +
  "form-action 'self'";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive, nosnippet, noimageindex",
          },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
      {
        source: "/portal",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Vary", value: "Cookie" },
        ],
      },
    ];
  },
};

export default nextConfig;
