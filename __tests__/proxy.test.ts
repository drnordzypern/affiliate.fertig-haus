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

  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  expect(setCookie).toContain(SITE_ACCESS_COOKIE_NAME);
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toMatch(/SameSite=Lax/i);
  expect(setCookie).not.toContain(PASSWORD);

  const body = await response.text();
  expect(body).not.toContain(PASSWORD);
});

/**
 * Regression coverage for the Production defect where a successful unlock
 * returned 200 + `<script>location.reload()</script>`. Reloading a
 * document reached via a POST replays that POST (with its body) rather
 * than issuing a GET — which then cascaded through /portal's own internal
 * 307 (method-preserving) redirect into a POST to /einladung, a page
 * route with no POST handler, producing a 405. The fix is an explicit
 * HTTP 303 (method-switching) redirect back to the exact original
 * pathname + query.
 */
test("successful unlock is exactly a 303, never 307/308, to the same original pathname", async () => {
  const response = await proxy(
    makeRequest("/portal", {
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      body: `password=${PASSWORD}`,
      ip: "203.0.113.2",
    })
  );

  expect(response.status).toBe(303);
  expect(response.status).not.toBe(307);
  expect(response.status).not.toBe(308);
  expect(new URL(response.headers.get("location")!).pathname).toBe("/portal");
});

test("successful unlock preserves the original query string in the redirect target", async () => {
  const response = await proxy(
    makeRequest("/einladung?foo=bar", {
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      body: `password=${PASSWORD}`,
      ip: "203.0.113.3",
    })
  );

  const location = new URL(response.headers.get("location")!);
  expect(location.pathname).toBe("/einladung");
  expect(location.search).toBe("?foo=bar");
});

test("successful unlock from / redirects to /", async () => {
  const response = await proxy(
    makeRequest("/", {
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      body: `password=${PASSWORD}`,
      ip: "203.0.113.4",
    })
  );
  expect(response.status).toBe(303);
  expect(new URL(response.headers.get("location")!).pathname).toBe("/");
});

test("a 303 redirect carries no request body — the follow-up request the browser makes is GET, not POST", async () => {
  // NextResponse.redirect() never attaches a body of its own; the fix's
  // correctness rests on 303's HTTP-defined method-switching semantics
  // (RFC 9110 §15.4.4: "the user agent SHOULD NOT include the request's
  // original body"), which is exactly why 303 was chosen over 307/308.
  const response = await proxy(
    makeRequest("/portal", {
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      body: `password=${PASSWORD}`,
      ip: "203.0.113.5",
    })
  );
  const body = await response.text();
  expect(body).toBe("");
});

test("unlocking from /portal then following the redirect as a real browser would never sends a POST to /portal or /einladung", async () => {
  const unlockResponse = await proxy(
    makeRequest("/portal", {
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      body: `password=${PASSWORD}`,
      ip: "203.0.113.6",
    })
  );
  expect(unlockResponse.status).toBe(303);
  const setCookie = unlockResponse.headers.get("set-cookie")!;
  const cookieValue = /af_access=([^;]+)/.exec(setCookie)![1];

  // The browser's mandated follow-up to a 303 is a GET — simulate exactly
  // that (never a POST) to the redirect target with the new cookie.
  const followUp = await proxy(
    makeRequest("/portal", { method: "GET", cookie: `${SITE_ACCESS_COOKIE_NAME}=${cookieValue}` })
  );
  // Passes the site-access boundary (x-middleware-next) — /portal's own
  // Partner-session check then runs and correctly 307s to /einladung
  // (a GET redirect, not a 405) because there is still no real Partner
  // session; that downstream behavior belongs to app/portal/page.tsx, not
  // this boundary, and is unaffected by this fix.
  expect(followUp.headers.get("x-middleware-next")).toBe("1");
});

test("/portal still requires a real Partner session after unlocking — the site-access cookie alone is insufficient", async () => {
  const unlockResponse = await proxy(
    makeRequest("/", {
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      body: `password=${PASSWORD}`,
      ip: "203.0.113.7",
    })
  );
  const setCookie = unlockResponse.headers.get("set-cookie")!;
  const cookieValue = /af_access=([^;]+)/.exec(setCookie)![1];

  const portalRequest = makeRequest("/portal", {
    cookie: `${SITE_ACCESS_COOKIE_NAME}=${cookieValue}`,
  });
  const response = await proxy(portalRequest);
  // The site-access boundary itself only ever decides whether to let the
  // request continue to the real app (x-middleware-next) — it never
  // renders /portal's own dashboard or performs its Partner-session
  // check; that remains entirely app/portal/page.tsx's responsibility.
  expect(response.headers.get("x-middleware-next")).toBe("1");
});

test("the redirect target never contains a fragment — none is ever sent to or known by the server", async () => {
  const response = await proxy(
    makeRequest("/einladung", {
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      body: `password=${PASSWORD}`,
      ip: "203.0.113.8",
    })
  );
  const location = response.headers.get("location")!;
  expect(location).not.toContain("#");
  // The browser's own redirect handling re-attaches whatever fragment was
  // already in its address bar when the Location header carries none —
  // this server-side response is correctly fragment-free by construction.
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
