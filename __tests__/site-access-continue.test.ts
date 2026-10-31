// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import proxy from "@/proxy";
import { createSiteAccessCookieValue, SITE_ACCESS_COOKIE_NAME } from "@/lib/site-access/cookie";
import { recordSuccess } from "@/lib/site-access/rate-limit";
import { continueTarget, continueUrlFor, isCustomerHandoffPath } from "@/lib/site-access/continue";

// Recorded 2026-10-30 (desktop browser pane and Honor Chrome): unlocking on /r/<code> was accepted (303) and the
// handoff issued its 307 to the customer site, but the gate CSP's form-action 'self' covers the whole redirect chain
// of the password form, so the browser cancelled the cross-origin hop and the gate page stayed visible.

const PASSWORD = "correct-horse-battery-staple";
const SECRET = "s".repeat(32);

function request(path: string, options: { method?: string; cookie?: string; body?: string } = {}) {
  const headers = new Headers();
  if (options.cookie) headers.set("cookie", options.cookie);
  if (options.body) headers.set("content-type", "application/x-www-form-urlencoded");
  return new NextRequest(`http://localhost${path}`, { method: options.method ?? "GET", headers, body: options.body });
}

const unlocked = () => `${SITE_ACCESS_COOKIE_NAME}=${createSiteAccessCookieValue(SECRET)}`;

beforeEach(() => {
  vi.stubEnv("AFFILIATE_SITE_ACCESS_PASSWORD", PASSWORD);
  vi.stubEnv("AFFILIATE_SITE_ACCESS_SECRET", SECRET);
  recordSuccess("unknown");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test("unlocking a customer link continues through the same-origin continue page, not back into /r/", async () => {
  const response = await proxy(
    request("/r/FH-ABC123?qr=fhqr_x&v=1&utm_source=flyer", { method: "POST", body: `password=${PASSWORD}` })
  );
  expect(response.status).toBe(303);
  const location = new URL(response.headers.get("location") ?? "");
  expect(location.origin).toBe("http://localhost");
  expect(location.pathname).toBe("/zugang/weiter");
  expect(location.searchParams.get("ziel")).toBe("/r/FH-ABC123?qr=fhqr_x&v=1&utm_source=flyer");
  expect(response.headers.get("set-cookie")).toContain(SITE_ACCESS_COOKIE_NAME);
});

test("the continue page moves on by a meta refresh to the same-origin link, keeping the gate CSP unchanged", async () => {
  const response = await proxy(
    request(`/zugang/weiter?ziel=${encodeURIComponent("/r/FH-ABC123?qr=fhqr_x&v=1")}`, { cookie: unlocked() })
  );
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain('<meta http-equiv="refresh" content="0; url=/r/FH-ABC123?qr=fhqr_x&amp;v=1">');
  expect(html).toContain('<a href="/r/FH-ABC123?qr=fhqr_x&amp;v=1">Weiter</a>');
  expect(html).not.toContain("<script");
  expect(response.headers.get("content-security-policy")).toContain("form-action 'self'");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-robots-tag")).toContain("noindex");
});

test("the continue page never redirects anywhere but a /r/ link on this origin", async () => {
  for (const ziel of [
    "https://evil.example/r/x",
    "//evil.example/r/x",
    "/\\evil.example",
    "/portal",
    "/einladung#t=abc",
    "/r/",
    "/r/a/b",
    "/r/%0d%0aLocation:x",
    "javascript:alert(1)",
    "",
  ]) {
    const response = await proxy(request(`/zugang/weiter?ziel=${encodeURIComponent(ziel)}`, { cookie: unlocked() }));
    expect(response.status, ziel).toBe(303);
    expect(new URL(response.headers.get("location") ?? "").pathname, ziel).toBe("/");
  }
});

test("the continue page is behind the gate like every other route", async () => {
  const response = await proxy(request(`/zugang/weiter?ziel=${encodeURIComponent("/r/FH-ABC123")}`));
  expect(response.status).toBe(401);
  expect(await response.text()).toContain("Zugang erforderlich");
});

test("unlocking any other page keeps the 303 to itself (so an invitation fragment survives)", async () => {
  const response = await proxy(request("/einladung?x=1", { method: "POST", body: `password=${PASSWORD}` }));
  expect(response.status).toBe(303);
  expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/einladung");
});

test("unlocking on the continue page itself still ends on a valid continue page", async () => {
  const path = `/zugang/weiter?ziel=${encodeURIComponent("/r/FH-ABC123")}`;
  const response = await proxy(request(path, { method: "POST", body: `password=${PASSWORD}` }));
  expect(response.status).toBe(303);
  const location = new URL(response.headers.get("location") ?? "");
  expect(location.pathname).toBe("/zugang/weiter");
  expect(continueTarget(location.searchParams.get("ziel"))).toBe("/r/FH-ABC123");
});

test("helpers: handoff paths and targets", () => {
  expect(isCustomerHandoffPath("/r/FH-ABC123")).toBe(true);
  expect(isCustomerHandoffPath("/r/")).toBe(false);
  expect(isCustomerHandoffPath("/portal")).toBe(false);
  expect(continueUrlFor(new URL("http://localhost/r/X?a=1")).toString()).toBe(
    "http://localhost/zugang/weiter?ziel=%2Fr%2FX%3Fa%3D1"
  );
  expect(continueTarget("/r/X?a=1&b=2")).toBe("/r/X?a=1&b=2");
  expect(continueTarget("/r/X".padEnd(2000, "x"))).toBeNull();
});
