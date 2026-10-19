// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// The registry ships empty (no approved wording); the tests supply wording only
// to exercise the paths that need it. This is a test fixture, never product text.
const consent = vi.hoisted(() => ({ approved: false }));
vi.mock("@/lib/public-journeys/consent", () => ({
  anyApprovedConsent: () => consent.approved,
  approvedConsentText: (_kind: string, version: string) =>
    consent.approved && version === "policy-1"
      ? { paragraphs: ["fixture paragraph"], checkboxLabel: "fixture label" }
      : null,
}));

import {
  customerReferralContext,
  customerReferralSubmit,
  directApplicationContext,
  directApplicationSubmit,
  referredApplicationContext,
  referredApplicationSubmit,
} from "@/lib/public-journeys/handlers";

const ORIGIN = "https://affiliate.example";
const CODE = "FH-recruit_referral-code";
const UUID_A = "10000000-0000-4000-8000-000000000001";
const UUID_B = "20000000-0000-4000-8000-000000000002";
const API = "https://api.saleschain.example";

const upstream = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function request(path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}

const ctxDirect = {
  programme: { slug: "fertig-haus-affiliate-system", name: "Fertig-Haus Affiliate System" },
  brand: { slug: "fertig-haus", name: "Fertig-Haus" },
  consentPolicyVersion: "policy-1",
  notice: "n",
};
const ctxReferred = { ...ctxDirect, attributionCorrelationId: UUID_B };
const ctxReferral = {
  ...ctxReferred,
  products: [{ code: "HAUS-1", name: "Musterhaus", description: null }],
};

const application = (over: Record<string, unknown> = {}) => ({
  name: "Erika Muster",
  email: "erika@example.invalid",
  phone: "+49 170 0000000",
  partnerType: "PRIVATE_REFERRER",
  consentToApply: true,
  idempotencyKey: UUID_A,
  turnstileToken: "token",
  consentPolicyVersion: "policy-1",
  ...over,
});
const lead = (over: Record<string, unknown> = {}) => ({
  firstName: "Erika",
  lastName: "Muster",
  email: "erika@example.invalid",
  productCode: "HAUS-1",
  consentToContact: true,
  attributionCorrelationId: UUID_B,
  turnstileToken: "token",
  consentPolicyVersion: "policy-1",
  ...over,
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SALESCHAIN_API_BASE_URL", API);
  vi.stubEnv("AFFILIATE_PARTNER_APPLICATIONS_ENABLED", "true");
  vi.stubEnv("AFFILIATE_CUSTOMER_REFERRALS_ENABLED", "true");
  consent.approved = true;
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const json = async (response: Response) => (await response.json()) as Record<string, unknown>;

describe("feature-off state", () => {
  const all: [string, () => Promise<Response>][] = [
    ["direct context", () => directApplicationContext(request("/x", {}))],
    ["direct submit", () => directApplicationSubmit(request("/x", application()))],
    ["referred context", () => referredApplicationContext(request("/x", {}), CODE)],
    ["referred submit", () => referredApplicationSubmit(request("/x", application({ attributionCorrelationId: UUID_B })), CODE)],
    ["referral context", () => customerReferralContext(request("/x", {}), CODE)],
    ["referral submit", () => customerReferralSubmit(request("/x", lead()), CODE)],
  ];

  test.each(all)("%s answers 404 and never reaches SalesChain when both gates are closed", async (_name, call) => {
    vi.stubEnv("AFFILIATE_PARTNER_APPLICATIONS_ENABLED", "");
    vi.stubEnv("AFFILIATE_CUSTOMER_REFERRALS_ENABLED", "");
    const response = await call();
    expect(response.status).toBe(404);
    expect(await json(response)).toEqual({ status: "UNAVAILABLE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("opening one journey does not open the other", async () => {
    vi.stubEnv("AFFILIATE_PARTNER_APPLICATIONS_ENABLED", "true");
    vi.stubEnv("AFFILIATE_CUSTOMER_REFERRALS_ENABLED", "");
    expect((await customerReferralContext(request("/x", {}), CODE)).status).toBe(404);
    expect((await customerReferralSubmit(request("/x", lead()), CODE)).status).toBe(404);
    vi.stubEnv("AFFILIATE_PARTNER_APPLICATIONS_ENABLED", "");
    vi.stubEnv("AFFILIATE_CUSTOMER_REFERRALS_ENABLED", "true");
    expect((await directApplicationContext(request("/x", {}))).status).toBe(404);
    expect((await referredApplicationContext(request("/x", {}), CODE)).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("request guards", () => {
  test("cross-origin and origin-less requests are refused before anything else", async () => {
    for (const headers of [{ origin: "https://evil.example" }, { origin: "" }]) {
      const req = new Request(`${ORIGIN}/x`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: "{}" });
      expect((await directApplicationContext(req)).status).toBe(403);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("wrong content type, bad JSON, oversize and unknown fields are 400", async () => {
    expect((await directApplicationSubmit(request("/x", "{}", { "content-type": "text/plain" }))).status).toBe(400);
    expect((await directApplicationSubmit(request("/x", "{not json"))).status).toBe(400);
    expect((await directApplicationSubmit(request("/x", application({ message: "m".repeat(13_000) })))).status).toBe(400);
    expect((await directApplicationSubmit(request("/x", application({ admin: true })))).status).toBe(400);
    expect((await directApplicationSubmit(request("/x"))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a malformed referral code is indistinguishable from an unknown one (404, no upstream call)", async () => {
    for (const code of ["short", "FH-code/../x....................", "x".repeat(100)]) {
      expect((await referredApplicationContext(request("/x", {}), code)).status).toBe(404);
      expect((await customerReferralContext(request("/x", {}), code)).status).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("responses are never cacheable or indexable", async () => {
    fetchMock.mockResolvedValue(upstream(ctxDirect));
    const response = await directApplicationContext(request("/x", {}));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
  });
});

describe("context", () => {
  test("direct: names, consent state and no ids", async () => {
    fetchMock.mockResolvedValue(upstream(ctxDirect));
    const response = await directApplicationContext(request("/x", {}));
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      status: "OK",
      programmeName: "Fertig-Haus Affiliate System",
      brandName: "Fertig-Haus",
      consent: { version: "policy-1", text: { paragraphs: ["fixture paragraph"], checkboxLabel: "fixture label" } },
    });
    expect(fetchMock.mock.calls[0]![0]).toBe(`${API}/v1/public/partner-applications/direct`);
  });

  test("while NO wording is approved, no context is requested from SalesChain at all", async () => {
    consent.approved = false;
    for (const call of [
      () => directApplicationContext(request("/x", {})),
      () => referredApplicationContext(request("/x", {}), CODE),
      () => customerReferralContext(request("/x", {}), CODE),
    ]) {
      const response = await call();
      expect(response.status).toBe(200);
      expect(await json(response)).toEqual({ status: "OK", consent: { version: null, text: null } });
    }
    // an attribution session is only ever created for a form that can actually be used
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("consent text is null for a policy version without approved wording", async () => {
    fetchMock.mockResolvedValue(upstream({ ...ctxDirect, consentPolicyVersion: "policy-2" }));
    const other = await json(await directApplicationContext(request("/x", {})));
    expect(other.consent).toEqual({ version: "policy-2", text: null });
  });

  test("referred: forwards only the QR pair to the recruitment route, returns the attribution id", async () => {
    fetchMock.mockResolvedValue(upstream(ctxReferred));
    const response = await referredApplicationContext(request("/x", { qr: "fhqr_public_asset", v: "2" }), CODE);
    expect((await json(response)).attributionCorrelationId).toBe(UUID_B);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `${API}/v1/public/programmes/fertig-haus-affiliate-system/partner-applications/${CODE}?qr=fhqr_public_asset&v=2`,
    );
    // campaign values are not part of the recruitment journey at all
    expect((await referredApplicationContext(request("/x", { utmSource: "x" }), CODE)).status).toBe(400);
  });

  test("referral: forwards QR and plain campaign words to the CUSTOMER route, returns products", async () => {
    fetchMock.mockResolvedValue(upstream(ctxReferral));
    const response = await customerReferralContext(
      request("/x", { qr: "fhqr_public_asset", v: "1", utmSource: "newsletter", utmCampaign: "bad@example.invalid" }),
      CODE,
    );
    const body = await json(response);
    expect(body.products).toEqual([{ code: "HAUS-1", name: "Musterhaus", description: null }]);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      `${API}/v1/public/programmes/fertig-haus-affiliate-system/referrals/${CODE}?qr=fhqr_public_asset&v=1&utm_source=newsletter`,
    );
  });

  test("a malformed QR pair is a 400 and never reaches SalesChain", async () => {
    expect((await customerReferralContext(request("/x", { qr: "fhqr_public_asset" }), CODE)).status).toBe(400);
    expect((await referredApplicationContext(request("/x", { qr: "bad!", v: "1" }), CODE)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each([
    [404, 404, "UNAVAILABLE"],
    [400, 404, "UNAVAILABLE"],
    [429, 429, "RATE_LIMITED"],
    [500, 503, "UNAVAILABLE"],
    [503, 503, "UNAVAILABLE"],
  ])("upstream %i becomes %i %s", async (from, to, status) => {
    fetchMock.mockResolvedValue(upstream({ message: "secret upstream detail" }, from));
    const response = await customerReferralContext(request("/x", {}), CODE);
    expect(response.status).toBe(to === 404 && from === 400 ? 400 : to);
    const body = await json(response);
    expect(JSON.stringify(body)).not.toContain("secret upstream detail");
    expect(body.status).toBe(from === 400 ? "INVALID_REQUEST" : status);
  });

  test("a network failure is 503 and a contract violation is 502, neither echoing detail", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED 10.0.0.1"));
    const down = await directApplicationContext(request("/x", {}));
    expect(down.status).toBe(503);
    expect(JSON.stringify(await json(down))).not.toContain("10.0.0.1");
    fetchMock.mockResolvedValue(upstream({ ...ctxDirect, extra: "field" }));
    expect((await directApplicationContext(request("/x", {}))).status).toBe(502);
    fetchMock.mockResolvedValue(upstream({ ...ctxReferred, attributionCorrelationId: "not-a-uuid" }));
    expect((await referredApplicationContext(request("/x", {}), CODE)).status).toBe(502);
  });

  test("a missing base URL is unavailable, not an error page", async () => {
    vi.stubEnv("SALESCHAIN_API_BASE_URL", "");
    expect((await directApplicationContext(request("/x", {}))).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("partner application submit", () => {
  test("direct: refuses without approved wording, forwards the exact upstream body otherwise", async () => {
    consent.approved = false;
    expect((await directApplicationSubmit(request("/x", application()))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();

    consent.approved = true;
    fetchMock.mockResolvedValue(upstream({ publicReference: "PA-2026-ABCDEF0123", status: "PENDING" }));
    const response = await directApplicationSubmit(request("/x", application({ email: " Erika@Example.invalid " })));
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ status: "OK", publicReference: "PA-2026-ABCDEF0123" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${API}/v1/public/partner-applications/direct`);
    expect(JSON.parse(init.body)).toEqual({
      name: "Erika Muster",
      email: "Erika@Example.invalid",
      phone: "+49 170 0000000",
      partnerType: "PRIVATE_REFERRER",
      consentToApply: true,
      idempotencyKey: UUID_A,
      turnstileToken: "token",
    });
  });

  test("a consent version the form did not display is refused (wording is bound to the version)", async () => {
    expect((await directApplicationSubmit(request("/x", application({ consentPolicyVersion: "policy-9" })))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("referred: goes to the RECRUITMENT route with the attribution id, never the customer route", async () => {
    fetchMock.mockResolvedValue(upstream({ publicReference: "PA-2026-ABCDEF0123", status: "PENDING" }));
    const response = await referredApplicationSubmit(request("/x", application({ attributionCorrelationId: UUID_B })), CODE);
    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${API}/v1/public/programmes/fertig-haus-affiliate-system/partner-applications/${CODE}`);
    expect(String(url)).not.toContain("/referrals/");
    expect(JSON.parse(init.body).attributionCorrelationId).toBe(UUID_B);
  });

  test("Turnstile refusal (SalesChain's generic 404) stays a generic 404, a retry reuses the same key", async () => {
    fetchMock.mockResolvedValueOnce(upstream({ message: "Application unavailable" }, 404));
    const refused = await directApplicationSubmit(request("/x", application()));
    expect(refused.status).toBe(404);
    expect(await json(refused)).toEqual({ status: "UNAVAILABLE" });

    fetchMock.mockResolvedValueOnce(upstream({ publicReference: "PA-2026-ABCDEF0123", status: "PENDING" }));
    const retried = await directApplicationSubmit(request("/x", application({ turnstileToken: "fresh-token" })));
    expect(retried.status).toBe(200);
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(bodies[0].idempotencyKey).toBe(bodies[1].idempotencyKey);
    expect(bodies[0].turnstileToken).not.toBe(bodies[1].turnstileToken);
  });

  test("a replayed idempotent submission returns the same reference; a reused key with other answers is a 409", async () => {
    fetchMock.mockImplementation(async () => upstream({ publicReference: "PA-2026-ABCDEF0123", status: "PENDING" }));
    const first = await json(await directApplicationSubmit(request("/x", application())));
    const second = await json(await directApplicationSubmit(request("/x", application())));
    expect(second).toEqual(first);
    fetchMock.mockResolvedValue(upstream({ message: "conflict" }, 409));
    const conflict = await directApplicationSubmit(request("/x", application({ name: "Someone Else" })));
    expect(conflict.status).toBe(409);
    expect(await json(conflict)).toEqual({ status: "CONFLICT" });
  });

  test("429, validation and outage map to their fixed answers", async () => {
    fetchMock.mockResolvedValueOnce(upstream({}, 429));
    expect((await directApplicationSubmit(request("/x", application()))).status).toBe(429);
    fetchMock.mockResolvedValueOnce(upstream({}, 400));
    expect((await directApplicationSubmit(request("/x", application()))).status).toBe(400);
    fetchMock.mockRejectedValueOnce(new Error("timeout"));
    expect((await directApplicationSubmit(request("/x", application()))).status).toBe(503);
  });

  test("an unexpected success shape is a contract error, not a success", async () => {
    fetchMock.mockResolvedValue(upstream({ publicReference: "WRONG", status: "PENDING" }));
    expect((await directApplicationSubmit(request("/x", application()))).status).toBe(502);
    fetchMock.mockResolvedValue(upstream({ publicReference: "PA-2026-ABCDEF0123" }));
    expect((await directApplicationSubmit(request("/x", application()))).status).toBe(502);
  });
});

describe("customer referral submit", () => {
  test("posts to the CUSTOMER route, without any idempotency key, and answers uniformly without a reference", async () => {
    fetchMock.mockResolvedValue(upstream({ publicReference: "LEAD-ABCDEF01", status: "NEW_LEAD" }));
    const response = await customerReferralSubmit(request("/x", lead()), CODE);
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ status: "OK" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${API}/v1/public/programmes/fertig-haus-affiliate-system/referrals/${CODE}/leads`);
    expect(String(url)).not.toContain("partner-applications");
    expect(JSON.parse(init.body)).toEqual({
      firstName: "Erika",
      lastName: "Muster",
      email: "erika@example.invalid",
      productCode: "HAUS-1",
      consentToContact: true,
      attributionCorrelationId: UUID_B,
      turnstileToken: "token",
    });
  });

  test("a contact SalesChain already holds (409) looks exactly like a new registration", async () => {
    fetchMock.mockResolvedValueOnce(upstream({ publicReference: "LEAD-ABCDEF01", status: "NEW_LEAD" }));
    const fresh = await customerReferralSubmit(request("/x", lead()), CODE);
    fetchMock.mockResolvedValueOnce(upstream({ message: "This registration could not be accepted" }, 409));
    const known = await customerReferralSubmit(request("/x", lead()), CODE);
    expect(known.status).toBe(fresh.status);
    expect(await json(known)).toEqual(await json(fresh));
  });

  test("refuses without approved wording, and Turnstile refusal stays generic", async () => {
    consent.approved = false;
    expect((await customerReferralSubmit(request("/x", lead()), CODE)).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    consent.approved = true;
    fetchMock.mockResolvedValue(upstream({ message: "Referral unavailable" }, 404));
    const refused = await customerReferralSubmit(request("/x", lead()), CODE);
    expect(refused.status).toBe(404);
    expect(await json(refused)).toEqual({ status: "UNAVAILABLE" });
  });

  test("a partner or sponsor id from the browser is refused, never forwarded", async () => {
    expect((await customerReferralSubmit(request("/x", lead({ partnerId: "p-1" })), CODE)).status).toBe(400);
    expect((await customerReferralSubmit(request("/x", lead({ referralProfileId: "r-1" })), CODE)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
