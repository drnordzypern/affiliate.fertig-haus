import type { NextConfig } from "next";

/**
 * DNL1-63: this repository is preview/private-adjacent end to end — no
 * route here is meant to be indexed, cached by a shared cache, or served
 * identically regardless of cookie. `X-Robots-Tag` is defense-in-depth on
 * top of `robots.txt` and page-level `robots` metadata (search/AI/preview
 * crawlers that ignore metadata still see this HTTP header); it is applied
 * site-wide deliberately, including to routes not yet built, so a future
 * route can never accidentally ship without it. `/portal` additionally
 * gets `Cache-Control: private, no-store` and `Vary: Cookie` because it is
 * the one route whose response depends on Partner session state.
 */
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
