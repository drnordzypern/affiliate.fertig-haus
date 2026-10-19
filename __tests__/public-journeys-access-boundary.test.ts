// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
import proxy, { config as proxyConfig } from "@/proxy";
import { createSiteAccessCookieValue, SITE_ACCESS_COOKIE_NAME } from "@/lib/site-access/cookie";
import { recordSuccess } from "@/lib/site-access/rate-limit";

import { POST as directContext } from "@/app/api/applications/direct/context/route";
import { POST as directSubmit } from "@/app/api/applications/direct/route";
import { POST as referredContext } from "@/app/api/applications/referred/[code]/context/route";
import { POST as referredSubmit } from "@/app/api/applications/referred/[code]/route";
import { POST as referralContext } from "@/app/api/referrals/[code]/context/route";
import { POST as referralSubmit } from "@/app/api/referrals/[code]/leads/route";

// The new public routes add NO access: the pre-launch password boundary still
// covers every page and every BFF route, and the six route adapters stay shut
// while their feature flags are unset.
const PASSWORD = "correct-horse-battery-staple";
const SECRET = "s".repeat(32);
const CODE = "FH-recruit_referral-code";

beforeEach(() => {
  vi.stubEnv("AFFILIATE_SITE_ACCESS_PASSWORD", PASSWORD);
  vi.stubEnv("AFFILIATE_SITE_ACCESS_SECRET", SECRET);
  recordSuccess("unknown");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const paths = [
  "/apply",
  `/apply/${CODE}`,
  `/apply/${CODE}?qr=fhqr_public_asset&v=1`,
  `/r/${CODE}`,
  `/r/${CODE}?qr=fhqr_public_asset&v=1&utm_source=newsletter`,
  "/api/applications/direct/context",
  "/api/applications/direct",
  `/api/applications/referred/${CODE}/context`,
  `/api/applications/referred/${CODE}`,
  `/api/referrals/${CODE}/context`,
  `/api/referrals/${CODE}/leads`,
];

describe("pre-launch access boundary", () => {
  test("the matcher covers every new page and route", () => {
    const pattern = new RegExp(`^${proxyConfig.matcher[0] as string}$`);
    for (const path of paths) expect(pattern.test(path.split("?")[0]!)).toBe(true);
  });

  test.each(paths)("%s is denied without the access cookie, and never reaches a route", async (path) => {
    for (const method of ["GET", "POST"]) {
      const request = new NextRequest(`http://localhost${path}`, {
        method,
        headers: { "content-type": "application/json", origin: "http://localhost" },
        ...(method === "POST" ? { body: "{}" } : {}),
      });
      const response = await proxy(request);
      // pages answer the gate (401 HTML or a 400/401 from the password form), API paths a bare 401
      expect([400, 401, 429, 503]).toContain(response.status);
      expect(response.headers.get("x-middleware-next")).toBeNull();
    }
  });

  test.each(paths)("%s passes the boundary only with a valid access cookie", async (path) => {
    const cookie = `${SITE_ACCESS_COOKIE_NAME}=${createSiteAccessCookieValue(SECRET)}`;
    const response = await proxy(new NextRequest(`http://localhost${path}`, { headers: { cookie } }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});

describe("route adapters with the feature flags unset", () => {
  const post = (path: string) =>
    new Request(`https://affiliate.example${path}`, {
      method: "POST",
      headers: { origin: "https://affiliate.example", "content-type": "application/json" },
      body: "{}",
    });
  const params = { params: Promise.resolve({ code: CODE }) };

  test("all six answer 404 and never call SalesChain", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SALESCHAIN_API_BASE_URL", "https://api.saleschain.example");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const responses = await Promise.all([
      directContext(post("/api/applications/direct/context")),
      directSubmit(post("/api/applications/direct")),
      referredContext(post("/x"), params),
      referredSubmit(post("/x"), params),
      referralContext(post("/x"), params),
      referralSubmit(post("/x"), params),
    ]);
    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404, 404, 404]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
