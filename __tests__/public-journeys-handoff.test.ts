import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { customerSiteDestination, handoffUrl } from "@/lib/public-journeys/handoff";

const resolveCustomerReferral = vi.fn();
vi.mock("@/lib/saleschain/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/saleschain/client")>()),
  resolveCustomerReferral: (...args: unknown[]) => resolveCustomerReferral(...args),
}));

const REF = "5f0c9a3e-7b1d-4c8e-9a2f-0d6e4b1c7a35";
const CODE = "FH-customer_referral-code";
const DESTINATION = "https://customer-site.test.example/";

beforeEach(() => {
  resolveCustomerReferral.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

test("the destination is closed unless it is an https address (or plain http on localhost) with nothing riding on it", () => {
  const dest = (value: string | undefined) => customerSiteDestination({ AFFILIATE_CUSTOMER_SITE_URL: value });
  expect(dest(undefined)).toBeNull();
  expect(dest("")).toBeNull();
  expect(dest("   ")).toBeNull();
  expect(dest("not a url")).toBeNull();
  expect(dest("http://customer-site.test.example/")).toBeNull();
  expect(dest("ftp://customer-site.test.example/")).toBeNull();
  expect(dest("javascript:alert(1)")).toBeNull();
  expect(dest("https://user:pass@customer-site.test.example/")).toBeNull();
  expect(dest("https://customer-site.test.example/?x=1")).toBeNull();
  expect(dest("https://customer-site.test.example/#frag")).toBeNull();
  expect(dest(DESTINATION)?.href).toBe(DESTINATION);
  expect(dest("https://customer-site.test.example/haeuser")?.href).toBe("https://customer-site.test.example/haeuser");
  expect(dest("http://localhost:4400/")?.href).toBe("http://localhost:4400/");
  expect(dest("http://127.0.0.1:4400/")?.href).toBe("http://127.0.0.1:4400/");
});

test("the handoff address carries ref and the campaign values, and nothing else from the landing URL", () => {
  const url = new URL(
    handoffUrl(new URL(DESTINATION), REF.toUpperCase(), {
      utmSource: "partner",
      utmMedium: "qr",
      utmCampaign: "herbst-2026",
    }),
  );
  expect(url.origin + url.pathname).toBe("https://customer-site.test.example/");
  expect([...url.searchParams.entries()]).toEqual([
    ["ref", REF],
    ["utm_source", "partner"],
    ["utm_medium", "qr"],
    ["utm_campaign", "herbst-2026"],
  ]);
  // Overlong campaign values are left out, not truncated.
  expect(new URL(handoffUrl(new URL(DESTINATION), REF, { utmSource: "x".repeat(121) })).searchParams.has("utm_source")).toBe(false);
  expect(() => handoffUrl(new URL(DESTINATION), "not-a-reference")).toThrow();
  expect(() => handoffUrl(new URL(DESTINATION), `${REF}&evil=1`)).toThrow();
});

test("a valid Partner link records the visit through the existing referral resolution and redirects with its session reference", async () => {
  vi.stubEnv("AFFILIATE_CUSTOMER_SITE_URL", DESTINATION);
  resolveCustomerReferral.mockResolvedValue({
    programmeName: "Fertig-Haus Affiliate System",
    brandName: "Fertig-Haus",
    attributionCorrelationId: REF,
    products: [{ code: "ANY", name: "Never shown here", description: null }],
    consentPolicyVersion: "v1",
  });
  const { customerReferralHandoff } = await import("@/lib/public-journeys/handlers");
  const result = await customerReferralHandoff(CODE, { qr: "fhqr_public_asset", v: "1", utmSource: "partner" });
  expect(result).toEqual({
    status: "REDIRECT",
    url: `https://customer-site.test.example/?ref=${REF}&utm_source=partner`,
  });
  // The QR pair goes to SalesChain (it selects the QR asset) but never to the customer site.
  expect(resolveCustomerReferral).toHaveBeenCalledWith(CODE, { qr: "fhqr_public_asset", v: "1", utmSource: "partner" });
  expect(result).not.toHaveProperty("products");
});

test("it is closed, and contacts nobody, while no destination is configured", async () => {
  const { customerReferralHandoff } = await import("@/lib/public-journeys/handlers");
  expect(await customerReferralHandoff(CODE, {})).toEqual({ status: "OFF" });
  vi.stubEnv("AFFILIATE_CUSTOMER_SITE_URL", "http://customer-site.test.example/");
  expect(await customerReferralHandoff(CODE, {})).toEqual({ status: "OFF" });
  expect(resolveCustomerReferral).not.toHaveBeenCalled();
});

test("a malformed code never reaches SalesChain", async () => {
  vi.stubEnv("AFFILIATE_CUSTOMER_SITE_URL", DESTINATION);
  const { customerReferralHandoff } = await import("@/lib/public-journeys/handlers");
  expect(await customerReferralHandoff("../../etc", {})).toEqual({ status: "LINK_UNAVAILABLE" });
  expect(await customerReferralHandoff("x", {})).toEqual({ status: "LINK_UNAVAILABLE" });
  expect(resolveCustomerReferral).not.toHaveBeenCalled();
});

test("upstream outcomes collapse: refused is an unavailable link, anything else a temporary failure, never a redirect", async () => {
  vi.stubEnv("AFFILIATE_CUSTOMER_SITE_URL", DESTINATION);
  const { customerReferralHandoff } = await import("@/lib/public-journeys/handlers");
  const { SalesChainError } = await import("@/lib/saleschain/client");
  resolveCustomerReferral.mockRejectedValueOnce(new SalesChainError("rejected", "x", 404));
  expect(await customerReferralHandoff(CODE, {})).toEqual({ status: "LINK_UNAVAILABLE" });
  resolveCustomerReferral.mockRejectedValueOnce(new SalesChainError("unavailable", "x"));
  expect(await customerReferralHandoff(CODE, {})).toEqual({ status: "SERVICE_UNAVAILABLE" });
  resolveCustomerReferral.mockRejectedValueOnce(new Error("boom"));
  expect(await customerReferralHandoff(CODE, {})).toEqual({ status: "SERVICE_UNAVAILABLE" });
  resolveCustomerReferral.mockResolvedValueOnce({ programmeName: "p", brandName: "b", consentPolicyVersion: "v" });
  expect(await customerReferralHandoff(CODE, {})).toEqual({ status: "SERVICE_UNAVAILABLE" });
});

test("the /r page and the handoff modules contain no form, product list, house or enquiry content", () => {
  const files = ["app/r/[code]/page.tsx", "lib/public-journeys/handoff.ts"].map((file) =>
    readFileSync(resolve(process.cwd(), file), "utf8"),
  );
  for (const source of files) {
    expect(source).not.toMatch(/ReferralForm|<form|<select|<input|productCode|konfigurator|Haustyp|catalogue|Katalog/);
  }
});
