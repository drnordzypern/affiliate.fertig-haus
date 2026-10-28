// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import proxy from "@/proxy";
import { PUBLIC_BRAND_ASSET_PATHS } from "@/lib/site-access/public-assets";

// The home-screen icon, favicons and manifest are served without the access cookie so iPhone and Android can fetch them
// when the site is added to the home screen. Only those exact paths: everything else stays behind the password.
const EXACT = ["/apple-touch-icon.png", "/favicon.svg", "/favicon-32.png", "/favicon-48.png", "/favicon-192.png", "/favicon-512.png", "/site.webmanifest"];

function req(path: string, method = "GET") {
  return new NextRequest(`http://localhost${path}`, { method });
}

beforeEach(() => {
  vi.stubEnv("AFFILIATE_SITE_ACCESS_PASSWORD", "correct-horse-battery-staple");
  vi.stubEnv("AFFILIATE_SITE_ACCESS_SECRET", "s".repeat(32));
});
afterEach(() => vi.unstubAllEnvs());

test("the allow-list is exactly the agreed files", () => {
  expect([...PUBLIC_BRAND_ASSET_PATHS].sort()).toEqual([...EXACT].sort());
});

test.each(EXACT)("%s is served without the cookie (GET and HEAD), marked noindex", async (path) => {
  for (const method of ["GET", "HEAD"]) {
    const response = await proxy(req(path, method));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("x-middleware-next")).toBe("1");
  }
});

test.each([
  "/apple-touch-icon.png/",
  "/apple-touch-icon.png.bak",
  "/favicon.svg/",
  "/favicon.svg%00",
  "/favicon-64.png",
  "/site.webmanifest.json",
  "/site.webmanifest/",
  "//favicon.svg",
  "/%61pple-touch-icon.png",
  "/brand/fertighaus-vergleich-logo.png",
  "/fonts/inter-latin-400-normal.woff2",
])("%s is still behind the password", async (path) => {
  const response = await proxy(req(path));
  expect(response.status).toBe(401);
  expect(response.headers.get("x-middleware-next")).toBeNull();
});

// A "/fonts/../favicon.svg" request is resolved to "/favicon.svg" by URL parsing before it reaches the proxy: it IS the exempt file.
test.each(["POST", "PUT", "DELETE", "PATCH"])("a %s to an exempt path is not exempt", async (method) => {
  const response = await proxy(req("/favicon.svg", method));
  expect(response.status).not.toBe(200);
});

test("pages and API routes stay protected", async () => {
  for (const path of ["/", "/portal", "/partner-werden", "/einladung", "/so-funktioniert-es"]) expect((await proxy(req(path))).status).toBe(401);
  for (const path of ["/api/partner-invitations/accept", "/api/session/me"]) expect((await proxy(req(path))).status).toBe(401);
});
