// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import proxy, { config as proxyConfig } from "@/proxy";
import { createSiteAccessCookieValue, SITE_ACCESS_COOKIE_NAME } from "@/lib/site-access/cookie";
import { recordSuccess } from "@/lib/site-access/rate-limit";

const PASSWORD = "correct-horse-battery-staple";
const SECRET = "s".repeat(32);

function makeRequest(
  path: string,
  options: {
    method?: string;
    cookie?: string;
    body?: string;
    contentType?: string;
    ip?: string;
  } = {}
): NextRequest {
  const headers = new Headers();
  if (options.cookie) headers.set("cookie", options.cookie);
  if (options.contentType) headers.set("content-type", options.contentType);
  if (options.ip) headers.set("x-forwarded-for", options.ip);

  return new NextRequest(`http://localhost${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body,
  });
}

function validCookieHeader() {
  return `${SITE_ACCESS_COOKIE_NAME}=${createSiteAccessCookieValue(SECRET)}`;
}

beforeEach(() => {
  vi.stubEnv("AFFILIATE_SITE_ACCESS_PASSWORD", PASSWORD);
  vi.stubEnv("AFFILIATE_SITE_ACCESS_SECRET", SECRET);
  recordSuccess("203.0.113.1");
  recordSuccess("unknown");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test("matcher excludes static assets and robots.txt, includes everything else", () => {
  const source = proxyConfig.matcher[0] as string;
  const pattern = new RegExp(`^${source}$`);

  expect(pattern.test("/_next/static/chunk.js")).toBe(false);
  expect(pattern.test("/_next/image")).toBe(false);
  expect(pattern.test("/favicon.ico")).toBe(false);
  expect(pattern.test("/robots.txt")).toBe(false);

  expect(pattern.test("/")).toBe(true);
  expect(pattern.test("/portal")).toBe(true);
  expect(pattern.test("/einladung")).toBe(true);
  expect(pattern.test("/api/partner-invitations/accept")).toBe(true);
});

test("no cookie: page request receives only the neutral gate, no app content", async () => {
  const response = await proxy(makeRequest("/"));
  expect(response.status).toBe(401);
  const body = await response.text();
  expect(body).toContain("Zugang erforderlich");
  expect(body).not.toMatch(/Fertig Haus|Partnerportal|Empfehlungslink|Partner werden/);
});

test("no cookie: /partner-werden receives only the neutral gate", async () => {
  const response = await proxy(makeRequest("/partner-werden"));
  const body = await response.text();
  expect(response.status).toBe(401);
  expect(body).not.toMatch(/Bewerbung|Partnertyp/);
});

test("no cookie: /so-funktioniert-es receives only the neutral gate", async () => {
  const response = await proxy(makeRequest("/so-funktioniert-es"));
  const body = await response.text();
  expect(response.status).toBe(401);
  expect(body).not.toMatch(/Lebenszyklus|Provisionsberechtigung/);
});

test("no cookie: /einladung receives only the neutral gate, not the invitation UI", async () => {
  const response = await proxy(makeRequest("/einladung"));
  const body = await response.text();
  expect(response.status).toBe(401);
  expect(body).not.toMatch(/Einladung annehmen|Sicherheitsprüfung/);
});

test("no cookie: /portal receives only the neutral gate, not dashboard structure", async () => {
  const response = await proxy(makeRequest("/portal"));
  const body = await response.text();
  expect(response.status).toBe(401);
  expect(body).not.toMatch(/Empfehlungslink|Bald verfügbar|Nicht verfügbar|Abmelden/);
});

test("no cookie: an unknown/deep link receives only the neutral gate", async () => {
  const response = await proxy(makeRequest("/some/unknown/deep/link"));
  const body = await response.text();
  expect(response.status).toBe(401);
  expect(body).toContain("Zugang erforderlich");
});

test("no cookie: an RSC/Flight-shaped page request cannot bypass", async () => {
  const request = makeRequest("/portal?_rsc=abc");
  request.headers.set("RSC", "1");
  request.headers.set("Next-Router-State-Tree", "%5B%22%22%2C%7B%7D%5D");
  const response = await proxy(request);
  const body = await response.text();
  expect(response.status).toBe(401);
  expect(body).not.toMatch(/Empfehlungslink|Abmelden/);
});

test.each(["Googlebot/2.1", "Bingbot/2.0", "GPTBot/1.0", "ClaudeBot/1.0", "facebookexternalhit/1.1"])(
  "no cookie: crawler User-Agent %s cannot bypass",
  async (userAgent) => {
    const request = makeRequest("/portal");
    request.headers.set("user-agent", userAgent);
    const response = await proxy(request);
    expect(response.status).toBe(401);
    const body = await response.text();
    expect(body).not.toMatch(/Empfehlungslink|Abmelden/);
  }
);

test("no cookie: API/BFF request receives a generic 401 JSON, never the HTML gate", async () => {
  const response = await proxy(makeRequest("/api/partner-invitations/accept", { method: "POST" }));
  expect(response.status).toBe(401);
  expect(response.headers.get("content-type")).toMatch(/application\/json/);
  expect(await response.json()).toEqual({ status: "UNAUTHORIZED" });
});

test("a well-formed but forged cookie fails closed (signed with a different secret)", async () => {
  const forged = createSiteAccessCookieValue("x".repeat(32));
  const response = await proxy(makeRequest("/portal", { cookie: `${SITE_ACCESS_COOKIE_NAME}=${forged}` }));
  expect(response.status).toBe(401);
});

test("a malformed cookie value fails closed", async () => {
  const response = await proxy(
    makeRequest("/portal", { cookie: `${SITE_ACCESS_COOKIE_NAME}=not-a-real-cookie` })
  );
  expect(response.status).toBe(401);
});

test("a valid cookie passes the request through unmodified", async () => {
  const response = await proxy(makeRequest("/portal", { cookie: validCookieHeader() }));
  expect(response.headers.get("x-middleware-next")).toBe("1");
});

test("a valid cookie passes API requests through too", async () => {
  const response = await proxy(
    makeRequest("/api/partner-sessions/logout", { method: "POST", cookie: validCookieHeader() })
  );
  expect(response.headers.get("x-middleware-next")).toBe("1");
});

test("GET with no cookie never processes a body as a password (only POST does)", async () => {
  const response = await proxy(makeRequest("/"));
  expect(response.status).toBe(401);
  const body = await response.text();
  expect(body).toContain("Zugang erforderlich");
});

test("wrong password on the gate form fails with a generic message, no cookie set", async () => {
  const response = await proxy(
    makeRequest("/", {
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      body: "password=wrong-password",
      ip: "203.0.113.1",
    })
  );
  expect(response.status).toBe(401);
  const body = await response.text();
  expect(body).toContain("nicht korrekt");
  expect(response.headers.get("set-cookie")).toBeNull();
});

test("oversized/malformed/extra-field submissions fail safely with a generic message", async () => {
  const response = await proxy(
    makeRequest("/", {
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      body: `password=${PASSWORD}&extra=1`,
      ip: "203.0.113.1",
    })
  );
  expect(response.status).toBe(400);
  const body = await response.text();
  expect(body).toContain("nicht verarbeitet");
  expect(response.headers.get("set-cookie")).toBeNull();
});

test("correct password creates only the signed access cookie, no plaintext anywhere", async () => {
  const response = await proxy(
    makeRequest("/einladung", {
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      body: `password=${PASSWORD}`,
      ip: "203.0.113.1",
    })
  );
  expect(response.status).toBe(200);

  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  expect(setCookie).toContain(SITE_ACCESS_COOKIE_NAME);
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toMatch(/SameSite=Lax/i);
  expect(setCookie).not.toContain(PASSWORD);

  const body = await response.text();
  expect(body).not.toContain(PASSWORD);
  expect(body).toContain("location.reload()");
});

test("repeated wrong passwords eventually rate-limit, with a distinct generic message", async () => {
  const ip = "203.0.113.9";
  let last;
  for (let i = 0; i < 6; i++) {
    last = await proxy(
      makeRequest("/", {
        method: "POST",
        contentType: "application/x-www-form-urlencoded",
        body: "password=wrong",
        ip,
      })
    );
  }
  expect(last!.status).toBe(429);
  const body = await last!.text();
  expect(body).toContain("Zu viele Versuche");
});

test("fails closed when configuration is missing — correct password still cannot succeed", async () => {
  vi.unstubAllEnvs();
  vi.stubEnv("AFFILIATE_SITE_ACCESS_PASSWORD", "");
  vi.stubEnv("AFFILIATE_SITE_ACCESS_SECRET", "");

  const getResponse = await proxy(makeRequest("/"));
  expect(getResponse.status).toBe(503);

  const postResponse = await proxy(
    makeRequest("/", {
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      body: `password=${PASSWORD}`,
      ip: "203.0.113.20",
    })
  );
  expect(postResponse.status).toBe(503);
  expect(postResponse.headers.get("set-cookie")).toBeNull();
});

test("fails closed for API requests too when configuration is missing", async () => {
  vi.unstubAllEnvs();
  vi.stubEnv("AFFILIATE_SITE_ACCESS_PASSWORD", "");
  vi.stubEnv("AFFILIATE_SITE_ACCESS_SECRET", "");

  const response = await proxy(makeRequest("/api/partner-invitations/accept", { method: "POST" }));
  expect(response.status).toBe(401);
});

test("every gate/deny response sets no-store and anti-indexing headers", async () => {
  const response = await proxy(makeRequest("/"));
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
  expect(response.headers.get("x-robots-tag")).toBe(
    "noindex, nofollow, noarchive, nosnippet, noimageindex"
  );
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("x-frame-options")).toBe("DENY");
});
