// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  callSalesChain,
  resolveCustomerReferral,
  resolveDirectApplication,
  resolveReferredApplication,
  SalesChainError,
  submitCustomerReferral,
  submitDirectApplication,
  submitReferredApplication,
} from "@/lib/saleschain/client";

const API = "https://api.saleschain.example";
const CODE = "FH-recruit_referral-code";
const UUID = "20000000-0000-4000-8000-000000000002";

const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const base = {
  programme: { slug: "fertig-haus-affiliate-system", name: "Fertig-Haus Affiliate System" },
  brand: { slug: "fertig-haus", name: "Fertig-Haus" },
  consentPolicyVersion: "policy-1",
  notice: "n",
};

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("SALESCHAIN_API_BASE_URL", API);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("a 4xx answer carries only its status, never the body; a 5xx carries none", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply({ message: "secret" }, 429)));
  const rejected = (await callSalesChain("/v1/x", { method: "GET" }).catch((error: unknown) => error)) as SalesChainError;
  expect(rejected).toBeInstanceOf(SalesChainError);
  expect(rejected).toMatchObject({ kind: "rejected", httpStatus: 429 });
  expect(JSON.stringify(rejected)).not.toContain("secret");
  expect(String(rejected.message)).not.toContain("secret");

  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply({}, 503)));
  const down = (await callSalesChain("/v1/x", { method: "GET" }).catch((error: unknown) => error)) as SalesChainError;
  expect(down).toMatchObject({ kind: "unavailable" });
  expect(down.httpStatus).toBeUndefined();
});

test("the default response bound is unchanged: an oversized non-list answer is a contract error", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ pad: "x".repeat(5_000), ...base })));
  await expect(resolveDirectApplication()).rejects.toMatchObject({ kind: "contract" });
});

test("direct application: exact routes, methods and body", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(reply(base))
    .mockResolvedValueOnce(reply({ publicReference: "PA-2026-ABCDEF0123", status: "PENDING" }, 201));
  vi.stubGlobal("fetch", fetchMock);
  expect(await resolveDirectApplication()).toEqual({
    programmeName: "Fertig-Haus Affiliate System",
    brandName: "Fertig-Haus",
    consentPolicyVersion: "policy-1",
  });
  const [getUrl, getInit] = fetchMock.mock.calls[0]!;
  expect(getUrl).toBe(`${API}/v1/public/partner-applications/direct`);
  expect(getInit.method).toBe("GET");
  expect(getInit.body).toBeUndefined();
  expect(getInit.redirect).toBe("manual");

  expect(await submitDirectApplication({ name: "x" })).toEqual({ publicReference: "PA-2026-ABCDEF0123" });
  const [postUrl, postInit] = fetchMock.mock.calls[1]!;
  expect(postUrl).toBe(`${API}/v1/public/partner-applications/direct`);
  expect(postInit.method).toBe("POST");
  expect(postInit.headers["content-type"]).toBe("application/json");
  expect(postInit.headers.authorization).toBeUndefined();
});

test("referred application uses the recruitment route and forwards only the QR pair", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(reply({ ...base, attributionCorrelationId: UUID }))
    .mockResolvedValueOnce(reply({ publicReference: "PA-2026-ABCDEF0123", status: "PENDING" }));
  vi.stubGlobal("fetch", fetchMock);
  const context = await resolveReferredApplication(CODE, { qr: "fhqr_public_asset", v: "3", utmSource: "ignored" });
  expect(context.attributionCorrelationId).toBe(UUID);
  expect(fetchMock.mock.calls[0]![0]).toBe(
    `${API}/v1/public/programmes/fertig-haus-affiliate-system/partner-applications/${CODE}?qr=fhqr_public_asset&v=3`,
  );
  await submitReferredApplication(CODE, { a: 1 });
  expect(fetchMock.mock.calls[1]![0]).toBe(
    `${API}/v1/public/programmes/fertig-haus-affiliate-system/partner-applications/${CODE}`,
  );
});

test("customer referral uses the customer route, forwards campaign words, and may carry a long product list", async () => {
  const products = Array.from({ length: 60 }, (_, index) => ({
    code: `HAUS-${index}`,
    name: `Musterhaus ${index}`,
    description: "d".repeat(100),
  }));
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(reply({ ...base, products, attributionCorrelationId: UUID }))
    .mockResolvedValueOnce(reply({ publicReference: "LEAD-ABCDEF01", status: "NEW_LEAD" }));
  vi.stubGlobal("fetch", fetchMock);
  const context = await resolveCustomerReferral(CODE, {
    qr: "fhqr_public_asset",
    v: "1",
    utmSource: "newsletter",
    utmCampaign: "herbst 2026",
  });
  expect(context.products).toHaveLength(60);
  expect(fetchMock.mock.calls[0]![0]).toBe(
    `${API}/v1/public/programmes/fertig-haus-affiliate-system/referrals/${CODE}?qr=fhqr_public_asset&v=1&utm_source=newsletter&utm_campaign=herbst+2026`,
  );
  expect(await submitCustomerReferral(CODE, { a: 1 })).toEqual({ publicReference: "LEAD-ABCDEF01" });
  expect(fetchMock.mock.calls[1]![0]).toBe(
    `${API}/v1/public/programmes/fertig-haus-affiliate-system/referrals/${CODE}/leads`,
  );
});

test("an unbounded product list is refused", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(reply({ ...base, attributionCorrelationId: UUID, products: new Array(101).fill({ code: "AB", name: "n", description: null }) })),
  );
  await expect(resolveCustomerReferral(CODE, {})).rejects.toMatchObject({ kind: "contract" });
});

test.each([
  ["a missing key", { programme: base.programme, brand: base.brand, consentPolicyVersion: "p", notice: "n" }, "referred"],
  ["an extra key", { ...base, attributionCorrelationId: UUID, internalId: "x" }, "referred"],
  ["a non-uuid attribution id", { ...base, attributionCorrelationId: "nope" }, "referred"],
  ["an empty consent version", { ...base, consentPolicyVersion: "", attributionCorrelationId: UUID }, "referred"],
  ["a bad product code", { ...base, attributionCorrelationId: UUID, products: [{ code: "lower", name: "n", description: null }] }, "referral"],
])("%s in a context is a contract error", async (_label, body, journey) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(body)));
  const call = journey === "referral" ? resolveCustomerReferral(CODE, {}) : resolveReferredApplication(CODE, {});
  await expect(call).rejects.toMatchObject({ kind: "contract" });
});

test("submissions with a wrong reference format or extra fields are contract errors", async () => {
  for (const body of [
    { publicReference: "PA-2026-abcdef0123", status: "PENDING" },
    { publicReference: "LEAD-ABCDEF01", status: "PENDING" },
    { publicReference: "PA-2026-ABCDEF0123", status: "PENDING", email: "x" },
    { status: "PENDING" },
  ]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(reply(body)));
    await expect(submitDirectApplication({})).rejects.toMatchObject({ kind: "contract" });
  }
});

test("redirects, non-JSON answers and timeouts never become a result", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://evil.example" } })));
  await expect(resolveDirectApplication()).rejects.toMatchObject({ kind: "contract" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("<html>", { status: 200, headers: { "content-type": "text/html" } })));
  await expect(resolveDirectApplication()).rejects.toMatchObject({ kind: "contract" });
  const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(abort));
  await expect(resolveDirectApplication()).rejects.toMatchObject({ kind: "timeout" });
});

test("a codes with path characters can never change the upstream route", async () => {
  const fetchMock = vi.fn().mockResolvedValue(reply({ ...base, attributionCorrelationId: UUID }));
  vi.stubGlobal("fetch", fetchMock);
  await resolveReferredApplication("a/../../b?x=1", {}).catch(() => undefined);
  expect(String(fetchMock.mock.calls[0]![0])).toContain("a%2F..%2F..%2Fb%3Fx%3D1");
});
