// @vitest-environment node
import { describe, expect, test } from "vitest";
import {
  parseApplicationBody,
  parseContextRequest,
  parseReferralCode,
  parseReferralLeadBody,
} from "@/lib/public-journeys/validation";

const UUID_A = "10000000-0000-4000-8000-000000000001";
const UUID_B = "20000000-0000-4000-8000-000000000002";

const application = (over: Record<string, unknown> = {}) => ({
  name: "Erika Muster",
  email: "Erika.Muster@Example.invalid",
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

describe("parseReferralCode", () => {
  test("accepts the SalesChain code alphabet and length only", () => {
    expect(parseReferralCode("FH-recruit_referral-code")).toBe("FH-recruit_referral-code");
    for (const bad of ["short", "x".repeat(81), "FH-code with space....", "FH-code/../../etc/passwd", "FH-ünicode-code-0000", 7, null, undefined])
      expect(parseReferralCode(bad)).toBeNull();
  });
});

describe("parseContextRequest", () => {
  test("an empty body is no tracking", () => {
    expect(parseContextRequest(undefined, true)).toEqual({});
    expect(parseContextRequest({}, false)).toEqual({});
  });

  test("qr and v come as a valid pair or not at all", () => {
    expect(parseContextRequest({ qr: "fhqr_public_asset", v: "1" }, false)).toEqual({ qr: "fhqr_public_asset", v: "1" });
    expect(parseContextRequest({ qr: "fhqr_public_asset" }, false)).toBeNull();
    expect(parseContextRequest({ v: "1" }, false)).toBeNull();
    expect(parseContextRequest({ qr: "bad qr!", v: "1" }, false)).toBeNull();
    expect(parseContextRequest({ qr: "fhqr_public_asset", v: "0" }, false)).toBeNull();
    expect(parseContextRequest({ qr: "fhqr_public_asset", v: "1.5" }, false)).toBeNull();
    expect(parseContextRequest({ qr: "fhqr_public_asset", v: 1 }, false)).toBeNull();
  });

  test("campaign values are only for customer referrals, and only plain words are kept", () => {
    expect(
      parseContextRequest({ utmSource: "newsletter", utmMedium: "email", utmCampaign: "erika@example.invalid" }, true),
    ).toEqual({ utmSource: "newsletter", utmMedium: "email" });
    expect(parseContextRequest({ utmSource: "newsletter" }, false)).toBeNull();
    expect(parseContextRequest({ utmSource: 5 }, true)).toBeNull();
  });

  test("unknown keys and non-objects are refused", () => {
    expect(parseContextRequest({ extra: "x" }, true)).toBeNull();
    expect(parseContextRequest([], true)).toBeNull();
    expect(parseContextRequest("x", true)).toBeNull();
  });
});

describe("parseApplicationBody", () => {
  test("a direct application builds the upstream body field by field and never forwards the consent version", () => {
    const parsed = parseApplicationBody(application({ company: " ", region: "Bayern", message: "Hallo" }), false);
    expect(parsed).not.toBeNull();
    expect(parsed!.consentPolicyVersion).toBe("policy-1");
    expect(parsed!.upstream).toEqual({
      name: "Erika Muster",
      email: "Erika.Muster@Example.invalid",
      phone: "+49 170 0000000",
      partnerType: "PRIVATE_REFERRER",
      region: "Bayern",
      message: "Hallo",
      consentToApply: true,
      idempotencyKey: UUID_A,
      turnstileToken: "token",
    });
    expect(parsed!.upstream).not.toHaveProperty("consentPolicyVersion");
    expect(parsed!.upstream).not.toHaveProperty("company");
  });

  test("a referred application needs the server-issued attribution id; a direct one must not carry it", () => {
    expect(parseApplicationBody(application(), true)).toBeNull();
    expect(parseApplicationBody(application({ attributionCorrelationId: UUID_B }), true)!.upstream).toMatchObject({
      attributionCorrelationId: UUID_B,
    });
    expect(parseApplicationBody(application({ attributionCorrelationId: UUID_B }), false)).toBeNull();
    expect(parseApplicationBody(application({ attributionCorrelationId: "not-a-uuid" }), true)).toBeNull();
  });

  test.each([
    ["no consent", { consentToApply: false }],
    ["string consent", { consentToApply: "true" }],
    ["missing consent", { consentToApply: undefined }],
    ["short name", { name: "E" }],
    ["long name", { name: "x".repeat(121) }],
    ["bad e-mail", { email: "not-an-email" }],
    ["too few phone digits", { phone: "+49 (0)" }],
    ["unknown partner type", { partnerType: "ADMIN" }],
    ["non-uuid key", { idempotencyKey: "12345" }],
    ["missing key", { idempotencyKey: undefined }],
    ["missing Turnstile token", { turnstileToken: "" }],
    ["oversized Turnstile token", { turnstileToken: "t".repeat(2049) }],
    ["missing consent version", { consentPolicyVersion: "" }],
    ["too long message", { message: "m".repeat(2001) }],
    ["unknown field", { role: "admin" }],
    ["non-string optional", { region: 12 }],
  ])("refuses %s", (_label, over) => {
    expect(parseApplicationBody(application(over), false)).toBeNull();
  });

  test("refuses non-objects", () => {
    for (const bad of [null, undefined, [], "x", 3]) expect(parseApplicationBody(bad, false)).toBeNull();
  });
});

describe("parseReferralLeadBody", () => {
  test("builds the upstream body without the consent version", () => {
    const parsed = parseReferralLeadBody(lead({ phone: "" }));
    expect(parsed!.upstream).toEqual({
      firstName: "Erika",
      lastName: "Muster",
      email: "erika@example.invalid",
      productCode: "HAUS-1",
      consentToContact: true,
      attributionCorrelationId: UUID_B,
      turnstileToken: "token",
    });
    expect(parsed!.consentPolicyVersion).toBe("policy-1");
  });

  test("phone alone is enough, but one contact channel is required", () => {
    expect(parseReferralLeadBody(lead({ email: "", phone: "+49 170 0000000" }))).not.toBeNull();
    expect(parseReferralLeadBody(lead({ email: "", phone: "" }))).toBeNull();
    expect(parseReferralLeadBody(lead({ email: undefined, phone: undefined }))).toBeNull();
  });

  test.each([
    ["no consent", { consentToContact: false }],
    ["lower-case product code", { productCode: "haus-1" }],
    ["short phone", { email: "", phone: "123" }],
    ["bad e-mail", { email: "nope" }],
    ["missing attribution id", { attributionCorrelationId: undefined }],
    ["non-uuid attribution id", { attributionCorrelationId: "x" }],
    ["missing first name", { firstName: " " }],
    ["missing token", { turnstileToken: undefined }],
    ["unknown field", { partnerId: "p-1" }],
    ["idempotency key (not part of this journey)", { idempotencyKey: UUID_A }],
  ])("refuses %s", (_label, over) => {
    expect(parseReferralLeadBody(lead(over))).toBeNull();
  });
});
