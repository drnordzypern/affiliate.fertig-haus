import { expect, test } from "vitest";
import nextConfig from "@/next.config";

/**
 * DNL1-63: X-Robots-Tag must apply site-wide (including to routes not yet
 * built), and /portal must carry Cache-Control: private, no-store plus
 * Vary: Cookie, since its response depends on Partner session state.
 */
test("headers() applies X-Robots-Tag noindex to every route", async () => {
  const rules = await nextConfig.headers!();
  const catchAll = rules.find((rule) => rule.source === "/:path*");

  expect(catchAll).toBeDefined();
  const robotsHeader = catchAll!.headers.find((h) => h.key === "X-Robots-Tag");
  expect(robotsHeader?.value).toBe("noindex, nofollow, noarchive, nosnippet, noimageindex");
});

test("headers() applies conservative security headers to every route", async () => {
  const rules = await nextConfig.headers!();
  const catchAll = rules.find((rule) => rule.source === "/:path*");

  expect(catchAll).toBeDefined();
  const find = (key: string) => catchAll!.headers.find((h) => h.key === key)?.value;

  expect(find("Referrer-Policy")).toBe("no-referrer");
  expect(find("X-Content-Type-Options")).toBe("nosniff");
  expect(find("X-Frame-Options")).toBe("DENY");

  const csp = find("Content-Security-Policy");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("https://challenges.cloudflare.com");
  expect(csp).not.toContain("*");
});

test("headers() applies private, no-store caching and Vary: Cookie to /portal", async () => {
  const rules = await nextConfig.headers!();
  const portalRule = rules.find((rule) => rule.source === "/portal");

  expect(portalRule).toBeDefined();
  const cacheHeader = portalRule!.headers.find((h) => h.key === "Cache-Control");
  const varyHeader = portalRule!.headers.find((h) => h.key === "Vary");
  expect(cacheHeader?.value).toBe("private, no-store");
  expect(varyHeader?.value).toBe("Cookie");
});
